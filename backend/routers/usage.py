import logging

from fastapi import APIRouter, Depends, HTTPException

from dependencies.auth import AuthContext, require_user
from services.rate_limit import (
    get_current_usage,
    MESSAGE_LIMIT_PER_HOUR,
    TOKEN_LIMIT_PER_DAY,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user", tags=["usage"])


@router.get("/usage")
async def get_usage(ctx: AuthContext = Depends(require_user)):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        usage = get_current_usage(ctx.supabase, ctx.user["id"])
    except Exception:
        logger.exception("Usage lookup error")
        raise HTTPException(status_code=500, detail="Could not load usage data.")

    return {
        **usage,
        "messageLimit": MESSAGE_LIMIT_PER_HOUR,
        "tokenLimit": TOKEN_LIMIT_PER_DAY,
    }