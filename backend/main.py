import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import usage
from routers import conversations
from routers import messages
from routers import chat
from routers import attachments
from routers import study

app = FastAPI(title="AI Study Assistant API")

# ── CORS ──────────────────────────────────────────────────────────
# Frontend runs on a different origin (localhost:3000) than the backend
# (localhost:8000), so the browser needs explicit permission to call it.
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "FastAPI server is running"}

# ── Health check ──────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ── Routers ───────────────────────────────────────────────────────
# Uncomment each include as we build it in later phases.
#

# from routers import usage, conversations, messages, chat, attachments
#
app.include_router(usage.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(chat.router)
app.include_router(attachments.router)
app.include_router(study.router)
