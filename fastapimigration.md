FastAPI Migration Plan: Next.js API Routes → Python Backend
Overview
Your current project is a Next.js full-stack chatbot that uses:

Groq (LLM) for AI responses and chat title generation
Supabase for auth, database (conversations, messages, usage logs), and file storage
Next.js API Routes (Node.js) as the backend
The goal is to replace all Next.js API Routes with a FastAPI (Python) backend, keeping the Next.js frontend completely intact. The frontend will simply point its API calls to the FastAPI server instead.

Architecture After Migration

┌──────────────────────────────────┐       ┌───────────────────────────────────────────┐
│  Next.js Frontend (unchanged)    │──────▶│  FastAPI Backend (Python) — new           │
│  Runs on :3000                   │       │  Runs on :8000                             │
│                                  │       │                                            │
│  All fetch() calls updated to    │       │  /api/auth/login       POST               │
│  point to http://localhost:8000  │       │  /api/auth/signup      POST               │
└──────────────────────────────────┘       │  /api/auth/logout      POST               │
                                           │  /api/chat             POST (streaming)   │
                                           │  /api/chat-title       POST               │
                                           │  /api/conversations    GET / POST / PATCH │
                                           │  /api/messages         GET / POST         │
                                           │  /api/attachments/upload POST             │
                                           │  /api/user/usage       GET                │
                                           └───────────────────────────────────────────┘
                                                        │
                                              ┌─────────┴───────────┐
                                              │  Supabase + Groq API │
                                              └──────────────────────┘
Open Questions
IMPORTANT

Where does the FastAPI backend live?

Option A: A new backend/ folder inside the existing Chatbot/ project
Option B: A completely separate folder (sibling to Chatbot/) e.g. Ai Bot/backend/
Option B is cleaner for a school project submission (two clearly separated apps). Let me know your preference; the plan below assumes Option B.

IMPORTANT

Does your professor require a specific database? The current project uses Supabase (PostgreSQL-as-a-service). The migration can:

Keep Supabase — easiest, no data migration, same tables
Replace with SQLite — pure Python, no cloud dependency, but no auth built-in
Replace with PostgreSQL directly via SQLAlchemy — more standard Python way
Plan below defaults to keeping Supabase (via supabase-py) since all tables and auth already exist.

IMPORTANT

Python version requirement? FastAPI works best with Python 3.10+. Confirm you have Python 3.10 or newer installed.

Proposed Changes
Component 1 — FastAPI Backend (Ai Bot/backend/)
This is a completely new Python project that mirrors all the existing API routes.

[NEW] backend/main.py
The FastAPI app entry point. Registers all routers, sets up CORS middleware so the Next.js frontend (:3000) can reach it.

[NEW] backend/requirements.txt
Python dependencies:


fastapi
uvicorn[standard]
python-dotenv
groq             # Official Groq Python SDK
supabase         # supabase-py for DB + auth + storage
python-multipart # For file upload (multipart/form-data)
PyMuPDF          # PDF text extraction (replaces pdf-parse)
python-docx      # .docx text extraction (replaces mammoth)
[NEW] backend/.env
Same keys as the existing .env:


GROQ_API_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # needed for server-side auth
[NEW] backend/routers/auth.py
Replaces app/api/auth/login/, signup/, logout/ routes.

Next.js Route	FastAPI Equivalent
POST /api/auth/login	POST /api/auth/login
POST /api/auth/signup	POST /api/auth/signup
POST /api/auth/logout	POST /api/auth/logout
Logic: Calls supabase.auth.sign_in_with_password(), supabase.auth.sign_up(), and supabase.auth.sign_out() respectively using supabase-py.

[NEW] backend/routers/chat.py
Replaces app/api/chat/route.js — the main AI streaming endpoint.

Next.js Route	FastAPI Equivalent
POST /api/chat	POST /api/chat
Key logic:

