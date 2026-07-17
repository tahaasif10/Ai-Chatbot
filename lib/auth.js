import { createClient } from "@/lib/supabase-server";

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function getBearerToken(request) {
  const authorization = request?.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

export async function getAuthContext(request) {
  const accessToken = getBearerToken(request);
  const supabase = await createClient({ accessToken });
  const {
    data: { user },
    error,
  } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null };
  }

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email,
    },
  };
}
