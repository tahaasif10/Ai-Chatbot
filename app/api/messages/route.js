import { getAuthContext, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

const SELECT_COLUMNS = "id,role,content,attachments,created_at";
const VALID_ROLES = new Set(["user", "assistant"]);

function normalizeAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((attachment) => {
      return (
        attachment &&
        typeof attachment.id === "string" &&
        typeof attachment.name === "string" &&
        typeof attachment.type === "string" &&
        typeof attachment.url === "string"
      );
    })
    .map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      url: attachment.url,
      size: Number.isFinite(attachment.size) ? attachment.size : 0,
      extractedText:
        typeof attachment.extractedText === "string"
          ? attachment.extractedText
          : "",
    }));
}

async function userOwnsConversation(supabase, conversationId, userId) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function GET(request) {
  const { supabase, user } = await getAuthContext(request);

  if (!user) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return Response.json(
      { error: "Conversation id is required." },
      { status: 400 }
    );
  }

  if (!(await userOwnsConversation(supabase, conversationId, user.id))) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select(SELECT_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json(
      { error: "Could not load messages." },
      { status: 500 }
    );
  }

  return Response.json({ messages: data || [] });
}

export async function POST(request) {
  const { supabase, user } = await getAuthContext(request);

  if (!user) {
    return unauthorized();
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : "";
  const role = typeof body.role === "string" ? body.role : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const attachments = normalizeAttachments(body.attachments);

  if (
    !conversationId ||
    !VALID_ROLES.has(role) ||
    (!content && attachments.length === 0)
  ) {
    return Response.json(
      { error: "Conversation id, role, and message content or attachments are required." },
      { status: 400 }
    );
  }

  if (!(await userOwnsConversation(supabase, conversationId, user.id))) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      attachments,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return Response.json(
      { error: "Could not save the message." },
      { status: 500 }
    );
  }

  return Response.json({ message: data }, { status: 201 });
}
