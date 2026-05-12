import { ScanForm } from "./scan-form";

export default function AdminBarcodePage() {
  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · WAREHOUSE</p>
        <h1 className="mt-1 text-2xl font-bold">📸 ระบบบาร์โค้ด</h1>
        <p className="mt-1 text-sm text-muted">
          สแกนบาร์โค้ดบน package เพื่อ <strong>รับเข้าโกดัง</strong> / <strong>เตรียมส่ง</strong> / <strong>ปล่อยคนขับ</strong> — เลขที่รองรับคือ f_no, h_no, tracking CN/TH, หรือเลขตู้
        </p>
      </div>
      <ScanForm />
    </main>
  );
}
