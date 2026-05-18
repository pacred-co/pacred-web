"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileText, Eye, Loader2 } from "lucide-react";
import { adminGetPcsContainerPaymentSlipUrl } from "@/actions/admin/pcs-container-payments";

/**
 * D1 Phase B — legacy tb_cnt slip viewer. Fetches a 1h signed URL for
 * the China-side payment slip (`cntimagesslip`) or the extra doc
 * (`cntfile`) on demand, then renders it inline (image) or links it
 * (PDF). Mirrors the yuan-payment slip-preview pattern.
 */
export function PcsPaymentSlipViewer({
  paymentId,
  kind,
}: {
  paymentId: number;
  kind: "slip" | "doc";
}) {
  const t = useTranslations("pcsContainer");
  const [pending, startTransition] = useTransition();
  const [url, setUrl]   = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  function load() {
    setErr(null);
    startTransition(async () => {
      const res = await adminGetPcsContainerPaymentSlipUrl({ id: paymentId, kind });
      if (res.ok) {
        if (!res.data?.url) {
          setErr(t("slipMissing"));
          return;
        }
        setUrl(res.data.url);
        setMime(res.data.mime);
      } else {
        setErr(res.error);
      }
    });
  }

  if (url) {
    if (mime === "application/pdf") {
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
        >
          <FileText className="h-3.5 w-3.5" /> {t("openPdf")}
        </a>
      );
    }
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={t("slipAlt")}
          className="max-h-72 rounded-lg border border-border object-contain"
        />
      </a>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={load}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
      >
        {pending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Eye className="h-3.5 w-3.5" />}
        {kind === "doc" ? t("viewDoc") : t("viewSlip")}
      </button>
      {err && <p className="text-[11px] text-red-700">{err}</p>}
    </div>
  );
}
