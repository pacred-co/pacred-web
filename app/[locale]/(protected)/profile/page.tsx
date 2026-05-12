import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  const { profile } = data;

  // Fetch corporate sidecar if juristic
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
    : profile.company_name ?? "ลูกค้า";

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        {/* Header */}
        <div className="mb-6 rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-widest text-primary-500">PROFILE</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground">{displayName}</h1>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
                {profile.member_code && (
                  <span>
                    รหัสสมาชิก: <span className="font-mono font-semibold text-primary-600">{profile.member_code}</span>
                  </span>
                )}
                <span>·</span>
                <span>ประเภท: {profile.account_type === "juristic" ? "นิติบุคคล" : "บุคคลธรรมดา"}</span>
                <span>·</span>
                <span>สถานะ: {profile.status}</span>
              </div>
            </div>
            <Link
              href="/addresses"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
            >
              จัดการที่อยู่จัดส่ง →
            </Link>
          </div>
        </div>

        <ProfileForm profile={profile} corporate={corporate} />
      </main>
      <Footer />
    </>
  );
}
