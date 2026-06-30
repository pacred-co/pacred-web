"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Ship,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
} from "lucide-react";
import { submitFreightQuote } from "@/actions/freight-quote";
import {
  RFQ_SERVICES,
  RFQ_TRANSPORTS,
  RFQ_INCOTERMS,
  RFQ_LOAD_TYPES,
  RFQ_CONTAINER_SIZES,
  type RfqService,
  type RfqTransport,
  type RfqIncoterm,
  type RfqLoadType,
  type RfqContainerSize,
  type FreightRfqInput,
} from "@/lib/validators/freight-rfq";

/**
 * <FreightBookingForm> — the CUSTOMER in-app freight booking / RFQ create.
 *
 * Submits through the EXISTING public booking seam `submitFreightQuote`
 * (actions/freight-quote.ts → `freight_quote` lead → AX-YYYY-NNNNN ref →
 * sales LINE ping → /admin/freight/leads/[ref]). Because the customer is
 * logged in, the action soft-links the lead to their profile_id automatically,
 * so it shows up under their account + sales picks it up. This is the ONLY
 * mutation in the customer freight lane (booking-create) — everything else is
 * read-only.
 *
 * Defaults are prefilled (name/phone) by the page from the session so the
 * customer barely types. Mobile-first single page (no multi-step wizard) —
 * customers are on phones (AGENTS §6).
 *
 * §0f: confirm-before-submit guard (กันลั่น) via a two-tap submit.
 */

const SERVICE_LABEL_KEY: Record<RfqService, string> = {
  import:    "bkServiceImport",
  export:    "bkServiceExport",
  customs:   "bkServiceCustoms",
  nondoc:    "bkServiceNondoc",
  clearance: "bkServiceClearance",
};
const TRANSPORT_LABEL_KEY: Record<RfqTransport, string> = {
  sea:   "bkTransportSea",
  air:   "bkTransportAir",
  truck: "bkTransportTruck",
};

