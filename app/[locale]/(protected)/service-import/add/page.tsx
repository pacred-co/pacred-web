import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForwarderForm, type QuotePrefill } from "./forwarder-form";

/**
 * G-F-2 — parse a booking-calculator quote off the query string into the
 * `ForwarderForm` initial state. The visitor arrives here from
 * `/start-order` (which set `?from=booking&mode=…&weight=…&volume=…`).
 * Returns null when the page is opened normally (no booking handoff).
 */
function parseQuotePrefill(
  sp: Record<string, string | string[] | undefined>,
): QuotePrefill | null {
  if (sp.from !== "booking") return null;

  const num = (k: string): number | undefined => {
    const v = sp[k];
    const n = typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // calculator mode → service-import transport_type
  const transportByMode: Record<string, "ship" | "truck" | "air"> = {
    sea: "ship", truck: "truck", air: "air",
  };
  const mode = typeof sp.mode === "string" ? sp.mode : "";
  const weight = num("weight");
  const volume = num("volume");

  return {
    transport_type: transportByMode[mode],
    weight_kg: weight,
    volume_cbm: volume,
  };
}

export default async function ServiceImportAddPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("forwarder");
  const quotePrefill = parseQuotePrefill(await searchParams);

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

        {quotePrefill && (
          <div className="rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3 text-sm text-foreground">
            {t("quotePrefillNotice")}
          </div>
        )}

        <ForwarderForm defaultAddress={defaultAddress} quotePrefill={quotePrefill} />
      </main>
      <Footer />
    </>
  );
}
