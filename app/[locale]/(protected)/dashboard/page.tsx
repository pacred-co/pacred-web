import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import {
  formatPhoneNumber,
  loadPcsChromeData,
  PCS_DEFAULT_AVATAR,
} from "@/lib/legacy/pcs-chrome";
import { PcsLaunchpadHeader } from "@/components/sections/pcs-launchpad-header";
import { PcsIconGrid } from "@/components/sections/pcs-icon-grid";
import { WalletCounter } from "./wallet-counter";

/**
 * Customer post-login launchpad — a faithful port of legacy
 * `member/menu.php` (D1 / ADR-0017, gap doc `d1-fidelity-customer.md` §1).
 *
 * The owner rejected the prior dashboard (carousel + stat cards from
 * `index.php`) because legacy PCS Cargo's post-login home is `menu.php`:
 * a red gradient header band → overlapping wallet card → sales-rep card
 * → 9-icon grid. ~8,898 migrated customers have muscle-memory of THIS
 * screen, not a stats dashboard. Phase-B #1 fidelity fix.
 *
 * Composition (top → bottom, legacy menu.php L65-340):
 *   1. <PcsLaunchpadHeader> — red gradient band, 80px avatar, name,
 *      PR#### code, two corner icon buttons (edit profile / settings).
 *   2. Overlapping wallet card (`.col-123` -45px offset) — animated
 *      count-up of tb_wallet.wallettotal, full-width gold progress bar.
 *      Whole card is a <Link> to /wallet/history (legacy → wallet/).
 *   3. Sales-rep card (`box-sale-main`) — admin photo + nickname + tap
 *      phone, looked up via tb_users.adminidsale → tb_admin.
 *   4. <PcsIconGrid> — 3×3 launchpad: ฝากสั่ง · ฝากนำเข้า · ใบเสร็จ ·
 *      ฝากชำระ · เป๋าตัง · เติมเงิน · ถอนเงิน · ที่อยู่ · ออกจากระบบ.
 *
 * Data: the protected layout already runs `loadPcsChromeData(memberCode)`
 * once per request; that helper is wrapped in `unstable_cache` (30s TTL),
 * so the call here is a cache-hit and not a second round of queries.
 * The chrome data carries `userName`/`userLastName` (from the migrated
 * `tb_users` ground truth) + `walletTotal` + the resolved `sales` rep —
 * we don't re-query.
 *
 * Display name: prefer the migrated `tb_users` first + last name (the
 * legacy ground truth), then the rebuilt `profiles` first + last name,
 * then a translated fallback. Phone formatting matches the legacy
 * `formatPhoneNumber()` helper (10 digits → 3-3-4).
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const t = await getTranslations("pcsHome");
  const memberCode = profile.member_code ?? "";
  const chrome = await loadPcsChromeData(memberCode);

  // Display name resolution (see header comment). The legacy menu.php
  // shows `$userName.' '.$userLastName` (tb_users), and that's the name
  // the customer recognises — prefer it.
  const legacyName = `${chrome.userName ?? ""} ${chrome.userLastName ?? ""}`.trim();
  const rebuiltName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  const displayName = legacyName || rebuiltName || t("fallbackName");

  // The 80px avatar — legacy `images/users/<userPicture>`. Pacred's
  // rebuilt schema stores it in `profiles.avatar_url`; migrated tb_users
  // images live under the same legacy path (backfilled post Supabase-Pro
  // upgrade), so we just consume whichever the profile carries. The
  // pcs-chrome default placeholder backstops both.
  const avatarUrl = profile.avatar_url || PCS_DEFAULT_AVATAR;

  // Wallet ground truth is tb_wallet (chrome.walletTotal — what the
  // legacy header.php read). Keep the exact same number the customer
  // sees in the sidebar/footer so nothing diverges across the page.
  const walletTotal = Number(chrome.walletTotal ?? 0);

  // Sales-rep block — resolved by pcs-chrome.resolveSalesRep()
  // (tb_admin + tb_org_tell_ships + tb_organization_tell, with the
  // central-care-line fallback). Always populated.
  const sales = chrome.sales;
  const telDigits = (sales.tel ?? "").replace(/[^+0-9]/g, "");
  const telDisplay =
    sales.tel === "02-055-6063" || sales.tel === "02-421-3325"
      ? sales.tel
      : formatPhoneNumber(sales.tel);

  return (
    <main className="app-content content pcs-legacy-scoped" style={{ paddingTop: 0 }}>
      <div className="content-overlay" />
      <div className="content-wrapper">
        <div className="content-body">
          <div className="mx-auto w-full max-w-[720px] pb-8">
            {/* 1. Red gradient header band — avatar + name + PR#### */}
            <PcsLaunchpadHeader
              displayName={displayName}
              memberCode={memberCode || null}
              avatarUrl={avatarUrl}
            />

            {/* 2. Wallet card — overlaps the header band by -45px to mirror
                  legacy `.col-123 { margin-top: -45px; }`. Whole card is
                  a tap target → /wallet/history (legacy → wallet/). */}
            <div className="-mt-12 px-4">
              <Link
                href="/wallet/history"
                className="block rounded-3xl bg-white p-4 shadow-[0_5px_15px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5 dark:bg-surface"
                aria-label={t("walletLabel")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium text-foreground/70">
                      {t("walletLabel")}
                    </p>
                    <div className="mt-1 text-[2rem] font-bold leading-none text-foreground sm:text-[2.5rem]">
                      <WalletCounter value={walletTotal} />
                    </div>
                  </div>
                  <Image
                    src="/legacy/pcs/logo.png"
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 object-contain"
                    unoptimized
                  />
                </div>
                {/* Gold progress bar — legacy box-shadow-2 gradient warning */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
                  <div
                    className="h-full w-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                    role="progressbar"
                    aria-valuenow={100}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </Link>
            </div>

            {/* 3. Sales-rep card — admin photo + nickname + tap phone.
                  Legacy `.box-sale-main`: round photo left, text right. */}
            <div className="mt-4 px-4">
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
                <div className="relative h-[55px] w-[55px] shrink-0 overflow-hidden rounded-full border-2 border-primary-500/40 bg-surface-alt">
                  {sales.picture ? (
                    <Image
                      src={sales.picture}
                      alt={sales.nickname}
                      fill
                      sizes="55px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xl font-bold text-primary-700">
                      {(sales.nickname || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                    {t("supervisor")}
                  </p>
                  <p className="truncate text-sm font-bold text-foreground">
                    {t("salesPrefix")} <span>{sales.nickname}</span>
                  </p>
                  <a
                    href={`tel:${telDigits}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-primary-700 hover:underline"
                  >
                    {t("tel")} :{" "}
                    <span className="font-mono font-semibold">{telDisplay}</span>
                  </a>
                </div>
              </div>
            </div>

            {/* 4. 9-icon launchpad grid — the core PCS surface */}
            <div className="mt-6">
              <PcsIconGrid />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
