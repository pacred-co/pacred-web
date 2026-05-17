import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NewRefundForm } from "./new-refund-form";

/**
 * U1-6 — /admin/refunds/new
 *
 * Admin creates a refund request on behalf of a customer. Used for:
 *   - Carrier-change over-collection (admin notices Pacred over-billed)
 *   - Cancel-after-paid bookkeeping when ops cancels a paid order
 *   - Manual / generic claims that don't tie to a specific order
 *
 * The customer can also self-request via /refunds (which excludes source=manual).
 */

export const dynamic = "force-dynamic";

export default async function NewAdminRefundPage() {
  await requireAdmin(["super", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <Link href="/admin/refunds" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้ารายการ
        </Link>
        <h1 className="mt-1 text-2xl font-bold">สร้างคำขอคืนเงิน (admin → ลูกค้า)</h1>
        <p className="text-xs text-muted mt-1">
          คำขอที่สร้างที่นี่จะอยู่ในสถานะ pending — ยังต้อง approve + mark-paid อีก 2 step เพื่อตัดเงินจริง
        </p>
      </div>
      <NewRefundForm />
    </main>
  );
}
