/**
 * /admin/system-reports — "ออกรายงานระบบ" (System Reports)
 * 2026-07-28 (ปอน) — nav entry in lib/admin/sidebar-menu.ts (itemSystemReports ·
 * menuSuper "Reports" section, separate from Additional Services).
 * 2026-07-29 (ปอน) — ประเภทรายงาน "ค่าคอมมิชชั่น" · ตำแหน่ง "เซลล์" → per-order
 * commission dataset (ตามภาพ legacy · แบ่งเดือนตามวันลูกค้าจ่ายจริง). ค่าคอมมิชชั่น
 * ยังไม่คำนวณ (ปอน สั่ง) · ตำแหน่งอื่น/cs = ทำต่อ.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin/page-header";
import { getActiveSalesReps } from "@/lib/admin/sales-roster";
import { getSalesCommissionReport } from "@/lib/admin/sales-commission-report";
import { ReportFilters } from "./report-filters";
import { CommissionTable } from "./commission-table";

export const dynamic = "force-dynamic";

export default async function SystemReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const reps = await getActiveSalesReps();

  // default range = the current calendar month (1st → last day)
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  const defaultFrom = `${y}-${mm}-01`;
  const defaultTo = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const type = sp.type ?? "commission";
  const position = sp.pos ?? "sales";
  const rep = sp.rep ?? "";
  const dateFrom = sp.from ?? defaultFrom;
  const dateTo = sp.to ?? defaultTo;

  const isCommissionSales = type === "commission" && position === "sales";
  const report =
    isCommissionSales && rep
      ? await getSalesCommissionReport({ position: "sales", repId: rep, dateFrom, dateTo })
      : null;
  const repName = reps.find((r) => r.adminID === rep)?.name ?? "";

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageHeader eyebrow="REPORTS" title="ออกรายงานระบบ" subtitle="เลือกตัวกรองเพื่อออกรายงาน" />

      <ReportFilters
        reps={reps.map((r) => ({ id: r.adminID, name: r.name }))}
        curType={type}
        curPosition={position}
        curRep={rep}
        curFrom={dateFrom}
        curTo={dateTo}
      />

      {report && <CommissionTable report={report} repName={repName} />}

      {isCommissionSales && !rep && (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center text-sm text-muted">
          เลือก <span className="font-medium text-foreground">ผู้รับผิดชอบ (เซลล์)</span> + ปี/เดือน แล้วกด “ค้นหาข้อมูล”
        </div>
      )}

      {type === "commission" && position !== "sales" && (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center text-sm text-muted">
          ตอนนี้รองรับเฉพาะตำแหน่ง <span className="font-medium text-foreground">“เซลล์”</span> ก่อน — ตำแหน่งอื่นกำลังทำต่อ
        </div>
      )}
    </div>
  );
}
