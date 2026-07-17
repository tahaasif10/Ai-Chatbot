import {
  createGroqChatStream,
  groqStreamToTextStream,
  normalizeChatMessages,
} from "@/lib/groq";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  checkRateLimits,
  estimateMessageTokens,
  MESSAGE_LIMIT_PER_HOUR,
  TOKEN_LIMIT_PER_DAY,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
  const { supabase, user } = await getAuthContext(request);

  if (!user) {
    return unauthorized();
  }

  if (!process.env.GROQ_API_KEY) {
    return Response.json(
      { error: "GROQ_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = normalizeChatMessages(body.messages);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return Response.json(
      { error: "Send at least one user message." },
      { status: 400 }
    );
  }

  try {
    const promptTokens = estimateMessageTokens(messages);
    const usage = await checkRateLimits(supabase, user.id);

    if (usage.isMessageLimitExceeded || usage.isTokenLimitExceeded) {
      const limitMessage = usage.isMessageLimitExceeded
        ? `You have reached the hourly message limit of ${MESSAGE_LIMIT_PER_HOUR} messages. Try again later.`
        : `You have reached the daily token limit of ${TOKEN_LIMIT_PER_DAY.toLocaleString()} tokens. Try again later.`;

      return Response.json(
        {
          error: limitMessage,
          usage: {
            messageCount: usage.messageCount,
            totalTokensUsed: usage.totalTokensUsed,
          },
        },
        { status: 429 }
      );
    }

    const completion = await createGroqChatStream(messages);
    const stream = groqStreamToTextStream(
      completion,
      supabase,
      user.id,
      promptTokens
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Groq chat error:", error);

    return Response.json(
      { error: "Groq could not generate a response right now." },
      { status: 500 }
    );
  }
}
