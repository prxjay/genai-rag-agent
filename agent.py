import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_aws import AmazonKnowledgeBasesRetriever
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.prebuilt import create_react_agent

load_dotenv()

SYSTEM_PROMPT = (
    "You are a helpful AI assistant with access to a knowledge base of company documents. "
    "Use the amazon_knowledge_base tool to retrieve accurate context to answer questions. "
    "Always provide clear, concise answers without markdown formatting."
)

llm = ChatGroq(model="openai/gpt-oss-20b", api_key=os.getenv("GROQ_API_KEY"))

retriever = AmazonKnowledgeBasesRetriever(
    knowledge_base_id=os.getenv("BEDROCK_KNOWLEDGE_BASE_ID"),
    retrieval_config={"vectorSearchConfiguration": {"numberOfResults": 4}},
    region_name=os.getenv("AWS_REGION"),
)


@tool
def amazon_knowledge_base(query: str) -> str:
    """Retrieve relevant context from Amazon Bedrock Knowledge Base to answer user questions."""
    docs = retriever.invoke(query)
    return "\n\n".join(d.page_content for d in docs)


agent = create_react_agent(
    model=llm,
    tools=[amazon_knowledge_base],
    prompt=SYSTEM_PROMPT,
)


async def get_agent_response(message: str, chat_history: list):
    history = [
        HumanMessage(content=m["content"]) if m["role"] == "user" else AIMessage(content=m["content"])
        for m in chat_history
    ]
    messages = history + [HumanMessage(content=message)]
    response = await agent.ainvoke({"messages": messages})
    return str(response["messages"][-1].content)