"use client";

/**
 * MOMO sync/ingest workspace — per-tracking grid (ภูม 2026-07-14 · rework).
 *
 * Row = 1 customer tracking (from momo_import_tracks · committed + pending).
 * ตรวจ PR/น้ำหนัก/คิว/ขนส่ง/ประเภท ต่อแทรค → กด "นำเข้าระบบ" → modal พรีวิว+ยืนยัน →
 * commitMomoRowToForwarder (wrap · ไม่เขียน commit ใหม่). แถวที่เข้าแล้วโชว์ "เข้าระบบแล้ว".
 * กดเลขตู้ → หน้า detail /[cabinet] (เก็บไว้).
 */

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { ALL_WORKBOOK_CARRIER_OPTIONS } from "@/lib/cart/ship-by-eligibility";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { cgMatchesQty } from "@/lib/forwarder/cg-range";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CheckCircle2, AlertCircle, RefreshCw, X, PackageCheck, Truck, Check } from "lucide-react";
import { commitMomoRowToForwarder } from "@/actions/admin/momo-commit";
import { propagateMomoLiveStatusNow } from "@/actions/admin/momo-web-live";
import { addMissingMomoParcelsBulk } from "@/actions/admin/momo-add-missing";
import { updateMomoImportTrackFields } from "@/actions/admin/momo-ingest-edit";
import { confirm } from "@/components/ui/confirm";
import { useColumnOrder } from "@/lib/hooks/use-column-order";
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
  // packing-list (Shipment Report) columns — ที่ MOMO ส่งมาจริง
  smDate: string | null;      // C "SM Date"
  userCode: string | null;    // I "Code"
  cgNo: string | null;        // T "CG."
  serviceFee: number | null;  // V "Service fee." (= extra_cost ของ MOMO)
  etd: string | null;         // Y — จาก packing list ระดับตู้ (taem_container_etd_eta)
  eta: string | null;         // Z — ↑
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
  // เฟส B — MOMO Live match (closed-container manifest · null = ไม่มีใน Live)
  hasLive: boolean;
  liveWeight: number | null;
  liveCbm: number | null;
  // 🚩 "MOMO มั่ว" — box_detail ต่อกล่องขัดกับก้อนรวม + dims ก็ซ่อมไม่ได้ (แถวย่อยหนัก
  // เกินก้อนรวม) → แตกกล่องอัตโนมัติไม่ได้ · ต้องอัพ packing list แต้ม. null = ปกติ.
  momoGarbage: {
    reason: "weight" | "cbm";
    boxCount: number;
    boxWeightSum: number;
    aggWeight: number;
    boxCbmSum: number;
    aggCbm: number;
  } | null;
  // กล่องย่อยที่ MOMO แตก (จาก momo_box_detail · >1 กล่อง) — กางออกเป็นแถวจริงใต้แถวหลัก
  // ให้ตรงกับ MOMO Live 1:1 (owner/ภูม 2026-07-15). ว่าง = แทรคกล่องเดียว/ไม่มี box_detail.
  boxes: IngestBoxRow[];
};

/** One MOMO box (per-BOX total metrics) — rendered as a sub-row under its tracking. */
export type IngestBoxRow = {
  tracking: string;
  weight: number; // box total weight (kg) = per-piece × qty
  cbm: number;    // box total คิว
  w: number;
  l: number;
  h: number;
  qty: number;
};

