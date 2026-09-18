import os
import boto3
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import get_agent_response

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGION    = os.getenv("AWS_DEFAULT_REGION")
S3_BUCKET = os.getenv("S3_BUCKET_NAME")
KB_ID     = os.getenv("BEDROCK_KNOWLEDGE_BASE_ID")
DS_ID     = os.getenv("BEDROCK_DATA_SOURCE_ID")


class ChatRequest(BaseModel):
    message: str
    chat_history: list = []


@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    response = await get_agent_response(request.message, request.chat_history)
    return {"response": response}


@app.get("/document")
async def get_document():
    """Return the currently uploaded document in S3, if any."""
    s3  = boto3.client("s3", region_name=REGION)
    res = s3.list_objects_v2(Bucket=S3_BUCKET)
    if res.get("KeyCount", 0) == 0:
        return {"filename": None}
    obj = res["Contents"][0]
    return {"filename": obj["Key"], "size": obj["Size"]}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Delete any existing S3 file, upload new one, then trigger KB sync."""
    s3 = boto3.client("s3", region_name=REGION)

    # Remove any existing file so the KB stays single-document
    existing = s3.list_objects_v2(Bucket=S3_BUCKET)
    for obj in existing.get("Contents", []):
        s3.delete_object(Bucket=S3_BUCKET, Key=obj["Key"])

    # Upload new file
    s3.upload_fileobj(file.file, S3_BUCKET, file.filename)

    # Trigger Bedrock KB sync
    bedrock = boto3.client("bedrock-agent", region_name=REGION)
    job = bedrock.start_ingestion_job(knowledgeBaseId=KB_ID, dataSourceId=DS_ID)
    return {"job_id": job["ingestionJob"]["ingestionJobId"], "filename": file.filename}


@app.get("/sync-status/{job_id}")
async def sync_status(job_id: str):
    bedrock = boto3.client("bedrock-agent", region_name=REGION)
    job = bedrock.get_ingestion_job(knowledgeBaseId=KB_ID, dataSourceId=DS_ID, ingestionJobId=job_id)
    return {"status": job["ingestionJob"]["status"]}


from mangum import Mangum
handler = Mangum(app)
