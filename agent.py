import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_aws import AmazonKnowledgeBasesRetriever
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain.agents import AgentExecutor
from langchain_core.agents import create_tool_calling_agent

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

prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])


@tool
def amazon_knowledge_base(query: str) -> str:
    """Retrieve relevant context from Amazon Bedrock Knowledge Base to answer user questions."""
    docs = retriever.invoke(query)
    return "\n\n".join(d.page_content for d in docs)


agent = create_tool_calling_agent(llm, tools=[amazon_knowledge_base], prompt=prompt)
agent_executor = AgentExecutor(agent=agent, tools=[amazon_knowledge_base])


async def get_agent_response(message: str, chat_history: list):
    history = [
        HumanMessage(content=m["content"]) if m["role"] == "user" else AIMessage(content=m["content"])
        for m in chat_history
    ]
    response = await agent_executor.ainvoke({"input": message, "chat_history": history})
    return str(response["output"])