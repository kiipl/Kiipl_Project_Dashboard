import { config } from "./config";
import { hmac, safeEqual } from "./tokens";
import { languageInfo } from "./languages";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const voiceUrl = (path: string, params: Record<string, string>) => `${config.baseUrl}${path}?${new URLSearchParams(params)}`;

/* Starts an outbound call; Twilio then fetches TwiML from /api/voice/turn. */
export const startCall = async (to: string, callId: string) => {
  const { accountSid, authToken, from } = config.twilio;
  if (!accountSid || !authToken || !from || !config.baseUrl) throw new Error("Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER and PUBLIC_BASE_URL to place calls.");
  const body = new URLSearchParams({
    To: to,
    From: from,
    Url: voiceUrl("/api/voice/turn", { callId, start: "1" }),
    StatusCallback: voiceUrl("/api/voice/status", { callId }),
    StatusCallbackMethod: "POST",
    Record: "true",
    MachineDetection: "Enable",
  });
  ["initiated", "ringing", "answered", "completed"].forEach((e) => body.append("StatusCallbackEvent", e));
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? "call failed"}`);
  return data.sid as string;
};

/* Verifies X-Twilio-Signature: HMAC-SHA1 over the full URL plus the sorted POST params. */
export const verifyTwilio = (request: Request, params: URLSearchParams) => {
  if (!config.twilio.authToken) return false;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = new URL(request.url);
  const publicUrl = `${config.baseUrl}${url.pathname}${url.search}`;
  const payload = publicUrl + [...params.keys()].sort().map((k) => k + params.getAll(k).join("")).join("");
  return safeEqual(hmac("sha1", config.twilio.authToken, payload, "base64"), signature);
};

/* TwiML: speak, then listen for speech in the given language and post it back to the next turn. */
export const speakAndListen = (text: string, language: string, nextUrl: string) => {
  const lang = languageInfo(language);
  return twiml(
    `<Gather input="speech" language="${lang.code}" speechTimeout="auto" timeout="6" action="${xml(nextUrl)}" method="POST">` +
      `<Say voice="${lang.voice}" language="${lang.code}">${xml(text)}</Say>` +
    `</Gather>` +
    `<Redirect method="POST">${xml(nextUrl + "&silent=1")}</Redirect>`,
  );
};

export const speakAndHangUp = (text: string, language: string) => {
  const lang = languageInfo(language);
  return twiml(`<Say voice="${lang.voice}" language="${lang.code}">${xml(text)}</Say><Hangup/>`);
};

export const twiml = (inner: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "Content-Type": "text/xml" } });
