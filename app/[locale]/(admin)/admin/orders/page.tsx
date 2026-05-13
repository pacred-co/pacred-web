import { requireAdmin } from "@/lib/auth/require-admin";
import { ShoppingCart } from "lucide-react";

export default async function OrdersPage() {
  await requireAdmin();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Shop Orders</h1>
        <p className="text-sm text-muted mt-1">รายการ Shop Orders ทั้งหมด</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-surface py-20 text-center">
        <ShoppingCart className="h-10 w-10 text-muted mb-4" />
        <p className="text-base font-semibold text-foreground">กำลังพัฒนา</p>
        <p className="text-sm text-muted mt-1">ระบบ Shop Orders จะเปิดใช้งานในเร็วๆ นี้</p>
      </div>
    </div>
  );
}
