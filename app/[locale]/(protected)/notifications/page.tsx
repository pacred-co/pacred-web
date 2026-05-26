import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listMyNotifications } from "@/actions/notifications";
import { NotificationsList } from "./notifications-list";

export default async function NotificationsPage() {
  const t = await getTranslations("notifications");
  const res = await listMyNotifications(100);
  const items = res.ok ? (res.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[800px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
          <Link href="/dashboard" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
            ← {t("backToDashboard")}
          </Link>
        </div>

        <NotificationsList initial={items} />
      </main>
      <Footer />
    </>
  );
}
