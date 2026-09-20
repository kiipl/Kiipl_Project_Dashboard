"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import { compressImage } from "@/utils/compress";
import * as XLSX from "xlsx";

/* ─── Types ─── */
type C = { id: string; key: string; label: string; data_type: string; position: number };
type S = { id: string; screen_id: string; values: Record<string, any> };
type Screen = { id: string; name: string };
type MediaJob = {
  id: string;
  file: File;
  status: "queued" | "compressing" | "uploading" | "ready" | "error";
  url: string;
  error: string;
  orig: number;
  fin: number;
  ratio: number;
  compressed: boolean;
};

const ProductChart = dynamic(() => import("@/components/product-chart"), {
  ssr: false,
  loading: () => <div className="real-chart" />,
});

/* ─── Icons (inline SVG) ─── */
const Icon = ({ d, size = 15 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IUpload = <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>;
const IPlus = <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>;
const IEdit = <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>;
const ITrash = <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>;
const ITable = <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></>;
const IChart = <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>;
const IOut = <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>;
const IPhoto = <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>;
const IPlay = <><polygon points="6 3 20 12 6 21 6 3" /></>;
const IMedia = <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" /></>;
const ICol = <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" /></>;
const IUser = <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>;
const ILock = <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>;

/* ─── Helpers ─── */
function isNumeric(v: any): boolean {
  if (v === null || v === undefined || v === "") return false;
  return !isNaN(Number(String(v).replace(/[%,$ ]/g, "").trim()));
}
function parseNum(v: any): number {
  if (v === null || v === undefined) return 0;
  return Number(String(v).replace(/[%,$ ]/g, "").trim()) || 0;
}
function autoPickX(cols: C[]): string {
  const text = cols.filter((c) => c.data_type === "text");
  if (text.length) {
    const best = text.find((c) => /project|name|title|label|site|area|district|state|status/i.test(c.key + c.label));
    return best ? best.key : text[0].key;
  }
  return cols[0]?.key || "name";
}
function autoPickY(cols: C[]): string {
  const num = cols.filter((c) => c.data_type === "number");
  if (num.length) {
    const best = num.find((c) => /progress|percent|score|value|amount|total|count|qty|quantity/i.test(c.key + c.label));
    return best ? best.key : num[0].key;
  }
  return cols[0]?.key || "value";
}
function genKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
/* Robust sheet→json: skip blank rows at the top and bottom, find the real header row. */
function parseSheet(ws: XLSX.WorkSheet): Record<string, any>[] {
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];
  const isBlankRow = (rw: any[]) => !rw.some((v) => v !== "" && v !== null && v !== undefined);
  const firstData = raw.findIndex((rw) => !isBlankRow(rw));
  if (firstData === -1) return [];
  const headerRow = raw[firstData].map((h: any, i: number) => {
    const label = String(h ?? "").trim();
    return label || `Column_${i + 1}`;
  });
  const out: Record<string, any>[] = [];
  for (let r = firstData + 1; r < raw.length; r++) {
    const row = raw[r];
    if (isBlankRow(row)) continue;
    const obj: Record<string, any> = {};
    headerRow.forEach((h: string, i: number) => { obj[h] = row[i] ?? ""; });
    out.push(obj);
  }
  return out;
}
/* Normalize a label for case/whitespace-insensitive comparison. */
const normLabel = (s: any) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function isImageUrl(v: any): boolean {
  if (!v || typeof v !== "string") return false;
  return /\.(jpe?g|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(v) ||
    /^https?:\/\/[^\s]+\.(jpe?g|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(v);
}
function isBucketUrl(v: any): boolean {
  return typeof v === "string" && /\/storage\/v1\/object\/public\/site-images\//.test(v);
}

/* ─── Image upload to Supabase bucket ─── */
async function uploadImageToBucket(db: ReturnType<typeof createClient>, url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const blob = await res.blob();
    const ext = ct.split("/")[1]?.split(";")[0] || "jpg";
    const filename = `site_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from("site-images").upload(filename, blob, { contentType: ct });
    if (error) return null;
    const { data } = db.storage.from("site-images").getPublicUrl(filename);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

/* ─── Multi-media cell helpers ─── */
const splitMedia = (v: any): string[] =>
  String(v ?? "").split(/\s*[\n\r]+\s*/).map((s) => s.trim()).filter(Boolean);

function isVideoUrl(v: any): boolean {
  if (typeof v !== "string" || !v) return false;
  return /\.(mp4|webm|mov|m4v|avi|mkv|ogv|3gp)(\?.*)?$/i.test(v.split(/[?#]/)[0]);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function MediaCell({ urls, onOpen }: { urls: string[]; onOpen: () => void }) {
  const first = urls[0];
  const many = urls.length > 1;
  const isVid = isVideoUrl(first);
  return (
    <span className="photo-cell">
      <button className="photo-btn" onClick={onOpen} title={many ? `View ${urls.length} media` : "View media"}>
        {isVid ? <Icon d={IPlay} size={13} /> : <Icon d={IPhoto} size={14} />}
        {many && <b className="media-count">{urls.length}</b>}
      </button>
      {!isVid && urls.length < 4 && (
        <img className="preview-pop" loading="lazy" referrerPolicy="no-referrer"
          src={first} alt=""
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
          onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "visible"; }} />
      )}
    </span>
  );
}

/* ─── Main Component ─── */
export default function Dashboard() {
  const db = useMemo(() => createClient(), []);

  /* Data state */
  const [cols, setCols] = useState<C[]>([]);
  const [rows, setRows] = useState<S[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [screen, setScreen] = useState("");
  const [admin, setAdmin] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "chart">("table");
  const [kind, setKind] = useState("bar");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  /* Chart state */
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [xInited, setXInited] = useState(false);
  const [yInited, setYInited] = useState(false);

  /* Admin state */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<S | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, any>>({});
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [newColType, setNewColType] = useState("text");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Upload target selection */
  const [uploadJson, setUploadJson] = useState<Record<string, any>[] | null>(null);
  const [uploadMode, setUploadMode] = useState<"new" | "existing">("new");
  const [uploadNewName, setUploadNewName] = useState("");
  const [uploadTarget, setUploadTarget] = useState("");

  /* Media slideshow (one cell can hold several photos/videos) */
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number } | null>(null);

  /* Bulk media upload: compress images, upload videos as-is, collect links */
  const [mediaModal, setMediaModal] = useState(false);
  const [mediaDrag, setMediaDrag] = useState(false);
  const [mediaDone, setMediaDone] = useState(false);
  const [mediaQueue, setMediaQueue] = useState<MediaJob[]>([]);
  const [mediaAttach, setMediaAttach] = useState<{ key: string; label: string; apply: (urls: string[]) => void } | null>(null);

  /* Screen manage menu */
  const [screenMenu, setScreenMenu] = useState(false);
  const screenMenuRef = useRef<HTMLDivElement>(null);

  /* ─── Data loading ─── */
  const load = async () => {
    setLoading(true);
    const a = await db.auth.getUser();
    if (!a.data.user) { setAuthed(false); setLoading(false); return; }
    setAuthed(true);
    const [c, s, r, p] = await Promise.all([
      db.from("site_columns").select("*").order("position"),
      db.from("dashboard_screens").select("*").order("created_at"),
      db.from("sites").select("*").order("created_at"),
      db.from("profiles").select("role").eq("id", a.data.user.id).single(),
    ]);
    setCols(c.data || []);
    setScreens(s.data || []);
    setRows(r.data || []);
    setAdmin(p.data?.role === "admin");
    if (!screen && s.data?.[0]) setScreen(s.data[0].id);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ─── Close screen menu on outside click ─── */
  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (screenMenuRef.current && !screenMenuRef.current.contains(ev.target as Node)) setScreenMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ─── Media slideshow keyboard navigation ─── */
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((l) => l && { ...l, idx: (l.idx + 1) % l.urls.length });
      if (e.key === "ArrowLeft") setLightbox((l) => l && { ...l, idx: (l.idx - 1 + l.urls.length) % l.urls.length });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /* ─── Auto-pick chart axes ─── */
  useEffect(() => {
    if (cols.length > 0 && !xInited) { setX(autoPickX(cols)); setXInited(true); }
  }, [cols, xInited]);
  useEffect(() => {
    if (cols.length > 0 && rows.length > 0 && !yInited) { setY(autoPickY(cols)); setYInited(true); }
  }, [cols, rows, yInited]);
  useEffect(() => {
    if (cols.length > 0 && xInited && yInited) {
      const keys = new Set(cols.map((c) => c.key));
      if (!keys.has(x)) setX(autoPickX(cols));
      if (!keys.has(y)) setY(autoPickY(cols));
    }
  }, [cols]);

  /* ─── Filtered rows ─── */
  const visible = rows.filter(
    (r) => r.screen_id === screen &&
      Object.values(r.values).join(" ").toLowerCase().includes(q.toLowerCase())
  );

  /* ─── Chart aggregation ─── */
  const groups = new Map<string, { total: number; count: number }>();
  visible.forEach((r, i) => {
    const rawX = r.values[x];
    let name = rawX != null && rawX !== "" ? String(rawX) : `Row ${i + 1}`;
    if (name.length > 25) name = name.slice(0, 22) + "...";
    const rawY = r.values[y];
    let value = 0;
    if (rawY != null && rawY !== "") {
      value = isNumeric(rawY) ? parseNum(rawY) : 1;
    }
    const entry = groups.get(name) || { total: 0, count: 0 };
    entry.total += value;
    entry.count += 1;
    groups.set(name, entry);
  });
  const chart = Array.from(groups, ([name, e]) => ({ name, value: Number((e.total / e.count).toFixed(2)) }));

  /* ─── Auth ─── */
  const login = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const id = String(f.get("id"));
    const z = await db.auth.signInWithPassword({
      email: id === "User" ? "user@kiipl.local" : id,
      password: String(f.get("password")),
    });
    z.error ? setNote(z.error.message) : load();
  };

  const logout = async () => {
    await db.auth.signOut();
    setAuthed(false);
    setAdmin(false);
    setScreen("");
    setCols([]);
    setRows([]);
    setScreens([]);
    setSelected(new Set());
    setXInited(false);
    setYInited(false);
    setQ("");
    setView("table");
    setNote("");
  };

  /* ─── Screen management ─── */
  const addScreen = async (name: string): Promise<string | null> => {
    if (!name.trim()) return null;
    const z = await db.from("dashboard_screens").insert({ name: name.trim() }).select().single();
    if (z.data) return z.data.id as string;
    setNote(z.error?.message || "Failed to create screen");
    return null;
  };

  const handleScreenChange = async (v: string) => {
    if (v === "__new") {
      const n = prompt("New screen/sheet name");
      if (!n) return;
      const id = await addScreen(n);
      if (id) { setScreen(id); load(); }
    } else {
      setScreen(v);
    }
  };

  const currentScreen = screens.find((s) => s.id === screen);

  const renameScreen = async () => {
    if (!currentScreen) return;
    const n = prompt("Rename screen", currentScreen.name);
    if (!n || !n.trim() || n.trim() === currentScreen.name) return;
    const z = await db.from("dashboard_screens").update({ name: n.trim() }).eq("id", screen);
    if (z.error) setNote(z.error.message);
    else load();
  };

  const deleteScreen = async () => {
    if (!currentScreen) return;
    const count = rows.filter((r) => r.screen_id === screen).length;
    if (!confirm(`Delete screen "${currentScreen.name}" and its ${count} record(s)?`)) return;
    if (count > 0) {
      const d = await db.from("sites").delete().eq("screen_id", screen);
      if (d.error) { setNote(d.error.message); return; }
    }
    const z = await db.from("dashboard_screens").delete().eq("id", screen);
    if (z.error) { setNote(z.error.message); return; }
    const remaining = screens.filter((s) => s.id !== screen);
    setScreen(remaining[0]?.id || "");
    setSelected(new Set());
    load();
  };

  /* ─── Column management ─── */
  const addColumn = async () => {
    if (!newColLabel.trim()) return;
    const key = genKey(newColLabel);
    const pos = cols.length + 1;
    const z = await db.from("site_columns").insert({ key, label: newColLabel, data_type: newColType, position: pos }).select().single();
    if (z.error) { setNote(z.error.message); return; }
    setNewColLabel(""); setNewColType("text"); setShowAddCol(false);
    load();
  };

  /* ─── Row CRUD ─── */
  const processUrlValues = async (vals: Record<string, any>) => {
    for (const c of cols) {
      if (c.data_type !== "url") continue;
      const lines = splitMedia(vals[c.key]);
      if (lines.length === 0) continue;
      const out: string[] = [];
      let changed = false;
      for (const ln of lines) {
        if (isImageUrl(ln) && !isBucketUrl(ln)) {
          const bucketUrl = await uploadImageToBucket(db, ln);
          if (bucketUrl) { out.push(bucketUrl); changed = true; continue; }
        }
        out.push(ln);
      }
      if (changed) vals[c.key] = out.join("\n");
    }
    return vals;
  };

  /* Upload a local media file (images compressed first) into the bucket, return its public URL. */
  const uploadMediaBlob = async (blob: Blob, mime: string, ext: string): Promise<string | null> => {
    const filename = `site_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from("site-images").upload(filename, blob, { contentType: mime });
    if (error) return null;
    const { data } = db.storage.from("site-images").getPublicUrl(filename);
    return data?.publicUrl || null;
  };

  const openBulkPicker = (attach: { key: string; label: string; apply: (urls: string[]) => void } | null) => {
    setMediaAttach(attach);
    setMediaQueue([]);
    setMediaDone(false);
    setMediaDrag(false);
    setMediaModal(true);
  };

  const handleMediaFiles = (files: File[]) => {
    if (files.length === 0) return;
    const stamp = Date.now();
    const jobs: MediaJob[] = files.map((f, i) => ({
      id: `m_${stamp}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      status: "queued",
      url: "",
      error: "",
      orig: f.size,
      fin: 0,
      ratio: 1,
      compressed: false,
    }));
    setMediaQueue(jobs);
    setMediaDone(false);
    runMediaQueue(jobs);
  };

  const runMediaQueue = async (jobs: MediaJob[]) => {
    const patch = (id: string, p: Partial<MediaJob>) =>
      setMediaQueue((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));
    for (const job of jobs) {
      patch(job.id, { status: "compressing" });
      let payload: Blob = job.file;
      let mime = job.file.type || "application/octet-stream";
      let ext = job.file.name.split(".").pop()?.toLowerCase() || "bin";
      let compressed = false;
      let ratio = 1;
      if (job.file.type?.startsWith("image/")) {
        const r = await compressImage(job.file);
        if (r.compressed) {
          payload = r.blob;
          compressed = true;
          ratio = r.ratio;
          mime = "image/webp";
          ext = "webp";
        }
      }
      patch(job.id, { status: "uploading", compressed, ratio, fin: payload.size });
      const url = await uploadMediaBlob(payload, mime, ext);
      if (!url) { patch(job.id, { status: "error", error: "Upload failed" }); continue; }
      patch(job.id, { status: "ready", url, fin: payload.size });
      if (mediaAttach) mediaAttach.apply([url]);
    }
    setMediaDone(true);
  };

  const copyMediaLinks = async () => {
    const urls = mediaQueue.filter((j) => j.status === "ready").map((j) => j.url);
    if (urls.length === 0) { setNote("No uploaded links yet"); return; }
    try {
      await navigator.clipboard.writeText(urls.join("\n"));
      setNote(`${urls.length} link(s) copied to clipboard`);
    } catch {
      setNote("Could not copy automatically — select the links manually");
    }
  };

  const addRow = async () => {
    const vals: Record<string, any> = {};
    cols.forEach((c) => { if (newRowValues[c.key] !== undefined && newRowValues[c.key] !== "") vals[c.key] = newRowValues[c.key]; });
    await processUrlValues(vals);
    const z = await db.from("sites").insert({ values: vals, screen_id: screen }).select().single();
    if (z.error) setNote(z.error.message);
    else { setShowAddRow(false); setNewRowValues({}); load(); }
  };

  const saveRow = async () => {
    if (!editingRow) return;
    const vals = { ...editValues };
    await processUrlValues(vals);
    const z = await db.from("sites").update({ values: vals }).eq("id", editingRow.id);
    if (z.error) setNote(z.error.message);
    else { setEditingRow(null); load(); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this record?")) return;
    const z = await db.from("sites").delete().eq("id", id);
    z.error ? setNote(z.error.message) : load();
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} record(s)?`)) return;
    const ids = Array.from(selected);
    const z = await db.from("sites").delete().in("id", ids);
    if (z.error) setNote(z.error.message);
    else { setSelected(new Set()); load(); }
  };

  const cleanEmptyRows = async () => {
    const empty = rows.filter((r) => r.screen_id === screen &&
      !Object.values(r.values).some((v) => v !== "" && v !== null && v !== undefined));
    if (empty.length === 0) { setNote("No empty rows in this screen"); return; }
    if (!confirm(`Delete ${empty.length} empty record(s)?`)) return;
    const z = await db.from("sites").delete().in("id", empty.map((r) => r.id));
    if (z.error) setNote(z.error.message);
    else { setSelected(new Set()); load(); setNote(`Removed ${empty.length} empty row(s)`); }
  };

  const delColumn = async (c: C) => {
    if (!confirm(`Delete column "${c.label}"? This removes it from all screens.`)) return;
    const z = await db.from("site_columns").delete().eq("id", c.id);
    if (z.error) setNote(z.error.message);
    else { setSelected(new Set()); load(); }
  };

  /* ─── Bulk select ─── */
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map((r) => r.id)));
  };

  /* ─── CSV / XLSX Upload ─── */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = parseSheet(ws);
      if (json.length === 0) { setNote("Sheet has no data rows"); setUploading(false); return; }
      setUploadJson(json);
      setUploadMode("existing");
      setUploadTarget(screen);
      setUploadNewName("");
      setUploading(false);
    } catch (err: any) {
      setNote("Upload failed: " + (err.message || "Unknown error"));
      setUploading(false);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const placeUpload = async () => {
    if (!uploadJson) return;
    setUploading(true);
    try {
      let targetScreen = uploadTarget;
      if (uploadMode === "new") {
        if (!uploadNewName.trim()) { setNote("Enter a screen name"); setUploading(false); return; }
        const id = await addScreen(uploadNewName);
        if (!id) { setUploading(false); return; }
        targetScreen = id;
      }

      const json = uploadJson;
      const headers = Object.keys(json[0]);

      // Match each header to an existing column by KEY first, then by LABEL.
      // This prevents duplicates like "S.No" -> s_no vs seed serial_no.
      const headerKeys: string[] = [];
      const newCols: { key: string; label: string; data_type: string; position: number }[] = [];
      const existingKeySet = new Set(cols.map((c) => c.key));
      const addKey = (k: string) => {
        let key = k;
        let n = 2;
        while (existingKeySet.has(key)) { key = `${k}_${n++}`; }
        existingKeySet.add(key);
        return key;
      };

      for (const h of headers) {
        const byKey = cols.find((c) => c.key === genKey(h));
        const byLabel = cols.find((c) => normLabel(c.label) === normLabel(h));
        const matched = byKey ?? byLabel;
        if (matched) {
          headerKeys.push(matched.key);
          continue;
        }
        const sample = json.find((r) => r[h] !== "" && r[h] != null);
        let dt = "text";
        if (sample) {
          const sv = String(sample[h]).replace(/[%,$ ]/g, "").trim();
          if (!isNaN(Number(sv)) && sv !== "") dt = "number";
          else if (/^\d{4}-\d{2}-\d{2}/.test(String(sample[h]))) dt = "date";
          else if (/^https?:\/\//.test(String(sample[h]))) dt = "url";
        }
        const key = addKey(genKey(h) || "column");
        headerKeys.push(key);
        newCols.push({ key, label: h, data_type: dt, position: 0 });
      }

      if (newCols.length > 0) {
        newCols.forEach((nc, i) => { nc.position = cols.length + i + 1; });
        const { error } = await db.from("site_columns").insert(newCols);
        if (error) { setNote("Column error: " + error.message); setUploading(false); return; }
      }

      let colDefs = await (async () => {
        const f = await db.from("site_columns").select("*").order("position");
        return f.data || [];
      })();

      // Preserve the CSV header order by renumbering positions to follow it.
      // Columns not present in the CSV keep their place after the CSV ones.
      const posMap = new Map<string, number>();
      headerKeys.forEach((k, i) => { posMap.set(k, i + 1); });
      let next = headerKeys.length + 1;
      for (const c of colDefs) {
        if (!posMap.has(c.key)) posMap.set(c.key, next++);
      }
      const reordered = colDefs.map((c) => ({
        id: c.id, key: c.key, label: c.label, data_type: c.data_type, position: posMap.get(c.key) ?? c.position,
      }));
      const { error: reErr } = await db.from("site_columns").upsert(reordered, { onConflict: "id" });
      if (reErr) { setNote("Position error: " + reErr.message); }
      const after = await db.from("site_columns").select("*").order("position");
      colDefs = after.data || [];
      setCols(colDefs);

      // Build rows, uploading images BEFORE insert
      const colMap = new Map(colDefs.map((c) => [c.key, c]));
      const inserts: { values: Record<string, any>; screen_id: string }[] = [];

      for (const row of json) {
        const values: Record<string, any> = {};
        for (let hi = 0; hi < headers.length; hi++) {
          const h = headers[hi];
          const key = headerKeys[hi];
          const cd = colMap.get(key);
          if (!cd) continue;
          let val = row[h];
          if (cd.data_type === "number" && val !== "" && val != null) val = parseNum(val);
          if (cd.data_type === "url" && val && typeof val === "string") {
            const lines = splitMedia(val);
            if (lines.length > 0 && !(lines.length === 1 && lines[0] === val)) {
              const out: string[] = [];
              for (const ln of lines) {
                let item = ln;
                if (isImageUrl(ln) && !isBucketUrl(ln)) {
                  const bucketUrl = await uploadImageToBucket(db, ln);
                  if (bucketUrl) item = bucketUrl;
                }
                out.push(item);
              }
              val = out.join("\n");
            } else if (isImageUrl(val) && !isBucketUrl(val)) {
              const bucketUrl = await uploadImageToBucket(db, val);
              if (bucketUrl) val = bucketUrl;
            }
          }
          values[key] = val;
        }
        inserts.push({ values, screen_id: targetScreen });
      }

      const { error } = await db.from("sites").insert(inserts);
      if (error) { setNote("Insert error: " + error.message); setUploading(false); return; }

      setUploadJson(null);
      setScreen(targetScreen);
      load();
      setNote("");
    } catch (err: any) {
      setNote("Upload failed: " + (err.message || "Unknown error"));
    }
    setUploading(false);
  };

  /* ─── Login screen ─── */
  if (loading)
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-brand">
            <div className="login-logo">K</div>
            <p className="eyebrow">KIIPL PROJECTS</p>
            <h1>Site progress dashboard</h1>
          </div>
          <p className="login-loading">Loading&hellip;</p>
        </section>
      </main>
    );
  if (!authed)
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-brand">
            <div className="login-logo">K</div>
            <p className="eyebrow">KIIPL PROJECTS</p>
            <h1>Site progress dashboard</h1>
          </div>
          <form className="login-form" onSubmit={login}>
            <label>
              Email or username
              <span className="login-field">
                <Icon d={IUser} size={16} />
                <input name="id" placeholder="name@company.com" autoFocus />
              </span>
            </label>
            <label>
              Password
              <span className="login-field">
                <Icon d={ILock} size={16} />
                <input name="password" type="password" placeholder="Password" />
              </span>
            </label>
            {note && <p className="notice">{note}</p>}
            <button className="login-btn" type="submit">Sign in</button>
          </form>
        </section>
      </main>
    );

  /* ─── Main render ─── */
  return (
    <main className="app-shell soft">
      {/* Header */}
      <header>
        <div>
          <p className="eyebrow">KIIPL PROJECTS</p>
          <h1>Site progress</h1>
        </div>
        <div className="header-actions">
          <span className="role">{admin ? "Admin" : "Viewer"}</span>
          <button className="icon-btn ghost" title="Sign out" onClick={logout}>
            <Icon d={IOut} />
          </button>
        </div>
      </header>

      {/* Screen + toolbar row */}
      <section className="top-bar">
        <select className="screen-select" value={screen} onChange={(e) => handleScreenChange(e.target.value)} title="Select sheet">
          {screens.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          {admin && <option value="__new">+ New screen/sheet</option>}
        </select>

        {admin && currentScreen && (
          <div className="screen-manage" ref={screenMenuRef}>
            <button className="icon-btn ghost" title="Manage screen" onClick={() => setScreenMenu(!screenMenu)}>
              <Icon d={<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>} size={16} />
            </button>
            {screenMenu && (
              <div className="menu">
                <button onClick={() => { setScreenMenu(false); renameScreen(); }}>Rename screen</button>
                <button className="danger-text" onClick={() => { setScreenMenu(false); deleteScreen(); }}>Delete screen</button>
              </div>
            )}
          </div>
        )}

        <div className="search-box">
          <Icon d={<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." />
        </div>

        <div className="toggle">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="Table view">
            <Icon d={ITable} />
          </button>
          <button className={view === "chart" ? "active" : ""} onClick={() => setView("chart")} title="Chart view">
            <Icon d={IChart} />
          </button>
        </div>
      </section>

      {/* Admin actions */}
      {admin && view === "table" && (
        <section className="admin-tools">
          <label className="icon-btn orange">
            {uploading ? "…" : <Icon d={IUpload} />}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={uploading} title="Upload CSV/XLSX" />
          </label>
          <button className="icon-btn" title="Bulk upload photos / videos" onClick={() => openBulkPicker(null)}>
            <Icon d={IMedia} />
          </button>
          <button className="icon-btn" title="Add column" onClick={() => { setShowAddCol(true); setNewColLabel(""); setNewColType("text"); }}>
            <Icon d={ICol} />
          </button>
          <button className="icon-btn" title="Add row" onClick={() => { setShowAddRow(true); setNewRowValues({}); }}>
            <Icon d={IPlus} />
          </button>
          <button className="icon-btn ghost" title="Remove empty rows" onClick={cleanEmptyRows}>
            <Icon d={<><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>} size={14} />
          </button>
          {selected.size > 0 && (
            <button className="icon-btn danger" title={`Delete ${selected.size} selected`} onClick={bulkDelete}>
              <Icon d={ITrash} />
            </button>
          )}
          {selected.size > 0 && <span className="sel-count">{selected.size}</span>}
        </section>
      )}

      {/* Table view */}
      {view === "table" ? (
        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {admin && <th className="col-check"><input type="checkbox" checked={selected.size === visible.length && visible.length > 0} onChange={toggleSelectAll} /></th>}
                  {cols.map((c) => (
                    <th key={c.id}>
                      <span className="th-wrap">
                        {c.label}
                        {admin && (
                          <button className="col-x" title={`Delete column: ${c.label}`} onClick={() => delColumn(c)}>&times;</button>
                        )}
                      </span>
                    </th>
                  ))}
                  {admin && <th className="col-actions"></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={selected.has(r.id) ? "row-selected" : ""}>
                    {admin && <td className="col-check">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    </td>}
                    {cols.map((c) => (
                      <td key={c.id}>
                        {c.data_type === "url" && splitMedia(r.values[c.key]).length > 0 ? (
                          <MediaCell
                            urls={splitMedia(r.values[c.key])}
                            onOpen={() => setLightbox({ urls: splitMedia(r.values[c.key]), idx: 0 })}
                          />
                        ) : (
                          <span className="cell-text">{String(r.values[c.key] ?? "—")}</span>
                        )}
                      </td>
                    ))}
                    {admin && (
                      <td className="col-actions">
                        <button className="icon-btn mini" title="Edit" onClick={() => { setEditingRow(r); setEditValues({ ...r.values }); }}>
                          <Icon d={IEdit} size={13} />
                        </button>
                        <button className="icon-btn mini danger" title="Delete" onClick={() => del(r.id)}>
                          <Icon d={ITrash} size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={cols.length + (admin ? 2 : 0)} className="empty-row">No records found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* Chart view */
        <section className="chart-card">
          <div className="chart-controls">
            <label>Style
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="bar">Bar</option>
                <option value="line">Line</option>
              </select>
            </label>
            <label>Label (X)
              <select value={x} onChange={(e) => setX(e.target.value)}>
                {cols.map((c) => <option key={c.id} value={c.key}>{c.label} ({c.data_type})</option>)}
              </select>
            </label>
            <label>Metric (Y)
              <select value={y} onChange={(e) => setY(e.target.value)}>
                {cols.map((c) => <option key={c.id} value={c.key}>{c.label} ({c.data_type})</option>)}
              </select>
            </label>
          </div>
          <ProductChart data={chart} type={kind} />
          {chart.length === 0 && <p className="empty-row">No data for this screen.</p>}
        </section>
      )}

      {/* ─── Upload target modal ─── */}
      {uploadJson && (
        <div className="modal-backdrop" onClick={() => setUploadJson(null)}>
          <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Where should this data go?</h2>
            <p className="modal-sub">{uploadJson.length} record(s) found. Choose a destination.</p>
            <div className="radio-row">
              <label>
                <input type="radio" name="upmode" checked={uploadMode === "new"}
                  onChange={() => setUploadMode("new")} /> Create new screen
              </label>
              <label>
                <input type="radio" name="upmode" checked={uploadMode === "existing"}
                  onChange={() => setUploadMode("existing")} /> Add to existing
              </label>
            </div>
            {uploadMode === "new" ? (
              <label className="field">Screen name
                <input value={uploadNewName} onChange={(e) => setUploadNewName(e.target.value)} placeholder="e.g. Metro Project, Phase 2" />
              </label>
            ) : (
              <label className="field">Target screen
                <select value={uploadTarget} onChange={(e) => setUploadTarget(e.target.value)}>
                  {screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            <div className="modal-actions">
              <button onClick={placeUpload} disabled={uploading}>{uploading ? "Uploading…" : "Upload"}</button>
              <button className="secondary" onClick={() => setUploadJson(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Bulk media upload modal ─── */}
      {mediaModal && (
        <div className="modal-backdrop" onClick={() => setMediaModal(false)}>
          <div className="editor-modal media-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{mediaAttach ? `Add media to "${mediaAttach.label}"` : "Bulk upload photos & videos"}</h2>
            <p className="modal-sub">
              Images are compressed losslessly in your browser and kept only when smaller. Videos upload as-is.
              Existing data is never touched.
            </p>
            <label
              className={`drop-zone${mediaDrag ? " drag" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setMediaDrag(true); }}
              onDragLeave={() => setMediaDrag(false)}
              onDrop={(e) => { e.preventDefault(); setMediaDrag(false); handleMediaFiles(Array.from(e.dataTransfer.files)); }}
            >
              <Icon d={IMedia} size={22} />
              <span>Drop photos / videos here</span>
              <span className="drop-sub">or click to browse (multiple allowed)</span>
              <input
                type="file" accept="image/*,video/*" multiple
                onChange={(e) => {
                  const fs = Array.from(e.target.files || []);
                  if (fs.length) handleMediaFiles(fs);
                  e.target.value = "";
                }}
              />
            </label>

            {mediaQueue.length > 0 && (
              <>
                <div className="job-list">
                  {mediaQueue.map((j) => (
                    <div className="job" key={j.id}>
                      <span className="job-name">{j.file.name}</span>
                      <span className="job-status">
                        {j.status === "queued" && "Preparing…"}
                        {j.status === "compressing" && "Compressing…"}
                        {j.status === "uploading" && "Uploading…"}
                        {j.status === "ready" && (j.compressed
                          ? `Compressed ${fmtBytes(j.orig)} → ${fmtBytes(j.fin)}`
                          : `Uploaded as-is (${fmtBytes(j.orig)})`)}
                        {j.status === "error" && (j.error || "Failed")}
                      </span>
                      <span className={`job-dot ${j.status === "ready" ? "ready" : ""} ${j.status === "error" ? "err" : ""}`} />
                    </div>
                  ))}
                </div>
                <p className="modal-sub">
                  {mediaQueue.filter((j) => j.status === "ready" || j.status === "error").length} of {mediaQueue.length} done
                </p>
              </>
            )}

            <div className="modal-actions">
              {mediaQueue.some((j) => j.status === "ready") && (
                <button className="secondary" onClick={copyMediaLinks}>Copy links</button>
              )}
              {mediaDone && (
                <button onClick={() => setMediaModal(false)}>{mediaAttach ? "Done — links added to cell" : "Close"}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Column modal ─── */}
      {showAddCol && (
        <div className="modal-backdrop" onClick={() => setShowAddCol(false)}>
          <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Column</h2>
            <label className="field">Column name
              <input value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} placeholder="e.g. Contractor Name" />
            </label>
            <label className="field">Data type
              <select value={newColType} onChange={(e) => setNewColType(e.target.value)}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="url">URL (Image)</option>
              </select>
            </label>
            <div className="modal-actions">
              <button onClick={addColumn}>Add</button>
              <button className="secondary" onClick={() => setShowAddCol(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Row modal ─── */}
      {showAddRow && (
        <div className="modal-backdrop" onClick={() => setShowAddRow(false)}>
          <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Record</h2>
            {cols.map((c) => (
              <label className="field" key={c.id}>{c.label}
                {c.data_type === "url" ? (
                  <span className="url-field">
                    <textarea
                      className="url-lines"
                      rows={3}
                      value={newRowValues[c.key] || ""}
                      onChange={(e) => setNewRowValues({ ...newRowValues, [c.key]: e.target.value })}
                      placeholder="One media link per line, or upload files below"
                    />
                    <button
                      type="button"
                      className="icon-btn orange"
                      title="Upload photos / videos into this cell"
                      onClick={() => openBulkPicker({
                        key: c.key,
                        label: c.label,
                        apply: (urls) => setNewRowValues((p) => ({ ...p, [c.key]: [p[c.key], ...urls].filter(Boolean).join("\n") })),
                      })}
                    >
                      <Icon d={IMedia} size={14} />
                    </button>
                  </span>
                ) : (
                  <input
                    value={newRowValues[c.key] || ""}
                    onChange={(e) => setNewRowValues({ ...newRowValues, [c.key]: e.target.value })}
                    placeholder={c.data_type === "number" ? "0" : ""}
                  />
                )}
              </label>
            ))}
            <div className="modal-actions">
              <button onClick={addRow}>Save</button>
              <button className="secondary" onClick={() => setShowAddRow(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Row modal ─── */}
      {editingRow && (
        <div className="modal-backdrop" onClick={() => setEditingRow(null)}>
          <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Record</h2>
            {cols.map((c) => (
              <label className="field" key={c.id}>{c.label}
                {c.data_type === "url" ? (
                  <span className="url-field">
                    <textarea
                      className="url-lines"
                      rows={3}
                      value={editValues[c.key] ?? ""}
                      onChange={(e) => setEditValues({ ...editValues, [c.key]: e.target.value })}
                      placeholder="One media link per line, or upload files below"
                    />
                    <button
                      type="button"
                      className="icon-btn orange"
                      title="Upload photos / videos into this cell"
                      onClick={() => openBulkPicker({
                        key: c.key,
                        label: c.label,
                        apply: (urls) => setEditValues((p) => ({ ...p, [c.key]: [p[c.key], ...urls].filter(Boolean).join("\n") })),
                      })}
                    >
                      <Icon d={IMedia} size={14} />
                    </button>
                  </span>
                ) : (
                  <input
                    value={editValues[c.key] ?? ""}
                    onChange={(e) => setEditValues({ ...editValues, [c.key]: e.target.value })}
                  />
                )}
              </label>
            ))}
            <div className="modal-actions">
              <button onClick={saveRow}>Save</button>
              <button className="secondary" onClick={() => setEditingRow(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Media slideshow lightbox ─── */}
      {lightbox && (
        <div className="modal-backdrop photo-lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}>&times;</button>
            {lightbox.urls.length > 1 && (
              <>
                <div className="lightbox-nav">
                  <button onClick={() => setLightbox((l) => l && { ...l, idx: (l.idx - 1 + l.urls.length) % l.urls.length })}>&#8249;</button>
                  <button onClick={() => setLightbox((l) => l && { ...l, idx: (l.idx + 1) % l.urls.length })}>&#8250;</button>
                </div>
                <div className="lightbox-counter">{lightbox.idx + 1} / {lightbox.urls.length}</div>
              </>
            )}
            {isVideoUrl(lightbox.urls[lightbox.idx]) ? (
              <video className="lb-media" src={lightbox.urls[lightbox.idx]} controls autoPlay playsInline />
            ) : (
              <img className="lb-media" src={lightbox.urls[lightbox.idx]} alt="Site media" />
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {note && <div className="toast" onClick={() => setNote("")}>{note}</div>}
    </main>
  );
}