"use client";

/**
 * <AdvanceBillConfirmButton> — the "จุดเฟิม" (owner 2026-06-23 · วางบิลล่วงหน้าตอน MOMO
 * ยิงของ). When goods have reached the MOMO China warehouse (fstatus 2/3/4) and a staff
 * has checked the firmed คิว/น้ำหนัก (แต้ม packing list · MOMO fallback), they เฟิม here →
 * advance_bill_confirmed='1' on the WHOLE shipment (sibling ids) → unlocks the
 * "สร้างใบวางบิลล่วงหน้า" button so the customer can be billed + pay BEFORE TH arrival.
 * The morning warehouse scan then dispatches without re-collecting (paydeposit settled).
 *
 * Shown only at fstatus 2/3/4 + priced + not-yet-confirmed. confirm() runs OUTSIDE
 * startTransition (the dialog-inside-transition trap).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { adminConfirmAdvanceBill } from "@/actions/admin/forwarder-step";

export function AdvanceBillConfirmButton({
  fIds,
  fstatus,
  confirmed,
  priced,
}: {
  fIds: number[];
  fstatus: string;
  confirmed: boolean;
  priced: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const cur = String(fstatus ?? "").trim();
  if (!["2", "3", "4"].includes(cur)) return null; // pre-/at-arrival only

  if (confirmed) {
    return (
      <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
        ✓ เฟิมข้อมูลแล้ว — วางบิลล่วงหน้าได้ (กดปุ่ม “สร้างใบวางบิลล่วงหน้า” ด้านล่าง)
      </div>
    );
  }

  async function onClick() {
    setErr(null);
    if (!priced) {
      setErr("ยังไม่มีราคา (คิว/น้ำหนัก) — วัด/ตั้งราคาก่อนเฟิม");
      return;
    }
    const ok = await confirm(
      `เฟิมข้อมูล คิว/น้ำหนัก ของออเดอร์นี้?\n\n` +
        `ยืนยันว่าตัวเลขจากแต้ม/MOMO ถูกต้องแล้ว → เปิดให้วางบิลล่วงหน้า (เก็บเงินก่อนของถึงไทย). ` +
        `เช้ารับของ + สแกน → จ่ายงานคนขับได้เลย ไม่ต้องเก็บเงินซ้ำ.`,
      { title: "เฟิมข้อมูล (วางบิลล่วงหน้า)", confirmLabel: "เฟิม + เปิดวางบิล", cancelLabel: "ยกเลิก" },
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminConfirmAdvanceBill({ fIds, source: "taem" });
      if (res.ok && (res.data?.confirmed.length ?? 0) > 0) {
        router.refresh();
      } else {
        setErr(res.ok ? "เฟิมไม่สำเร็จ (ตรวจสถานะ/ราคาของทุกแทรคกิง)" : (res.error ?? "เฟิมไม่สำเร็จ"));
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShieldCheck className="h-4 w-4" />
        {pending ? "กำลังเฟิม..." : "🔒 เฟิมข้อมูล + เปิดวางบิลล่วงหน้า"}
      </button>
      <p className="text-[11px] text-muted">
        ของถึง MOMO แล้ว · เฟิม คิว/น้ำหนัก (อิงแต้ม · MOMO สำรอง) → วางบิลล่วงหน้า เก็บเงินก่อนของถึงไทย
      </p>
      {err && <p className="text-[11px] text-red-600">⚠ {err}</p>}
    </div>
  );
}
