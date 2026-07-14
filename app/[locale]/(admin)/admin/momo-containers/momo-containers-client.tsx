"use client";

/**
 * MOMO sync/ingest workspace — per-tracking grid (ภูม 2026-07-14 · rework).
 *
 * Row = 1 customer tracking (from momo_import_tracks · committed + pending).
 * ตรวจ PR/น้ำหนัก/คิว/ขนส่ง/ประเภท ต่อแทรค → กด "นำเข้าระบบ" → modal พรีวิว+ยืนยัน →
 * commitMomoRowToForwarder (wrap · ไม่เขียน commit ใหม่). แถวที่เข้าแล้วโชว์ "เข้าระบบแล้ว".
 * กดเลขตู้ → หน้า detail /[cabinet] (เก็บไว้).
 */

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CheckCircle2, AlertCircle, RefreshCw, X, PackageCheck, Truck, Check } from "lucide-react";
import { commitMomoRowToForwarder, commitMomoRowsBatch } from "@/actions/admin/momo-commit";
import { updateMomoImportTrackFields } from "@/actions/admin/momo-ingest-edit";
import { useColumnOrder } from "@/lib/hooks/use-column-order";

// reorderable DATA columns (drag · เฟส A-3b) — fixed cols (checkbox/#/รูป/นำเข้า) stay put.
const DATA_KEYS = ["tracking", "container", "pr", "weight", "cbm", "qty", "dims", "type", "status"];
// Import the input TYPE from the auth-agnostic core, NOT the "use server" file
// (a type re-export from a "use server" module hits a Turbopack analyzer bug).
import type { CommitMomoRowInput } from "@/lib/admin/commit-momo-row-core";

export type IngestTrack = {
  id: string; // momo_import_tracks.id (uuid) — the rowId for commit
  tracking: string | null;
  container: string | null; // real cabinet (GZS/GZE) — link target
  transport: "1" | "2" | "3" | null;
  routingBatch: string | null;
  sack: string | null;
  status: string | null;
  phase: string | null;
  adminStatusText: string | null;
  guessedUserId: string | null;
  userIdValid: boolean | null;
  guessedShipBy: string | null;
  guessedProductType: "1" | "2" | "3" | "4";
  qty: number | null;
  weightKg: number;
  cbm: number;
  width: number;
  length: number;
  height: number;
  images: string[];
  committed: boolean;
  committedForwarderId: number | null;
  commitUserId: string | null;
  committedAt: string | null;
  lastSyncedAt: string | null;
  // Slice 2 — packing-list match (aggregated by base tracking · null = ไม่มีใน packing)
  hasPacking: boolean;
  packingWeight: number | null;
  packingCbm: number | null;
  packingBoxes: number | null;
};

const WT_EPS = 0.01;
const VOL_EPS = 0.000001;
/** API weight/cbm (shipment aggregate) disagrees with the packing list. */
function pkWtDiff(t: IngestTrack): boolean {
  return t.hasPacking && t.packingWeight != null && t.weightKg > 0 && Math.abs(t.weightKg - t.packingWeight) > WT_EPS;
}
function pkVolDiff(t: IngestTrack): boolean {
  return t.hasPacking && t.packingCbm != null && t.cbm > 0 && Math.abs(t.cbm - t.packingCbm) > VOL_EPS;
}

const SHIP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— ยังไม่ระบุ (เซล/ลูกค้ากรอกภายหลัง) —" },
  { value: "PCS", label: "รับเองโกดัง Pacred (สมุทรสาคร)" },
  { value: "2", label: "Flash Express" },
  { value: "3", label: "J.K. เอ็กซ์เพรส" },
  { value: "21", label: "นิ่มซี่เส็งขนส่ง" },
  { value: "5", label: "Nim Express" },
  { value: "11", label: "ไปรษณีย์ไทย" },
  { value: "24", label: "J&T Express" },
  { value: "1", label: "DHL Express" },
  { value: "4", label: "Kerry Express" },
];
const PRODUCT_TYPE_OPTIONS: { value: "1" | "2" | "3" | "4"; label: string }[] = [
  { value: "1", label: "ทั่วไป" },
  { value: "2", label: "มอก." },
  { value: "3", label: "อย./น้ำยา" },
  { value: "4", label: "พิเศษ" },
];
const PRODUCT_TYPE_TH: Record<string, string> = { "1": "ทั่วไป", "2": "มอก.", "3": "อย./น้ำยา", "4": "พิเศษ" };
const TRANSPORT_TH: Record<string, string> = { "1": "🚚 รถ", "2": "🚢 เรือ", "3": "✈️ อากาศ" };

