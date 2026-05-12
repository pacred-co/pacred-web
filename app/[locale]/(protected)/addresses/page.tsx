import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listAddresses } from "@/actions/addresses";
import { AddressesManager } from "./addresses-manager";

export default async function AddressesPage() {
  const t = await getTranslations("addresses");
  const res = await listAddresses();
  const addresses = res.ok ? (res.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
          <Link
            href="/profile"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            {t("backToProfile")}
          </Link>
        </div>

        {!res.ok && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {t("loadError", { error: res.error })}
          </div>
        )}

        <AddressesManager initialAddresses={addresses} />
      </main>
      <Footer />
    </>
  );
}
