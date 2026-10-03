import { readToken } from "@/utils/leads/tokens";
import { getLead, logEvent, updateLead } from "@/utils/leads/db";

const page = (message: string, status = 200) =>
  new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font-family:Arial,sans-serif;display:grid;place-items:center;min-height:90vh;color:#102a43;background:#f5f7fa"><p style="background:#fff;padding:28px 32px;border-radius:14px;border:1px solid #e2e8f0">${message}</p></body>`, { status, headers: { "Content-Type": "text/html" } });

async function unsubscribe(request: Request) {
  const id = readToken(new URL(request.url).searchParams.get("token") ?? "", "unsub");
  const lead = id ? await getLead(id) : null;
  if (!lead) return page("This unsubscribe link is invalid or has expired.", 400);
  if (!lead.do_not_contact) {
    await updateLead(lead.id, { do_not_contact: true, status: "unsubscribed" });
    await logEvent(lead.id, "opted_out", "Unsubscribed via email link");
  }
  return page("You're unsubscribed. We won't contact you again.");
}

export const GET = unsubscribe;
export const POST = unsubscribe; // RFC 8058 one-click unsubscribe
