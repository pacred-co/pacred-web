import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NewQuoteForm } from "./new-quote-form";

/**
 * V-E6 — /admin/freight/quotes/new
 *
 * Create a draft quote. After insert, redirects to detail page for line-item
 * entry.
 */

export const dynamic = "force-dynamic";

export default async function NewFreightQuotePage() {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <Link href="/admin/freight/quotes" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้ารายการ
        </Link>
        <h1 className="mt-1 text-2xl font-bold">สร้างใบเสนอราคาใหม่ (ร่าง)</h1>
        <p className="text-xs text-muted mt-1">
          กรอก header → บันทึก → ระบบจะพาไปหน้า detail เพื่อเพิ่ม line items
        </p>
      </div>
      <NewQuoteForm />
    </main>
  );
}
