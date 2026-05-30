"use client";

/**
 * Client pay-form for /admin/sales-payouts/[id] — talks to
 * `adminMarkSalesPayoutPaidTb` in actions/admin/sales-payouts-tb.ts.
 *
 * Faithful to `report-user-sales-history.php` L259-287 (the status==2 branch):
 * admin reviews the bank-transfer fields (rendered server-side above this
 * form), uploads the bank-transfer slip (required · `imagesSlip`), submits →
 * the payout flips status '2'→'3' (สำเร็จ). On success we refresh so the page
 * re-renders in the read-only "paid" state.
 *
 * The slip `File` is passed as the 2nd arg to the server action (the same
 * proven pattern as AdminWalletAddForm) — it survives the server-action
 * boundary and uploads to the `slips` bucket.
 */

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminMarkSalesPayoutPaidTb } from "@/actions/admin/sales-payouts-tb";

export function SalesPayoutPayForm({ id }: { id: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (slipPreview) URL.revokeObjectURL(slipPreview);
    };
  }, [slipPreview]);

  function selectSlip(f: File | null) {
    setError(null);
    if (f && f.size > 5 * 1024 * 1024) {
      setError("ไฟล์สลิปใหญ่เกิน 5 MB — กรุณาเลือกไฟล์ใหม่");
      return;
    }
    setSlipFile(f);
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    if (f && f.type.startsWith("image/")) {
      setSlipPreview(URL.createObjectURL(f));
    } else {
      setSlipPreview(null);
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!slipFile) {
      setError("กรุณาแนบหลักฐานการโอน (สลิปรายการ)");
      return;
    }

    startTransition(async () => {
      const result = await adminMarkSalesPayoutPaidTb({ id }, slipFile);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("ทำรายการจ่ายเงินแล้ว");
      selectSlip(null);
      if (slipInputRef.current) slipInputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <span className="block text-xs text-muted mb-1">
          หลักฐานการโอน (สลิปรายการ) <span className="text-red-700">*</span>
        </span>
        <label
          className={[
            "block rounded-xl border-2 border-dashed p-3.5 transition-colors",
            slipFile
              ? "border-emerald-400 bg-emerald-50/60"
              : "border-border bg-surface-alt/40 hover:bg-surface-alt/70",
            pending ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          ].join(" ")}
        >
          <input
            ref={slipInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            disabled={pending}
            onChange={(e) => selectSlip(e.currentTarget.files?.[0] ?? null)}
          />
          {slipFile ? (
            <div className="flex items-start gap-3.5">
              {slipPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slipPreview}
                  alt="พรีวิวสลิป"
                  className="max-h-[120px] max-w-[160px] rounded-md border border-border bg-white object-contain"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="m-0 font-medium break-all">{slipFile.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {(slipFile.size / 1024).toFixed(1)} KB · {slipFile.type || "unknown"}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    selectSlip(null);
                    if (slipInputRef.current) slipInputRef.current.value = "";
                  }}
                  className="mt-1.5 bg-transparent p-0 text-xs text-red-700 hover:text-red-800 disabled:opacity-60"
                >
                  ลบไฟล์
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center">
              <div className="text-2xl">📄</div>
              <p className="mt-1 font-medium">คลิกเพื่อเลือกไฟล์สลิป</p>
              <p className="mt-0.5 text-[11px] text-muted">JPG / PNG / PDF · ≤ 5 MB</p>
            </div>
          )}
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="alert">
          ✓ {success}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <button
          type="submit"
          disabled={pending || !slipFile}
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "กำลังทำรายการ..." : "ยืนยันการจ่ายเงิน"}
        </button>
      </div>
    </form>
  );
}
