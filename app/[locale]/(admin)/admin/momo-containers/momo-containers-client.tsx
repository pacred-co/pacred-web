"use client";

/**
 * MOMO sync/ingest workspace — per-tracking grid (ภูม 2026-07-14 · rework).
 *
 * Row = 1 customer tracking (from momo_import_tracks · committed + pending).
 * ตรวจ PR/น้ำหนัก/คิว/ขนส่ง/ประเภท ต่อแทรค → กด "นำเข้าระบบ" → modal พรีวิว+ยืนยัน →
 * commitMomoRowToForwarder (wrap · ไม่เขียน commit ใหม่). แถวที่เข้าแล้วโชว์ "เข้าระบบแล้ว".
 * กดเลขตู้ → หน้า detail /[cabinet] (เก็บไว้).
 */

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CheckCircle2, AlertCircle, RefreshCw, X, PackageCheck, Truck } from "lucide-react";
import { commitMomoRowToForwarder } from "@/actions/admin/momo-commit";
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา แทรคกิ้ง / PR / เลขตู้…"
          className="ml-auto rounded-full border border-border bg-white dark:bg-surface px-3 py-1 text-xs w-56" />
        <button type="button" onClick={() => router.refresh()} disabled={pending}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} /> รีเฟรช
        </button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>
      )}

      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border min-w-[1080px]">
          <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-center w-8">#</th>
              <th className="px-2 py-2 text-center w-14">รูป</th>
              <th className="px-2 py-2 text-left">แทรคกิ้ง</th>
              <th className="px-2 py-2 text-left">ตู้</th>
              <th className="px-2 py-2 text-left">ลูกค้า (PR)</th>
              <th className="px-2 py-2 text-right">น้ำหนัก</th>
              <th className="px-2 py-2 text-right">คิว</th>
              <th className="px-2 py-2 text-right">จำนวน</th>
              <th className="px-2 py-2 text-left">ประเภท</th>
              <th className="px-2 py-2 text-left">สถานะ MOMO</th>
              <th className="px-2 py-2 text-center w-40">นำเข้าระบบ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-xs text-muted">ไม่มีรายการตามเงื่อนไข</td></tr>
            )}
            {filtered.map((t, i) => {
              const rr = rowResult[t.id];
              const done = t.committed || rr?.ok;
              const fid = t.committedForwarderId ?? rr?.fid ?? null;
              const wDiff = pkWtDiff(t);
              const vDiff = pkVolDiff(t);
              return (
                <tr key={t.id} className={`align-top ${done ? "bg-emerald-50/40" : t.userIdValid === false ? "bg-red-50/30" : ""}`}>
                  <td className="px-2 py-1.5 text-center text-muted tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5 text-center">
                    {t.images.length > 0 ? (
                      <button type="button" onClick={() => setZoom({ urls: t.images, tracking: t.tracking ?? "—" })} className="relative inline-block" title="คลิกดูรูปป้าย (ตรวจ PR)">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.images[0]} alt="ป้าย MOMO" loading="lazy" className="h-9 w-9 rounded border border-border object-cover hover:ring-2 hover:ring-primary-400" />
                        {t.images.length > 1 && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-primary-500 px-1 text-[11px] font-bold text-white">+{t.images.length - 1}</span>}
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-foreground whitespace-nowrap">{t.tracking ?? "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {t.container ? (
                      <Link href={`/admin/momo-containers/${encodeURIComponent(t.container)}`} className="font-mono font-semibold text-sky-700 hover:underline">
                        {t.container}
                        <span className="ml-1 text-[11px] text-muted">{t.transport ? TRANSPORT_TH[t.transport] ?? "" : ""}</span>
                      </Link>
                    ) : (
                      <span className="text-[11px] text-amber-600" title={t.routingBatch ?? ""}>⏳ ยังไม่เข้าตู้ปิด</span>
                    )}
                    {t.sack && <div className="text-[11px] text-muted">กระสอบ: {t.sack}</div>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {t.guessedUserId ? (
                      <span className="font-mono font-semibold">{t.guessedUserId}</span>
                    ) : <span className="text-[11px] text-amber-600">MOMO ไม่ส่ง PR</span>}
                    {!t.committed && t.userIdValid === false && t.guessedUserId && (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[11px] font-bold text-red-700"><AlertCircle className="h-2.5 w-2.5" /> ไม่มีในระบบ</div>
                    )}
                    {!t.committed && t.userIdValid === true && (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" /> พบในระบบ</div>
                    )}
                    {t.committed && t.commitUserId && t.commitUserId !== t.guessedUserId && (
                      <div className="text-[11px] text-muted">→ {t.commitUserId}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {t.weightKg > 0 ? <span className="font-mono">{n2(t.weightKg)}</span> : <span className="rounded bg-amber-50 px-1 text-[11px] text-amber-700" title="MOMO ยังไม่ได้ชั่ง">⏳ รอชั่ง</span>}
                    {t.hasPacking && t.packingWeight != null && (
                      <div className={`text-[11px] ${wDiff ? "text-rose-600 font-semibold" : "text-emerald-600"}`} title="น้ำหนักจาก packing list">
                        📦{n2(t.packingWeight)}{wDiff ? " ⚠" : " ✓"}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <span className="font-mono">{n6(t.cbm)}</span>
                    {t.hasPacking && t.packingCbm != null && (
                      <div className={`text-[11px] ${vDiff ? "text-rose-600 font-semibold" : "text-emerald-600"}`} title="คิวจาก packing list">
                        📦{n6(t.packingCbm)}{vDiff ? " ⚠" : " ✓"}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{t.qty ?? "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{PRODUCT_TYPE_TH[t.guessedProductType] ?? "—"}{t.guessedProductType === "3" && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">อย.</span>}</td>
                  <td className="px-2 py-1.5 text-[11px] text-muted whitespace-nowrap max-w-[10rem] truncate" title={t.adminStatusText ?? ""}>{t.adminStatusText ?? t.phase ?? "—"}</td>
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
      <p className="text-[11px] text-muted leading-relaxed">
        1 แถว = 1 แทรคกิ้งลูกค้า (จาก MOMO API) · ตรวจ PR/น้ำหนัก/คิว/ประเภท ให้ถูก แล้วกด <strong>&quot;นำเข้าระบบ&quot;</strong> →
        พรีวิว+ยืนยัน → INSERT ลง tb_forwarder · น้ำหนัก/คิว = ค่ารวมทั้งชิปเมนต์จาก MOMO (ตรงกับที่จะคิดเงิน) ·
        <strong className="text-emerald-700"> 📦 = ค่าจาก packing list</strong> เทียบกับ MOMO API (<span className="text-emerald-600">✓ ตรง</span> · <span className="text-rose-600">⚠ ไม่ตรง</span>) ·
        กดเลขตู้เพื่อดูรายละเอียดทั้งตู้.
      </p>

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
