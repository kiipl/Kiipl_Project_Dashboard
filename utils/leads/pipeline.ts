import { config, integrationStatus } from "./config";
import { db, getLead, logEvent, updateLead, type Lead, type LeadCall } from "./db";
import { qualify, writeOutreachEmail } from "./claude";
import { fallbackEmail, sendLeadEmail } from "./email";
import { appendQualifiedLeads } from "./google";
import { startCall } from "./twilio";
import { languageInfo } from "./languages";

export type LeadInput = Partial<Pick<Lead, "source" | "source_ref" | "full_name" | "email" | "phone" | "company" | "title" | "location" | "language" | "profile_url" | "notes" | "raw">>;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);

export const normalizeEmail = (v: unknown) => {
  const e = clean(v)?.toLowerCase().replace(/^mailto:/, "") ?? null;
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};

export const normalizePhone = (v: unknown) => {
  const raw = clean(v);
  if (!raw) return null;
  const plus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (plus) return `+${digits}`;
  const cc = config.defaultCountryCode.replace(/\D/g, "");
  if (digits.length === 10) return `+${cc}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${cc}${digits.slice(1)}`;
  return digits.startsWith(cc) ? `+${digits}` : `+${cc}${digits}`;
};

/* Insert a lead, or merge into an existing one matched by email, phone or source id. */
export const ingestLead = async (input: LeadInput): Promise<{ lead: Lead; created: boolean } | null> => {
  const row = {
    source: clean(input.source)?.toLowerCase() ?? "manual",
    source_ref: clean(input.source_ref),
    full_name: clean(input.full_name),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    company: clean(input.company),
    title: clean(input.title),
    location: clean(input.location),
    language: languageInfo(clean(input.language) ?? config.defaultLanguage).code,
    profile_url: clean(input.profile_url),
    notes: clean(input.notes),
    raw: input.raw ?? {},
  };
  if (!row.email && !row.phone && !row.profile_url) return null;

  const filters = [
    row.email && `email.eq."${row.email.replace(/"/g, "")}"`,
    row.phone && `phone.eq."${row.phone}"`,
  ].filter(Boolean) as string[];
  let existing: Lead | null = null;
  if (filters.length) {
    const { data } = await db().from("leads").select("*").or(filters.join(",")).limit(1);
    existing = (data?.[0] as Lead) ?? null;
  }
  if (!existing && row.source_ref) {
    const { data } = await db().from("leads").select("*").eq("source", row.source).eq("source_ref", row.source_ref).maybeSingle();
    existing = data as Lead | null;
  }

  if (existing) {
    const patch: Partial<Lead> = {};
    (["full_name", "email", "phone", "company", "title", "location", "profile_url"] as const).forEach((k) => {
      if (!existing![k] && row[k]) patch[k] = row[k] as never;
    });
    if (row.notes && !existing.notes?.includes(row.notes)) patch.notes = [existing.notes, row.notes].filter(Boolean).join("\n");
    if (Object.keys(patch).length) await updateLead(existing.id, patch);
    await logEvent(existing.id, "captured_again", `Seen again via ${row.source}`, { source_ref: row.source_ref });
    return { lead: { ...existing, ...patch }, created: false };
  }

  const { data, error } = await db().from("leads").insert(row).select().single();
  if (error) throw new Error(error.message);
  await logEvent(data.id, "captured", `New lead from ${row.source}`, { source_ref: row.source_ref });
  return { lead: data as Lead, created: true };
};

export const ingestMany = async (inputs: LeadInput[]) => {
  const result = { created: 0, merged: 0, skipped: 0, errors: [] as string[] };
  for (const input of inputs) {
    try {
      const r = await ingestLead(input);
      if (!r) result.skipped++;
      else if (r.created) result.created++;
      else result.merged++;
    } catch (e) {
      result.errors.push((e as Error).message);
    }
  }
  return result;
};

const contactable = (lead: Lead) => !lead.do_not_contact && !["unsubscribed", "disqualified"].includes(lead.status);

/* ─── Email outreach ─── */
export const emailLead = async (lead: Lead) => {
  if (!contactable(lead)) throw new Error("Lead has opted out or is disqualified.");
  if (lead.email_step >= config.outreach.maxSteps) throw new Error("Email sequence already finished for this lead.");
  const step = lead.email_step;
  const content = integrationStatus().claude ? await writeOutreachEmail(lead, step) : fallbackEmail(lead, step);
  const messageId = await sendLeadEmail(lead, content);
  await updateLead(lead.id, {
    email_step: step + 1,
    last_emailed_at: new Date().toISOString(),
    ...(lead.status === "new" ? { status: "contacted" as const } : {}),
  });
  await logEvent(lead.id, "email_sent", `#${step + 1}: ${content.subject}`, { message_id: messageId, body: content.body });
};

/* ─── Calling ─── */
export const callLead = async (lead: Lead, language?: string) => {
  if (!contactable(lead)) throw new Error("Lead has opted out or is disqualified.");
  if (!lead.phone) throw new Error("Lead has no phone number.");
  const lang = languageInfo(language ?? lead.language).code;
  const { data: call, error } = await db().from("lead_calls").insert({ lead_id: lead.id, language: lang }).select().single();
  if (error) throw new Error(error.message);
  try {
    const sid = await startCall(lead.phone, call.id);
    await db().from("lead_calls").update({ twilio_sid: sid, status: "initiated" }).eq("id", call.id);
  } catch (e) {
    await db().from("lead_calls").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", call.id);
    throw e;
  }
  await updateLead(lead.id, { call_attempts: lead.call_attempts + 1, last_called_at: new Date().toISOString() });
  await logEvent(lead.id, "call_started", `Calling ${lead.phone} in ${languageInfo(lang).label}`, { call_id: call.id });
  return call.id as string;
};

