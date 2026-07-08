"use client";

/**
 * Payee 收款码 QR — display + attach/replace on the yuan-payment detail.
 *
 * Owner 2026-07-08: the customer's Alipay/WeChat receive-QR (the thing the
 * China operator scans to pay) often arrives AFTER the job is created, so
 * accounting must be able to attach it any time here. Image-only → calls
 * adminSetYuanPayeeQr which writes ONLY tb_payment.payee_qr_image.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetYuanPayeeQr } from "@/actions/admin/yuan-payments-tb";
import { SlipImage } from "@/components/admin/slip-image";

export function YuanQrAttach({
  id,
  qrUrl,
  qrFilename,
}: {
  id: number;
  qrUrl: string | null;
  qrFilename: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onPick(file: File | null) {
    setError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("ไฟล์ใหญ่เกิน 5 MB — เลือกใหม่");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    startTransition(async () => {
      const res = await adminSetYuanPayeeQr(id, file);
      if (inputRef.current) inputRef.current.value = "";
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 dark:bg-blue-50/5 p-4">
      <p className="text-xs font-semibold text-blue-700 mb-2">
        📱 รูป QR ปลายทาง (Alipay / WeChat 收款码 · สำหรับสแกนโอน)
      </p>
      {qrUrl ? (
        <a
          href={qrUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md border border-border overflow-hidden hover:border-blue-500"
        >
          <SlipImage src={qrUrl} alt="QR ปลายทาง" className="max-w-full max-h-[480px] min-w-[140px] min-h-[140px]" />
        </a>
      ) : (
        <p className="text-xs text-muted mb-2">ยังไม่มีรูป QR ปลายทาง — แนบได้เลย</p>
      )}
      {qrFilename && <p className="text-[11px] text-muted mt-2 break-all font-mono">{qrFilename}</p>}

      <label
        className={`mt-3 block cursor-pointer rounded-lg border-2 border-dashed border-blue-300 bg-white/60 dark:bg-surface px-3 py-2 text-center text-xs text-blue-700 hover:bg-blue-50 ${
          pending ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          className="hidden"
          disabled={pending}
          onChange={(e) => onPick(e.currentTarget.files?.[0] ?? null)}
        />
        {pending ? "กำลังอัปโหลด…" : qrUrl ? "เปลี่ยนรูป QR" : "＋ แนบรูป QR ปลายทาง (≤ 5 MB)"}
      </label>
      {error && <p className="mt-2 text-xs text-red-600">⚠ {error}</p>}
    </div>
  );
}