Reads Bearer token → verifies with Supabase to get user_id
Checks rate limits (messages/hour, tokens/day) from user_usage_log table
Calls Groq SDK in Python (groq.chat.completions.create(..., stream=True))
Returns a StreamingResponse (FastAPI's equivalent of ReadableStream)
After streaming, logs token usage to Supabase
[NEW] backend/routers/chat_title.py
Replaces app/api/chat-title/route.js.

Next.js Route	FastAPI Equivalent
POST /api/chat-title	POST /api/chat-title
Logic: Calls Groq non-streaming completion to generate a short title from a user/assistant message pair.

[NEW] backend/routers/conversations.py
Replaces app/api/conversations/route.js.

Next.js Route	FastAPI Equivalent
GET /api/conversations	GET /api/conversations
POST /api/conversations	POST /api/conversations
PATCH /api/conversations	PATCH /api/conversations
Logic: Direct Supabase DB queries using supabase-py client.

[NEW] backend/routers/messages.py
Replaces app/api/messages/route.js.

Next.js Route	FastAPI Equivalent
GET /api/messages?conversationId=...	GET /api/messages
POST /api/messages	POST /api/messages
[NEW] backend/routers/attachments.py
Replaces app/api/attachments/upload/route.js.

Next.js Route	FastAPI Equivalent
POST /api/attachments/upload	POST /api/attachments/upload
Key logic:

Accepts multipart/form-data file upload via FastAPI's UploadFile
Uploads file to Supabase Storage (chat-attachments bucket)
Extracts text using:
PyMuPDF (fitz) for PDFs
python-docx for .docx files
str.decode() for plain text / JSON / CSV / Markdown
Returns { id, name, type, url, size, extractedText }
[NEW] backend/routers/usage.py
Replaces app/api/user/usage/route.js.

Next.js Route	FastAPI Equivalent
GET /api/user/usage	GET /api/user/usage
[NEW] backend/dependencies.py
Shared auth dependency that all protected routes will use (FastAPI's Depends() system).

python

# Equivalent of lib/auth.js → getAuthContext()
async def get_current_user(authorization: str = Header(...)):
    # extract Bearer token
    # call supabase.auth.get_user(token)
    # return user or raise HTTPException(401)
[NEW] backend/services/groq_service.py
Python equivalent of lib/groq.js:

SYSTEM_PROMPT constant
TITLE_SYSTEM_PROMPT constant
normalize_chat_messages() — validates & cleans message list
create_groq_chat_stream() — picks vision/text model, calls Groq streaming
create_groq_chat_title() — non-streaming title generation
[NEW] backend/services/rate_limit.py
Python equivalent of lib/rateLimit.js:

MESSAGE_LIMIT_PER_HOUR = 20
TOKEN_LIMIT_PER_DAY = 50000
estimate_tokens(text) — len(text) / 4
get_current_usage(supabase, user_id) — Supabase queries
check_rate_limits(supabase, user_id) — raises HTTPException(429) if exceeded
log_user_usage(supabase, user_id, tokens_used) — inserts into user_usage_log
Component 2 — Next.js Frontend (minimal changes)
The frontend fetch() calls currently go to relative URLs like /api/chat. These need to point to the FastAPI server.

[MODIFY] Chatbot/lib/auth-fetch.js
Update the base URL for all API calls. A single API_BASE_URL constant change (e.g., http://localhost:8000) will be enough if all fetches flow through this helper.

NOTE

You can also use an environment variable like NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local to make this configurable per environment.

[MODIFY] Chatbot/.env or .env.local
Add NEXT_PUBLIC_API_URL=http://localhost:8000 — the frontend will read this to know where the FastAPI server is.

File Structure After Migration

Ai Bot/
├── Chatbot/               ← Next.js frontend (mostly unchanged)
│   ├── app/
│   │   ├── api/           ← These routes become UNUSED (can delete later)
│   │   ├── chat/
│   │   └── ...
│   ├── lib/
│   │   └── auth-fetch.js  ← Update API base URL here
│   └── .env.local         ← Add NEXT_PUBLIC_API_URL
│
└── backend/               ← NEW FastAPI Python project
    ├── main.py
    ├── requirements.txt
    ├── .env
    ├── dependencies.py
    ├── routers/
    │   ├── auth.py
    │   ├── chat.py
    │   ├── chat_title.py
    │   ├── conversations.py
    │   ├── messages.py
    │   ├── attachments.py
    │   └── usage.py
    └── services/
        ├── groq_service.py
        └── rate_limit.py
Verification Plan
Running Both Servers
bash

# Terminal 1 — FastAPI backend
cd "Ai Bot/backend"
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Terminal 2 — Next.js frontend
cd "Ai Bot/Chatbot"
npm run dev
Manual Verification Steps
Auth — Sign up a new user, log in, verify JWT token is returned and usable
Chat streaming — Send a message and verify tokens stream back to the browser in real time
Conversations — Create, list, and rename conversations
Messages — Send messages and reload them per conversation
File Upload — Upload a PDF and a .docx, verify text is extracted and the URL is valid
Rate Limiting — Verify the 429 response after exceeding 20 messages/hour
Chat Title — Verify title is auto-generated after first exchange
FastAPI Automatic Docs
Visit http://localhost:8000/docs — FastAPI generates interactive Swagger UI for all endpoints automatically. Useful for testing each endpoint in isolation.

