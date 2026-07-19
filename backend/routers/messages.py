import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import Client

from dependencies.auth import AuthContext, require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["messages"])

SELECT_COLUMNS = "id,role,content,attachments,created_at"
VALID_ROLES = {"user", "assistant"}


class MessageBody(BaseModel):
    conversationId: Optional[str] = None
    role: Optional[str] = None
    content: Optional[str] = None
    attachments: Optional[list] = None


def normalize_attachments(value: Any) -> list[dict]:
    if not isinstance(value, list):
        return []

    normalized = []

    for attachment in value:
        if not isinstance(attachment, dict):
            continue

        if not all(
            isinstance(attachment.get(field), str)
            for field in ("id", "name", "type", "url")
        ):
            continue

        size = attachment.get("size")

        normalized.append(
            {
                "id": attachment["id"],
                "name": attachment["name"],
                "type": attachment["type"],
                "url": attachment["url"],
                "size": size if isinstance(size, (int, float)) else 0,
                "extractedText": (
                    attachment.get("extractedText")
                    if isinstance(attachment.get("extractedText"), str)
                    else ""
                ),
            }
        )

    return normalized


def user_owns_conversation(supabase: Client, conversation_id: str, user_id: str) -> bool:
    try:
        response = (
            supabase.table("conversations")
            .select("id")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception:
        return False

    return bool(response and response.data)


@router.get("")
async def list_messages(
    conversationId: Optional[str] = Query(default=None),
    ctx: AuthContext = Depends(require_user),
):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not conversationId:
        raise HTTPException(status_code=400, detail="Conversation id is required.")

    if not user_owns_conversation(ctx.supabase, conversationId, ctx.user["id"]):
        raise HTTPException(status_code=404, detail="Conversation not found.")

    try:
        response = (
            ctx.supabase.table("messages")
            .select(SELECT_COLUMNS)
            .eq("conversation_id", conversationId)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception:
        logger.exception("Messages lookup error")
        raise HTTPException(status_code=500, detail="Could not load messages.")

    return {"messages": response.data or []}


@router.post("", status_code=201)
async def create_message(
    body: MessageBody,
    ctx: AuthContext = Depends(require_user),
):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conversation_id = body.conversationId or ""
    role = body.role or ""
    content = (body.content or "").strip()
    attachments = normalize_attachments(body.attachments)

    if not conversation_id or role not in VALID_ROLES or (not content and not attachments):
        raise HTTPException(
            status_code=400,
            detail="Conversation id, role, and message content or attachments are required.",
        )

    if not user_owns_conversation(ctx.supabase, conversation_id, ctx.user["id"]):
        raise HTTPException(status_code=404, detail="Conversation not found.")

    try:
        response = (
            ctx.supabase.table("messages")
            .insert(
                {
                    "conversation_id": conversation_id,
                    "role": role,
                    "content": content,
                    "attachments": attachments,
                }
            )
            .select(SELECT_COLUMNS)
            .execute()
        )
        message = response.data[0] if isinstance(response.data, list) else response.data
        if not message:
            raise HTTPException(status_code=500, detail="Could not save the message.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Message save error")
        raise HTTPException(status_code=500, detail="Could not save the message.")

    return {"message": message}