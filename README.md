# GenAI RAG Agent — AWS Bedrock + LangChain + FastAPI

An AI-powered chatbot that answers questions grounded in your own documents, using Retrieval-Augmented Generation (RAG) on AWS. Upload up to 5 documents, ask questions, and get answers sourced directly from that content — not from the model's general training data.

[![Watch Demo Video](https://img.youtube.com/vi/zuvj-i0scgM/maxresdefault.jpg)](https://youtu.be/zuvj-i0scgM)

[▶ Watch Demo Video on YouTube](https://youtu.be/zuvj-i0scgM)

---

## Architecture

![Architecture Diagram](assets/architecture.png)

---

## How It Works

**Document Upload & Indexing**
When a user uploads a document, it's stored in Amazon S3 and automatically triggers an ingestion/sync job with an Amazon Bedrock Knowledge Base. Bedrock handles parsing the document, splitting it into chunks, and converting each chunk into vector embeddings using Amazon Titan Text Embeddings. These embeddings are stored in **Amazon S3 Vectors** — chosen specifically over OpenSearch Serverless because S3 Vectors is pay-per-use with no idle cost floor, making it far more cost-effective for a project at this scale.

**Answering Questions**
When a user asks a question, the backend retrieves the most relevant chunks from the Knowledge Base and passes them, along with the question, to an LLM served through **Groq** for fast, low-latency inference. The agent is built with LangChain's `create_react_agent`, using a custom retrieval tool that lets the model decide when to pull in document context versus answering directly.

**Conversation Memory**
Chat history is passed with every request, so the chatbot can correctly resolve follow-up questions (e.g., "what else did they do alongside that?") without the user repeating context.

---

## AWS Services Used & Why

| Service | Role | Why this choice |
|---|---|---|
| **Amazon Bedrock Knowledge Base** | Managed RAG pipeline — parsing, chunking, embedding | Avoids building a custom ingestion pipeline from scratch; reliable, AWS-managed |
| **Amazon S3 Vectors** | Vector store for embeddings | Pay-per-use, no idle billing floor — a deliberate cost tradeoff over OpenSearch Serverless, which has a persistent hourly minimum even at zero traffic |
| **Amazon S3** | Document + static frontend storage | Standard, durable, cost-effective object storage for both source documents and the built React web app |
| **Amazon CloudFront** | CDN & reverse proxy | Fast global delivery and HTTPS termination for the frontend, with path-based behaviors routing API calls seamlessly |
| **Amazon EC2** | Hosts the FastAPI backend | Chosen over Lambda after hitting Linux/Windows binary incompatibility issues with compiled Python dependencies (`pydantic-core`) in a serverless packaging attempt; EC2 avoids this entirely by installing dependencies natively on Linux, and avoids Lambda cold-start latency for multi-step RAG requests |
| **IAM** | Scoped permissions for Bedrock, S3, and S3 Vectors | Used a dedicated IAM user (not root), with custom inline policies where AWS managed policies didn't cover newer service namespaces |
| **Groq** | LLM inference | Ultra-low latency inference with reliable tool/function-calling support — a deliberate cost optimization over Bedrock-hosted models for this stage of the project |

---

## Tech Stack

- **Backend:** FastAPI, LangChain, LangGraph (`create_react_agent`), Uvicorn
- **LLM:** Groq (Llama 3 / OpenAI-compatible OSS models)
- **Retrieval:** `langchain-aws` (`AmazonKnowledgeBasesRetriever`)
- **Frontend:** React, Vite
- **Infra & Cloud:** AWS Bedrock, S3, S3 Vectors, EC2, CloudFront, IAM

---

## Features

- **Document Upload:** Support for up to 5 documents (PDF, DOCX, TXT, MD, RTF)
- **Live Sync Tracking:** Real-time sync status tracking (ingesting vs. synced) directly in the UI
- **One-Click Reset:** "Remove All" clears documents from both S3 and the Knowledge Base index
- **Multi-Turn Chat:** Context-aware conversation history with conversational memory
- **Cost-Optimized Architecture:** Zero idle vector database costs and on-demand compute

---

## Project Structure

```
├── agent.py               # LangChain ReAct agent & Bedrock retriever tool
├── server.py              # FastAPI endpoints (/chat, /upload, /documents, /sync-status)
├── requirements.txt       # Python backend dependencies
├── assets/
│   └── architecture.png   # Architecture diagram
└── frontend/              # React + Vite frontend
    ├── src/
    │   ├── App.jsx        # Main chat and document management UI
    │   └── main.jsx
    └── package.json
```

---

## Environment Variables

Create a `.env` file in the root directory:

```env
GROQ_API_KEY=your_groq_api_key
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_DEFAULT_REGION=ap-south-1
KNOWLEDGE_BASE_ID=your_bedrock_kb_id
DATA_SOURCE_ID=your_bedrock_data_source_id
S3_BUCKET_NAME=your_document_bucket_name
```

---

## Cost-Conscious Design

This project was built with a personal-project portfolio budget. Key decisions made specifically to eliminate unexpected cloud bills:
- **S3 Vectors over OpenSearch Serverless:** Saves ~$350/month in OpenSearch compute units (OCUs) idle minimums.
- **Groq for inference:** Free/near-zero cost inference with sub-second token generation.
- **On-Demand EC2:** Instance runs when demoing and can be stopped when idle without losing configuration.

---

## Future Scope

- Migrate backend packaging to Docker containers on AWS ECS/Fargate or containerized Lambda for automated scaling.
- Add user authentication (AWS Cognito) for multi-tenant document isolation.
- Hybrid search (keyword + semantic) evaluation as document count scales.
