import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listServiceOrders } from "@/actions/service-order";
import { ServiceOrderList } from "./service-order-list";

export default async function ServiceOrderPage() {
  const t = await getTranslations("serviceOrder");
  const res = await listServiceOrders({ limit: 100 });
  const items = res.ok ? (res.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("listAllTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("listAllSubtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/service-order/add"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
            >
              + {t("addItem")}
            </Link>
            <Link
              href="/service-order/cart"
              className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
            >
              {t("openCart")}
            </Link>
          </div>
        </div>

        <ServiceOrderList items={items} />
      </main>
      <Footer />
    </>
  );
}
