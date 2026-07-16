import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/**
 * /admin/accounting/hs-library/bot — RETIRED 2026-07-16 → the unified library.
 *
 * Owner: "ระบบพิกัด HS CODE ทั้งหมด ยุบทิ้ง ให้มารวมกันอยู่ทีเดียว และหน้าเดียวกัน".
 * This page's entire surface now lives as the "สินค้า → พิกัด" section of
 * /admin/accounting/hs-library — every feature was carried over, not dropped:
 * source badges · product grouping (same groupKeyOf) · พิกัดหลัก/พิกัดรอง (same
 * completeness scorer + betterRow tie-break) · ⚠️ พิกัดขัดกัน · ยังไม่มี code ·
 * the 4 stat cards · the VERBATIM duty chip. It also gained the previously
 * orphaned doc_bot_hs_overrides panel.
 *
 * Kept as a redirect rather than deleted: this route was reachability-verified
 * to have exactly ONE inbound link (the sibling page header, now removed) and no
 * sidebar/menubar entry — but a bookmark or an old chat link must not 404.
 */
export const dynamic = "force-dynamic";

export default async function HsLibraryBotPage() {
  const locale = await getLocale();
  redirect({ href: "/admin/accounting/hs-library", locale });
}
