import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listForwarders } from "@/actions/forwarder";
import { ForwarderList } from "../forwarder-list";

/**
 * "Receipts" = shipments that have been delivered or are in the post-
 * payment lifecycle. Customer can download the invoice / receipt from
 * here (PDF generation lands in D5).
 */
export default async function ServiceImportReceiptsPage() {
  const t = await getTranslations("forwarder");
  const res = await listForwarders({
    status: ["arrived_thailand", "out_for_delivery", "delivered"],
    limit: 100,
  });
  const items = res.ok ? (res.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("receiptsTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("receiptsSubtitle")}</p>
          </div>
          <Link
            href="/service-import"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            {t("viewAll")}
          </Link>
        </div>

        <ForwarderList items={items} />
      </main>
      <Footer />
    </>
  );
}
