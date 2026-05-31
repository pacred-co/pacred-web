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
        <h1 className="mt-1 text-2xl font-bold">เพิ่ม Pop-up ประกาศ</h1>
        <p className="text-xs text-muted mt-1">
          ประกาศนี้จะเด้งหา <strong>ลูกค้าทุกคน</strong> ตอน login ในช่วงวันที่กำหนด จนกว่าจะกด &quot;รับทราบ&quot;
        </p>
      </div>
      <NewBroadcastForm />
    </main>
  );
}
