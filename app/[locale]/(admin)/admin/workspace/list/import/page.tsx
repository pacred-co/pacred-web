/**
 * /admin/workspace/list/import — "รายการ · นำเข้า"
 *
 * 2026-07-08 (ปอน) — the import-job tracking board. Mirrors the legacy "3.1 DOC DATA /
 * COMMISSION / ข้อมูลงาน" Google-Sheet: confirmed import jobs (data flows from the Booking
 * board — a เฟิร์ม booking → customer registers → PR code + shipment no → appears here).
 * Top status-chip bar = the sheet's "สถานะ" column (Doc updates it as the shipment moves).
 *
 * Data = SEED_IMPORT_LIST (sample from that sheet · NOT yet a DB table — ปอน is finalizing
 * the model). When the real table/action lands, replace the seed with a server query here.
 * See memory: pacred-booking-flow.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin/page-header";
import { ListImportBoard } from "./list-import-board";
import { SEED_IMPORT_LIST } from "./list-data";

export const dynamic = "force-dynamic";

export default async function WorkspaceListImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="WORKSPACE · รายการ"
        title="รายการ · นำเข้า"
        subtitle="งานนำเข้าที่ลูกค้าเฟิร์มแล้ว (ไหลมาจากหน้า Booking) — Doc เดินเอกสาร + อัปเดตสถานะ · Sales/CS ติดตามให้ลูกค้า"
        badges={
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            ตัวอย่างข้อมูล · รอเชื่อมฐานข้อมูลจริง
          </span>
        }
      />
      <ListImportBoard initial={SEED_IMPORT_LIST} />
    </div>
  );
}
