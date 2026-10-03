"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

/* ─── Types ─── */
type Lead = {
  id: string; source: string; full_name: string | null; email: string | null; phone: string | null;
  company: string | null; title: string | null; location: string | null; language: string; profile_url: string | null;
  notes: string | null; status: string; email_step: number; call_attempts: number; score: number | null;
  qualification: Record<string, any> | null; synced_to_sheet_at: string | null; do_not_contact: boolean;
  created_at: string; updated_at: string;
};
type Status = {
  integrations: Record<string, boolean>;
  languages: { code: string; label: string }[];
  qualifyMinScore: number;
  sheetUrl: string | null;
  webhooks: { ingest: string; meta: string } | null;
};
type Detail = {
  lead: Lead;
  events: { id: string; type: string; detail: string | null; created_at: string }[];
  calls: { id: string; language: string; status: string; transcript: { role: string; text: string; language: string }[]; summary: string | null; duration_seconds: number | null; created_at: string }[];
  appointments: { id: string; starts_at: string; meet_link: string | null; booked_via: string; status: string }[];
};

const STATUSES = ["new", "contacted", "booked", "called", "qualified", "disqualified", "unsubscribed"];
const PLATFORMS = ["linkedin", "instagram", "facebook", "twitter", "youtube", "whatsapp", "google_maps", "other"];
const INTEGRATION_LABELS: Record<string, string> = {
  database: "Database", claude: "Claude AI", email: "Email (SMTP)", calendar: "Google Calendar", sheets: "Google Sheets",
  calling: "Twilio calling", metaLeadAds: "Meta Lead Ads", apify: "Apify", signing: "Signed links",
};

