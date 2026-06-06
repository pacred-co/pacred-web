import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  getShopWalletSummary,
  listShopWalletTransactions,
  type ShopWalletTransaction,
} from "@/actions/affiliate-shop-wallet";
import { ShopWalletActions } from "./shop-wallet-actions";

/**
 * Customer shop-wallet (affiliate payouts) screen — D1 customer-backend
 * gap #4 foundation (`docs/research/d1-customer-backend-gap-2026-05-24.md`
 * §5 #4).
 *
 * What ships in this foundation:
 *   - 4 stat cards (balance / lifetime / pending / available)
 *   - history table (last 20 rows)
 *   - "Transfer from Personal" + "Request Withdraw" buttons → opens the
 *     <ShopWalletActions /> modal (client component)
 *   - Mobile-first Tailwind (NOT the legacy PCS theme — this is a
 *     greenfield Pacred screen, not a 1:1 PHP transcription, because the
 *     legacy markup loaded its data via AJAX into a Bootstrap-4 layout
 *     that doesn't map cleanly onto Server Components + the legacy
 *     wallet-shop.php top-of-folder file isn't part of the archive)
 *
 * What is NOT in this foundation (out of scope — see gap doc):
 *   - Admin payout approval flow + queue
 *   - Saved bank-account selector (today's withdraw uses inline fields)
 *   - LINE Notify push on pending transfers
 *   - Pagination beyond 20 rows
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

const KIND_LABEL_KEYS: Record<ShopWalletTransaction["kind"], string> = {
  earn:         "earn",
  refund:       "refund",
  payment:      "payment",
  withdraw:     "withdraw",
  transfer_in:  "transferIn",
  transfer_out: "transferOut",
  adjustment:   "adjustment",
};

const STATUS_BADGE: Record<ShopWalletTransaction["status"], string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};

const INBOUND_KINDS = new Set<ShopWalletTransaction["kind"]>([
  "earn",
  "refund",
  "transfer_in",
]);

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function WalletShopPage() {
  await requireAuth();
  const t = await getTranslations("walletShop");

  const [summaryRes, txnsRes] = await Promise.all([
    getShopWalletSummary(),
    listShopWalletTransactions({ limit: 20 }),
  ]);

  if (!summaryRes.ok) {
    return (
      <main className="p-4 sm:p-6 lg:p-5 space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {t("loadError", { error: summaryRes.error })}
        </div>
      </main>
    );
  }

  const summary = summaryRes.data!;
  const txns = txnsRes.ok ? (txnsRes.data ?? []) : [];

  return (
    <main className="p-4 sm:p-6 lg:p-5 space-y-5 max-w-5xl">
      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          {t("kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </header>

      {/* 4 stat cards — mobile-first grid: 2 cols on phones, 4 cols on sm+ */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t("statBalance")}
          value={thb(summary.balance)}
          tone="primary"
        />
        <StatCard
          label={t("statLifetime")}
          value={thb(summary.lifetime_earned)}
          tone="muted"
        />
        <StatCard
          label={t("statPending")}
          value={thb(summary.pending)}
          tone={summary.pending > 0 ? "warning" : "muted"}
        />
        <StatCard
          label={t("statAvailable")}
          value={thb(summary.available)}
          tone="success"
          subtitle={t("statAvailableHint")}
        />
      </section>

      {/* Action buttons — open the Transfer / Withdraw modal */}
      <section>
        <ShopWalletActions
          available={summary.available}
          mainAvailable={summary.available} /* re-used as a hint; server re-checks */
          t={{
            transferFromPersonal:        t("transferFromPersonal"),
            requestWithdraw:             t("requestWithdraw"),
            transferModalTitle:          t("transferModalTitle"),
            transferAmountLabel:         t("transferAmountLabel"),
            transferAmountHint:          t("transferAmountHint"),
            noteLabel:                   t("noteLabel"),
            transferSubmit:              t("transferSubmit"),
            transferSuccess:             t("transferSuccess"),
            withdrawModalTitle:          t("withdrawModalTitle"),
            withdrawAmountLabel:         t("withdrawAmountLabel"),
            withdrawMaxHint:             t("withdrawMaxHint", { max: thb(summary.available) }),
            withdrawBankLabel:           t("withdrawBankLabel"),
            withdrawBankPlaceholder:     t("withdrawBankPlaceholder"),
            withdrawAccountNameLabel:    t("withdrawAccountNameLabel"),
            withdrawAccountNumberLabel:  t("withdrawAccountNumberLabel"),
            withdrawSubmit:              t("withdrawSubmit"),
            withdrawSuccess:             t("withdrawSuccess"),
            cancel:                      t("cancel"),
            close:                       t("close"),
            submitting:                  t("submitting"),
            amountInvalid:               t("amountInvalid"),
            amountExceedsAvailable:      t("amountExceedsAvailable"),
            genericError:                t("genericError"),
          }}
        />
      </section>

      {/* Transactions table — mobile-first card list on xs, table on sm+ */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">{t("recentTitle")}</h2>
          <span className="text-xs text-muted">{t("recentLimitHint", { n: 20 })}</span>
        </div>

        {txns.length === 0 ? (
          <p className="p-5 text-center text-sm text-muted">{t("noTransactions")}</p>
        ) : (
          <>
            {/* Mobile card list */}
            <ul className="sm:hidden divide-y divide-border">
              {txns.map((row) => {
                const inbound = INBOUND_KINDS.has(row.kind);
                const amt = Number(row.amount);
                return (
                  <li key={row.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {t(`kind.${KIND_LABEL_KEYS[row.kind]}`)}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {new Date(row.created_at).toLocaleString("th-TH")}
                      </div>
                      <div className="mt-1">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[row.status]}`}>
                          {t(`status.${row.status}`)}
                        </span>
                      </div>
                      {row.note && (
                        <div className="text-xs text-muted mt-1 truncate">{row.note}</div>
                      )}
                    </div>
                    <div className={`shrink-0 font-mono text-sm font-bold ${inbound ? "text-green-700" : "text-red-700"}`}>
                      {inbound ? "+" : ""}{thb(amt)}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">{t("colDate")}</th>
                    <th className="px-3 py-2">{t("colKind")}</th>
                    <th className="px-3 py-2">{t("colStatus")}</th>
                    <th className="px-3 py-2 text-right">{t("colAmount")}</th>
                    <th className="px-3 py-2">{t("colNote")}</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((row) => {
                    const inbound = INBOUND_KINDS.has(row.kind);
                    const amt = Number(row.amount);
                    return (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-2 text-xs text-muted">
                          {new Date(row.created_at).toLocaleDateString("th-TH")}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {t(`kind.${KIND_LABEL_KEYS[row.kind]}`)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[row.status]}`}>
                            {t(`status.${row.status}`)}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${inbound ? "text-green-700" : "text-red-700"}`}>
                          {inbound ? "+" : ""}{thb(amt)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted max-w-[18rem] truncate">
                          {row.note ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
  subtitle,
}: {
  label:     string;
  value:     string;
  tone:      "primary" | "success" | "warning" | "muted";
  subtitle?: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    primary: "border-primary-200 bg-primary-50/40 text-primary-700",
    success: "border-green-200   bg-green-50/40   text-green-700",
    warning: "border-amber-200   bg-amber-50/40   text-amber-700",
    muted:   "border-border      bg-surface-alt/30 text-foreground",
  };
  return (
    <div className={`rounded-2xl border-2 p-3 sm:p-4 ${toneClasses[tone]}`}>
      <p className="text-[11px] sm:text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg sm:text-2xl font-extrabold font-mono break-words">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-[10px] sm:text-[11px] text-muted">{subtitle}</p>
      )}
    </div>
  );
}
