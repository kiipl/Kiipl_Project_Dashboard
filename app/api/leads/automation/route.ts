import { run } from "@/utils/leads/http";
import { runAutomation } from "@/utils/leads/pipeline";

export const maxDuration = 300;

/* Admin "Run automation now" button — same loop the cron runs. */
export async function POST() {
  return run(runAutomation, { admin: true });
}
