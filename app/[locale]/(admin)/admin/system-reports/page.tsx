/**
 * /admin/system-reports — "ออกรายงานระบบ" (System Reports)
 * 2026-07-28 (ปอน) — nav entry in lib/admin/sidebar-menu.ts (itemSystemReports ·
 * menuSuper "Reports" section, separate from Additional Services).
 * 2026-07-29 (ปอน) — ประเภทรายงาน "ค่าคอมมิชชั่น" · เซลล์/Cs = ฝากนำเข้า (forwarder ·
 * adminIDSale/adminIDCS · sales-commission-report). สั่งซื้อ = ฝากสั่งซื้อ (shop/tb_header_order ·
 * adminidpurchaser · purchase-commission-report · คอลัมน์ COST/DISCOUNT/DIFF/EX/%/TOTAL ตามภาพ).
 * เฉพาะงานที่ลูกค้าจ่ายแล้ว · แบ่งเดือนตามวันจ่าย · ค่าคอมยังไม่คำนวณ · คนขับ/โกดัง = ทำต่อ.
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getStafferPositionInfo } from "@/lib/admin/positions";
import { canViewSystemReports, canViewContainerProfit } from "@/lib/admin/reports-access";
import { PageHeader } from "@/components/admin/page-header";
import { getActiveSalesReps, getActiveCsReps, getActivePurchaserReps, getActiveDriverReps } from "@/lib/admin/sales-roster";
import { getSalesCommissionReport } from "@/lib/admin/sales-commission-report";
import { getPurchaseCommissionReport } from "@/lib/admin/purchase-commission-report";
import { getDriverWorkReport } from "@/lib/admin/driver-work-report";
import { getWarehouseWorkReport, getActiveWarehouseReps } from "@/lib/admin/warehouse-work-report";
import { getContainerProfitByMonth } from "@/lib/admin/container-cost-rollup";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportFilters } from "./report-filters";
import { CommissionTable } from "./commission-table";
import { PurchaseTable } from "./purchase-table";
import { DriverTable } from "./driver-table";
import { WarehouseTable } from "./warehouse-table";
import { ContainerProfitTable } from "./container-profit-table";

export const dynamic = "force-dynamic";

export default async function SystemReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 🔒 gate = ultra หรือ HR (owner 2026-07-30 "ทำฟังชั่นนี้ให้ HR เห็นและใช้ได้").
  // HR = แผนก (admin_positions.department='hr') ไม่ใช่ money-tier role → SOT
  // canViewSystemReports (lib/admin/reports-access.ts) ตัดสินที่เดียวให้ page + sidebar
  // ตรงกัน. คงกัน driver/warehouse พิมพ์ URL ตรง (§0d/§0c gap) — role พวกนั้น + แผนกอื่น
  // ยัง notFound. (เดิม strictly "ultra"; ตอนนี้ ultra ∪ HR.)
  const { user, roles } = await requireAdmin();
  const posInfo = await getStafferPositionInfo(user.id);
  if (!canViewSystemReports(roles, posInfo.department)) notFound();
  // แท็บ "กำไรตู้" = margin ต่อตู้ (ข้อมูลผู้บริหาร) → ultra เท่านั้น · HR เห็นหน้าแต่ไม่เห็นแท็บนี้
  const allowContainerProfit = canViewContainerProfit(roles);
  const sp = await searchParams;

  // ผู้รับผิดชอบ = รายชื่อตาม "ตำแหน่ง" — เซลล์/Cs = tb_admin flag · สั่งซื้อ = ผู้สั่งซื้อ
  // (roster = tb_header_order.adminidpurchaser ที่ assign จริง) · คนขับ/โกดัง ยังไม่มี roster
  const [salesReps, csReps, purchaserReps, driverReps, warehouseReps] = await Promise.all([
    getActiveSalesReps(),
    getActiveCsReps(),
    getActivePurchaserReps(),
    getActiveDriverReps(),
    getActiveWarehouseReps(),
  ]);
  const reps = [
    ...salesReps.map((r) => ({ position: "sales", id: r.adminID, name: r.name })),
    ...csReps.map((r) => ({ position: "cs", id: r.adminID, name: r.name })),
    ...purchaserReps.map((r) => ({ position: "purchase", id: r.adminID, name: r.name })),
    ...driverReps.map((r) => ({ position: "driver", id: r.adminID, name: r.name })),
    ...warehouseReps.map((r) => ({ position: "warehouse", id: r.adminID, name: r.name })),
  ];

  // default range = the current calendar month (1st → last day)
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  const defaultFrom = `${y}-${mm}-01`;
  const defaultTo = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;

  // HR ที่พิมพ์ ?type=container-profit ตรงๆ → บังคับกลับเป็น commission (กันเห็น margin ผ่าน URL)
  const rawType = sp.type ?? "commission";
  const type = rawType === "container-profit" && !allowContainerProfit ? "commission" : rawType;
  const position = sp.pos ?? "sales";
  const rep = sp.rep ?? "";
  const dateFrom = sp.from ?? defaultFrom;
  const dateTo = sp.to ?? defaultTo;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const sort = sp.sort; // คอลัมน์ที่เรียง (หัวตารางกดเรียง) · dir = asc|desc
  const dir = sp.dir;

  const isCommission = type === "commission";
  // กำไรตู้รายเดือน (owner 2026-07-29): ทั้งระบบ · เดือนอ่านจากเลขตู้ · PR-only —
  // ไม่ใช้ pos/rep/date เลย (ตัวกรองฝั่ง client ซ่อนให้แล้ว)
  const containerProfit =
    type === "container-profit" ? await getContainerProfitByMonth(createAdminClient()) : null;
  // เซลล์/Cs = ฝากนำเข้า (forwarder report) · สั่งซื้อ = ฝากสั่งซื้อ (shop report · คนละ data source)
  const fwdPosition: "sales" | "cs" | null =
    position === "sales" ? "sales" : position === "cs" ? "cs" : null;
  const isPurchase = position === "purchase";
  const isDriver = position === "driver";
  const isWarehouse = position === "warehouse";
  // rep ว่าง = "ทั้งหมด" → ดึงทุกคนของตำแหน่งนั้นรวมกัน (ไม่ต้องเลือกก่อน)
  const fwdReport =
    isCommission && fwdPosition
      ? await getSalesCommissionReport({ position: fwdPosition, repId: rep, dateFrom, dateTo, page, sort, dir })
      : null;
  const purchaseReport =
    isCommission && isPurchase
      ? await getPurchaseCommissionReport({ repId: rep, dateFrom, dateTo, page, sort, dir })
      : null;
  const driverReport =
    isCommission && isDriver
      ? await getDriverWorkReport({ repId: rep, dateFrom, dateTo, page, sort, dir })
      : null;
  const warehouseReport =
    isCommission && isWarehouse
      ? await getWarehouseWorkReport({ repId: rep, dateFrom, dateTo, page, sort, dir })
      : null;
  const repName = rep
    ? (reps.find((r) => r.position === position && r.id === rep)?.name ?? "")
    : "ทั้งหมด";
  const positionLabel = position === "cs" ? "Cs" : "เซลล์";

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
        allowContainerProfit={allowContainerProfit}
      />

      {fwdReport && (
        <CommissionTable report={fwdReport} repName={repName} page={page} positionLabel={positionLabel} />
      )}

      {purchaseReport && <PurchaseTable report={purchaseReport} repName={repName} page={page} />}

      {driverReport && <DriverTable report={driverReport} repName={repName} page={page} />}

      {warehouseReport && <WarehouseTable report={warehouseReport} repName={repName} page={page} />}

      {containerProfit && <ContainerProfitTable data={containerProfit} />}
    </div>
  );
}
