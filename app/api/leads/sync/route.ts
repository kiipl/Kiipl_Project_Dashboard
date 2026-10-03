import { run } from "@/utils/leads/http";
import { syncQualifiedToSheet } from "@/utils/leads/pipeline";

export async function POST() {
  return run(syncQualifiedToSheet, { admin: true });
}
