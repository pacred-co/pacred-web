import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { buildDailyBulletin } from "@/lib/warehouse/bulletin";
import { BulletinCopyBox } from "./copy-box";

/**
 * /admin/warehouse/bulletin — daily container bulletin auto-generator (U2-1).
 *
 * Per chat audit W-1: staff posts a recurring DD/MM/YY summary to
 * MOMO + DOC SHIPPING LINE groups in a specific format. Today this is
 * a 5-10 minute manual exercise. This page generates the exact format
 * from live cargo_containers state — admin copies once + pastes.
 *
 * Roles: super OR ops OR warehouse (everyone who works the warehouse spine).
 * Layout guard already enforces admin gate.
 */
export default async function BulletinPage() {
  const admin = createAdminClient();
  const bulletin = await buildDailyBulletin(admin);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ปฏิบัติการ</p>
          <h1 className="mt-1 text-2xl font-bold">บุลเลตินตู้คอนเทนเนอร์รายวัน</h1>
          <p className="mt-1 text-sm text-muted">
            สร้างข้อความสรุปสำหรับ paste ลง LINE (MOMO / DOC SHIPPING / ทีมงาน) — รูปแบบเดียวกับที่ทีมพิมพ์มือทุกวัน
          </p>
        </div>
        <Link
          href="/admin/warehouse/containers"
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
        >
          ← กลับหน้าตู้
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="วันที่"        value={bulletin.date_label} mono />
        <Stat label="ตู้ค้าง"        value={`${bulletin.pending_lines.length}`} />
        <Stat label="ตู้ใหม่วันนี้"   value={`${bulletin.new_lines.length}`} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">ตัวอย่างที่จะส่ง</h2>
          <span className="text-[10px] text-muted">รูปแบบ: DD/MM/YY · #ค้าง · ##ใหม่</span>
        </div>

        <BulletinCopyBox text={bulletin.text} />

        {bulletin.total_count === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ ไม่มีตู้ที่เปิดอยู่ใน pipeline (ทุกตู้สถานะ closed) — บุลเลตินจะว่าง.
            ถ้าคิดว่ามีตู้เปิด ให้เช็คใน <Link href="/admin/warehouse/containers" className="underline">/admin/warehouse/containers</Link>
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface-alt/40 p-4 text-xs space-y-1.5">
        <p className="font-bold">หลักการ:</p>
        <ul className="list-disc pl-5 space-y-0.5 text-muted">
          <li><span className="font-medium">ค้าง</span> = ตู้ที่อยู่ใน pipeline ก่อนวันนี้ (ยังไม่ closed)</li>
          <li><span className="font-medium">ใหม่</span> = ตู้ที่ created ใน Bangkok timezone วันนี้</li>
          <li>เรียงตาม updated_at ล่าสุด — ตู้ที่ขยับล่าสุดอยู่บนสุด</li>
          <li>Refresh page → regenerate ทันที (ข้อมูลใหม่จากตู้ที่อัพเดท)</li>
        </ul>
      </div>
    </main>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
      <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
