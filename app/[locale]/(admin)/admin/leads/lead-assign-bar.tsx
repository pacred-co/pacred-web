"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { UserPlus, X, Upload, FileSpreadsheet, Phone, Check, Loader2, Users, ChevronDown } from "lucide-react";
import {
  getImportedLeads,
  saveImportedLeads,
  assignImportedLeads,
  logImportedLeadCall,
  setImportedLeadStatus,
  setImportedLeadService,
  setImportedLeadNote,
  handoffImportedLead,
  type ImportedLead,
} from "@/actions/admin/imported-leads";
import {
  IMPORTED_LEAD_SOURCES,
  IMPORTED_LEAD_SERVICES,
  IMPORTED_LEAD_CALL_STATUSES,
  type ImportedLeadSource,
} from "@/lib/validators/imported-lead";

/**
 * Imported-leads CRM workspace. TWO MODES (ปอน 2026-06-22 · "เข้าใจใหม่"):
 *
 *   mode="assign"  — the dedicated **Ultra Admin Z** "มอบหมายโทรเซลล์" tab. The
 *                    ONLY place import (CSV) + assign-to-rep happen: checkboxes,
 *                    "นำเข้า CSV", and the assign toolbar live here ONLY. Shows
 *                    ALL leads so ultra can distribute the unassigned ones.
 *   mode="work"    — the normal tabs EVERY admin sees. Work the leads assigned to
 *                    you: call · set status · บริการ · หมายเหตุ. NO assign control
 *                    ("เขาไม่สามารถเลือกมอบเซลล์ให้ใครได้ในหน้าปกติ"), NO import,
 *                    NO checkboxes. The `segment` prop picks ลูกค้าของฉัน(mine) vs
 *                    ทั้งหมด(all) — the backend force-scopes reps to their own.
 */

const IMPORT_COLUMNS = ["ชื่อลูกค้า", "ที่อยู่", "เบอร์โทร", "LINE/Facebook", "Email", "บริการ"] as const;

const CALL_STATUS_LABEL: Record<string, string> = {
  called: "โทรแล้ว",
  no_answer: "โทรไม่ติด",
  callback: "รอติดต่อกลับ",
  closed: "ปิดได้",
  not_interested: "ไม่สนใจ",
  other_rep: "ลูกค้าเซลล์อื่น",
};
const CALL_STATUS_STYLE: Record<string, string> = {
  called: "border-sky-300 bg-sky-50 text-sky-700",
  no_answer: "border-amber-300 bg-amber-50 text-amber-700",
  callback: "border-purple-300 bg-purple-50 text-purple-700",
  closed: "border-green-300 bg-green-50 text-green-700",
  not_interested: "border-rose-300 bg-rose-50 text-rose-700",
  other_rep: "border-slate-300 bg-slate-100 text-slate-700",
};
// The quick post-call outcome buttons (other_rep is special — it opens a rep
// picker + routes the lead, so it's rendered separately, not in this loop).
const QUICK_STATUSES = IMPORTED_LEAD_CALL_STATUSES.filter((s) => s !== "other_rep");

export type AssignRep = { legacyId: string; name: string };

// ── CSV parsing (handles quoted fields, escaped quotes, commas, CRLF) ───────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}
function looksLikeHeader(row: string[]): boolean {
  const cells = row.map((c) => c.trim().toLowerCase());
  // A real DATA row carries an email (@) or a phone (3+ digit run) — never a
  // header. Stops a headerless dump's first lead being dropped.
  if (cells.some((c) => c.includes("@") || /\d{3,}/.test(c))) return false;
  const hits = cells.filter((c) => /ชื่อ|name|ที่อยู่|address|เบอร|phone|tel|line|facebook|email|บริการ|service/.test(c)).length;
  return hits >= 2;
}

/** Inline editor for the standing "หมายเหตุ" note. Saves on blur when changed.
 *  The call site keys this by `${id}-${note}`, so a server-side note change
 *  remounts it with the fresh value — no setState-in-effect re-sync needed. */
