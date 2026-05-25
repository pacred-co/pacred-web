import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowDownToLine,
  ChevronRight,
  Coins,
  Home,
  Sparkles,
  Wallet,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { createClient } from "@/lib/supabase/server";
import {
  listMyAffiliateCommissions,
  getMyCommissionTotals,
  listMyAffiliatePayouts,
  type AffiliateCommissionRow,
  type AffiliatePayoutRow,
  type CommissionTotals,
} from "@/actions/commissions";
import {
  MIN_AFFILIATE_WITHDRAW_THB,
  MAX_AFFILIATE_WITHDRAW_THB,
} from "@/lib/validators/commission";
import { RequestWithdrawClient } from "./request-withdraw-client";

/**
 * G6 — /commissions (customer-side affiliate commission dashboard).
 *
 * The customer-facing entry for the "ลูกค้าตัวแทน" (team-leader / affiliate)
 * commission flow. The legacy equivalent is `member/report-user-sales.php`
 * + `report-user-sales-history.php` + `report-user-sales-add.php`, ported
 * faithfully as the 1:1 transcription at `/sales/*`. This page is the
 * MODERN customer-facing dashboard sitting alongside that transcription:
 *
 *   /sales/*       — faithful 1:1 PCS theme transcription (legacy look)
 *   /commissions/me/* — STAFF-only (interpreter / sales_rep) portal
 *                       using commission_accruals / commission_withdrawals
 *   /commissions   ← THIS PAGE — modern affiliate dashboard using
 *                       sales_commissions + sales_payouts (the 0013 model)
 *
 * The three coexist deliberately — see actions/commissions.ts header
 * for the full rationale.
 *
 * Gating: any signed-in user can VIEW. Non-team_leaders see a friendly
 * "Not on the affiliate program" empty state. We don't 404 because
 * customers may land here via a future marketing link.
 */

// Server Component reads cookies/auth — must be dynamic.
export const dynamic = "force-dynamic";

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

const SOURCE_LABEL_KEY: Record<AffiliateCommissionRow["reference_type"], "refForwarder" | "refOrder"> = {
  forwarder:     "refForwarder",
  service_order: "refOrder",
};

