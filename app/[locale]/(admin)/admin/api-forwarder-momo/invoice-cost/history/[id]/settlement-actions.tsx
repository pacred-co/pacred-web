"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { uploadMomoSettlementSlip, voidMomoInvoiceSettlement } from "@/actions/admin/momo-invoice-settlement";

/**
 * Slip upload (retroactive) + void for one MOMO settlement doc. owner 2026-07-22:
 * "ช่องไว้ใส่สลิปย้อนหลังได้ด้วย" + a void that keeps history (append-only).
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function onSlip(file: File) {
    if (!/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name)) {
      setMsg({ kind: "err", text: "รับเฉพาะรูป (jpg/png/webp) หรือ PDF" });
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await uploadMomoSettlementSlip({ settlementId }, file);
      if (!res.ok) { setMsg({ kind: "err", text: res.error }); return; }
      setMsg({ kind: "ok", text: "แนบสลิปแล้ว" });
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
      {/* slip upload (allowed even after void — evidence can arrive late) */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSlip(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? "กำลังอัปโหลด…" : "📎 แนบสลิป (ย้อนหลังได้)"}
        </button>
        <span className="text-[11px] text-muted">รูป หรือ PDF · ไม่เกิน 5 MB</span>
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
