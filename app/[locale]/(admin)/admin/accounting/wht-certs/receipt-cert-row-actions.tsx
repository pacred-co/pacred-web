"use client";

/**
 * ReceiptCertRowActions (ภูม flag 2026-06-10) — admin row actions for the
 * "ใบเสร็จรออนุมัติ 50 ทวิ" queue: view the customer-uploaded file, then approve
 * (unlocks the customer's receipt print) or waive (with reason). Confirm-before-
 * mutate (§0f): approve needs the 50-ทวิ number; waive needs a reason.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getReceiptCertSignedUrl,
  adminApproveReceiptWhtCert,
  adminWaiveReceiptWhtCert,
} from "@/actions/receipt-wht-cert";

export function ReceiptCertRowActions({ receiptId, certNo }: { receiptId: number; certNo: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "waive">("idle");
  const [num, setNum] = useState(certNo ?? "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const viewFile = () => {
    start(async () => {
      const res = await getReceiptCertSignedUrl(receiptId);
      if (res.ok && res.data) window.open(res.data.url, "_blank", "noopener");
      else setErr(res.ok ? "ไม่มีไฟล์" : res.error);
    });
  };

  const doApprove = () => {
    setErr(null);
    start(async () => {
      const res = await adminApproveReceiptWhtCert({ receiptId, certNo: num.trim() });
      if (res.ok) { setMode("idle"); router.refresh(); } else setErr(res.error);
    });
  };

  const doWaive = () => {
    setErr(null);
    start(async () => {
      const res = await adminWaiveReceiptWhtCert({ receiptId, reason: reason.trim() });
      if (res.ok) { setMode("idle"); router.refresh(); } else setErr(res.error);
    });
  };

  if (mode === "approve") {
    return (
      <div className="flex flex-col gap-1 items-end">
        <div className="flex items-center gap-1">
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="เลขที่ 50 ทวิ"
            className="w-28 rounded border border-border px-2 py-1 text-xs" />
          <button onClick={doApprove} disabled={pending} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">ยืนยัน</button>
          <button onClick={() => setMode("idle")} className="rounded border border-border px-2 py-1 text-[11px]">ยกเลิก</button>
        </div>
        {err && <span className="text-[10px] text-red-600">{err}</span>}
      </div>
    );
  }
  if (mode === "waive") {
    return (
      <div className="flex flex-col gap-1 items-end">
        <div className="flex items-center gap-1">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล (≥10 ตัว)"
            className="w-36 rounded border border-border px-2 py-1 text-xs" />
          <button onClick={doWaive} disabled={pending} className="rounded bg-slate-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50">ยกเว้น</button>
          <button onClick={() => setMode("idle")} className="rounded border border-border px-2 py-1 text-[11px]">ยกเลิก</button>
        </div>
        {err && <span className="text-[10px] text-red-600">{err}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 justify-end">
      <button onClick={viewFile} disabled={pending} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50">📎 ดูไฟล์</button>
      <button onClick={() => setMode("approve")} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">✓ อนุมัติ</button>
      <button onClick={() => setMode("waive")} className="rounded border border-border px-2 py-1 text-[11px] text-slate-600 hover:bg-surface-alt">ยกเว้น</button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
