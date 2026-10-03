import { run } from "@/utils/leads/http";
import { ingestMany } from "@/utils/leads/pipeline";
import { fetchApifyDataset, mapGenericItem } from "@/utils/leads/sources";

/* Admin: import scraper output (an Apify dataset id) or raw rows (e.g. a parsed CSV), or add one lead by hand. */
export async function POST(request: Request) {
  return run(async () => {
    const body = await request.json();
    const source = String(body.source || "manual").toLowerCase();
    const items: Record<string, unknown>[] = body.apifyDatasetId
      ? await fetchApifyDataset(String(body.apifyDatasetId).trim())
      : Array.isArray(body.items) ? body.items : body.lead ? [body.lead] : [];
    if (!items.length) throw new Error("Nothing to import.");
    return ingestMany(items.map((item) => mapGenericItem(item, source)));
  }, { admin: true });
}
