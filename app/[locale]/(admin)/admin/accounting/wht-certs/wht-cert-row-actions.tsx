"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminMarkCertReceived, adminWaiveCert } from "@/actions/admin/wht-cert";

/**
 * Client island for per-row 50-ทวิ certificate actions:
 *   - Mark received (with cert_number prompt)
 *   - Waive (with reason ≥10 chars)
 *
 * Both server actions race-guard on cert_status='pending' so double-click
 * doesn't cause inconsistent state.
 */

export function WhtCertRowActions({ entryId }: { entryId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [showWaive,   setShowWaive]   = useState(false);
  const [certNumber,  setCertNumber]  = useState("");
  const [waiveReason, setWaiveReason] = useState("");

  function handleReceive() {
    if (!certNumber.trim()) {
      setErr("ต้องระบุเลขที่ 50-ทวิ");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await adminMarkCertReceived({ entryId, certNumber: certNumber.trim() });
      if (res.ok) {
        setShowReceive(false);
        setCertNumber("");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function handleWaive() {
    if (waiveReason.trim().length < 10) {
      setErr("เหตุผลต้อง ≥ 10 ตัวอักษร");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await adminWaiveCert({ entryId, waivedReason: waiveReason.trim() });
      if (res.ok) {
        setShowWaive(false);
        setWaiveReason("");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  if (showReceive) {
    return (
      <div className="flex flex-col gap-1 min-w-[180px]">
        <input
          type="text"
          value={certNumber}
          onChange={(e) => setCertNumber(e.target.value)}
          placeholder="เลขที่ 50-ทวิ"
          autoFocus
          className="rounded border border-border bg-white px-2 py-1 text-[10px]"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleReceive}
            disabled={pending}
            className="rounded bg-green-600 text-white px-2 py-1 text-[10px] font-medium hover:bg-green-700 disabled:opacity-40"
          >
            ✓ ยืนยัน
          </button>
          <button
            type="button"
            onClick={() => { setShowReceive(false); setErr(null); }}
            className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
          >
            ยกเลิก
          </button>
        </div>
        {err && <p className="text-[9px] text-red-600">{err}</p>}
      </div>
    );
  }

  if (showWaive) {
    return (
      <div className="flex flex-col gap-1 min-w-[180px]">
        <textarea
          value={waiveReason}
          onChange={(e) => setWaiveReason(e.target.value)}
          placeholder="เหตุผล (≥10 ตัว)"
          autoFocus
          rows={2}
          className="rounded border border-border bg-white px-2 py-1 text-[10px]"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleWaive}
            disabled={pending}
            className="rounded bg-slate-600 text-white px-2 py-1 text-[10px] font-medium hover:bg-slate-700 disabled:opacity-40"
          >
            ✓ ยกเว้น
          </button>
          <button
            type="button"
            onClick={() => { setShowWaive(false); setErr(null); }}
            className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
          >
            ยกเลิก
          </button>
        </div>
        {err && <p className="text-[9px] text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => setShowReceive(true)}
        className="rounded border border-green-300 bg-green-50 px-2 py-1 text-[10px] font-medium text-green-700 hover:bg-green-100"
      >
        ✓ รับ
      </button>
      <button
        type="button"
        onClick={() => setShowWaive(true)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-surface-alt"
      >
        ยกเว้น
      </button>
    </div>
  );
}
