import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getCurrentYuanRate } from "@/actions/payment";
import { getWallet } from "@/actions/wallet";
import { YuanPaymentForm } from "../yuan-payment-form";

export default async function ServicePaymentAddPage() {
  const t = await getTranslations("payment");
  const [rateRes, walletRes] = await Promise.all([
    getCurrentYuanRate(),
    getWallet(),
  ]);
  const balance = walletRes.ok ? (walletRes.data?.balance ?? 0) : 0;

  return (
    <>
      <main className="mx-auto w-full max-w-[800px] px-4 py-12">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("addTitle")}</h1>
          </div>
          <Link
            href="/service-payment"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            ← {t("backToList")}
          </Link>
        </div>

        <YuanPaymentForm rate={rateRes.rate} rateUpdatedAt={rateRes.updated_at} walletBalance={balance} />
      </main>
      <Footer />
    </>
  );
}
