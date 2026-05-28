import { FloatingTabs } from "@/components/sections/floating-tabs";

/**
 * Layout for the (public) marketing route group.
 *
 * 2026-05-25 — `<FloatingTabs />` previously rendered at the locale
 * layout, which leaked the marketing mobile-CTA bar + LINE chat
 * bubble onto `/(protected)` (the customer portal already has its
 * own legacy bottom nav `<PcsFooterNav />` + chrome), `/(admin)`
 * (admin doesn't need a customer-CTA), and `/(auth)` (login pages
 * shouldn't show marketing CTAs). Moving the mount here gates the
 * floating tabs to public pages only — no per-page opt-in needed.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <FloatingTabs />
    </>
  );
}
