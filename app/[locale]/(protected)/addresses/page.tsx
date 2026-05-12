import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listAddresses } from "@/actions/addresses";
import { AddressesManager } from "./addresses-manager";

export default async function AddressesPage() {
  const res = await listAddresses();
  const addresses = res.ok ? (res.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ที่อยู่จัดส่ง</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">จัดการที่อยู่</h1>
            <p className="mt-1 text-sm text-muted">
              เพิ่ม / แก้ไข / ตั้งที่อยู่หลัก ที่จะใช้เป็นค่าเริ่มต้นตอนนำเข้าและฝากสั่งซื้อ
            </p>
          </div>
          <Link
            href="/profile"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            ← กลับโปรไฟล์
          </Link>
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
