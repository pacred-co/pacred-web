"use client";

/**
 * <TranslateButton text={zh} /> — reusable on-demand ZH→TH translate control.
 *
 * Renders NOTHING for non-Chinese text (containsCJK guard). For Chinese text it
 * shows a small "🌐 แปลไทย" button; on click it calls the server action, then
 * shows the Thai inline below with a "แปลโดยอัตโนมัติ" note + a collapse toggle.
 * DISPLAY-ONLY — no money/status/rate.
 */

import { useState, useTransition } from "react";
import { Languages } from "lucide-react";
import { containsCJK } from "@/lib/translate/cjk";
import { translateTextAction } from "@/actions/translate";

export function TranslateButton({
  text,
  className = "",
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const [thai, setThai] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!containsCJK(text)) return null;
  const src = text as string;

  function run() {
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await translateTextAction(src);
        if (res.ok && res.thai) setThai(res.thai);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <span className={`inline-block ${className}`}>
      {thai === null ? (
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
        >
          <Languages className="h-3 w-3" />
          {pending ? "กำลังแปล…" : "แปลไทย"}
        </button>
      ) : (
        <span className="mt-1 block rounded-md border border-sky-200 bg-sky-50/60 px-2 py-1 text-[11px] leading-snug text-sky-900 dark:border-sky-900/40 dark:bg-sky-900/10 dark:text-sky-200">
          <span className="whitespace-pre-wrap">{thai}</span>
          <button
            type="button"
            onClick={() => setThai(null)}
            className="ml-1.5 text-sky-500 underline hover:text-sky-700"
          >
            ซ่อน
          </button>
          <span className="mt-0.5 block text-[11px] text-sky-500/80">แปลโดยอัตโนมัติ</span>
        </span>
      )}
      {failed && thai === null && (
        <span className="ml-1 text-[11px] text-red-500">แปลไม่สำเร็จ</span>
      )}
    </span>
  );
}