const n2 = (v: number) => (v > 0 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—");
const n6 = (v: number) => (v > 0 ? v.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—");

// sortable data columns → value getter (⇅ · เฟส A-3)
const SORT_VAL: Record<string, (t: IngestTrack) => string | number> = {
  tracking: (t) => t.tracking ?? "",
  container: (t) => t.container ?? "",
  pr: (t) => t.guessedUserId ?? "",
  weight: (t) => t.weightKg,
  cbm: (t) => t.cbm,
  qty: (t) => t.qty ?? -1,
  dims: (t) => (t.width || 0) + (t.length || 0) + (t.height || 0),
  type: (t) => t.guessedProductType,
  status: (t) => t.adminStatusText ?? "",
};
// export column set (Copy/Excel · เฟส A-4)
const EXPORT_COLS: { key: string; label: string; val: (t: IngestTrack) => string | number }[] = [
  { key: "tracking", label: "แทรคกิ้ง", val: (t) => t.tracking ?? "" },
  { key: "container", label: "ตู้", val: (t) => t.container ?? "" },
  { key: "pr", label: "ลูกค้า (PR)", val: (t) => t.guessedUserId ?? "" },
  { key: "weight", label: "น้ำหนัก", val: (t) => t.weightKg || "" },
  { key: "cbm", label: "คิว", val: (t) => t.cbm || "" },
  { key: "packingW", label: "น้ำหนัก(packing)", val: (t) => t.packingWeight ?? "" },
  { key: "packingC", label: "คิว(packing)", val: (t) => t.packingCbm ?? "" },
  { key: "qty", label: "จำนวน", val: (t) => t.qty ?? "" },
  { key: "dims", label: "ขนาด(กxยxส)", val: (t) => (t.width || t.length || t.height) ? `${t.width}x${t.length}x${t.height}` : "" },
  { key: "type", label: "ประเภท", val: (t) => PRODUCT_TYPE_TH[t.guessedProductType] ?? "" },
  { key: "status", label: "สถานะ MOMO", val: (t) => t.adminStatusText ?? "" },
  { key: "entered", label: "เข้าระบบ", val: (t) => (t.committed ? `#${t.committedForwarderId ?? ""}` : "ยังไม่เข้า") },
];

type Tab = "pending" | "committed" | "all" | "mismatch";

export function MomoIngestClient({ tracks, loadError }: { tracks: IngestTrack[]; loadError: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("pending");
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState<{ urls: string[]; tracking: string } | null>(null);
  // per-row result after commit (so a just-imported row flips without waiting for refresh)
  const [rowResult, setRowResult] = useState<Record<string, { ok: boolean; message: string; fid?: number }>>({});
  // the import preview/confirm modal
  const [modal, setModal] = useState<null | { track: IngestTrack; userID: string; fShipBy: string; fProductsType: "1" | "2" | "3" | "4" }>(null);
  const [committing, setCommitting] = useState(false);
  // bulk-select + bulk import (ภูม 2026-07-14) — ติ๊กหลายแถว → นำเข้าทีเดียว (พรีวิว+ยืนยัน)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // inline edit (เฟส A-2) — แก้ น้ำหนัก/คิว/จำนวน ก่อนนำเข้า (pending only · money-safe)
  const [editing, setEditing] = useState<null | { id: string; field: "weightKg" | "cbm" | "qty"; value: string }>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  // sort + pagination (เฟส A-3/A-4)
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState(false);
  // reorderable columns (drag · เฟส A-3b)
  const { order: colOrder, move: moveCol, reset: resetCols } = useColumnOrder(DATA_KEYS);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const counts = useMemo(() => ({
    all: tracks.length,
    pending: tracks.filter((t) => !t.committed).length,
    committed: tracks.filter((t) => t.committed).length,
    mismatch: tracks.filter((t) => pkWtDiff(t) || pkVolDiff(t)).length,
  }), [tracks]);
  const invalidPr = useMemo(() => tracks.filter((t) => !t.committed && t.userIdValid === false).length, [tracks]);

  const filtered = useMemo(() => {
    let list = tracks;
    if (tab === "pending") list = list.filter((t) => !t.committed);
    else if (tab === "committed") list = list.filter((t) => t.committed);
    else if (tab === "mismatch") list = list.filter((t) => pkWtDiff(t) || pkVolDiff(t));
    const term = q.trim().toLowerCase();
    if (term)
      list = list.filter((t) =>
        (t.tracking ?? "").toLowerCase().includes(term) ||
        (t.guessedUserId ?? "").toLowerCase().includes(term) ||
        (t.container ?? "").toLowerCase().includes(term));
    return list;
  }, [tracks, tab, q]);

  const sorted = useMemo(() => {
    if (!sort || !SORT_VAL[sort.key]) return filtered;
    const val = SORT_VAL[sort.key];
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sort]);

  const ALL = 99999;
  const totalPages = perPage >= ALL ? 1 : Math.max(1, Math.ceil(sorted.length / perPage));
  const curPage = Math.min(page, totalPages);
  const paged = perPage >= ALL ? sorted : sorted.slice((curPage - 1) * perPage, curPage * perPage);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  const sortIcon = (key: string) => (sort?.key === key ? (sort.dir === "asc" ? "↑" : "↓") : "⇅");

  function exportRows(kind: "copy" | "excel") {
    const header = EXPORT_COLS.map((c) => c.label);
    const rows = sorted.map((t) => EXPORT_COLS.map((c) => String(c.val(t) ?? "")));
    if (kind === "copy") {
      const tsv = [header, ...rows].map((r) => r.join("\t")).join("\n");
      navigator.clipboard?.writeText(tsv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
      return;
    }
    // Excel = CSV (formula-injection-safe · UTF-8 BOM → เปิดใน Excel ตรงๆ)
    const esc = (v: string) => {
      const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map((c) => esc(c)).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `momo-tracks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openImport(t: IngestTrack) {
    setModal({ track: t, userID: t.guessedUserId ?? "", fShipBy: "", fProductsType: t.guessedProductType });
  }

  async function confirmImport() {
    if (!modal) return;
    const userID = modal.userID.trim().toUpperCase();
    if (!/^PR\d+$/i.test(userID)) return; // guarded by the disabled button too
    const input: CommitMomoRowInput = {
      rowId: modal.track.id,
      userID,
      fShipBy: modal.fShipBy,
      fProductsType: modal.fProductsType,
    };
    setCommitting(true);
    try {
      const res = await commitMomoRowToForwarder(input);
      if (res.ok) {
        setRowResult((m) => ({ ...m, [modal.track.id]: { ok: true, message: `เข้าระบบแล้ว #${res.data?.forwarderId}`, fid: res.data?.forwarderId } }));
        setModal(null);
        startTransition(() => router.refresh());
      } else {
        setRowResult((m) => ({ ...m, [modal.track.id]: { ok: false, message: res.error } }));
      }
    } catch (err) {
      console.error("[momo ingest commit] threw", err);
      setRowResult((m) => ({ ...m, [modal.track.id]: { ok: false, message: err instanceof Error ? err.message : "เกิดข้อผิดพลาด (ดู console)" } }));
    } finally {
      setCommitting(false);
    }
  }

  const modalUserValid = modal ? /^PR\d+$/i.test(modal.userID.trim()) : false;

  // bulk-select helpers — only rows still pending (not committed / not just-imported) are selectable.
  const isSelectable = (t: IngestTrack) => !t.committed && !rowResult[t.id]?.ok;
  const pendingVisible = paged.filter(isSelectable); // select-all = the visible page
  const allVisibleSelected = pendingVisible.length > 0 && pendingVisible.every((t) => selected.has(t.id));
  const toggleRow = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allVisibleSelected) pendingVisible.forEach((t) => n.delete(t.id));
    else pendingVisible.forEach((t) => n.add(t.id));
    return n;
  });
  // selected tracks (still pending) split into ready (valid PR) vs skip (invalid/no PR — bulk auto-skips them)
  const selectedTracks = tracks.filter((t) => selected.has(t.id) && isSelectable(t));
  const isValidPr = (pr: string | null) => /^PR\d+$/i.test((pr ?? "").trim());
  const bulkReady = selectedTracks.filter((t) => isValidPr(t.guessedUserId));
  const bulkSkip = selectedTracks.filter((t) => !isValidPr(t.guessedUserId));

  async function confirmBulk() {
    if (bulkReady.length === 0) return;
    const rows: CommitMomoRowInput[] = bulkReady.map((t) => ({
      rowId: t.id,
      userID: (t.guessedUserId ?? "").trim().toUpperCase(),
      fShipBy: "",
      fProductsType: t.guessedProductType,
    }));
    setBulkBusy(true);
    try {
      const res = await commitMomoRowsBatch({ rows });
      if (res.ok && res.data) {
        const data = res.data;
        setRowResult((m) => {
          const out = { ...m };
          for (const r of data.results) {
            out[r.rowId] = r.ok
              ? { ok: true, message: `เข้าระบบแล้ว #${r.forwarderId}`, fid: r.forwarderId }
              : { ok: false, message: r.error ?? "ล้มเหลว" };
          }
          return out;
        });
        setSelected(new Set());
        setBulkOpen(false);
        startTransition(() => router.refresh());
      }
    } catch (err) {
      console.error("[momo ingest bulk] threw", err);
    } finally {
      setBulkBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const numVal = Number(editing.value);
    if (!Number.isFinite(numVal) || numVal < 0) { setEditErr("ค่าไม่ถูกต้อง"); return; }
    const payload: Record<string, unknown> = { rowId: editing.id };
    if (editing.field === "weightKg") payload.weightKg = numVal;
    else if (editing.field === "cbm") payload.cbm = numVal;
    else payload.quantity = Math.round(numVal);
    setSavingEdit(true);
    setEditErr(null);
    try {
      const res = await updateMomoImportTrackFields(payload);
      if (res.ok) { setEditing(null); startTransition(() => router.refresh()); }
      else setEditErr(res.error);
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingEdit(false);
    }
  }

  // inline-editable measurement cell — click value → input → ✓ save / ✕ cancel.
  // Only PENDING rows are editable (isSelectable); committed rows show read-only.
  function editableCell(t: IngestTrack, field: "weightKg" | "cbm" | "qty", display: ReactNode) {
    const canEdit = isSelectable(t);
    const isEditing = editing?.id === t.id && editing.field === field;
    if (isEditing) {
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-0.5">
            <input autoFocus type="number" step="any" value={editing.value} disabled={savingEdit}
              onChange={(e) => setEditing((ed) => (ed ? { ...ed, value: e.target.value } : ed))}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); else if (e.key === "Escape") { setEditing(null); setEditErr(null); } }}
              className="w-16 rounded border border-primary-400 px-1 py-0.5 text-right text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary-300" />
            <button type="button" onClick={saveEdit} disabled={savingEdit} className="text-emerald-600 hover:text-emerald-700" title="บันทึก"><Check className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { setEditing(null); setEditErr(null); }} className="text-gray-400 hover:text-gray-600" title="ยกเลิก"><X className="h-3 w-3" /></button>
          </span>
          {editErr && <span className="text-[10px] text-red-600">{editErr}</span>}
        </span>
      );
    }
    if (!canEdit) return display;
    return (
      <span className="group inline-flex cursor-pointer items-center gap-0.5 rounded px-0.5 hover:bg-amber-50"
        onClick={() => { setEditErr(null); setEditing({ id: t.id, field, value: String(t[field] ?? "") }); }}
        title="คลิกเพื่อแก้ไข (ก่อนนำเข้า)">
        {display}<span className="text-[10px] text-gray-300 group-hover:text-amber-500">✎</span>
      </span>
    );
  }

  // reorderable DATA columns — each cell is a render fn (closes over editableCell etc.).
  const dataColumns: { key: string; label: string; align: "left" | "right"; cell: (t: IngestTrack) => ReactNode }[] = [
    { key: "tracking", label: "แทรคกิ้ง", align: "left",
      cell: (t) => <span className="font-mono font-semibold text-foreground whitespace-nowrap">{t.tracking ?? "—"}</span> },
    { key: "container", label: "ตู้", align: "left",
      cell: (t) => (
        <div className="whitespace-nowrap">
          {t.container ? (
            <Link href={`/admin/momo-containers/${encodeURIComponent(t.container)}`} className="font-mono font-semibold text-sky-700 hover:underline">
              {t.container}<span className="ml-1 text-[11px] text-muted">{t.transport ? TRANSPORT_TH[t.transport] ?? "" : ""}</span>
            </Link>
          ) : (<span className="text-[11px] text-amber-600" title={t.routingBatch ?? ""}>⏳ ยังไม่เข้าตู้ปิด</span>)}
          {t.sack && <div className="text-[11px] text-muted">กระสอบ: {t.sack}</div>}
        </div>
      ) },
    { key: "pr", label: "ลูกค้า (PR)", align: "left",
      cell: (t) => (
        <div className="whitespace-nowrap">
          {t.guessedUserId ? <span className="font-mono font-semibold">{t.guessedUserId}</span> : <span className="text-[11px] text-amber-600">MOMO ไม่ส่ง PR</span>}
          {!t.committed && t.userIdValid === false && t.guessedUserId && (
            <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[11px] font-bold text-red-700"><AlertCircle className="h-2.5 w-2.5" /> ไม่มีในระบบ</div>
          )}
          {!t.committed && t.userIdValid === true && (
            <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" /> พบในระบบ</div>
          )}
          {t.committed && t.commitUserId && t.commitUserId !== t.guessedUserId && (<div className="text-[11px] text-muted">→ {t.commitUserId}</div>)}
        </div>
      ) },
    { key: "weight", label: "น้ำหนัก", align: "right",
      cell: (t) => (
        <>
          {editableCell(t, "weightKg", t.weightKg > 0 ? <span className="font-mono">{n2(t.weightKg)}</span> : <span className="text-[11px] text-amber-700" title="MOMO ยังไม่ได้ชั่ง">⏳ รอชั่ง</span>)}
          {t.hasPacking && t.packingWeight != null && (
            <div className={`text-[11px] ${pkWtDiff(t) ? "text-rose-600 font-semibold" : "text-emerald-600"}`} title="น้ำหนักจาก packing list">📦{n2(t.packingWeight)}{pkWtDiff(t) ? " ⚠" : " ✓"}</div>
          )}
        </>
      ) },
    { key: "cbm", label: "คิว", align: "right",
      cell: (t) => (
        <>
          {editableCell(t, "cbm", <span className="font-mono">{n6(t.cbm)}</span>)}
          {t.hasPacking && t.packingCbm != null && (
            <div className={`text-[11px] ${pkVolDiff(t) ? "text-rose-600 font-semibold" : "text-emerald-600"}`} title="คิวจาก packing list">📦{n6(t.packingCbm)}{pkVolDiff(t) ? " ⚠" : " ✓"}</div>
          )}
        </>
      ) },
    { key: "qty", label: "จำนวน", align: "right", cell: (t) => editableCell(t, "qty", <span>{t.qty ?? "—"}</span>) },
    { key: "dims", label: "ขนาด (ก×ย×ส)", align: "left",
      cell: (t) => (t.width > 0 || t.length > 0 || t.height > 0)
        ? <span className="whitespace-nowrap font-mono text-[11px]">{t.width}×{t.length}×{t.height}</span>
        : <span className="text-gray-300">—</span> },
    { key: "type", label: "ประเภท", align: "left",
      cell: (t) => <span className="whitespace-nowrap">{PRODUCT_TYPE_TH[t.guessedProductType] ?? "—"}{t.guessedProductType === "3" && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">อย.</span>}</span> },
    { key: "status", label: "สถานะ MOMO", align: "left",
      cell: (t) => <span className="block max-w-[10rem] truncate text-[11px] text-muted" title={t.adminStatusText ?? ""}>{t.adminStatusText ?? t.phase ?? "—"}</span> },
  ];
  const orderedCols = colOrder.map((k) => dataColumns.find((c) => c.key === k)).filter((c): c is (typeof dataColumns)[number] => !!c);

  return (
    <div className="space-y-3">
      {/* tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        {([["pending", "🟡 ยังไม่เข้าระบบ"], ["committed", "✅ เข้าระบบแล้ว"], ["mismatch", "❗ ไม่ตรง packing"], ["all", "ทั้งหมด"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${tab === k ? "bg-primary-600 text-white" : "bg-surface-alt text-muted hover:bg-surface-alt/70"}`}>
            {label} <span className="opacity-70">{counts[k]}</span>
          </button>
        ))}
        {invalidPr > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">
            <AlertCircle className="h-3 w-3" /> PR ไม่มีในระบบ {invalidPr}
          </span>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={() => setBulkOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary-700 bg-primary-600 px-3.5 py-1 text-xs font-bold text-white hover:bg-primary-700">
            <PackageCheck className="h-3.5 w-3.5" /> นำเข้าที่เลือก ({selected.size})
          </button>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา แทรคกิ้ง / PR / เลขตู้…"
          className={`${selected.size > 0 ? "" : "ml-auto"} rounded-full border border-border bg-white dark:bg-surface px-3 py-1 text-xs w-56`} />
        <button type="button" onClick={() => router.refresh()} disabled={pending}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} /> รีเฟรช
        </button>
        <button type="button" onClick={() => exportRows("copy")} title="คัดลอกเป็นตาราง (วางใน Excel/Sheet ได้)"
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt">{copied ? "✓ คัดลอกแล้ว" : "📋 Copy"}</button>
        <button type="button" onClick={() => exportRows("excel")} title="ดาวน์โหลด .csv เปิดใน Excel"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">⬇ Excel</button>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="rounded-full border border-border bg-white dark:bg-surface px-2 py-1 text-xs" title="จำนวนแถวต่อหน้า">
          <option value={50}>50 / หน้า</option>
          <option value={100}>100 / หน้า</option>
          <option value={200}>200 / หน้า</option>
          <option value={99999}>ทั้งหมด</option>
        </select>
        <button type="button" onClick={resetCols} title="รีเซ็ตลำดับคอลัมน์"
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt">↺ คอลัมน์</button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>
      )}

      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border min-w-[1080px]">
          <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-center w-8">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} title="เลือกทั้งหมดที่ยังไม่เข้าระบบ (ในหน้านี้)" className="cursor-pointer" />
              </th>
              <th className="px-2 py-2 text-center w-8">#</th>
              <th className="px-2 py-2 text-center w-14">รูป</th>
              {orderedCols.map((c) => (
                <th key={c.key} draggable
                  onDragStart={() => setDragKey(c.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragKey) moveCol(dragKey, c.key); setDragKey(null); }}
                  onDragEnd={() => setDragKey(null)}
                  className={`cursor-move select-none px-2 py-2 ${c.align === "right" ? "text-right" : "text-left"} ${dragKey === c.key ? "bg-primary-100" : "hover:bg-surface-alt"}`}
                  title="ลากเพื่อย้ายคอลัมน์ · กดชื่อเพื่อเรียงลำดับ">
                  <span className="mr-1 text-gray-400">⋮⋮</span>
                  <button type="button" onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-1 hover:text-primary-600 ${sort?.key === c.key ? "text-primary-700" : ""}`}>
                    {c.label} <span className="text-gray-400">{sortIcon(c.key)}</span>
                  </button>
                </th>
              ))}
              <th className="px-2 py-2 text-center w-40">นำเข้าระบบ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-6 text-center text-xs text-muted">ไม่มีรายการตามเงื่อนไข</td></tr>
            )}
            {paged.map((t, i) => {
              const rr = rowResult[t.id];
              const done = t.committed || rr?.ok;
              const fid = t.committedForwarderId ?? rr?.fid ?? null;
              return (
                <tr key={t.id} className={`align-top ${done ? "bg-emerald-50/40" : selected.has(t.id) ? "bg-primary-50/40" : t.userIdValid === false ? "bg-red-50/30" : ""}`}>
                  <td className="px-2 py-1.5 text-center">
                    {isSelectable(t) && (
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleRow(t.id)} className="cursor-pointer" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center text-muted tabular-nums">{(curPage - 1) * perPage + i + 1}</td>
                  <td className="px-2 py-1.5 text-center">
                    {t.images.length > 0 ? (
                      <button type="button" onClick={() => setZoom({ urls: t.images, tracking: t.tracking ?? "—" })} className="relative inline-block" title="คลิกดูรูปป้าย (ตรวจ PR)">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.images[0]} alt="ป้าย MOMO" loading="lazy" className="h-9 w-9 rounded border border-border object-cover hover:ring-2 hover:ring-primary-400" />
                        {t.images.length > 1 && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-primary-500 px-1 text-[11px] font-bold text-white">+{t.images.length - 1}</span>}
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {orderedCols.map((c) => (
                    <td key={c.key} className={`px-2 py-1.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.cell(t)}</td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    {done ? (
                      fid ? (
                        <Link href={`/admin/forwarders/${fid}`} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> เข้าระบบแล้ว #{fid}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> เข้าระบบแล้ว</span>
                      )
                    ) : (
                      <>
                        <button type="button" onClick={() => openImport(t)}
                          className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-2 py-1.5 text-[11px] font-bold text-primary-700 hover:bg-primary-100">
                          <PackageCheck className="h-3.5 w-3.5" /> นำเข้าระบบ
                        </button>
                        {rr && !rr.ok && (
                          <div className="mt-1 flex items-start gap-1 rounded bg-red-50 px-1 py-0.5 text-[11px] text-red-700 text-left"><AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" /><span>{rr.message}</span></div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {perPage < ALL && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>แสดง {(curPage - 1) * perPage + 1}–{Math.min(curPage * perPage, sorted.length)} จาก {sorted.length}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage <= 1}
              className="rounded border border-border px-2 py-0.5 hover:bg-surface-alt disabled:opacity-40">‹ ก่อนหน้า</button>
            <span className="px-1">หน้า {curPage}/{totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages}
              className="rounded border border-border px-2 py-0.5 hover:bg-surface-alt disabled:opacity-40">ถัดไป ›</button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted leading-relaxed">
        1 แถว = 1 แทรคกิ้งลูกค้า (จาก MOMO API) · ตรวจ PR/น้ำหนัก/คิว/ประเภท ให้ถูก แล้วกด <strong>&quot;นำเข้าระบบ&quot;</strong> →
        พรีวิว+ยืนยัน → INSERT ลง tb_forwarder · น้ำหนัก/คิว = ค่ารวมทั้งชิปเมนต์จาก MOMO (ตรงกับที่จะคิดเงิน) ·
        <strong className="text-emerald-700"> 📦 = ค่าจาก packing list</strong> เทียบกับ MOMO API (<span className="text-emerald-600">✓ ตรง</span> · <span className="text-rose-600">⚠ ไม่ตรง</span>) ·
        กดเลขตู้เพื่อดูรายละเอียดทั้งตู้.
      </p>

      {/* bulk import preview + confirm modal (portal to body · ภูม 2026-07-14) */}
      {bulkOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => !bulkBusy && setBulkOpen(false)} role="button" tabIndex={-1}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface p-5 shadow-2xl space-y-3.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary-600" /> ยืนยันนำเข้าหลายรายการ</h3>
              <button type="button" onClick={() => !bulkBusy && setBulkOpen(false)} className="rounded-lg border border-border px-2 py-0.5 text-xs hover:bg-surface-alt"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="text-xs text-muted">
              เลือกไว้ {selectedTracks.length} รายการ · <span className="font-semibold text-emerald-700">พร้อมนำเข้า {bulkReady.length}</span>
              {bulkSkip.length > 0 && <> · <span className="font-semibold text-red-600">ข้าม {bulkSkip.length}</span> (PR ไม่ถูกต้อง/ไม่มี)</>}
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-[11px] border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
                <thead className="bg-surface-alt/60 text-muted sticky top-0"><tr>
                  <th className="px-2 py-1 text-left">แทรคกิ้ง</th><th className="px-2 py-1 text-left">PR</th><th className="px-2 py-1 text-right">นน. / คิว</th>
                </tr></thead>
                <tbody>
                  {bulkReady.map((t) => (
                    <tr key={t.id}><td className="px-2 py-1 font-mono">{t.tracking}</td><td className="px-2 py-1 font-mono">{t.guessedUserId}</td><td className="px-2 py-1 text-right font-mono">{n2(t.weightKg)} / {n6(t.cbm)}</td></tr>
                  ))}
                  {bulkSkip.map((t) => (
                    <tr key={t.id} className="bg-red-50/50 text-red-600"><td className="px-2 py-1 font-mono">{t.tracking}</td><td className="px-2 py-1 font-mono">{t.guessedUserId ?? "—"}</td><td className="px-2 py-1 text-right">ข้าม</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">⚠️ ตรวจ PR + น้ำหนัก/คิว ให้ถูกก่อนนำเข้า · การนำเข้าจะ INSERT ลง tb_forwarder ทันที</div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setBulkOpen(false)} disabled={bulkBusy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
              <button type="button" onClick={confirmBulk} disabled={bulkBusy || bulkReady.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-700 bg-primary-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                {bulkBusy ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> กำลังนำเข้า {bulkReady.length}…</> : <><Truck className="h-3.5 w-3.5" /> ยืนยันนำเข้า {bulkReady.length} รายการ</>}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* import preview + confirm modal — portal to body so `fixed` is relative
          to the viewport, not a transformed layout ancestor (else it opens
          mid-page and you must scroll to it · ภูม 2026-07-14). */}
      {modal && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => !committing && setModal(null)} role="button" tabIndex={-1}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary-600" /> ยืนยันนำเข้าระบบ</h3>
              <button type="button" onClick={() => !committing && setModal(null)} className="rounded-lg border border-border px-2 py-0.5 text-xs hover:bg-surface-alt"><X className="h-3.5 w-3.5" /></button>
            </div>

            <div className="rounded-lg bg-surface-alt/50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between gap-2"><span className="text-muted">แทรคกิ้ง</span><span className="font-mono font-semibold">{modal.track.tracking ?? "—"}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted">ตู้</span><span className="font-mono">{modal.track.container ?? <span className="text-amber-600">ยังไม่เข้าตู้ปิด</span>}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted">น้ำหนัก / คิว / จำนวน</span><span className="font-mono">{n2(modal.track.weightKg)} กก. · {n6(modal.track.cbm)} คิว · {modal.track.qty ?? "—"} ชิ้น</span></div>
              {(modal.track.width > 0 || modal.track.length > 0 || modal.track.height > 0) && (
                <div className="flex justify-between gap-2"><span className="text-muted">ขนาด (ก×ย×ส)</span><span className="font-mono">{modal.track.width}×{modal.track.length}×{modal.track.height}</span></div>
              )}
              {modal.track.images.length > 0 && (
                <button type="button" onClick={() => setZoom({ urls: modal.track.images, tracking: modal.track.tracking ?? "—" })} className="text-sky-600 underline text-[11px]">ดูรูปป้าย ({modal.track.images.length}) — ตรวจ PR ก่อน</button>
              )}
            </div>

            {/* editable: PR / ship / type */}
            <div className="space-y-2.5">
              <label className="block">
                <span className="text-[11px] font-semibold text-muted">ลูกค้า (PR) *</span>
                <input value={modal.userID} onChange={(e) => setModal((m) => m && { ...m, userID: e.target.value })}
                  placeholder="PR12345" disabled={committing}
                  className="mt-0.5 w-full rounded-lg border border-border px-2.5 py-1.5 font-mono text-xs uppercase focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
                {modal.userID.trim() && !modalUserValid && <span className="text-[11px] text-red-600">รูปแบบต้องเป็น PR ตามด้วยตัวเลข</span>}
                {modal.track.userIdValid === false && modal.userID.trim().toUpperCase() === (modal.track.guessedUserId ?? "").toUpperCase() && (
                  <span className="text-[11px] text-red-600">⚠️ {modal.track.guessedUserId} ไม่มีใน tb_users — แก้เป็น PR ที่ถูกต้องก่อน</span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted">ขนส่งไทย</span>
                  <select value={modal.fShipBy} onChange={(e) => setModal((m) => m && { ...m, fShipBy: e.target.value })} disabled={committing}
                    className="mt-0.5 w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary-400 focus:outline-none">
                    {SHIP_BY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted">ประเภทสินค้า</span>
                  <select value={modal.fProductsType} onChange={(e) => setModal((m) => m && { ...m, fProductsType: e.target.value as "1" | "2" | "3" | "4" })} disabled={committing}
                    className="mt-0.5 w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary-400 focus:outline-none">
                    {PRODUCT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {rowResult[modal.track.id] && !rowResult[modal.track.id].ok && (
              <div className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-700"><AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /><span>{rowResult[modal.track.id].message}</span></div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setModal(null)} disabled={committing} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
              <button type="button" onClick={confirmImport} disabled={committing || !modalUserValid}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-700 bg-primary-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                {committing ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> กำลังนำเข้า…</> : <><Truck className="h-3.5 w-3.5" /> ยืนยันนำเข้าระบบ</>}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* image lightbox — portal to body too (same fixed-positioning reason) */}
      {zoom && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 cursor-zoom-out" onClick={() => setZoom(null)} role="button" tabIndex={-1}>
          <div className="relative max-w-3xl w-full space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-white">
              <span className="font-mono text-sm font-bold">{zoom.tracking} · ป้าย MOMO ({zoom.urls.length})</span>
              <button type="button" onClick={() => setZoom(null)} className="rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20"><X className="h-3 w-3 inline" /> ปิด</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[80vh] overflow-auto">
              {zoom.urls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u + i} src={u} alt={`ป้าย ${i + 1}`} loading="lazy" className="w-full rounded-lg border border-white/20" />
              ))}
            </div>
            <p className="text-[11px] text-white/60 text-center">⚠️ ตรวจเลข PR บนป้ายให้ตรงก่อนนำเข้าระบบ</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
