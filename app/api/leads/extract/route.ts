import { run } from "@/utils/leads/http";
import { extractLeads } from "@/utils/leads/claude";
import { ingestMany } from "@/utils/leads/pipeline";

/* Admin: paste posts / comments / DMs / profile pages copied from any platform → Claude pulls out leads. */
export async function POST(request: Request) {
  return run(async () => {
    const { text, platform = "social", save = true } = await request.json();
    if (!text || String(text).trim().length < 10) throw new Error("Paste some social media content first.");
    if (String(text).length > 200_000) throw new Error("That is too much text for one pass — split it into smaller chunks.");
    const source = String(platform).toLowerCase();
    const leads = await extractLeads(String(text), source);
    if (!save) return { leads };
    const result = await ingestMany(leads.map((l) => ({ ...l, source, notes: l.intent_note, raw: { extracted_from: source } })));
    return { leads, ...result };
  }, { admin: true });
}
