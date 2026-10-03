import { config } from "@/utils/leads/config";
import { db, getLead, logEvent, updateLead, type LeadCall, type TranscriptTurn } from "@/utils/leads/db";
import { agentTurn, type AgentTurn } from "@/utils/leads/claude";
import { availableSlots, bookSlot } from "@/utils/leads/booking";
import { speakAndHangUp, speakAndListen, twiml, verifyTwilio, voiceUrl } from "@/utils/leads/twilio";

export const maxDuration = 30;

/* One conversational turn of the calling agent. Twilio posts here when the call is answered
   (start=1), after each spoken reply (SpeechResult) and when the caller stays silent (silent=1). */
export async function POST(request: Request) {
  const params = new URLSearchParams(await request.text());
  if (!verifyTwilio(request, params)) return new Response("Invalid signature", { status: 403 });
  const url = new URL(request.url);
  const callId = url.searchParams.get("callId") ?? "";

  const { data: call } = await db().from("lead_calls").select("*").eq("id", callId).maybeSingle<LeadCall>();
  const lead = call ? await getLead(call.lead_id) : null;
  if (!call || !lead) return twiml("<Hangup/>");

  const now = () => new Date().toISOString();
  const transcript: TranscriptTurn[] = [...call.transcript];
  let language = call.language;
  let silent = call.silent_turns;

  if (url.searchParams.get("start") && params.get("AnsweredBy")?.startsWith("machine")) {
    await db().from("lead_calls").update({ status: "voicemail" }).eq("id", call.id);
    await logEvent(lead.id, "call_voicemail", "Reached voicemail; hung up");
    return twiml("<Hangup/>");
  }
  if (url.searchParams.get("silent")) {
    silent++;
    transcript.push({ role: "lead", text: "[silence]", language, at: now() });
  } else if (params.get("SpeechResult")) {
    silent = 0;
    transcript.push({ role: "lead", text: params.get("SpeechResult")!, language, at: now() });
  }

  const agentTurns = transcript.filter((t) => t.role === "agent").length;
  const wrapUp = agentTurns >= config.twilio.maxTurns || silent >= 2;
  const nextUrl = voiceUrl("/api/voice/turn", { callId });
  const save = () => db().from("lead_calls").update({ transcript, language, silent_turns: silent, status: "in-progress" }).eq("id", call.id);

  let turn: AgentTurn;
  try {
    const slots = (await availableSlots(6, language).catch(() => [])) as { start: string; label: string }[];
    turn = await agentTurn(lead, transcript, slots, wrapUp);
    if (turn.action === "book" && turn.slot_start) {
      try {
        const appt = await bookSlot(lead, turn.slot_start, "call");
        transcript.push({ role: "agent", text: `[booked ${appt.label}]`, language, at: now() });
      } catch (e) {
        transcript.push({ role: "agent", text: `[booking failed: ${(e as Error).message} Offer another slot.]`, language, at: now() });
        turn = await agentTurn(lead, transcript, slots, wrapUp);
      }
    }
  } catch (e) {
    console.error("[leads] agent turn", e);
    await save();
    return speakAndHangUp("Sorry, we are having a technical problem. Our team will get back to you. Goodbye.", language);
  }

  language = turn.language;
  transcript.push({ role: "agent", text: turn.say, language, at: now() });
  await save();

  if (turn.action === "opt_out") {
    await updateLead(lead.id, { do_not_contact: true, status: "unsubscribed" });
    await logEvent(lead.id, "opted_out", "Asked not to be contacted during call");
    return speakAndHangUp(turn.say, language);
  }
  if (turn.action === "end" || wrapUp) return speakAndHangUp(turn.say, language);
  return speakAndListen(turn.say, language, nextUrl);
}
