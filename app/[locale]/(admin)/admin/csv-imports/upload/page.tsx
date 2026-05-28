import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { UploadCsvForm } from "./upload-form";

export default async function CsvImportUploadPage() {
  // Pre-flight: verify the 'csv-imports' storage bucket exists. Migration
  // 0029_csv_imports.sql creates it; without that migration applied to
  // this Supabase project, the upload action would fail with a cryptic
  // "Bucket not found" error.
  const admin = createAdminClient();
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  const bucketReady = !listErr && (buckets ?? []).some((b) => b.id === "csv-imports");

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-2xl">
      <Link href="/admin/csv-imports" className="text-xs text-primary-600 hover:underline">
        ← กลับรายการ
      </Link>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">อัปโหลด CSV ใหม่</h1>
        <p className="mt-1 text-sm text-muted">
          อัปโหลดไฟล์ → ระบบจะพรีวิว 5 แถวแรกให้ตรวจ → กดยืนยันเพื่อนำเข้าจริง
        </p>
      </div>

      {!bucketReady && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-sm text-red-900 space-y-2">
          <p className="font-bold">⚠ ฟีเจอร์ยังใช้งานไม่ได้ — ต้องรัน migration ก่อน</p>
          <p>
            Storage bucket{" "}
            <code className="font-mono bg-white/60 px-1.5 py-0.5 rounded">csv-imports</code>{" "}
            ยังไม่มีใน Supabase project นี้
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-xs">
            <li>เปิด <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline">Supabase Dashboard</a> → SQL Editor → New query</li>
            <li>เปิดไฟล์ <code className="font-mono">supabase/migrations/0029_csv_imports.sql</code> → copy ทั้งหมด → paste → Run</li>
            <li>Refresh หน้านี้ — banner นี้จะหายไป</li>
          </ol>
          <p className="text-xs text-red-700 mt-2">
            หรือดู <code className="font-mono">supabase/migrations/README.md</code> สำหรับขั้นตอนรัน migration ทั้งหมด
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-xs text-amber-900 space-y-3">
        <p className="font-bold">📋 รูปแบบ CSV ที่รองรับ — มี 2 target</p>

        <div className="space-y-1">
          <p className="font-semibold">A. <code className="font-mono">forwarders</code> — สร้างรายการใหม่ (bulk INSERT)</p>
          <p>แถวแรก = header. ต้องมี:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li><code className="font-mono">profile_id</code> — UUID ของ customer</li>
            <li><code className="font-mono">source_warehouse</code> — <code>guangzhou</code> หรือ <code>yiwu</code></li>
            <li><code className="font-mono">transport_type</code> — <code>truck</code> / <code>ship</code> / <code>air</code></li>
            <li><code className="font-mono">product_type</code> — <code>general</code> / <code>tisi</code> / <code>fda</code> / <code>special</code></li>
          </ul>
          <p>ไม่บังคับ: <code className="font-mono">weight_kg</code>, <code className="font-mono">volume_cbm</code>, <code className="font-mono">total_price</code>, <code className="font-mono">tracking_china</code>, <code className="font-mono">note</code></p>
        </div>

        <div className="space-y-1 border-t border-amber-200 pt-3">
          <p className="font-semibold">B. <code className="font-mono">forwarders_update_by_tracking</code> — ปรับรายการอัตโนมัติ (legacy &quot;import-excel.php&quot;)</p>
          <p>Match รายการเดิมตาม <code className="font-mono">tracking_chn</code> → UPDATE ค่ากล่อง/น้ำหนัก/เลขตู้/สถานะ</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li><code className="font-mono">tracking_chn</code> — บังคับ</li>
            <li><code className="font-mono">cabinet_closed_date</code> — วันที่ปิดตู้ (เมื่อมี ระบบจะ bump status 1→2 / 2→3)</li>
            <li><code className="font-mono">source_warehouse</code> — รับ <code>GuangZhou</code>/<code>guangzhou</code> หรือ <code>Yiwu</code>/<code>อี้อู</code></li>
            <li><code className="font-mono">transport_type</code> — รับ <code>EK</code>/<code>truck</code> หรือ <code>SEA</code>/<code>ship</code></li>
            <li><code className="font-mono">cabinet_number</code>, <code className="font-mono">weight_kg</code>, <code className="font-mono">width_cm</code>, <code className="font-mono">length_cm</code>, <code className="font-mono">height_cm</code>, <code className="font-mono">volume_cbm</code>, <code className="font-mono">box_count</code>, <code className="font-mono">detail</code></li>
          </ul>
          <p>แถวที่ไม่พบ tracking ใน DB จะถูกข้าม (count ใน &quot;skipped&quot;) ไม่ใช่ error</p>
        </div>

        <p className="text-amber-700 border-t border-amber-200 pt-2">
          ขีดจำกัด: ไฟล์ ≤ 5 MB, ≤ 1000 แถวต่อรอบ. แนะนำใช้ encoding UTF-8 รองรับภาษาไทย/จีน
        </p>
      </div>

      <UploadCsvForm disabled={!bucketReady} />
    </main>
  );
}
