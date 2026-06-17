"use client";

/**
 * <ForwarderRateMissingFallback> — the rateMissing warning box + inline manual-
 * rate entry on the forwarder detail page (owner "การดึงเรทราคามาสรุป" Part 2).
 *
 * WHY: a forwarder row whose customer has no rate card for its
 * (warehouse/transport/product) tuple resolves to ฿0, and the dimension-edit
 * save (adminUpdateForwarderDimensions) REFUSES the write with "ไม่พบเรทราคา…".
 * The read-only detail page used to surface neither the warning NOR a quick way
 * to fix it — staff only discovered the gap when a save bounced. This component:
 *
 *   (a) shows a warning box (the parent computes `missing` via the SAME resolver
 *       inputs the save uses — lib/forwarder/live-rate.ts previewForwarderRate-
 *       Missing — so the badge and the save never drift), and
 *   (b) an inline manual-override input (ขาย = CBM rate, กิโล = KG rate) that
 *       submits via the EXISTING adminUpdateForwarderDimensions through its
 *       customRate override path (customRate='1' + customRateKg + customRateCbm →
 *       tb_forwarder.customrate/customratekg/customratecbm). This is the legacy
 *       manual-override path — NOT a new pricing writer.
 *
 * After save the action ALREADY recomputes the grand total (ftotalprice + adders
 * − discount) and revalidates the detail path, so the TOP totals
 * (ราคารวม / priceAllUser in forwarder-import-items-table.tsx) re-render
 * automatically. We just router.refresh() to pull the new server render.
 *
 * MONEY-SAFETY:
 *   · ONE money writer — routes through the existing adminUpdateForwarderDimensions.
 *   · A manual override is NEVER doc-tier discounted (resolve-rate.ts sets
 *     docEligible=false when manualOverride is set — unchanged).
 *   · confirm-before-mutate via useConfirmDialogs (§0f).
 *   · Role-gating is enforced server-side by the action (ops/accounting/super/
 *     warehouse) exactly as the /edit form's save.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Save } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminUpdateForwarderDimensions } from "@/actions/admin/forwarders-edit";

/**
 * The row's CURRENT dimensions — adminUpdateForwarderDimensions requires
 * weight/W/L/H/productType/refPrice on every call, so we echo back exactly what
 * the row already has (we are NOT editing dimensions, only adding the override).
 * `volumeCbm` is sent so the action keeps the row's stored CBM (it wins over the
 * W×L×H derivation), avoiding any accidental re-derivation drift.
 */
export type ForwarderRateFallbackDims = {
  fId: number;
  weight: number;
  width: number;
  length: number;
  height: number;
  volumeCbm: number;
  productType: "1" | "2" | "3" | "4";
  refPrice: "1" | "2";
};

export function ForwarderRateMissingFallback({
  customerId,
  dims,
}: {
  /** tb_users.userID — for the "set rate on profile" link. */
  customerId: string;
  dims: ForwarderRateFallbackDims;
}) {
  const t = useTranslations("forwarderInlineRate");
  const router = useRouter();
  const { confirm, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();
  const [kg, setKg] = useState("");
  const [cbm, setCbm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function parseRate(raw: string): number {
    const n = parseFloat(raw.trim().replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function save() {
    setError(null);
    setSuccess(null);
    const kgRate = parseRate(kg);
    const cbmRate = parseRate(cbm);
    // At least one positive rate — both 0 would just re-trigger rateMissing.
    if (kgRate <= 0 && cbmRate <= 0) {
      setError(t("invalid"));
      return;
    }
    start(async () => {
      const ok = await confirm(
        t("confirm", {
          kg: kgRate.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          cbm: cbmRate.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        }),
      );
      if (!ok) return;
      const res = await adminUpdateForwarderDimensions({
        // String(fId) — the action resolves a numeric fNo → tb_forwarder.id.
        fNo: String(dims.fId),
        // Echo the row's current dimensions (we only add the override).
        weightKg: dims.weight,
        widthCm: dims.width,
        lengthCm: dims.length,
        heightCm: dims.height,
        volumeCbm: dims.volumeCbm,
        productType: dims.productType,
        refPrice: dims.refPrice,
        // The legacy manual-override path (customRate switch ON).
        customRate: "1",
        customRateKg: kgRate,
        customRateCbm: cbmRate,
        items: [],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(t("saved"));
      router.refresh();
      setTimeout(() => setSuccess(null), 6000);
    });
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/70 dark:bg-surface-alt/40 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">{t("missingTitle")}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-amber-700">{t("missingBody")}</p>
          <Link
            href={`/admin/customers/${customerId}`}
            className="mt-1 inline-block text-[12px] font-medium text-primary-600 hover:underline"
          >
            {t("openProfile")} →
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[12px] text-red-700">⚠ {error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 text-[12px] text-green-700">✓ {success}</div>
      )}

      <div className="rounded-lg border border-amber-200 bg-white dark:bg-surface p-3 space-y-2">
        <p className="text-[12px] font-medium text-foreground">{t("quickFillTitle")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[11px] text-muted">{t("cbmLabel")}</span>
            <input
              type="text"
              inputMode="decimal"
              value={cbm}
              disabled={pending}
              onChange={(e) => setCbm(e.target.value)}
              placeholder="0.00"
              className="mt-0.5 w-32 rounded-md border border-border px-2.5 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-muted">{t("kgLabel")}</span>
            <input
              type="text"
              inputMode="decimal"
              value={kg}
              disabled={pending}
              onChange={(e) => setKg(e.target.value)}
              placeholder="0.00"
              className="mt-0.5 w-32 rounded-md border border-border px-2.5 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
            />
          </label>
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            <Save className="size-4" /> {pending ? t("saving") : t("saveBtn")}
          </Button>
        </div>
        <p className="text-[11px] text-muted">{t("quickFillHint")}</p>
      </div>
      {dialogs}
    </div>
  );
}