/* ─── Icons ─── */
const Icon = ({ d, size = 15 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IMail = <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></>;
const IPhone = <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />;
const IStar = <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />;
const IOpen = <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>;
const IPlay = <polygon points="6 3 20 12 6 21 6 3" />;
const ISheet = <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="3" x2="12" y2="21" /></>;
const ISearch = <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>;
const IBack = <polyline points="15 18 9 12 15 6" />;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

async function api<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function LeadsDashboard() {
  const db = useMemo(() => createClient(), []);
  const [auth, setAuth] = useState<"loading" | "no" | "viewer" | "admin">("loading");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tab, setTab] = useState<"extract" | "import" | "manual" | "webhooks">("extract");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
  const openId = useRef<string | null>(null);

  const notify = (text: string, error = false) => { setToast({ text, error }); setTimeout(() => setToast(null), 5000); };

  const loadLeads = async () => {
    const { data, error } = await db.from("leads").select("*").order("created_at", { ascending: false }).limit(2000);
    if (error) notify(error.message, true);
    setLeads((data as Lead[]) || []);
    const appts = await db.from("lead_appointments").select("lead_id").eq("status", "scheduled");
    setBookedIds(new Set((appts.data || []).map((a) => a.lead_id as string)));
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) return setAuth("no");
      const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single();
      if (p?.role !== "admin") return setAuth("viewer");
      setAuth("admin");
      loadLeads();
      api<Status>("/api/leads/status").then(setStatus).catch((e) => notify(e.message, true));
    })();
  }, []);

  /* Runs an action with a busy flag + toast, then refreshes the list (and open drawer). */
  const act = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    try {
      const msg = await fn();
      if (msg) notify(msg);
      await loadLeads();
      if (openId.current) openDetail(openId.current);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };

  const openDetail = async (id: string) => {
    openId.current = id;
    try { setDetail(await api<Detail>(`/api/leads/${id}`)); } catch (e) { notify((e as Error).message, true); }
  };
  const closeDetail = () => { openId.current = null; setDetail(null); };

  const leadAction = (lead: Lead, action: string, extra: Record<string, unknown> = {}) => {
    if (action === "delete") closeDetail();
    return act(`${action}:${lead.id}`, async () => {
      const r = await api(`/api/leads/${lead.id}`, { action, ...extra });
      if (action === "email") return `Email sent to ${lead.email}`;
      if (action === "call") return `Calling ${lead.phone}…`;
      if (action === "qualify") return `Score ${r.score} — ${r.isQualified ? "qualified ✓" : "not qualified"}`;
      if (action === "book") return `Booked ${r.label}`;
      if (action === "update") return;
      return "Done";
    });
  };

  /* ─── Capture forms ─── */
  const submitExtract = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    act("extract", async () => {
      const r = await api("/api/leads/extract", { text: f.get("text"), platform: f.get("platform") });
      form.reset();
      return `Claude found ${r.leads.length} lead(s): ${r.created} new, ${r.merged} merged, ${r.skipped} without contact details`;
    });
  };
  const submitImport = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act("import", async () => {
      const r = await api("/api/leads/import", { apifyDatasetId: f.get("dataset"), source: f.get("source") });
      return `Imported: ${r.created} new, ${r.merged} merged, ${r.skipped} skipped`;
    });
  };
  const submitManual = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const lead = Object.fromEntries(new FormData(form));
    act("manual", async () => {
      const r = await api("/api/leads/import", { lead, source: lead.source || "manual" });
      form.reset();
      return r.created ? "Lead added" : r.merged ? "Merged into an existing lead" : "Add an email, phone or profile URL";
    });
  };

  /* ─── Derived ─── */
  const sources = Array.from(new Set(leads.map((l) => l.source))).sort();
  const visible = leads.filter((l) =>
    (!statusFilter || l.status === statusFilter) && (!sourceFilter || l.source === sourceFilter) &&
    [l.full_name, l.email, l.phone, l.company, l.title, l.location, l.notes].join(" ").toLowerCase().includes(q.toLowerCase()));
  const count = (pred: (l: Lead) => boolean) => leads.filter(pred).length;
  const funnel = [
    { label: "Captured", value: leads.length },
    { label: "Emailed", value: count((l) => l.email_step > 0) },
    { label: "Booked", value: count((l) => bookedIds.has(l.id)) },
    { label: "Called", value: count((l) => l.call_attempts > 0) },
    { label: "Qualified", value: count((l) => l.status === "qualified") },
    { label: "In Sheets", value: count((l) => !!l.synced_to_sheet_at) },
  ];
  const languages = status?.languages ?? [{ code: "en-IN", label: "English (India)" }];
  const can = (k: string) => !!status?.integrations[k];

  /* ─── Gates ─── */
  if (auth !== "admin") {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-brand"><div className="login-logo">K</div><h1>Lead engine</h1></div>
          <p className="login-loading">
            {auth === "loading" ? "Loading…" : auth === "no" ? "Sign in on the dashboard first." : "The lead engine is available to admins only."}
          </p>
          {auth !== "loading" && <Link className="login-btn" href="/">Go to dashboard</Link>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell soft">
      <header>
        <div>
          <p className="eyebrow">KIIPL GROWTH</p>
          <h1>Lead engine</h1>
        </div>
        <div className="header-actions">
          <Link className="icon-btn ghost" href="/" title="Back to site progress"><Icon d={IBack} /></Link>
          <button className="lead-btn" disabled={!!busy} onClick={() => act("auto", async () => {
            const r = await api("/api/leads/automation", {});
            return `Automation: ${r.emailed} emailed, ${r.called} called, ${r.qualified} qualified, ${r.synced} synced${r.errors.length ? ` · ${r.errors.length} error(s): ${r.errors[0]}` : ""}`;
          })}><Icon d={IPlay} size={13} /> {busy === "auto" ? "Running…" : "Run automation"}</button>
          <button className="lead-btn secondary" disabled={!!busy || !can("sheets")} title={can("sheets") ? "Push qualified leads to Google Sheets" : "Configure Google Sheets first"}
            onClick={() => act("sync", async () => `Pushed ${(await api("/api/leads/sync", {})).synced} lead(s) to Google Sheets`)}>
            <Icon d={ISheet} size={13} /> {busy === "sync" ? "Syncing…" : "Sync to Sheets"}
          </button>
          {status?.sheetUrl && <a className="icon-btn ghost" href={status.sheetUrl} target="_blank" rel="noreferrer" title="Open Google Sheet"><Icon d={IOpen} /></a>}
          <span className="role">Admin</span>
        </div>
      </header>

      {status && (
        <section className="integrations">
          {Object.entries(status.integrations).map(([k, ok]) => (
            <span key={k} className={`chip ${ok ? "ok" : "off"}`} title={ok ? "Configured" : "Not configured — see README → Lead engine"}>{ok ? "●" : "○"} {INTEGRATION_LABELS[k] ?? k}</span>
          ))}
        </section>
      )}

      <section className="funnel">
        {funnel.map((f) => (
          <div key={f.label} className="stat"><span>{f.label}</span><strong>{f.value}</strong></div>
        ))}
      </section>

      {/* Capture */}
      <section className="capture-card">
        <div className="tabs">
          {([["extract", "AI extract from social"], ["import", "Import scraper data"], ["manual", "Add manually"], ["webhooks", "Auto-capture webhooks"]] as const).map(([k, label]) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {tab === "extract" && (
          <form className="capture-form" onSubmit={submitExtract}>
            <p className="modal-sub">Paste posts, comment threads, DMs, group member lists or profile pages copied from any platform. Claude picks out people showing buying intent and only keeps contact details that actually appear in the text.</p>
            <div className="capture-row">
              <label className="field">Platform<select name="platform">{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></label>
            </div>
            <textarea name="text" required rows={7} placeholder={"e.g. \"We're starting 3 new highway sites in Pune next quarter and need better progress reporting — ping me at rahul@abcinfra.in\" — Rahul Mehta, Project Director, ABC Infra"} />
            <div className="modal-actions"><button disabled={!!busy || !can("claude")}>{busy === "extract" ? "Extracting…" : "Extract leads"}</button></div>
          </form>
        )}
        {tab === "import" && (
          <form className="capture-form" onSubmit={submitImport}>
            <p className="modal-sub">Run any Apify actor (Instagram comments, LinkedIn search, X/Twitter search, Facebook groups, Google Maps…) and paste the dataset ID. Common fields like name, email, phone, company and profile URL are mapped automatically and duplicates are merged.</p>
            <div className="capture-row">
              <label className="field">Apify dataset ID<input name="dataset" required placeholder="e.g. a1B2c3D4e5F6g7H8i" /></label>
              <label className="field">Source<select name="source">{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></label>
            </div>
            <div className="modal-actions"><button disabled={!!busy || !can("apify")}>{busy === "import" ? "Importing…" : "Import dataset"}</button></div>
          </form>
        )}
        {tab === "manual" && (
          <form className="capture-form" onSubmit={submitManual}>
            <div className="capture-grid">
              <label className="field">Full name<input name="full_name" /></label>
              <label className="field">Email<input name="email" type="email" /></label>
              <label className="field">Phone<input name="phone" placeholder="+91…" /></label>
              <label className="field">Company<input name="company" /></label>
              <label className="field">Title<input name="title" /></label>
              <label className="field">Profile URL<input name="profile_url" /></label>
              <label className="field">Source<select name="source">{["manual", ...PLATFORMS].map((p) => <option key={p}>{p}</option>)}</select></label>
              <label className="field">Language<select name="language">{languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
            </div>
            <div className="modal-actions"><button disabled={!!busy}>Add lead</button></div>
          </form>
        )}
        {tab === "webhooks" && (
          <div className="capture-form webhook-help">
            <p><strong>Facebook &amp; Instagram Lead Ads</strong> — subscribe your Page to the <code>leadgen</code> webhook with this callback URL. New form submissions arrive instantly.</p>
            <code className="url">{status?.webhooks?.meta ?? "Set PUBLIC_BASE_URL to see the URL"}</code>
            <p><strong>LinkedIn Lead Gen Forms, website forms, Zapier, Make, n8n, PhantomBuster</strong> — POST JSON (one lead, an array, or <code>{"{ source, leads: [...] }"}</code>) with header <code>x-leads-secret</code>.</p>
            <code className="url">{status?.webhooks?.ingest ?? "Set PUBLIC_BASE_URL to see the URL"}</code>
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="top-bar">
        <div className="search-box"><Icon d={ISearch} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" /></div>
        <select className="screen-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="screen-select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}
        </select>
      </section>

      {/* Table */}
      <section className="table-card">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Lead</th><th>Contact</th><th>Source</th><th>Language</th><th>Status</th><th>Score</th><th>Activity</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={8} className="empty-row">No leads yet — capture some above.</td></tr>}
              {visible.map((l) => (
                <tr key={l.id}>
                  <td>
                    <button className="link-btn" onClick={() => openDetail(l.id)}>{l.full_name || l.email || l.phone || "Unnamed"}</button>
                    <span className="sub">{[l.title, l.company].filter(Boolean).join(" · ") || "—"}</span>
                  </td>
                  <td><span className="cell-text">{l.email || "—"}</span><span className="sub">{l.phone || ""}</span></td>
                  <td><span className="pill source">{l.source}</span></td>
                  <td>
                    <select className="mini-select" value={l.language} disabled={!!busy} onChange={(e) => leadAction(l, "update", { patch: { language: e.target.value } })} title="Language for emails and calls">
                      {languages.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                    </select>
                  </td>
                  <td><span className={`pill st-${l.status}`}>{l.status}</span>{l.synced_to_sheet_at && <span className="sub">in Sheets</span>}</td>
                  <td>{l.score ?? "—"}</td>
                  <td><span className="sub">{l.email_step} email(s) · {l.call_attempts} call(s)</span><span className="sub">{fmt(l.updated_at)}</span></td>
                  <td className="lead-actions">
                    <button className="icon-btn ghost mini" title={l.email ? "Send next outreach email" : "No email"} disabled={!l.email || l.do_not_contact || !can("email") || !!busy}
                      onClick={() => leadAction(l, "email")}><Icon d={IMail} size={13} /></button>
                    <button className="icon-btn ghost mini" title={l.phone ? "Call with the AI agent" : "No phone"} disabled={!l.phone || l.do_not_contact || !can("calling") || !!busy}
                      onClick={() => leadAction(l, "call")}><Icon d={IPhone} size={13} /></button>
                    <button className="icon-btn ghost mini" title="Qualify with Claude" disabled={!can("claude") || !!busy}
                      onClick={() => leadAction(l, "qualify")}><Icon d={IStar} size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail && <LeadDrawer detail={detail} busy={busy} languages={languages} onClose={closeDetail} onAction={leadAction} notify={notify} />}
      {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.text}</div>}
    </main>
  );
}

/* ─── Lead detail drawer ─── */
function LeadDrawer({ detail, busy, languages, onClose, onAction, notify }: {
  detail: Detail; busy: string; languages: { code: string; label: string }[];
  onClose: () => void; onAction: (lead: Lead, action: string, extra?: Record<string, unknown>) => Promise<void>;
  notify: (t: string, e?: boolean) => void;
}) {
  const { lead, events, calls, appointments } = detail;
  const [slots, setSlots] = useState<{ start: string; label: string }[] | null>(null);
  const [slot, setSlot] = useState("");
  const qa = lead.qualification;

  const loadSlots = async () => {
    try { const r = await api(`/api/leads/${lead.id}`, { action: "slots" }); setSlots(r.slots); setSlot(r.slots[0]?.start ?? ""); }
    catch (e) { notify((e as Error).message, true); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2>{lead.full_name || lead.email || "Lead"}</h2>
            <p className="modal-sub">{[lead.title, lead.company, lead.location].filter(Boolean).join(" · ")}</p>
          </div>
          <button className="icon-btn ghost" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="kv">
          <span>Email</span><b>{lead.email || "—"}</b>
          <span>Phone</span><b>{lead.phone || "—"}</b>
          <span>Source</span><b>{lead.source}</b>
          <span>Language</span><b>{languages.find((l) => l.code === lead.language)?.label ?? lead.language}</b>
          <span>Status</span><b><span className={`pill st-${lead.status}`}>{lead.status}</span></b>
          {lead.profile_url && <><span>Profile</span><b><a href={lead.profile_url} target="_blank" rel="noreferrer">{lead.profile_url}</a></b></>}
          {lead.notes && <><span>Notes</span><b className="pre">{lead.notes}</b></>}
        </div>

        {qa && (
          <div className="panel">
            <h3>Qualification · {lead.score}/100</h3>
            <p>{qa.summary}</p>
            <div className="kv">
              <span>Budget</span><b>{qa.budget}</b><span>Authority</span><b>{qa.authority}</b>
              <span>Need</span><b>{qa.need}</b><span>Timeline</span><b>{qa.timeline}</b>
              <span>Next step</span><b>{qa.next_step}</b>
              {qa.disqualify_reason && <><span>Not a fit</span><b>{qa.disqualify_reason}</b></>}
            </div>
          </div>
        )}

        <div className="panel">
          <h3>Appointments</h3>
          {appointments.length === 0 && <p className="modal-sub">None booked yet.</p>}
          {appointments.map((a) => (
            <p key={a.id}>{fmt(a.starts_at)} · via {a.booked_via} · {a.status}{a.meet_link && <> · <a href={a.meet_link} target="_blank" rel="noreferrer">Meet link</a></>}</p>
          ))}
          {slots === null ? (
            <button className="secondary" onClick={loadSlots}>Book a slot for this lead</button>
          ) : (
            <div className="capture-row">
              <select className="screen-select" value={slot} onChange={(e) => setSlot(e.target.value)}>
                {slots.map((s) => <option key={s.start} value={s.start}>{s.label}</option>)}
              </select>
              <button disabled={!slot || !!busy} onClick={() => onAction(lead, "book", { start: slot })}>Book</button>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>Calls</h3>
          {calls.length === 0 && <p className="modal-sub">No calls yet.</p>}
          {calls.map((c) => (
            <details key={c.id} className="call">
              <summary>{fmt(c.created_at)} · {languages.find((l) => l.code === c.language)?.label ?? c.language} · {c.status}{c.duration_seconds ? ` · ${c.duration_seconds}s` : ""}</summary>
              {c.summary && <p className="modal-sub">{c.summary}</p>}
              {c.transcript.map((t, i) => <p key={i} className={`turn ${t.role}`}><b>{t.role === "agent" ? "Agent" : "Lead"}:</b> {t.text}</p>)}
            </details>
          ))}
        </div>

        <div className="panel">
          <h3>Timeline</h3>
          {events.map((e) => <p key={e.id} className="event"><span>{fmt(e.created_at)}</span> <b>{e.type.replace(/_/g, " ")}</b> {e.detail}</p>)}
        </div>

        <div className="modal-actions">
          {!lead.do_not_contact && <button className="secondary" disabled={!!busy} onClick={() => onAction(lead, "dnc")}>Mark do-not-contact</button>}
          <button className="secondary danger-text" disabled={!!busy} onClick={() => { if (confirm("Delete this lead and its history?")) onAction(lead, "delete"); }}>Delete lead</button>
        </div>
      </aside>
    </div>
  );
}
