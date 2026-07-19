import os
from typing import Optional

from fastapi import Depends, HTTPException, Request
from supabase import create_client, Client
from services.supabase_client import get_supabase_client


SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]


def _get_bearer_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")

    if not authorization.lower().startswith("bearer "):
        return ""

    return authorization[7:].strip()

# remove the _make_supabase_client function entirely, then update:


class AuthContext:
    def __init__(self, supabase: Client, user: Optional[dict]):
        self.supabase = supabase
        self.user = user


async def get_auth_context(request: Request) -> AuthContext:
    access_token = _get_bearer_token(request)
    supabase = get_supabase_client(access_token)

    if not access_token:
        return AuthContext(supabase=supabase, user=None)

    try:
        response = supabase.auth.get_user(access_token)
        user = response.user if response else None
    except Exception:
        user = None

    if not user:
        return AuthContext(supabase=supabase, user=None)

    return AuthContext(
        supabase=supabase,
        user={"id": user.id, "email": user.email},
    )


async def require_user(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if not ctx.user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return ctx