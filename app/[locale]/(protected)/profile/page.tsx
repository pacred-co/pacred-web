import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { ProfileForm } from "./profile-form";
import { AvatarPanel } from "./avatar-panel";
import { SecurityPanel } from "./security-panel";

export default async function ProfilePage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  const t = await getTranslations("profile");
  const { profile } = data;

  let corporate = null;
  if (profile.account_type === "juristic") {
    const supabase = await createClient();
    const { data: c } = await supabase
      .from("corporate")
      .select("profile_id, tax_id, company_name, company_address, status, rejection_reason")
      .eq("profile_id", profile.id)
      .maybeSingle();
    corporate = c as typeof corporate;
  }

  const displayName = profile.first_name
    ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`
    : profile.company_name ?? t("fallbackName");

  const accountTypeLabel =
    profile.account_type === "juristic"
      ? t("accountTypeJuristic")
      : t("accountTypePersonal");

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="mb-6 rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground">{displayName}</h1>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
                {profile.member_code && (
                  <span>
                    {t("memberCode")}: <span className="font-mono font-semibold text-primary-600">{profile.member_code}</span>
                  </span>
                )}
                <span>·</span>
                <span>{t("accountType")}: {accountTypeLabel}</span>
                <span>·</span>
                <span>{t("status")}: {profile.status}</span>
              </div>
            </div>
            <Link
              href="/addresses"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
            >
              {t("manageAddresses")}
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          <AvatarPanel
            currentAvatarUrl={profile.avatar_url}
            fallbackInitial={(profile.first_name ?? profile.company_name ?? "?").charAt(0).toUpperCase()}
          />
          <ProfileForm profile={profile} corporate={corporate} />
          <SecurityPanel />
        </div>
      </main>
      <Footer />
    </>
  );
}
