"use client";

/**
 * D1 Wave 18-A — per-row "รีเซ็ตรหัสผ่าน" button on /admin/customers.
 *
 * Confirm dialog (window.confirm) → server action → reveal the newly-generated
 * password in an inline toast. The toast carries:
 *   - the cleartext password (monospace, copy-to-clipboard button)
 *   - a 30-second auto-dismiss timer
 *   - a manual "ปิด" button for if the admin already wrote it down
 *
 * Why 30s? Long enough to copy + relay over phone or LINE, short enough that
 * the screen doesn't sit unattended showing a fresh credential. The same
 * pattern legacy users.php used.
 *
 * The cleartext password is NEVER persisted to the audit log — only the fact
 * of the reset is. See `actions/admin/customers-reset-pwd.ts`.
 */

import { useState, useTransition, useEffect } from "react";
import { Loader2, KeyRound, Copy, Check, X } from "lucide-react";
import { adminResetCustomerPassword } from "@/actions/admin/customers-reset-pwd";

type Props = {
  userid: string;
};

const REVEAL_TTL_MS = 30_000;

export function ResetPwdButton({ userid }: Props) {
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-dismiss after REVEAL_TTL_MS.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => {
      setRevealed(null);
      setCopied(false);
    }, REVEAL_TTL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  function handleClick() {
    setErr(null);
    if (!window.confirm(`รีเซ็ตรหัสผ่านของลูกค้า ${userid}?\nจะสุ่มรหัสใหม่ 6 ตัว — คุณจะเห็นเพียงครั้งเดียว`)) {
      return;
    }
    start(async () => {
      const res = await adminResetCustomerPassword({ userid });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setRevealed(res.data?.new_password ?? null);
    });
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail on http (non-secure context). Fall back to
      // a quiet no-op — admin can still read the password on screen.
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="flex h-7 items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 disabled:opacity-50 transition-colors"
        title="รีเซ็ตรหัสผ่าน"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
        รีเซ็ตรหัสผ่าน
      </button>

      {err && (
        <span className="ml-2 text-[10px] text-red-600" role="alert">
          {err}
        </span>
      )}

      {revealed && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[min(92vw,420px)] rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 p-4 shadow-lg"
          role="alert"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                รหัสผ่านใหม่ของลูกค้า {userid}
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-white dark:bg-surface px-3 py-1.5 font-mono text-base font-bold text-foreground border border-amber-200">
                  {revealed}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300 bg-white dark:bg-surface text-amber-700 hover:bg-amber-100"
                  title="คัดลอก"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                ส่งให้ลูกค้าทันที — กล่องนี้จะปิดอัตโนมัติใน 30 วินาที
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="text-amber-700 hover:text-amber-900"
              title="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
