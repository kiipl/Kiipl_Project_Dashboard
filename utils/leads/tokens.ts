import { createHmac, timingSafeEqual } from "crypto";
import { config } from "./config";

/* Signed, expiring tokens for links we put in emails (booking, unsubscribe). Format: leadId.purpose.exp.sig */
const sign = (body: string) => {
  if (!config.signingSecret) throw new Error("Add LEADS_SIGNING_SECRET to generate booking and unsubscribe links.");
  return createHmac("sha256", config.signingSecret).update(body).digest("base64url");
};

export const makeToken = (leadId: string, purpose: "book" | "unsub", days = 30) => {
  const body = `${leadId}.${purpose}.${Math.floor(Date.now() / 1000) + days * 86400}`;
  return `${body}.${sign(body)}`;
};

export const readToken = (token: string, purpose: "book" | "unsub"): string | null => {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[1] !== purpose) return null;
  const body = parts.slice(0, 3).join(".");
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(parts[2]) * 1000 < Date.now()) return null;
  return parts[0];
};

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const hmac = (algo: "sha1" | "sha256", secret: string, data: string | Buffer, encoding: "hex" | "base64" = "hex") =>
  createHmac(algo, secret).update(data).digest(encoding);
