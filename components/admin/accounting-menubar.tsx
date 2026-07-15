import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { getAccountingBadges, applyMenubarBadges } from "@/lib/admin/accounting-badges";

/**
 * Server wrapper around <PageTopMenubar> for the accounting hub. Fetches the
 * live "งานค้าง" backlog counts (60s-cached) + overlays them onto CARGO_MENUBAR
 * so every heading (รายรับ / การเงิน / …) shows a pending-work count, and each
 * queue leaf carries its own number (owner 2026-07-06). Drop-in replacement
 * for `<PageTopMenubar items={CARGO_MENUBAR} activeHref={…} />`.
 */
export async function AccountingMenubar({ activeHref }: { activeHref?: string }) {
  const badges = await getAccountingBadges();
  // variant="legacy-blue" — the accounting cluster mirrors the legacy PCS
  // `acc-system-cargo.php` blue header bar (#6C6DF2 → #44E5E6). ภูม 2026-07-15.
  return (
    <PageTopMenubar
      items={applyMenubarBadges(CARGO_MENUBAR, badges)}
      activeHref={activeHref}
      variant="legacy-blue"
    />
  );
}
