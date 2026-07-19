import math
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, cast

from supabase import Client


MESSAGE_LIMIT_PER_HOUR = 20
TOKEN_LIMIT_PER_DAY = 50000

TOKEN_CHARACTER_RATIO = 4


def estimate_tokens(text: Optional[str]) -> int:
    if not isinstance(text, str) or not text.strip():
        return 0

    return max(1, math.ceil(len(text) / TOKEN_CHARACTER_RATIO))


def estimate_message_tokens(messages: list[dict]) -> int:
    if not isinstance(messages, list):
        return 0

    total = 0

    for message in messages:
        attachments = message.get("attachments") if isinstance(message, dict) else None
        attachment_tokens = 0

        if isinstance(attachments, list):
            for attachment in attachments:
                extracted_text = (attachment or {}).get("extractedText", "")
                attachment_tokens += estimate_tokens(extracted_text)

        content = (message or {}).get("content", "")
        total += estimate_tokens(content) + attachment_tokens

    return total


def get_current_usage(supabase: Client, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    one_day_ago = (now - timedelta(days=1)).isoformat()

    # Execute queries. Supabase client responses can be dicts or objects depending
    # on the client version; normalize access below to avoid attribute errors.
    message_response = (
        supabase.table("user_usage_log")
        .select("id", count=cast(Any, "exact"))
        .eq("user_id", user_id)
        .gte("created_at", one_hour_ago)
        .execute()
    )

    token_response = (
        supabase.table("user_usage_log")
        .select("tokens_used")
        .eq("user_id", user_id)
        .gte("created_at", one_day_ago)
        .execute()
    )

    def _resp_get(attr_name: str, resp, default=None):
        if resp is None:
            return default
        if isinstance(resp, dict):
            return resp.get(attr_name, default)
        return getattr(resp, attr_name, default)

    # message count: prefer explicit count, fall back to length of returned rows
    message_count = _resp_get("count", message_response)
    if message_count is None:
        rows = _resp_get("data", message_response, []) or []
        try:
            message_count = len(rows)
        except Exception:
            message_count = 0

    # tokens: normalize rows list access
    token_rows = _resp_get("data", token_response, []) or []
    total_tokens_used = 0
    for row in token_rows:
        if isinstance(row, dict):
            total_tokens_used += int(row.get("tokens_used") or 0)
        else:
            total_tokens_used += int(getattr(row, "tokens_used", 0) or 0)

    return {
        "messageCount": message_count,
        "totalTokensUsed": total_tokens_used,
    }


def check_rate_limits(supabase: Client, user_id: str) -> dict:
    usage = get_current_usage(supabase, user_id)

    return {
        **usage,
        "isMessageLimitExceeded": usage["messageCount"] >= MESSAGE_LIMIT_PER_HOUR,
        "isTokenLimitExceeded": usage["totalTokensUsed"] >= TOKEN_LIMIT_PER_DAY,
    }


def log_user_usage(supabase: Client, user_id: str, tokens_used: float) -> None:
    safe_tokens_used = max(0, math.ceil(tokens_used or 0))

    response = (
        supabase.table("user_usage_log")
        .insert({"user_id": user_id, "tokens_used": safe_tokens_used})
        .execute()
    )

    # Response can be a dict or an object. Check both shapes for errors.
    error_val = None
    if response is None:
        error_val = None
    elif isinstance(response, dict):
        error_val = response.get("error")
    else:
        error_val = getattr(response, "error", None)

    if error_val:
        raise Exception(error_val)