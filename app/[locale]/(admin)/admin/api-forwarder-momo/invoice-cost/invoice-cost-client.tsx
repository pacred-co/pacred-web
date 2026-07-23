"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  previewMomoInvoiceCost,
  applyMomoInvoiceCost,
  type MomoIngestPreview,
  type MomoIngestPreviewRow,
  type MomoInvoiceCabinetRollup,
  type MomoInvoiceShipmentRollup,
} from "@/actions/admin/momo-invoice-ingest";
import {
  createMomoInvoiceSettlement,
  getMomoSettledFids,
} from "@/actions/admin/momo-invoice-settlement";

const baht = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mirrors MOMO_INVOICE_PDF_MAX_BYTES (lib/admin/momo-invoice-pdf-text.ts). The server
 *  re-asserts it — this only spares the accountant a pointless 20 MB upload. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** อ่านไฟล์ → base64 (ตัด "data:...;base64," ออก) — แบบเดียวกับหน้าอัพ packing list. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.readAsDataURL(file);
  });
}

/** แหล่งที่มาของใบที่กำลังดูอยู่ — ส่งกลับไปตอนกดบันทึกให้ server แกะซ้ำเอง. */
type Source = { kind: "pdf"; fileBase64: string; fileName: string } | { kind: "text"; text: string };
const sourcePayload = (s: Source) => (s.kind === "pdf" ? { fileBase64: s.fileBase64 } : { text: s.text });

const CBM_BASIS_LABEL: Record<string, string> = {
  line_total: "คิว = ยอดรวมทั้งบรรทัด (ต้นทุน = คิว × เรท · จำนวนกล่องไม่ใช่ตัวคูณ)",
  per_box: "คิว = ต่อกล่อง (ต้นทุน = คิว × เรท × จำนวนกล่อง)",
};

/** คิว 4 ตำแหน่ง (เท่าที่ MOMO พิมพ์บนใบ) — 6 ตำแหน่งที่เราเก็บไว้ไม่ต้องโชว์ให้ตาลาย. */
const cbm = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
/** เติมเครื่องหมายเสมอ — ดิฟที่ไม่มีเครื่องหมายอ่านไม่ออกว่าบวกหรือลบ. */
const signedBaht = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}฿${baht(Math.abs(n))}`;
const signedCbm = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${cbm(Math.abs(n))}`;

