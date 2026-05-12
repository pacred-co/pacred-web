import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { AddItemForm } from "./add-form";

export default async function ServiceOrderAddPage() {
  const t = await getTranslations("serviceOrder");

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("addTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("addSubtitle")}</p>
          </div>
          <Link
            href="/service-order/cart"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            ← {t("backToCart")}
          </Link>
        </div>

        <AddItemForm />
      </main>
      <Footer />
    </>
  );
}
