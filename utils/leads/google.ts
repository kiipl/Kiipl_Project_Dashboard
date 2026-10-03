import { JWT } from "google-auth-library";
import { config } from "./config";
import type { Lead } from "./db";

const SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/spreadsheets"];
let jwt: JWT | null = null;

/* Calls a Google REST API as the service account (optionally impersonating a Workspace user). */
async function google<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!config.google.clientEmail || !config.google.privateKey) throw new Error("Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to use Google Calendar and Sheets.");
  jwt ??= new JWT({ email: config.google.clientEmail, key: config.google.privateKey, scopes: SCOPES, subject: config.google.impersonate || undefined });
  const { token } = await jwt.getAccessToken();
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google API ${res.status}: ${data?.error?.message ?? res.statusText}`);
  return data as T;
}

/* ─── Calendar ─── */
const calendarUrl = (path: string) => `https://www.googleapis.com/calendar/v3${path}`;

export const busyRanges = async (from: Date, to: Date): Promise<{ start: number; end: number }[]> => {
  const data = await google<{ calendars: Record<string, { busy: { start: string; end: string }[] }> }>(calendarUrl("/freeBusy"), {
    method: "POST",
    body: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: config.google.calendarId }] },
  });
  return (data.calendars?.[config.google.calendarId]?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
};

export const createMeeting = async (lead: Lead, start: Date, end: Date) => {
  // Attendee invites and Meet links need a Workspace user to impersonate; plain service accounts can only write the event.
  const withPeople = !!config.google.impersonate;
  const query = withPeople ? "?conferenceDataVersion=1&sendUpdates=all" : "";
  const event = await google<{ id: string; hangoutLink?: string; htmlLink: string }>(calendarUrl(`/calendars/${encodeURIComponent(config.google.calendarId)}/events${query}`), {
    method: "POST",
    body: {
      summary: `${config.business.name} × ${lead.company || lead.full_name || "Lead"} — intro call`,
      description: [`Lead: ${lead.full_name ?? ""}`, `Email: ${lead.email ?? ""}`, `Phone: ${lead.phone ?? ""}`, `Company: ${lead.company ?? ""}`, `Source: ${lead.source}`, lead.profile_url ? `Profile: ${lead.profile_url}` : ""].filter(Boolean).join("\n"),
      start: { dateTime: start.toISOString(), timeZone: config.booking.timezone },
      end: { dateTime: end.toISOString(), timeZone: config.booking.timezone },
      ...(withPeople && {
        attendees: lead.email ? [{ email: lead.email, displayName: lead.full_name ?? undefined }] : [],
        conferenceData: { createRequest: { requestId: `lead-${lead.id}-${start.getTime()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    },
  });
  return { id: event.id, meetLink: event.hangoutLink ?? null };
};

/* ─── Sheets ─── */
export const SHEET_HEADERS = [
  "Lead ID", "Qualified At", "Score", "Name", "Email", "Phone", "Company", "Title", "Location", "Language",
  "Source", "Profile URL", "Status", "Budget", "Authority", "Need", "Timeline", "Summary", "Next Step", "Appointment",
];

export const appendQualifiedLeads = async (rows: (string | number)[][]) => {
  const { sheetId, sheetTab } = config.google;
  if (!sheetId) throw new Error("Add GOOGLE_SHEET_ID to push qualified leads to Google Sheets.");
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  const range = (r: string) => encodeURIComponent(`'${sheetTab.replace(/'/g, "''")}'!${r}`);

  // Create the tab and header row on first use.
  const meta = await google<{ sheets: { properties: { title: string } }[] }>(`${base}?fields=sheets.properties.title`);
  if (!meta.sheets.some((s) => s.properties.title === sheetTab)) {
    await google(`${base}:batchUpdate`, { method: "POST", body: { requests: [{ addSheet: { properties: { title: sheetTab } } }] } });
  }
  const head = await google<{ values?: string[][] }>(`${base}/values/${range("A1:A1")}`);
  if (!head.values?.length) {
    await google(`${base}/values/${range("A1")}?valueInputOption=RAW`, { method: "PUT", body: { values: [SHEET_HEADERS] } });
  }
  await google(`${base}/values/${range("A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: { values: rows } });
};
