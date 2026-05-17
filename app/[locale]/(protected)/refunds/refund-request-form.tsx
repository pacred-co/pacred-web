"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { customerCreateRefundRequest } from "@/actions/refunds";
import {
  CUSTOMER_REFUND_SOURCES,
  REFUND_SOURCE_LABEL,
  type CustomerRefundSource,
} from "@/lib/validators/refund";

export type SourceOption = {
  source: CustomerRefundSource;
  value:  string;       // f_no | h_no | yuan_payments.id
  label:  string;       // human-readable for the picker
};

type Props = { sourceOptions: SourceOption[] };

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function RefundRequestForm({ sourceOptions }: Props) {
  const router = useRouter();
  const [source, setSource] = useState<CustomerRefundSource>(
    (sourceOptions[0]?.source ?? "forwarder") as CustomerRefundSource,
  );
  const [sourceRef, setSourceRef] = useState<string>(sourceOptions[0]?.value ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const filteredOptions = useMemo(
    () => sourceOptions.filter((o) => o.source === source),
    [sourceOptions, source],
  );

  function onSourceChange(s: CustomerRefundSource) {
    setSource(s);
    const first = sourceOptions.find((o) => o.source === s);
    setSourceRef(first?.value ?? "");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("ยอดต้องมากกว่า 0");
      return;
    }
    if (!sourceRef) {
      setError("กรุณาเลือกรายการอ้างอิง");
      return;
    }
    if (reason.trim().length < 10) {
      setError("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const res = await customerCreateRefundRequest({
        source,
        source_ref: sourceRef,
        amount_thb: amt,
        reason:     reason.trim(),
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center space-y-3">
        <h3 className="text-lg font-bold text-green-800">ส่งคำขอคืนเงินสำเร็จ</h3>
        <p className="text-sm text-green-700">
          ทีม Pacred จะตรวจสอบและแจ้งผลภายใน 1-3 วันทำการ
          เช็คสถานะคำขอด้านล่าง
        </p>
        <button
          type="button"
          onClick={() => { setDone(false); setAmount(""); setReason(""); setError(null); }}
          className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          ขอคืนเงินอีกรายการ
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Source picker */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ประเภทออเดอร์<span className="text-red-600 ml-0.5">*</span></span>
          <select
            value={source}
            onChange={(e) => onSourceChange(e.target.value as CustomerRefundSource)}
            className={inputCls}
            required
          >
            {CUSTOMER_REFUND_SOURCES.map((s) => (
              <option key={s} value={s}>{REFUND_SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium">รายการอ้างอิง<span className="text-red-600 ml-0.5">*</span></span>
          <select
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            className={inputCls}
            required
            disabled={filteredOptions.length === 0}
          >
            {filteredOptions.length === 0 ? (
              <option value="">— ไม่มีรายการประเภทนี้ —</option>
            ) : (
              filteredOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))
            )}
          </select>
        </label>
      </div>

      {/* Amount */}
      <label className="block space-y-1">
        <span className="text-xs font-medium">ยอดที่ขอคืน (บาท)<span className="text-red-600 ml-0.5">*</span></span>
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

      {/* Reason */}
      <label className="block space-y-1">
        <span className="text-xs font-medium">เหตุผล (อย่างน้อย 10 ตัวอักษร)<span className="text-red-600 ml-0.5">*</span></span>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputCls}
          required
          minLength={10}
          maxLength={2000}
          placeholder="เช่น สินค้าไม่ตรงตามที่สั่ง / Pacred ยกเลิกการนำเข้า / เก็บค่าบริการเกิน ฯลฯ"
        />
        <span className="block text-xs text-muted">
          {reason.trim().length} / 10 ตัวอักษรขั้นต่ำ
        </span>
      </label>

      <button
        type="submit"
        disabled={pending || filteredOptions.length === 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold text-sm px-6 py-3 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
      >
        {pending ? "กำลังส่งคำขอ..." : "ส่งคำขอคืนเงิน"}
      </button>
    </form>
  );
}
