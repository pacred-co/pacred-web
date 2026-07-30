"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  listMomoInvoiceUploads,
  getMomoInvoiceUpload,
  signMomoInvoiceUpload,
  type MomoInvoiceUploadRow,
  type MomoInvoiceUploadDetail,
} from "@/actions/admin/momo-invoice-history";
import { formatThaiDateTime, isoToDdmmyyyy } from "@/lib/utils/thai-datetime";
import {
  groupUploadsByInvoiceNo,
  describeUploadRevisionDiff,
} from "@/lib/admin/momo-invoice-upload-dedupe";

const baht = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cbm = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/**
 * ประวัติ "ใบวางบิล MOMO" ที่อัพ (owner 2026-07-29: *"ใบวางบิล momo ที่อัพเข้าไป ทำประวัติ
 * เก็บไว้ บันทึกให้เองเลย เหมือนฝั่งอัพ แพคกิ้งลิสตู้"*).
 *
 * อ่านจาก `momo_invoice_upload` (mig 0283) — ทุกใบที่เคยอัพ + ยอดของใบ + ใครอัพ +
 * บันทึกต้นทุนไปแล้วยัง + ดาวน์โหลดไฟล์ต้นฉบับ + กด "ดูอีกครั้ง" เพื่อเปิดผลตรวจ
 * ที่แช่ไว้ (จาก parsed_snapshot · ไม่แกะ PDF ใหม่).
 *
 * 🔒 READ-ONLY ทั้งแผง — ไม่มีปุ่มบันทึกต้นทุน/ตัดจ่ายที่นี่ (ของจริงอยู่ด้านบน กับใบที่
 *    กำลังเปิดอยู่). สแนปช็อตคือ "ผลตรวจ ณ เวลาที่อัพ" ไม่ใช่สถานะปัจจุบัน — ป้ายบอกไว้ชัด
 *    เพื่อไม่ให้ใครเอาเลขเก่าไปตัดสินใจแทนของสด.
 *
 * 📌 owner 2026-07-30: *"ถ้าเป็นเลขที่ใบซ้ำใบเดิม ก็โชว์แค่อันเดียวพอครับ … แต่ถ้าไม่เหมือนกัน
 *    หรือมีอัพเดทข้อมูลเปลี่ยนไป ต้อง[เก็บ]"* → **1 ใบ = 1 แถว** (เวอร์ชันล่าสุด) และกางดู
 *    เวอร์ชันเก่าได้พร้อมบรรทัดบอกว่า "อะไรเปลี่ยนไป". การอัพไฟล์เดิมซ้ำไม่สร้างแถวใหม่
 *    ตั้งแต่ฝั่ง server แล้ว (ดู momo-invoice-upload-dedupe.ts) — ที่นี่จัดกลุ่มของที่มีอยู่จริง
 *    ไม่ได้ "ซ่อน" อะไร.
 */
