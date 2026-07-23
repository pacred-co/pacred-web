"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { uploadMomoSettlementDoc, voidMomoInvoiceSettlement } from "@/actions/admin/momo-invoice-settlement";

/**
 * แนบหลักฐานย้อนหลัง (ใบเสร็จ MOMO + สลิปการโอน) + ยกเลิกเอกสารตัดจ่าย.
 *
 * owner 2026-07-22 "ช่องไว้ใส่สลิปย้อนหลังได้ด้วย" → 2026-07-23 "เอาไว้ใส่ แนบใบเสร็จ และ
 * สลิป ได้ทีหลังได้ด้วยครับ" — หลักฐาน 2 ชนิดคนละความหมาย จึงแยกปุ่ม/แยกที่เก็บ:
 *   · ใบเสร็จ MOMO (REC-…) = เอกสารภาษีที่ MOMO ออกกลับมาหลังเราจ่าย
 *   · สลิปการโอน           = หลักฐานฝั่งเราว่าโอนแล้ว
 * ไฟล์ PDF จะถูกตั้งชื่อตามเลขในเอกสารเอง (REC-…/INV-…) จะได้ไม่ชนกันแบบ "…(15).pdf".
 */
export function MomoSettlementActions({
  settlementId,
  docNo,
  isVoid,
}: {
  settlementId: number;
  docNo: string;
  isVoid: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const receiptRef = useRef<HTMLInputElement>(null);
  const slipRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function onFile(kind: "receipt" | "slip", file: File) {
    if (!/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name)) {
      setMsg({ kind: "err", text: "รับเฉพาะรูป (jpg/png/webp) หรือ PDF" });
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await uploadMomoSettlementDoc({ settlementId, kind }, file);
      if (!res.ok) { setMsg({ kind: "err", text: res.error }); return; }
      const label = kind === "receipt" ? "ใบเสร็จ" : "สลิป";
      setMsg({
        kind: "ok",
        text: res.data?.detectedNo
          ? `แนบ${label}แล้ว · ตั้งชื่อไฟล์ตามเลขในเอกสาร: ${res.data.detectedNo}`
          : `แนบ${label}แล้ว`,
      });
      router.refresh();
    });
  }

  function onVoid() {
    if (reason.trim().length === 0) { setMsg({ kind: "err", text: "กรุณาระบุเหตุผลการยกเลิก" }); return; }
    // §0f — ยืนยันก่อนยกเลิกเอกสารเงิน
    if (!window.confirm(`ยกเลิกเอกสารตัดจ่าย ${docNo}?\nประวัติจะยังอยู่ (ไม่ลบ) และรายการจะกลับมาตัดจ่ายใหม่ได้\n\nยืนยันยกเลิก?`)) return;
    setMsg(null);
    start(async () => {
      const res = await voidMomoInvoiceSettlement({ id: settlementId, reason: reason.trim() });
      if (!res.ok) { setMsg({ kind: "err", text: res.error }); return; }
      setMsg({ kind: "ok", text: "ยกเลิกเอกสารแล้ว" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* แนบหลักฐาน — ได้ทั้งก่อน/หลังยกเลิก (หลักฐานมาช้าได้) */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={receiptRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile("receipt", f); e.target.value = ""; }}
        />
        <input
          ref={slipRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile("slip", f); e.target.value = ""; }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => receiptRef.current?.click()}
          className="inline-flex items-center rounded-full border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          🧾 แนบใบเสร็จ MOMO
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => slipRef.current?.click()}
          className="inline-flex items-center rounded-full border border-sky-500 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
        >
          📎 แนบสลิปการโอน
        </button>
        <span className="text-[11px] text-muted">
          {pending ? "กำลังอัปโหลด…" : "รูป หรือ PDF · ไม่เกิน 5 MB · แนบย้อนหลังได้"}
        </span>
      </div>

      {/* void */}
      {!isVoid && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลการยกเลิก (ต้องระบุ)"
            className="min-w-[220px] flex-1 rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={onVoid}
            className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            ยกเลิกเอกสารตัดจ่าย
          </button>
        </div>
      )}

      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
