import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { DashboardBanners } from "@/components/dashboard-banners";
import { PcsLaunchpadHeader } from "@/components/sections/pcs-launchpad-header";
import { PcsWalletCard } from "@/components/sections/pcs-wallet-card";
import { PcsSalesRepCard } from "@/components/sections/pcs-sales-rep-card";
import { PcsIconGrid } from "@/components/sections/pcs-icon-grid";

/**
 * Customer post-login home — the PCS launchpad.
 *
 * D1 / ADR-0017 Phase B: rebuilt as a faithful port of the legacy PCS Cargo
 * `member/menu.php` dashboard so the ~8,898 migrated customers need zero
 * retraining. Legacy launchpad (gap doc `docs/research/d1-fidelity-customer.md`
 * §1) is, top → bottom:
 *
 *   1. red gradient header band — avatar + name + PR#### + 2 corner icons
 *   2. white wallet card overlapping the band — animated balance counter
 *   3. sales-rep card — round photo, "เซลล์ <name>", tappable phone
 *   4. the 9-icon launchpad grid (3×3)
 *
 * Pacred's prior stats / banners / recent-activity lists are kept but
 * DEMOTED to a clearly-secondary section appended below the grid (the gap
 * doc marks them 🟢 Pacred-only — acceptable as a secondary row, must not
 * replace the grid).
 */

const STATUS_BADGE_F: Record<string, string> = {
  pending_payment:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  shipped_china:     "bg-blue-50 text-blue-700 border-blue-200",
  in_transit:        "bg-indigo-50 text-indigo-700 border-indigo-200",
  arrived_thailand:  "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery:  "bg-orange-50 text-orange-700 border-orange-200",
  delivered:         "bg-green-50 text-green-700 border-green-200",
  cancelled:         "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_BADGE_SO: Record<string, string> = {
  pending:               "bg-gray-50 text-gray-700 border-gray-200",
  awaiting_payment:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  ordered:               "bg-blue-50 text-blue-700 border-blue-200",
  awaiting_chn_dispatch: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed:             "bg-green-50 text-green-700 border-green-200",
  cancelled:             "bg-red-50 text-red-700 border-red-200",
};

