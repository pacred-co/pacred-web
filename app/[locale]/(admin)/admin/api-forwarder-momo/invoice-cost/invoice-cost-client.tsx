"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  previewMomoInvoiceCost,
  applyMomoInvoiceCost,
  type MomoIngestPreview,
} from "@/actions/admin/momo-invoice-ingest";

const baht = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MomoInvoiceCostClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<MomoIngestPreview | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function doPreview() {
    setMsg(null);
    setPreview(null);
    start(async () => {
      const res = await previewMomoInvoiceCost({ text });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      setPreview(res.data);
      if (res.data.rows.length === 0) setMsg({ kind: "err", text: "อ่านไม่พบรายการในใบแจ้งหนี้ — ตรวจรูปแบบข้อความที่วาง" });
    });
  }

  function doApply() {
    if (!preview) return;
    const n = preview.summary.willApply;
    if (n === 0) { setMsg({ kind: "err", text: "ไม่มีรายการที่ต้องอัปเดต" }); return; }
    if (!window.confirm(`บันทึกต้นทุนจากใบแจ้งหนี้ MOMO ${preview.invoiceNo ?? ""} จำนวน ${n} แทรคกิ้ง?\n(ตู้ที่จ่ายเงินแล้วจะถูกข้าม)`)) return;
    setMsg(null);
    start(async () => {
      const res = await applyMomoInvoiceCost({ text });
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      setMsg({ kind: "ok", text: `บันทึกต้นทุนแล้ว ${res.data.applied} แทรคกิ้ง (ใบ ${res.data.invoiceNo ?? "-"})` });
      // refresh the preview to reflect the new currentCost
      const re = await previewMomoInvoiceCost({ text });
      if (re.ok && re.data) setPreview(re.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block text-sm font-medium">วางข้อความจากใบแจ้งหนี้ MOMO (ฮุย ไท่ต๋า)</label>
        <p className="text-xs text-muted">
          เปิดไฟล์ PDF ใบแจ้งหนี้ → เลือกข้อความทั้งหมด (Ctrl/Cmd+A) → คัดลอก → วางที่นี่ ระบบจะอ่านต้นทุนต่อแทรคกิ้ง
          (ราคา &quot;รวม (Total)&quot; = ต้นทุนจริงที่ MOMO เรียกเก็บ Pacred) แล้วจับคู่กับรายการนำเข้าในระบบ
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="วางข้อความใบแจ้งหนี้ที่นี่…"
          className="w-full rounded-lg border border-border bg-surface-alt/40 p-3 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={doPreview}
            disabled={pending || text.trim().length < 10}
            className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? "กำลังอ่าน…" : "ดูตัวอย่าง (Preview)"}
          </button>
          {preview && preview.reconciles && preview.summary.willApply > 0 && (
            <button
              type="button"
              onClick={doApply}
              disabled={pending}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              ยืนยันบันทึกต้นทุน ({preview.summary.willApply} แทรคกิ้ง)
            </button>
          )}
        </div>
        {preview && !preview.reconciles && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">🔴 ยอดไม่ตรง — บันทึกต้นทุนไม่ได้</p>
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
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}
      </section>

      {preview && preview.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold">ใบ {preview.invoiceNo ?? "-"}</span>
            <span className="text-muted">ยอดรวมใบ: ฿{baht(preview.grandTotal)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${preview.reconciles ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {preview.reconciles ? `Σ ตรง Sub-total ฿${baht(preview.subTotal)} ✓` : "Σ ไม่ตรง Sub-total ✗"}
            </span>
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs">จับคู่ได้ {preview.summary.matched}</span>
            <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs">จะอัปเดต {preview.summary.willApply}</span>
            {preview.summary.unmatched > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs">ไม่พบในระบบ {preview.summary.unmatched}</span>}
            {preview.summary.cabinetConflicts > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs">ตู้ไม่ตรง {preview.summary.cabinetConflicts}</span>}
            {preview.summary.paidSkipped > 0 && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs">ข้าม (จ่ายแล้ว) {preview.summary.paidSkipped}</span>}
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">แทรคกิ้ง</th>
                  <th className="px-2 py-2 text-left">รหัส / ตู้</th>
                  <th className="px-2 py-2 text-right">คิว × เรท · กล่อง</th>
                  <th className="px-2 py-2 text-right">ต้นทุนปัจจุบัน</th>
                  <th className="px-2 py-2 text-right">ต้นทุนใบแจ้งหนี้</th>
                  <th className="px-2 py-2 text-center">ผล</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.tracking} className="border-t border-border">
                    <td className="px-2 py-2 font-mono">{r.tracking}{r.totalMismatch && <span className="ml-1 text-orange-600" title="ยอดบนใบไม่ตรงทั้ง เรท×คิว และ เรท×คิว×กล่อง — ตรวจสอบใบ">⚠</span>}</td>
                    <td className="px-2 py-2 text-[11px]">
                      {r.matched ? (
                        <>
                          <span>{r.userid ?? "-"} / {r.fcabinetnumber ?? "-"}</span>
                          {r.cabinetConflict && (
                            <span className="ml-1 text-red-600 font-medium" title={`MOMO ระบุตู้ ${r.invoiceCabinet} · ระบบเรา ${r.fcabinetnumber}`}>
                              ⚠ ใบว่า {r.invoiceCabinet}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-red-600">ไม่พบในระบบ{r.invoiceCabinet ? ` (ใบว่าตู้ ${r.invoiceCabinet})` : ""}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-muted">{r.cbm} × {baht(r.unitPrice)} · {r.qty} กล่อง</td>
                    <td className="px-2 py-2 text-right">{baht(r.currentCost)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{baht(r.invoiceCost)}</td>
                    <td className="px-2 py-2 text-center">
                      {!r.matched ? <span className="text-red-600">—</span>
                        : r.cabinetPaid ? <span className="text-orange-600">ข้าม (จ่ายแล้ว)</span>
                        : r.willApply ? <span className="text-amber-700 font-medium">จะอัปเดต</span>
                        : <span className="text-green-600">ตรงแล้ว</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
