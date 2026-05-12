import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCart } from "@/actions/cart";
import { CartManager } from "./cart-manager";

export default async function ServiceOrderCartPage() {
  const t = await getTranslations("serviceOrder");
  const cartRes = await listCart();
  const cart    = cartRes.ok ? (cartRes.data ?? []) : [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Default address (pre-fill checkout form)
  const { data: defaultAddress } = user
    ? await supabase
        .from("addresses")
        .select("first_name, last_name, phone, phone2, address_line, sub_district, district, province, postal_code, note")
        .eq("profile_id", user.id)
        .eq("is_default", true)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  // Yuan rate + service fee from settings singleton
  const { data: settings } = await supabase
    .from("settings")
    .select("yuan_rate, service_fee")
    .eq("id", 1)
    .maybeSingle<{ yuan_rate: number; service_fee: number }>();
  const yuanRate    = Number(settings?.yuan_rate ?? 5);
  const serviceFee  = Number(settings?.service_fee ?? 50);

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("cartTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("cartSubtitle")}</p>
          </div>
          <Link
            href="/service-order/add"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            + {t("addItem")}
          </Link>
        </div>

        <CartManager
          cart={cart}
          yuanRate={yuanRate}
          serviceFee={serviceFee}
          defaultAddress={defaultAddress}
        />
      </main>
      <Footer />
    </>
  );
}
