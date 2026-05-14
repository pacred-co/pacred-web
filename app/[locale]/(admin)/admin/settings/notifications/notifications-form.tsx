"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateNotifyChannels } from "@/actions/profile";

type Initial = {
  line: boolean;
  email: boolean;
  daily_digest: boolean;
};

/**
 * Per-admin notification preferences form (P-15-followup).
 *
 * Reuses the existing `updateNotifyChannels` server action — it already
 * accepts the daily_digest field (added to validators in this batch).
 * The server action does not enforce role on daily_digest; the cron
 * does the role gate.  This means a non-sales admin enabling the
 * toggle is harmless (just won't receive any push because the cron
 * filter excludes them).
 */
export function NotificationsForm({
  initial,
  adminRoles,
}: {
  initial: Initial;
  adminRoles: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Initial>(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const eligibleForDigest = adminRoles.some((r) => r === "super" || r === "sales_admin");

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function onSave() {
    startTransition(async () => {
      const res = await updateNotifyChannels(state);
      flash(res.ok ? "ok" : "err", res.ok ? "บันทึกแล้ว" : res.error);
    });
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold">ช่องทางทั่วไป</h2>

        <ToggleRow
          label="LINE"
          description="รับการแจ้งเตือนผ่าน LINE OA (ต้องเชื่อมบัญชี LINE ที่ /profile ก่อน)"
          checked={state.line}
          onChange={(v) => setState({ ...state, line: v })}
          disabled={pending}
        />

        <ToggleRow
          label="Email"
          description="รับการแจ้งเตือนสำคัญทางอีเมล (fallback เมื่อ LINE ส่งไม่ได้)"
          checked={state.email}
          onChange={(v) => setState({ ...state, email: v })}
          disabled={pending}
        />
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold">สำหรับ Admin</h2>

        <div className="space-y-2">
          <ToggleRow
            label="สรุปยอดประจำวัน (Sales Daily Digest)"
            description="รับสรุปยอดขายของวันก่อนหน้าทุกวัน เวลา 17:05 ผ่าน LINE OA"
            checked={state.daily_digest}
            onChange={(v) => setState({ ...state, daily_digest: v })}
            disabled={pending}
          />
          {!eligibleForDigest && (
            <p className="ml-1 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ บัญชี admin ของคุณไม่มี role <code className="bg-surface-alt px-1">super</code>{" "}
              หรือ <code className="bg-surface-alt px-1">sales_admin</code> —
              เปิด toggle ได้แต่จะไม่ได้รับ push (cron กรองตาม role อีกชั้น)
            </p>
          )}
          {eligibleForDigest && state.daily_digest && (
            <p className="ml-1 text-xs text-green-700 dark:text-green-400">
              ✓ เปิดใช้แล้ว — ตรวจสอบให้แน่ใจว่า LINE เชื่อมแล้วที่ <code>/profile</code>
            </p>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <input
        type="checkbox"
        className="mt-1 size-5 cursor-pointer accent-primary-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}
