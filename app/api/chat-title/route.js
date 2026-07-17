import { createGroqChatTitle } from "@/lib/groq";
import { getAuthContext, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request) {
  const { user } = await getAuthContext(request);

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

  const userMessage =
    typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  const assistantMessage =
    typeof body.assistantMessage === "string"
      ? body.assistantMessage.trim()
      : "";

  if (!userMessage || !assistantMessage) {
    return Response.json(
      { error: "Send the first user and assistant messages." },
      { status: 400 }
    );
  }

  try {
    const title = await createGroqChatTitle({ userMessage, assistantMessage });

    return Response.json({ title });
  } catch (error) {
    console.error("Groq title error:", error);

    return Response.json(
      { error: "Groq could not generate a title right now." },
      { status: 500 }
    );
  }
}
