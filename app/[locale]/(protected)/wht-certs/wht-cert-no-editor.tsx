"use client";

/**
 * ช่องกรอก "เลขที่เอกสาร" ใบ 50 ทวิ ต่อแถว — ลูกค้ากรอกเองจากระบบบัญชีของบริษัทตัวเอง
 * (owner 2026-07-24). เซฟเฉพาะเลข — ไม่แตะสถานะ (ปลดล็อกพิมพ์ยังต้องบัญชีตรวจ).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { customerSetReceiptWhtCertNo } from "@/actions/receipt-wht-cert";

export function WhtCertNoEditor({
  receiptId,
  initial,
  locked,
}: {
  receiptId: number;
  initial: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = value.trim() !== initial.trim();

  if (locked) {
    return (
      <span className="font-mono text-xs">
        {initial || <span className="text-muted">—</span>}
        {initial ? <span className="ml-1 text-[10px] text-emerald-700">🔒 ยืนยันแล้ว</span> : null}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setMsg(null); }}
        placeholder="เลขที่ใบหักของบริษัทคุณ"
        className="w-36 rounded-lg border border-border bg-white px-2 py-1 font-mono text-xs dark:bg-surface"
        maxLength={100}
        disabled={busy}
      />
      {dirty ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const res = await customerSetReceiptWhtCertNo(receiptId, value);
              setMsg(res.ok ? "✅" : `❌ ${res.error}`);
              if (res.ok) router.refresh();
            })
          }
          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "…" : "บันทึก"}
        </button>
      ) : null}
      {msg ? <span className="text-[11px]">{msg}</span> : null}
    </div>
  );
}
