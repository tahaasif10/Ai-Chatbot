import os
from typing import Optional

from supabase import create_client, Client
from supabase.client import ClientOptions


SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]


def get_supabase_client(access_token: Optional[str] = None) -> Client:
    """
    Creates a Supabase client. If an access_token is provided, the
    Authorization header is set at the client level so it propagates to
    every sub-client (postgrest, storage, etc.) — not just postgrest.
    """
    options = ClientOptions()

    if access_token:
        options.headers["Authorization"] = f"Bearer {access_token}"

    return create_client(SUPABASE_URL, SUPABASE_KEY, options=options)