/* ─── Qualification ─── */
export const qualifyLead = async (leadId: string) => {
  const lead = await getLead(leadId);
  if (!lead) throw new Error("Lead not found.");
  const [calls, events, appts] = await Promise.all([
    db().from("lead_calls").select("language, transcript").eq("lead_id", leadId).order("created_at"),
    db().from("lead_events").select("type, detail, created_at").eq("lead_id", leadId).order("created_at").limit(60),
    db().from("lead_appointments").select("id").eq("lead_id", leadId).eq("status", "scheduled"),
  ]);
  const result = await qualify(lead, {
    calls: (calls.data ?? []) as Pick<LeadCall, "language" | "transcript">[],
    events: events.data ?? [],
    booked: !!appts.data?.length,
  });
  const isQualified = result.qualified && result.score >= config.qualifyMinScore;
  const keepStatus = lead.status === "unsubscribed";
  await updateLead(leadId, {
    score: result.score,
    qualification: result,
    ...(keepStatus ? {} : { status: isQualified ? "qualified" : result.disqualify_reason ? "disqualified" : lead.status }),
    ...(isQualified && !lead.qualified_at ? { qualified_at: new Date().toISOString() } : {}),
  });
  await logEvent(leadId, isQualified ? "qualified" : "scored", `Score ${result.score}: ${result.summary}`, result);
  return { ...result, isQualified };
};

/* ─── Google Sheets ─── */
export const syncQualifiedToSheet = async () => {
  const { data, error } = await db().from("leads").select("*").eq("status", "qualified").is("synced_to_sheet_at", null).order("qualified_at").limit(200);
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as Lead[];
  if (!leads.length) return { synced: 0 };
  const { data: appts } = await db().from("lead_appointments").select("lead_id, starts_at, meet_link").in("lead_id", leads.map((l) => l.id)).eq("status", "scheduled");
  const q = (l: Lead, k: string) => String((l.qualification as Record<string, unknown> | null)?.[k] ?? "");
  const rows = leads.map((l) => {
    const a = appts?.find((x) => x.lead_id === l.id);
    return [
      l.id, l.qualified_at ?? "", l.score ?? "", l.full_name ?? "", l.email ?? "", l.phone ?? "", l.company ?? "", l.title ?? "",
      l.location ?? "", languageInfo(l.language).label, l.source, l.profile_url ?? "", l.status,
      q(l, "budget"), q(l, "authority"), q(l, "need"), q(l, "timeline"), q(l, "summary"), q(l, "next_step"),
      a ? `${a.starts_at}${a.meet_link ? ` ${a.meet_link}` : ""}` : "",
    ];
  });
  await appendQualifiedLeads(rows);
  const now = new Date().toISOString();
  await db().from("leads").update({ synced_to_sheet_at: now }).in("id", leads.map((l) => l.id));
  await Promise.all(leads.map((l) => logEvent(l.id, "synced_to_sheet", "Pushed to Google Sheets")));
  return { synced: leads.length };
};

/* ─── The automation loop (cron + "Run automation" button) ─── */
export const runAutomation = async () => {
  const status = integrationStatus();
  const report = { emailed: 0, called: 0, qualified: 0, synced: 0, errors: [] as string[] };
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

  if (status.email && status.signing) {
    const { data } = await db().from("leads").select("*").eq("do_not_contact", false).in("status", ["new", "contacted"]).not("email", "is", null)
      .lt("email_step", config.outreach.maxSteps).or(`last_emailed_at.is.null,last_emailed_at.lt."${daysAgo(config.outreach.followUpDays)}"`)
      .order("created_at").limit(config.outreach.batchSize);
    for (const lead of (data ?? []) as Lead[]) {
      try { await emailLead(lead); report.emailed++; } catch (e) { report.errors.push(`email ${lead.id}: ${(e as Error).message}`); }
    }
  }

  if (status.calling && config.outreach.autoCall) {
    // Leads with a phone that haven't booked after the email (or have no email at all).
    const { data } = await db().from("leads").select("*").eq("do_not_contact", false).in("status", ["new", "contacted"]).not("phone", "is", null)
      .lt("call_attempts", config.outreach.maxCallAttempts)
      .or(`last_called_at.is.null,last_called_at.lt."${daysAgo(1)}"`)
      .order("created_at").limit(config.outreach.batchSize * 4);
    const callAfter = Date.now() - config.outreach.callAfterDays * 86400_000;
    const due = ((data ?? []) as Lead[]).filter((l) => !l.email || (l.last_emailed_at && Date.parse(l.last_emailed_at) < callAfter)).slice(0, config.outreach.batchSize);
    for (const lead of due) {
      try { await callLead(lead); report.called++; } catch (e) { report.errors.push(`call ${lead.id}: ${(e as Error).message}`); }
    }
  }

  if (status.claude) {
    // Booked leads that have not been scored yet (called leads are scored when the call ends).
    const { data } = await db().from("leads").select("id").eq("status", "booked").is("score", null).limit(config.outreach.batchSize);
    for (const { id } of data ?? []) {
      try { if ((await qualifyLead(id)).isQualified) report.qualified++; } catch (e) { report.errors.push(`qualify ${id}: ${(e as Error).message}`); }
    }
  }

  if (status.sheets) {
    try { report.synced = (await syncQualifiedToSheet()).synced; } catch (e) { report.errors.push(`sheets: ${(e as Error).message}`); }
  }
  return report;
};
