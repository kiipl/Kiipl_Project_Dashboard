import { config, integrationStatus } from "@/utils/leads/config";
import { run } from "@/utils/leads/http";
import { LANGUAGES } from "@/utils/leads/languages";

export async function GET() {
  return run(async () => ({
    integrations: integrationStatus(),
    languages: LANGUAGES,
    qualifyMinScore: config.qualifyMinScore,
    sheetUrl: config.google.sheetId ? `https://docs.google.com/spreadsheets/d/${config.google.sheetId}` : null,
    webhooks: config.baseUrl ? { ingest: `${config.baseUrl}/api/leads/ingest`, meta: `${config.baseUrl}/api/leads/webhooks/meta` } : null,
  }), { admin: true });
}
