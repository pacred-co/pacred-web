import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NewShipmentForm } from "./new-shipment-form";

export const dynamic = "force-dynamic";

export default async function NewFreightShipmentPage() {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <Link href="/admin/freight/shipments" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้ารายการ
        </Link>
        <h1 className="mt-1 text-2xl font-bold">สร้างงานขนส่ง freight ใหม่</h1>
        <p className="text-xs text-muted mt-1">
          กรอก customer + logistics → ระบบจะจองเลข job_no (A{`{YY}`}{`{NNNNN}`}) → ไปหน้า detail เพื่อกรอก parties + commercial value + line items
        </p>
      </div>
      <NewShipmentForm />
    </main>
  );
}