// เฟส C — a parcel in the packing list that MOMO API never sent (พัสดุขาด).
export type MissingParcel = {
  tracking: string;
  cabinet: string;
  code: string | null; // PR from packing (may be non-PR → ต้องกรอกเอง)
  weight: number | null;
  cbm: number | null;
  boxes: number | null;
  inLive: boolean;
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
/** API weight/cbm disagrees with MOMO Live (closed-container manifest). */
function liveWtDiff(t: IngestTrack): boolean {
  return t.hasLive && t.liveWeight != null && t.weightKg > 0 && Math.abs(t.weightKg - t.liveWeight) > WT_EPS;
}
function liveVolDiff(t: IngestTrack): boolean {
  return t.hasLive && t.liveCbm != null && t.cbm > 0 && Math.abs(t.cbm - t.liveCbm) > VOL_EPS;
}

// 🔴 CLOSED CARRIER LIST (owner 2026-07-14) — "บังคับให้เลือกให้ใส่แค่ที่มีในไฟล์ที่ส่งให้เท่านั้น".
// The hardcoded list here used to offer DHL (1) · Kerry (4) · Nim Express (5) · ไปรษณีย์ไทย (11) —
// none of which are in the owner's workbook → gone. At MOMO-commit time the delivery address is
// often still unknown, so the list is the whole CLOSED workbook (28); the per-province half of the
// rule is enforced server-side (commitMomoRowToForwarder → checkCarrierForProvince) once an
// address IS attached, and on every later edit.
const SHIP_BY_OPTIONS: { value: string; label: string }[] = [
  // ภูม 2026-06-25 ("ตัดออก") — default ว่าง · ไม่บังคับเลือกตอน commit MOMO.
  { value: "",    label: "— ยังไม่ระบุ (เซล/ลูกค้ากรอกภายหลัง) —" },
  { value: "PCS", label: "รับเองโกดัง Pacred (สมุทรสาคร)" },
  ...ALL_WORKBOOK_CARRIER_OPTIONS.map((c) => ({ value: c.id, label: c.name })),
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
// ── ตารางแบบ packing list (Shipment Report ของแต้ม · owner ปอน 2026-07-14) ──
// เลขแบบ excel: ตรึงทศนิยม (2 ตำแหน่งน้ำหนัก · 6 ตำแหน่งคิว) · 0 ก็โชว์ 0.00 ไม่ใช่ขีด
const fx = (v: number | null | undefined, d: number) =>
  v == null || !Number.isFinite(v) ? null : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
/** ค่าต่อกล่อง = ยอดรวมทั้งแทรค ÷ จำนวนกล่อง (MOMO ส่ง kg/cbm มาเป็นยอดรวม · ยืนยันจาก W×L×H×จำนวน) */
const perBox = (total: number, qty: number | null) => (qty && qty > 0 ? total / qty : total);
const dateOnly = (s: string | null) => (s ? s.slice(0, 10) : null);
/** คอลัมน์ที่มีในไฟล์ packing list แต่ MOMO API ไม่ส่งมา — โชว์ไว้ให้ครบฟอร์ม (ไม่เดาค่า) */
const NO_FEED = "MOMO API ไม่ส่งคอลัมน์นี้มา — มีเฉพาะในไฟล์ packing list ของแต้ม";
const thNoFeed = "px-2 py-2 text-center font-normal italic text-muted/50";
const tdNoFeed = "px-2 py-1.5 text-center text-gray-300";
const DASH = <span className="text-gray-300">—</span>;

// กล่องย่อย (box sub-row) → ค่าที่โชว์ต่อคอลัมน์ (ตาม colOrder เพื่อให้ตรงหลักกับแถวหลัก).
// โชว์เฉพาะคอลัมน์ที่มีความหมายต่อกล่อง (Tracking/W/L/H/จำนวน/น้ำหนัก/คิว) · ที่เหลือเว้นว่าง.
function boxCell(box: IngestBoxRow, key: string): ReactNode {
  switch (key) {
    case "tracking":
      return <span className="pl-3 font-mono text-[11px] text-sky-700">↳ {box.tracking}</span>;
    case "w": return box.w > 0 ? box.w : DASH;
    case "l": return box.l > 0 ? box.l : DASH;
    case "h": return box.h > 0 ? box.h : DASH;
    case "totalParcel": return box.qty;
    case "wt": return box.qty > 0 ? fx(box.weight / box.qty, 2) : DASH;
    case "vol": return box.qty > 0 ? fx(box.cbm / box.qty, 6) : DASH;
    case "totalWt": return <span className="font-mono font-semibold">{fx(box.weight, 2)}</span>;
    case "totalVol": return <span className="font-semibold">{fx(box.cbm, 6)}</span>;
    default: return null; // คอลัมน์อื่น (รูป/ตู้/PR/ประเภท/สถานะ ฯลฯ) inherit จากแถวหลัก → เว้นว่าง
  }
}

// export column set (Copy/Excel · เฟส A-4)
const EXPORT_COLS: { label: string; val: (t: IngestTrack) => string | number }[] = [
  { label: "แทรคกิ้ง", val: (t) => t.tracking ?? "" },
  { label: "ตู้", val: (t) => t.container ?? "" },
  { label: "ลูกค้า (PR)", val: (t) => t.guessedUserId ?? "" },
  { label: "น้ำหนัก", val: (t) => t.weightKg || "" },
  { label: "คิว", val: (t) => t.cbm || "" },
  { label: "น้ำหนัก(packing)", val: (t) => t.packingWeight ?? "" },
  { label: "คิว(packing)", val: (t) => t.packingCbm ?? "" },
  { label: "น้ำหนัก(Live)", val: (t) => t.liveWeight ?? "" },
  { label: "คิว(Live)", val: (t) => t.liveCbm ?? "" },
  { label: "จำนวน", val: (t) => t.qty ?? "" },
  { label: "ขนาด(กxยxส)", val: (t) => (t.width || t.length || t.height) ? `${t.width}x${t.length}x${t.height}` : "" },
  { label: "ประเภท", val: (t) => PRODUCT_TYPE_TH[t.guessedProductType] ?? "" },
  { label: "สถานะ MOMO", val: (t) => t.adminStatusText ?? "" },
  { label: "เข้าระบบ", val: (t) => (t.committed ? `#${t.committedForwarderId ?? ""}` : "ยังไม่เข้า") },
];

// ⇅ sortable columns → value getter (คีย์ = sortKey ของแต่ละคอลัมน์)
const SORT_VAL: Record<string, (t: IngestTrack) => string | number> = {
  container: (t) => t.container ?? "",
  smDate: (t) => t.smDate ?? "",
  type: (t) => t.guessedProductType,
  pr: (t) => t.guessedUserId ?? "",
  tracking: (t) => t.tracking ?? "",
  w: (t) => t.width || 0,
  l: (t) => t.length || 0,
  h: (t) => t.height || 0,
  qty: (t) => t.qty ?? -1,
  weight: (t) => t.weightKg,
  cbm: (t) => t.cbm,
};
// ⋮⋮ default column order (checkbox # = คอลัมน์แรกตายตัว · 27 ตัวนี้ลากย้ายได้ · = ลำดับตารางปอนเป๊ะ)
const DATA_KEYS = [
  "image", "container", "trans", "smDate", "smNumber", "branch", "product", "dum", "type", "code",
  "tracking", "w", "l", "h", "totalParcel", "wt", "vol", "totalWt", "totalVol", "rem", "cg", "note",
  "serviceFee", "status", "return", "etd", "eta",
];

type Tab = "pending" | "committed" | "all" | "mismatch" | "garbage";

export function MomoIngestClient({ tracks, missing, loadError }: { tracks: IngestTrack[]; missing: MissingParcel[]; loadError: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("pending");
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState<{ urls: string[]; tracking: string } | null>(null);
  // เฟส B/C — Live pull + Copy/Excel + missing-parcel recovery (ภูม · re-added on ปอน table 2026-07-14)
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveMsg, setLiveMsg] = useState<string | null>(null);
  const [liveConfirm, setLiveConfirm] = useState(false); // preview-before-pull modal
  const [missingBusy, setMissingBusy] = useState(false);
  const [missingMsg, setMissingMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // ⇅ sort + ⋮⋮ reorderable columns (ไอแต้ม-style · re-added on ปอน table 2026-07-14)
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  // ── shipment dropdown (owner 2026-07-19 "ทำเป็นดรอปดาว เรียงตามชิปเม้น · กดค่อยแสดงแทรค") ──
  const [openFams, setOpenFams] = useState<Set<string>>(new Set());
  const toggleFam = (base: string) =>
    setOpenFams((prev) => { const nx = new Set(prev); if (nx.has(base)) nx.delete(base); else nx.add(base); return nx; });
  const [dragKey, setDragKey] = useState<string | null>(null);
  const { order: colOrder, move: moveCol, reset: resetCols } = useColumnOrder(DATA_KEYS);
  // ✎ inline-edit น้ำหนัก/คิว/จำนวน (pending only · updateMomoImportTrackFields · แก้ก่อนนำเข้า)
  const [editing, setEditing] = useState<{ id: string; field: "weightKg" | "cbm" | "qty" | "width" | "length" | "height" | "pr"; value: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  // per-row result after commit (so a just-imported row flips without waiting for refresh)
  const [rowResult, setRowResult] = useState<Record<string, { ok: boolean; message: string; fid?: number }>>({});
  // the import preview/confirm modal
  const [modal, setModal] = useState<null | { track: IngestTrack; userID: string; fShipBy: string; fProductsType: "1" | "2" | "3" | "4" }>(null);
  const [committing, setCommitting] = useState(false);
  // ── เลือกรายการ → นำเข้าระบบ (owner ปอน 2026-07-14: เอาปุ่มรายแถวออก · ติ๊กเลือกแล้วกดปุ่มเดียว) ──
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<null | { ok: number; errors: { tracking: string; message: string }[] }>(null);

  const counts = useMemo(() => ({
    all: tracks.length,
    pending: tracks.filter((t) => !t.committed).length,
    committed: tracks.filter((t) => t.committed).length,
    mismatch: tracks.filter((t) => pkWtDiff(t) || pkVolDiff(t) || liveWtDiff(t) || liveVolDiff(t)).length,
    garbage: tracks.filter((t) => t.momoGarbage).length,
  }), [tracks]);
  const invalidPr = useMemo(() => tracks.filter((t) => !t.committed && t.userIdValid === false).length, [tracks]);

  const filtered = useMemo(() => {
    let list = tracks;
    if (tab === "pending") list = list.filter((t) => !t.committed);
    else if (tab === "committed") list = list.filter((t) => t.committed);
    else if (tab === "mismatch") list = list.filter((t) => pkWtDiff(t) || pkVolDiff(t) || liveWtDiff(t) || liveVolDiff(t));
    else if (tab === "garbage") list = list.filter((t) => t.momoGarbage);
    const term = q.trim().toLowerCase();
    if (term)
      list = list.filter((t) =>
        (t.tracking ?? "").toLowerCase().includes(term) ||
        (t.guessedUserId ?? "").toLowerCase().includes(term) ||
        (t.container ?? "").toLowerCase().includes(term));
    return list;
  }, [tracks, tab, q]);

  // apply ⇅ sort (in-session · stable when no sort) — the table renders `sorted`
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const get = SORT_VAL[sort.key];
    if (!get) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  // ── SHIPMENT (family) grouping — owner 2026-07-19 "จับคู่แล้วกรุ๊ปไม่ถูก ตั้งแต่ต้นน้ำ" ──
  // MOMO's feed sends EVERY box-group as its own staging row (base + -2..-N), and the
  // table rendered each as an independent header each nesting the WHOLE family's
  // box_detail → an 18-box shipment painted 18×18 rows. Group by BASE tracking:
  // the first row (bare, else lowest suffix) = the shipment header; the rest render
  // as indented MEMBER rows (checkbox/commit per row unchanged — display only).
  const families = useMemo(() => {
    const byBase = new Map<string, typeof sorted>();
    const order: string[] = [];
    for (const t of sorted) {
      const b = (t.tracking ? baseTracking(t.tracking) : null) ?? `__solo_${t.id}`;
      if (!byBase.has(b)) { byBase.set(b, []); order.push(b); }
      byBase.get(b)!.push(t);
    }
    return order.map((b) => {
      const fam = [...byBase.get(b)!];
      fam.sort((x, y) =>
        x.tracking === b ? -1 : y.tracking === b ? 1 :
        String(x.tracking ?? "").localeCompare(String(y.tracking ?? ""), undefined, { numeric: true }));
      return fam;
    });
  }, [sorted]);
  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  const sortIcon = (key: string) => (sort?.key === key ? (sort.dir === "asc" ? "↑" : "↓") : "⇅");

  // ── ติ๊กเลือก — เลือกได้เฉพาะแถวที่ "ยังไม่เข้าระบบ" และอยู่ในผลกรองปัจจุบัน ──
  const allPendingIds = useMemo(
    () => filtered.filter((t) => !t.committed && !rowResult[t.id]?.ok).map((t) => t.id),
    [filtered, rowResult],
  );
  const selectedTracks = useMemo(() => tracks.filter((t) => sel.has(t.id) && !t.committed), [tracks, sel]);
  const invalidSelected = useMemo(() => selectedTracks.filter((t) => t.userIdValid !== true).length, [selectedTracks]);
  const allSelected = allPendingIds.length > 0 && allPendingIds.every((id) => sel.has(id));
  const someSelected = !allSelected && allPendingIds.some((id) => sel.has(id));
  function toggleAll() {
    setSel((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const id of allPendingIds) next.delete(id);
      else for (const id of allPendingIds) next.add(id);
      return next;
    });
  }
  function toggleOne(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openImport(t: IngestTrack) {
    setModal({ track: t, userID: t.guessedUserId ?? "", fShipBy: "", fProductsType: t.guessedProductType });
  }

  /**
   * กดปุ่ม "นำเข้าระบบ":
   *   เลือก 1 รายการ → modal เดิม (ตรวจ/แก้ PR · ขนส่ง · ประเภทสินค้า ก่อนยืนยัน — ทางเดียว
   *     ที่แก้ PR ผิดได้ เลยต้องคงไว้หลังเอาปุ่มรายแถวออก)
   *   เลือกหลายรายการ → ยืนยันรวม แล้วยิงทีละแถวผ่าน commitMomoRowToForwarder ตัวเดิม
   */
  function onImportClick() {
    if (selectedTracks.length === 0) return;
    if (selectedTracks.length === 1) {
      openImport(selectedTracks[0]);
      return;
    }
    setBulkOpen(true);
  }

  /** ยิงทีละแถว (ไม่ยิงพร้อมกัน) ผ่าน chokepoint เดิม — ค่าที่ commit เท่ากับกดปุ่มรายแถวเป๊ะ
      (PR ที่ระบบเดาได้ · ขนส่ง = ยังไม่ระบุ · ประเภทสินค้า = ที่ map จาก MOMO).
      แถวไหน PR ไม่ตรง tb_users → action ปฏิเสธเอง (ไม่มีการเดา) แล้วรายงานเป็น "ไม่สำเร็จ". */
  async function runBulkImport() {
    setBulkRunning(true);
    const errors: { tracking: string; message: string }[] = [];
    let ok = 0;
    for (const t of selectedTracks) {
      const label = t.tracking ?? t.id;
      try {
        const res = await commitMomoRowToForwarder({
          rowId: t.id,
          userID: (t.guessedUserId ?? "").trim().toUpperCase(),
          fShipBy: "",
          fProductsType: t.guessedProductType,
        } satisfies CommitMomoRowInput);
        if (res.ok) {
          ok++;
          setRowResult((m) => ({ ...m, [t.id]: { ok: true, message: `เข้าระบบแล้ว #${res.data?.forwarderId}`, fid: res.data?.forwarderId } }));
          setSel((prev) => {
            const next = new Set(prev);
            next.delete(t.id);
            return next;
          });
        } else {
          errors.push({ tracking: label, message: res.error });
          setRowResult((m) => ({ ...m, [t.id]: { ok: false, message: res.error } }));
        }
      } catch (err) {
        console.error("[momo bulk import] threw", err);
        const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด (ดู console)";
        errors.push({ tracking: label, message });
        setRowResult((m) => ({ ...m, [t.id]: { ok: false, message } }));
      }
    }
    setBulkRunning(false);
    setBulkOpen(false);
    setBulkResult({ ok, errors });
    startTransition(() => router.refresh());
  }

  // ── เฟส C — พัสดุขาด (packing มี · API ไม่ส่ง) → ดึงเข้าระบบผ่าน addMissingMomoParcelsBulk (guarded) ──
  const isValidPr = (pr: string | null) => /^PR\d+$/i.test((pr ?? "").trim());
  const missingReady = missing.filter((m) => isValidPr(m.code));
  const missingNoPr = missing.filter((m) => !isValidPr(m.code));

  async function onCreateMissing() {
    if (missingReady.length === 0) return;
    if (!(await confirm(`ดึงพัสดุที่ขาด ${missingReady.length} รายการ เข้าระบบ?\n\nสร้างรายการ tb_forwarder ให้พัสดุที่มีใน packing list แต่ MOMO API ไม่ส่ง (ใช้ PR/น้ำหนัก/คิว จาก packing · ข้ามรายการที่มีในระบบแล้วอัตโนมัติ · มี guard กันซ้ำ + เช็ค PR)`))) return;
    setMissingBusy(true);
    setMissingMsg(null);
    try {
      const rows = missingReady.map((m) => ({
        tracking: m.tracking,
        cabinet: m.cabinet,
        memberCode: (m.code ?? "").toUpperCase(),
        weightKg: m.weight ?? 0,
        cbm: m.cbm ?? 0,
        boxCount: m.boxes && m.boxes > 0 ? m.boxes : undefined,
      }));
      const res = await addMissingMomoParcelsBulk(rows);
      if (res.ok && res.data) {
        setMissingMsg(`✅ ดึงเข้าระบบ ${res.data.added} · ข้าม (มีแล้ว) ${res.data.skipped} · ล้มเหลว ${res.data.failed}`);
        startTransition(() => router.refresh());
      } else {
        setMissingMsg(res.ok ? "เสร็จ" : `⚠️ ${res.error}`);
      }
    } catch (err) {
      setMissingMsg(err instanceof Error ? `⚠️ ${err.message}` : "⚠️ ดึงไม่สำเร็จ");
    } finally {
      setMissingBusy(false);
    }
  }

  // ── เฟส B — ดึง Live สด (propagateMomoLiveStatusNow · เติม tb_forwarder ที่ commit แล้ว + staging pending) ──
  async function onPullLive() {
    setLiveConfirm(false);
    setLiveBusy(true);
    setLiveMsg(null);
    try {
      const res = await propagateMomoLiveStatusNow();
      if (res.ok && res.data) {
        const s = res.data;
        setLiveMsg(`✅ ดึง Live สำเร็จ · อัปเดตสถานะ ${s.summary.advanced} · เติมข้อมูล(เข้าระบบแล้ว) ${s.data.filled} · เติมข้อมูล(ยังไม่นำเข้า) ${s.staging.filled} · เลขตู้ ${s.cabinet.filled} · แตกกล่อง ${s.boxSplit.split}`);
        startTransition(() => router.refresh());
      } else {
        setLiveMsg(res.ok ? "ดึง Live เสร็จ" : `⚠️ ดึง Live ไม่สำเร็จ: ${res.error}`);
      }
    } catch (err) {
      setLiveMsg(err instanceof Error ? `⚠️ ดึง Live ไม่สำเร็จ: ${err.message}` : "⚠️ ดึง Live ไม่สำเร็จ");
    } finally {
      setLiveBusy(false);
    }
  }

  // Copy/Excel export — ส่งออก "ตามที่กรองอยู่" (filtered) · Copy=TSV clipboard · Excel=CSV (UTF-8 BOM · formula-safe)
  function exportRows(kind: "copy" | "excel") {
    const header = EXPORT_COLS.map((c) => c.label);
    const rows = sorted.map((t) => EXPORT_COLS.map((c) => String(c.val(t) ?? "")));
    if (kind === "copy") {
      const tsv = [header, ...rows].map((r) => r.join("\t")).join("\n");
      navigator.clipboard?.writeText(tsv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
      return;
    }
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

  // full-data preview table — for the Live modal (show incomplete pending rows to verify · ภูม "โชว์ครบเหมือนตาราง").
  function previewTable(rows: IngestTrack[]) {
    return (
      <div className="max-h-72 overflow-auto rounded-lg border border-border">
        <table className="w-full whitespace-nowrap border-collapse text-[11px] [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
          <thead className="sticky top-0 bg-surface-alt/60 text-muted"><tr>
            <th className="px-2 py-1 text-left">แทรคกิ้ง</th><th className="px-2 py-1 text-left">ตู้</th><th className="px-2 py-1 text-left">PR</th>
            <th className="px-2 py-1 text-right">น้ำหนัก</th><th className="px-2 py-1 text-right">คิว</th><th className="px-2 py-1 text-right">จำนวน</th>
            <th className="px-2 py-1 text-left">ขนาด</th><th className="px-2 py-1 text-left">ประเภท</th><th className="px-2 py-1 text-left">สถานะ MOMO</th>
          </tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="px-2 py-1 font-mono font-semibold">{t.tracking}</td>
                <td className="px-2 py-1 font-mono">{t.container ?? <span className="text-amber-600">ยังไม่เข้าตู้</span>}</td>
                <td className="px-2 py-1 font-mono">{t.guessedUserId}</td>
                <td className="px-2 py-1 text-right font-mono">{t.weightKg > 0 ? n2(t.weightKg) : <span className="text-amber-600">รอชั่ง</span>}</td>
                <td className="px-2 py-1 text-right font-mono">{n6(t.cbm)}</td>
                <td className="px-2 py-1 text-right">{t.qty ?? "—"}</td>
                <td className="px-2 py-1 font-mono">{t.width > 0 || t.length > 0 || t.height > 0 ? `${t.width}×${t.length}×${t.height}` : "—"}</td>
                <td className="px-2 py-1">{PRODUCT_TYPE_TH[t.guessedProductType] ?? "—"}</td>
                <td className="max-w-[9rem] truncate px-2 py-1" title={t.adminStatusText ?? ""}>{t.adminStatusText ?? t.phase ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
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

  // ✎ บันทึกการแก้ไข น้ำหนัก/คิว/จำนวน — wrap updateMomoImportTrackFields (pending-only · money-safe)
  async function saveEdit() {
    if (!editing) return;
    const payload: Record<string, unknown> = { rowId: editing.id };
    if (editing.field === "pr") {
      payload.memberCode = editing.value.trim().toUpperCase(); // "" = เคลียร์ PR
    } else {
      const numVal = Number(editing.value);
      if (!Number.isFinite(numVal) || numVal < 0) { setEditErr("ค่าไม่ถูกต้อง"); return; }
      if (editing.field === "weightKg") payload.weightKg = numVal;
      else if (editing.field === "cbm") payload.cbm = numVal;
      else if (editing.field === "qty") payload.quantity = Math.round(numVal);
      else if (editing.field === "width") payload.width = numVal;
      else if (editing.field === "length") payload.length = numVal;
      else payload.height = numVal; // "height"
    }
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

  // ค่าเริ่มต้นของช่องแก้ไขต่อ field (PR = guessedUserId · dims/measure = คอลัมน์)
  function fieldInitValue(t: IngestTrack, field: NonNullable<typeof editing>["field"]): string {
    switch (field) {
      case "pr": return t.guessedUserId ?? "";
      case "weightKg": return t.weightKg > 0 ? String(t.weightKg) : "";
      case "cbm": return t.cbm > 0 ? String(t.cbm) : "";
      case "qty": return t.qty != null ? String(t.qty) : "";
      case "width": return t.width > 0 ? String(t.width) : "";
      case "length": return t.length > 0 ? String(t.length) : "";
      case "height": return t.height > 0 ? String(t.height) : "";
    }
  }

  // inline-editable cell — click value → input → ✓ save / ✕ cancel. Only PENDING rows editable
  // (not committed / not just-imported). PR = text (parse → member_code) · อื่น = number.
  function editableCell(t: IngestTrack, field: NonNullable<typeof editing>["field"], display: ReactNode) {
    const canEdit = !t.committed && !rowResult[t.id]?.ok;
    const isEditing = editing?.id === t.id && editing.field === field;
    const isPr = field === "pr";
    if (isEditing) {
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-0.5">
            <input autoFocus type={isPr ? "text" : "number"} step={isPr ? undefined : "any"} value={editing.value} disabled={savingEdit}
              placeholder={isPr ? "PR545" : undefined}
              onChange={(e) => setEditing((ed) => (ed ? { ...ed, value: isPr ? e.target.value.toUpperCase() : e.target.value } : ed))}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); else if (e.key === "Escape") { setEditing(null); setEditErr(null); } }}
              className={`${isPr ? "w-20 text-left uppercase" : "w-16 text-right"} rounded border border-primary-400 px-1 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary-300`} />
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
        onClick={() => { setEditErr(null); setEditing({ id: t.id, field, value: fieldInitValue(t, field) }); }}
        title="คลิกเพื่อแก้ไข (ก่อนนำเข้า)">
        {display}<span className="text-[10px] text-gray-300 group-hover:text-amber-500">✎</span>
      </span>
    );
  }

  // คอลัมน์ตาราง (config-driven · ลากย้าย/เรียงได้ · เนื้อหา = ตารางปอนเป๊ะ) — checkbox #
  // เป็นคอลัมน์แรกตายตัว (render แยกในตาราง) · 27 ตัวนี้อยู่ใน DATA_KEYS/colOrder.
  const colDefs: Record<string, {
    label: string; sortKey?: string; thTitle?: string; noFeed?: boolean;
    tdClass: string; tdTitle?: (t: IngestTrack) => string | undefined; td: (t: IngestTrack) => ReactNode;
  }> = {
    image: {
      label: "รูป", tdClass: "px-2 py-1.5 text-center",
      td: (t) => t.images.length > 0 ? (
        <button type="button" onClick={() => setZoom({ urls: t.images, tracking: t.tracking ?? "—" })} className="relative inline-block" title="คลิกดูรูปป้าย (ตรวจ PR)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.images[0]} alt="ป้าย MOMO" loading="lazy" className="h-9 w-9 rounded border border-border object-cover hover:ring-2 hover:ring-primary-400" />
          {t.images.length > 1 && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-primary-500 px-1 text-[11px] font-bold text-white">+{t.images.length - 1}</span>}
        </button>
      ) : <span className="text-gray-300">—</span>,
    },
    container: {
      label: "Container Name", sortKey: "container", tdClass: "px-2 py-1.5 whitespace-nowrap",
      td: (t) => (
        <>
          {t.container ? (
            <Link href={`/admin/momo-containers/${encodeURIComponent(t.container)}`} className="font-mono font-semibold text-sky-700 hover:underline">{t.container}</Link>
          ) : (<span className="text-[11px] text-amber-600" title={t.routingBatch ?? ""}>⏳ ยังไม่เข้าตู้ปิด</span>)}
          {t.sack && <div className="text-[11px] text-muted">กระสอบ: {t.sack}</div>}
          {t.momoGarbage && (
            <div className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-red-600 px-1 py-0.5 text-[11px] font-bold text-white"
              title={`ตัวเลข MOMO ขัดกันเอง — กล่องย่อย (box_detail) ${t.momoGarbage.boxCount} กล่อง รวม${
                t.momoGarbage.reason === "weight"
                  ? `น้ำหนัก ${n2(t.momoGarbage.boxWeightSum)} กก. เกินก้อนรวม ${n2(t.momoGarbage.aggWeight)} กก.`
                  : `คิว ${n6(t.momoGarbage.boxCbmSum)} เกินก้อนรวม ${n6(t.momoGarbage.aggCbm)}`
              } · ขนาดกล่องก็เช็คไม่ได้ → แตกกล่องอัตโนมัติไม่ได้ · ต้องอัพ packing list แต้ม`}>
              🚩 ข้อมูล MOMO ขัดกันเอง
            </div>
          )}
        </>
      ),
    },
    trans: { label: "Trans", tdClass: "px-2 py-1.5 text-center whitespace-nowrap", td: (t) => (t.transport && TRANSPORT_TH[t.transport]) || DASH },
    smDate: { label: "SM Date", sortKey: "smDate", tdClass: "px-2 py-1.5 text-center tabular-nums whitespace-nowrap", tdTitle: (t) => t.smDate ?? "", td: (t) => dateOnly(t.smDate) ?? DASH },
    smNumber: { label: "SM Number", noFeed: true, tdClass: tdNoFeed, td: () => "—" },
    branch: { label: "Branch", noFeed: true, tdClass: tdNoFeed, td: () => "—" },
    product: { label: "Product", noFeed: true, tdClass: tdNoFeed, td: () => "—" },
    dum: { label: "Dum", noFeed: true, tdClass: tdNoFeed, td: () => "—" },
    type: {
      label: "Type", sortKey: "type", tdClass: "px-2 py-1.5 text-center whitespace-nowrap",
      td: (t) => (<>{PRODUCT_TYPE_TH[t.guessedProductType] ?? "—"}{t.guessedProductType === "3" && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">อย.</span>}</>),
    },
    code: {
      label: "Code", sortKey: "pr", tdClass: "px-2 py-1.5 whitespace-nowrap",
      td: (t) => (
        <>
          {editableCell(t, "pr", t.guessedUserId ? <span className="font-mono font-semibold">{t.guessedUserId}</span> : <span className="text-[11px] text-amber-600">MOMO ไม่ส่ง PR</span>)}
          {t.userCode && <span className="ml-1 text-[11px] text-muted" title="รหัสลูกค้าดิบจาก MOMO (user_code)">({t.userCode})</span>}
          {!t.committed && t.userIdValid === false && t.guessedUserId && (<div className="mt-0.5 inline-flex items-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[11px] font-bold text-red-700"><AlertCircle className="h-2.5 w-2.5" /> ไม่มีในระบบ</div>)}
          {!t.committed && t.userIdValid === true && (<div className="mt-0.5 inline-flex items-center gap-1 rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" /> พบในระบบ</div>)}
          {t.committed && t.commitUserId && t.commitUserId !== t.guessedUserId && (<div className="text-[11px] text-muted">→ {t.commitUserId}</div>)}
        </>
      ),
    },
    tracking: { label: "Tracking", sortKey: "tracking", tdClass: "px-2 py-1.5 font-mono font-semibold text-foreground whitespace-nowrap", td: (t) => t.tracking ?? "—" },
    w: { label: "W.", sortKey: "w", thTitle: "กว้าง (ซม.) ต่อกล่อง · แก้ไขได้", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono", td: (t) => editableCell(t, "width", t.width > 0 ? t.width : DASH) },
    l: { label: "L.", sortKey: "l", thTitle: "ยาว (ซม.) ต่อกล่อง · แก้ไขได้", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono", td: (t) => editableCell(t, "length", t.length > 0 ? t.length : DASH) },
    h: { label: "H.", sortKey: "h", thTitle: "สูง (ซม.) ต่อกล่อง · แก้ไขได้", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono", td: (t) => editableCell(t, "height", t.height > 0 ? t.height : DASH) },
    totalParcel: { label: "Total Parcel", sortKey: "qty", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono", td: (t) => editableCell(t, "qty", t.qty ?? DASH) },
    wt: { label: "Wt.", thTitle: "น้ำหนักต่อกล่อง = Total Wt. ÷ Total Parcel", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono text-muted", td: (t) => t.weightKg > 0 ? fx(perBox(t.weightKg, t.qty), 2) : DASH },
    vol: { label: "Vol.", thTitle: "คิวต่อกล่อง = W×L×H", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono text-muted", td: (t) => t.cbm > 0 ? fx(perBox(t.cbm, t.qty), 6) : DASH },
    totalWt: {
      label: "Total Wt.", sortKey: "weight", thTitle: "น้ำหนักรวมทั้งแทรค — ค่าที่ใช้คิดเงิน", tdClass: "px-2 py-1.5 text-right tabular-nums",
      td: (t) => (
        <>
          {editableCell(t, "weightKg", t.weightKg > 0 ? <span className="font-mono font-semibold">{fx(t.weightKg, 2)}</span> : <span className="rounded bg-amber-50 px-1 text-[11px] text-amber-700" title="MOMO ยังไม่ได้ชั่ง">⏳ รอชั่ง</span>)}
          {t.hasPacking && t.packingWeight != null && (<div className={`text-[11px] font-normal ${pkWtDiff(t) ? "text-rose-600 font-semibold" : "text-emerald-600"}`} title="น้ำหนักจาก packing list">📦{n2(t.packingWeight)}{pkWtDiff(t) ? " ⚠" : " ✓"}</div>)}
          {t.hasLive && t.liveWeight != null && (<div className={`text-[11px] font-normal ${liveWtDiff(t) ? "text-rose-600 font-semibold" : "text-sky-600"}`} title="น้ำหนักจาก MOMO Live (ตู้ปิด)">🟢{n2(t.liveWeight)}{liveWtDiff(t) ? " ⚠" : " ✓"}</div>)}
        </>
      ),
    },
    totalVol: {
      label: "Total Vol.", sortKey: "cbm", thTitle: "คิวรวมทั้งแทรค — ค่าที่ใช้คิดเงิน", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono font-semibold",
      td: (t) => (
        <>
          {editableCell(t, "cbm", t.cbm > 0 ? <span>{fx(t.cbm, 6)}</span> : DASH)}
          {t.hasPacking && t.packingCbm != null && (<div className={`text-[11px] font-normal ${pkVolDiff(t) ? "text-rose-600 font-semibold" : "text-emerald-600"}`} title="คิวจาก packing list">📦{n6(t.packingCbm)}{pkVolDiff(t) ? " ⚠" : " ✓"}</div>)}
          {t.hasLive && t.liveCbm != null && (<div className={`text-[11px] font-normal ${liveVolDiff(t) ? "text-rose-600 font-semibold" : "text-sky-600"}`} title="คิวจาก MOMO Live (ตู้ปิด)">🟢{n6(t.liveCbm)}{liveVolDiff(t) ? " ⚠" : " ✓"}</div>)}
        </>
      ),
    },
    rem: { label: "Rem", noFeed: true, tdClass: tdNoFeed, td: () => "—" },
    cg: { label: "CG.", tdClass: "px-2 py-1.5 text-center font-mono text-[11px] whitespace-nowrap", td: (t) => t.cgNo ?? DASH },
    note: { label: "Note.", noFeed: true, tdClass: tdNoFeed, td: () => "—" },
    serviceFee: { label: "Service Fee", thTitle: "MOMO ส่งมาเป็น extra_cost (ค่าตีลังไม้ / ค่าใช้จ่ายเพิ่ม)", tdClass: "px-2 py-1.5 text-right tabular-nums font-mono", tdTitle: () => "extra_cost จาก MOMO (ค่าตีลังไม้ / ค่าใช้จ่ายเพิ่ม)", td: (t) => fx(t.serviceFee, 2) ?? DASH },
    status: { label: "Status", tdClass: "px-2 py-1.5 text-[11px] text-muted whitespace-nowrap max-w-[10rem] truncate", tdTitle: (t) => t.adminStatusText ?? "", td: (t) => t.adminStatusText ?? t.phase ?? "—" },
    return: { label: "Return", noFeed: true, tdClass: tdNoFeed, td: () => "—" },
    etd: { label: "ETD", thTitle: "วันออกจากจีน — จากไฟล์ packing list (ระดับตู้)", tdClass: "px-2 py-1.5 text-center tabular-nums text-[11px] whitespace-nowrap", td: (t) => t.etd ?? DASH },
    eta: { label: "ETA", thTitle: "วันถึงไทย — จากไฟล์ packing list (ระดับตู้)", tdClass: "px-2 py-1.5 text-center tabular-nums text-[11px] whitespace-nowrap", td: (t) => t.eta ?? DASH },
  };

  return (
    <div className="space-y-3">
      {/* tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        {([["pending", "🟡 ยังไม่เข้าระบบ"], ["committed", "✅ เข้าระบบแล้ว"], ["mismatch", "❗ ไม่ตรง (Packing/Live)"], ["all", "ทั้งหมด"]] as [Tab, string][]).map(([k, label]) => (
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
        {counts.garbage > 0 && (
          <button type="button" onClick={() => setTab("garbage")}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${tab === "garbage" ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
            title="MOMO ส่งน้ำหนัก/คิว ต่อกล่อง ขัดกับก้อนรวม (แถวย่อยหนักเกินก้อนรวม) · ระบบแตกกล่องอัตโนมัติไม่ได้ → ต้องอัพ packing list แต้ม">
            🚩 ข้อมูล MOMO ขัดกัน {counts.garbage}
          </button>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา แทรคกิ้ง / PR / เลขตู้…"
          className="ml-auto rounded-full border border-border bg-white dark:bg-surface px-3 py-1 text-xs w-56" />
        <button type="button" onClick={() => router.refresh()} disabled={pending}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} /> รีเฟรช
        </button>
        <button type="button" onClick={() => setLiveConfirm(true)} disabled={liveBusy} title="ดึงข้อมูลสดจากเว็บ MOMO เดี๋ยวนี้ (อัปเดตสถานะ + เติมข้อมูลที่ยังว่าง · รวมแถวที่ยังไม่นำเข้า)"
          className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${liveBusy ? "animate-spin" : ""}`} /> {liveBusy ? "กำลังดึง Live…" : "🔄 ดึง Live เดี๋ยวนี้"}
        </button>
        <button type="button" onClick={() => exportRows("copy")} title="คัดลอกเป็นตาราง (วางใน Excel/Sheet ได้)"
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt">{copied ? "✓ คัดลอกแล้ว" : "📋 Copy"}</button>
        <button type="button" onClick={() => exportRows("excel")} title="ดาวน์โหลด .csv เปิดใน Excel"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">⬇ Excel</button>
        <button type="button" onClick={resetCols} title="รีเซ็ตลำดับคอลัมน์กลับค่าเริ่มต้น"
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt">↺ คอลัมน์</button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>
      )}
      {liveMsg && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">{liveMsg}</div>
      )}

      {/* ผลนำเข้ารอบล่าสุด (เลือกหลายรายการ) */}
      {bulkResult && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${bulkResult.errors.length > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              นำเข้าระบบสำเร็จ {bulkResult.ok} รายการ{bulkResult.errors.length > 0 ? ` · ไม่สำเร็จ ${bulkResult.errors.length}` : ""}
            </span>
            <button type="button" onClick={() => setBulkResult(null)} className="ml-auto rounded-full border border-border bg-white px-2 py-0.5 text-[11px] hover:bg-surface-alt">ปิด</button>
          </div>
          {bulkResult.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-red-700">
              {bulkResult.errors.slice(0, 8).map((e) => (
                <li key={e.tracking}><span className="font-mono font-semibold">{e.tracking}</span> — {e.message}</li>
              ))}
              {bulkResult.errors.length > 8 && <li className="text-muted">…และอีก {bulkResult.errors.length - 8} รายการ</li>}
            </ul>
          )}
        </div>
      )}

      {/* แถบเลือก — โผล่เมื่อติ๊กแล้ว · ปุ่มเดียวนำเข้าระบบ (owner ปอน 2026-07-14) */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-500/30 dark:bg-primary-500/10">
          <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">เลือก {sel.size} รายการ</span>
          {invalidSelected > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
              <AlertCircle className="h-3 w-3" /> PR ไม่ถูกต้อง {invalidSelected} — ต้องแก้ทีละรายการ
            </span>
          )}
          <button type="button" onClick={onImportClick} disabled={bulkRunning}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
            <PackageCheck className="h-3.5 w-3.5" /> นำเข้าระบบ ({sel.size})
          </button>
          <button type="button" onClick={() => setSel(new Set())} disabled={bulkRunning}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50 dark:bg-surface">ล้างที่เลือก</button>
        </div>
      )}

      {/* กล่องตาราง — สูงพอดีจอ ไม่ให้หน้าเลื่อน (owner ปอน 2026-07-14: "อยากได้เต็มหน้าแบบไม่เลื่อน") :
          100dvh ลบส่วนหัวหน้า+แท็บ (~17.5rem) + คำอธิบายที่พับไว้ + ขอบล่าง ≈ 21rem → เลื่อนแค่ในกล่อง
          (แถบเลื่อนซ้าย-ขวาติดขอบล่างกล่องเสมอ ไม่ต้องไล่หาท้าย 394 แถว · หัวตาราง sticky).
          min-h กันจอเตี้ยมากแล้วกล่องแบนจนใช้ไม่ได้. */}
      <div className="max-h-[calc(100dvh-21rem)] min-h-[16rem] overflow-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        {/* หัวตาราง = ไฟล์ packing list "Shipment Report" (ของแต้ม) เรียง A→Z ตรงตัว
            (owner ปอน 2026-07-14 · "ลอกมาเลย ตามภาพ") + คอลัมน์ "รูป" ของเราที่เก็บไว้
            + ปุ่ม "นำเข้าระบบ" (ฟังก์ชันของหน้านี้). ลำดับคอลัมน์ = CANON ตัวจริงใน
            lib/admin/taem-reconcile-parser.ts (A Container Name … Z eta). */}
        <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border min-w-[2400px]">
          {/* sticky + พื้นทึบ (ไม่ใช้ /70 โปร่ง ไม่งั้นแถวจะทะลุขึ้นมาซ้อนตอนเลื่อน) · เส้นขอบใช้
              box-shadow เพราะ border ของ th หายเวลา sticky + border-collapse (พฤติกรรม Chrome) */}
          <thead className="sticky top-0 z-20 bg-surface-alt text-[11px] font-semibold text-foreground/70 [&_th]:whitespace-nowrap [&_th]:shadow-[inset_0_-1px_0_var(--color-border),inset_0_1px_0_var(--color-border)]">
            <tr>
              {/* ติ๊กเลือก — หัว = เลือกทุกรายการที่ยังไม่เข้าระบบ (ตามที่กรองอยู่) · owner ปอน 2026-07-14 */}
              <th className="px-2 py-2 text-center w-16">
                <label className="inline-flex cursor-pointer items-center gap-1" title={allPendingIds.length ? "เลือกทุกรายการที่ยังไม่เข้าระบบ (ตามตัวกรองนี้)" : "ไม่มีรายการที่ยังไม่เข้าระบบ"}>
                  <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-primary-600"
                    disabled={allPendingIds.length === 0}
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll} />
                  <span className="text-[11px] font-normal">#</span>
                </label>
              </th>
              {/* 27 คอลัมน์ที่เหลือ — ลากย้ายได้ (⋮⋮) + เรียงได้ (⇅) · ลำดับ = colOrder (default = ตารางปอน) */}
              {colOrder.map((key) => {
                const c = colDefs[key];
                if (!c) return null;
                return (
                  <th key={key}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={() => { if (dragKey && dragKey !== key) moveCol(dragKey, key); setDragKey(null); }}
                    className={`${c.noFeed ? thNoFeed : "px-2 py-2 text-center"} ${dragKey === key ? "bg-primary-100/70" : ""}`}
                    title={c.noFeed ? NO_FEED : c.thTitle}>
                    <span className="inline-flex items-center justify-center gap-1">
                      <span draggable onDragStart={() => setDragKey(key)} onDragEnd={() => setDragKey(null)}
                        className="cursor-move text-gray-300 hover:text-gray-500" title="ลากเพื่อย้ายคอลัมน์">⋮⋮</span>
                      {c.label}
                      {c.sortKey && (
                        <button type="button" onClick={() => toggleSort(c.sortKey!)}
                          className={`ml-0.5 ${sort?.key === c.sortKey ? "text-primary-600" : "text-gray-400 hover:text-primary-600"}`}
                          title="คลิกเพื่อเรียง">{sortIcon(c.sortKey)}</button>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={1 + colOrder.length} className="px-3 py-6 text-center text-xs text-muted">ไม่มีรายการตามเงื่อนไข</td></tr>
            )}
            {(() => { let n = 0; return families.map((fam, famIdx) => {
              // ── SHIPMENT header (owner 2026-07-19 · pattern: base = ชิปเม้น = ออเดอร์ = หัวบิล) ──
              // Any family with a -N/M member gets a synthetic header row showing the
              // STRIPPED base number (Σ กล่อง/นน./คิว) — clickable into the order once any
              // member is committed. Every staging tracking then nests as an ↳ member.
              const base = baseTracking(fam[0].tracking ?? "") ?? (fam[0].tracking ?? "");
              // A shipment is collapsible when it has ANY per-box detail to show:
              // multiple staging rows, a suffixed member, OR a single bare row whose
              // boxes live in box_detail (owner 2026-07-19 "ทำไมบางงานไม่กรุ๊ป") —
              // every shipment renders the SAME dropdown, no two looks.
              const grouped = fam.length > 1 || fam.some((x) => (x.tracking ?? "") !== base)
                || (fam.length === 1 && fam[0].boxes.length > 0);
              const famFid = fam.map((x) => x.committedForwarderId).find((v) => v != null) ?? null;
              const famQty = fam.reduce((sm, x) => sm + (x.qty ?? 0), 0);
              const famWt = fam.reduce((sm, x) => sm + (x.weightKg || 0), 0);
              const famCbm = fam.reduce((sm, x) => sm + (x.cbm || 0), 0);
              const isOpen = !grouped || openFams.has(base);
              // CG box-number consistency (owner 2026-07-19 · เลขกล่อง): the CG range's
              // box count must equal the tracking's Total Parcel — flag any mismatch.
              const famCgMismatch = fam.some((x) => cgMatchesQty(x.cgNo, x.qty) === false);
              return (
                <Fragment key={`fam-${base}-${famIdx}`}>
                {grouped && (
                  <tr
                    className="cursor-pointer border-t-2 border-slate-300 bg-slate-100/70 align-top hover:bg-slate-200/60"
                    title="กดเพื่อกาง/พับรายละเอียดแทรคกิ้งของชิปเม้นนี้"
                    onClick={(e) => { if ((e.target as HTMLElement).closest("a,button,input,select,textarea")) return; toggleFam(base); }}
                  >
                    <td className="px-2 py-1.5 text-center">
                      {famFid ? (
                        <Link href={`/admin/forwarders/${famFid}`} title={`เปิดชิปเม้น/ออเดอร์ #${famFid}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-700 hover:underline">
                          #{famFid}
                        </Link>
                      ) : (
                        <span className="text-[13px]" title="ชิปเม้นนี้ยังไม่นำเข้าระบบ">📦</span>
                      )}
                    </td>
                    {colOrder.map((key) => {
                      const c = colDefs[key];
                      let node: ReactNode = null;
                      switch (key) {
                        case "tracking":
                          node = (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-500">{isOpen ? "▾" : "▸"}</span>
                              {famFid ? (
                                <Link href={`/admin/forwarders/${famFid}`} title="เปิดชิปเม้น/ออเดอร์นี้"
                                  className="font-mono text-[13px] font-bold text-primary-700 hover:underline">{base}</Link>
                              ) : (
                                <span className="font-mono text-[13px] font-bold text-foreground">{base}</span>
                              )}
                              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
                                {fam.length > 1 ? `${fam.length} แทรค` : `${famQty || fam[0].boxes.length} กล่อง`}
                              </span>
                              {famCgMismatch && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700"
                                  title="ช่วงเลขกล่อง CG ของบางแทรคไม่ตรงกับจำนวนกล่อง (Total Parcel) — ข้อมูล MOMO ขัดกันเอง ตรวจสอบ">
                                  ⚠ CG≠กล่อง
                                </span>
                              )}
                            </span>
                          );
                          break;
                        case "totalParcel": node = <span className="font-bold">Σ {famQty}</span>; break;
                        case "wt": case "totalWt":
                          node = <span className="font-mono font-bold">Σ {famWt.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>; break;
                        case "vol": case "totalVol":
                          node = <span className="font-bold">Σ {famCbm.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>; break;
                        // shared per-shipment fields — render from the first member
                        case "image": case "container": case "trans": case "smDate": case "type":
                        case "code": case "status": case "etd": case "eta":
                          node = c ? c.td(fam[0]) : null; break;
                        default: node = null;
                      }
                      return <td key={key} className={c?.tdClass ?? "px-2 py-1.5"}>{node}</td>;
                    })}
                  </tr>
                )}
                {isOpen && fam.map((t) => {
              const i = n++;
              const rr = rowResult[t.id];
              const done = t.committed || rr?.ok;
              const fid = t.committedForwarderId ?? rr?.fid ?? null;
              const isMember = grouped; // every tracking of the shipment nests under its header
              return (
                <Fragment key={t.id}>
                <tr className={`align-top ${isMember ? "border-l-4 border-sky-200 " : ""}${done ? "bg-emerald-50/40" : sel.has(t.id) ? "bg-primary-50/60" : t.momoGarbage ? "bg-red-50" : isMember ? "bg-sky-50/30" : t.userIdValid === false ? "bg-red-50/30" : ""}`}>
                  {/* ติ๊กเลือก + เลขแถว · แถวที่เข้าระบบแล้ว = ลิงก์ไปใบนำเข้า (ย้ายมาจากคอลัมน์
                      "นำเข้าระบบ" ที่ owner ให้เอาออก — ข้อมูลไม่หาย) */}
                  <td className="px-2 py-1.5 text-center">
                    {done ? (
                      fid ? (
                        <Link href={`/admin/forwarders/${fid}`} title={`เข้าระบบแล้ว #${fid}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
                          <CheckCircle2 className="h-3.5 w-3.5" />#{fid}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700" title="เข้าระบบแล้ว"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                      )
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-1" title="เลือกเพื่อนำเข้าระบบ">
                        <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-primary-600"
                          checked={sel.has(t.id)} onChange={() => toggleOne(t.id)} />
                        <span className="text-[11px] text-muted tabular-nums">{i + 1}</span>
                      </label>
                    )}
                    {rr && !rr.ok && (
                      <div className="mt-0.5 text-[11px] font-semibold text-red-700" title={rr.message}>ไม่สำเร็จ</div>
                    )}
                  </td>
                  {/* คอลัมน์ที่ลากย้ายได้ — render จาก colOrder (เนื้อหา = ตารางปอนเป๊ะ · ผ่าน colDefs) */}
                  {colOrder.map((key) => {
                    const c = colDefs[key];
                    if (!c) return null;
                    return (
                      <td key={key} className={c.tdClass} title={c.tdTitle?.(t)}>
                        {isMember && key === "tracking" ? (
                          <span className="inline-flex items-center gap-1 pl-2"><span className="text-sky-500">↳</span>{c.td(t)}</span>
                        ) : c.td(t)}
                      </td>
                    );
                  })}
                </tr>
                {/* กล่องย่อยของ MOMO (box_detail) — โชว์เฉพาะเมื่อชิปเม้นมี staging แถวเดียว
                    (แถวรวมที่กล่องแตกอยู่ใน box_detail) · ครอบครัวที่มีแถว -N อยู่แล้ว = แถวลูก
                    ด้านบนคือกล่องตัวจริง → ไม่ nest ซ้ำ (เคย 18 หัว × 18 กล่อง = เบิ้ลมโหฬาร) */}
                {fam.length === 1 && isOpen && t.boxes.map((box, bi) => (
                  <tr key={`${t.id}-b${bi}`} className="bg-sky-50/40 text-[11px]">
                    <td className="px-2 py-1 text-center text-muted" title="กล่องย่อยจาก MOMO (box_detail)">📦</td>
                    {colOrder.map((key) => {
                      const c = colDefs[key];
                      return <td key={key} className={c?.tdClass ?? "px-2 py-1"}>{boxCell(box, key)}</td>;
                    })}
                  </tr>
                ))}
                </Fragment>
              );
            })}
                </Fragment>
              );
            }); })()}
          </tbody>
        </table>
      </div>
      {/* คำอธิบายคอลัมน์ — พับเก็บ (owner ปอน 2026-07-14: อยากได้เต็มหน้าไม่ต้องเลื่อน · เดิมกิน 115px
          ท้ายหน้า) เปิดอ่านได้เมื่อต้องการ · เนื้อหาเดิมครบ ไม่ได้ตัดทิ้ง */}
      <details className="text-[11px] text-muted leading-relaxed">
        <summary className="cursor-pointer select-none font-medium hover:text-foreground">ℹ️ คำอธิบายคอลัมน์ (หัวตาราง = ไฟล์ packing list · A→Z)</summary>
        <div className="mt-1.5 space-y-1">
          <p>
            หัวตาราง = ไฟล์ <strong>packing list (Shipment Report)</strong> เรียงคอลัมน์ A→Z ตรงตัว · 1 แถว = 1 แทรคกิ้งลูกค้า (จาก MOMO API) ·
            ตรวจ PR / น้ำหนัก / คิว / ประเภท ให้ถูก แล้วติ๊กเลือก → กด <strong>&quot;นำเข้าระบบ&quot;</strong> → ยืนยัน → INSERT ลง tb_forwarder · กด Container Name เพื่อดูรายละเอียดทั้งตู้.
          </p>
          <p>
            <strong className="text-sky-700">📦 ↳ แถวสีฟ้า = กล่องย่อยของ MOMO</strong> (เมื่อ MOMO แตกกล่อง &gt;1) — กางออกให้ครบทุกกล่องเป็นแถวจริง
            ตรงกับ MOMO Live 1:1 (น้ำหนัก/คิว/ขนาด ต่อกล่อง) · <strong>อ่านอย่างเดียว</strong> (นำเข้าที่แถวหลัก · ระบบจะแตกให้เอง).
          </p>
          <p>
            <strong>Wt. / Vol.</strong> = ต่อกล่อง (คำนวณจาก Total ÷ Total Parcel · Vol. = W×L×H) ·{" "}
            <strong>Total Wt. / Total Vol.</strong> = รวมทั้งแทรคจาก MOMO = <strong>ค่าที่ใช้คิดเงิน</strong> ·{" "}
            <strong className="text-emerald-700">📦 = ค่าจาก packing list</strong> เทียบกับ MOMO API (<span className="text-emerald-600">✓ ตรง</span> ·{" "}
            <span className="text-rose-600">⚠ ไม่ตรง</span> — ดูรวมที่แท็บ &quot;❗ ไม่ตรง packing&quot;) ·{" "}
            <strong>Service Fee</strong> = extra_cost ของ MOMO (ค่าตีลังไม้/ค่าใช้จ่ายเพิ่ม) · <strong>ETD/ETA</strong> มาจากไฟล์ packing list ระดับตู้ (ว่างจนกว่าจะอัพไฟล์).
          </p>
          <p className="italic text-muted/70">
            คอลัมน์ที่จางไว้ (SM Number · Branch · Product · Dum · Rem · Note. · Return) = <strong>MOMO API ไม่ส่งมา</strong> —
            มีอยู่ในไฟล์ packing list ของแต้ม แต่ตอนนี้ระบบยังไม่ได้เก็บ (ถ้าอยากให้ขึ้น ต้องเก็บเพิ่มตอน ingest ไฟล์).
          </p>
        </div>
      </details>

      {/* ยืนยันนำเข้าหลายรายการ (§0f confirm-before-mutate) — portal เหมือน modal เดิม.
          เลือก 1 รายการจะไม่มาที่นี่ (ไป modal ตรวจ/แก้ PR ทีละใบแทน). */}
      {bulkOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => !bulkRunning && setBulkOpen(false)} role="button" tabIndex={-1}>
          <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-surface p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary-600" /> ยืนยันนำเข้าระบบ {selectedTracks.length} รายการ</h3>
              <button type="button" onClick={() => !bulkRunning && setBulkOpen(false)} className="rounded-lg border border-border px-2 py-0.5 text-xs hover:bg-surface-alt"><X className="h-3.5 w-3.5" /></button>
            </div>

            <div className="rounded-lg bg-surface-alt/50 p-3 text-xs space-y-1.5">
              <p className="text-muted leading-relaxed">
                จะสร้างรายการนำเข้า (tb_forwarder) ให้ทุกแถวที่เลือก โดยใช้ค่าที่เห็นในตาราง —
                <strong> PR ที่ระบบเทียบกับ tb_users แล้ว</strong> · ขนส่งไทย = <strong>ยังไม่ระบุ</strong> (เซล/ลูกค้ากรอกทีหลัง) ·
                ประเภทสินค้า = ที่ map มาจาก MOMO. น้ำหนัก/คิว = ค่าเดียวกับที่โชว์ในคอลัมน์ Total.
              </p>
              {invalidSelected > 0 && (
                <p className="flex items-start gap-1.5 rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{invalidSelected} รายการ PR ไม่ตรง tb_users → ระบบจะปฏิเสธเอง (ไม่เดา PR ให้) — ติ๊กทีละรายการเพื่อแก้ PR ก่อน</span>
                </p>
              )}
              {/* full-data preview — โชว์ครบเหมือนตาราง (ภูม: "แสดงข้อมูลให้ครบทั้งหมด เพื่อตรวจอีกที") */}
              {previewTable(selectedTracks)}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setBulkOpen(false)} disabled={bulkRunning} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
              <button type="button" onClick={runBulkImport} disabled={bulkRunning}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-700 bg-primary-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                {bulkRunning ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> กำลังนำเข้า…</> : <><Truck className="h-3.5 w-3.5" /> ยืนยันนำเข้า {selectedTracks.length} รายการ</>}
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

      {/* เฟส C — missing-parcel recovery panel (พัสดุที่ MOMO API ไม่ส่ง แต่มีใน packing · ฿294k) */}
      {missing.length > 0 && (
        <section className="space-y-2 rounded-2xl border-2 border-red-200 bg-red-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-red-800">🔴 พัสดุที่ MOMO API ไม่ส่ง (มีใน packing list) — {missing.length} รายการ</h3>
            {missingReady.length > 0 && (
              <button type="button" onClick={onCreateMissing} disabled={missingBusy}
                className="inline-flex items-center gap-1 rounded-lg border border-red-600 bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                <PackageCheck className="h-3.5 w-3.5" /> {missingBusy ? "กำลังดึง…" : `ดึงเข้าระบบทั้งหมด (${missingReady.length})`}
              </button>
            )}
          </div>
          {missingMsg && <div className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] text-red-800">{missingMsg}</div>}
          {missingNoPr.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">⚠️ {missingNoPr.length} รายการไม่มี PR (packing ไม่ระบุรหัสลูกค้า) — ต้องตามเก็บ PR ที่หน้าเว็บ MOMO ก่อน · ดึงอัตโนมัติไม่ได้</div>
          )}
          <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-red-200 bg-white">
            <table className="w-full text-[11px] border-collapse [&_th]:border [&_th]:border-red-100 [&_td]:border [&_td]:border-red-100">
              <thead className="bg-red-100/50 text-red-700"><tr>
                <th className="px-2 py-1 text-left">แทรคกิ้ง</th><th className="px-2 py-1 text-left">ตู้</th><th className="px-2 py-1 text-left">PR</th>
                <th className="px-2 py-1 text-right">นน.</th><th className="px-2 py-1 text-right">คิว</th><th className="px-2 py-1 text-right">กล่อง</th><th className="px-2 py-1 text-center">Live</th>
              </tr></thead>
              <tbody>
                {missing.map((m) => (
                  <tr key={m.tracking} className={isValidPr(m.code) ? "" : "bg-amber-50/40"}>
                    <td className="px-2 py-1 font-mono">{m.tracking}</td>
                    <td className="px-2 py-1 font-mono">{m.cabinet}</td>
                    <td className="px-2 py-1 font-mono">{isValidPr(m.code) ? m.code : <span className="text-amber-600">{m.code || "ไม่มี PR"}</span>}</td>
                    <td className="px-2 py-1 text-right font-mono">{n2(m.weight ?? 0)}</td>
                    <td className="px-2 py-1 text-right font-mono">{n6(m.cbm ?? 0)}</td>
                    <td className="px-2 py-1 text-right">{m.boxes ?? "—"}</td>
                    <td className="px-2 py-1 text-center">{m.inLive ? "🟢" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-red-700/80">พัสดุพวกนี้ MOMO API ไม่ส่งมา (สถานะขยับเกิน status แรก) แต่ packing list มี → กด &quot;ดึงเข้าระบบ&quot; จะสร้าง billable row ให้ (ปลอดภัย · กันซ้ำ + คิดราคาอัตโนมัติ) = ตัวเดียวกับหน้า drift.</p>
        </section>
      )}

      {/* ดึง Live — พรีวิวช่องว่างปัจจุบันก่อนดึง → ยืนยัน (portal to body · ภูม) */}
      {liveConfirm && createPortal(
        (() => {
          const noWeight = tracks.filter((t) => !t.committed && t.weightKg <= 0).length;
          const noCbm = tracks.filter((t) => !t.committed && t.cbm <= 0).length;
          const noCabinet = tracks.filter((t) => !t.container).length;
          const incompleteRows = tracks.filter((t) => !t.committed && (t.weightKg <= 0 || t.cbm <= 0));
          return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setLiveConfirm(false)} role="button" tabIndex={-1}>
              <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-surface p-5 shadow-2xl space-y-3.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold flex items-center gap-2"><RefreshCw className="h-5 w-5 text-sky-600" /> ดึงข้อมูลสดจาก MOMO</h3>
                  <button type="button" onClick={() => setLiveConfirm(false)} className="rounded-lg border border-border px-2 py-0.5 text-xs hover:bg-surface-alt"><X className="h-3.5 w-3.5" /></button>
                </div>
                <p className="text-xs text-muted">ตอนนี้ในระบบยังขาด/ไม่ครบ — กดดึง Live เพื่อให้ MOMO เว็บเติมให้ (รวมแถวที่ยังไม่นำเข้า):</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2"><div className="text-lg font-extrabold text-amber-700">{noWeight}</div><div className="text-[11px] text-amber-700/80">ยังไม่มีน้ำหนัก</div></div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2"><div className="text-lg font-extrabold text-amber-700">{noCbm}</div><div className="text-[11px] text-amber-700/80">ยังไม่มีคิว</div></div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><div className="text-lg font-extrabold text-slate-700">{noCabinet}</div><div className="text-[11px] text-slate-600">ยังไม่เข้าตู้ปิด</div></div>
                  <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2"><div className="text-lg font-extrabold text-red-700">{missing.length}</div><div className="text-[11px] text-red-600">พัสดุขาด (packing มี · API ไม่มี)</div></div>
                </div>
                {incompleteRows.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-amber-700">📋 รายการที่ข้อมูลยังไม่ครบ (Live จะเติมให้ถ้า MOMO มี) — {incompleteRows.length} รายการ:</div>
                    {previewTable(incompleteRows)}
                  </div>
                )}
                <div className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800">กดยืนยัน → login เว็บ MOMO สด → อัปเดตสถานะ + เติม น้ำหนัก/คิว/จำนวน ที่ยังว่าง ทั้งแถวที่เข้าระบบแล้ว (tb_forwarder) และยังไม่นำเข้า (staging · ข้ามบิลแล้ว · ไม่ทับค่าที่มี). ใช้เวลาสักครู่.</div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setLiveConfirm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt">ยกเลิก</button>
                  <button type="button" onClick={onPullLive}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700 bg-sky-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-sky-700">
                    <RefreshCw className="h-3.5 w-3.5" /> ยืนยันดึง Live เดี๋ยวนี้
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body,
      )}
    </div>
  );
}
