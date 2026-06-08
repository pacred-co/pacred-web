/**
 * /admin/warehouse/bulletin — บุลเลตินตู้คอนเทนเนอร์รายวัน (REVIVED 2026-06-09).
 *
 * Faithful re-build of the U2-1 daily bulletin (which had been TOMBSTONED in
 * D1 Wave 3 because it ran on the retired warehouse "spine" tables). It now
 * reads the legacy `tb_forwarder` spine — grouped by `fcabinetnumber`, exactly
 * the data the `/admin/report-cnt` port reads — via
 * `lib/warehouse/container-bulletin.ts`.
 *
 * This page renders TODAY's bulletin (the same message the
 * `/api/cron/container-bulletin` cron pushes to the staff LINE group every
 * morning) read-only, with a copy-to-clipboard box so staff can paste it into
 * LINE manually if the auto-push isn't configured yet.
 *
 * READ-ONLY · no money path · no writes.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildContainerBulletin,
  formatBulletinMessage,
} from "@/lib/warehouse/container-bulletin";
import { BulletinCopyBox } from "./copy-box";

export const dynamic = "force-dynamic";

export default async function BulletinPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  const admin = createAdminClient();
  const bulletin = await buildContainerBulletin(admin);
  const text = formatBulletinMessage(bulletin);

  const lineConfigured = Boolean(process.env.LINE_STAFF_GROUP_ID);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ปฏิบัติการ</p>
        <h1 className="mt-1 text-2xl font-bold">บุลเลตินตู้คอนเทนเนอร์รายวัน</h1>
        <p className="mt-1 text-sm text-muted">
          สรุปตู้ที่อยู่ระหว่างขนส่ง จัดกลุ่มตามหมายเลขตู้ (fCabinetNumber) — อ่านจาก{" "}
          <code className="bg-surface-alt/40 px-1 rounded">tb_forwarder</code> โดยตรง
        </p>
      </div>

      {/* Headline counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="ตู้ทั้งหมด (in-flight)" value={bulletin.totalCabinets} />
        <StatCard label="พัสดุรวม" value={bulletin.totalParcels} />
        <StatCard label="🟫 ถึงไทยแล้ว" value={bulletin.arrived.length} />
        <StatCard label="🟦 พร้อมส่ง" value={bulletin.ready.length} />
      </div>

      {/* Auto-push status note */}
      <div
        className={`rounded-xl border p-4 text-sm ${
          lineConfigured
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {lineConfigured ? (
          <p>
            ✅ บุลเลตินนี้ถูกส่งเข้ากลุ่ม LINE ทีมงานอัตโนมัติทุกเช้า (07:00 ICT) ผ่าน cron{" "}
            <code className="bg-green-100 px-1 rounded">/api/cron/container-bulletin</code>
          </p>
        ) : (
          <p>
            ⚠️ ยังไม่ได้ตั้งค่ากลุ่ม LINE ทีมงาน (<code className="bg-amber-100 px-1 rounded">LINE_STAFF_GROUP_ID</code>)
            — cron จะสร้างบุลเลตินทุกเช้าแต่ยังไม่ push เข้ากลุ่ม. ระหว่างนี้กดคัดลอกด้านล่างแล้ว paste ลง LINE ได้เลย.
          </p>
        )}
      </div>

      {/* The exact message the cron sends — read-only + copy */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-foreground">ข้อความบุลเลตินวันนี้ ({bulletin.dateIct})</h2>
        <BulletinCopyBox text={text} />
      </section>

      <Link
        href="/admin/report-cnt"
        className="inline-block rounded-lg border border-primary-500 px-4 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50"
      >
        ดูรายงานตู้แบบเต็ม →
      </Link>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</p>
    </div>
  );
}
