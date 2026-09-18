"""
Business logic for AI agent with knowledge base integration (LangChain + LangGraph).
"""
from dotenv import load_dotenv
load_dotenv()
import os

from langchain_groq import ChatGroq
from langchain_aws import AmazonKnowledgeBasesRetriever
from langchain_core.tools import Tool
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.prebuilt import create_react_agent

SYSTEM_PROMPT = (
    "You are a helpful AI assistant with access to a vector database of knowledge about companies and their financial data. "
    "When users ask questions about companies or their financial data, use the available tool to retrieve accurate information. "
    "Always provide clear and concise answers based on the retrieved information. "
    "You must use English language for your responses and provide the answer in a concise manner. "
    "Do not use any markdown formatting in your responses."
)

# --- LLM ---
llm = ChatGroq(
    model="openai/gpt-oss-20b",
    api_key=os.getenv("GROQ_API_KEY"),
)

# --- Retriever ---
retriever = AmazonKnowledgeBasesRetriever(
    knowledge_base_id=os.getenv("BEDROCK_KNOWLEDGE_BASE_ID"),
    retrieval_config={
        "vectorSearchConfiguration": {"numberOfResults": 3}
    },
    region_name=os.getenv("AWS_DEFAULT_REGION"),
)

# --- Tool ---
def retrieve_from_kb(query: str) -> str:
    docs = retriever.invoke(query)
    return "\n\n".join(doc.page_content for doc in docs)

knowledge_base_tool = Tool(
    name="amazon_knowledge_base",
    func=retrieve_from_kb,
    description=(
        "A vector database of knowledge about companies and their financial data. "
        "Use this to answer questions about companies or their financial data."
    ),
)

# --- Agent ---
# create_react_agent (LangGraph) is the LangChain 1.x replacement for
# AgentExecutor + create_tool_calling_agent, which were removed in 1.0.
agent_executor = create_react_agent(
    llm,
    tools=[knowledge_base_tool],
    prompt=SYSTEM_PROMPT,
)


async def get_agent_response(message, chat_history):
    lc_history = []
    for msg in chat_history:
        if msg["role"] == "user":
            lc_history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_history.append(AIMessage(content=msg["content"]))

    lc_history.append(HumanMessage(content=message))

    response = await agent_executor.ainvoke({"messages": lc_history})
    # Final AI message is always the last item in the messages list
    return str(response["messages"][-1].content)