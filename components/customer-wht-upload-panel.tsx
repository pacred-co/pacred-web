"use client";

/**
 * V-A6.1 — Customer-side WHT cert upload form.
 *
 * Renders on /service-(import|order)/[id]/receipt when the WHT entry
 * exists and status='pending'. Lets the customer self-upload their
 * 50 ทวิ cert PDF/JPG.
 *
 * Server action: actions/wht.ts::customerUploadWhtCert (RLS-scoped).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { customerUploadWhtCert } from "@/actions/wht";

type Props = {
  whtEntryId: string;
};

export function CustomerWhtUploadPanel({ whtEntryId }: Props) {
  const t = useTranslations("customerWhtUpload");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [certNo, setCertNo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function fire() {
    setErr(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr(t("errChooseFile"));
      return;
    }
    startTransition(async () => {
      const res = await customerUploadWhtCert(whtEntryId, file, certNo.trim() || undefined);
      if (res.ok) {
        router.refresh();
      } else {
        const key = errorKey(res.error);
        setErr(key ? t(key, { code: res.error }) : res.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="no-print mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
        <p className="text-xs font-bold text-amber-900">📤 {t("ctaHeading")}</p>
        <p className="text-[11px] text-amber-800">
          {t("ctaBody")}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
        >
          {t("ctaButton")} →
        </button>
      </div>
    );
  }

  return (
    <div className="no-print mt-3 rounded-lg border border-amber-300 bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold text-amber-900">📤 {t("formHeading")}</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          disabled={pending}
          className="text-xs text-muted hover:underline"
        >
          {t("close")}
        </button>
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs text-muted">{t("fileLabel")}</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="mt-1 block w-full text-xs"
          />
          <span className="text-[10px] text-muted">{t("fileHint")}</span>
        </label>

        <label className="block">
          <span className="text-xs text-muted">{t("certNoLabel")}</span>
          <input
            type="text"
            placeholder={t("certNoPlaceholder")}
            value={certNo}
            onChange={(e) => setCertNo(e.target.value)}
            maxLength={100}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs"
          />
        </label>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={pending}
          className="rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? t("uploading") : `✓ ${t("submitCert")}`}
        </button>
      </div>

      <p className="text-[10px] text-muted">
        ⚠️ {t("footerNote")}
      </p>
    </div>
  );
}

function errorKey(code: string): string | null {
  if (code.startsWith("upload_failed")) return "errUploadFailed";
  if (code.startsWith("update_failed")) return "errUpdateFailed";
  switch (code) {
    case "invalid_input":             return "errInvalidInput";
    case "not_signed_in":             return "errNotSignedIn";
    case "no_file":                   return "errNoFile";
    case "file_too_large":            return "errFileTooLarge";
    case "invalid_mime_type":         return "errInvalidMimeType";
    case "not_found_or_unauthorised": return "errNotFoundOrUnauthorised";
    case "not_owner":                 return "errNotOwner";
    case "already_received":          return "errAlreadyReceived";
    case "already_waived":            return "errAlreadyWaived";
    default:                          return null;
  }
}
