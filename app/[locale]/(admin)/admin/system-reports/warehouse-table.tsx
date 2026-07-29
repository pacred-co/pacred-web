/**
 * ตารางงานโกดัง (ของที่ยิงรับเข้าไทยแล้ว + ลูกค้าจ่ายแล้ว) — ปอน 2026-07-29.
 * owner: คอลัมน์หลักต้องมี CBM/kg/แทรกกิ้ง/จำนวน + สลิป. 1 แถว = 1 รายการที่ถึงไทย+จ่ายแล้ว.
 * ผู้รับผิดชอบ = adminidupdate (คนล่าสุดที่ประมวลผล · log ยิงจริงยังไม่เปิดใช้). หัวคอลัมน์กดเรียงได้.
 */
import { Link } from "@/i18n/navigation";
import { COMMISSION_PAGE_SIZE } from "@/lib/admin/sales-commission-report";
import type { WarehouseWorkReport } from "@/lib/admin/warehouse-work-report";
import { Pagination } from "./pagination";
import { SortHeader } from "./sort-header";

const HEADERS: { label: string; key: string | null }[] = [
  { label: "วันที่ยิงเข้าไทย", key: "arriveDate" },
  { label: "เลขที่รายการ", key: "orderId" },
  { label: "รหัสสมาชิก", key: "memberCode" },
  { label: "ผู้รับผิดชอบ", key: "handlerName" },
  { label: "แทรกกิ้ง", key: "tracking" },
  { label: "จำนวน", key: "boxes" },
  { label: "น้ำหนัก kg", key: "weight" },
  { label: "ปริมาตร CBM", key: "cbm" },
  { label: "เลขตู้", key: "cabinet" },
  { label: "โกดังจีน", key: "warehouseLabel" },
  { label: "สถานะ", key: "statusCode" },
  { label: "สลิป", key: null },
];

const fmt = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtDate = (s: string | null) => (s ? s.replace("T", " ").slice(0, 19) : "-");

// fstatus: 4 ถึงไทย · 5 รอชำระ · 6 เตรียมส่ง · 7 ส่งแล้ว
function statusChip(code: string, label: string) {
  const cls =
    code === "7" ? "bg-emerald-500" : code === "6" ? "bg-blue-500" : code === "5" ? "bg-amber-500" : "bg-sky-500";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${cls}`}>
      {label}
    </span>
  );
}

export function WarehouseTable({
  report,
  repName,
  page = 1,
}: {
  report: WarehouseWorkReport;
  repName: string;
  page?: number;
}) {
  const { rows, totals, rangeStart, rangeEnd } = report;
  const th = "border border-white/25 px-2 py-2 text-left font-semibold whitespace-nowrap";
  const td = "border border-border/50 px-2 py-1 align-top";

  const totalPages = Math.max(1, Math.ceil(totals.count / COMMISSION_PAGE_SIZE));
  const rangeFrom = totals.count === 0 ? 0 : (page - 1) * COMMISSION_PAGE_SIZE + 1;
  const rangeTo = (page - 1) * COMMISSION_PAGE_SIZE + rows.length;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">รายการของถึงไทย (ยิงแล้ว) + ลูกค้าจ่ายแล้ว</span>
        {repName && <span className="text-muted">· ผู้รับผิดชอบ: {repName}</span>}
        <span className="text-primary-600">
          ผลลัพธ์การค้นหา ตั้งแต่วันที่ : {rangeStart} - {rangeEnd}
        </span>
        <span className="text-muted">({totals.count} รายการ)</span>
        {totals.count > rows.length && (
          <span className="text-amber-600">
            · แสดง {rangeFrom}–{rangeTo} · หน้า {page}/{totalPages} (ยอดรวมคิดจากทั้งหมด)
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1250px] border-collapse text-xs [&_th]:text-center [&_td]:text-center">
          <thead>
            <tr className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              {HEADERS.map((h) => (
                <SortHeader key={h.label} label={h.label} colKey={h.key} className={th} />
              ))}
            </tr>
            <tr className="bg-teal-500 font-semibold text-white">
              <td className="border border-white/25 px-2 py-1.5 whitespace-nowrap" colSpan={5}>
                รวม
              </td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.boxes, 0)}</td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.weight, 2)}</td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.cbm, 4)}</td>
              <td className="border border-white/25 px-2 py-1.5" colSpan={4} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-8 text-center text-sm text-muted">
                  ไม่พบข้อมูลในช่วงนี้
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.orderId} className="odd:bg-white even:bg-muted/30 dark:odd:bg-surface">
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.arriveDate)}</td>
                  <td className={td}>
                    <Link
                      href={`/admin/forwarders/${r.orderId}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {r.orderId}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{r.memberCode}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.handlerName || "-"}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.tracking || "-"}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.boxes, 0)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.weight, 2)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.cbm, 4)}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.cabinet || "-"}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.warehouseLabel}</td>
                  <td className={td}>{statusChip(r.statusCode, r.statusLabel)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {r.walletHsId != null ? (
                      <a
                        href={`/admin/wallet/${r.walletHsId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary-600 hover:underline"
                        title="เปิดดูสลิปการชำระ"
                      >
                        ดูสลิป
                      </a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} />
    </section>
  );
}
