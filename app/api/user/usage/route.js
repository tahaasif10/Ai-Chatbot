import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  getCurrentUsage,
  MESSAGE_LIMIT_PER_HOUR,
  TOKEN_LIMIT_PER_DAY,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function GET(request) {
  const { supabase, user } = await getAuthContext(request);

  if (!user) {
    return unauthorized();
  }

  try {
    const usage = await getCurrentUsage(supabase, user.id);

    return Response.json({
      ...usage,
      messageLimit: MESSAGE_LIMIT_PER_HOUR,
      tokenLimit: TOKEN_LIMIT_PER_DAY,
    });
  } catch (error) {
    console.error("Usage lookup error:", error);

    return Response.json(
      { error: "Could not load usage data." },
      { status: 500 }
    );
  }
}
