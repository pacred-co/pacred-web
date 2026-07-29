/**
 * ตารางค่าคอมมิชชั่น (เซลล์) — ปอน 2026-07-29.
 * 15 คอลัมน์ตามภาพ legacy "ทำรายการเบิกค่าคอมของเซลล์" + แถวรวม.
 * ค่าคอมมิชชั่น = "—" (ยังไม่คำนวณ ตามที่ ปอน สั่ง). กว้าง 15 คอลัมน์ →
 * scroll แนวนอนในกล่องตัวเอง (overflow-x-auto) ไม่ดันทั้งหน้า (responsive กับ sidebar).
 */
import { Link } from "@/i18n/navigation";
import type { CommissionReport } from "@/lib/admin/sales-commission-report";

const HEADERS = [
  "วันที่ชำระเงิน",
  "วันที่สร้าง",
  "เลขที่ออเดอร์",
  "แทรกกิ้ง",
  "เลขตู้",
  "โกดังจีน",
  "ขนส่งทาง",
  "ประเภทสินค้า",
  "น้ำหนัก",
  "ปริมาตร",
  "ราคานำเข้าจีน - ไทย",
  "ส่วนลด",
  "ค่าคอมมิชชั่น",
  "รหัสสมาชิก",
  "ชื่อ-นามสกุล",
];

const fmt = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtDate = (s: string | null) => (s ? s.replace("T", " ").slice(0, 19) : "-");

function transportChip(mode: string, label: string) {
  const cls =
    mode === "2" ? "bg-emerald-500" : mode === "3" ? "bg-sky-500" : "bg-blue-500";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white ${cls}`}>
      {label}
    </span>
  );
}

export function CommissionTable({
  report,
  repName,
}: {
  report: CommissionReport;
  repName: string;
}) {
  const { rows, totals, rangeStart, rangeEnd } = report;
  const th = "border border-white/25 px-2 py-2 text-left font-semibold whitespace-nowrap";
  const td = "border border-border/50 px-2 py-1 align-top";

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">ทำรายการเบิกค่าคอมของเซลล์</span>
        {repName && <span className="text-muted">· ผู้รับผิดชอบ: {repName}</span>}
        <span className="text-primary-600">
          ผลลัพธ์การค้นหา ตั้งแต่วันที่ : {rangeStart} - {rangeEnd}
        </span>
        <span className="text-muted">({totals.count} รายการ)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1200px] border-collapse text-xs">
          <thead>
            <tr className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              {HEADERS.map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
            <tr className="bg-teal-500 font-semibold text-white">
              <td className="border border-white/25 px-2 py-1.5 whitespace-nowrap" colSpan={8}>
                รวม
              </td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.weight, 2)}</td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.cbm, 5)}</td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.price, 2)}</td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.discount, 2)}</td>
              <td className="border border-white/25 px-2 py-1.5 text-right">—</td>
              <td className="border border-white/25 px-2 py-1.5" colSpan={2} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-8 text-center text-sm text-muted">
                  ไม่พบข้อมูลในเดือนนี้
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.orderId} className="odd:bg-white even:bg-muted/30 dark:odd:bg-surface">
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.paidDate)}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.createdDate)}</td>
                  <td className={td}>
                    <Link
                      href={`/admin/forwarders/${r.orderId}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {r.orderId}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{r.tracking || "-"}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.cabinet || "-"}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.warehouseLabel}</td>
                  <td className={td}>{transportChip(r.transportMode, r.transportLabel)}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.productLabel}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.weight, 2)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.cbm, 5)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.price, 2)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.discount, 2)}</td>
                  <td className={`${td} text-right text-muted`}>—</td>
                  <td className={`${td} whitespace-nowrap`}>{r.memberCode}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.customerName || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
