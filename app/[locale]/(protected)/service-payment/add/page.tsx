import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentYuanRate } from "@/actions/payment";
import { getWallet } from "@/actions/wallet";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { YuanPaymentForm } from "../yuan-payment-form";
import type { TaxDocDefaults } from "../../cart/cart-tax-doc-pref";
import { ArrowLeftRight, ChevronRight, Home } from "lucide-react";

export default async function ServicePaymentAddPage() {
  const t = await getTranslations("payment");
  const [rateRes, walletRes, userData] = await Promise.all([
    getCurrentYuanRate(),
    getWallet(),
    getCurrentUserWithProfile(),
  ]);
  const balance = walletRes.ok ? (walletRes.data?.balance ?? 0) : 0;
  const profile = userData?.profile;
  const fullName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.company_name || "—"
    : "—";

  // GAP 3 (2026-06-12) — tax-doc picker defaults (juristic id/name/address from
  // tb_users + tb_corporate), mirroring the cart page. Only built when we have a
  // member_code; otherwise the picker is simply not shown.
  let taxDocDefaults: TaxDocDefaults | undefined;
  const memberCode = profile?.member_code;
  if (memberCode) {
    const admin = createAdminClient();
    const [userRowRes, juristicRes] = await Promise.all([
      admin.from("tb_users").select("userCompany").eq("userID", memberCode)
        .maybeSingle<{ userCompany: string | null }>(),
      admin.from("tb_corporate").select("corporatenumber, corporatename, corporateaddress")
        .eq("userid", memberCode)
        .maybeSingle<{ corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null }>(),
    ]);
    if (userRowRes.error) console.error(`[service-payment/add tb_users]`, { code: userRowRes.error.code, message: userRowRes.error.message });
    if (juristicRes.error) console.error(`[service-payment/add tb_corporate]`, { code: juristicRes.error.code, message: juristicRes.error.message });
    taxDocDefaults = {
      isJuristic: userRowRes.data?.userCompany === "1",
      taxId: juristicRes.data?.corporatenumber ?? "",
      companyName: juristicRes.data?.corporatename ?? "",
      companyAddress: juristicRes.data?.corporateaddress ?? "",
    };
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/service-payment" className="hover:text-primary-600">{t("breadcrumbList")}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{t("breadcrumbAdd")}</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600">
                <ArrowLeftRight className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("addPageTitle")}</h1>
                <p className="text-xs text-muted mt-0.5">{t("addPageSubtitle")}</p>
              </div>
            </div>
            <Link
              href="/service-payment"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              {t("backToListArrow")}
            </Link>
          </div>
        </div>

        <YuanPaymentForm
          rate={rateRes.rate}
          rateUpdatedAt={rateRes.updated_at}
          walletBalance={balance}
          customerName={fullName}
          taxDocDefaults={taxDocDefaults}
        />
      </main>
    </>
  );
}
