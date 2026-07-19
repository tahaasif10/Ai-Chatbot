import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pypdf import PdfReader
import docx
import io

from dependencies.auth import AuthContext, require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attachments", tags=["attachments"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB limit

STORAGE_BUCKET = "chat-attachments"


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def extract_docx_text(file_bytes: bytes) -> str:
    document = docx.Document(io.BytesIO(file_bytes))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


@router.post("/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(require_user),
):
    file_bytes = await file.read()

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds the 10MB limit.")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="No file provided or invalid file.")

    file_ext = (file.filename or "").split(".")[-1].lower()
    unique_id = str(uuid.uuid4())
    file_name = f"{unique_id}.{file_ext}"

    user = ctx.user
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    file_path = f"{user['id']}/{file_name}"

    mime_type = file.content_type or ""

    try:
        ctx.supabase.storage.from_(STORAGE_BUCKET).upload(
            file_path,
            file_bytes,
            {"content-type": mime_type},
        )
    except Exception:
        logger.exception("Supabase Storage Upload Error")
        raise HTTPException(status_code=500, detail="Failed to upload file to storage.")

    public_url = ctx.supabase.storage.from_(STORAGE_BUCKET).get_public_url(file_path)

    extracted_text = ""

    try:
        if mime_type == "application/pdf":
            extracted_text = extract_pdf_text(file_bytes)
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            extracted_text = extract_docx_text(file_bytes)
        elif (
            mime_type.startswith("text/")
            or mime_type == "application/json"
            or file_ext in ("csv", "md")
        ):
            extracted_text = file_bytes.decode("utf-8", errors="replace")
    except Exception:
        logger.exception("Text extraction failed for file: %s", file.filename)
        extracted_text = "[Error: Could not extract text from this document]"

    return {
        "id": unique_id,
        "name": file.filename,
        "type": mime_type,
        "url": public_url,
        "size": len(file_bytes),
        "extractedText": (extracted_text or "").strip(),
    }