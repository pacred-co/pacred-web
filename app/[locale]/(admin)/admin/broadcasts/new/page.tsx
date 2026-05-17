import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NewBroadcastForm } from "./new-broadcast-form";

export const dynamic = "force-dynamic";

export default async function NewBroadcastPage() {
  await requireAdmin(["super", "sales_admin"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-2xl">
      <div>
        <Link href="/admin/broadcasts" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้ารายการ
        </Link>
        <h1 className="mt-1 text-2xl font-bold">สร้าง Broadcast ใหม่</h1>
        <p className="text-xs text-muted mt-1">
          เขียน title + body + เลือกกลุ่มลูกค้า → บันทึกเป็น draft → ส่งทันที / กำหนดเวลา
        </p>
      </div>
      <NewBroadcastForm />
    </main>
  );
}
