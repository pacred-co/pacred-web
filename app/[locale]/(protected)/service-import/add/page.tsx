import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForwarderForm } from "./forwarder-form";

export default async function ServiceImportAddPage() {
  const t = await getTranslations("forwarder");

  // Pre-fill from user's default address
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: defaultAddress } = user
    ? await supabase
        .from("addresses")
        .select("first_name, last_name, phone, phone2, address_line, sub_district, district, province, postal_code, note")
        .eq("profile_id", user.id)
        .eq("is_default", true)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("addTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("addSubtitle")}</p>
          </div>
          <Link
            href="/service-import"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            ← {t("backToList")}
          </Link>
        </div>

        <ForwarderForm defaultAddress={defaultAddress} />
      </main>
      <Footer />
    </>
  );
}