export function InvoiceHistoryPanel({ nonce }: { nonce: number }) {
  const [rows, setRows] = useState<MomoInvoiceUploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MomoInvoiceUploadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  /** เลขที่ใบที่กางดู "เวอร์ชันเก่า" อยู่ (คีย์กลุ่มจาก groupUploadsByInvoiceNo). */
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // setState อยู่ใน promise callback (คำตอบจากระบบภายนอก) — แพทเทินที่
  // react-hooks/set-state-in-effect ยอม (ห้าม set แบบ synchronous ใน effect body)
  const applyResult = useCallback((res: Awaited<ReturnType<typeof listMomoInvoiceUploads>>) => {
    if (!res.ok || !res.data) {
      setErr(res.ok ? "โหลดไม่สำเร็จ" : res.error);
      return;
    }
    setErr(null);
    setRows(res.data);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    listMomoInvoiceUploads().then(applyResult).finally(() => setLoading(false));
  }, [applyResult]);

  useEffect(() => {
    let alive = true;
    listMomoInvoiceUploads().then((res) => { if (alive) applyResult(res); });
    return () => { alive = false; };
  }, [applyResult, nonce]);

  async function openDetail(id: number) {
    if (expandedId === id) { setExpandedId(null); setDetail(null); setDownloadUrl(null); setDownloadErr(null); return; }
    setExpandedId(id);
    setDetail(null);
    setDownloadUrl(null);
    setDownloadErr(null);
    setDetailLoading(true);
    // ขอลิงก์ดาวน์โหลด "สดตอนเปิด" (signed 1 ชม.) พร้อมสแนปช็อต
    const [d, s] = await Promise.all([getMomoInvoiceUpload({ id }), signMomoInvoiceUpload({ id })]);
    setDetailLoading(false);
    if (d.ok && d.data) setDetail(d.data);
    else setDownloadErr(d.ok ? "โหลดไม่สำเร็จ" : d.error);
    if (s.ok && s.data) setDownloadUrl(s.data.url);
    else if (!s.ok) setDownloadErr(s.error);
  }

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 1 ใบ = 1 แถว (เวอร์ชันล่าสุด) · กางแล้วจึงเห็นเวอร์ชันเก่า — owner: "โชว์แค่อันเดียวพอ".
  // `revision` นับจากเก่า→ใหม่ (1 = ครั้งแรก) · `diff` = อะไรเปลี่ยนจากเวอร์ชันก่อนหน้า
  const visible = groupUploadsByInvoiceNo(rows).flatMap((g) => {
    const open = openGroups.has(g.key);
    const head = {
      row: g.latest,
      revision: g.revisions,
      revisions: g.revisions,
      groupKey: g.key,
      isLatest: true,
      open,
      diff: g.older.length > 0 ? describeUploadRevisionDiff(g.older[0], g.latest) : null,
    };
    if (!open) return [head];
    return [
      head,
      ...g.older.map((o, i) => ({
        row: o,
        revision: g.revisions - 1 - i,
        revisions: g.revisions,
        groupKey: g.key,
        isLatest: false,
        open,
        // เทียบกับเวอร์ชันที่เก่ากว่าถัดไป · ตัวที่เก่าสุดไม่มีอะไรให้เทียบ
        diff: g.older[i + 1] ? describeUploadRevisionDiff(g.older[i + 1], o) : null,
      })),
    ];
  });

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">📜 ประวัติใบวางบิล MOMO ที่อัพ</h2>
          <p className="text-[11px] text-muted">
            เก็บทุกใบที่อัพเข้ามา (ไฟล์ต้นฉบับ + ผลตรวจตอนนั้น) · บอกว่าใบไหน
            <strong>บันทึกต้นทุนไปแล้ว</strong> · กด “ดูอีกครั้ง” เปิดผลตรวจย้อนหลังได้ทันที ไม่ต้องอัพซ้ำ
            <br />
            <strong>1 ใบ = 1 แถว</strong> — อัพไฟล์เดิมซ้ำจะไม่เก็บซ้ำ (ดูได้ แต่ไม่เปลืองที่) ·
            ถ้าไฟล์เปลี่ยน/ข้อมูลอัพเดท จะเก็บเป็นเวอร์ชันใหม่ กดป้าย “แก้ไข N ครั้ง” เพื่อดูของเก่า
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50"
        >
          {loading ? "กำลังโหลด…" : "โหลดใหม่"}
        </button>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {!loading && rows.length === 0 && !err && (
        <p className="rounded-lg bg-surface-alt/40 px-3 py-4 text-center text-xs text-muted">
          ยังไม่มีประวัติ — อัพไฟล์ใบวางบิล MOMO ด้านบนแล้วจะขึ้นที่นี่เอง
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full border-collapse text-xs [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
            <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-2 text-left">วันที่อัพ</th>
                <th className="px-2 py-2 text-left">เลขที่ใบ</th>
                <th className="px-2 py-2 text-left">ไฟล์</th>
                <th className="px-2 py-2 text-left">ผู้อัพ</th>
                <th className="px-2 py-2 text-center">สถานะ</th>
                <th className="px-2 py-2 text-right">บรรทัด</th>
                <th className="px-2 py-2 text-right">ยอดของใบ</th>
                <th className="px-2 py-2 text-center">ผลตรวจตอนอัพ</th>
                <th className="px-2 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => {
                const r = v.row;
                const applied = r.status === "applied" || !!r.appliedAt;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`border-t border-border align-top ${
                        // เวอร์ชันเก่า = ของประกอบ ไม่ใช่ของที่ต้องอ่านก่อน → หรี่ลงให้หัวกลุ่มเด่น
                        v.isLatest ? "" : "bg-surface-alt/30 text-muted"
                      }`}
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px]">
                        {!v.isLatest && <span className="mr-1 text-muted">↳</span>}
                        {formatThaiDateTime(r.uploadedAt)}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`font-mono font-semibold ${v.isLatest ? "text-sky-800" : "text-muted"}`}>
                          {r.invoiceNo ?? "—"}
                        </span>
                        {/* ใบเดียวถูกอัพหลายเวอร์ชัน (MOMO ออกใหม่/ข้อมูลเปลี่ยน) — owner สั่งให้เก็บ */}
                        {v.revisions > 1 && (
                          v.isLatest ? (
                            <button
                              type="button"
                              onClick={() => toggleGroup(v.groupKey)}
                              className="ml-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 hover:bg-violet-200"
                              title={
                                v.diff
                                  ? `ใบนี้ถูกอัพ ${v.revisions} ครั้ง และข้อมูลเปลี่ยนไป — กดเพื่อดูเวอร์ชันเก่า`
                                  : `ใบนี้ถูกอัพ ${v.revisions} ครั้ง (ยอด/จำนวนบรรทัดเท่าเดิม · ส่วนใหญ่เป็นแถวที่อัพก่อนมีระบบกันซ้ำ) — กดเพื่อดูทั้งหมด`
                              }
                            >
                              {/* ⚠️ อย่ามั่ว (§0f): พูดว่า "แก้ไข" ได้ก็ต่อเมื่อเห็นว่ายอดเปลี่ยนจริง ·
                                  แถวเก่าที่ไม่มีแฮช (ก่อน mig 0284) เราพิสูจน์ไม่ได้ว่าไฟล์ต่างกัน */}
                              {v.open ? "▾" : "▸"} {v.diff ? `แก้ไข ${v.revisions - 1} ครั้ง` : `อัพ ${v.revisions} ครั้ง`}
                            </button>
                          ) : (
                            <span className="ml-1.5 rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700">
                              เวอร์ชันที่ {v.revision}
                            </span>
                          )
                        )}
                        {r.invoiceDate && (
                          <div className="text-[11px] text-muted">ลงวันที่ {isoToDdmmyyyy(r.invoiceDate)}</div>
                        )}
                        {r.supplier && <div className="text-[11px] text-muted">{r.supplier}</div>}
                        {/* อะไรเปลี่ยนจากเวอร์ชันก่อนหน้า — ไม่ต้องเปิด 2 ใบมาเทียบเอง */}
                        {v.diff && (
                          <div className="mt-0.5 text-[11px] font-medium text-violet-700" title="เทียบกับเวอร์ชันก่อนหน้าของใบเดียวกัน">
                            เปลี่ยน: {v.diff}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 max-w-[14rem] truncate text-[11px]" title={r.fileName ?? ""}>
                        {r.filePath ? "📎 " : ""}
                        {r.fileName ?? (r.source === "paste" ? "(วางข้อความ · ไม่มีไฟล์)" : "—")}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[11px]" title={r.uploadedBy ?? ""}>
                        {r.uploadedByName ?? (r.uploadedBy ? "(ไม่พบชื่อ)" : "—")}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {applied ? (
                          <span
                            className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                            title={r.appliedAt ? `บันทึกต้นทุนแล้ว ${formatThaiDateTime(r.appliedAt)}` : "บันทึกต้นทุนแล้ว"}
                          >
                            ✓ บันทึกต้นทุนแล้ว
                          </span>
                        ) : (
                          <span
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700"
                            title="อัพไว้แล้ว แต่ยังไม่ได้กดบันทึกต้นทุนจากใบนี้"
                          >
                            อัพไว้ · ยังไม่บันทึก
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.lineCount}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-right">
                        <span className="font-semibold tabular-nums">฿{baht(r.linesTotal)}</span>
                        <div className="text-[11px]">
                          {r.reconciles === true ? (
                            <span className="text-emerald-700">Σ ตรง Sub-total ✓</span>
                          ) : r.reconciles === false ? (
                            <span className="font-medium text-red-700">Σ ไม่ตรง Sub-total ✗</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center text-[11px]">
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">จับคู่ {r.matchedCount}</span>
                        {r.unmatchedCount > 0 && (
                          <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-red-700">ไม่พบ {r.unmatchedCount}</span>
                        )}
                        {r.conflictCount > 0 && (
                          <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-red-700">ตู้ไม่ตรง {r.conflictCount}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => void openDetail(r.id)}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-surface-alt"
                        >
                          {expandedId === r.id ? "ปิด" : "ดูอีกครั้ง"}
                        </button>
                      </td>
                    </tr>

                    {expandedId === r.id && (
                      <tr className="bg-surface-alt/20">
                        <td colSpan={9} className="px-3 py-3">
                          {detailLoading && <p className="text-xs text-muted">กำลังโหลด…</p>}
                          {downloadErr && !detail && (
                            <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{downloadErr}</p>
                          )}
                          {detail && detail.row.id === r.id && (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                {downloadUrl ? (
                                  <a
                                    href={downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full bg-sky-100 px-2.5 py-0.5 font-medium text-sky-800 hover:bg-sky-200"
                                  >
                                    ⬇ ดาวน์โหลดไฟล์ต้นฉบับ (PDF)
                                  </a>
                                ) : (
                                  <span className="text-muted">{downloadErr ?? "ไม่มีไฟล์ต้นฉบับ"}</span>
                                )}
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                                  ผลตรวจ ณ เวลาที่อัพ ({formatThaiDateTime(detail.row.uploadedAt)}) — ไม่ใช่สถานะปัจจุบัน
                                </span>
                              </div>

                              {/* ยอดสรุปที่แช่ไว้ — เทียบกับตอนนั้นได้ทันที ไม่ต้องอัพซ้ำ */}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-white/60 px-3 py-2 text-[12px] dark:bg-surface">
                                <span>
                                  <span className="text-muted">Sub-total บนใบ: </span>
                                  <strong className="tabular-nums">฿{baht(detail.snapshot.subTotal)}</strong>
                                </span>
                                <span>
                                  <span className="text-muted">Σ บรรทัด: </span>
                                  <strong className="tabular-nums">฿{baht(detail.snapshot.linesTotal)}</strong>
                                </span>
                                <span>
                                  <span className="text-muted">ต้นทุนที่ MOMO เก็บ (จับคู่ได้): </span>
                                  <strong className="tabular-nums">฿{baht(detail.snapshot.reconcile.invoiceCost)}</strong>
                                </span>
                                <span>
                                  <span className="text-muted">ขาย: </span>
                                  <strong className="tabular-nums">฿{baht(detail.snapshot.reconcile.sell)}</strong>
                                </span>
                                <span>
                                  <span className="text-muted">กำไรหลังบันทึก: </span>
                                  <strong
                                    className={`tabular-nums ${detail.snapshot.reconcile.profitAfter < 0 ? "text-red-700" : "text-emerald-700"}`}
                                  >
                                    ฿{baht(detail.snapshot.reconcile.profitAfter)}
                                  </strong>
                                </span>
                                {detail.snapshot.whtThb != null && (
                                  <span className="text-muted">
                                    หัก ณ ที่จ่าย 1%:{" "}
                                    <strong className="tabular-nums text-foreground">฿{baht(detail.snapshot.whtThb)}</strong>
                                  </span>
                                )}
                                {/* 🔴 owner 2026-07-30: "ขอแค่เงินที่เราเก็บมามันไม่ติดลบ" —
                                    ณ เวลาที่อัพ (ไม่ใช่สถานะสด · ราคาขายอาจถูกแก้ไปแล้ว) */}
                                {detail.snapshot.reconcile.lossLines > 0 && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
                                    ⚠️ ขายต่ำกว่าทุน {detail.snapshot.reconcile.lossLines} แทรคกิ้ง · ขาด ฿
                                    {baht(detail.snapshot.reconcile.lossAmount)}
                                  </span>
                                )}
                              </div>

                              {detail.snapshot.rows.length === 0 ? (
                                <p className="text-[11px] text-muted">
                                  ใบนี้ไม่มีผลตรวจที่แช่ไว้ (อัพก่อนมีระบบประวัติ) — อัพไฟล์ใหม่ด้านบนถ้าต้องการตรวจซ้ำ
                                </p>
                              ) : (
                                <div className="max-h-80 overflow-y-auto overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
                                  <table className="w-full border-collapse text-[11px] [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
                                    <thead className="sticky top-0 bg-surface-alt text-muted">
                                      <tr>
                                        <th className="px-2 py-1 text-left">แทรคกิ้ง (บนใบ)</th>
                                        <th className="px-2 py-1 text-left">ลูกค้า</th>
                                        <th className="px-2 py-1 text-left">เลขตู้</th>
                                        <th className="px-2 py-1 text-right">คิว เรา / ใบ</th>
                                        <th className="px-2 py-1 text-right">ต้นทุน ตอนนั้น / ใบ</th>
                                        <th className="px-2 py-1 text-right">ขาย</th>
                                        <th className="px-2 py-1 text-left">ผลตอนนั้น</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.snapshot.rows.map((row, i) => (
                                        <tr
                                          key={`${row.tracking}-${i}`}
                                          className={`border-t border-border align-top ${
                                            !row.matched || row.cabinetConflict || row.duplicateFid ? "bg-red-50/50" : ""
                                          }`}
                                        >
                                          <td className="px-2 py-1 font-mono">
                                            {row.fid ? (
                                              <Link
                                                href={`/admin/forwarders/${row.fid}`}
                                                className="text-primary-600 underline decoration-dotted underline-offset-2 hover:text-primary-700"
                                              >
                                                {row.tracking}
                                              </Link>
                                            ) : (
                                              row.tracking
                                            )}
                                          </td>
                                          <td className="px-2 py-1">
                                            {row.userid ? (
                                              <Link
                                                href={`/admin/customers/${encodeURIComponent(row.userid)}`}
                                                className="text-primary-600 underline decoration-dotted underline-offset-2 hover:text-primary-700"
                                              >
                                                {row.userid}
                                              </Link>
                                            ) : (
                                              <span className="text-muted">—</span>
                                            )}
                                          </td>
                                          <td className="px-2 py-1 font-mono">
                                            {row.fcabinetnumber ?? <span className="text-muted">—</span>}
                                            {row.cabinetConflict && (
                                              <div className="font-sans font-medium text-red-700">ใบว่า {row.invoiceCabinet}</div>
                                            )}
                                          </td>
                                          <td className="px-2 py-1 whitespace-nowrap text-right tabular-nums">
                                            {cbm(row.ourCbm)} <span className="text-muted">/ {cbm(row.invoiceCbm)}</span>
                                          </td>
                                          <td className="px-2 py-1 whitespace-nowrap text-right tabular-nums">
                                            {baht(row.currentCost)} <span className="text-muted">/</span>{" "}
                                            <strong>{baht(row.invoiceCost)}</strong>
                                          </td>
                                          <td className="px-2 py-1 text-right tabular-nums">
                                            {/* สแนปช็อตเก่า (ก่อน 2026-07-30) ไม่มีธงนี้ → undefined = ไม่โชว์ ไม่ใช่ "ไม่ติดลบ" */}
                                            <span className={row.lossVsInvoice ? "font-semibold text-red-700" : undefined}>
                                              {baht(row.ourSell)}
                                            </span>
                                            {row.lossVsInvoice && (
                                              <div className="text-[11px] font-medium text-red-700">
                                                🔴 ต่ำกว่าทุน ฿{baht(row.lossShortfall)}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-2 py-1">
                                            {!row.matched ? (
                                              <span className="font-medium text-red-700">🔴 ไม่พบในระบบ</span>
                                            ) : row.duplicateFid ? (
                                              <span className="font-medium text-red-700">🔴 ชี้ซ้ำรายการเดียวกัน</span>
                                            ) : row.cabinetConflict ? (
                                              <span className="font-medium text-red-700">🔴 ตู้ไม่ตรง</span>
                                            ) : row.cabinetPaid ? (
                                              <span className="text-orange-700">⏸ ข้าม (จ่ายค่าตู้แล้ว)</span>
                                            ) : row.willApply ? (
                                              <span className="text-amber-700">จะบันทึกต้นทุน</span>
                                            ) : (
                                              <span className="text-green-700">✓ ตรงแล้ว</span>
                                            )}
                                            {row.containerTruth && (
                                              <div className="mt-0.5 text-muted">📦 {row.containerTruth}</div>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
