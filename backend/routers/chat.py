import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import APIStatusError
from fastapi import Request  # add to existing imports

from dependencies.auth import AuthContext, require_user
from services.ai_service import (
    create_groq_chat_stream,
    create_groq_chat_title,
    groq_stream_to_text_generator,
    normalize_chat_messages,
)
from services.rate_limit import (
    check_rate_limits,
    estimate_message_tokens,
    MESSAGE_LIMIT_PER_HOUR,
    TOKEN_LIMIT_PER_DAY,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


class ChatBody(BaseModel):
    messages: list = []


class ChatTitleBody(BaseModel):
    userMessage: str = ""
    assistantMessage: str = ""


@router.post("/chat")
async def chat(body: ChatBody, request: Request,ctx: AuthContext = Depends(require_user)):
    if not os.environ.get("GROQ_API_KEY"):
        raise HTTPException(
            status_code=500, detail="GROQ_API_KEY is not configured on the server."
        )

    messages = normalize_chat_messages(body.messages)

    if not messages or messages[-1].get("role") != "user":
        raise HTTPException(status_code=400, detail="Send at least one user message.")

    prompt_tokens = estimate_message_tokens(messages)

    if ctx.user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = ctx.user["id"]

    try:
        usage = check_rate_limits(ctx.supabase, user_id)
    except Exception:
        logger.exception("Rate limit check error")
        raise HTTPException(
            status_code=500, detail="Groq could not generate a response right now."
        )

    if usage["isMessageLimitExceeded"] or usage["isTokenLimitExceeded"]:
        limit_message = (
            f"You have reached the hourly message limit of {MESSAGE_LIMIT_PER_HOUR} messages. Try again later."
            if usage["isMessageLimitExceeded"]
            else f"You have reached the daily token limit of {TOKEN_LIMIT_PER_DAY:,} tokens. Try again later."
        )

        raise HTTPException(
            status_code=429,
            detail={
                "error": limit_message,
                "usage": {
                    "messageCount": usage["messageCount"],
                    "totalTokensUsed": usage["totalTokensUsed"],
                },
            },
        )

    try:
        completion = await create_groq_chat_stream(messages)
    except APIStatusError as e:
        if e.status_code == 413 or "rate_limit_exceeded" in str(e):
            logger.warning("Groq rate/size limit hit: %s", e)
            raise HTTPException(
                status_code=413,
                detail="That document is too large to process right now. Try asking about a specific section, or use the Summarize tool first to condense it.",
            )
        logger.exception("Groq chat error")
        raise HTTPException(status_code=500, detail="Groq could not generate a response right now.")
    except Exception:
        logger.exception("Groq chat error")
        raise HTTPException(status_code=500, detail="Groq could not generate a response right now.")

    generator = groq_stream_to_text_generator(
        completion, ctx.supabase, ctx.user["id"], prompt_tokens, request=request
    )

    return StreamingResponse(
        generator,
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/chat-title")
async def chat_title(body: ChatTitleBody, ctx: AuthContext = Depends(require_user)):
    if not os.environ.get("GROQ_API_KEY"):
        raise HTTPException(
            status_code=500, detail="GROQ_API_KEY is not configured on the server."
        )

    user_message = body.userMessage.strip()
    assistant_message = body.assistantMessage.strip()

    if not user_message or not assistant_message:
        raise HTTPException(
            status_code=400, detail="Send the first user and assistant messages."
        )

    try:
        title = await create_groq_chat_title(user_message, assistant_message)
    except Exception:
        logger.exception("Groq title error")
        raise HTTPException(
            status_code=500, detail="Groq could not generate a title right now."
        )

    return {"title": title}