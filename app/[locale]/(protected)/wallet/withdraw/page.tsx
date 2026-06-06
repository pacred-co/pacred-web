import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getWallet } from "@/actions/wallet";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { WithdrawForm } from "./withdraw-form";
import { ArrowDownToLine, ChevronRight, Home, Wallet as WalletIcon } from "lucide-react";

export default async function WalletWithdrawPage() {
  const t = await getTranslations("wallet");
  const [walletRes, userData] = await Promise.all([
    getWallet(),
    getCurrentUserWithProfile(),
  ]);
  const balance = walletRes.ok ? (walletRes.data?.balance ?? 0) : 0;
  const profile = userData?.profile;
  const fullName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.company_name || t("defaultCustomerName")
    : t("defaultCustomerName");

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/wallet/history" className="hover:text-primary-600">{t("breadcrumbWallet")}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{t("withdrawTitle")}</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                <ArrowDownToLine className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("withdrawPageTitle")}</h1>
                <p className="text-xs text-muted mt-0.5">{t("withdrawPageSubtitle")}</p>
              </div>
            </div>
            <Link
              href="/wallet/history"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ← {t("backToWallet")}
            </Link>
          </div>
        </div>

        {/* Wallet balance hero (orange/amber gradient — same as deposit/payment-add) */}
        <div className="rounded-2xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5 shadow-md overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold opacity-90">{fullName}</p>
              <p className="text-xs opacity-80 mt-0.5">{t("withdrawableBalanceLabel")}</p>
              <p className="font-mono text-2xl sm:text-3xl font-black mt-1 leading-none">
                {balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="shrink-0 opacity-70">
              <WalletIcon className="w-14 h-14" />
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-white/20">
            <div className="h-full w-full rounded-full bg-white/80" />
          </div>
        </div>

        <WithdrawForm balance={balance} />

        {/* Terms (PCS-style numbered list) */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h3 className="font-bold text-amber-800 flex items-center gap-2">
            ⚠️ {t("termsTitle")}
          </h3>
          <ol className="mt-3 text-sm text-amber-900 space-y-1.5 list-decimal pl-5">
            <li>{t("term1")}</li>
            <li>{t.rich("term2", { b: (chunks) => <b>{chunks}</b> })}</li>
            <li>{t.rich("term3", { b: (chunks) => <b>{chunks}</b> })}</li>
            <li>{t.rich("term4", { b: (chunks) => <b>{chunks}</b> })}</li>
            <li>{t.rich("term5", { b: (chunks) => <b>{chunks}</b> })}</li>
            <li>{t("term6")}</li>
          </ol>
        </div>
      </main>
    </>
  );
}
