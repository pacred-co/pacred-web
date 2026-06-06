import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getWallet, listWalletTransactions, type WalletTransaction } from "@/actions/wallet";
import { getMyCredit } from "@/actions/credit";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { Wallet as WalletIcon, Plus, History, Banknote, CreditCard, ArrowDownToLine, ChevronRight, Home } from "lucide-react";
import { CreditLinePanel } from "../credit-panel";
import { CancelPendingButton } from "./cancel-pending-button";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

// ADR-0018 §D-3 #1: distinguish a rebuilt `wallet_transactions` row (UUID id)
// from a legacy `tb_wallet_hs` row (numeric id). Only UUID rows support the
// rebuilt-table self-cancel action (see the cancel button below).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUCKET_BADGE: Record<WalletTransaction["bucket"], string> = {
  main:     "bg-primary-50 text-primary-700 border-primary-200",
  cashback: "bg-orange-50 text-orange-700 border-orange-200",
  credit:   "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_BADGE: Record<WalletTransaction["status"], string> = {
  pending:   "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed:    "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

type TabKey = "all" | "deposit" | "payment" | "withdraw";
const TAB_DEFS: { key: TabKey; labelKey: string; icon: React.ReactNode; kinds: string[] | null }[] = [
  { key: "all",      labelKey: "tabAll",      icon: <History className="w-4 h-4" />,           kinds: null },
  { key: "deposit",  labelKey: "tabDeposit",  icon: <Banknote className="w-4 h-4" />,          kinds: ["deposit"] },
  { key: "payment",  labelKey: "tabPayment",  icon: <CreditCard className="w-4 h-4" />,        kinds: ["order_payment", "import_payment", "yuan_payment", "order_top_up", "import_top_up"] },
  { key: "withdraw", labelKey: "tabWithdraw", icon: <ArrowDownToLine className="w-4 h-4" />,   kinds: ["withdraw"] },
];

