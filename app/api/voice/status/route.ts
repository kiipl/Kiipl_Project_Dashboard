import { after } from "next/server";
import { integrationStatus } from "@/utils/leads/config";
import { db, getLead, logEvent, updateLead, type LeadCall } from "@/utils/leads/db";
import { qualifyLead, syncQualifiedToSheet } from "@/utils/leads/pipeline";
import { verifyTwilio } from "@/utils/leads/twilio";

export const maxDuration = 120;
const FINAL = ["completed", "busy", "no-answer", "failed", "canceled"];

/* Twilio call status callback. When a call finishes: store the outcome, qualify the lead
   from the transcript and push it to Google Sheets if it qualifies. */
export async function POST(request: Request) {
  const params = new URLSearchParams(await request.text());
  if (!verifyTwilio(request, params)) return new Response("Invalid signature", { status: 403 });
  const callId = new URL(request.url).searchParams.get("callId") ?? "";
  const status = params.get("CallStatus") ?? "unknown";

  const { data: call } = await db().from("lead_calls").select("*").eq("id", callId).maybeSingle<LeadCall>();
  if (!call) return new Response(null, { status: 204 });
  if (!FINAL.includes(status)) {
    if (call.status !== "voicemail") await db().from("lead_calls").update({ status }).eq("id", callId);
    return new Response(null, { status: 204 });
  }

  const spoke = call.transcript.some((t) => t.role === "lead" && t.text !== "[silence]");
  await db().from("lead_calls").update({
    status: call.status === "voicemail" ? "voicemail" : status,
    duration_seconds: Number(params.get("CallDuration") ?? 0) || null,
    ended_at: new Date().toISOString(),
  }).eq("id", callId);
  await logEvent(call.lead_id, "call_ended", `${status}${spoke ? ` · ${call.transcript.length} turns` : ""}`, { call_id: callId });

  if (spoke) {
    const lead = await getLead(call.lead_id);
    if (lead && ["new", "contacted"].includes(lead.status)) await updateLead(lead.id, { status: "called" });
    after(async () => {
      try {
        if (!integrationStatus().claude) return;
        const result = await qualifyLead(call.lead_id);
        await db().from("lead_calls").update({ summary: result.summary }).eq("id", callId);
        if (result.isQualified && integrationStatus().sheets) await syncQualifiedToSheet();
      } catch (e) {
        console.error("[leads] post-call", e);
      }
    });
  }
  return new Response(null, { status: 204 });
}
