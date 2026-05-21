"use client";

/**
 * Client form for /admin/warehouse/qa-inspections/[id] — verdict update,
 * notes thread, and blacklist toggle.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  adminUpdateQaInspection,
  type QaVerdict,
} from "@/actions/admin/qa-inspections";

const VERDICTS: QaVerdict[] = ["pass", "fail", "hold", "fake_product"];

export function UpdateInspectionForm({
  id,
  initialVerdict,
  initialNotes,
  initialBlacklist,
}: {
  id:                string;
  initialVerdict:    QaVerdict;
  initialNotes:      string;
  initialBlacklist:  boolean;
}) {
  const t = useTranslations("qaInspection");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [verdict, setVerdict] = useState<QaVerdict>(initialVerdict);
  const [notes, setNotes] = useState<string>(initialNotes);
  // fake_product implies blacklist (DB CHECK) — auto-tick when chosen.
  const [blacklist, setBlacklist] = useState<boolean>(initialBlacklist);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean>(false);

  function onVerdictChange(v: QaVerdict): void {
    setVerdict(v);
    if (v === "fake_product") setBlacklist(true);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await adminUpdateQaInspection({
        id,
        verdict,
        notes,
        blacklist_shop: blacklist,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold mb-1">{t("col.verdict")}</label>
        <div className="flex flex-wrap gap-2">
          {VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onVerdictChange(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                verdict === v
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-border bg-white text-foreground hover:bg-surface-alt"
              }`}
            >
              {t(`verdict.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="qa-notes" className="block text-xs font-semibold mb-1">
          {t("notesLabel")}
        </label>
        <textarea
          id="qa-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          maxLength={2000}
          className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          placeholder={t("notesPlaceholder")}
        />
        <p className="mt-1 text-[10px] text-muted">{notes.length}/2000</p>
      </div>

      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={blacklist}
            disabled={verdict === "fake_product"}
            onChange={(e) => setBlacklist(e.target.checked)}
          />
          <span>
            {t("blacklistLabel")}
            {verdict === "fake_product" && (
              <span className="ml-1 text-[10px] text-red-600">({t("blacklistAutoFake")})</span>
            )}
          </span>
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-700">
          {t("updateOk")}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? t("savingBtn") : t("saveBtn")}
        </button>
      </div>
    </form>
  );
}
