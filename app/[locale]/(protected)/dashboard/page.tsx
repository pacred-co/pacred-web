import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { SalesRepCard } from "@/components/sales-rep-card";
import { DashboardBanners } from "@/components/dashboard-banners";
import { ShoppingBasket, Box, ArrowLeftRight, Wallet as WalletIcon } from "lucide-react";

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
    settingsRes,
  ] = await Promise.all([
    supabase.from("wallet").select("balance, cashback_balance, credit_balance").eq("profile_id", profile.id).maybeSingle<{
      balance: number; cashback_balance: number; credit_balance: number;
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
    supabase.from("settings").select("yuan_rate").eq("id", 1).maybeSingle<{ yuan_rate: number }>(),
  ]);

  const wallet = walletRes.data ?? { balance: 0, cashback_balance: 0, credit_balance: 0 };
  const yuanRate = Number(settingsRes.data?.yuan_rate ?? 5.0);
  // Shopping-cart rate runs slightly higher than Alipay (legacy PCS pattern: ฝากสั่ง 4.97 vs Alipay 4.93)
  const shopRate = yuanRate;
  const alipayRate = Math.max(0, yuanRate - 0.04);
  const displayName = profile.first_name
    ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`
    : profile.company_name ?? t("fallbackName");

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 space-y-6">
        {/* Sales rep card (server component, renders nothing if no rep) */}
        <SalesRepCard profileId={profile.id} />

        {/* Greeting + live rates ticker */}
        <section className="rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/70">{t("kicker")}</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold">{t("greeting", { name: displayName })}</h1>
              {profile.member_code && (
                <p className="mt-1 text-sm text-white/80">
                  {t("memberCode")}: <span className="font-mono font-semibold">{profile.member_code}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="rounded-full bg-white/15 backdrop-blur-sm px-4 py-1.5 text-xs">
                <span className="text-white/70">ฝากสั่ง</span>{" "}
                <span className="font-mono font-bold text-base">{shopRate.toFixed(2)}</span>
              </div>
              <div className="rounded-full bg-white/15 backdrop-blur-sm px-4 py-1.5 text-xs">
                <span className="text-white/70">Alipay</span>{" "}
                <span className="font-mono font-bold text-base">{alipayRate.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/service-order/add"   className="rounded-lg bg-white/15 hover:bg-white/25 px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors">+ {t("quickShop")}</Link>
            <Link href="/service-import/add"  className="rounded-lg bg-white/15 hover:bg-white/25 px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors">+ {t("quickImport")}</Link>
            <Link href="/service-payment"     className="rounded-lg bg-white/15 hover:bg-white/25 px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors">{t("quickPayment")}</Link>
            <Link href="/wallet/deposit"      className="rounded-lg bg-white text-primary-700 hover:bg-white/95 px-4 py-2 text-sm font-bold transition-colors">+ {t("quickDeposit")}</Link>
          </div>
        </section>

        {/* Marketing banners (admin-managed via dashboard_banners table) */}
        <DashboardBanners />

        {/* Stats row — 4 PCS-style cards (number left, icon right, progress bar bottom, hover lift) */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PcsStatCard
            href="/service-order/pending"
            label="ฝากสั่งซื้อสินค้า"
            value={String(pendingOrderCountRes.count ?? 0)}
            cartBadge={cartCountRes.count ?? 0}
            tone="info"
            icon={<ShoppingBasket className="w-9 h-9" />}
          />
          <PcsStatCard
            href="/service-import/pending"
            label="ฝากนำเข้าสินค้า"
            value={String(pendingForwarderCountRes.count ?? 0)}
            tone="warning"
            icon={<Box className="w-9 h-9" />}
          />
          <PcsStatCard
            href="/service-payment"
            label="ฝากชำระเงิน"
            value={String(pendingPaymentCountRes.count ?? 0)}
            tone="purple"
            icon={<ArrowLeftRight className="w-9 h-9" />}
          />
          <PcsStatCard
            href="/wallet/history"
            label="กระเป๋าสตางค์"
            value={`฿${Number(wallet.balance).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            tone="success"
            icon={<WalletIcon className="w-9 h-9" />}
            small
          />
        </section>

        {/* Two-column lists */}
        <section className="grid gap-4 lg:grid-cols-2">
          {/* Recent shopping orders */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-bold">{t("recentOrders")}</h2>
              <Link href="/service-order" className="text-xs text-primary-500 hover:underline">{t("viewAll")}</Link>
            </div>
            {!recentOrdersRes.data?.length ? (
              <div className="p-8 text-center text-sm text-muted">
                {t("noRecentOrders")}
                <div className="mt-3">
                  <Link href="/service-order/add" className="inline-block rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs">+ {t("quickShop")}</Link>
                </div>
              </div>
            ) : (
              <ul>
                {recentOrdersRes.data.map((o) => (
                  <li key={o.id} className="px-5 py-3 border-t border-border first:border-t-0 hover:bg-surface-alt/30">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-primary-600">{o.h_no}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_SO[o.status]}`}>
                            {t(`status.${o.status}` as Parameters<typeof t>[0])}
                          </span>
                        </div>
                        <p className="text-sm text-foreground truncate">{o.title ?? "—"}</p>
                        <p className="text-xs text-muted">
                          {o.item_count} {t("items")} · {new Date(o.created_at).toLocaleDateString("th-TH")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-sm">฿{Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
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
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-bold">{t("recentForwarders")}</h2>
              <Link href="/service-import" className="text-xs text-primary-500 hover:underline">{t("viewAll")}</Link>
            </div>
            {!recentForwardersRes.data?.length ? (
              <div className="p-8 text-center text-sm text-muted">
                {t("noRecentForwarders")}
                <div className="mt-3">
                  <Link href="/service-import/add" className="inline-block rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs">+ {t("quickImport")}</Link>
                </div>
              </div>
            ) : (
              <ul>
                {recentForwardersRes.data.map((f) => (
                  <li key={f.id} className="px-5 py-3 border-t border-border first:border-t-0 hover:bg-surface-alt/30">
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
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-sm">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/** PCS-style stat card: big colored number on the left, icon on the right,
 *  full-width gradient progress bar at bottom, hover lift. Mirrors the
 *  card layout from legacy member dashboard. */
function PcsStatCard({
  href, label, value, icon, tone, cartBadge, small = false,
}: {
  href: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "info" | "warning" | "purple" | "success";
  cartBadge?: number;
  small?: boolean;
}) {
  const tones = {
    info:    { text: "text-cyan-600",    bar: "from-cyan-400 to-cyan-600" },
    warning: { text: "text-amber-500",   bar: "from-amber-400 to-orange-500" },
    purple:  { text: "text-purple-600",  bar: "from-purple-400 to-fuchsia-600" },
    success: { text: "text-emerald-600", bar: "from-emerald-400 to-green-600" },
  }[tone];

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={`font-bold leading-none ${tones.text} ${small ? "text-2xl" : "text-4xl"} font-mono`}>{value}</p>
              {cartBadge !== undefined && cartBadge > 0 && (
                <span className="rounded-full bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5">รถเข็น {cartBadge}</span>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{label}</p>
          </div>
          <div className={`shrink-0 ${tones.text} opacity-90 group-hover:opacity-100`}>{icon}</div>
        </div>
      </div>
      <div className="h-1.5 w-full bg-surface-alt">
        <div className={`h-full w-full bg-gradient-to-r ${tones.bar}`} />
      </div>
    </Link>
  );
}
