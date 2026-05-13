import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { CompleteProfileForm } from "./complete-profile-form";

export default async function CompleteProfilePage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.user) redirect("/login");
  if (data.profile?.status === "active") redirect("/dashboard");

  const t = await getTranslations("complete_profile");
  const isJuristic = data.profile?.account_type === "juristic";
  const juristicRegisterHref = "/register?tab=juristic";

  // Prefill from OAuth metadata + existing profile so the user doesn't
  // re-type names already provided by Google/Facebook.
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const metaStr = (k: string) =>
    typeof meta[k] === "string" ? (meta[k] as string) : "";
  const fullName = metaStr("full_name") || metaStr("name");
  const [splitFirst = "", ...splitRest] = fullName.split(" ").filter(Boolean);
  const initial = {
    first_name:
      data.profile?.first_name ??
      metaStr("given_name") ??
      splitFirst,
    last_name:
      data.profile?.last_name ??
      metaStr("family_name") ??
      splitRest.join(" "),
    phone:    data.profile?.phone ?? "",
    sex:      (data.profile?.sex ?? "") as "male" | "female" | "other" | "",
    birthday: data.profile?.birthday ?? "",
  };

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-[560px] rounded-[18px] bg-white dark:bg-surface p-6 sm:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              {t("kicker")}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">
              {t("title")}
            </h1>
            <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
          </div>

          {isJuristic ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">
                  {t("juristicTitle")}
                </p>
                <p className="mt-2 text-sm text-amber-700">{t("juristicNote")}</p>
              </div>
              <Link
                href={juristicRegisterHref}
                className="block w-full rounded-lg bg-primary-500 px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-primary-600"
              >
                {t("juristicCta")}
              </Link>
              <Link
                href="/"
                className="block w-full rounded-lg border border-border bg-white dark:bg-surface px-5 py-2.5 text-center text-sm font-semibold text-muted transition hover:border-primary-500 hover:text-primary-600"
              >
                {t("backHome")}
              </Link>
            </div>
          ) : (
            <CompleteProfileForm
              initial={initial}
              juristicSwitchHref={juristicRegisterHref}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
