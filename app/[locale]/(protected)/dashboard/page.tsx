import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { DashboardBanners } from "@/components/dashboard-banners";
import { PcsLaunchpadHeader } from "@/components/sections/pcs-launchpad-header";
import { PcsWalletCard } from "@/components/sections/pcs-wallet-card";
import { PcsSalesRepCard } from "@/components/sections/pcs-sales-rep-card";
import { PcsIconGrid } from "@/components/sections/pcs-icon-grid";
import { legacyOrderStatusThai, legacyForwarderStatusThai } from "@/lib/legacy-status-map";

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

// Badge colours keyed by the legacy status codes — tb_forwarder.fstatus '1'-'7'
// (D1 Phase-B Wave 2: the dashboard reads the ported tb_* schema directly).
const STATUS_BADGE_F: Record<string, string> = {
  "1": "bg-gray-50 text-gray-600 border-gray-200",     // รอสินค้าเข้าโกดังจีน
  "2": "bg-cyan-50 text-cyan-700 border-cyan-200",     // สินค้าถึงโกดังจีน
  "3": "bg-indigo-50 text-indigo-700 border-indigo-200", // กำลังส่งมาไทย
  "4": "bg-purple-50 text-purple-700 border-purple-200", // ถึงไทยแล้ว
  "5": "bg-yellow-50 text-yellow-700 border-yellow-200", // รอชำระเงิน
  "6": "bg-orange-50 text-orange-700 border-orange-200", // เตรียมส่ง
  "7": "bg-green-50 text-green-700 border-green-200",   // ส่งแล้ว
};
// Badge colours keyed by the legacy status codes — tb_header_order.hstatus '1'-'6'.
const STATUS_BADGE_SO: Record<string, string> = {
  "1": "bg-gray-50 text-gray-700 border-gray-200",     // รอดำเนินการ
  "2": "bg-yellow-50 text-yellow-700 border-yellow-200", // รอชำระเงิน
  "3": "bg-blue-50 text-blue-700 border-blue-200",     // สั่งสินค้า
  "4": "bg-indigo-50 text-indigo-700 border-indigo-200", // รอร้านจีนจัดส่ง
  "5": "bg-green-50 text-green-700 border-green-200",   // สำเร็จ
  "6": "bg-red-50 text-red-700 border-red-200",        // ยกเลิก
};

export default async function DashboardPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const t = await getTranslations("dashboard");

  // D1 Phase-B Wave 2 (B-0): read the ported legacy PCS schema (tb_*) so the
  // ~8,898 migrated customers see their real data. tb_* is RLS-locked to
  // service_role, so reads go through the admin client; the join key is
  // tb_*.userid === profile.member_code (the customer's "PR<n>" code).
  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

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
    admin.from("tb_wallet").select("wallettotal").eq("userid", memberCode).maybeSingle<{
      wallettotal: number;
    }>(),
    admin.from("tb_cart").select("id", { count: "exact", head: true }).eq("userid", memberCode),
    admin.from("tb_header_order")
      .select("id", { count: "exact", head: true })
      .eq("userid", memberCode)
      .in("hstatus", ["1", "2"]),
    admin.from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("userid", memberCode)
      .eq("fstatus", "5"),
    admin.from("tb_payment")
      .select("id", { count: "exact", head: true })
      .eq("userid", memberCode)
      .in("paystatus", ["1", "2"]),
    admin.from("tb_forwarder")
      .select("id, fidorco, fstatus, fweight, fvolume, ftotalprice, fdate, ftrackingth")
      .eq("userid", memberCode)
      .order("fdate", { ascending: false })
      .limit(5),
    admin.from("tb_header_order")
      .select("id, hno, hstatus, htitle, hcount, htotalpriceuser, hdatepayment, hdate")
      .eq("userid", memberCode)
      .order("hdate", { ascending: false })
      .limit(5),
  ]);

  const balance = Number(walletRes.data?.wallettotal ?? 0);
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
          <PcsSalesRepCard memberCode={profile.member_code} />
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
                            <span className="font-mono text-xs text-primary-600">{o.hno}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_SO[o.hstatus] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                              {legacyOrderStatusThai(o.hstatus)}
                            </span>
                          </div>
                          <p className="truncate text-sm text-foreground">{o.htitle ?? "—"}</p>
                          <p className="text-xs text-muted">
                            {o.hcount} {t("items")} · {o.hdate ? new Date(o.hdate).toLocaleDateString("th-TH") : "—"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-bold">฿{Number(o.htotalpriceuser).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                          {o.hstatus === "2" && o.hdatepayment && (
                            <p className="text-[10px] text-yellow-700">
                              {t("payBy", { date: new Date(o.hdatepayment).toLocaleDateString("th-TH") })}
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
                            <span className="font-mono text-xs text-primary-600">{f.fidorco}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_F[f.fstatus] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                              {legacyForwarderStatusThai(f.fstatus)}
                            </span>
                          </div>
                          <p className="text-xs text-muted">
                            {Number(f.fweight).toFixed(2)} kg · {Number(f.fvolume).toFixed(3)} cbm · {f.fdate ? new Date(f.fdate).toLocaleDateString("th-TH") : "—"}
                          </p>
                          {f.ftrackingth && f.ftrackingth !== "-" && <p className="text-[10px] text-muted">TH: {f.ftrackingth}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-bold">฿{Number(f.ftotalprice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
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
