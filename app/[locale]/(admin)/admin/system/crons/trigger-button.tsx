"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { adminTriggerCron } from "@/actions/admin/system";

/**
 * "Trigger now" client button — only rendered for super (page-level
 * RBAC enforces the gate; this is just the UI affordance).
 */
export function CronTriggerButton({ cronPath }: { cronPath: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`รัน cron ${cronPath} ตอนนี้?`)) return;
          startTransition(async () => {
            const res = await adminTriggerCron(cronPath);
            if (res.ok) {
              setMsg(`✓ HTTP ${res.data?.httpStatus ?? 0}`);
              router.refresh();
            } else {
              setMsg(`✗ ${res.error}`);
            }
          });
        }}
        className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
      >
        {pending ? "กำลังรัน…" : "▶ Trigger now"}
      </button>
      {msg && <span className="text-[10px] text-muted">{msg}</span>}
    </div>
  );
}
