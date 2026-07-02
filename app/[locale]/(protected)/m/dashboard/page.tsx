import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSalesRepContactForUserid,
  getCsRepContactForUserid,
} from "@/lib/admin/sales-rep-contact";
import { MobileLaunchpad } from "./mobile-launchpad";

const PACRED_LOGO = "/images/pacred-logo-red.png";

/**
 * Mobile-only customer launchpad — the FloatingTabs "เมนู" destination.
 *
 * Per ปอน 2026-05-26 — full-screen mobile dashboard that mirrors the legacy
 * PCS Cargo `member/index.php` customer landing layout (profile gradient +
 * wallet balance + sales-rep contact + 9-icon action grid) but rebuilt in
 * Tailwind from scratch. Desktop visitors are bounced to `/dashboard` by the
 * client wrapper so this page is never seen ≥ md.
 */
export const dynamic = "force-dynamic";

export default async function MobileDashboardPage() {
  const t = await getTranslations("mobileDashboard");
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const uid = profile.member_code ?? "";

  // wallet balance — tb_wallet.wallettotal (legacy header.php L86-92)
  const { data: walletRow, error: walletErr } = await admin
    .from("tb_wallet")
    .select("wallettotal")
    .eq("userid", uid)
    .maybeSingle<{ wallettotal: number | string | null }>();
  if (walletErr) {
    // Don't crash the dashboard for a wallet read — fall through to ฿0
    // display so the customer can still navigate. Log loudly so we notice.
    console.error(`[m/dashboard tb_wallet read] failed`, { code: walletErr.code, message: walletErr.message, uid });
  }

  const walletTotal = Number(walletRow?.wallettotal ?? 0);

  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();

  // Sales + CS reps — the customer's OWN assigned people (tb_users.adminIDSale
  // / adminIDCS → tb_admin), each resolved to name + tel + photo. A customer
  // with no rep on file gets the Pacred-wide CS fallback (never an empty box).
  const [salesContact, csContact] = await Promise.all([
    getSalesRepContactForUserid(uid),
    getCsRepContactForUserid(uid),
  ]);

  // Compact display for the two side-by-side cards: the rep's short nickname
  // ("ปูปู" / "พลอย" · "Pacred" when none) + phone as raw digits (matches the
  // mockup). The resolver already handled the active-rep fallback, so whatever
  // it returns is a WORKING contact.
  const salesRep = {
    name: salesContact.nickname,
    tel: salesContact.phoneDisplay.replace(/\D/g, ""),
    picture: salesContact.avatarUrl ?? PACRED_LOGO,
  };
  const csRep = {
    name: csContact.nickname,
    tel: csContact.phoneDisplay.replace(/\D/g, ""),
    picture: csContact.avatarUrl ?? PACRED_LOGO,
  };

  return (
    <MobileLaunchpad
      memberCode={profile.member_code ?? ""}
      fullName={fullName || t("customerFallback")}
      avatarUrl={profile.avatar_url}
      walletTotal={walletTotal}
      salesRep={salesRep}
      csRep={csRep}
    />
  );
}
