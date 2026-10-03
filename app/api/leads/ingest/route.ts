import { config } from "@/utils/leads/config";
import { run, unauthorized } from "@/utils/leads/http";
import { ingestMany } from "@/utils/leads/pipeline";
import { mapGenericItem } from "@/utils/leads/sources";
import { safeEqual } from "@/utils/leads/tokens";

/* Generic capture webhook for Zapier / Make / n8n / PhantomBuster / LinkedIn Lead Gen Forms / website forms.
   POST JSON: a lead object, an array of them, or { source, leads: [...] }. Auth: header `x-leads-secret`. */
export async function POST(request: Request) {
  const secret = request.headers.get("x-leads-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
  if (!config.ingestSecret || !safeEqual(secret, config.ingestSecret)) return unauthorized();
  return run(async () => {
    const body = await request.json();
    const source = String(body?.source ?? new URL(request.url).searchParams.get("source") ?? "webhook");
    const items: Record<string, unknown>[] = Array.isArray(body) ? body : Array.isArray(body?.leads) ? body.leads : [body];
    return ingestMany(items.slice(0, 1000).map((item) => mapGenericItem(item, source)));
  });
}
