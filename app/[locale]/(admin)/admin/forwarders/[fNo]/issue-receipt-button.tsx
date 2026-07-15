"use client";

/**
 * ออกใบเสร็จ — for a PAID ฝากนำเข้า order that has no receipt yet (owner 2026-07-15
 * "ต้องวนไปเอาใบเสร็จได้ · เข้า loop เงินปกติ"). One click mints the receipt via
 * adminIssueReceiptForForwarder (idempotent) and reveals the link. Confirm-before §0f.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminIssueReceiptForForwarder } from "@/actions/admin/issue-receipt";

export function IssueReceiptButton({ fid }: { fid: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ receiptId: number | null; rid: string | null } | null>(null);

  async function onClick() {
    setErr(null);
    if (!(await confirm("ออกใบเสร็จสำหรับออเดอร์นี้?\n\n(บันทึกใบเสร็จของเงินที่เก็บมาแล้ว · ไม่ย้ายเงิน)"))) return;
    start(async () => {
      const res = await adminIssueReceiptForForwarder(fid);
      if (!res.ok) { setErr(res.error ?? "ออกใบเสร็จไม่สำเร็จ"); return; }
      setIssued({ receiptId: res.data!.receiptId, rid: res.data!.rid });
      router.refresh();
    });
  }

  if (issued?.receiptId) {
    return (
      <Link href={`/admin/accounting/forwarder-invoice/${issued.receiptId}`}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-2.5 py-1 font-mono text-xs text-emerald-700 hover:bg-emerald-100">
        {issued.rid ?? "ใบเสร็จ"} · ออกแล้ว →
      </Link>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={onClick} disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-400 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? "กำลังออก…" : "＋ ออกใบเสร็จ"}
      </button>
      {err && <span className="text-[11px] text-red-600">⚠ {err}</span>}
    </span>
  );
}
