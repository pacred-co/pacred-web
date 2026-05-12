import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getWallet, listWalletTransactions, type WalletTransaction } from "@/actions/wallet";

const BUCKET_BADGE = {
  main:     "bg-primary-50 text-primary-700 border-primary-200",
  cashback: "bg-orange-50 text-orange-700 border-orange-200",
  credit:   "bg-blue-50 text-blue-700 border-blue-200",
} as const;

const STATUS_BADGE = {
  pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
} as const;

export default async function WalletHistoryPage() {
  const t = await getTranslations("wallet");
  const [walletRes, txRes] = await Promise.all([
    getWallet(),
    listWalletTransactions(100),
  ]);
  const balance = walletRes.ok ? walletRes.data : { balance: 0, cashback_balance: 0, credit_balance: 0 };
  const transactions = (txRes.ok ? txRes.data : []) as WalletTransaction[];

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{t("historyTitle")}</h1>
        </div>

        {/* Balances */}
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <BalanceCard label={t("balanceMain")}     value={balance?.balance ?? 0}          color="primary" />
          <BalanceCard label={t("balanceCashback")} value={balance?.cashback_balance ?? 0} color="orange" />
          <BalanceCard label={t("balanceCredit")}   value={balance?.credit_balance ?? 0}   color="blue" />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Link href="/wallet/deposit"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
            + {t("depositTitle")}
          </Link>
          <Link href="/wallet/withdraw"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
            {t("withdrawTitle")}
          </Link>
        </div>

        {/* Transactions */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {transactions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">{t("noTransactions")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("colDate")}</th>
                  <th className="px-4 py-3 font-semibold">{t("colKind")}</th>
                  <th className="px-4 py-3 font-semibold">{t("colBucket")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("colAmount")}</th>
                  <th className="px-4 py-3 font-semibold">{t("colStatus")}</th>
                  <th className="px-4 py-3 font-semibold">{t("colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-border">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3">{t(`kind.${tx.kind}` as Parameters<typeof t>[0])}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${BUCKET_BADGE[tx.bucket]}`}>
                        {t(`bucket.${tx.bucket}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${tx.amount < 0 ? "text-red-600" : "text-green-700"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[tx.status]}`}>
                        {t(`status.${tx.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {tx.note ?? (tx.reference_id ? `ref: ${tx.reference_id}` : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function BalanceCard({ label, value, color }: { label: string; value: number; color: "primary" | "orange" | "blue" }) {
  const bg = {
    primary: "from-primary-500/10 to-primary-500/0 border-primary-500/20",
    orange:  "from-orange-500/10 to-orange-500/0 border-orange-500/20",
    blue:    "from-blue-500/10 to-blue-500/0 border-blue-500/20",
  }[color];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${bg} p-4`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono text-foreground">
        ฿{Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}
