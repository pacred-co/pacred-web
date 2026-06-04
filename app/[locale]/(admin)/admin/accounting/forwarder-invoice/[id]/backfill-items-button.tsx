"use client";

/**
 * BackfillItemsButton — client component for ภูม flag #1 (2026-06-02).
 *
 * Receipt detail page (`forwarder-invoice/[id]`) shows the "ไม่พบรายการ" banner
 * when `tb_receipt_item` has zero rows for the displayed rid. This button is
 * what staff click to trigger the recovery flow:
 *
 *   1. Calls `adminBackfillReceiptItems(receiptId)` — best-effort auto-link
 *      from the wallet_hs trail + fdatestatus5 fallback.
 *   2. On `status:'filled'` → success toast + page reload (the SSR re-render
 *      pulls the freshly-inserted items via the existing query).
 *   3. On `status:'already_has_items'` → page reload (transient race; the rows
 *      now exist).
 *   4. On `status:'ambiguous'` → opens an inline dialog listing the candidate
 *      tb_forwarder rows; staff tick the ones that belong, then submit.
 *   5. On `status:'no_candidates'` → clear "ไม่พบรายการที่ใกล้เคียง" message;
 *      staff can still use the manual issue flow at /add to make a fresh
 *      receipt with the right fids.
 *
 * The dialog uses Pacred's `<dialog>`-native pattern (NOT jQuery/Bootstrap)
 * per CLAUDE_TECHNICAL.md "HTML nesting gotchas + native dialog".
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  adminBackfillReceiptItems,
  adminLinkReceiptItems,
  type AdminBackfillReceiptItemsCandidate,
} from "@/actions/admin/forwarder-invoice";

type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "filled"; itemsInserted: number; strategy: string; linkedFids: number[] }
  | { kind: "ambiguous"; expectedTotal: number; candidates: AdminBackfillReceiptItemsCandidate[] }
  | { kind: "no_candidates"; expectedTotal: number }
  | { kind: "error"; message: string };

function fmt2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

export default function BackfillItemsButton({
  receiptId,
}: {
  receiptId: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [linking, setLinking] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open/close the dialog when phase enters/leaves ambiguous.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (phase.kind === "ambiguous") {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [phase.kind]);

  async function handleBackfill() {
    if (phase.kind === "running") return;
    setPhase({ kind: "running" });
    setPicked(new Set());
    try {
      const r = await adminBackfillReceiptItems({ receiptId });
      if (!r.ok) {
        setPhase({ kind: "error", message: r.error });
        return;
      }
      const d = r.data;
      if (!d) {
        setPhase({ kind: "error", message: "no_data_in_response" });
        return;
      }
      if (d.status === "filled") {
        setPhase({
          kind:          "filled",
          itemsInserted: d.itemsInserted ?? 0,
          strategy:      d.strategy ?? "unknown",
          linkedFids:    d.linkedFids ?? [],
        });
        // Refresh after a short delay so admin can see the success message.
        setTimeout(() => router.refresh(), 1200);
        return;
      }
      if (d.status === "already_has_items") {
        // Race — rows now exist. Just refresh.
        router.refresh();
        setPhase({ kind: "idle" });
        return;
      }
      if (d.status === "ambiguous") {
        setPhase({
          kind:          "ambiguous",
          expectedTotal: d.expectedTotal ?? 0,
          candidates:    d.candidates ?? [],
        });
        return;
      }
      if (d.status === "no_candidates") {
        setPhase({ kind: "no_candidates", expectedTotal: d.expectedTotal ?? 0 });
        return;
      }
      setPhase({ kind: "error", message: `unexpected_status: ${d.status}` });
    } catch (e) {
      setPhase({
        kind:    "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleLinkPicked() {
    if (phase.kind !== "ambiguous" || linking) return;
    if (picked.size === 0) return;
    setLinking(true);
    try {
      const r = await adminLinkReceiptItems({
        receiptId,
        fids: Array.from(picked),
      });
      if (!r.ok) {
        setPhase({ kind: "error", message: r.error });
        return;
      }
      if (!r.data) {
        setPhase({ kind: "error", message: "no_data_in_response" });
        return;
      }
      setPhase({
        kind:          "filled",
        itemsInserted: r.data.itemsInserted,
        strategy:      "admin_pick",
        linkedFids:    Array.from(picked),
      });
      setTimeout(() => router.refresh(), 1200);
    } catch (e) {
      setPhase({
        kind:    "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLinking(false);
    }
  }

  const togglePicked = (fid: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };

  const pickedSum =
    phase.kind === "ambiguous"
      ? phase.candidates
          .filter((c) => picked.has(c.fid))
          .reduce((s, c) => s + c.perRowRaw, 0)
      : 0;
  const expectedDiff =
    phase.kind === "ambiguous"
      ? Math.abs(pickedSum - phase.expectedTotal)
      : 0;
  const isWithinTolerance = expectedDiff <= 1.0;

  return (
    <>
      <button
        type="button"
        onClick={handleBackfill}
        disabled={phase.kind === "running"}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-60 disabled:cursor-wait"
      >
        {phase.kind === "running" ? (
          <>กำลังค้นหา…</>
        ) : (
          <>🔄 ดึงรายการสินค้าซ้ำ</>
        )}
      </button>

      {/* ── Inline status banners ── */}
      {phase.kind === "filled" && (
        <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <b>✓ ดึงรายการสำเร็จ</b> — เพิ่มรายการ {phase.itemsInserted} รายการ
          (strategy: <code className="px-1 bg-emerald-100 rounded">{phase.strategy}</code>,
          fids: {phase.linkedFids.map((f) => `#${f}`).join(", ")}) ·
          กำลังโหลดหน้าใหม่…
        </div>
      )}
      {phase.kind === "no_candidates" && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>ไม่พบรายการที่ใกล้เคียงในประวัติการชำระเงิน</b> —
          ระบบค้นหา tb_wallet_hs (±7 วัน) + tb_forwarder.fdatestatus5 (±14 วัน) แล้ว
          ไม่พบรายการที่ยอดรวมเท่ากับ {fmt2(phase.expectedTotal)} บาท ·
          อาจต้องสร้างใบเสร็จใหม่ผ่าน <code>/admin/accounting/forwarder-invoice/add</code> แทน
          หรือเชื่อมรายการด้วย SQL โดยตรง (audit log จะบันทึก)
        </div>
      )}
      {phase.kind === "error" && (
        <div className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          <b>เกิดข้อผิดพลาด:</b> {phase.message}
        </div>
      )}

      {/* ── Ambiguous dialog ── */}
      <dialog
        ref={dialogRef}
        className="rounded-lg shadow-2xl backdrop:bg-slate-900/50 p-0 max-w-4xl w-full"
        onClose={() => {
          if (phase.kind === "ambiguous") setPhase({ kind: "idle" });
        }}
      >
        {phase.kind === "ambiguous" && (
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  เลือกรายการพัสดุที่ตรงกับใบเสร็จ
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  ระบบไม่สามารถจับคู่อัตโนมัติได้ (พบหลายชุดที่ผลรวมตรงกัน หรือไม่มีชุดที่ตรงพอ) ·
                  ติ๊กรายการที่อยู่ในใบเสร็จนี้แล้วกดยืนยัน
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhase({ kind: "idle" })}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            <div className="mb-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              ยอดรวมที่ต้องการ (จาก <code>tb_receipt.totalbeforewithholding</code>):{" "}
              <b className="text-slate-900">{fmt2(phase.expectedTotal)}</b> บาท ·
              ผลรวมที่เลือก:{" "}
              <b
                className={
                  picked.size === 0
                    ? "text-slate-500"
                    : isWithinTolerance
                      ? "text-emerald-700"
                      : "text-rose-700"
                }
              >
                {fmt2(pickedSum)}
              </b>{" "}
              บาท
              {picked.size > 0 && !isWithinTolerance && (
                <span className="ml-2 text-rose-600">
                  (ส่วนต่าง {fmt2(expectedDiff)})
                </span>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left w-10">เลือก</th>
                    <th className="px-2 py-1 text-left">FID</th>
                    <th className="px-2 py-1 text-left">Tracking</th>
                    <th className="px-2 py-1 text-left">ตู้</th>
                    <th className="px-2 py-1 text-center">fstatus</th>
                    <th className="px-2 py-1 text-center">รอชำระเมื่อ</th>
                    <th className="px-2 py-1 text-right">ยอด (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {phase.candidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-4 text-center text-slate-500">
                        ไม่มี candidate
                      </td>
                    </tr>
                  ) : (
                    phase.candidates.map((c) => (
                      <tr
                        key={c.fid}
                        className={
                          picked.has(c.fid)
                            ? "bg-rose-50"
                            : "hover:bg-slate-50"
                        }
                      >
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={picked.has(c.fid)}
                            onChange={() => togglePicked(c.fid)}
                            className="size-4"
                          />
                        </td>
                        <td className="px-2 py-1 font-mono">#{c.fid}</td>
                        <td className="px-2 py-1 break-all">{c.ftrackingchn ?? "-"}</td>
                        <td className="px-2 py-1">{c.fcabinetnumber ?? "-"}</td>
                        <td className="px-2 py-1 text-center">{c.fstatus}</td>
                        <td className="px-2 py-1 text-center">{fmtDate(c.fdatestatus5)}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          {fmt2(c.perRowRaw)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                เลือก {picked.size} รายการ · กดยืนยันเพื่อเชื่อมเข้าใบเสร็จ ·
                ระบบจะตรวจสอบว่ายังไม่มีรายการเหล่านี้อยู่บนใบเสร็จอื่น
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                  className="px-3 py-1.5 rounded border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleLinkPicked}
                  disabled={picked.size === 0 || linking}
                  className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-60 disabled:cursor-wait"
                >
                  {linking ? "กำลังเชื่อม…" : `ยืนยันเชื่อม ${picked.size} รายการ`}
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
