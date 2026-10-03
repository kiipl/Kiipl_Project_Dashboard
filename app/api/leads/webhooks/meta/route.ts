import { after } from "next/server";
import { config } from "@/utils/leads/config";
import { unauthorized } from "@/utils/leads/http";
import { ingestLead } from "@/utils/leads/pipeline";
import { fetchMetaLead } from "@/utils/leads/sources";
import { hmac, safeEqual } from "@/utils/leads/tokens";

/* Meta webhook verification handshake (Facebook App → Webhooks → Page → leadgen). */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && config.meta.verifyToken && p.get("hub.verify_token") === config.meta.verifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return unauthorized();
}

/* New Facebook / Instagram lead-form submission → fetch the lead → ingest. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (config.meta.appSecret) {
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!safeEqual(`sha256=${hmac("sha256", config.meta.appSecret, raw)}`, signature)) return unauthorized();
  }
  const body = JSON.parse(raw || "{}");
  const ids: string[] = [];
  for (const entry of body.entry ?? []) for (const change of entry.changes ?? []) {
    if (change.field === "leadgen" && change.value?.leadgen_id) ids.push(String(change.value.leadgen_id));
  }
  // Acknowledge immediately; Meta retries slow webhooks.
  after(async () => {
    for (const id of ids) {
      try { await ingestLead(await fetchMetaLead(id)); } catch (e) { console.error("[leads] meta lead", id, e); }
    }
  });
  return new Response("EVENT_RECEIVED");
}
