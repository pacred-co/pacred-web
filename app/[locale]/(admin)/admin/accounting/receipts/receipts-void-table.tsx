"use client";

/**
 * ใบเสร็จรับเงิน ฝากนำเข้าสินค้า — legacy-faithful 13-column list + tick-to-VOID
 * bulk action (rebuild 2026-07-08 · owner "หน้ายังไม่เหมือน").
 *
 * The receipts list is a Server Component; this client island renders the same
 * 13-column table the legacy PCS `receipt-forwarder-item/home.php` shows —
 * PLUS working per-row checkboxes and a sticky bulk bar that soft-VOIDs the
 * ticked receipts via `adminVoidReceipts`.
 *
 * ── STATUS SEMANTICS (Pacred-native · NOT legacy) ────────────────────────
 * Pacred tb_receipt.rstatus: '1'=ออกแล้ว(paid) · '2'=ยกเลิก(cancelled) ·
 * '3'=รอชำระ(pending · DEFAULT). We KEEP the Pacred RSTATUS_CFG exactly — the
 * legacy status codes mean something different (1=ร่าง 2=รออนุมัติ 3=รับชำระ 4=ลบ)
 * and copying them would mislabel paid receipts. Only the LAYOUT is legacy.
 *
 * VOID = keep history: it flips rstatus → '2' (ยกเลิก) — it NEVER deletes,
 * NEVER moves money. Voided rows stay visible, badged "ยกเลิก". A confirm dialog
 * + a required reason gate the mutation (§0f confirm-before-mutate). Already-
 * cancelled rows ('2') can't be re-ticked; the action is idempotent regardless.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  adminVoidReceipts,
  type ReceiptListRow,
} from "@/actions/admin/accounting-receipts";
import { Explain, GUIDE } from "@/components/ui/tooltip";

// Pacred-native status palette (NOT legacy) — do not remap to legacy codes.
// `dot` = the legacy PCS colored ● dot style (● + label) shown in the สถานะ column.
const RSTATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  "1": { label: "ออกแล้ว", dot: "bg-emerald-500", text: "text-emerald-700" },
  "2": { label: "ยกเลิก",  dot: "bg-red-500",     text: "text-red-700" },
  "3": { label: "รอชำระ",  dot: "bg-amber-500",   text: "text-amber-700" },
  "0": { label: "ร่าง",    dot: "bg-slate-400",   text: "text-slate-600" },
};

function rstatusCfg(rstatus: string) {
  return RSTATUS_CFG[rstatus] ?? {
    label: rstatus,
    dot: "bg-slate-400",
    text: "text-slate-600",
  };
}

function fmtThb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** A receipt can be voided only when it's currently paid ('1') or pending ('3'). */
function isVoidable(rstatus: string): boolean {
  return rstatus === "1" || rstatus === "3";
}

/**
 * สถานะพิมพ์ต้นฉบับ / สำเนา cell (legacy hs-receipt-forwarder.php L339-356).
 * When printed → green/blue "พิมพ์แล้ว" pill + the print date + the printing
 * admin id; otherwise a muted "ยังไม่พิมพ์" pill. `tone` mirrors the legacy
 * badge colour (ต้นฉบับ = success/green · สำเนา = info/blue).
 */
