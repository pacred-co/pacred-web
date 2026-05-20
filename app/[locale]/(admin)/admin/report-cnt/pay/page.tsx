/**
 * /admin/report-cnt/pay — ทำรายการจ่ายเงินตู้
 *
 * Faithful port of the form half of `report-cnt.php` (L4-101 = the POST
 * handler; L502-505 = the trigger button). Wave 2D-min stub:
 *   - Lists unpaid containers (tb_forwarder rows GROUP BY fCabinetNumber
 *     where the container is NOT in tb_cnt_item).
 *   - Multi-select via checkbox.
 *   - Form: nameBlank · noBlank · nameAccount · cntAmount · cntFile (PDF).
 *   - Submits to `adminCreateCntPayment` server action (Agent 4 built).
 *
 * Wave 3 polish (deferred):
 *   - DataTables sort/filter on the unpaid list (legacy used jQuery DT).
 *   - SweetAlert success toast (legacy L676+).
 *   - Inline PDF preview after upload.
 *   - Multi-select bulk actions (legacy "count-CNT" badge).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { CntPaymentForm } from "./cnt-payment-form";

export const dynamic = "force-dynamic";

const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};

export default async function ReportCntPayPage() {
  await requireAdmin(["super", "ops", "accounting"]);

  const admin = createAdminClient();

  // Unpaid containers — tb_forwarder rows whose fCabinetNumber is NOT in
  // tb_cnt_item. We materialise the "paid set" first, then exclude.
  const [{ data: paidRows }, { data: allRows }] = await Promise.all([
    admin.from("tb_cnt_item").select("fcabinetnumber").limit(50_000),
    admin
      .from("tb_forwarder")
      .select("fcabinetnumber,fwarehousename,ftransporttype,fweight,fvolume,fcosttotalprice,ftotalprice,fdatecontainerclose")
      .not("fcabinetnumber", "is", null)
      .neq("fcabinetnumber", "")
      .neq("fcabinetnumber", "0")
      .gt("fstatus", "3")  // already arrived (fStatus>3 — eligible for cnt payment)
      .order("fdatecontainerclose", { ascending: false })
      .limit(50_000),
  ]);

  const paidSet = new Set((paidRows ?? []).map((r) => r.fcabinetnumber as string));

  // Group by fCabinetNumber and exclude already-paid
  type Agg = {
    fcabinetnumber: string;
    fwarehousename: string;
    ftransporttype: string;
    trackCount: number;
    weightSum: number;
    volumeSum: number;
    costSum: number;
    priceSum: number;
    closeDate: string | null;
  };
  const byContainer = new Map<string, Agg>();
  for (const r of (allRows ?? []) as unknown as Array<{
    fcabinetnumber: string;
    fwarehousename: string;
    ftransporttype: string;
    fweight: number | null;
    fvolume: number | null;
    fcosttotalprice: number | null;
    ftotalprice: number | null;
    fdatecontainerclose: string | null;
  }>) {
    if (paidSet.has(r.fcabinetnumber)) continue;
    const existing = byContainer.get(r.fcabinetnumber);
    if (existing) {
      existing.trackCount += 1;
      existing.weightSum += Number(r.fweight ?? 0);
      existing.volumeSum += Number(r.fvolume ?? 0);
      existing.costSum   += Number(r.fcosttotalprice ?? 0);
      existing.priceSum  += Number(r.ftotalprice ?? 0);
    } else {
      byContainer.set(r.fcabinetnumber, {
        fcabinetnumber:  r.fcabinetnumber,
        fwarehousename:  r.fwarehousename,
        ftransporttype:  r.ftransporttype,
        trackCount:      1,
        weightSum:       Number(r.fweight ?? 0),
        volumeSum:       Number(r.fvolume ?? 0),
        costSum:         Number(r.fcosttotalprice ?? 0),
        priceSum:        Number(r.ftotalprice ?? 0),
        closeDate:       r.fdatecontainerclose,
      });
    }
  }
  const unpaid = Array.from(byContainer.values()).sort(
    (a, b) => (b.closeDate ?? "").localeCompare(a.closeDate ?? ""),
  );

  return (
    <>
      <TopMenuReport activeHref="/admin/report-cnt" />
      <main className="p-4 lg:p-6 space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ACCOUNTING</p>
            <h1 className="mt-1 text-2xl font-bold">ทำรายการจ่ายเงินตู้</h1>
            <p className="mt-1 text-sm text-muted">
              เลือกตู้ที่ยังไม่จ่าย → กรอกข้อมูลการโอน + แนบ PDF สลิป → บันทึก
            </p>
          </div>
          <Link href="/admin/report-cnt" className="text-xs text-primary-600 hover:underline">
            ← กลับหน้ารายงานตู้
          </Link>
        </div>

        {unpaid.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center text-sm text-muted">
            ไม่มีตู้ที่ยังไม่จ่าย — ทุกตู้ที่ถึงไทยแล้วได้บันทึกรายการจ่ายเงินครบ
          </div>
        ) : (
          <CntPaymentForm
            unpaidContainers={unpaid.map((c) => ({
              fcabinetnumber: c.fcabinetnumber,
              warehouseLabel: WAREHOUSE_LABEL[c.fwarehousename] ?? c.fwarehousename,
              transportLabel: c.ftransporttype === "1" ? "🚛 รถ" : c.ftransporttype === "2" ? "🚢 เรือ" : c.ftransporttype,
              trackCount:     c.trackCount,
              weightSum:      c.weightSum,
              volumeSum:      c.volumeSum,
              costSum:        c.costSum,
              priceSum:       c.priceSum,
              closeDate:      c.closeDate ? c.closeDate.slice(0, 10) : "-",
            }))}
          />
        )}
      </main>
    </>
  );
}
