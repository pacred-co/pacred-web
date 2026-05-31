"use client";

/**
 * Admin client for a `tb_notify` popup detail — delete action.
 *
 * 2026-06-01 — REPOINTED to legacy `tb_notify`. The legacy `popup.php` screen
 * only supports create + list + delete (there is no draft/schedule/send-now
 * lifecycle), so the detail page's only mutation is delete (legacy
 * `popup/delete.php` — removes the tb_notify row + its tb_notify_read receipts).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteNotify } from "@/actions/admin/broadcasts";

type Props = {
  id:    number;
  title: string;
};

export function BroadcastDetailClient({ id, title }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function doDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await adminDeleteNotify({ id });
      if (res.ok) {
        router.push("/admin/broadcasts");
        router.refresh();
      } else {
        setErr(translateError(res.error ?? "unknown"));
      }
    });
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 space-y-3">
      <h2 className="font-bold text-sm">การดำเนินการ</h2>

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={pending}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          🗑 ลบรายการ
        </button>
      ) : (
        <div className="rounded-lg border border-red-300 bg-white p-4 space-y-3">
          <p className="text-sm font-bold text-red-900">⚠️ ยืนยันลบ Pop-up &quot;{title}&quot;?</p>
          <p className="text-xs text-muted">
            ลูกค้าจะไม่เห็น popup นี้อีก และประวัติการกดรับทราบ (<code className="font-mono">tb_notify_read</code>) จะถูกลบด้วย — ยกเลิกไม่ได้.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doDelete}
              disabled={pending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังลบ..." : "✓ ลบเลย"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("delete_failed")) return `ลบล้มเหลว: ${code}`;
  switch (code) {
    case "not_found": return "ไม่พบรายการ";
    default:          return code;
  }
}