function PrintStatusCell({
  print,
  tone,
}: {
  print: { done: boolean; date: string | null; adminId: string | null };
  tone: "emerald" | "sky";
}) {
  if (!print.done) {
    return (
      <span className="inline-block rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 whitespace-nowrap">
        ยังไม่พิมพ์
      </span>
    );
  }
  const pill =
    tone === "emerald"
      ? "border-emerald-300 bg-emerald-100 text-emerald-700"
      : "border-sky-300 bg-sky-100 text-sky-700";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${pill}`}>
        พิมพ์แล้ว
      </span>
      {print.date && <span className="text-[10px] text-slate-500 whitespace-nowrap">{fmtDate(print.date)}</span>}
      {print.adminId && <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">{print.adminId}</span>}
    </div>
  );
}

export function ReceiptsVoidTable({
  rows,
  totals,
}: {
  rows: ReceiptListRow[];
  totals: { totalBeforeWithholding: number; whtAmount: number; ramount: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const voidableIds = useMemo(
    () => rows.filter((r) => isVoidable(r.rstatus)).map((r) => r.id),
    [rows],
  );
  const allVoidableSelected =
    voidableIds.length > 0 && voidableIds.every((id) => selected.has(id));

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(() => (allVoidableSelected ? new Set() : new Set(voidableIds)));
  }

  function submitVoid() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (reason.trim().length < 3) {
      setMsg({ kind: "err", text: "กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)" });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await adminVoidReceipts({ receiptIds: ids, reason: reason.trim() });
      if (res.ok) {
        const { voided, skipped } = res.data ?? { voided: 0, skipped: 0 };
        setMsg({
          kind: "ok",
          text: `✓ ยกเลิกใบเสร็จแล้ว ${voided} ใบ${skipped > 0 ? ` · ข้าม ${skipped} ใบ (ยกเลิกไปแล้ว)` : ""}`,
        });
        setSelected(new Set());
        setReason("");
        setShowDialog(false);
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  const selectedCount = selected.size;

  return (
    <>
      {msg && (
        <div
          className={`rounded-lg p-2.5 text-sm border ${
            msg.kind === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto scrollbar-x-visible">
        <table className="min-w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60 [&>tfoot>tr>td]:border [&>tfoot>tr>td]:border-border/60">
          <thead className="bg-orange-500 text-white text-xs [&>tr>th]:border-orange-400/60">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-10">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหมด"
                  className="rounded border-slate-300"
                  checked={allVoidableSelected}
                  onChange={toggleAll}
                  disabled={voidableIds.length === 0}
                  title={voidableIds.length === 0 ? "ไม่มีใบที่ยกเลิกได้ในหน้านี้" : "เลือกทั้งหมด (ที่ยกเลิกได้)"}
                />
              </th>
              <th className="px-2 py-2 text-left font-medium">ID</th>
              <th className="px-2 py-2 text-left font-medium">เลขที่เอกสาร</th>
              <th className="px-2 py-2 text-left font-medium">เลขที่ฝากนำเข้า</th>
              <th className="px-2 py-2 text-left font-medium">วันที่ออก</th>
              <th className="px-2 py-2 text-center font-medium">สลิป</th>
              <th className="px-2 py-2 text-left font-medium">วันที่สร้าง</th>
              <th className="px-2 py-2 text-center font-medium">ประเภทลูกค้า</th>
              <th className="px-2 py-2 text-left font-medium">รหัสลูกค้า</th>
              <th className="px-2 py-2 text-left font-medium">เลขผู้เสียภาษี</th>
              <th className="px-2 py-2 text-left font-medium">ชื่อลูกค้า</th>
              <th className="px-2 py-2 text-right font-medium">
                <Explain label="ก่อนหัก ณ ที่จ่าย" def={GUIDE.bill_gross} align="right" />
              </th>
              <th className="px-2 py-2 text-right font-medium">
                <Explain label="มูลค่าสุทธิ" def={GUIDE.bill_net_payable} align="right" />
              </th>
              <th className="px-2 py-2 text-center font-medium">สถานะพิมพ์ต้นฉบับ</th>
              <th className="px-2 py-2 text-center font-medium">สถานะพิมพ์สำเนา</th>
              <th className="px-2 py-2 text-center font-medium">สถานะ</th>
              <th className="px-2 py-2 text-center font-medium">ตัวเลือก</th>
            </tr>
          </thead>
          <tbody className="text-[11px]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={17} className="px-3 py-12 text-center text-slate-500 text-sm">
                  ไม่พบใบเสร็จในเงื่อนไขที่เลือก
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const cfg = rstatusCfg(r.rstatus);
                const voidable = isVoidable(r.rstatus);
                const checked = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-slate-50/80 ${checked ? "bg-red-50/40" : ""}`}
                  >
                    {/* ☐ tick-to-void */}
                    <td className="px-2 py-2 align-middle">
                      {voidable ? (
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${r.rid}`}
                          className="rounded border-slate-300"
                          checked={checked}
                          onChange={() => toggleOne(r.id)}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`${r.rid} ยกเลิกแล้ว`}
                          className="rounded border-slate-300"
                          disabled
                          title="ยกเลิกไปแล้ว"
                        />
                      )}
                    </td>
                    {/* ① ID */}
                    <td className="px-2 py-2 text-slate-500 tabular-nums">{r.id}</td>
                    {/* ② เลขที่เอกสาร → receipt detail/print */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Link
                        href={`/admin/accounting/forwarder-invoice/${r.id}`}
                        className="font-semibold text-sky-700 hover:underline"
                      >
                        {r.rid}
                      </Link>
                      {r.refid && r.refid.trim() && (
                        <div className="text-[10px] text-slate-500 font-mono">{r.refid}</div>
                      )}
                    </td>
                    {/* ②b เลขที่ฝากนำเข้า — fid(s) → forwarder detail (legacy L298-309) */}
                    <td className="px-2 py-2 align-middle">
                      {r.forwarderIds.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                          {r.forwarderIds.map((fid) => (
                            <Link
                              key={fid}
                              href={`/admin/forwarders/${fid}`}
                              className="font-mono text-sky-700 hover:underline whitespace-nowrap"
                            >
                              {fid}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    {/* ③ วันที่ออก (rdate) */}
                    <td className="px-2 py-2 whitespace-nowrap text-slate-700">{fmtDate(r.rdate)}</td>
                    {/* ④ สลิป — tb_receipt has NO imagesslip column; the slip lives on the
                        linked wallet-deposit (refwhid → tb_wallet_hs). Link there if present. */}
                    <td className="px-2 py-2 text-center">
                      {r.refwhid ? (
                        <Link
                          href={`/admin/wallet/${r.refwhid}`}
                          className="text-sky-700 hover:underline whitespace-nowrap"
                          title="ดูสลิปที่รายการเติมเงินที่อ้างอิง"
                        >
                          กดเพื่อดูสลิป
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    {/* ⑤ วันที่สร้าง (rdatecreate) */}
                    <td className="px-2 py-2 whitespace-nowrap text-slate-600">{fmtDate(r.rdatecreate)}</td>
                    {/* ⑥ ประเภทลูกค้า */}
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          r.isCorporate
                            ? "bg-rose-100 text-rose-700 border border-rose-300"
                            : "bg-slate-100 text-slate-600 border border-slate-300"
                        }`}
                      >
                        {r.isCorporate ? "นิติบุคคล" : "บุคคลธรรมดา"}
                      </span>
                    </td>
                    {/* ⑦ รหัสลูกค้า → customer detail */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Link
                        href={`/admin/customers/${r.userid}`}
                        className="font-mono text-sky-700 hover:underline"
                      >
                        {r.userid}
                      </Link>
                    </td>
                    {/* ⑧ เลขผู้เสียภาษี (recompnumber) */}
                    <td className="px-2 py-2 whitespace-nowrap font-mono text-slate-600">
                      {r.recompnumber ?? "—"}
                    </td>
                    {/* ⑨ ชื่อลูกค้า */}
                    <td className="px-2 py-2">
                      <span className="font-medium text-slate-900">{r.customerLabel}</span>
                    </td>
                    {/* ⑩ ก่อนหัก ณ ที่จ่าย */}
                    <td className="px-2 py-2 text-right tabular-nums">฿{fmtThb(r.totalBeforeWithholding)}</td>
                    {/* ⑪ มูลค่าสุทธิ */}
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary-700">
                      ฿{fmtThb(r.ramount)}
                    </td>
                    {/* ⑪b สถานะพิมพ์ต้นฉบับ (legacy statusPrint · L339-347) */}
                    <td className="px-2 py-2 text-center align-middle">
                      <PrintStatusCell print={r.printOriginal} tone="emerald" />
                    </td>
                    {/* ⑪c สถานะพิมพ์สำเนา (legacy statusPrintCopy · L348-356) */}
                    <td className="px-2 py-2 text-center align-middle">
                      <PrintStatusCell print={r.printCopy} tone="sky" />
                    </td>
                    {/* ⑫ สถานะ (Pacred RSTATUS_CFG · legacy ● dot style) */}
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium ${cfg.text}`}>
                        <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden />
                        {cfg.label}
                      </span>
                    </td>
                    {/* ⑬ ตัวเลือก — ดูใบเสร็จ + อ้างอิงชำระเงิน */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/admin/accounting/forwarder-invoice/${r.id}`}
                          className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-600 whitespace-nowrap"
                        >
                          ดูใบเสร็จ
                        </Link>
                        {r.refwhid && (
                          <Link
                            href={`/admin/wallet/${r.refwhid}`}
                            className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600 whitespace-nowrap"
                          >
                            อ้างอิงชำระเงิน
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-cyan-100 font-semibold text-sm text-cyan-900 [&>td]:border-cyan-200">
                <td colSpan={11} className="px-3 py-2.5 text-right">
                  รวม {rows.length.toLocaleString()} รายการ ในหน้านี้
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">฿{fmtThb(totals.totalBeforeWithholding)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">฿{fmtThb(totals.ramount)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Sticky bulk bar — appears when ≥1 receipt is ticked */}
      {selectedCount > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm font-medium text-slate-700">
            เลือก {selectedCount} ใบ
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              ล้างการเลือก
            </button>
            <button
              type="button"
              onClick={() => { setShowDialog(true); setMsg(null); }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              🗑 ยกเลิก (void · เก็บประวัติ)
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog with a required reason */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">ยกเลิกใบเสร็จ (void)</h3>
            <p className="text-sm text-slate-600">
              จะยกเลิกใบเสร็จที่เลือก <span className="font-semibold">{selectedCount} ใบ</span> ·
              เอกสารจะถูกทำเครื่องหมาย <span className="font-medium text-red-700">ยกเลิก</span> แต่{" "}
              <span className="font-semibold">ยังเก็บประวัติไว้</span> (ไม่ลบ · ไม่ขยับเงิน).
            </p>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">
                เหตุผลที่ยกเลิก <span className="text-red-500">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                placeholder="เช่น 'ออกผิดลูกค้า', 'ออกซ้ำ', 'ยอดผิด'"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowDialog(false); setReason(""); }}
                disabled={pending}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={submitVoid}
                disabled={pending || reason.trim().length < 3}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "กำลังยกเลิก…" : `ยืนยันยกเลิก ${selectedCount} ใบ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
