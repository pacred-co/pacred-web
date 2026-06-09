import { type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Shared "ฝากนำเข้า — แบบเต็ม / แบบตาราง" view-toggle tab strip, rendered
 * IDENTICALLY on both /service-import (full) and /service-import/table so
 * switching between the two no longer "jumps" (owner 2026-06-09: "เอาให้
 * เหมือนกัน สองหน้าสลับกันแล้วแปลกๆ"). Before this, each page had its own
 * inline strip with different font sizes, borders, active styles, mobile
 * layouts and i18n keys.
 *
 * Design (from the table page — the more complete one):
 *   - MOBILE: two full-width stacked segments (active = red fill, inactive = grey)
 *   - DESKTOP: inline underline tabs (active = red text + red underline)
 */
// Active = red text + red underline on BOTH mobile and desktop (mobile also
// gets a light-red fill so the segment reads as selected). Deliberately NOT a
// white-on-red fill — `md:text-[…]` overrides proved unreliable and left the
// desktop label white-on-white (invisible). Red text is readable everywhere.
const TAB_BASE =
  "w-auto inline-flex items-center md:items-end justify-center md:justify-start gap-1.5 md:gap-2 rounded-lg md:rounded-none border md:border-0 md:border-b-[3px] px-3 md:px-4 py-2 md:py-2.5 md:pb-2.5 text-sm md:text-xl whitespace-nowrap transition-colors";
const TAB_ACTIVE =
  "border-red-600 bg-red-50 md:bg-transparent font-bold text-red-600";
const TAB_INACTIVE =
  "border-border md:border-transparent bg-surface-alt/60 md:bg-transparent font-medium text-muted hover:text-foreground md:hover:border-border";

export async function ImportViewTabs({
  active,
  action,
}: {
  active: "full" | "table";
  /** Optional right-aligned slot on the tab row (e.g. the "+ เพิ่มรายการนำเข้า"
   *  CTA) — sits next to the tabs on desktop, above them on mobile (ปอน
   *  2026-06-09 "ขยับปุ่มขึ้นไปแถว tabs"). */
  action?: ReactNode;
}) {
  const t = await getTranslations("importViewTabs");
  return (
    <div className="border-b border-border px-3 pt-3 md:px-4 md:pt-4">
      <div className="flex flex-row items-center justify-between gap-2 md:items-end md:gap-3">
        <ul className="flex flex-row gap-1.5 md:gap-0 md:overflow-x-auto md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
          <li className="md:shrink-0">
            <Link
              href="/service-import"
              aria-current={active === "full" ? "page" : undefined}
              className={`${TAB_BASE} ${active === "full" ? TAB_ACTIVE : TAB_INACTIVE}`}
            >
              <span aria-hidden className="ft-box" />
              <span className="sm:hidden">{t("fullViewShort")}</span>
              <span className="hidden sm:inline">{t("fullView")}</span>
            </Link>
          </li>
          <li className="md:shrink-0">
            <Link
              href="/service-import/table"
              aria-current={active === "table" ? "page" : undefined}
              className={`${TAB_BASE} ${active === "table" ? TAB_ACTIVE : TAB_INACTIVE}`}
            >
              <span aria-hidden className="fas fa-table" />
              <span className="sm:hidden">{t("tableViewShort")}</span>
              <span className="hidden sm:inline">{t("tableView")}</span>
            </Link>
          </li>
        </ul>
        {action && (
          <div className="flex shrink-0 md:pb-2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
