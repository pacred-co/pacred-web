import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ChangePhoneForm } from "./change-phone-form";

export default async function ChangePhonePage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  // OAuth-only accounts (no email/password on file) can't re-verify their
  // identity for this flow — send them back to /profile with a notice.
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const hasPassword = !!user?.email;

  const t = await getTranslations("change_phone");

  return (
    <>
      <main className="mx-auto w-full max-w-[640px] px-4 py-12">
        <div className="mb-6">
          <Link href="/profile" className="text-sm text-muted hover:text-primary-600">
            ← {t("backToProfile")}
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold tracking-widest text-primary-600">
              {t("kicker")}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
          </div>

          {!hasPassword ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">{t("noPasswordTitle")}</p>
              <p className="mt-1">{t("noPasswordBody")}</p>
            </div>
          ) : (
            <ChangePhoneForm
              currentPhone={data.profile.phone ?? user?.phone ?? null}
            />
          )}
        </div>
      </main>
    </>
  );
}