/** ป้ายดิฟ — `good` บอกว่า "บวก" แปลว่าดีหรือแย่ (ต้นทุนบวก = แย่ · กำไรบวก = ดี). */
function DiffPill({ value, text, good }: { value: number; text: string; good: "up" | "down" }) {
  const nil = Math.abs(value) < 0.005;
  const positive = value > 0;
  const isGood = nil ? null : good === "up" ? positive : !positive;
  const cls = nil
    ? "bg-gray-100 text-gray-600"
    : isGood
      ? "bg-emerald-100 text-emerald-800"
      : "bg-red-100 text-red-800";
  return <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${cls}`}>{text}</span>;
}

/**
 * สรุปเทียบทั้งใบ — owner 2026-07-23: *"เวลาบัญชีเขาเอาไฟล์ pdf มาใส่เทียบ ต้องขึ้น คิวในระบบ
 * คิวที่ momo เรียกเก็บมา ดิฟกัน + - เท่าไร ต้นทุน MOMO เก็บเราเท่าไร ระบบเรา ขายเขาไปเท่าไร
 * มีช่องแสดงผล diff กำไร + - ให้ดูด้วยครับ"*
 *
 * ทุกตัวเลขมาจาก `buildReconcileTotals` ฝั่ง server (lib/admin/momo-invoice-reconcile.ts)
 * — หน้านี้ไม่คำนวณเงินเอง จะได้ไม่มีวันเพี้ยนจากตารางข้างล่างหรือยอดต่อตู้.
 *
 * Σ นับเฉพาะบรรทัดที่ "จับคู่กับระบบได้" เพราะบรรทัดที่หาแถวไม่เจอไม่มีคิว/ขาย/ต้นทุนของเรา
 * ให้เทียบ — บรรทัดพวกนั้นรายงานแยกไว้ท้ายการ์ด (§0f อย่ามั่ว: ไม่กลืนหาย ไม่เอาไปปนยอด).
 */
function ReconcileSummary({ p }: { p: MomoIngestPreview }) {
  const r = p.reconcile;
  const partial = r.unmatchedLines > 0;

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div>
        <h2 className="text-sm font-semibold">สรุปเทียบใบนี้กับระบบ</h2>
        <p className="mt-0.5 text-[12px] text-muted">
          เทียบ <strong>คิว</strong> · <strong>ต้นทุนที่ MOMO เก็บ</strong> · <strong>ราคาขาย</strong> ·{" "}
          <strong>กำไรก่อน/หลังบันทึก</strong> — ตัวเลขชุดนี้คิดจาก {r.matchedLines} บรรทัดที่จับคู่กับระบบได้
          {partial && <> (จากทั้งใบ {r.lines} บรรทัด)</>}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* ── คิว ───────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-surface-alt/40 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">คิว (CBM)</div>
          <dl className="mt-2 space-y-1 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">ในระบบเรา</dt>
              <dd className="font-semibold tabular-nums">{cbm(r.ourCbm)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">MOMO เรียกเก็บ</dt>
              <dd className="font-semibold tabular-nums">{cbm(r.invoiceCbm)}</dd>
            </div>
          </dl>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-[12px] text-muted">ดิฟ</span>
            <DiffPill value={r.cbmDiff} text={signedCbm(r.cbmDiff)} good="up" />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            + = ระบบเรามีคิวมากกว่าที่ใบเรียกเก็บ · − = MOMO เก็บคิวมากกว่าที่เรามี
          </p>
        </div>

        {/* ── ต้นทุน ────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-surface-alt/40 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">ต้นทุน — MOMO เก็บเรา</div>
          <div className="mt-1 text-xl font-bold tabular-nums">฿{baht(r.invoiceCost)}</div>
          <dl className="mt-2 space-y-1 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">ระบบบันทึกไว้ตอนนี้</dt>
              <dd className="font-semibold tabular-nums">฿{baht(r.currentCost)}</dd>
            </div>
          </dl>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-[12px] text-muted">ดิฟ</span>
            <DiffPill value={r.costDiff} text={signedBaht(r.costDiff)} good="down" />
          </div>
          <p className="mt-1 text-[11px] text-muted">+ = MOMO เก็บมากกว่าที่ระบบบันทึกไว้ (บันทึกแล้วต้นทุนเพิ่ม)</p>
        </div>

        {/* ── ขาย ───────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-surface-alt/40 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">ระบบเราขายไป</div>
          <div className="mt-1 text-xl font-bold tabular-nums">฿{baht(r.sell)}</div>
          <p className="mt-2 text-[11px] text-muted">
            ค่านำเข้าจีน-ไทย ที่เก็บลูกค้า (ช่องเดียวกับ “ราคาขาย” ในหน้ารายงานตู้) —{" "}
            <strong>ไม่รวม</strong>ค่าขนส่งในไทย · ตีลัง · อื่นๆ เพราะ MOMO ไม่ได้เก็บขาพวกนั้น
          </p>
          {r.sellMissingLines > 0 && (
            <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              ⚠ ยังไม่ตั้งราคา {r.sellMissingLines} รายการ — กำไรด้านขวายังต่ำกว่าจริงอยู่
            </p>
          )}
        </div>

        {/* ── กำไร ──────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-surface-alt/40 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">กำไร (ขาย − ต้นทุน)</div>
          <dl className="mt-2 space-y-1 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">ตอนนี้</dt>
              <dd className="font-semibold tabular-nums">฿{baht(r.profitNow)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">หลังบันทึกใบนี้</dt>
              <dd className={`font-semibold tabular-nums ${r.profitAfter < 0 ? "text-red-700" : ""}`}>
                ฿{baht(r.profitAfter)}
              </dd>
            </div>
          </dl>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-[12px] text-muted">ดิฟ</span>
            <DiffPill value={r.profitDiff} text={signedBaht(r.profitDiff)} good="up" />
          </div>
          <p className="mt-1 text-[11px] text-muted">+ = บันทึกใบนี้แล้วกำไรเพิ่ม · − = กำไรลด</p>
        </div>
      </div>

      {/* ยอดทั้งใบ vs ยอดที่เทียบได้ — ต้องเห็นว่ามีส่วนที่ยังเทียบไม่ได้เหลืออยู่ไหม */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-[12px]">
        <span>
          <span className="text-muted">ยอดทั้งใบ (Σ ทุกบรรทัด): </span>
          <strong className="tabular-nums">฿{baht(r.invoiceCostAll)}</strong>
        </span>
        {p.whtThb != null && (
          <span className="text-muted">
            หัก ณ ที่จ่าย 1% บนใบ: <strong className="tabular-nums text-foreground">฿{baht(p.whtThb)}</strong>
          </span>
        )}
        {partial ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
            ยังเทียบไม่ได้ {r.unmatchedLines} บรรทัด ฿{baht(r.unmatchedCost)} — จับคู่กับระบบไม่ได้ (ดูเหตุผลรายบรรทัดด้านล่าง)
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
            เทียบได้ครบทุกบรรทัด
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * สรุป "ต่อตู้" + สะพานไปตัดจ่ายค่าตู้ — owner: "MOMO วางบิลเรามาเป็น Tracking ครับ แต่เรา
 * คิดเป็นตู้ ไปตรวจให้ตรงกันนะครับ" แล้ว "ทำตัดจ่ายต้นทุนตู้ในระบบเราได้เลย".
 *
 * ตารางข้างล่างเป็นราย-แทรคกิ้ง (grain ของใบ) แต่การจ่ายเกิดที่ **ตู้** — ก่อนหน้านี้บัญชี
 * ต้องบวกเองว่าตู้นี้ใบเรียกเก็บเท่าไร แล้วไปไล่หาตู้เองใน 44 ตู้ที่หน้าจ่าย.
 */

function CabinetRollupCard({ rollup }: { rollup: MomoInvoiceCabinetRollup[] }) {
  if (rollup.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div>
        <h2 className="text-sm font-semibold">ตรวจต่อ “ตู้” — ใบนี้เรียกเก็บตู้ไหนบ้าง (ดูอ้างอิงเท่านั้น)</h2>
        <p className="mt-0.5 text-[12px] text-muted">
          MOMO เก็บเราเป็น <strong>แทรคกิ้ง</strong> — <strong>การตัดจ่ายจึงเกิดที่แทรคกิ้ง/บิล ไม่ใช่ที่ตู้</strong>{" "}
          (ปุ่ม “ตัดจ่าย” อยู่ในตารางรายแทรคกิ้งด้านล่าง · บิลเดียวมีหลายตู้ได้) ·
          ตารางนี้ไว้<strong>ไล่ดูว่าใบรอบนี้แตะตู้ไหนบ้าง</strong> กดเลขตู้เพื่อเปิดดูตู้นั้นได้
        </p>
      </div>

      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-left">ตู้</th>
              <th className="px-2 py-2 text-right">คิว เรา / ใบ · ดิฟ</th>
              <th className="px-2 py-2 text-right">ใบรอบนี้เรียกเก็บ</th>
              <th className="px-2 py-2 text-right">ขาย · กำไรหลังบันทึก</th>
              <th className="px-2 py-2 text-right">ต้นทุนทั้งตู้ในระบบเรา</th>
              <th className="px-2 py-2 text-left">ผล / ต้องทำอะไร</th>
              <th className="px-2 py-2 text-right">อ้างอิง</th>
            </tr>
          </thead>
          <tbody>
            {rollup.map((c) => (
              <tr
                key={c.cabinet ?? "none"}
                className={`border-t border-border align-top ${
                  !c.canPay ? "bg-red-50/60" : c.partialRound ? "bg-orange-50/50" : ""
                }`}
              >
                <td className="px-2 py-2">
                  {c.cabinet ? (
                    <Link
                      href={`/admin/report-cnt/${encodeURIComponent(c.cabinet)}`}
                      className="font-mono font-medium text-primary-600 underline decoration-dotted underline-offset-2 hover:text-primary-700"
                    >
                      {c.cabinet}
                    </Link>
                  ) : (
                    <span className="font-mono font-medium">(ใบไม่ระบุตู้)</span>
                  )}
                  {c.transportLabel && <span className="ml-1 text-muted">· {c.transportLabel}</span>}
                  {c.paid && <span className="ml-1 rounded bg-gray-200 px-1 text-[11px] text-gray-700">จ่ายแล้ว</span>}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <span className="tabular-nums">{cbm(c.ourCbm)}</span>
                  <span className="text-muted"> / {cbm(c.invoiceCbm)}</span>
                  <div className="mt-0.5">
                    <DiffPill value={c.cbmDiff} text={signedCbm(c.cbmDiff)} good="up" />
                  </div>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <span className="font-semibold">฿{baht(c.invoiceTotal)}</span>
                  <div className="text-[11px] text-muted">{c.invoiceLines} แทรคกิ้ง</div>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <span className="tabular-nums">฿{baht(c.ourSell)}</span>
                  <div className={`text-[11px] font-medium tabular-nums ${c.profitAfter < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    กำไร ฿{baht(c.profitAfter)}
                  </div>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {c.ourCostSum == null ? (
                    <span className="text-red-700">ไม่มีตู้นี้ในระบบ</span>
                  ) : (
                    <>
                      <span>฿{baht(c.ourCostSum)}</span>
                      <div className="text-[11px] text-muted">{c.ourRows} แถว</div>
                    </>
                  )}
                </td>
                <td className="px-2 py-2 text-[11px]">
                  {c.payBlockReason ? (
                    <span className="font-medium text-red-700">🔴 {c.payBlockReason}</span>
                  ) : c.partialRound ? (
                    <>
                      <span className="font-medium text-orange-700">
                        🔴 MOMO ยังบิลตู้นี้ไม่ครบ — บิลแค่ {c.invoiceLines} จาก {c.ourRows} แถว
                      </span>
                      <div className="mt-0.5 text-muted">
                        ส่วนต่าง ฿{baht(c.roundDiff)} คือของที่ MOMO <strong>ยังไม่ได้เรียกเก็บ</strong> (ระบบตั้งเป็น
                        ต้นทุนประเมินไว้ก่อน) · <strong>จ่ายรอบนี้ ฿{baht(c.invoiceTotal)} เท่านั้น</strong> อย่าจ่ายยอดทั้งตู้
                        <br />
                        ✅ ตัดจ่ายเป็น <strong>รายแทรคกิ้ง</strong> (ตารางล่าง) — รอบนี้ตัดเฉพาะที่ใบเรียกเก็บ
                        ส่วนที่ MOMO ยังไม่บิล รอบหน้ามาค่อยตัดเพิ่มได้ ไม่ติดล็อก
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-green-700">✓ ตรวจผ่าน — ตัดจ่ายได้ (ที่ตารางรายแทรคกิ้ง)</span>
                      <div className="mt-0.5 text-muted">
                        ยอดที่ใบรอบนี้เรียกเก็บในตู้นี้ = <strong>฿{baht(c.invoiceTotal)}</strong>
                        {c.roundDiff != null && Math.abs(c.roundDiff) > 0.02 && (
                          <>
                            {" · "}ต้นทุนในระบบยังต่างอยู่ ฿{baht(Math.abs(c.roundDiff))} —{" "}
                            {c.willApplyLines > 0
                              ? "กด “ยืนยันบันทึกต้นทุน” ก่อน แล้วยอดจะตรงกัน"
                              : "ตรวจกับทีมพัฒนา"}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {c.cabinet ? (
                    <Link
                      href={`/admin/report-cnt/${encodeURIComponent(c.cabinet)}`}
                      className="inline-block whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-surface-alt"
                      title={`เปิดดูรายละเอียดตู้ ${c.cabinet}`}
                    >
                      ดูตู้ →
                    </Link>
                  ) : (
                    <span className="text-[11px] text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ผลของแถว — บอกสถานะ + สิ่งที่ต้องทำต่อ ในตาแรก (§0g). */
function RowOutcome({ r }: { r: MomoIngestPreviewRow }) {
  if (!r.matched) return <span className="font-medium text-red-700">🔴 ไม่พบในระบบ</span>;
  if (r.duplicateFid) return <span className="font-medium text-red-700">🔴 ชี้ซ้ำรายการเดียวกัน</span>;
  if (r.cabinetConflict) return <span className="font-medium text-red-700">🔴 ตู้ไม่ตรง — ยังบันทึกไม่ได้</span>;
  if (r.cabinetPaid) return <span className="text-orange-700">⏸ ข้าม (จ่ายค่าตู้แล้ว)</span>;
  if (r.willApply) return <span className="font-medium text-amber-700">จะบันทึกต้นทุน</span>;
  return <span className="text-green-700">✓ ตรงแล้ว</span>;
}

/** จับคู่ได้ · ตู้ตรง · ไม่ชี้ซ้ำ = ตัดจ่ายได้ (ไม่ผูกกับ willApply ซึ่งเช็คว่าต้นทุนต่างด้วย). */
function rowEligibleToSettle(r: MomoIngestPreviewRow): boolean {
  return r.matched && r.fid != null && !r.cabinetConflict && !r.duplicateFid;
}

type SettledMap = Record<number, { docNo: string; settlementId: number }>;

/** ปุ่มรายแถว: ตัดจ่ายแล้ว (ชิปลิงก์ประวัติ) · หรือ บันทึกต้นทุน + ตัดจ่าย ตามสถานะ (§0d/§0g). */
function RowActions({
  r,
  settled,
  pending,
  onApply,
  onSettle,
}: {
  r: MomoIngestPreviewRow;
  settled: SettledMap;
  pending: boolean;
  onApply: (fid: number) => void;
  onSettle: (fid: number) => void;
}) {
  const s = r.fid != null ? settled[r.fid] : undefined;
  if (s) {
    return (
      <Link
        href={`/admin/api-forwarder-momo/invoice-cost/history/${s.settlementId}`}
        className="mt-1 inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-200"
        title="ดูเอกสารตัดจ่าย + แนบสลิป"
      >
        ✓ ตัดจ่ายแล้ว · {s.docNo}
      </Link>
    );
  }
  if (r.fid == null) return null;
  const fid = r.fid;
  const canSettle = rowEligibleToSettle(r);
  if (!r.willApply && !canSettle) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {r.willApply && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onApply(fid)}
          className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          บันทึกต้นทุน
        </button>
      )}
      {canSettle && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onSettle(fid)}
          className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          title="ตัดจ่ายบิลเฉพาะรายการนี้ (ออกเลขเอกสาร + เก็บประวัติ)"
        >
          ตัดจ่าย
        </button>
      )}
    </div>
  );
}

export function MomoInvoiceCostClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [preview, setPreview] = useState<MomoIngestPreview | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  // fid → เลขเอกสารตัดจ่ายที่ครอบแถวนี้อยู่ (non-void) — โชว์ชิป "ตัดจ่ายแล้ว" + คำนวณ "ที่เหลือ"
  const [settled, setSettled] = useState<SettledMap>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  /** เลขฐานชิปเม้น → ยอดทั้งครอบครัว · ใช้อธิบายกำไรรายกล่องที่ติดลบ (Σ มาจาก DB ฝั่ง server
   *  ไม่ใช่จากบรรทัดบนใบ — ครอบครัวอาจถูกบิลไม่ครบในรอบเดียว). */
  const shipByBase = new Map<string, MomoInvoiceShipmentRollup>(
    (preview?.byShipment ?? []).map((s) => [s.base, s]),
  );

  /** ดึงว่าแถวไหน (fid) ถูกตัดจ่ายไปแล้ว — เรียกหลัง preview + หลังบันทึก/ตัดจ่าย. */
  const refreshSettled = useCallback(async (rows: MomoIngestPreview["rows"]) => {
    const fids = rows.map((r) => r.fid).filter((f): f is number => f != null);
    if (fids.length === 0) { setSettled({}); return; }
    const res = await getMomoSettledFids({ fids });
    if (!res.ok || !res.data) { setSettled({}); return; }
    const map: SettledMap = {};
    for (const s of res.data.settled) map[s.fid] = { docNo: s.docNo, settlementId: s.settlementId };
    setSettled(map);
  }, []);

  /** ทุกครั้งที่เปลี่ยนแหล่งที่มา ต้องล้าง preview เก่าทิ้ง — กันกดบันทึกจากใบที่ไม่ได้ดูอยู่. */
  function resetTo(s: Source | null) {
    setMsg(null);
    setPreview(null);
    setSettled({});
    setSource(s);
  }

  function runPreview(s: Source) {
    resetTo(s);
    start(async () => {
      const res = await previewMomoInvoiceCost(sourcePayload(s));
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      setPreview(res.data);
      void refreshSettled(res.data.rows);
      if (res.data.rows.length === 0) {
        setMsg({
          kind: "err",
          text: s.kind === "pdf"
            ? "อ่านไฟล์ได้ แต่ไม่พบรายการในใบ — ไฟล์นี้อาจไม่ใช่ใบแจ้งหนี้ MOMO หรือ MOMO เปลี่ยนรูปแบบใบ · แจ้งทีมพัฒนาพร้อมไฟล์"
            : "อ่านไม่พบรายการในใบแจ้งหนี้ — ตรวจรูปแบบข้อความที่วาง",
        });
      }
    });
  }

  async function handleFile(file: File) {
    if (!/\.pdf$/i.test(file.name)) {
      resetTo(null);
      setMsg({ kind: "err", text: `รองรับเฉพาะไฟล์ .pdf (ใบแจ้งหนี้ที่ MOMO ส่งมา) — ไฟล์ที่เลือกคือ "${file.name}"` });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      resetTo(null);
      setMsg({ kind: "err", text: `ไฟล์ใหญ่เกินไป (${(file.size / 1024 / 1024).toFixed(1)} MB) — จำกัด 20 MB · ใบแจ้งหนี้ MOMO จริงประมาณ 0.2 MB ไฟล์นี้อาจไม่ใช่ใบแจ้งหนี้` });
      return;
    }
    let b64: string;
    try {
      b64 = await fileToBase64(file);
    } catch {
      resetTo(null);
      setMsg({ kind: "err", text: "อ่านไฟล์ไม่สำเร็จ — ลองเลือกไฟล์ใหม่อีกครั้ง" });
      return;
    }
    runPreview({ kind: "pdf", fileBase64: b64, fileName: file.name });
  }

  /** re-run preview จากแหล่งเดิม + refresh ชิปตัดจ่าย — ใช้หลังทุก action ที่เปลี่ยนสถานะ. */
  async function reloadPreview(s: Source) {
    const re = await previewMomoInvoiceCost(sourcePayload(s));
    if (re.ok && re.data) { setPreview(re.data); await refreshSettled(re.data.rows); }
  }

  /** บันทึกต้นทุน — ทั้งหมด (onlyFids ว่าง) หรือรายการเดียว (onlyFids=[fid]). owner: "แสดงผล
   *  กลับของ action นั้นๆ" → โชว์ เขียน/ข้าม รายผล. */
  function doApply(onlyFids?: number[]) {
    if (!preview || !source) return;
    const scope = onlyFids
      ? preview.rows.filter((r) => r.willApply && r.fid != null && onlyFids.includes(r.fid))
      : preview.rows.filter((r) => r.willApply);
    const n = scope.length;
    if (n === 0) { setMsg({ kind: "err", text: "ไม่มีรายการที่ต้องบันทึก (ต้นทุนตรงแล้ว หรือถูกบล็อก)" }); return; }
    const sumThb = scope.reduce((a, r) => a + r.invoiceCost, 0);
    if (!onlyFids) {
      // ยืนยันเฉพาะ "บันทึกทั้งหมด" (§0f) — รายการเดียวถือว่าเจตนาชัดจากปุ่มในแถว
      const blocked = preview.summary.blocked;
      const warn = blocked > 0 ? `\n\n⚠️ มี ${blocked} บรรทัดที่ถูกบล็อกและจะไม่ถูกบันทึก (ตู้ไม่ตรง / ไม่พบในระบบ) — ดูเหตุผลรายบรรทัดในตาราง` : "";
      const from = source.kind === "pdf" ? `\nจากไฟล์: ${source.fileName}` : "";
      if (!window.confirm(`บันทึกต้นทุนจากใบแจ้งหนี้ MOMO ${preview.invoiceNo ?? ""}${from}\nจำนวน ${n} แทรคกิ้ง · รวม ฿${baht(sumThb)}\n(ตู้ที่จ่ายเงินแล้วจะถูกข้าม)${warn}\n\nยืนยันบันทึก?`)) return;
    }
    setMsg(null);
    start(async () => {
      // ส่ง "แหล่งที่มา" กลับไป ไม่ใช่ผลที่อ่านได้ — server แกะ + คิดใหม่เองทั้งหมด (กติกาเงิน)
      const res = await applyMomoInvoiceCost({ ...sourcePayload(source), ...(onlyFids ? { onlyFids } : {}) });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      const d = res.data;
      const skippedNote = d.skipped > 0 ? ` · ข้าม ${d.skipped} (ต้นทุนตรงอยู่แล้ว)` : "";
      setMsg({ kind: "ok", text: `✅ บันทึกต้นทุนแล้ว ${d.applied}/${d.requested} แทรคกิ้ง${skippedNote} (ใบ ${d.invoiceNo ?? "-"})` });
      await reloadPreview(source);
      router.refresh();
    });
  }

  /** ตัดจ่ายบิล MOMO — รายการเดียว (fids=[fid]) หรือทั้งบิล (fids = ที่เหลือที่ยังไม่ตัดจ่าย).
   *  owner: "คำว่า ตัดจ่ายตู้นี้ใช้ไม่ได้ … บางบิลมีหลายตู้" → ตัดจ่ายเป็น "บิล" เสมอ. */
  function doSettle(fids: number[]) {
    if (!preview || !source) return;
    if (fids.length === 0) { setMsg({ kind: "err", text: "ไม่มีรายการที่ตัดจ่ายได้ (จับคู่ไม่ได้ / ตู้ไม่ตรง / ตัดจ่ายไปแล้ว)" }); return; }
    const rows = preview.rows.filter((r) => r.fid != null && fids.includes(r.fid));
    const sumThb = rows.reduce((a, r) => a + r.invoiceCost, 0);
    const label = fids.length === 1 ? `แทรคกิ้ง ${rows[0]?.tracking ?? ""}` : `ทั้งบิล ${fids.length} รายการ`;
    if (!window.confirm(`ตัดจ่ายบิล MOMO ${preview.invoiceNo ?? ""}\n${label} · รวม ฿${baht(sumThb)}\nระบบจะออกเลขเอกสารตัดจ่าย + เก็บประวัติ (แนบสลิปย้อนหลังได้)\n\nยืนยันตัดจ่าย?`)) return;
    setMsg(null);
    start(async () => {
      const res = await createMomoInvoiceSettlement({ ...sourcePayload(source), fids });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "ตัดจ่ายไม่สำเร็จ" : res.error }); return; }
      const d = res.data;
      setMsg({ kind: "ok", text: `💸 ตัดจ่ายบิลแล้ว — เลขเอกสาร ${d.docNo} · ${d.lineCount} รายการ · ฿${baht(d.totalThb)} (ดูประวัติ + แนบสลิปได้ที่ “ประวัติการตัดจ่าย”)` });
      await reloadPreview(source);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block text-sm font-medium">อัปโหลดใบแจ้งหนี้ MOMO (ฮุย ไท่ต๋า) — ไฟล์ PDF</label>
        <p className="text-xs text-muted">
          MOMO ส่งไฟล์ใบแจ้งหนี้มาเป็นรอบๆ — ลากไฟล์ PDF มาวาง หรือกดเลือกไฟล์ได้เลย (ไม่ต้องเปิดไฟล์ก๊อปข้อความแล้ว)
          ระบบจะอ่านต้นทุนต่อแทรคกิ้ง (ราคา &quot;รวม (Total)&quot; = ต้นทุนจริงที่ MOMO เรียกเก็บ Pacred)
          แล้ว<strong>ตรวจกับระบบเราว่าตรงกันไหม</strong>ก่อนให้กดบันทึก · MOMO วางบิลมาเป็น <strong>แทรคกิ้ง</strong>{" "}
          แต่เราคิดเป็น <strong>ตู้</strong> — บรรทัดที่ตู้ไม่ตรงจะถูกบล็อกไว้ให้ตรวจก่อน
          · <strong>อัปทีละใบ</strong> เสร็จแล้วอัปใบถัดไปได้เลย (ระบบตรวจยอดรวมของแต่ละใบกับ Sub-total ของใบนั้น จึงต้องแยกใบ)
        </p>

        {/* ทางเข้าหลัก — ลาก/วาง หรือ กดเลือกไฟล์ (§0d) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          onClick={() => !pending && fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragOver ? "border-primary-500 bg-primary-50/60" : "border-border bg-surface-alt/30 hover:border-primary-400"
          } ${pending ? "pointer-events-none opacity-60" : ""}`}
        >
          <p className="text-sm font-medium">
            {pending ? "กำลังอ่านไฟล์…" : "ลากไฟล์ PDF มาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์"}
          </p>
          <p className="mt-1 text-[11px] text-muted">รับเฉพาะ .pdf · ไม่เกิน 20 MB</p>
          {source?.kind === "pdf" && !pending && (
            <p className="mt-2 text-[12px] font-medium text-green-700">📄 {source.fileName}</p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = ""; // อัปไฟล์เดิมซ้ำได้ (เช่น หลังแก้ตู้ให้ตรงแล้ว)
          }}
        />

        {/* ปุ่ม "บันทึกต้นทุน" ไม่ได้อยู่ตรงนี้แล้ว — ย้ายลงไปเป็น "ขั้นที่ 1" ใต้สรุปเทียบ
            (owner 2026-07-23: "แจงให้ถูก แล้วกดบันทึก ตาม step ได้เลย") เพราะปุ่มที่ลอยอยู่
            เหนือสรุป ทำให้กดบันทึกได้ก่อนอ่านดิฟ = จุดประสงค์ของหน้านี้หายไปทั้งหน้า. */}

        {/* ทางสำรอง — เผื่อไฟล์เปิดไม่ได้/ยังไม่มีไฟล์ แต่มีข้อความ (ของเดิม ใช้ได้เหมือนเดิม) */}
        <details open={showPaste} onToggle={(e) => setShowPaste((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
            ไม่มีไฟล์ PDF? วางข้อความจากใบแทน (ทางสำรอง)
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted">
              เปิดไฟล์ PDF → เลือกข้อความทั้งหมด (Ctrl/Cmd+A) → คัดลอก → วางที่นี่ · ต้องวาง<strong>ทั้งใบรวมส่วนท้าย</strong>{" "}
              (ระบบต้องเห็นยอด &quot;ค่าขนส่งทั้งหมด (Sub-total)&quot; ถึงจะยอมให้บันทึก)
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="วางข้อความใบแจ้งหนี้ที่นี่…"
              className="w-full rounded-lg border border-border bg-surface-alt/40 p-3 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => runPreview({ kind: "text", text })}
              disabled={pending || text.trim().length < 10}
              className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? "กำลังอ่าน…" : "ดูตัวอย่างจากข้อความที่วาง"}
            </button>
          </div>
        </details>

        {/* ประตูที่ 1 — Σ ต้องตรง Sub-total บนใบ */}
        {preview && !preview.reconciles && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">🔴 ยอดไม่ตรง Sub-total บนใบ — บันทึกต้นทุนไม่ได้</p>
            <p className="mt-1 text-[13px]">
              แกะได้ {preview.rows.length} บรรทัด รวม ฿{baht(preview.linesTotal)}
              {preview.subTotal == null
                ? ' · หายอด "ค่าขนส่งทั้งหมด (Sub-total)" บนใบไม่เจอ — กรุณาวางข้อความให้ครบทั้งใบ รวมส่วนท้าย'
                : ` vs Sub-total บนใบ ฿${baht(preview.subTotal)} · ต่างกัน ฿${baht(Math.abs(preview.subTotal - preview.linesTotal))}`}
            </p>
            <p className="mt-1 text-[13px]">
              แปลว่ามีบรรทัดตกหล่นหรือรูปแบบใบเปลี่ยน — ระบบปฏิเสธทั้งไฟล์เพื่อกันเขียนต้นทุนผิด แจ้งทีมพัฒนาพร้อมเลขที่ใบ
            </p>
          </div>
        )}

        {/* ประตูที่ 2 — ต้องรู้วิธีอ่านคอลัมน์คิวของใบนี้ก่อน (ไม่เดา) */}
        {preview && preview.reconciles && !preview.cbmBasisUsable && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">🔴 อ่านวิธีคิดคิวของใบนี้ไม่ชัด — บันทึกต้นทุนไม่ได้</p>
            <p className="mt-1 text-[13px]">{preview.cbmBasisReason}</p>
            <p className="mt-1 text-[13px]">
              ยอดรวมตรง Sub-total ก็จริง แต่ถ้า MOMO คิดผิดเป็นเท่าตัว ยอดรวมของเขาก็จะตรงกับความผิดของเขาเอง —
              ระบบจึงไม่เดาสูตร แจ้งทีมพัฒนาพร้อมเลขที่ใบ
            </p>
          </div>
        )}

        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}
      </section>

      {/* สรุปเทียบทั้งใบ — คิว/ต้นทุน/ขาย/กำไร + ดิฟ (owner 2026-07-23) · อยู่บนสุดของผลตรวจ */}
      {preview && <ReconcileSummary p={preview} />}

      {/* ── ขั้นที่ 1 · บันทึกต้นทุน ─────────────────────────────────────────
          อยู่ "ใต้" สรุปโดยตั้งใจ: อ่านดิฟก่อน แล้วค่อยกดบันทึก (owner: แจงให้ถูก แล้วกดบันทึก
          ตาม step). ปุ่มเรียก doApply() ตัวเดิมทุกประการ — server ยังแกะไฟล์ใหม่เองและเขียนแค่
          fcosttotalprice เหมือนเดิม ไม่มีอะไรบนหน้าจอนี้ที่ส่งตัวเลขเงินไปให้ server. */}
      {preview && preview.canApply && preview.summary.willApply > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/60 dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                <span className="mr-1.5 rounded-full bg-amber-500 px-2 py-0.5 text-[12px] font-bold text-white">
                  ขั้นที่ 1
                </span>
                บันทึกต้นทุนจากใบนี้
              </h2>
              <p className="mt-1 text-[12px] text-muted">
                เขียนต้นทุนตามที่ MOMO เรียกเก็บ ลง {preview.summary.willApply} แทรคกิ้ง ·{" "}
                {preview.reconcile.costDiff === 0 ? (
                  <>ต้นทุนรวมเท่าเดิม</>
                ) : (
                  <>
                    ต้นทุนรวมจะ{preview.reconcile.costDiff > 0 ? "เพิ่ม" : "ลด"}{" "}
                    <strong className="tabular-nums">฿{baht(Math.abs(preview.reconcile.costDiff))}</strong> → กำไรจะ
                    {preview.reconcile.profitDiff >= 0 ? "เพิ่ม" : "ลด"}{" "}
                    <strong className="tabular-nums">฿{baht(Math.abs(preview.reconcile.profitDiff))}</strong>
                  </>
                )}
                {preview.summary.blocked > 0 && (
                  <> · ยังมี {preview.summary.blocked} บรรทัดที่ถูกบล็อก (ไม่ถูกบันทึก)</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => doApply()}
              disabled={pending}
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              บันทึกต้นทุนทั้งหมด ({preview.summary.willApply} แทรคกิ้ง)
            </button>
          </div>
        </section>
      )}

      {/* สรุปต่อตู้ (ข้อมูลอ้างอิง) — MOMO วางบิลเป็นแทรคกิ้ง บางบิลมีหลายตู้ */}
      {preview && preview.rows.length > 0 && (
        <CabinetRollupCard rollup={preview.byCabinet} />
      )}

      {/* ตัดจ่ายทั้งบิล — owner: "ตัดจ่ายทั้งบิลได้ครับ" (ไม่ใช่ต่อตู้ · บิลข้ามตู้ได้) */}
      {preview && preview.rows.length > 0 && (() => {
        const eligibleFids = preview.rows.filter(rowEligibleToSettle).map((r) => r.fid as number);
        const remainingFids = eligibleFids.filter((f) => !settled[f]);
        const settledCount = eligibleFids.length - remainingFids.length;
        const remainingSum = preview.rows
          .filter((r) => r.fid != null && remainingFids.includes(r.fid))
          .reduce((a, r) => a + r.invoiceCost, 0);
        return (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  <span className="mr-1.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[12px] font-bold text-white">
                    ขั้นที่ 2
                  </span>
                  ตัดจ่ายบิล MOMO
                </h2>
                <p className="mt-0.5 text-[12px] text-muted">
                  ออกเลขเอกสารตัดจ่าย (MCS…) + เก็บประวัติ · แนบสลิปย้อนหลังได้ที่ “ประวัติการตัดจ่าย”
                  {settledCount > 0 && <> · ตัดจ่ายแล้ว {settledCount} รายการ</>}
                  {" · "}เหลือที่ตัดจ่ายได้ {remainingFids.length} รายการ
                </p>
              </div>
              <button
                type="button"
                disabled={pending || remainingFids.length === 0}
                onClick={() => doSettle(remainingFids)}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                💸 ตัดจ่ายทั้งบิล ({remainingFids.length} รายการ · ฿{baht(remainingSum)})
              </button>
            </div>
            {eligibleFids.length > 0 && remainingFids.length === 0 && (
              <p className="text-[12px] font-medium text-emerald-700">✓ ตัดจ่ายครบทุกรายการของบิลนี้แล้ว — ดูเอกสารที่ “ประวัติการตัดจ่าย”</p>
            )}
          </section>
        );
      })()}

      {preview && preview.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold">ใบ {preview.invoiceNo ?? "-"}</span>
            <span className="text-muted">ยอดสุทธิบนใบ: ฿{baht(preview.grandTotal)}</span>
            {preview.whtThb != null && preview.whtThb > 0 && (
              <span className="text-muted" title="MOMO หักภาษี ณ ที่จ่าย 1% ไว้บนใบแล้ว — ยอดสุทธิคือยอดหลังหัก">
                หัก ณ ที่จ่าย 1%: ฿{baht(preview.whtThb)}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${preview.reconciles ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {preview.reconciles ? `Σ ตรง Sub-total ฿${baht(preview.subTotal)} ✓` : "Σ ไม่ตรง Sub-total ✗"}
            </span>
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-[11px]">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[11px]">จับคู่ได้ {preview.summary.matched}</span>
            <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px]">จะบันทึก {preview.summary.willApply}</span>
            {preview.summary.unmatched > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px]">ไม่พบในระบบ {preview.summary.unmatched}</span>}
            {preview.summary.cabinetConflicts > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px]">ตู้ไม่ตรง (บล็อก) {preview.summary.cabinetConflicts}</span>}
            {preview.summary.duplicateBlocked > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px]">ชี้ซ้ำ {preview.summary.duplicateBlocked}</span>}
            {preview.summary.cabinetUnlinked > 0 && <span className="rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 text-[11px]">ยังไม่ผูกตู้ {preview.summary.cabinetUnlinked}</span>}
            {preview.summary.matchedViaBase > 0 && <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[11px]">จับคู่แบบเลขเปล่า {preview.summary.matchedViaBase}</span>}
            {preview.summary.totalMismatches > 0 && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[11px]">ยอดไม่ตรงสูตร {preview.summary.totalMismatches}</span>}
            {preview.summary.paidSkipped > 0 && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[11px]">ข้าม (จ่ายแล้ว) {preview.summary.paidSkipped}</span>}
          </div>

          {/* บอกบัญชีว่า "ระบบอ่านใบนี้เป็นแบบไหน" — ไม่ให้เป็นกล่องดำบนเส้นทางเงิน */}
          <div className="rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-[12px]">
            <span className="font-medium">ระบบอ่านใบนี้ว่า: </span>
            {preview.cbmBasis ? (
              <span className="font-semibold text-foreground">{CBM_BASIS_LABEL[preview.cbmBasis]}</span>
            ) : (
              <span className="text-muted">ไม่ต้องชี้ขาด</span>
            )}
            <span className="ml-1 text-muted">· {preview.cbmBasisReason}</span>
          </div>

          {preview.summary.cabinetConflicts > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              🔴 <strong>ตู้ไม่ตรง {preview.summary.cabinetConflicts} บรรทัด</strong> — MOMO วางบิลเป็นแทรคกิ้ง แต่เราคิดต้นทุนเป็นตู้
              บรรทัดที่ตู้ไม่ตรงจะ<strong>ไม่ถูกบันทึก</strong>จนกว่าจะตรวจให้ตรงกัน (บรรทัดอื่นบันทึกได้ตามปกติ) · ดูเหตุผลรายบรรทัดด้านล่าง
            </div>
          )}

          {/* ยอดทั้งชิปเม้น คีย์ด้วยเลขฐาน — ใช้อธิบายกำไรรายกล่องที่ติดลบ (ดู byShipment ฝั่ง server) */}
          {/* ตารางรายแทรคกิ้ง — owner 2026-07-23: "แยกคอลัมน์ให้เป็นเหมือนตาราง excel แบบเข้าใจง่าย"
              + "ทำให้ แทรคกิ้ง PR เลขตู้ กดเข้าไปดูในระบบเพื่ออ้างอิงได้ทั้งหมด".
              เดิมยัด ลูกค้า+ตู้ ไว้ช่องเดียว และ ขาย+กำไร ไว้ช่องเดียว → อ่านยาก ทานกับ Excel ไม่ได้
              ตอนนี้ 1 ค่า = 1 คอลัมน์ และทั้ง 3 ตัวอ้างอิงกดเข้าระบบได้. */}
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full border-collapse text-xs [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">แทรคกิ้ง (บนใบ)</th>
                  <th className="px-2 py-2 text-left">รหัสลูกค้า</th>
                  <th className="px-2 py-2 text-left">เลขตู้</th>
                  <th className="px-2 py-2 text-right">กล่อง</th>
                  <th className="px-2 py-2 text-right">เรท ฿/คิว</th>
                  <th className="px-2 py-2 text-right">คิว (ระบบเรา)</th>
                  <th className="px-2 py-2 text-right">คิว (ใบ MOMO)</th>
                  <th className="px-2 py-2 text-right">ดิฟคิว</th>
                  <th className="px-2 py-2 text-right">ต้นทุนปัจจุบัน</th>
                  <th className="px-2 py-2 text-right">ต้นทุนใบ MOMO</th>
                  <th className="px-2 py-2 text-right">ดิฟต้นทุน</th>
                  <th className="px-2 py-2 text-right">ราคาขาย</th>
                  <th className="px-2 py-2 text-right">กำไร</th>
                  <th className="px-2 py-2 text-left">ผล / ต้องทำอะไร</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const ship = r.shipmentBase ? shipByBase.get(r.shipmentBase) : undefined;
                  const costDelta =
                    r.currentCost == null ? null : Math.round((r.invoiceCost - r.currentCost) * 100) / 100;
                  return (
                    <tr
                      key={r.tracking}
                      className={`align-top ${
                        !r.matched || r.cabinetConflict || r.duplicateFid
                          ? "bg-red-50/60"
                          : r.willApply
                            ? "bg-amber-50/40"
                            : ""
                      }`}
                    >
                      {/* แทรคกิ้ง → เปิดรายการนำเข้าในระบบ */}
                      <td className="px-2 py-2 font-mono whitespace-nowrap">
                        {r.fid ? (
                          <Link
                            href={`/admin/forwarders/${r.fid}`}
                            className="text-primary-600 underline decoration-dotted underline-offset-2 hover:text-primary-700"
                            title={`เปิดรายการนำเข้า #${r.fid}${r.matchedTracking && r.matchedTracking !== r.tracking ? ` (ระบบเก็บเป็น ${r.matchedTracking})` : ""}`}
                          >
                            {r.tracking}
                          </Link>
                        ) : (
                          r.tracking
                        )}
                        {r.matchedVia === "bare_base" && (
                          <span
                            className="ml-1 rounded bg-violet-100 px-1 text-[11px] font-sans text-violet-700"
                            title={`MOMO บิลกล่องแรกของชุดแยก · ระบบเราเก็บเป็นเลขเปล่า "${r.matchedTracking}" (น้ำหนัก/คิว ตรงกัน จึงจับคู่ให้)`}
                          >
                            = {r.matchedTracking}
                          </span>
                        )}
                        {r.totalMismatch && (
                          <span
                            className="ml-1 text-orange-600"
                            title={`ยอดบนใบ ฿${baht(r.invoiceCost)} ไม่ตรงกับ ${r.cbm} × ${baht(r.unitPrice)} = ฿${baht(Math.round(r.cbm * r.unitPrice * 100) / 100)} — MOMO คิดเลขไม่ตรงสูตรของใบนี้ ตรวจกับ MOMO`}
                          >
                            ⚠
                          </span>
                        )}
                        {r.rateMissing && (
                          <span className="ml-1 text-[11px] text-muted" title="ใบพิมพ์เรทเป็น 0.00 — ตรวจยอดด้วยสูตรไม่ได้ (ยอดที่พิมพ์ยังเป็นบิลจริง)">
                            (ไม่มีเรทบนใบ)
                          </span>
                        )}
                      </td>

                      {/* รหัสลูกค้า → โปรไฟล์ลูกค้า */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.userid ? (
                          <Link
                            href={`/admin/customers/${encodeURIComponent(r.userid)}`}
                            className="font-medium text-primary-600 underline decoration-dotted underline-offset-2 hover:text-primary-700"
                          >
                            {r.userid}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {/* เลขตู้ → หน้ารายละเอียดตู้ */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.fcabinetnumber ? (
                          <Link
                            href={`/admin/report-cnt/${encodeURIComponent(r.fcabinetnumber)}`}
                            className="font-mono text-primary-600 underline decoration-dotted underline-offset-2 hover:text-primary-700"
                          >
                            {r.fcabinetnumber}
                          </Link>
                        ) : r.matched ? (
                          <span className="text-muted">(ยังไม่ผูกตู้)</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {r.cabinetConflict && (
                          <div className="mt-0.5 text-[11px] font-medium text-red-700">ใบว่า {r.invoiceCabinet}</div>
                        )}
                        {r.cabinetUnlinked && (
                          <div className="mt-0.5 text-[11px] text-sky-700">ใบว่า {r.invoiceCabinet}</div>
                        )}
                      </td>

                      <td className="px-2 py-2 text-right tabular-nums">{r.qty}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted">{baht(r.unitPrice)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.matched ? cbm(r.ourCbm) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{cbm(r.invoiceCbm)}</td>
                      <td className="px-2 py-2 text-right">
                        {r.cbmDiff == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <DiffPill value={r.cbmDiff} text={signedCbm(r.cbmDiff)} good="up" />
                        )}
                      </td>

                      <td className="px-2 py-2 text-right tabular-nums">{baht(r.currentCost)}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{baht(r.invoiceCost)}</td>
                      <td className="px-2 py-2 text-right">
                        {costDelta == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <DiffPill value={costDelta} text={signedBaht(costDelta)} good="down" />
                        )}
                      </td>

                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.ourSell == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <>
                            {baht(r.ourSell)}
                            {r.ourSell <= 0 && (
                              <div className="text-[11px] text-amber-700" title="แถวนี้ยังไม่ตั้งราคาขาย">
                                ยังไม่ตั้งราคา
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      {/* กำไรรายกล่อง + คำอธิบายเมื่อติดลบ (owner: "ติดลบคือยังไง ผิดปกติไหม") */}
                      <td className="px-2 py-2 text-right">
                        {r.profitAfter == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <>
                            <span
                              className={`font-medium tabular-nums ${r.profitAfter < 0 ? "text-red-700" : "text-emerald-700"}`}
                            >
                              {baht(r.profitAfter)}
                            </span>
                            {r.profitAfter < 0 && ship && ship.rows > 1 && (
                              <div
                                className={`mt-0.5 text-[11px] ${ship.profit >= 0 ? "text-muted" : "text-red-700 font-medium"}`}
                                title={
                                  ship.profit >= 0
                                    ? `ขายคิดตามน้ำหนัก แต่ทุนคิดตามคิว — กล่องที่เบาแต่ใหญ่จึงติดลบรายกล่อง` +
                                      ` · ทั้งชิปเม้น ${ship.rows} กล่อง ${ship.weightKg} kg / ${ship.cbm} คิว` +
                                      (ship.densityKgPerCbm ? ` (${ship.densityKgPerCbm} kg/คิว)` : "") +
                                      ` → ขาย ฿${baht(ship.sell)} − ทุน ฿${baht(ship.cost)} = กำไร ฿${baht(ship.profit)}`
                                    : `ทั้งชิปเม้นก็ติดลบ — ตรวจเรทขาย/ต้นทุนของงานนี้`
                                }
                              >
                                {ship.profit >= 0 ? (
                                  <>ทั้งชิปเม้น ({ship.rows} กล่อง) กำไร ฿{baht(ship.profit)} ✓</>
                                ) : (
                                  <>🔴 ทั้งชิปเม้นก็ติดลบ ฿{baht(ship.profit)}</>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      <td className="px-2 py-2 text-[11px]">
                        <RowOutcome r={r} />
                        {r.blockReason && <div className="mt-0.5 text-muted">{r.blockReason}</div>}
                        <RowActions
                          r={r}
                          settled={settled}
                          pending={pending}
                          onApply={(fid) => doApply([fid])}
                          onSettle={(fid) => doSettle([fid])}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
