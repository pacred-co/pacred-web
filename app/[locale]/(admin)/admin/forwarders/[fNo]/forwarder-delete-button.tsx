"use client";

/**
 * <ForwarderDeleteButton> — the legacy "ลบการสั่งซื้อถาวร" button, as Pacred.
 *
 * 2026-06-10 (ปอน). Destructive · permanent. Two-step confirm (the §0f
 * confirm-before-mutate bar · กันคนลั่น) replacing the legacy SweetAlert:
 * click → red "ยืนยันลบถาวร?" bar → confirm. Wires to the guarded
 * adminDeleteForwarder (refuses orders already shipping/done · super/accounting
 * /ops only). On success → back to the list, like the legacy redirect to
 * forwarder/?q=1.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { adminDeleteForwarder } from "@/actions/admin/forwarder-delete";

export function ForwarderDeleteButton({ id, fNoLabel }: { id: number; fNoLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await adminDeleteForwarder({ id });
      if (res.ok) {
        router.push("/admin/forwarders");
        router.refresh();
      } else {
        setErr(res.error);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => { setErr(null); setConfirming(true); }}
          className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
        >
          <Trash2 className="h-4 w-4" /> ลบการสั่งซื้อถาวร
        </button>
        {err && <p className="text-xs text-red-600">❌ {err}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
      <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          ต้องการ<b className="font-bold">ลบออเดอร์นี้ถาวร</b> เลขที่ <b className="font-mono">{fNoLabel}</b>?
          การลบนี้กู้คืนไม่ได้
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "กำลังลบ..." : "ใช่, ลบออเดอร์นี้ถาวร"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
