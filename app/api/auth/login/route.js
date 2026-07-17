import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { normalizeEmail, validateEmail } from "@/lib/validation";

export const runtime = "nodejs";

const INVALID_CREDENTIALS = "Invalid email or password";

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!validateEmail(email) || !password) {
    return NextResponse.json(
      { error: INVALID_CREDENTIALS },
      { status: 401 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: INVALID_CREDENTIALS },
      { status: 401 }
    );
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
}
