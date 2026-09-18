"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import * as XLSX from "xlsx";

/* ─── Types ─── */
type C = { id: string; key: string; label: string; data_type: string; position: number };
type S = { id: string; screen_id: string; values: Record<string, any> };
type Screen = { id: string; name: string };

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
    const best = text.find((c) => /name|title|label|site|area|district|state|status/i.test(c.key + c.label));
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

  /* Photo lightbox */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

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
      const url = vals[c.key];
      if (url && typeof url === "string" && isImageUrl(url) && !isBucketUrl(url)) {
        const bucketUrl = await uploadImageToBucket(db, url);
        if (bucketUrl) vals[c.key] = bucketUrl;
      }
    }
    return vals;
  };

  /* Upload a local image file into the site-images bucket, return its public URL. */
  const uploadLocalImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `site_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from("site-images").upload(filename, file, {
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (error) { setNote("Image upload failed: " + error.message); return null; }
    const { data } = db.storage.from("site-images").getPublicUrl(filename);
    return data?.publicUrl || null;
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
          if (cd.data_type === "url" && val && typeof val === "string" && isImageUrl(val) && !isBucketUrl(val)) {
            const bucketUrl = await uploadImageToBucket(db, val);
            if (bucketUrl) val = bucketUrl;
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
            <p className="eyebrow">KIIPL / PROJECT ATLAS</p>
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
            <p className="eyebrow">KIIPL / PROJECT ATLAS</p>
            <h1>Site progress dashboard</h1>
          </div>
          <form className="login-form" onSubmit={login}>
            <label>
              Email or username
              <span className="login-field">
                <Icon d={IUser} size={16} />
                <input name="id" placeholder="Admin@kiipl.com or User" autoFocus />
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
          <div className="login-hint">
            <strong>Demo accounts</strong>
            <span>Admin &mdash; Admin@kiipl.com / adminkiipl</span>
            <span>User &mdash; User / kiipl</span>
          </div>
        </section>
      </main>
    );

  /* ─── Main render ─── */
  return (
    <main className="app-shell soft">
      {/* Header */}
      <header>
        <div>
          <p className="eyebrow">KIIPL / PROJECT ATLAS</p>
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
                        {c.data_type === "url" && r.values[c.key] ? (
                          <span className="photo-cell">
                            <button className="photo-btn" onClick={() => setPhotoUrl(r.values[c.key])} title="View photo">
                              <Icon d={IPhoto} size={14} />
                            </button>
                            <img className="preview-pop" loading="lazy" referrerPolicy="no-referrer"
                              src={r.values[c.key]} alt={c.label}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                              onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "visible"; }} />
                          </span>
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
                    <input
                      value={newRowValues[c.key] || ""}
                      onChange={(e) => setNewRowValues({ ...newRowValues, [c.key]: e.target.value })}
                      placeholder="Paste image URL or upload a file"
                    />
                    <label className="icon-btn orange" title="Upload image file">
                      <Icon d={IUpload} size={14} />
                      <input type="file" accept="image/*" onChange={async (ev) => {
                        const f = ev.target.files?.[0];
                        if (f) { const u = await uploadLocalImage(f); if (u) setNewRowValues({ ...newRowValues, [c.key]: u }); }
                        ev.target.value = "";
                      }} />
                    </label>
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
                    <input
                      value={editValues[c.key] ?? ""}
                      onChange={(e) => setEditValues({ ...editValues, [c.key]: e.target.value })}
                      placeholder="Paste image URL or upload a file"
                    />
                    <label className="icon-btn orange" title="Upload image file">
                      <Icon d={IUpload} size={14} />
                      <input type="file" accept="image/*" onChange={async (ev) => {
                        const f = ev.target.files?.[0];
                        if (f) { const u = await uploadLocalImage(f); if (u) setEditValues({ ...editValues, [c.key]: u }); }
                        ev.target.value = "";
                      }} />
                    </label>
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

      {/* ─── Photo lightbox ─── */}
      {photoUrl && (
        <div className="modal-backdrop photo-lightbox" onClick={() => setPhotoUrl(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setPhotoUrl(null)}>&times;</button>
            <img src={photoUrl} alt="Site photo" />
          </div>
        </div>
      )}

      {/* Toast */}
      {note && <div className="toast" onClick={() => setNote("")}>{note}</div>}
    </main>
  );
}