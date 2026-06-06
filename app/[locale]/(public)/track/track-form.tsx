"use client";

// Public tracking input (Task 2). Pushes to /track/<code> on submit — the
// [code] is a path segment, so a plain GET form (which would produce
// ?code=…) isn't enough; we navigate programmatically. Reused on the landing
// page and at the bottom of a result page ("ค้นหาเลขอื่น").

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Search } from "lucide-react";

export function TrackForm({
  initial = "",
  autoFocus = false,
}: {
  initial?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("publicTrackStatus");
  const router = useRouter();
  const [code, setCode] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim();
        if (c.length >= 4) router.push(`/track/${encodeURIComponent(c)}`);
      }}
      className="flex w-full flex-col gap-2 sm:flex-row"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="text"
          inputMode="text"
          autoFocus={autoFocus}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("inputPlaceholder")}
          aria-label={t("inputAriaLabel")}
          className="h-12 w-full rounded-xl border border-border bg-white pl-11 pr-4 text-base text-foreground outline-none placeholder:text-muted focus:border-red-300 focus:shadow-[0_0_0_3px_#fef2f2] dark:bg-surface"
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 text-base font-bold text-white transition-colors hover:bg-primary-700"
      >
        <Search className="h-5 w-5" />
        {t("submitButton")}
      </button>
    </form>
  );
}
