import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// /admin/dashboard was a legacy stub (3 of 5 stat cards showed "—"). The
// real dashboard with live data lives at /admin (sidebar "ภาพรวม"). Old
// links from login + notifications get a clean redirect; existing bookmarks
// don't 404.

export default async function AdminDashboardLegacyRedirect() {
  const locale = await getLocale();
  redirect({ href: "/admin", locale });
}
