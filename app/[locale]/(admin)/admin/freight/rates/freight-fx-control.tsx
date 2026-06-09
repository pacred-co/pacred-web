"use client";

/**
 * W5 — Monthly FX-rate refresh control for /admin/freight/rates.
 *
 * The China-freight cost is FX-dependent (≈35฿/USD), refreshed MANUALLY each
 * month (no FX API). This control reads/writes the `freight.fx_rate_thb_per_usd`
 * business_config key — the DEFAULT FX the rate-card form pre-fills + the
 * convert-time cost lookup falls back to. NOT a money mutation (each stored
 * rate row snapshots its own fx, so a change here never retro-edits stored cost).
 *
 * Confirm-before-mutate (§0f) via PacredDialog. Write super/ops only — accounting
 * sees a read-only badge (canWrite=false hides the edit control).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RefreshCw } from "lucide-react";
import { PacredDialog, DialogFooter } from "@/components/ui/pacred-dialog";
import { adminUpdateFreightFxRate } from "@/actions/admin/freight-rates";

export function FreightFxControl({
  fxRate,
  canWrite,
}: {
  fxRate: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(String(fxRate));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setDraft(String(fxRate));
    setErr(null);
    dialogRef.current?.showModal();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateFreightFxRate({ fx_thb_per_usd: draft });
      if (!res.ok) {
        setErr(res.error || "บันทึกไม่สำเร็จ");
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-alt/30 px-4 py-3">
      <RefreshCw className="h-4 w-4 text-primary-600" />
      <div className="flex-1">
        <p className="text-xs font-semibold">เรท FX กลาง (รายเดือน · บาท/USD)</p>
        <p className="text-[11px] text-muted">
          ใช้เป็นค่าตั้งต้นในฟอร์มต้นทุน + fallback ตอนแปลงใบเสนอราคา → งานขนส่ง · อัปเดตด้วยมือทุกเดือน (ไม่มี FX API)
        </p>
      </div>
      <span className="font-mono text-lg font-bold tabular-nums">{fxRate.toFixed(2)}</span>
      {canWrite && (
        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-alt"
        >
          <Pencil className="h-3.5 w-3.5" /> แก้ไข
        </button>
      )}

      <PacredDialog dialogRef={dialogRef} title="ปรับเรท FX กลาง">
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-xs text-muted">
            เรทใหม่นี้เป็นค่าตั้งต้นเท่านั้น — แถวต้นทุนเดิมแต่ละแถวยังเก็บ FX ของตัวเอง (ไม่ถูกแก้ย้อนหลัง).
          </p>
          <label className="block text-xs font-medium">
            เรท FX (บาท/USD)
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            />
          </label>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <DialogFooter onCancel={() => dialogRef.current?.close()} pending={pending} />
        </form>
      </PacredDialog>
    </div>
  );
}
