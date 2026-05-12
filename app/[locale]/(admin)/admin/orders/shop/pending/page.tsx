import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">ฝากสั่งสินค้า — รอดำเนินการ</h1>
        <p className="text-sm text-muted mt-1">ออเดอร์ที่ยังรอการจัดการ</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-surface py-20 text-center">
        <p className="text-base font-semibold text-foreground">กำลังพัฒนา</p>
        <p className="text-sm text-muted mt-1">รัน migration 0004 ใน Supabase แล้วระบบจะพร้อมใช้งาน</p>
      </div>
    </div>
  );
}
