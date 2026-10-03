import { run } from "@/utils/leads/http";
import { readToken } from "@/utils/leads/tokens";
import { getLead } from "@/utils/leads/db";
import { availableSlots, bookSlot } from "@/utils/leads/booking";
import { config } from "@/utils/leads/config";

const leadFromToken = async (token: string | null) => {
  const id = token ? readToken(token, "book") : null;
  const lead = id ? await getLead(id) : null;
  if (!lead) throw new Error("This booking link is invalid or has expired.");
  return lead;
};

/* Public: open slots for the lead behind a signed booking link. */
export async function GET(request: Request) {
  return run(async () => {
    const lead = await leadFromToken(new URL(request.url).searchParams.get("token"));
    return {
      name: lead.full_name?.split(" ")[0] ?? null,
      business: config.business.name,
      timezone: config.booking.timezone,
      minutes: config.booking.slotMinutes,
      slots: await availableSlots(60, lead.language),
    };
  });
}

/* Public: book one of those slots. */
export async function POST(request: Request) {
  return run(async () => {
    const { token, start } = await request.json();
    const lead = await leadFromToken(token);
    const appt = await bookSlot(lead, String(start), "email");
    return { label: appt.label, meetLink: appt.meet_link };
  });
}
