import { Link } from "@/i18n/navigation";
import { Calculator, ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { ImportEstimateClient } from "./import-estimate-client";

export const dynamic = "force-dynamic";

/**
 * ประเมินราคานำเข้า — customer-facing import price estimator (owner 2026-06-04).
 * A NEW Pacred enhancement: the customer enters dimensions + picks transport
 * mode (รถ/เรือ/แอร์-เร็วๆนี้) + crate (ตีลัง) and sees a LIVE estimate per mode,
 * before the goods are measured at the warehouse. Guidance only — the real
 * price is computed at intake (faithful to the legacy admin-set flow).
 */
export default async function ImportEstimatePage() {
  await requireAuth();
  const t = await getTranslations("importEstimate");

  return (
    <div className="pcs-content-pad w-full px-3 md:px-6 pt-4 pb-24 md:py-6">
      <div className="flex items-center gap-2 text-[11px] text-muted mb-2">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">{t("breadcrumbHome")}</Link>
        <span>/</span>
        <Link href="/service-import" className="hover:text-foreground transition-colors">{t("breadcrumbImport")}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{t("breadcrumbEstimate")}</span>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="flex items-center gap-2 text-[16px] md:text-[26px] font-black tracking-tight text-foreground" role="heading" aria-level={1}>
          <span className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-md shadow-primary-600/25 shrink-0">
            <Calculator className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2} />
          </span>
          {t("title")}
        </p>
        <Link
          href="/service-import"
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-white text-foreground text-[12.5px] font-bold px-3.5 py-2 hover:border-primary-300 hover:text-primary-600 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          {t("backToList")}
        </Link>
      </div>

      <ImportEstimateClient />
    </div>
  );
}
