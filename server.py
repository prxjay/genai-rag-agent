import os
import boto3
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import get_agent_response

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGION, S3_BUCKET = os.getenv("AWS_REGION"), os.getenv("S3_BUCKET_NAME")
KB_ID, DS_ID      = os.getenv("BEDROCK_KNOWLEDGE_BASE_ID"), os.getenv("BEDROCK_DATA_SOURCE_ID")

s3      = boto3.client("s3", region_name=REGION)
bedrock = boto3.client("bedrock-agent", region_name=REGION)


def sync_kb():
    job = bedrock.start_ingestion_job(knowledgeBaseId=KB_ID, dataSourceId=DS_ID)
    return job["ingestionJob"]["ingestionJobId"]


class ChatRequest(BaseModel):
    message: str
    chat_history: list = []


@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    return {"response": await get_agent_response(req.message, req.chat_history)}


@app.get("/documents")
async def get_documents():
    docs = [{"filename": o["Key"], "size": o["Size"]} for o in s3.list_objects_v2(Bucket=S3_BUCKET).get("Contents", [])]
    return {"documents": docs, "count": len(docs), "max": 5}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    existing = [o["Key"] for o in s3.list_objects_v2(Bucket=S3_BUCKET).get("Contents", [])]
    if file.filename not in existing and len(existing) >= 5:
        raise HTTPException(400, "Limit reached (5 documents max). Remove all first.")

    s3.upload_fileobj(file.file, S3_BUCKET, file.filename)
    return {"job_id": sync_kb(), "filename": file.filename}


@app.delete("/documents")
async def clear_documents():
    for o in s3.list_objects_v2(Bucket=S3_BUCKET).get("Contents", []):
        s3.delete_object(Bucket=S3_BUCKET, Key=o["Key"])
    return {"job_id": sync_kb()}


@app.get("/sync-status/{job_id}")
async def sync_status(job_id: str):
    res = bedrock.get_ingestion_job(knowledgeBaseId=KB_ID, dataSourceId=DS_ID, ingestionJobId=job_id)
    return {"status": res["ingestionJob"]["status"]}
