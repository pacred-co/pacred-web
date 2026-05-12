import { requireAdmin } from "@/lib/auth/require-admin";
import { BarChart3 } from "lucide-react";

export default async function ReportsPage() {
  await requireAdmin();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">รายงาน</h1>
        <p className="text-sm text-muted mt-1">รายงานภาพรวมระบบ</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-surface py-20 text-center">
        <BarChart3 className="h-10 w-10 text-muted mb-4" />
        <p className="text-base font-semibold text-foreground">กำลังพัฒนา</p>
        <p className="text-sm text-muted mt-1">ระบบรายงานจะเปิดใช้งานในเร็วๆ นี้</p>
      </div>
    </div>
  );
}
