import { requireAdmin } from "@/lib/auth/require-admin";
import { Box } from "lucide-react";

export default async function InventoryPage() {
  await requireAdmin();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">คลังสินค้า</h1>
        <p className="text-sm text-muted mt-1">จัดการคลังสินค้า</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-surface py-20 text-center">
        <Box className="h-10 w-10 text-muted mb-4" />
        <p className="text-base font-semibold text-foreground">กำลังพัฒนา</p>
        <p className="text-sm text-muted mt-1">ระบบคลังสินค้าจะเปิดใช้งานในเร็วๆ นี้</p>
      </div>
    </div>
  );
}
