/**
 * ตารางค่าคอมมิชชั่น (สั่งซื้อ = ฝากสั่งซื้อ) — ปอน 2026-07-29.
 * คอลัมน์ตามภาพ owner: วันที่ชำระเงิน · วันที่สร้าง · รหัสสมาชิก · เลขที่ออเดอร์ · แอดมินสั่งจีน ·
 * COST(¥) · DISCOUNT(¥) · DIFFERANCE(¥) · EX · % · TOTAL(฿) · สถานะออเดอร์. เฉพาะงานที่ลูกค้าจ่ายแล้ว.
 * % (ค่าคอม) ยังไม่คำนวณ = "—". DISCOUNT ยังรอ owner ยืนยัน field (ตอนนี้ 0).
 */
import { Link } from "@/i18n/navigation";
import { COMMISSION_PAGE_SIZE } from "@/lib/admin/sales-commission-report";
import type { PurchaseCommissionReport } from "@/lib/admin/purchase-commission-report";
import { Pagination } from "./pagination";

const HEADERS = [
  "วันที่ชำระเงิน",
  "วันที่สร้าง",
  "รหัสสมาชิก",
  "เลขที่ออเดอร์",
  "แอดมินสั่งจีน",
  "COST (YUAN)",
  "DISCOUNT (YUAN)",
  "DIFFERANCE (YAUN)",
  "EX",
  "%",
  "TOTAL (BAHT)",
  "สถานะออเดอร์",
  "สลิป",
];

const fmt = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtDate = (s: string | null) => (s ? s.replace("T", " ").slice(0, 19) : "-");

function statusChip(code: string, label: string) {
  const cls =
    code === "5"
      ? "bg-emerald-500"
      : code === "6"
        ? "bg-gray-400"
        : code === "3"
          ? "bg-blue-500"
          : "bg-amber-500";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${cls}`}>
      {label}
    </span>
  );
}

export function PurchaseTable({
  report,
  repName,
  page = 1,
}: {
  report: PurchaseCommissionReport;
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
        <span className="font-semibold text-foreground">ทำรายการเบิกค่าคอมของสั่งซื้อ</span>
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
        <table className="w-full min-w-[1150px] border-collapse text-xs">
          <thead>
            <tr className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              {HEADERS.map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
            <tr className="bg-teal-500 font-semibold text-white">
              <td className="border border-white/25 px-2 py-1.5 text-right whitespace-nowrap" colSpan={10}>
                รวม
              </td>
              <td className="border border-white/25 px-2 py-1.5 text-right">{fmt(totals.totalBaht, 2)}</td>
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
                <tr key={r.orderNo} className="odd:bg-white even:bg-muted/30 dark:odd:bg-surface">
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.paidDate)}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.createdDate)}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.memberCode}</td>
                  <td className={td}>
                    <Link
                      href={`/admin/service-orders/${r.orderNo}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {r.orderNo}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{r.purchaserName || "-"}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.costYuan, 2)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.discountYuan, 2)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.diffYuan, 2)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.ex, 2)}</td>
                  <td className={`${td} text-right text-muted`}>
                    {r.commissionPct == null ? "—" : fmt(r.commissionPct, 2)}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{fmt(r.totalBaht, 2)}</td>
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