export default async function DashboardPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const t = await getTranslations("dashboard");
  const supabase = await createClient();

  // Parallel fetch every dashboard stat in one round-trip
  const [
    walletRes,
    cartCountRes,
    pendingOrderCountRes,
    pendingForwarderCountRes,
    pendingPaymentCountRes,
    recentForwardersRes,
    recentOrdersRes,
  ] = await Promise.all([
    supabase.from("wallet").select("balance").eq("profile_id", profile.id).maybeSingle<{
      balance: number;
    }>(),
    supabase.from("cart_items").select("id", { count: "exact", head: true }).eq("profile_id", profile.id),
    supabase.from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .in("status", ["pending", "awaiting_payment"]),
    supabase.from("forwarders")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .eq("status", "pending_payment"),
    supabase.from("yuan_payments")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .in("status", ["pending", "processing"]),
    supabase.from("forwarders")
      .select("id, f_no, status, weight_kg, volume_cbm, total_price, created_at, tracking_th")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("service_orders")
      .select("id, h_no, status, title, item_count, total_thb, payment_due_at, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const balance = Number(walletRes.data?.balance ?? 0);
  const displayName = profile.first_name
    ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`
    : profile.company_name ?? t("fallbackName");

  return (
    <>
      <main className="mx-auto w-full max-w-[640px] pb-10">
        {/* ── Legacy PCS launchpad — the faithful primary surface ── */}
        <PcsLaunchpadHeader
          displayName={displayName}
          memberCode={profile.member_code}
          avatarUrl={profile.avatar_url}
        />
        <PcsWalletCard balance={balance} />
        <div className="mt-4">
          <PcsSalesRepCard profileId={profile.id} />
        </div>
        <div className="mt-5">
          <PcsIconGrid />
        </div>

        {/* ── Pacred-only secondary section (demoted below the grid) ── */}
        <div className="mt-8 space-y-5 px-4">
          {/* Marketing banners (admin-managed via dashboard_banners table) */}
          <DashboardBanners />

          {/* Stats row — quick counts, secondary to the icon grid */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat
              href="/service-order/pending"
              label={t("statOrdersPending")}
              value={String(pendingOrderCountRes.count ?? 0)}
              badge={cartCountRes.count ?? 0}
            />
            <MiniStat
              href="/service-import/pending"
              label={t("statForwardersPending")}
              value={String(pendingForwarderCountRes.count ?? 0)}
            />
            <MiniStat
              href="/service-payment"
              label={t("quickPayment")}
              value={String(pendingPaymentCountRes.count ?? 0)}
            />
            <MiniStat
              href="/wallet/history"
              label={t("statBalance")}
              value={`฿${balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            />
          </section>

          {/* Recent activity lists */}
          <section className="grid gap-4 lg:grid-cols-2">
            {/* Recent shopping orders */}
            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-bold">{t("recentOrders")}</h2>
                <Link href="/service-order" className="text-xs text-primary-500 hover:underline">{t("viewAll")}</Link>
              </div>
              {!recentOrdersRes.data?.length ? (
                <div className="p-8 text-center text-sm text-muted">
                  {t("noRecentOrders")}
                  <div className="mt-3">
                    <Link href="/service-order/add" className="inline-block rounded-lg bg-primary-500 px-3 py-1.5 text-xs text-white">+ {t("quickShop")}</Link>
                  </div>
                </div>
              ) : (
                <ul>
                  {recentOrdersRes.data.map((o) => (
                    <li key={o.id} className="border-t border-border px-5 py-3 first:border-t-0 hover:bg-surface-alt/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-primary-600">{o.h_no}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_SO[o.status]}`}>
                              {t(`status.${o.status}` as Parameters<typeof t>[0])}
                            </span>
                          </div>
                          <p className="truncate text-sm text-foreground">{o.title ?? "—"}</p>
                          <p className="text-xs text-muted">
                            {o.item_count} {t("items")} · {new Date(o.created_at).toLocaleDateString("th-TH")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-bold">฿{Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                          {o.status === "awaiting_payment" && o.payment_due_at && (
                            <p className="text-[10px] text-yellow-700">
                              {t("payBy", { date: new Date(o.payment_due_at).toLocaleDateString("th-TH") })}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent forwarders */}
            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-bold">{t("recentForwarders")}</h2>
                <Link href="/service-import" className="text-xs text-primary-500 hover:underline">{t("viewAll")}</Link>
              </div>
              {!recentForwardersRes.data?.length ? (
                <div className="p-8 text-center text-sm text-muted">
                  {t("noRecentForwarders")}
                  <div className="mt-3">
                    <Link href="/service-import/add" className="inline-block rounded-lg bg-primary-500 px-3 py-1.5 text-xs text-white">+ {t("quickImport")}</Link>
                  </div>
                </div>
              ) : (
                <ul>
                  {recentForwardersRes.data.map((f) => (
                    <li key={f.id} className="border-t border-border px-5 py-3 first:border-t-0 hover:bg-surface-alt/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-primary-600">{f.f_no}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_F[f.status]}`}>
                              {t(`fstatus.${f.status}` as Parameters<typeof t>[0])}
                            </span>
                          </div>
                          <p className="text-xs text-muted">
                            {Number(f.weight_kg).toFixed(2)} kg · {Number(f.volume_cbm).toFixed(3)} cbm · {new Date(f.created_at).toLocaleDateString("th-TH")}
                          </p>
                          {f.tracking_th && <p className="text-[10px] text-muted">TH: {f.tracking_th}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-bold">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

/** Compact stat tile for the demoted secondary section — small number,
 *  label, optional cart badge. Deliberately understated so it does not
 *  compete with the legacy 9-icon launchpad above it. */
function MiniStat({
  href, label, value, badge,
}: {
  href: string;
  label: string;
  value: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:bg-surface"
    >
      <div className="flex items-center gap-1.5">
        <p className="font-mono text-xl font-bold text-foreground">{value}</p>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Link>
  );
}
