"use client";

import { useState } from "react";
import { Share2, Check, Link2 } from "lucide-react";
import { prompt } from "@/components/ui/confirm";

export function ShareButton({
  title,
  text,
  slug,
}: {
  title: string;
  text: string;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/knowledge/${slug}`
        : `/knowledge/${slug}`;

    // Web Share API (mobile + Chrome desktop)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // user cancelled — fallback to copy
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // last-resort: prompt
      await prompt("คัดลอกลิงก์นี้", url);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      suppressHydrationWarning
      className="inline-flex items-center gap-1 px-2 py-1 -mx-2 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700 dark:hover:text-primary-300 transition-colors cursor-pointer"
      aria-label="แชร์บทความ"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={3} />
          <span className="text-emerald-600">คัดลอกลิงก์แล้ว</span>
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span>แชร์</span>
          <Link2 className="w-3 h-3 opacity-60" strokeWidth={2.5} />
        </>
      )}
    </button>
  );
}
