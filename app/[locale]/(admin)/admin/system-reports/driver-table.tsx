/**
 * ตารางงานคนขับรถ (จัดส่ง) — ปอน 2026-07-29.
 * คอลัมน์ตามภาพ owner (report-driver): วันที่มอบงาน · เลขที่รายการ · ผู้มอบงาน · คนขับรถ ·
 * แทรกกิ้ง · กล่อง · น้ำหนัก · ปริมาตร · สถานที่ไปส่ง · บริษัทขนส่ง · กำหนดเวลา · เวลาที่ไปส่ง ·
 * ใช้เวลาทำงาน(นาที) · สถานะ · หมายเหตุ. 1 แถว = 1 จุดส่ง · หัวคอลัมน์กดเรียงได้ (SortHeader).
 */
import { Link } from "@/i18n/navigation";
import { COMMISSION_PAGE_SIZE } from "@/lib/admin/sales-commission-report";
import type { DriverWorkReport } from "@/lib/admin/driver-work-report";
import { Pagination } from "./pagination";
import { SortHeader } from "./sort-header";

const HEADERS: { label: string; key: string | null }[] = [
  { label: "วันที่มอบงาน", key: "assignDate" },
  { label: "เลขที่รายการ", key: "orderId" },
  { label: "ผู้มอบงาน", key: "assignerName" },
  { label: "คนขับรถ", key: "driverName" },
  { label: "แทรกกิ้ง", key: "tracking" },
  { label: "กล่อง", key: "boxes" },
  { label: "น้ำหนัก kg", key: "weight" },
  { label: "ปริมาตร CBM", key: "cbm" },
  { label: "สถานที่ไปส่ง", key: "deliverTo" },
  { label: "บริษัทขนส่ง", key: "carrierLabel" },
  { label: "กำหนดเวลา", key: "deadline" },
  { label: "เวลาที่ไปส่ง", key: "deliveredAt" },
  { label: "ใช้เวลาทำงาน (นาที)", key: "durationMin" },
  { label: "สถานะ", key: "statusCode" },
  { label: "หมายเหตุ", key: "note" },
];

const fmt = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtDate = (s: string | null) => (s ? s.replace("T", " ").slice(0, 19) : "-");

// fdistatus: '' ยังไม่ขึ้นรถ · '1' กำลังส่ง · '2' ส่งสำเร็จ · '3' ส่งไม่ได้ (สี legacy)
function statusChip(code: string, label: string) {
  const cls =
    code === "2" ? "bg-emerald-500" : code === "3" ? "bg-rose-500" : code === "1" ? "bg-sky-500" : "bg-slate-400";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${cls}`}>
      {label}
    </span>
  );
}

export function DriverTable({
  report,
  repName,
  page = 1,
}: {
  report: DriverWorkReport;
  repName: string;
  page?: number;
}) {
  const { rows, summary, totals, rangeStart, rangeEnd } = report;
  const th = "border border-white/25 px-2 py-2 text-left font-semibold whitespace-nowrap";
  const td = "border border-border/50 px-2 py-1 align-top";

  // สรุปต่อคนขับ (แถวรวม = ผลบวกทุกคนขับ)
  const sumStops = summary.reduce((a, s) => a + s.stops, 0);
  const sumTracks = summary.reduce((a, s) => a + s.tracks, 0);
  const sumBoxes = summary.reduce((a, s) => a + s.boxes, 0);
  const sumWeight = summary.reduce((a, s) => a + s.weight, 0);
  const sumCbm = summary.reduce((a, s) => a + s.cbm, 0);

  const totalPages = Math.max(1, Math.ceil(totals.count / COMMISSION_PAGE_SIZE));
  const rangeFrom = totals.count === 0 ? 0 : (page - 1) * COMMISSION_PAGE_SIZE + 1;
  const rangeTo = (page - 1) * COMMISSION_PAGE_SIZE + rows.length;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">รายการจัดส่งของคนขับรถ</span>
        {repName && <span className="text-muted">· คนขับ: {repName}</span>}
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

      {summary.length > 0 && (
        <div className="space-y-1">
          <span className="text-sm font-semibold text-foreground">สรุปต่อคนขับรถ</span>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="bg-gradient-to-r from-slate-600 to-slate-500 text-white">
                  <th className={th}>คนขับรถ</th>
                  <th className={th}>ชื่อ - นามสกุล</th>
                  <th className={`${th} text-right`}>จำนวนจุดที่ส่ง</th>
                  <th className={`${th} text-right`}>จำนวนแทรคครั้ง</th>
                  <th className={`${th} text-right`}>จำนวนกล่อง</th>
                  <th className={`${th} text-right`}>น้ำหนัก kg</th>
                  <th className={`${th} text-right`}>ปริมาตร CBM</th>
                </tr>
                <tr className="bg-teal-500 font-semibold text-white">
                  <td className="border border-white/25 px-2 py-1.5 whitespace-nowrap" colSpan={2}>รวม</td>
                  <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(sumStops, 0)}</td>
                  <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(sumTracks, 0)}</td>
                  <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(sumBoxes, 0)}</td>
                  <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(sumWeight, 2)}</td>
                  <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(sumCbm, 4)}</td>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.code} className="odd:bg-white even:bg-muted/30 dark:odd:bg-surface">
                    <td className={`${td} whitespace-nowrap font-medium`}>{s.code}</td>
                    <td className={`${td} whitespace-nowrap`}>{s.name || "-"}</td>
                    <td className={`${td} text-right`}>{fmt(s.stops, 0)}</td>
                    <td className={`${td} text-right`}>{fmt(s.tracks, 0)}</td>
                    <td className={`${td} text-right`}>{fmt(s.boxes, 0)}</td>
                    <td className={`${td} text-right`}>{fmt(s.weight, 2)}</td>
                    <td className={`${td} text-right`}>{fmt(s.cbm, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1500px] border-collapse text-xs">
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
              <td className="border border-white/25 px-2 py-1.5" colSpan={7} />
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
              rows.map((r, i) => (
                <tr key={`${r.orderId}-${i}`} className="odd:bg-white even:bg-muted/30 dark:odd:bg-surface">
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.assignDate)}</td>
                  <td className={td}>
                    <Link
                      href={`/admin/forwarders/${r.orderId}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {r.orderId}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{r.assignerName || "-"}</td>
                  <td className={`${td} whitespace-nowrap font-medium`}>{r.driverName || "-"}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.tracking || "-"}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.boxes, 0)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.weight, 2)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.cbm, 4)}</td>
                  <td className={`${td} min-w-[16rem] max-w-[22rem] whitespace-normal`}>{r.deliverTo}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.carrierLabel}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.deadline)}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.deliveredAt)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {r.durationMin == null ? "-" : fmt(r.durationMin, 0)}
                  </td>
                  <td className={td}>{statusChip(r.statusCode, r.statusLabel)}</td>
                  <td className={`${td} min-w-[10rem] max-w-[16rem] whitespace-normal text-muted`}>{r.note || "-"}</td>
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
