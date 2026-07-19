"use client";

import { createClient } from "@/lib/supabase-browser";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function resolveUrl(input) {
  if (typeof input !== "string") {
    return input;
  }

  // Absolute URLs (e.g. if a call already includes the full backend URL) pass through untouched.
  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  // Old routes were called as "/api/chat", "/api/conversations", etc.
  // The FastAPI backend doesn't use an "/api" prefix, so strip it here —
  // this means call sites like useChat.js/useConversations.js don't need
  // to be touched individually.
  const path = input.startsWith("/api/") ? input.slice(4) : input;

  return `${API_BASE_URL}${path}`;
}

export async function authFetch(input, init = {}) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(resolveUrl(input), {
    ...init,
    headers,
  });
}