export function FreightBookingForm({
  defaultName,
  defaultPhone,
  lineOaUrl,
}: {
  defaultName: string;
  defaultPhone: string;
  lineOaUrl: string;
}) {
  const t = useTranslations("customerFreight");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Form state
  const [service, setService] = useState<RfqService>("import");
  const [transport, setTransport] = useState<RfqTransport | "">("sea");
  const [loadType, setLoadType] = useState<RfqLoadType | "">("");
  const [containerSize, setContainerSize] = useState<RfqContainerSize | "">("");
  const [incoterm, setIncoterm] = useState<RfqIncoterm | "">("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [product, setProduct] = useState("");
  const [cbm, setCbm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [contactName, setContactName] = useState(defaultName);
  const [contactPhone, setContactPhone] = useState(defaultPhone);
  const [note, setNote] = useState("");

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const payload: FreightRfqInput = {
      customerType: "company",
      service,
      transport: transport || undefined,
      incoterm: incoterm || undefined,
      loadType: loadType || undefined,
      containerSize: containerSize || undefined,
      origin: origin || undefined,
      destination: destination || undefined,
      product: product || undefined,
      cbm: cbm || undefined,
      weightKg: weightKg || undefined,
      addons: [],
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactPref: "form",
      note: note || undefined,
    };
    startTransition(async () => {
      const res = await submitFreightQuote(payload);
      if (res.ok) {
        setRef(res.ref);
        setConfirming(false);
      } else {
        setConfirming(false);
        setError(
          res.error === "rate_limit"
            ? t("bkErrorRateLimit")
            : res.error === "invalid_input"
              ? t("bkErrorInvalid")
              : t("bkErrorGeneric"),
        );
      }
    });
  };

  // ── Success ────────────────────────────────────────────────────────────────
  if (ref) {
    return (
      <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-6 text-center space-y-3">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="text-lg font-bold text-green-900">{t("bkSuccessTitle")}</h2>
        <p className="text-sm text-green-800">
          {t("bkSuccessRef")}{" "}
          <span className="font-mono font-bold">{ref}</span>
        </p>
        <p className="text-xs text-green-700">{t("bkSuccessBody")}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => router.push("/freight")}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
          >
            {t("bkSuccessToHub")}
          </button>
          <a
            href={lineOaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" /> {t("bkSuccessLine")}
          </a>
        </div>
      </div>
    );
  }

  const fieldCls =
    "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100";
  const labelCls = "block text-xs font-semibold text-foreground mb-1";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!contactName.trim() || contactPhone.trim().length < 6) {
          setError(t("bkErrorContact"));
          return;
        }
        setError(null);
        setConfirming(true);
      }}
      className="space-y-5"
    >
      {/* Service */}
      <div>
        <label className={labelCls}>{t("bkService")} *</label>
        <div className="flex flex-wrap gap-2">
          {RFQ_SERVICES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setService(s)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                service === s
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-border bg-white text-foreground hover:bg-surface-alt"
              }`}
            >
              {t(SERVICE_LABEL_KEY[s])}
            </button>
          ))}
        </div>
      </div>

      {/* Transport + load */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t("bkTransport")}</label>
          <div className="flex flex-wrap gap-2">
            {RFQ_TRANSPORTS.map((tr) => (
              <button
                type="button"
                key={tr}
                onClick={() => setTransport(transport === tr ? "" : tr)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  transport === tr
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-border bg-white text-foreground hover:bg-surface-alt"
                }`}
              >
                {t(TRANSPORT_LABEL_KEY[tr])}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>{t("bkLoadType")}</label>
          <div className="flex flex-wrap gap-2">
            {RFQ_LOAD_TYPES.map((lt) => (
              <button
                type="button"
                key={lt}
                onClick={() => setLoadType(loadType === lt ? "" : lt)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  loadType === lt
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-border bg-white text-foreground hover:bg-surface-alt"
                }`}
              >
                {lt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FCL container size + incoterm */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {loadType === "FCL" && (
          <div>
            <label className={labelCls}>{t("bkContainerSize")}</label>
            <select
              value={containerSize}
              onChange={(e) => setContainerSize(e.target.value as RfqContainerSize | "")}
              className={fieldCls}
            >
              <option value="">—</option>
              {RFQ_CONTAINER_SIZES.map((cs) => (
                <option key={cs} value={cs}>{cs}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>Incoterm</label>
          <select
            value={incoterm}
            onChange={(e) => setIncoterm(e.target.value as RfqIncoterm | "")}
            className={fieldCls}
          >
            <option value="">—</option>
            {RFQ_INCOTERMS.map((ic) => (
              <option key={ic} value={ic}>{ic}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Route */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t("bkOrigin")}</label>
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} className={fieldCls} placeholder={t("bkOriginPlaceholder")} />
        </div>
        <div>
          <label className={labelCls}>{t("bkDestination")}</label>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} className={fieldCls} placeholder={t("bkDestinationPlaceholder")} />
        </div>
      </div>

      {/* Product + volume */}
      <div>
        <label className={labelCls}>{t("bkProduct")}</label>
        <input value={product} onChange={(e) => setProduct(e.target.value)} className={fieldCls} placeholder={t("bkProductPlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t("bkCbm")}</label>
          <input value={cbm} onChange={(e) => setCbm(e.target.value)} inputMode="decimal" className={fieldCls} placeholder="0.00" />
        </div>
        <div>
          <label className={labelCls}>{t("bkWeight")}</label>
          <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} inputMode="decimal" className={fieldCls} placeholder="0" />
        </div>
      </div>

      {/* Contact (prefilled) */}
      <div className="rounded-xl border border-border bg-surface-alt/30 p-4 space-y-3">
        <p className="text-xs font-bold text-foreground">{t("bkContactHeading")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t("bkContactName")} *</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>{t("bkContactPhone")} *</label>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" className={fieldCls} />
          </div>
        </div>
      </div>

      {/* Note */}
      <div>
        <label className={labelCls}>{t("bkNote")}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={fieldCls} placeholder={t("bkNotePlaceholder")} />
      </div>

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* Submit / confirm (§0f two-tap กันลั่น) */}
      {confirming ? (
        <div className="rounded-lg border border-primary-300 bg-primary-50 p-4 space-y-2">
          <p className="text-sm text-primary-900">{t("bkConfirmPrompt")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {pending ? t("bkSubmitting") : t("bkConfirmYes")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium hover:bg-surface-alt disabled:opacity-60"
            >
              {t("bkConfirmCancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700 sm:w-auto"
        >
          <Ship className="h-4 w-4" /> {t("bkSubmit")}
        </button>
      )}
    </form>
  );
}
