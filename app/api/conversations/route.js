import { getAuthContext, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

const SELECT_COLUMNS = "id,title,created_at,updated_at";
const DEFAULT_CONVERSATION_TITLE = "New chat";

export async function GET(request) {
  const { supabase, user } = await getAuthContext(request);

  if (!user) {
    return unauthorized();
  }

  const { data, error } = await supabase
    .from("conversations")
    .select(SELECT_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json(
      { error: "Could not load conversations." },
      { status: 500 }
    );
  }

  return Response.json({ conversations: data || [] });
}

export async function POST(request) {
  const { supabase, user } = await getAuthContext(request);

  if (!user) {
    return unauthorized();
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : DEFAULT_CONVERSATION_TITLE;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return Response.json(
      { error: "Could not create a conversation." },
      { status: 500 }
    );
  }

  return Response.json({ conversation: data }, { status: 201 });
}

export async function PATCH(request) {
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

  const id = typeof body.id === "string" ? body.id : "";
  const updates = {};

  if (!id) {
    return Response.json({ error: "Conversation id is required." }, { status: 400 });
  }

  if (typeof body.title === "string") {
    updates.title = body.title.trim() || DEFAULT_CONVERSATION_TITLE;
  }

  if (typeof body.updated_at === "string") {
    updates.updated_at = body.updated_at;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return Response.json(
      { error: "Could not update the conversation." },
      { status: 500 }
    );
  }

  return Response.json({ conversation: data });
}