export default async function WalletHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations("wallet");
  const [walletRes, txRes, userData, creditRes] = await Promise.all([
    getWallet(),
    listWalletTransactions(200),
    getCurrentUserWithProfile(),
    getMyCredit(),
  ]);
  const balance = walletRes.ok ? walletRes.data : { balance: 0, cashback_balance: 0, credit_balance: 0 };
  const allTx = (txRes.ok ? txRes.data : []) as WalletTransaction[];
  const profile = userData?.profile;
  // U4-2 — light up the credit panel only when the customer is enrolled.
  const credit = creditRes.ok ? creditRes.data : null;
  const creditEnrolled = !!credit && Number(credit.credit_limit_thb) > 0;
  const fullName = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.company_name || t("customerFallbackName")
    : t("customerFallbackName");

  const activeTab = (sp.q && TAB_DEFS.some((t) => t.key === sp.q)) ? (sp.q as TabKey) : "all";
  const activeTabDef = TAB_DEFS.find((t) => t.key === activeTab)!;
  const txs = activeTabDef.kinds === null ? allTx : allTx.filter((t) => activeTabDef.kinds!.includes(t.kind));

  const counts = TAB_DEFS.reduce<Record<TabKey, number>>((acc, tab) => {
    acc[tab.key] = tab.kinds === null ? allTx.length : allTx.filter((t) => tab.kinds!.includes(t.kind)).length;
    return acc;
  }, {} as Record<TabKey, number>);

  // PERF (2026-06-03): paginate the displayed rows (50/page). Tab counts above
  // stay full-set-correct (computed over allTx); only the rendered rows slice.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageTxs = txs.slice(offset, offset + DEFAULT_PAGE_SIZE);

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{t("breadcrumbWallet")}</span>
        </nav>

        {/* Wallet hero card (PCS-style orange/amber gradient, centered) */}
        <div className="mx-auto max-w-2xl rounded-2xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5 shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{fullName}</p>
              <p className="text-xs opacity-85 mt-0.5">{t("walletBalanceLabel")}</p>
              <p className="font-mono text-2xl sm:text-3xl font-black mt-2 leading-none">
                {Number(balance?.balance ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="shrink-0 opacity-80">
              <WalletIcon className="w-16 h-16" />
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-white/20">
            <div className="h-full w-full rounded-full bg-white/80" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/wallet/deposit"
              className="inline-flex items-center gap-1.5 rounded-full bg-white text-amber-700 px-5 py-2 text-sm font-bold hover:bg-white/95 shadow-sm"
            >
              <Plus className="w-4 h-4" /> {t("topUpWallet")}
            </Link>
            <Link
              href="/wallet/withdraw"
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-white/40 text-white px-4 py-1.5 text-xs font-bold hover:bg-white/15"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" /> {t("withdrawAction")}
            </Link>
          </div>
        </div>

        {/* Cashback side card (credit moved below to the live panel) */}
        <div className={`grid ${creditEnrolled ? "sm:grid-cols-1" : "sm:grid-cols-2"} gap-3`}>
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-orange-50/30 p-4">
            <p className="text-xs font-semibold text-orange-700">Cashback</p>
            <p className="mt-1 text-xl font-bold font-mono text-orange-700">
              ฿{Number(balance?.cashback_balance ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-muted mt-1">{t("cashbackHint")}</p>
          </div>
          {!creditEnrolled && (
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-50/30 p-4">
              <p className="text-xs font-semibold text-blue-700">{t("balanceCredit")}</p>
              <p className="mt-1 text-xl font-bold font-mono text-blue-700">
                ฿{Number(balance?.credit_balance ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted mt-1">
                {t("creditNotEnrolledHint")}
              </p>
            </div>
          )}
        </div>

        {/* U4-2 — live credit-line panel (limit / outstanding / pay) */}
        {creditEnrolled && credit && (
          <CreditLinePanel credit={credit} walletBalance={Number(balance?.balance ?? 0)} />
        )}

        {/* Transaction tabs */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-border flex flex-wrap gap-x-1 overflow-x-auto">
            {TAB_DEFS.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = counts[tab.key];
              const href = tab.key === "all" ? "/wallet/history" : `/wallet/history?q=${tab.key}`;
              return (
                <Link
                  key={tab.key}
                  href={href}
                  className={`inline-flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? "border-primary-500 text-primary-600"
                      : "border-transparent text-muted hover:text-foreground hover:border-border"
                  }`}
                >
                  {tab.icon}
                  <span>{t(tab.labelKey)}</span>
                  {count > 0 && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isActive ? "bg-primary-100 text-primary-700" : "bg-surface-alt text-muted"
                    }`}>
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {txs.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="text-2xl" aria-hidden>👛</div>
              <p className="text-sm font-medium text-foreground">
                {activeTab === "deposit"  ? t("emptyDepositTitle")
                : activeTab === "withdraw" ? t("emptyWithdrawTitle")
                : activeTab === "payment"  ? t("emptyPaymentTitle")
                : t("emptyAllTitle")}
              </p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                {activeTab === "deposit"
                  ? t("emptyDepositHint")
                : activeTab === "withdraw"
                  ? t("emptyWithdrawHint")
                : activeTab === "payment"
                  ? t("emptyPaymentHint")
                  : t("emptyAllHint")}
              </p>
              {(activeTab === "deposit" || activeTab === "all") && (
                <Link
                  href="/wallet/deposit"
                  className="mt-2 inline-flex rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600 shadow-sm"
                >
                  {t("topUpShort")}
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-alt/30 text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 w-[140px]">{t("thDate")}</th>
                    <th className="px-4 py-3">{t("thItem")}</th>
                    <th className="px-4 py-3 w-[110px]">{t("thBucket")}</th>
                    <th className="px-4 py-3 text-right w-[140px]">{t("thAmount")}</th>
                    <th className="px-4 py-3 w-[130px]">{t("thStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageTxs.map((tx) => {
                    const created = new Date(tx.created_at);
                    const isPositive = tx.amount >= 0;
                    return (
                      <tr key={tx.id} className="hover:bg-surface-alt/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap align-top">
                          <div>{created.toLocaleDateString("th-TH")}</div>
                          <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} {t("timeSuffix")}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-foreground">{t.has(`kind.${tx.kind}`) ? t(`kind.${tx.kind}`) : tx.kind}</p>
                          {tx.note && <p className="mt-0.5 text-xs text-muted line-clamp-2">{tx.note}</p>}
                          {!tx.note && tx.reference_id && (
                            <p className="mt-0.5 text-[10px] text-muted font-mono">ref: {tx.reference_id}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${BUCKET_BADGE[tx.bucket]}`}>
                            {t(`bucket.${tx.bucket}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono align-top">
                          <span className={`text-sm font-bold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                            {isPositive ? "+" : ""}{Number(tx.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[tx.status]}`}>
                            {t(`status.${tx.status}`)}
                          </span>
                          {/* gap-customer H-3: self-cancel pending deposit/withdraw — no need to call admin.
                              ADR-0018 §D-3 #1 (2026-05-30): the ledger now reads LEGACY tb_wallet_hs whose
                              ids are NUMERIC, while customerCancelPendingWalletTx (rebuilt wallet_transactions,
                              a separate P0-7 write lane) still validates `z.string().uuid()`. Only render the
                              self-cancel for genuine UUID rows so a legacy-row click can't fail validation.
                              The tb_wallet_hs self-cancel is the P0-7 lane's job (not this read repoint). */}
                          {tx.status === "pending" && (tx.kind === "deposit" || tx.kind === "withdraw") && UUID_RE.test(tx.id) && (
                            <CancelPendingButton txId={tx.id} kind={tx.kind} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination
                page={page}
                pageSize={DEFAULT_PAGE_SIZE}
                total={txs.length}
                basePath="/wallet/history"
                params={{ q: sp.q }}
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
