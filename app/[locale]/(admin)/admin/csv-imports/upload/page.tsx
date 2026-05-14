import { Link } from "@/i18n/navigation";
import { UploadCsvForm } from "./upload-form";

export default function CsvImportUploadPage() {
  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-2xl">
      <Link href="/admin/csv-imports" className="text-xs text-primary-600 hover:underline">
        ← กลับรายการ
      </Link>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">อัปโหลด CSV ใหม่</h1>
        <p className="mt-1 text-sm text-muted">
          อัปโหลดไฟล์ → ระบบจะพรีวิว 5 แถวแรกให้ตรวจ → กดยืนยันเพื่อนำเข้าจริง
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-xs text-amber-900 space-y-2">
        <p className="font-bold">📋 รูปแบบ CSV ที่รองรับ (target = forwarders)</p>
        <p>แถวแรก = header ตรงกับชื่อคอลัมน์ใน DB. ต้องมี:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><code className="font-mono">profile_id</code> — UUID ของ customer</li>
          <li><code className="font-mono">source_warehouse</code> — <code>guangzhou</code> หรือ <code>yiwu</code></li>
          <li><code className="font-mono">transport_type</code> — <code>truck</code> / <code>ship</code> / <code>air</code></li>
          <li><code className="font-mono">product_type</code> — <code>general</code> / <code>tisi</code> / <code>fda</code> / <code>special</code></li>
        </ul>
        <p>ไม่บังคับ:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><code className="font-mono">weight_kg</code>, <code className="font-mono">volume_cbm</code>, <code className="font-mono">total_price</code> — ตัวเลข</li>
          <li><code className="font-mono">tracking_china</code>, <code className="font-mono">note</code> — text</li>
        </ul>
        <p className="text-amber-700">
          ขีดจำกัด: ไฟล์ ≤ 5 MB, ≤ 1000 แถวต่อรอบ. f_no จะถูก auto-gen ตอน insert.
        </p>
      </div>

      <UploadCsvForm />
    </main>
  );
}
