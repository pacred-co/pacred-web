/**
 * /admin/workspace/booking/other — "อื่นๆ" (Booking)
 * 2026-07-08 (ปอน · scaffold "ขึ้นแถบเฉยๆ") — blank placeholder page. The nav
 * entry lives in lib/admin/sidebar-menu.ts (blockWorkspaceBooking); the real
 * destination is TBD.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function WorkspaceBookingOtherPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WORKSPACE · BOOKING"
        title="อื่นๆ"
        subtitle="หน้านี้ยังว่าง (placeholder) — รอกำหนดเนื้อหา"
      />
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-12 text-center text-sm text-muted">
        ยังไม่มีเนื้อหาในหน้านี้
      </div>
    </div>
  );
}
