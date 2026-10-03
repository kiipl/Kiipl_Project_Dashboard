import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";

export type Lead = {
  id: string;
  source: string;
  source_ref: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  language: string;
  profile_url: string | null;
  notes: string | null;
  raw: Record<string, unknown>;
  status: "new" | "contacted" | "booked" | "called" | "qualified" | "disqualified" | "unsubscribed";
  email_step: number;
  last_emailed_at: string | null;
  call_attempts: number;
  last_called_at: string | null;
  score: number | null;
  qualification: Record<string, unknown> | null;
  qualified_at: string | null;
  synced_to_sheet_at: string | null;
  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
};

export type TranscriptTurn = { role: "agent" | "lead"; text: string; language: string; at: string };

export type LeadCall = {
  id: string;
  lead_id: string;
  twilio_sid: string | null;
  language: string;
  status: string;
  transcript: TranscriptTurn[];
  silent_turns: number;
  summary: string | null;
  duration_seconds: number | null;
  created_at: string;
  ended_at: string | null;
};

let admin: SupabaseClient | null = null;

/* Service-role client for webhooks, cron and the call agent (no user session there). */
export const db = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Add SUPABASE_SERVICE_ROLE_KEY to run the lead engine.");
  admin ??= createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
};

/* Returns null when the signed-in user is an admin, otherwise an error tuple for the route to return. */
export const requireAdmin = async (): Promise<{ error: string; status: number } | null> => {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? null : { error: "Admin access required", status: 403 };
};

export const logEvent = async (leadId: string, type: string, detail?: string, payload: Record<string, unknown> = {}) => {
  await db().from("lead_events").insert({ lead_id: leadId, type, detail: detail ?? null, payload });
};

export const getLead = async (id: string): Promise<Lead | null> => {
  const { data } = await db().from("leads").select("*").eq("id", id).maybeSingle();
  return data as Lead | null;
};

export const updateLead = async (id: string, patch: Partial<Lead>) => {
  const { error } = await db().from("leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
};
