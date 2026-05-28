import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACT } from "@/components/seo/site";
import { MobileLaunchpad } from "./mobile-launchpad";

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
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const uid = profile.member_code ?? "";

  // wallet balance — tb_wallet.wallettotal (legacy header.php L86-92)
  const { data: walletRow, error: walletRowErr } = await admin
    .from("tb_wallet")
    .select("wallettotal")
    .eq("userid", uid)
    .maybeSingle<{ wallettotal: number | string | null }>();

  const walletTotal = Number(walletRow?.wallettotal ?? 0);

  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();

  // Sales rep — per ปอน 2026-05-26, ALL customers see the central Pacred
  // care line on the mobile launchpad (no per-customer adminidsale lookup).
  // Single source of truth = CONTACT in components/seo/site.ts so the number
  // stays in sync with the rest of the site.
  const salesRep = {
    nickname: "แนท",
    picture: "/images/pacred-logo-red.png",
    tel: CONTACT.phoneCompanyDisplay,
  };

  return (
    <MobileLaunchpad
      memberCode={profile.member_code ?? ""}
      fullName={fullName || "ลูกค้า Pacred"}
      avatarUrl={profile.avatar_url}
      walletTotal={walletTotal}
      salesRep={salesRep}
    />
  );
}