const STATUS_BADGE: Record<AffiliateCommissionRow["status"], string> = {
  unpaid:    "bg-amber-50 text-amber-700 border-amber-200",
  paid:      "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const PAYOUT_BADGE: Record<AffiliatePayoutRow["status"], string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export default async function CommissionsPage() {
  const { user } = await requireAuth();
  const t = await getTranslations("commissions");

  // Pre-flight: is this user a team leader? Done with RLS-scoped read on
  // team_leaders (policy `team_leaders_select_own` from 0013 L217-218).
  // No row = no commissions to ever show → render the empty state.
  const supabase = await createClient();
  const { data: leadersRaw, error: leadersRawErr } = await supabase
    .from("team_leaders")
    .select("id, team_code, commission_pct, is_active")
    .eq("profile_id", user.id);
  if (leadersRawErr) {
    console.error(`[team_leaders list] failed`, { code: leadersRawErr.code, message: leadersRawErr.message });
  }
  const leaders = (leadersRaw ?? []) as {
    id: string; team_code: string; commission_pct: number; is_active: boolean;
  }[];
  const activeLeaders = leaders.filter((l) => l.is_active);
  const isLeader = activeLeaders.length > 0;

  const breadcrumbs = (
    <nav className="flex items-center gap-1.5 text-xs text-muted">
      <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
        <Home className="w-3.5 h-3.5" /> หน้าแรก
      </Link>
      <ChevronRight className="w-3 h-3" />
      <span className="text-foreground font-medium">{t("title")}</span>
    </nav>
  );

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 shrink-0">
          <Coins className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground mt-0.5">{t("title")}</h1>
          <p className="text-xs text-muted mt-0.5 max-w-[60ch]">{t("subtitle")}</p>
        </div>
      </div>
    </div>
  );

  // Empty-state short-circuit — friendly "not enrolled" message.
  if (!isLeader) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-5">
        {breadcrumbs}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          {header}
        </div>
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-8 text-center space-y-3">
          <Sparkles className="mx-auto h-10 w-10 text-primary-500" />
          <h2 className="text-lg font-bold text-foreground">{t("notLeaderTitle")}</h2>
          <p className="text-sm text-muted max-w-md mx-auto">{t("notLeaderBody")}</p>
        </div>
      </main>
    );
  }

  // ── Fetch in parallel: totals + commissions list + payout history ──
  const [totalsRes, listRes, payoutsRes] = await Promise.all([
    getMyCommissionTotals(),
    listMyAffiliateCommissions(),
    listMyAffiliatePayouts(10),
  ]);

  const totals: CommissionTotals =
    totalsRes.ok && totalsRes.data
      ? totalsRes.data
      : { earned_total: 0, pending_total: 0, withdrawn_total: 0, available_for_withdraw: 0, earned_count: 0 };

  const allRows: AffiliateCommissionRow[] =
    listRes.ok && listRes.data ? listRes.data.rows : [];
  const rows = allRows.slice(0, 10);

  const payouts: AffiliatePayoutRow[] =
    payoutsRes.ok && payoutsRes.data ? payoutsRes.data : [];

  const canRequest = totals.available_for_withdraw >= MIN_AFFILIATE_WITHDRAW_THB;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 space-y-5">
      {breadcrumbs}

      {/* Header */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        {header}
      </div>

      {/* 4 stat cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Coins className="w-5 h-5" />}
          color="amber"
          label={t("statEarned")}
          value={thb(totals.earned_total)}
          hint={t("earnedCount", { count: totals.earned_count })}
        />
        <StatCard
          icon={<Wallet className="w-5 h-5" />}
          color="orange"
          label={t("statPending")}
          value={thb(totals.pending_total)}
          hint={t("statPendingHint")}
        />
        <StatCard
          icon={<ArrowDownToLine className="w-5 h-5" />}
          color="green"
          label={t("statWithdrawn")}
          value={thb(totals.withdrawn_total)}
          hint={t("statWithdrawnHint")}
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          color="red"
          label={t("statAvailable")}
          value={thb(totals.available_for_withdraw)}
          hint={t("statAvailableHint", { min: MIN_AFFILIATE_WITHDRAW_THB.toLocaleString() })}
          highlighted
        />
      </section>

      {/* Withdraw CTA — modal trigger lives on the Client Component */}
      <section className="rounded-2xl border-2 border-primary-200 bg-primary-50/40 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary-700">
            {canRequest
              ? t("statAvailable") + " · " + thb(totals.available_for_withdraw)
              : t("requestDisabledMin", { min: MIN_AFFILIATE_WITHDRAW_THB.toLocaleString() })}
          </p>
          <p className="text-xs text-muted mt-1">
            {t("statAvailableHint", { min: MIN_AFFILIATE_WITHDRAW_THB.toLocaleString() })}
          </p>
        </div>
        <RequestWithdrawClient
          available={totals.available_for_withdraw}
          min={MIN_AFFILIATE_WITHDRAW_THB}
          max={MAX_AFFILIATE_WITHDRAW_THB}
          disabled={!canRequest}
        />
      </section>

      {/* Recent commissions */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm">{t("recentTitle")}</h2>
            <p className="text-xs text-muted mt-0.5">{t("recentSubtitle")}</p>
          </div>
          <Link
            href="/sales/report"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
          >
            {t("viewFullReport")}
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">{t("noCommissions")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">{t("colDate")}</th>
                  <th className="px-3 py-2">{t("colSource")}</th>
                  <th className="px-3 py-2 hidden sm:table-cell">{t("colReference")}</th>
                  <th className="px-3 py-2 text-right hidden md:table-cell">{t("colBase")}</th>
                  <th className="px-3 py-2 text-right hidden md:table-cell">{t("colPct")}</th>
                  <th className="px-3 py-2 text-right">{t("colCommission")}</th>
                  <th className="px-3 py-2">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {new Date(r.earned_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-xs">{t(SOURCE_LABEL_KEY[r.reference_type])}</td>
                    <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell">
                      {r.reference_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs hidden md:table-cell">
                      {thb(r.base_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs hidden md:table-cell">
                      {(r.commission_pct * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                      {thb(r.commission_amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${STATUS_BADGE[r.status]}`}>
                        {t(`status.${r.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Withdrawal history */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">{t("payoutHistoryTitle")}</h2>
          <p className="text-xs text-muted mt-0.5">{t("payoutHistorySubtitle")}</p>
        </div>
        {payouts.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">{t("noPayouts")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">{t("payoutColRequested")}</th>
                  <th className="px-3 py-2 text-right">{t("payoutColAmount")}</th>
                  <th className="px-3 py-2 hidden sm:table-cell">{t("payoutColBank")}</th>
                  <th className="px-3 py-2">{t("payoutColStatus")}</th>
                  <th className="px-3 py-2 hidden md:table-cell">{t("payoutColPaidAt")}</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {new Date(p.requested_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                      {thb(p.amount_total)}
                    </td>
                    <td className="px-3 py-2 text-xs hidden sm:table-cell">
                      {p.bank_name}
                      <br />
                      <span className="text-[10px] text-muted font-mono">{p.account_number}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${PAYOUT_BADGE[p.status]}`}>
                        {t(`payoutStatus.${p.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted hidden md:table-cell">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString("th-TH") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

type StatColor = "amber" | "orange" | "green" | "red";

const STAT_BG: Record<StatColor, string> = {
  amber:  "from-amber-50 to-amber-100 border-amber-200 text-amber-700",
  orange: "from-orange-50 to-orange-100 border-orange-200 text-orange-700",
  green:  "from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700",
  red:    "from-primary-50 to-red-100 border-primary-200 text-primary-700",
};

function StatCard({
  icon, color, label, value, hint, highlighted,
}: {
  icon: React.ReactNode;
  color: StatColor;
  label: string;
  value: string;
  hint: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-4 bg-gradient-to-br shadow-sm",
        STAT_BG[color],
        highlighted ? "ring-2 ring-primary-300/50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-white/70 p-1.5">{icon}</div>
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="font-mono text-2xl font-extrabold mt-2 tabular-nums break-all">{value}</p>
      <p className="text-[11px] mt-1 opacity-80">{hint}</p>
    </div>
  );
}
