import { config } from "@/utils/leads/config";
import { run, unauthorized } from "@/utils/leads/http";
import { runAutomation } from "@/utils/leads/pipeline";
import { safeEqual } from "@/utils/leads/tokens";

export const maxDuration = 300;

/* Scheduled by vercel.json (Vercel sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: Request) {
  if (!config.cronSecret || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${config.cronSecret}`)) return unauthorized();
  return run(runAutomation);
}
