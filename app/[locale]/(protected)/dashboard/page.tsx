/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { ShoppingCart, Package, CreditCard, Wallet } from "lucide-react";
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
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const uid = profile.member_code ?? "";

  // index.php / header.php SELECTs — $countShops (header.php L105),
  // $countForwarder (L100), $countPayment (L104), $walletTotal (L86-92),
  // and the tb_corporate juristic-pending gate (index.php L40).
  const [shopsRes, forwarderRes, paymentRes, walletRes, corpRes] = await Promise.all([
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
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", uid)
      .maybeSingle<{ wallettotal: number | string | null }>(),
    admin
      .from("tb_corporate")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid)
      .eq("corporatestatus", "1"),
  ]);

  const countShops = shopsRes.count ?? 0;
  const countForwarder = forwarderRes.count ?? 0;
  const countPayment = paymentRes.count ?? 0;
  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);
  const walletText = walletTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
      <div className="w-full px-[10px] md:pl-[280px] md:pr-[90px] py-3 md:py-5">
        <div className="max-w-[670px] mx-auto">
          <div className="rounded-2xl bg-primary-600 text-white px-6 py-8 text-center shadow-md">
            รอเจ้าหน้าที่ดำเนิน อนุมัติการเป็นนิติบุคคล ภายใน 24 ชม. (ยกเว้นวันอาทิตย์และวันหยุดนักขัตฤกษ์)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-[10px] md:pl-[280px] md:pr-[90px] py-3 md:py-5">
      {/* Top section — 2/3 carousel + 1/3 side-banner stack (md+); banners
          hidden < sm to match legacy `d-none d-sm-block`. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <div className="md:col-span-2">
          <PcsCarousel>
            {showMarchPromo && (
              <div>
                <a href="#">
                  <img
                    className="w-full h-auto rounded-2xl shadow-md hover:shadow-xl hover:brightness-105 transition-all duration-300 cursor-pointer"
                    src="https://pcscargo.co.th/wp-content/uploads/2026/03/3.3-06-2048x598.jpg"
                    alt="โปรโมชัน"
                  />
                </a>
              </div>
            )}
            <div>
              <img
                className="w-full h-auto rounded-2xl shadow-md hover:shadow-xl hover:brightness-105 transition-all duration-300 ease-out cursor-pointer"
                src="/images/customertheme/drive.png"
                alt=""
              />
            </div>
            <div>
              <img
                className="w-full h-auto rounded-2xl shadow-md hover:shadow-xl hover:brightness-105 transition-all duration-300 ease-out cursor-pointer"
                src="/images/customertheme/shop.png"
                alt=""
              />
            </div>
          </PcsCarousel>
        </div>
        <div className="hidden sm:block md:col-span-1">
          <Link href="/service-order" className="block group mb-2">
            <img
              className="w-full rounded-2xl shadow-md group-hover:shadow-xl group-hover:brightness-105 transition-all duration-300"
              src="/images/customertheme/bill.png"
              alt=""
            />
          </Link>
          {/* Legacy linked to pcscargo.co.th/line-notify/ — rewritten internal. */}
          <Link href="/line-notify" className="block group">
            <img
              className="w-full rounded-2xl shadow-md group-hover:shadow-xl group-hover:brightness-105 transition-all duration-300"
              src="/images/customertheme/line.png"
              alt=""
            />
          </Link>
        </div>
      </div>

      {/* Stat-card row — push down so the carousel above has breathing room
          (ปอน 2026-05-24: "โดนแบนเนอร์เบียด"). */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {/* 1 — ฝากสั่งซื้อสินค้า */}
        <Link
          href="/service-order"
          className="block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-4 md:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-3xl font-bold text-primary-600">{countShops}</div>
              <div className="mt-1 text-sm font-medium text-foreground/80">
                ฝากสั่งซื้อสินค้า
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/30">
              <ShoppingCart className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-primary-600" />
        </Link>

        {/* 2 — ฝากนำเข้าสินค้า */}
        <Link
          href="/service-import"
          className="block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-4 md:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-3xl font-bold text-amber-500">{countForwarder}</div>
              <div className="mt-1 text-sm font-medium text-foreground/80">
                ฝากนำเข้าสินค้า
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <Package className="h-6 w-6 text-amber-500" />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-amber-500" />
        </Link>

        {/* 3 — ฝากชำระเงิน */}
        <Link
          href="/service-payment"
          className="block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-4 md:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-3xl font-bold text-violet-500">{countPayment}</div>
              <div className="mt-1 text-sm font-medium text-foreground/80">
                ฝากชำระเงิน
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/30">
              <CreditCard className="h-6 w-6 text-violet-500" />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-violet-500" />
        </Link>

        {/* 4 — กระเป๋าสตางค์เงินสด */}
        <Link
          href="/wallet"
          className="block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-4 md:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-3xl font-bold text-emerald-500">
                {walletText}
                <span className="ml-1 text-sm font-normal text-foreground/70">บาท</span>
              </div>
              <div className="mt-1 text-sm font-medium text-foreground/80">
                กระเป๋าสตางค์เงินสด
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
              <Wallet className="h-6 w-6 text-emerald-500" />
            </div>
          </div>
          <div className="mt-4 h-[1.5px] w-full rounded-full bg-emerald-500" />
        </Link>
      </div>
    </div>
  );
}
