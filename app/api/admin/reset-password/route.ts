import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Add SUPABASE_SERVICE_ROLE_KEY to enable admin resets." }, { status: 501 });
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { email, password } = await request.json();
  if (!email || !password || password.length < 6) return NextResponse.json({ error: "Provide an email and a password of at least 6 characters." }, { status: 400 });
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.listUsers();
  const target = data.users.find((candidate) => candidate.email?.toLowerCase() === String(email).toLowerCase());
  if (!target) return NextResponse.json({ error: "No user found with that email." }, { status: 404 });
  const result = await admin.auth.admin.updateUserById(target.id, { password });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
