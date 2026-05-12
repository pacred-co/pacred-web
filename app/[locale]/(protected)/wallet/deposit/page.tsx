import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getWallet } from "@/actions/wallet";
import { DepositForm } from "./deposit-form";

export default async function WalletDepositPage() {
  const t = await getTranslations("wallet");
  const res = await getWallet();
  const balance = res.ok ? (res.data?.balance ?? 0) : 0;

  return (
    <>
      <main className="mx-auto w-full max-w-[800px] px-4 py-12">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("depositTitle")}</h1>
            <p className="mt-1 text-sm text-muted">
              {t("currentBalance")}: <span className="font-mono font-bold text-foreground">฿{balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
          <Link
            href="/wallet/history"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            {t("viewHistory")}
          </Link>
        </div>

        <DepositForm />
      </main>
      <Footer />
    </>
  );
}
