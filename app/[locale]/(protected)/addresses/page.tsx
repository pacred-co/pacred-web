import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listAddresses } from "@/actions/addresses";
import { AddressesManager } from "./addresses-manager";
import { MapPin, ChevronRight, Home } from "lucide-react";

export default async function AddressesPage() {
  const res = await listAddresses();
  const addresses = res.ok ? (res.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">ที่อยู่จัดส่งสินค้า</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                <MapPin className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">ที่อยู่จัดส่งสินค้าในไทย 🇹🇭</h1>
                <p className="text-xs text-muted mt-0.5">บันทึกที่อยู่ไว้ใช้กับการสั่งซื้อ — ตั้ง <b>ที่อยู่หลัก</b> 1 ที่ ระบบจะเลือกให้อัตโนมัติเวลาเปิดบิล</p>
              </div>
            </div>
            <Link
              href="/profile"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ← กลับโปรไฟล์
            </Link>
          </div>
        </div>

        {!res.ok && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดที่อยู่ไม่สำเร็จ: {res.error}
          </div>
        )}

        <AddressesManager initialAddresses={addresses} />
      </main>
      <Footer />
    </>
  );
}
