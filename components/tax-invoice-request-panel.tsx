"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  requestTaxInvoice,
  type CustomerTaxInvoiceSummary,
} from "@/actions/tax-invoices";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/**
 * Tax invoice request panel — drops onto receipt pages (T-P4 G2b).
 *
 * Render rules:
 *   - If `existing` is set → show status card (pending / issued / cancelled)
 *     with download button when issued.
 *   - Else → show CTA button → expand into form pre-populated from profile.
 *
 * Per ADR-0006:
 *   - Eligible: any paid order; juristic customers most likely path but
 *     personal-with-tax-ID is also allowed (RD requirement is having a
 *     valid tax ID, not being incorporated).
 *   - Buyer info captured at request — does NOT auto-refresh from profile
 *     after request lands.
 */

type Props = {
  /** Which parent is hosting us. */
  orderType: "forwarder" | "service_order" | "yuan_payment";
  orderId:   string;
  /** Pre-populate form from profile if available. */
  defaults: {
    name:    string;     // company name (juristic) OR first+last (personal)
    address: string;
    taxId:   string;
  };
  /** Existing tax invoice for this order if already requested. */
  existing: CustomerTaxInvoiceSummary | null;
  /** Whether the customer is eligible at all (must have profile.tax_id OR
   *  juristic.tax_id; otherwise we hide the panel + show a hint). */
  eligible: boolean;
  /** ADR-0027: shop (tb_header_order) + yuan (tb_payment) tax-invoice request
   *  is deferred (no World-B cross-type store yet) → render a "coming soon"
   *  banner instead of the request form. Forwarder is live. */
  deferred?: boolean;
};

export function TaxInvoiceRequestPanel({ orderType, orderId, defaults, existing, eligible, deferred }: Props) {
  const t = useTranslations("taxInvoiceRequest");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name,    setName]    = useState(defaults.name);
  const [address, setAddress] = useState(defaults.address);
  const [taxId,   setTaxId]   = useState(defaults.taxId);
  const [branch,  setBranch]  = useState("สำนักงานใหญ่");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await requestTaxInvoice({
        order_type:    orderType,
        order_id:      orderId,
        buyer_name:    name.trim(),
        buyer_address: address.trim(),
        buyer_tax_id:  taxId.trim(),
        buyer_branch:  branch.trim() || "สำนักงานใหญ่",
      });
      if (res.ok && res.data) {
        if (res.data.already_exists) {
          setMsg(t("msgAlreadyExists"));
        } else {
          setMsg(t("msgRequestSent"));
        }
        router.refresh();
      } else if (!res.ok) {
        const key = errorKey(res.error);
        setErr(key ? t(key) : res.error);
      }
    });
  }

  // ── Deferred type (shop / yuan) — ADR-0027 "coming soon" banner ──
  // No World-B cross-type tax-invoice store yet; only forwarder is live.
  if (deferred) {
    return (
      <section className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <h3 className="font-bold mb-1">{t("heading")}</h3>
        <p className="text-xs text-amber-800">
          {t("deferredBody", {
            service: orderType === "yuan_payment" ? t("serviceYuan") : t("serviceShop"),
          })}
        </p>
      </section>
    );
  }

  // ── Existing invoice — show status card ──
  if (existing) {
    return <ExistingInvoiceCard existing={existing} />;
  }

  // ── Customer not eligible — hint + don't show form ──
  if (!eligible) {
    return (
      <section className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <h3 className="font-bold mb-1">{t("heading")}</h3>
        <p className="text-xs text-amber-800">
          {t.rich("notEligibleBody", {
            profileLink: (chunks) => (
              <Link href="/profile" className="underline text-amber-900">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    );
  }

  // ── Collapsed CTA ──
  if (!open) {
    return (
      <section className="no-print rounded-lg border border-primary-200 bg-primary-50/50 dark:bg-primary-950/20 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-sm">{t("ctaHeading")}</h3>
            <p className="text-xs text-muted">
              {t("ctaSubtitle")}
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            📄 {t("ctaButton")}
          </Button>
        </div>
      </section>
    );
  }

  // ── Expanded form ──
  return (
    <section className="no-print rounded-lg border border-primary-200 bg-primary-50/50 dark:bg-primary-950/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">{t("heading")}</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setMsg(null); setErr(null); }}
          className="text-xs text-muted hover:underline"
          disabled={pending}
        >
          {t("close")}
        </button>
      </div>

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted">
          {t("formInfo")}
        </p>

        <label className="block space-y-1">
          <span className="text-xs font-medium">{t("labelBuyerName")} <span className="text-red-500">*</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required disabled={pending} />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium">{t("labelAddress")} <span className="text-red-500">*</span></span>
          <textarea
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputCls}
            required
            disabled={pending}
          />
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t("labelTaxId")} <span className="text-red-500">*</span></span>
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))}
              className={inputCls + " font-mono"}
              placeholder="0105560123459"
              required
              disabled={pending}
              inputMode="numeric"
              pattern="\d{13}"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t("labelBranch")}</span>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className={inputCls}
              placeholder={t("branchPlaceholder")}
              disabled={pending}
            />
          </label>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : `📤 ${t("submit")}`}
        </Button>
      </form>
    </section>
  );
}

function ExistingInvoiceCard({ existing }: { existing: CustomerTaxInvoiceSummary }) {
  const t = useTranslations("taxInvoiceRequest");
  const isIssued    = existing.status === "issued";
  const isPending   = existing.status === "pending";
  const isCancelled = existing.status === "cancelled";

  return (
    <section className="no-print rounded-lg border border-border bg-surface-alt p-4 space-y-2">
      <h3 className="font-bold text-sm">{t("existingHeading")}</h3>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs space-y-0.5">
          {existing.serial_no && (
            <p className="font-mono">{existing.serial_no}</p>
          )}
          <p>
            {t("buyerLabel")} <span className="font-medium">{existing.buyer_name}</span>
            <span className="ml-2 text-muted">{t("taxIdLabel")} {existing.buyer_tax_id}</span>
          </p>
          <p className="text-muted">
            {t("requestedAtLabel")} {new Date(existing.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
            {existing.issued_at && (
              <span className="ml-2">· {t("issuedAtLabel")} {new Date(existing.issued_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              isIssued
                ? "bg-green-50 text-green-700 border-green-200"
                : isPending
                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                  : "bg-gray-50 text-gray-600 border-gray-200"
            }`}
          >
            {isIssued ? t("statusIssued") : isPending ? t("statusPending") : t("statusCancelled")}
          </span>
          {isIssued && (
            <a
              href={`/api/tax-invoice/${existing.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
            >
              {t("downloadPdf")}
            </a>
          )}
        </div>
      </div>
      {isCancelled && (
        <p className="text-xs text-muted">
          {t("cancelledNote")}
        </p>
      )}
    </section>
  );
}

function errorKey(code: string): string | null {
  switch (code) {
    case "not_signed_in":      return "errNotSignedIn";
    case "order_not_found":    return "errOrderNotFound";
    case "not_your_order":     return "errNotYourOrder";
    case "order_cancelled":    return "errOrderCancelled";
    case "order_not_paid_yet": return "errOrderNotPaidYet";
    case "order_has_no_total": return "errOrderHasNoTotal";
    // ADR-0027 — shop/yuan tax-invoice deferred (no World-B cross-type store yet).
    case "not_yet_supported":  return "errNotYetSupported";
    case "no_member_code":     return "errNoMemberCode";
    default:                   return null;
  }
}
