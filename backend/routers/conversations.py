import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies.auth import AuthContext, require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])

SELECT_COLUMNS = "id,title,created_at,updated_at"
DEFAULT_CONVERSATION_TITLE = "New study chat"


class CreateConversationBody(BaseModel):
    title: Optional[str] = None


class UpdateConversationBody(BaseModel):
    id: str
    title: Optional[str] = None
    updated_at: Optional[str] = None


@router.get("")
async def list_conversations(ctx: AuthContext = Depends(require_user)):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        response = (
            ctx.supabase.table("conversations")
            .select(SELECT_COLUMNS)
            .eq("user_id", ctx.user["id"])
            .order("updated_at", desc=True)
            .execute()
        )
    except Exception:
        logger.exception("Conversations lookup error")
        raise HTTPException(status_code=500, detail="Could not load conversations.")

    return {"conversations": response.data or []}


@router.post("", status_code=201)
async def create_conversation(
    body: CreateConversationBody,
    ctx: AuthContext = Depends(require_user),
):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    title = (
        body.title.strip()
        if isinstance(body.title, str) and body.title.strip()
        else DEFAULT_CONVERSATION_TITLE
    )

    try:
        response = (
            ctx.supabase.table("conversations")
            .insert(
                {
                    "title": title,
                    "user_id": ctx.user["id"],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .select(SELECT_COLUMNS)
            .execute()
        )
        conversation = response.data[0] if isinstance(response.data, list) else response.data
        if not conversation:
            raise HTTPException(status_code=500, detail="Could not create a conversation.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Conversation create error")
        raise HTTPException(status_code=500, detail="Could not create a conversation.")

    return {"conversation": conversation}


@router.patch("")
async def update_conversation(
    body: UpdateConversationBody,
    ctx: AuthContext = Depends(require_user),
):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not body.id:
        raise HTTPException(status_code=400, detail="Conversation id is required.")

    updates = {}

    if body.title is not None:
        updates["title"] = body.title.strip() or DEFAULT_CONVERSATION_TITLE

    if body.updated_at is not None:
        updates["updated_at"] = body.updated_at

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided.")

    try:
        response = (
            ctx.supabase.table("conversations")
            .update(updates)
            .eq("id", body.id)
            .eq("user_id", ctx.user["id"])
            .select(SELECT_COLUMNS)
            .execute()
        )
        conversation = response.data[0] if isinstance(response.data, list) else response.data
        if not conversation:
            raise HTTPException(status_code=500, detail="Could not update the conversation.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Conversation update error")
        raise HTTPException(status_code=500, detail="Could not update the conversation.")

    return {"conversation": conversation}