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
import { getActiveSalesReps, getActiveCsReps } from "@/lib/admin/sales-roster";
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

  // ผู้รับผิดชอบ = รายชื่อตาม "ตำแหน่ง" — เซลล์/Cs มี roster จริง (tb_admin flags)
  // ตำแหน่งอื่น (สั่งซื้อ/คนขับ/โกดัง) ยังไม่มี roster → ว่างไว้ก่อน (รายงานยังขึ้น "กำลังทำต่อ")
  const [salesReps, csReps] = await Promise.all([getActiveSalesReps(), getActiveCsReps()]);
  const reps = [
    ...salesReps.map((r) => ({ position: "sales", id: r.adminID, name: r.name })),
    ...csReps.map((r) => ({ position: "cs", id: r.adminID, name: r.name })),
  ];

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
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const isCommissionSales = type === "commission" && position === "sales";
  // rep ว่าง = "ทั้งหมด" → ดึงทุกเซลล์รวมกัน (ไม่ต้องเลือกก่อน)
  const report = isCommissionSales
    ? await getSalesCommissionReport({ position: "sales", repId: rep, dateFrom, dateTo, page })
    : null;
  const repName = rep
    ? (reps.find((r) => r.position === position && r.id === rep)?.name ?? "")
    : "ทั้งหมด";

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageHeader eyebrow="REPORTS" title="ออกรายงานระบบ" subtitle="เลือกตัวกรองเพื่อออกรายงาน" />

      <ReportFilters
        reps={reps}
        curType={type}
        curPosition={position}
        curRep={rep}
        curFrom={dateFrom}
        curTo={dateTo}
      />

      {report && <CommissionTable report={report} repName={repName} page={page} />}

      {type === "commission" && position !== "sales" && (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center text-sm text-muted">
          ตอนนี้รองรับเฉพาะตำแหน่ง <span className="font-medium text-foreground">“เซลล์”</span> ก่อน — ตำแหน่งอื่นกำลังทำต่อ
        </div>
      )}
    </div>
  );
}
