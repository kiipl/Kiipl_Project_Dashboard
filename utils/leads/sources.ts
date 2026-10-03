import { config } from "./config";
import type { LeadInput } from "./pipeline";

const GRAPH = "https://graph.facebook.com/v21.0";

/* ─── Meta Lead Ads (Facebook + Instagram lead forms) ─── */
export const fetchMetaLead = async (leadgenId: string): Promise<LeadInput> => {
  if (!config.meta.pageAccessToken) throw new Error("Add META_PAGE_ACCESS_TOKEN to fetch Facebook/Instagram leads.");
  const res = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,created_time,platform,ad_name,campaign_name,form_id&access_token=${encodeURIComponent(config.meta.pageAccessToken)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta Graph ${res.status}: ${data?.error?.message ?? "lead fetch failed"}`);
  const fields: Record<string, string> = {};
  for (const f of data.field_data ?? []) fields[String(f.name).toLowerCase()] = (f.values ?? []).join(", ");
  const pick = (...keys: string[]) => keys.map((k) => fields[k]).find(Boolean) ?? null;
  return {
    source: data.platform === "ig" ? "instagram" : "facebook",
    source_ref: leadgenId,
    full_name: pick("full_name", "name") ?? ([pick("first_name"), pick("last_name")].filter(Boolean).join(" ") || null),
    email: pick("email", "work_email"),
    phone: pick("phone_number", "phone", "work_phone_number"),
    company: pick("company_name", "company"),
    title: pick("job_title"),
    location: pick("city", "state", "country"),
    notes: [data.campaign_name && `Campaign: ${data.campaign_name}`, data.ad_name && `Ad: ${data.ad_name}`].filter(Boolean).join(" · ") || null,
    raw: data,
  };
};

/* ─── Generic mapping for scraper / automation output (Apify, PhantomBuster, Zapier, Make, CSV) ─── */
const get = (item: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const v = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), item);
    if (Array.isArray(v) && v.length) return typeof v[0] === "string" ? v[0] : (v[0] as Record<string, string>)?.value ?? (v[0] as Record<string, string>)?.email ?? null;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};

export const mapGenericItem = (item: Record<string, unknown>, source: string): LeadInput => {
  const first = get(item, ["firstName", "first_name"]);
  const last = get(item, ["lastName", "last_name"]);
  const url = get(item, ["profileUrl", "profile_url", "linkedinUrl", "url", "inputUrl", "ownerProfileUrl", "author.url"]);
  return {
    source: get(item, ["source", "platform"])?.toLowerCase() ?? source,
    source_ref: get(item, ["id", "source_ref", "profileId", "username", "ownerUsername", "publicIdentifier"]) ?? url,
    full_name: get(item, ["full_name", "fullName", "name", "ownerFullName", "author.name"]) ?? ([first, last].filter(Boolean).join(" ") || null),
    email: get(item, ["email", "emails", "businessEmail", "public_email", "contactEmail"]),
    phone: get(item, ["phone", "phoneNumber", "phone_number", "phones", "businessPhoneNumber", "contactPhoneNumber"]),
    company: get(item, ["company", "companyName", "company_name", "currentCompany", "businessName", "organization"]),
    title: get(item, ["title", "jobTitle", "job_title", "headline", "occupation", "businessCategoryName", "categoryName"]),
    location: get(item, ["location", "city", "address", "addressStreet", "geo"]),
    language: get(item, ["language", "lang"]) ?? undefined,
    profile_url: url,
    notes: get(item, ["notes", "text", "comment", "caption", "biography", "summary", "description"])?.slice(0, 500) ?? null,
    raw: item,
  };
};

export const fetchApifyDataset = async (datasetId: string, limit = 1000) => {
  if (!config.apifyToken) throw new Error("Add APIFY_TOKEN to import Apify datasets.");
  const res = await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=${limit}`, {
    headers: { Authorization: `Bearer ${config.apifyToken}` },
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>[];
};
