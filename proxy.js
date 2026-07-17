import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase-proxy";

export async function proxy(request) {
  const { response, user } = await updateSession(request);

  if (user) {
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return response;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/",
    "/chat/:path*",
  ],
};
