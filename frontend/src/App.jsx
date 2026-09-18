import { useState, useRef, useEffect } from "react";

const WELCOME = "Hi! I'm your RAG assistant powered by Amazon Bedrock. I can answer questions based on documents in the knowledge base. You can also upload your own PDF or document using the 📎 icon below, and ask questions about it once it's synced.";
const MAX_MB  = 10;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const s = {
  page:      { height: "100vh", background: "#212121", display: "flex", flexDirection: "column", fontFamily: "'Outfit', system-ui, sans-serif", color: "#ececec" },
  header:    { background: "#171717", borderBottom: "1px solid #2d2d2d", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  title:     { fontSize: 16, fontWeight: 600 },
  clearBtn:  { background: "none", border: "1px solid #3a3a3a", borderRadius: 8, color: "#888", fontSize: 13, padding: "6px 14px", cursor: "pointer" },
  docBar:    { background: "#181818", borderBottom: "1px solid #252525", padding: "8px 28px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#888", flexShrink: 0 },
  docDot:    (ready) => ({ width: 7, height: 7, borderRadius: "50%", background: ready ? "#4caf50" : "#f59e0b", flexShrink: 0 }),
  feed:      { flex: 1, overflowY: "auto", padding: "24px 0 8px", display: "flex", flexDirection: "column", gap: 10 },
  row:       { padding: "0 28px", display: "flex" },
  userBub:   { marginLeft: "auto", background: "#2f2f2f", borderRadius: "18px 18px 4px 18px", padding: "12px 16px", maxWidth: "75%", fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap" },
  asstBub:   { background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "18px 18px 18px 4px", padding: "12px 16px", maxWidth: "75%", fontSize: 15, lineHeight: 1.75, color: "#d1d1d1", whiteSpace: "pre-wrap" },
  typingBub: { background: "#1a1a1a", border: "1px solid #2d2d2d", borderRadius: "18px 18px 18px 4px", padding: "12px 16px", fontSize: 14, color: "#555", fontStyle: "italic" },
  bottom:    { padding: "10px 28px 24px", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 },
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
  const [docName, setDocName]   = useState(null);       // filename in S3
  const [docStatus, setDocStatus] = useState("idle");   // idle | uploading | syncing | ready | error
  const [toast, setToast]       = useState(false);
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);

  // On load, check if a document is already in S3
  useEffect(() => {
    const checkDoc = () => {
      fetch(`${API_URL}/document`)
        .then(r => r.json())
        .then(d => { if (d.filename) { setDocName(d.filename); setDocStatus("ready"); } })
        .catch(() => {});
    };

    checkDoc();

    // Re-check when user switches back to this tab (browser throttles setInterval in background)
    const onVisible = () => { if (document.visibilityState === "visible") checkDoc(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

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

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File too large. Maximum allowed size is ${MAX_MB}MB.`);
      e.target.value = "";
      return;
    }

    setDocName(file.name);
    setDocStatus("uploading");
    const form = new FormData();
    form.append("file", file);
    e.target.value = "";

    try {
      const res  = await fetch(`${API_URL}/upload`, { method: "POST", body: form });
      const data = await res.json();
      setDocStatus("syncing");

      const poll = setInterval(async () => {
        const r = await fetch(`${API_URL}/sync-status/${data.job_id}`);
        const d = await r.json();
        if (d.status === "COMPLETE") {
          setDocStatus("ready");
          setToast(true);
          setTimeout(() => setToast(false), 5000);
          clearInterval(poll);
        }
        if (d.status === "FAILED") { setDocStatus("error"); clearInterval(poll); }
      }, 4000);
    } catch { setDocStatus("error"); }
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  // Document bar label
  const docLabel = () => {
    if (!docName && docStatus === "idle") return "No document uploaded — click 📎 to upload one";
    if (docStatus === "uploading")        return `Uploading ${docName}…`;
    if (docStatus === "syncing")          return `Syncing ${docName} with knowledge base…`;
    if (docStatus === "error")            return `Failed to upload ${docName}`;
    if (docStatus === "ready")            return `Document: ${docName}`;
    return "";
  };

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>RAG Chatbot with Knowledge Base</span>
        <button style={s.clearBtn} onClick={() => { setMessages([{ role: "assistant", content: WELCOME }]); }}>
          Clear Conversation
        </button>
      </div>

      {/* Document bar */}
      <div style={s.docBar}>
        <div style={s.docDot(docStatus === "ready")} />
        <span>{docLabel()}</span>
      </div>

      {/* Chat feed */}
      <div style={s.feed}>
        {messages.map((m, i) => (
          <div key={i} style={s.row}>
            <div style={m.role === "user" ? s.userBub : s.asstBub}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={s.row}><div style={s.typingBub}>Thinking…</div></div>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={s.bottom}>
        <div style={s.inputBox}>
          <input type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf" ref={fileRef} onChange={handleFile} style={{ display: "none" }} />
          <button style={s.iconBtn} onClick={() => fileRef.current.click()} title="Upload document">
            <ion-icon name="attach-outline" style={{ fontSize: 22 }} />
          </button>
          <input style={s.textInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder="Ask anything…" disabled={loading} />
          <button style={{ ...s.sendBtn, ...(loading ? s.off : {}) }} onClick={send} disabled={loading}>Send</button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={s.toast}>
          ✓ Document uploaded successfully.<br />You may now ask questions about your document.
        </div>
      )}
    </div>
  );
}
