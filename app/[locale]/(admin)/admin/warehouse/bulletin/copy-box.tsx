"use client";

import { useState } from "react";

/**
 * Read-only textarea + copy-to-clipboard button for the daily bulletin
 * (U2-1). Server component above generates the text; this client just
 * handles the clipboard interaction + flash UI.
 */
export function BulletinCopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function copy() {
    setErr(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      setErr("คัดลอกไม่สำเร็จ — กรุณาเลือกข้อความและกด Ctrl+C");
      console.error(e);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        readOnly
        value={text}
        rows={Math.min(20, Math.max(8, text.split("\n").length + 1))}
        className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono whitespace-pre focus:outline-none focus:ring-2 focus:ring-primary-500/50"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          📋 คัดลอกข้อความทั้งหมด
        </button>
        {copied && (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-700 font-medium">
            ✓ คัดลอกแล้ว — paste ลง LINE ได้เลย
          </span>
        )}
        {err && (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700">
            {err}
          </span>
        )}
      </div>
    </div>
  );
}
