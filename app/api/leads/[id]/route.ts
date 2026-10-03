import { run } from "@/utils/leads/http";
import { db, getLead, logEvent, updateLead } from "@/utils/leads/db";
import { callLead, emailLead, normalizeEmail, normalizePhone, qualifyLead } from "@/utils/leads/pipeline";
import { availableSlots, bookSlot } from "@/utils/leads/booking";

type Ctx = { params: Promise<{ id: string }> };

/* Admin: lead detail — timeline, calls, appointments and open slots. */
export async function GET(_request: Request, { params }: Ctx) {
  return run(async () => {
    const { id } = await params;
    const lead = await getLead(id);
    if (!lead) throw new Error("Lead not found.");
    const [events, calls, appointments] = await Promise.all([
      db().from("lead_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      db().from("lead_calls").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      db().from("lead_appointments").select("*").eq("lead_id", id).order("starts_at", { ascending: false }),
    ]);
    return { lead, events: events.data ?? [], calls: calls.data ?? [], appointments: appointments.data ?? [] };
  }, { admin: true });
}

/* Admin actions on one lead: email | call | qualify | book | slots | dnc | update | delete */
export async function POST(request: Request, { params }: Ctx) {
  return run(async () => {
    const { id } = await params;
    const body = await request.json();
    const lead = await getLead(id);
    if (!lead) throw new Error("Lead not found.");
    switch (body.action) {
      case "email": await emailLead(lead); return { ok: true };
      case "call": return { callId: await callLead(lead, body.language) };
      case "qualify": return qualifyLead(id);
      case "slots": return { slots: await availableSlots(30, lead.language) };
      case "book": return bookSlot(lead, String(body.start), "admin");
      case "dnc":
        await updateLead(id, { do_not_contact: true, status: "unsubscribed" });
        await logEvent(id, "opted_out", "Marked do-not-contact by admin");
        return { ok: true };
      case "update": {
        const allowed = ["full_name", "email", "phone", "company", "title", "location", "language", "notes", "status"] as const;
        const patch = Object.fromEntries(allowed.filter((k) => k in body.patch && (body.patch[k] || !["language", "status"].includes(k))).map((k) => [k, body.patch[k] || null]));
        if ("email" in patch) patch.email = normalizeEmail(patch.email);
        if ("phone" in patch) patch.phone = normalizePhone(patch.phone);
        await updateLead(id, patch);
        return { ok: true };
      }
      case "delete": await db().from("leads").delete().eq("id", id); return { ok: true };
      default: throw new Error("Unknown action.");
    }
  }, { admin: true });
}
