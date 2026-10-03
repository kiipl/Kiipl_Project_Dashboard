import { config, integrationStatus } from "./config";
import { busyRanges, createMeeting } from "./google";
import { db, logEvent, updateLead, type Lead } from "./db";

/* Offset (ms) of `timeZone` from UTC at the given instant. */
const tzOffset = (at: number, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at;
};

/* UTC instant for a wall-clock time in `timeZone`. */
const zoned = (y: number, m: number, d: number, h: number, min: number, timeZone: string) => {
  const guess = Date.UTC(y, m, d, h, min);
  const first = guess - tzOffset(guess, timeZone);
  return guess - tzOffset(first, timeZone);
};

export const formatSlot = (start: number, language = "en-IN") =>
  new Intl.DateTimeFormat(language, { timeZone: config.booking.timezone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(start));
const formatPart = (start: number, language: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(language, { timeZone: config.booking.timezone, ...opts }).format(new Date(start));

/* Free slots over the next few working days, minus anything busy on the Google Calendar and already-booked leads. */
export const availableSlots = async (limit = 40, language = "en-IN") => {
  const { timezone, startHour, endHour, slotMinutes, days, workdays } = config.booking;
  const now = Date.now();
  const minStart = now + 2 * 3600_000; // at least 2h notice
  const slotMs = slotMinutes * 60_000;
  const candidates: number[] = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(now + i * 86400_000);
    const local = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(day).map((p) => [p.type, p.value]));
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(local.weekday);
    if (!workdays.includes(weekday)) continue;
    for (let t = startHour * 60; t + slotMinutes <= endHour * 60; t += slotMinutes) {
      const start = zoned(+local.year, +local.month - 1, +local.day, Math.floor(t / 60), t % 60, timezone);
      if (start >= minStart && !candidates.includes(start)) candidates.push(start);
    }
  }
  if (!candidates.length) return [];

  const from = new Date(candidates[0]);
  const to = new Date(candidates[candidates.length - 1] + slotMs);
  const busy: { start: number; end: number }[] = [];
  if (integrationStatus().calendar) busy.push(...(await busyRanges(from, to)));
  const { data: booked } = await db().from("lead_appointments").select("starts_at, ends_at").eq("status", "scheduled").gte("ends_at", from.toISOString());
  (booked ?? []).forEach((b) => busy.push({ start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) }));

  return candidates
    .filter((s) => !busy.some((b) => s < b.end && s + slotMs > b.start))
    .slice(0, limit)
    .map((s) => ({
      start: new Date(s).toISOString(),
      label: formatSlot(s, language),
      day: formatPart(s, language, { weekday: "long", day: "numeric", month: "long" }),
      time: formatPart(s, language, { hour: "numeric", minute: "2-digit" }),
    }));
};

/* Books a slot: Google Calendar event (when configured) + appointment row + lead status. */
export const bookSlot = async (lead: Lead, startIso: string, via: "email" | "call" | "admin") => {
  const start = Date.parse(startIso);
  const slots = await availableSlots(500);
  if (!Number.isFinite(start) || !slots.some((s) => Date.parse(s.start) === start)) throw new Error("That time is no longer available. Please pick another slot.");
  const end = start + config.booking.slotMinutes * 60_000;

  let meeting: { id: string | null; meetLink: string | null } = { id: null, meetLink: null };
  if (integrationStatus().calendar) meeting = await createMeeting(lead, new Date(start), new Date(end));

  const { data, error } = await db().from("lead_appointments").insert({
    lead_id: lead.id, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(),
    calendar_event_id: meeting.id, meet_link: meeting.meetLink, booked_via: via,
  }).select().single();
  if (error) throw new Error(error.message);
  if (!["qualified", "disqualified", "unsubscribed"].includes(lead.status)) await updateLead(lead.id, { status: "booked" });
  await logEvent(lead.id, "appointment_booked", `${formatSlot(start)} via ${via}`, { appointment_id: data.id, meet_link: meeting.meetLink });
  return { ...data, label: formatSlot(start, lead.language) } as { id: string; starts_at: string; meet_link: string | null; label: string };
};
