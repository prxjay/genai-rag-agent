import { useState, useRef, useEffect } from "react";

const WELCOME = "Hi! I'm your RAG assistant powered by Amazon Bedrock. You can upload up to 5 documents using the 📎 icon below and ask questions across all of them.";
const MAX_DOCS = 5;
const MAX_MB   = 10;
const API_URL  = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8000" : "");

const s = {
  page:      { height: "100vh", background: "#212121", display: "flex", flexDirection: "column", fontFamily: "'Outfit', system-ui, sans-serif", color: "#ececec" },
  header:    { background: "#171717", borderBottom: "1px solid #2d2d2d", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title:     { fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" },
  actionBtn: { background: "none", border: "1px solid #3a3a3a", borderRadius: 8, color: "#888", fontSize: 13, padding: "6px 14px", cursor: "pointer" },
  feed:      { flex: 1, overflowY: "auto", padding: "24px 0 8px", display: "flex", flexDirection: "column", gap: 10 },
  row:       { padding: "0 28px", display: "flex" },
  userBub:   { marginLeft: "auto", background: "#2f2f2f", borderRadius: "18px 18px 4px 18px", padding: "12px 16px", maxWidth: "75%", fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap" },
  asstBub:   { background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "18px 18px 18px 4px", padding: "12px 16px", maxWidth: "75%", fontSize: 15, lineHeight: 1.75, color: "#d1d1d1", whiteSpace: "pre-wrap" },
  typingBub: { background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "18px 18px 18px 4px", padding: "12px 16px", fontSize: 14, color: "#555", fontStyle: "italic" },
  bottom:    { padding: "10px 28px 24px", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 },
  docLine:   { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px", fontSize: 13, color: "#888" },
  docLeft:   { display: "flex", alignItems: "center", gap: 8 },
  docDot:    (ready) => ({ width: 7, height: 7, borderRadius: "50%", background: ready ? "#4caf50" : "#f59e0b", flexShrink: 0 }),
  inputBox:  { display: "flex", alignItems: "center", background: "#2a2a2a", border: "1px solid #363636", borderRadius: 16, padding: "10px 14px", gap: 10 },
  textInput: { flex: 1, background: "none", border: "none", outline: "none", color: "#ececec", fontSize: 15, fontFamily: "inherit" },
  iconBtn:   { background: "none", border: "none", cursor: "pointer", color: "#777", display: "flex", alignItems: "center", padding: "2px 4px" },
  sendBtn:   { background: "#2563eb", border: "none", cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 10, padding: "7px 18px" },
  off:       { opacity: 0.35, cursor: "not-allowed" },
  toast:     { position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: "#132d22", border: "1px solid #1f6040", color: "#6fcf97", borderRadius: 14, padding: "14px 24px", fontSize: 14, zIndex: 999, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", lineHeight: 1.6, whiteSpace: "nowrap" },
};

export default function App() {
  const [messages, setMessages] = useState([{ role: "assistant", content: WELCOME }]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [docs, setDocs]         = useState([]);
  const [syncing, setSyncing]   = useState(false);
  const [toast, setToast]       = useState(null);
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);

  const fetchDocs = () => {
    fetch(`${API_URL}/documents`)
      .then(r => r.json())
      .then(d => { if (d.documents) setDocs(d.documents); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchDocs();
    const onVis = () => { if (document.visibilityState === "visible") fetchDocs(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const text    = input.trim();
    const history = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, chat_history: messages }),
      });
      const data = await res.json();
      setMessages([...history, { role: "assistant", content: data.response }]);
    } catch {
      setMessages([...history, { role: "assistant", content: "Could not reach the server." }]);
    } finally { setLoading(false); }
  };

  const pollSync = (jobId, successMsg) => {
    setSyncing(true);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/sync-status/${jobId}`);
        const d = await r.json();
        if (d.status === "COMPLETE" || d.status === "FAILED") {
          setSyncing(false);
          fetchDocs();
          if (d.status === "COMPLETE") notify(successMsg);
          clearInterval(poll);
        }
      } catch {
        setSyncing(false);
        clearInterval(poll);
      }
    }, 3500);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (docs.length >= MAX_DOCS && !docs.some(d => d.filename === file.name)) {
      alert(`Limit reached (${MAX_DOCS} documents max). Click "Remove All" to reset.`);
      e.target.value = "";
      return;
    }

    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File too large (max ${MAX_MB}MB).`);
      e.target.value = "";
      return;
    }

    const form = new FormData();
    form.append("file", file);
    e.target.value = "";
    setSyncing(true);

    try {
      const res  = await fetch(`${API_URL}/upload`, { method: "POST", body: form });
      const data = await res.json();
      pollSync(data.job_id, `✓ "${file.name}" uploaded and synced.`);
    } catch {
      setSyncing(false);
    }
  };

  const clearAll = async () => {
    if (!confirm("Remove all documents from the knowledge base?")) return;
    setSyncing(true);
    try {
      const res  = await fetch(`${API_URL}/documents`, { method: "DELETE" });
      const data = await res.json();
      pollSync(data.job_id, "✓ All documents removed and knowledge base reset.");
    } catch {
      setSyncing(false);
    }
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const isFull = docs.length >= MAX_DOCS;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>RAG Chatbot with Knowledge Base</span>
      </div>

      {/* Chat Feed */}
      <div style={s.feed}>
        {messages.map((m, i) => (
          <div key={i} style={s.row}>
            <div style={m.role === "user" ? s.userBub : s.asstBub}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={s.row}><div style={s.typingBub}>Thinking…</div></div>}
        <div ref={bottomRef} />
      </div>

      {/* Bottom Area */}
      <div style={s.bottom}>
        {/* Transparent doc status & actions right above text box */}
        <div style={s.docLine}>
          <div style={s.docLeft}>
            <div style={s.docDot(!syncing)} />
            <span>
              {syncing
                ? "Syncing with Bedrock Knowledge Base…"
                : docs.length === 0
                ? "No documents uploaded — click 📎 to add up to 5 documents"
                : `Documents (${docs.length}/${MAX_DOCS}): ${docs.map(d => d.filename).join(", ")}`}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {docs.length > 0 && !syncing && (
              <button style={s.actionBtn} onClick={clearAll}>
                Remove All
              </button>
            )}
            <button style={s.actionBtn} onClick={() => setMessages([{ role: "assistant", content: WELCOME }])}>
              Clear Chat
            </button>
          </div>
        </div>

        {/* Input Box */}
        <div style={s.inputBox}>
          <input type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf" ref={fileRef} onChange={handleFile} style={{ display: "none" }} />
          <button
            style={{ ...s.iconBtn, ...(isFull || syncing ? s.off : {}) }}
            onClick={() => isFull ? alert("Limit of 5 documents reached. Click Remove All first.") : fileRef.current.click()}
            title={isFull ? "Limit reached (5/5)" : "Upload document (max 5)"}
            disabled={syncing}
          >
            <ion-icon name="attach-outline" style={{ fontSize: 22 }} />
          </button>
          <input style={s.textInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder="Ask anything…" disabled={loading} />
          <button style={{ ...s.sendBtn, ...(loading ? s.off : {}) }} onClick={send} disabled={loading}>Send</button>
        </div>
      </div>

      {/* Toast */}
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
