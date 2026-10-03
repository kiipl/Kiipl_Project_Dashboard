import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";
import { makeToken } from "./tokens";
import type { Lead } from "./db";

let transport: Transporter | null = null;

export const bookingUrl = (leadId: string) => `${config.baseUrl}/book/${makeToken(leadId, "book")}`;
export const unsubscribeUrl = (leadId: string) => `${config.baseUrl}/api/leads/unsubscribe?token=${makeToken(leadId, "unsub", 365)}`;

/* Static copy used when Claude is not configured. */
export const fallbackEmail = (lead: Lead, step: number) => ({
  subject: step === 0 ? `Quick question for ${lead.company || lead.full_name || "you"}` : `Following up — ${config.business.name}`,
  body:
    `Hi ${lead.full_name?.split(" ")[0] || "there"},\n\n` +
    (step === 0 ? `${config.business.pitch}\n\nWould a 30-minute call this week be useful? ` : "Just floating my earlier note back to the top of your inbox. ") +
    `Pick any time that suits you below.\n\n${config.business.agentName}, ${config.business.name}`,
});

export const sendLeadEmail = async (lead: Lead, content: { subject: string; body: string }) => {
  const { host, port, user, pass, from, replyTo } = config.smtp;
  if (!host || !from) throw new Error("Add SMTP_HOST and EMAIL_FROM (plus SMTP_USER / SMTP_PASS) to send emails.");
  if (!config.baseUrl) throw new Error("Add PUBLIC_BASE_URL so emails can include a booking link.");
  if (!lead.email) throw new Error("Lead has no email address.");
  transport ??= nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });

  const book = bookingUrl(lead.id);
  const unsub = unsubscribeUrl(lead.id);
  const text = `${content.body}\n\nBook a time: ${book}\n\n—\nDon't want these emails? Unsubscribe: ${unsub}`;
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#102a43">` +
    escape(content.body).replace(/\n/g, "<br>") +
    `<p><a href="${book}" style="display:inline-block;background:#0b2942;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Book a time</a></p>` +
    `<p style="font-size:11px;color:#627d98">Don't want these emails? <a href="${unsub}" style="color:#627d98">Unsubscribe</a></p></div>`;

  const info = await transport.sendMail({
    from, to: lead.email, replyTo: replyTo || undefined, subject: content.subject, text, html,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  return info.messageId as string;
};
