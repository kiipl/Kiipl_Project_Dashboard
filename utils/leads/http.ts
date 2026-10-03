import { NextResponse } from "next/server";
import { requireAdmin } from "./db";

/* Runs a route body with an optional admin check and turns thrown errors into JSON responses. */
export const run = async (fn: () => Promise<unknown>, opts: { admin?: boolean } = {}): Promise<Response> => {
  try {
    if (opts.admin) {
      const denied = await requireAdmin();
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
    }
    const result = await fn();
    return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
  } catch (e) {
    console.error("[leads]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
};

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
