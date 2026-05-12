import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listForwarders } from "@/actions/forwarder";
import { ForwarderList } from "./forwarder-list";

export default async function ServiceImportPage() {
  const t = await getTranslations("forwarder");
  const res = await listForwarders({ limit: 100 });
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
          <Link
            href="/service-import/add"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            + {t("createNew")}
          </Link>
        </div>

        <ForwarderList items={items} />
      </main>
      <Footer />
    </>
  );
}
