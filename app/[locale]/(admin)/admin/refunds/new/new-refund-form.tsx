"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateRefund } from "@/actions/admin/refunds";
import {
  REFUND_SOURCES,
  REFUND_SOURCE_LABEL,
  type RefundSource,
} from "@/lib/validators/refund";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function NewRefundForm() {
  const router = useRouter();
  const [profileId, setProfileId] = useState("");
  const [source, setSource]       = useState<RefundSource>("manual");
  const [sourceRef, setSourceRef] = useState("");
  const [amount, setAmount]       = useState("");
  const [reason, setReason]       = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amt = Number(amount);
    if (!profileId.trim()) {
      setError("กรุณาระบุ profile_id ของลูกค้า");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("ยอดต้องมากกว่า 0");
      return;
    }
    if (reason.trim().length < 5) {
      setError("กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร");
      return;
    }
    if (source !== "manual" && sourceRef.trim().length < 1) {
      setError("กรุณาระบุ source_ref สำหรับ source ที่ไม่ใช่ manual");
      return;
    }
    startTransition(async () => {
      const res = await adminCreateRefund({
        profile_id: profileId.trim(),
        source,
        source_ref: source === "manual" ? undefined : sourceRef.trim(),
        amount_thb: amt,
        reason:     reason.trim(),
      });
      if (res.ok && res.data) {
        router.push(`/admin/refunds/${res.data.id}`);
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium">profile_id ของลูกค้า (uuid)<span className="text-red-600 ml-0.5">*</span></span>
        <input
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className={`${inputCls} font-mono`}
          required
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
        />
        <span className="block text-[10px] text-muted">
          คัดลอกจาก /admin/customers (หน้า detail ของลูกค้า)
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ประเภท source<span className="text-red-600 ml-0.5">*</span></span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as RefundSource)}
            className={inputCls}
            required
          >
            {REFUND_SOURCES.map((s) => (
              <option key={s} value={s}>{REFUND_SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium">
            source_ref {source !== "manual" && <span className="text-red-600">*</span>}
          </span>
          <input
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            className={`${inputCls} font-mono`}
            required={source !== "manual"}
            disabled={source === "manual"}
            placeholder={
              source === "forwarder"     ? "f_no — เช่น F-251205-0001"
            : source === "service_order" ? "h_no — เช่น H-251205-0001"
            : source === "yuan_payment"  ? "yuan_payment uuid"
            :                              "(ไม่ต้องระบุสำหรับ manual)"
            }
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">ยอดที่จะคืน (บาท)<span className="text-red-600 ml-0.5">*</span></span>
        <div className="relative">
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} font-mono pr-10`}
            required
            placeholder="0.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">฿</span>
        </div>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">เหตุผล (≥5 ตัวอักษร — admin-side, ต่ำกว่าฝั่งลูกค้า)<span className="text-red-600 ml-0.5">*</span></span>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputCls}
          required
          minLength={5}
          maxLength={2000}
          placeholder="เช่น carrier-change over-collection (Pacred เก็บค่าขนส่งเกิน ฿X) / ยกเลิกออเดอร์หลังลูกค้าชำระเงิน ฯลฯ"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 text-white font-bold text-sm px-6 py-3 shadow-md hover:bg-primary-700 transition-all disabled:opacity-50"
      >
        {pending ? "กำลังสร้างคำขอ..." : "สร้างคำขอ (pending)"}
      </button>
    </form>
  );
}
