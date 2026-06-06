/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PcsCarousel } from "@/components/legacy/pcs-carousel";

/**
 * Customer member home — Tailwind-pure rebuild of the legacy PCS Cargo
 * `member/index.php` body (the page a customer lands on after login).
 *
 * Layout preserves the original Bootstrap-4 arrangement (carousel + side
 * banners + 4 stat-cards) but every legacy class (`.card`, `.col-md-*`,
 * `.tam-counter`, `.bg-gradient-x-*`, `.ft-*` icon fonts, `.pull-up`,
 * `.box-shadow-2`) is gone — ปอน 2026-05-24 dropped the Bootstrap CSS from
 * `(protected)/layout.tsx` because it leaked global rules into the marketing
 * chrome. We render against Tailwind v4 + lucide-react now.
 *
 * Thai text + every Supabase SELECT + every href + every variable name stays
 * verbatim from `index.php` — no rebranding, no logic change.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("dashboardPage");
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const uid = profile.member_code ?? "";

  // index.php / header.php SELECTs — $countShops (header.php L105),
  // $countForwarder (L100), $countPayment (L104), $walletTotal (L86-92),
  // and the tb_corporate juristic-pending gate (index.php L40).
  const [shopsRes, forwarderRes, paymentRes, corpRes] = await Promise.all([
    admin
      .from("tb_header_order")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid),
    admin
      .from("tb_forwarder")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid),
    admin
      .from("tb_payment")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid),
    admin
      .from("tb_corporate")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid)
      .eq("corporatestatus", "1"),
  ]);

  const countShops = shopsRes.count ?? 0;
  const countForwarder = forwarderRes.count ?? 0;
  const countPayment = paymentRes.count ?? 0;

  // index.php L40-42 — a tb_corporate row with corporateStatus=1 = a
  // juristic-person application still pending approval.
  const isJuristicPending = (corpRes.count ?? 0) > 0;

  // index.php L49 — the March promo carousel slide is date-gated.
  const now = new Date();
  const showMarchPromo =
    now >= new Date("2026-03-04T00:00:01") &&
    now <= new Date("2026-03-06T23:59:59");

  // Juristic-pending takes the page over — every other element is suppressed
  // until staff approve (legacy index.php L154-156).
  if (isJuristicPending) {
    return (
      <div className="pcs-content-pad w-full px-[10px] py-3 md:py-5">
        <div className="max-w-[670px] mx-auto">
          <div className="rounded-2xl bg-primary-600 text-white px-5 py-5 text-center shadow-sm">
            {t("juristicPending")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pcs-content-pad w-full px-[10px] py-3 md:py-5">
      {/* Top section — 2/3 carousel + 1/3 side-banner stack (md+); banners
          hidden < sm to match legacy `d-none d-sm-block`. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 md:items-stretch">
        <div className="md:col-span-2">
          <PcsCarousel>
            {showMarchPromo && (
              <div>
                <a href="#">
                  {/* TODO(brand): legacy WordPress promo asset was
                      https://pcscargo.co.th/wp-content/uploads/2026/03/3.3-06-2048x598.jpg
                      — needs a Pacred-hosted replacement from ปอน before
                      this March-3.3 window re-activates. Placeholder
                      below avoids a brand-leaking URL in customer source. */}
                  <div className="w-full aspect-[2048/598] rounded-2xl bg-surface-alt shadow-md flex items-center justify-center text-muted text-sm">
                    {t("promo33Placeholder")}
                  </div>
                </a>
              </div>
            )}
            <div>
              <img
                className="w-full h-auto rounded-2xl shadow-sm hover:shadow-md hover:brightness-105 transition-all duration-300 ease-out cursor-pointer"
                src="/images/customertheme/drive.png"
                alt=""
              />
            </div>
            <div>
              <img
                className="w-full h-auto rounded-2xl shadow-sm hover:shadow-md hover:brightness-105 transition-all duration-300 ease-out cursor-pointer"
                src="/images/customertheme/shop.png"
                alt=""
              />
            </div>
          </PcsCarousel>
        </div>
        {/* Right column — 2 stacked banners. At md+ the column stretches to the
            carousel's height (md:items-stretch on the grid) and each banner fills
            half via flex-1 + an absolutely-positioned object-cover image, so the
            two sides are EXACTLY the same height (owner 2026-06-05). All 4 assets
            are 1840×540, so this only absorbs the ~8px inter-banner gap → no
            visible crop. Below md it falls back to the natural stacked layout. */}
        <div className="hidden sm:block md:flex md:flex-col md:gap-2 md:col-span-1">
          <Link
            href="/service-order"
            className="group relative block overflow-hidden rounded-2xl shadow-md transition duration-300 hover:shadow-xl mb-2 md:mb-0 md:flex-1 md:min-h-0"
          >
            <img
              className="block w-full h-auto transition duration-300 group-hover:brightness-105 md:absolute md:inset-0 md:h-full md:w-full md:object-cover"
              src="/images/customertheme/bill.png"
              alt=""
            />
          </Link>
          {/* Legacy linked to pcscargo.co.th/line-notify/ — Pacred replaced
              that page with /line-settings (LIFF flow, task L 2026-05-26).
              LINE Notify EOL'd 2025-03-31; the new page links via Messaging
              API push. */}
          <Link
            href="/line-settings"
            className="group relative block overflow-hidden rounded-2xl shadow-md transition duration-300 hover:shadow-xl md:flex-1 md:min-h-0"
          >
            <img
              className="block w-full h-auto transition duration-300 group-hover:brightness-105 md:absolute md:inset-0 md:h-full md:w-full md:object-cover"
              src="/images/customertheme/line.png"
              alt=""
            />
          </Link>
        </div>
      </div>

      {/* Stat-card row — push down so the carousel above has breathing room
          (ปอน 2026-05-24: "โดนแบนเนอร์เบียด"). Mobile = 2x2 grid; desktop = 4
          in a row. Cards are glossy 3D buttons in the style of the public
          <OurService /> section (ปอน "สวยๆ นูนๆ เหมือนปุ่มหน้าแรก"). */}
      <div className="mt-6 grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {/* 1 — ฝากสั่งซื้อสินค้า */}
        <Link
          href="/service-order"
          className="group block rounded-2xl bg-white dark:bg-surface border border-black/[0.10] dark:border-white/10 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:duration-75 p-4 md:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-xl font-bold text-primary-600">{countShops}</div>
              <div className="mt-1 text-sm font-medium text-foreground/80">
                {t("cardShopOrder")}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/30">
              <div
                className="h-8 w-8 bg-primary-600"
                style={{
                  WebkitMaskImage: "url(/images/home/iconfloating/pcs-cart.png)",
                  maskImage: "url(/images/home/iconfloating/pcs-cart.png)",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                }}
                aria-hidden
              />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-primary-600" />
        </Link>

        {/* 2 — ฝากนำเข้าสินค้า */}
        <Link
          href="/service-import"
          className="group block rounded-2xl bg-white dark:bg-surface border border-black/[0.10] dark:border-white/10 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:duration-75 p-4 md:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-3xl font-bold text-amber-500">{countForwarder}</div>
              <div className="mt-1 text-sm font-medium text-foreground/80">
                {t("cardImport")}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <div
                className="h-8 w-8 bg-amber-500"
                style={{
                  WebkitMaskImage: "url(/images/home/iconfloating/pcs-forwarder.png)",
                  maskImage: "url(/images/home/iconfloating/pcs-forwarder.png)",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                }}
                aria-hidden
              />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-amber-500" />
        </Link>

        {/* 2b — ส่งออกสินค้า · coming soon (owner 2026-06-04 — paired beside
            นำเข้า; export module not built yet → greyed, non-navigating). */}
        <div
          aria-disabled
          className="group block rounded-2xl bg-white dark:bg-surface border border-black/[0.10] dark:border-white/10 shadow-[0_2px_3px_rgba(15,23,42,0.10),0_6px_14px_rgba(15,23,42,0.12),0_18px_38px_rgba(15,23,42,0.16),inset_0_1.5px_0_rgba(255,255,255,1),inset_0_-3px_0_rgba(0,0,0,0.10),inset_0_0_0_1px_rgba(255,255,255,0.35)] p-4 md:p-5 cursor-not-allowed select-none opacity-80"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <span className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {t("comingSoon")}
              </span>
              <div className="mt-1.5 text-sm font-medium text-foreground/60">
                {t("cardExport")}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/5">
              <div
                className="h-8 w-8 bg-gray-400"
                style={{
                  WebkitMaskImage: "url(/images/home/iconfloating/export.png)",
                  maskImage: "url(/images/home/iconfloating/export.png)",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                }}
                aria-hidden
              />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-gray-300" />
        </div>

        {/* 3 — ฝากชำระเงิน */}
        <Link
          href="/service-payment"
          className="group block rounded-2xl bg-white dark:bg-surface border border-black/[0.10] dark:border-white/10 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:duration-75 p-4 md:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-3xl font-bold text-violet-500">{countPayment}</div>
              <div className="mt-1 text-sm font-medium text-foreground/80">
                {t("cardPayment")}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/30">
              <div
                className="h-8 w-8 bg-violet-500"
                style={{
                  WebkitMaskImage: "url(/images/home/iconfloating/pcs-payment.png)",
                  maskImage: "url(/images/home/iconfloating/pcs-payment.png)",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                }}
                aria-hidden
              />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-violet-500" />
        </Link>
      </div>
    </div>
  );
}