function NoteCell({
  lead,
  saving,
  onSave,
}: {
  lead: ImportedLead;
  saving: boolean;
  onSave: (id: number, note: string) => void;
}) {
  const [draft, setDraft] = useState(lead.note ?? "");
  const commit = () => {
    const next = draft.trim();
    if (next === (lead.note ?? "").trim()) return; // unchanged → no write
    onSave(lead.id, next);
  };
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={2}
        placeholder="เพิ่มหมายเหตุ…"
        aria-label={`หมายเหตุของ ${lead.name || "ลูกค้า"}`}
        className="w-44 resize-y rounded-lg border border-border bg-white px-2 py-1 text-xs dark:bg-surface"
      />
      {saving ? <span className="inline-flex items-center gap-1 text-[10px] text-muted"><Loader2 className="h-3 w-3 animate-spin" /> กำลังบันทึก…</span> : null}
    </div>
  );
}

/** One label/value row inside the mobile expand panel (ปอน 2026-06-23). */
function MobileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-border/50 py-1.5 last:border-0">
      <dt className="w-24 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * The workspace. `mode` decides assign (ultra import/assign tab) vs work (the
 * normal everyone-tab). `segment` is the work-mode filter (mine vs all).
 */
export function LeadAssignPanel({ reps, segment, mode }: { reps: AssignRep[]; segment: string; mode: "assign" | "work" }) {
  const isAssign = mode === "assign";
  // assign → see EVERY lead (to distribute). work → mine vs all (backend scopes reps).
  const filter: "all" | "mine" = isAssign ? "all" : segment === "mine" ? "mine" : "all";

  const [leads, setLeads] = useState<ImportedLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assignRep, setAssignRep] = useState("");
  const [callOpenId, setCallOpenId] = useState<number | null>(null);
  const [handoffOpenId, setHandoffOpenId] = useState<number | null>(null);
  const [handoffRep, setHandoffRep] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  // import popup
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<ImportedLeadSource | "">("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importMismatch, setImportMismatch] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const repName = useCallback(
    (legacyId: string) => (legacyId ? reps.find((r) => r.legacyId === legacyId)?.name ?? legacyId : "—"),
    [reps],
  );

  const refresh = useCallback(async (mine: boolean) => {
    setLoading(true);
    const res = await getImportedLeads({ mine });
    if (res.ok && res.data) {
      const data = res.data.leads;
      setLeads(data);
      const ids = new Set(data.map((l) => l.id));
      setSelected((s) => new Set([...s].filter((id) => ids.has(id))));
    }
    setLoading(false);
  }, []);

  // Defer to a microtask so the fetch's setState isn't synchronous in the effect.
  useEffect(() => {
    queueMicrotask(() => void refresh(filter === "mine"));
  }, [filter, refresh]);

  // ── import popup handlers ──
  function handleFile(file: File) {
    setImportError(null);
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let parsed = parseCsv(String(reader.result ?? ""));
        if (parsed.length > 0 && looksLikeHeader(parsed[0])) parsed = parsed.slice(1);
        const norm = parsed.map((r) => IMPORT_COLUMNS.map((_, i) => (r[i] ?? "").trim()));
        setImportMismatch(parsed.filter((r) => r.length !== IMPORT_COLUMNS.length).length);
        setImportRows(norm);
        if (norm.length === 0) setImportError("ไม่พบข้อมูลในไฟล์ CSV");
      } catch {
        setImportRows([]);
        setImportError("อ่านไฟล์ CSV ไม่สำเร็จ — ตรวจรูปแบบไฟล์");
      }
    };
    reader.onerror = () => setImportError("อ่านไฟล์ไม่สำเร็จ");
    reader.readAsText(file, "utf-8");
  }
  function resetImport() {
    setImportRows([]);
    setImportFileName(null);
    setImportSource("");
    setImportError(null);
    setImportMismatch(0);
    if (fileRef.current) fileRef.current.value = "";
  }
  function closeImport() {
    setImportOpen(false);
    resetImport();
  }
  async function doSave() {
    if (!importSource) { setImportError("เลือก source ก่อนบันทึก"); return; }
    if (importRows.length === 0) { setImportError("ยังไม่มีข้อมูลให้บันทึก"); return; }
    setSaving(true);
    const rows = importRows.map((r) => ({
      name: r[0] ?? "", address: r[1] ?? "", phone: r[2] ?? "",
      line_facebook: r[3] ?? "", email: r[4] ?? "", service: r[5] ?? "",
    }));
    const res = await saveImportedLeads({ source: importSource, rows });
    setSaving(false);
    if (!res.ok) { setImportError(`บันทึกไม่สำเร็จ: ${res.error}`); return; }
    closeImport();
    setNotice(`บันทึก ${res.data?.inserted ?? 0} รายการ (source: ${importSource})`);
    await refresh(filter === "mine");
  }

  // ปอน 2026-06-23: the "นัดโทรกลับ" tab lists only leads whose latest outcome is
  // "รอติดต่อกลับ" (callback). Other tabs show everything the query returned.
  const displayLeads = segment === "callback" ? leads.filter((l) => l.call_status === "callback") : leads;
  function toggleExpand(id: number) {
    setExpandedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // ── table actions ──
  function toggleAll() {
    const all = displayLeads.length > 0 && displayLeads.every((l) => selected.has(l.id));
    setSelected(all ? new Set() : new Set(displayLeads.map((l) => l.id)));
  }
  function toggleOne(id: number) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function doAssign() {
    if (selected.size === 0 || !assignRep) return;
    setNotice(null);
    const res = await assignImportedLeads({ ids: [...selected], legacyId: assignRep });
    if (!res.ok) { setNotice(`มอบหมายไม่สำเร็จ: ${res.error}`); return; }
    setNotice(`มอบหมาย ${res.data?.assigned ?? 0} รายการให้ ${repName(assignRep)} → เข้า "ลูกค้าของฉัน" ของเซลล์`);
    setSelected(new Set());
    setAssignRep("");
    await refresh(filter === "mine");
  }
  async function doCall(lead: ImportedLead) {
    if (busyId === lead.id) return; // guard repeat taps while a log is in flight
    setBusyId(lead.id);
    await logImportedLeadCall({ id: lead.id });
    setBusyId(null);
    setCallOpenId(lead.id); // reveal the outcome buttons
    await refresh(filter === "mine");
  }
  async function doStatus(id: number, status: string) {
    setBusyId(id);
    await setImportedLeadStatus({ id, status });
    setBusyId(null);
    setCallOpenId(null);
    await refresh(filter === "mine");
  }
  async function doHandoff(id: number, legacyId: string) {
    if (!legacyId) return;
    setBusyId(id);
    const res = await handoffImportedLead({ id, legacyId });
    setBusyId(null);
    if (!res.ok) { setNotice(`ส่งต่อไม่สำเร็จ: ${res.error}`); return; }
    setNotice(`ส่งลูกค้าให้ ${repName(legacyId)} แล้ว → เข้า "ลูกค้าของฉัน" ของเซลล์`);
    setHandoffOpenId(null);
    setHandoffRep("");
    setCallOpenId(null);
    await refresh(filter === "mine");
  }
  async function doService(id: number, service: string) {
    setBusyId(id);
    await setImportedLeadService({ id, service });
    setBusyId(null);
    await refresh(filter === "mine");
  }
  async function doNote(id: number, note: string) {
    setSavingNoteId(id);
    const res = await setImportedLeadNote({ id, note });
    setSavingNoteId(null);
    if (res.ok) {
      // Optimistic single-row patch — no full reload (keeps the table calm).
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, note } : l)));
    } else {
      setNotice(`บันทึกหมายเหตุไม่สำเร็จ: ${res.error}`);
    }
  }

  // ── shared cell renderers (desktop table + mobile cards share these) ──
  const serviceSelect = (l: ImportedLead) => (
    <select aria-label={`บริการของ ${l.name || "ลูกค้า"}`} value={(IMPORTED_LEAD_SERVICES as readonly string[]).includes(l.service) ? l.service : ""} onChange={(e) => doService(l.id, e.target.value)} disabled={busyId === l.id} className="rounded-lg border border-border bg-white px-2 py-1 text-xs dark:bg-surface">
      <option value="">— เลือก —</option>
      {IMPORTED_LEAD_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  const statusBadge = (l: ImportedLead) =>
    l.call_status ? (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CALL_STATUS_STYLE[l.call_status] ?? "border-border text-muted"}`}>{CALL_STATUS_LABEL[l.call_status] ?? l.call_status}</span>
    ) : <span className="text-xs text-muted">ยังไม่โทร</span>;

  const callActions = (l: ImportedLead) => (
    <div className="flex flex-col gap-1.5">
      {l.phone ? (
        <a href={`tel:${l.phone}`} aria-busy={busyId === l.id} onClick={(e) => { if (busyId === l.id) { e.preventDefault(); return; } doCall(l); }} className={`inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 text-xs font-semibold text-white transition hover:bg-primary-700 ${busyId === l.id ? "pointer-events-none opacity-70" : ""}`}>
          {busyId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />} โทร
        </a>
      ) : <span className="text-xs text-muted">ไม่มีเบอร์</span>}
      {l.call_count > 0 ? <span className="text-[10px] text-muted">โทร {l.call_count} ครั้ง{l.last_called_at ? ` · ${new Date(l.last_called_at).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span> : null}
      {callOpenId === l.id ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-1">
            {QUICK_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => doStatus(l.id, s)} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${CALL_STATUS_STYLE[s]}`}>{CALL_STATUS_LABEL[s]}</button>
            ))}
            {/* ลูกค้าเซลล์อื่น — opens a rep picker; routes the lead to the chosen rep (ปอน 2026-06-23) */}
            <button type="button" onClick={() => { setHandoffRep(""); setHandoffOpenId(handoffOpenId === l.id ? null : l.id); }} aria-expanded={handoffOpenId === l.id} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${CALL_STATUS_STYLE.other_rep} ${handoffOpenId === l.id ? "ring-1 ring-slate-400" : ""}`}>{CALL_STATUS_LABEL.other_rep}</button>
          </div>
          {handoffOpenId === l.id ? (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-900/30">
              <span className="text-[10px] text-muted">ส่งให้เซลล์:</span>
              <select aria-label={`เลือกเซลล์เจ้าของ ${l.name || "ลูกค้า"}`} value={handoffRep} onChange={(e) => setHandoffRep(e.target.value)} className="rounded-md border border-border bg-white px-1.5 py-1 text-[11px] dark:bg-surface">
                <option value="">— เลือกเซลล์ —</option>
                {reps.map((r) => <option key={r.legacyId} value={r.legacyId}>{r.name}</option>)}
              </select>
              <button type="button" disabled={!handoffRep || busyId === l.id} onClick={() => doHandoff(l.id, handoffRep)} className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40">
                {busyId === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null} ส่ง
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const title = isAssign
    ? "มอบหมายโทรเซลล์ — รายชื่อลูกค้านำเข้า"
    : filter === "mine"
      ? "ลูกค้าของฉัน — รายชื่อที่ได้รับมอบหมาย"
      : "รายชื่อลูกค้า";

  return (
    <div className="rounded-2xl border border-primary-200 bg-white shadow-sm dark:border-primary-900/50 dark:bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary-600" />
          <h3 className="text-sm font-black text-foreground">{title}</h3>
          {isAssign ? <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-white">Ultra</span> : null}
        </div>
        {isAssign ? (
          <button type="button" onClick={() => { resetImport(); setImportOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-700">
            <Upload className="h-4 w-4" /> นำเข้า CSV
          </button>
        ) : null}
      </div>

      {/* Selection / assign toolbar — assign tab only (มอบหมายให้คนอื่น) */}
      {isAssign && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-50/40 px-4 py-2.5 dark:bg-primary-950/10">
          <span className="text-sm font-semibold text-primary-700">เลือก {selected.size} รายการ</span>
          <Users className="h-4 w-4 text-muted" />
          <select aria-label="เลือกเซลล์ที่จะมอบหมาย" value={assignRep} onChange={(e) => setAssignRep(e.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:bg-surface">
            <option value="">— เลือกเซลล์ —</option>
            {reps.map((r) => <option key={r.legacyId} value={r.legacyId}>{r.name}</option>)}
          </select>
          <button type="button" disabled={!assignRep} onClick={doAssign} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-40">
            <Phone className="h-4 w-4" /> มอบหมายโทรให้เซลล์
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-muted hover:text-foreground">ล้างที่เลือก</button>
        </div>
      ) : null}

      {notice ? (
        <div className="border-b border-border bg-green-50 px-4 py-2 text-[13px] text-green-800 dark:bg-green-950/20 dark:text-green-300">{notice}</div>
      ) : null}

      {/* Table */}
      <div className="px-4 py-3">
        {displayLeads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-alt/40 px-4 py-12 text-center text-sm text-muted">
            {loading
              ? "กำลังโหลด…"
              : isAssign
                ? <>ยังไม่มีรายชื่อ — กด <b className="text-foreground">“นำเข้า CSV”</b> เพื่อเริ่ม</>
                : segment === "callback"
                  ? "ยังไม่มีลูกค้าที่นัดโทรกลับ (รอติดต่อกลับ)"
                  : filter === "mine"
                    ? "ยังไม่มีลูกค้าที่มอบหมายให้คุณ"
                    : "ยังไม่มีรายชื่อลูกค้า"}
          </div>
        ) : (
          <>
          {/* Desktop table (md+) — ปอน 2026-06-23: full table อยู่บนจอใหญ่; มือถือใช้การ์ดด้านล่าง */}
          <div className="hidden md:block max-h-[62vh] overflow-auto rounded-2xl border border-border">
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="sticky top-0 z-10 bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {isAssign ? <th className="px-3 py-2.5"><input type="checkbox" checked={displayLeads.length > 0 && displayLeads.every((l) => selected.has(l.id))} onChange={toggleAll} aria-label="เลือกทั้งหมด" /></th> : null}
                  <th className="px-3 py-2.5 font-semibold">#</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">ชื่อลูกค้า</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">ที่อยู่</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">เบอร์โทร</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">LINE/Facebook</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Email</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">บริการ</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">source</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">เซลล์ผู้ดูแล</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">หมายเหตุ</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">โทร</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {displayLeads.map((l, idx) => (
                  <tr key={l.id} className={`border-t border-border align-top hover:bg-surface-alt/40 ${selected.has(l.id) ? "bg-primary-50/40 dark:bg-primary-950/10" : ""}`}>
                    {isAssign ? <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} aria-label={`เลือก ${l.name}`} /></td> : null}
                    <td className="px-3 py-2.5 text-muted">{idx + 1}</td>
                    <td className="px-3 py-2.5">{l.name || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5">{l.address || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{l.phone || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5">{l.line_facebook || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5">{l.email || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5">{serviceSelect(l)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{l.source || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">{l.assigned_admin_id ? <span className="font-medium text-foreground">{repName(l.assigned_admin_id)}</span> : <span className="text-muted">ยังไม่มอบหมาย</span>}</td>
                    <td className="px-3 py-2.5"><NoteCell key={`note-${l.id}-${l.note}`} lead={l} saving={savingNoteId === l.id} onSave={doNote} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{callActions(l)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{statusBadge(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (<md) — ปอน 2026-06-23: เห็นแค่ ชื่อ/โทร/สถานะ · กด ⌄ เปิด/พับ ดูที่เหลือ */}
          <div className="md:hidden space-y-2">
            {displayLeads.map((l) => {
              const open = expandedIds.has(l.id);
              return (
                <div key={l.id} className={`rounded-xl border ${selected.has(l.id) ? "border-primary-300 bg-primary-50/40 dark:bg-primary-950/10" : "border-border bg-white dark:bg-surface"}`}>
                  <div className="flex items-start gap-2 p-3">
                    {isAssign ? <input type="checkbox" className="mt-1 shrink-0" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} aria-label={`เลือก ${l.name}`} /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground break-words">{l.name || <span className="text-muted">— ไม่มีชื่อ —</span>}</p>
                      <div className="mt-1">{statusBadge(l)}</div>
                      <div className="mt-2">{callActions(l)}</div>
                    </div>
                    <button type="button" onClick={() => toggleExpand(l.id)} aria-expanded={open} aria-label={open ? "ย่อข้อมูล" : "ดูข้อมูลเพิ่ม"} className="shrink-0 rounded-lg border border-border p-1.5 text-muted transition hover:bg-surface-alt">
                      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {open ? (
                    <dl className="border-t border-border px-3 py-1.5">
                      <MobileField label="ที่อยู่">{l.address || <span className="text-muted">—</span>}</MobileField>
                      <MobileField label="เบอร์โทร"><span className="font-mono">{l.phone || "—"}</span></MobileField>
                      <MobileField label="LINE/Facebook">{l.line_facebook || <span className="text-muted">—</span>}</MobileField>
                      <MobileField label="Email">{l.email || <span className="text-muted">—</span>}</MobileField>
                      <MobileField label="บริการ">{serviceSelect(l)}</MobileField>
                      <MobileField label="source">{l.source || <span className="text-muted">—</span>}</MobileField>
                      <MobileField label="เซลล์ผู้ดูแล">{l.assigned_admin_id ? repName(l.assigned_admin_id) : <span className="text-muted">ยังไม่มอบหมาย</span>}</MobileField>
                      <MobileField label="หมายเหตุ"><NoteCell key={`mnote-${l.id}-${l.note}`} lead={l} saving={savingNoteId === l.id} onSave={doNote} /></MobileField>
                    </dl>
                  ) : null}
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* ── Import POPUP ── */}
      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={closeImport}>
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-white shadow-xl dark:bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-black text-foreground"><FileSpreadsheet className="h-5 w-5 text-primary-600" /> นำเข้ารายชื่อลูกค้า (CSV)</h2>
              <button type="button" onClick={closeImport} className="rounded-lg p-1.5 text-muted transition hover:bg-surface-alt hover:text-foreground" aria-label="ปิด"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300">
                <Upload className="h-4 w-4" /> เลือกไฟล์ CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {importFileName ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted"><FileSpreadsheet className="h-4 w-4 text-primary-600" />{importFileName}{importRows.length > 0 ? <b className="text-foreground">· {importRows.length.toLocaleString("th-TH")} แถว</b> : null}</span>
              ) : <span className="text-sm text-muted">คอลัมน์: {IMPORT_COLUMNS.join(" · ")}</span>}
            </div>

            <div className="px-5 pb-3">
              {importError ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{importError}</div> : null}
              {importMismatch > 0 ? <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">⚠️ พบ {importMismatch.toLocaleString("th-TH")} แถวที่จำนวนคอลัมน์ไม่ตรง 6 — ตรวจให้คอลัมน์เรียงตามลำดับ (ชื่อ·ที่อยู่·เบอร์·LINE/FB·Email·บริการ) ก่อนบันทึก ไม่งั้นข้อมูลอาจเลื่อนช่อง</div> : null}
              {importRows.length > 0 ? (
                <div className="max-h-[42vh] overflow-auto rounded-2xl border border-border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 bg-surface-alt text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 font-semibold">#</th>{IMPORT_COLUMNS.map((c) => <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
                    <tbody>{importRows.slice(0, 200).map((r, i) => <tr key={i} className="border-t border-border align-top"><td className="px-3 py-2 text-muted">{i + 1}</td>{r.map((cell, ci) => <td key={ci} className="px-3 py-2">{cell || <span className="text-muted">—</span>}</td>)}</tr>)}</tbody>
                  </table>
                  {importRows.length > 200 ? <p className="px-3 py-2 text-[11px] text-muted">แสดง 200 แถวแรกจาก {importRows.length.toLocaleString("th-TH")} — บันทึกครบทุกแถว</p> : null}
                </div>
              ) : <div className="rounded-2xl border border-dashed border-border bg-surface-alt/40 px-4 py-10 text-center text-sm text-muted">เลือกไฟล์ CSV เพื่อพรีวิว</div>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
              <label className="text-sm font-medium text-foreground">Source:</label>
              <select aria-label="เลือก source ของรายชื่อ" value={importSource} onChange={(e) => setImportSource(e.target.value as ImportedLeadSource | "")} className="rounded-lg border border-border bg-white px-3 py-2 text-sm dark:bg-surface">
                <option value="">— เลือก source —</option>
                {IMPORTED_LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={closeImport} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-alt">ยกเลิก</button>
              <button type="button" disabled={saving || importRows.length === 0 || !importSource} onClick={doSave} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} บันทึกเข้าระบบ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
