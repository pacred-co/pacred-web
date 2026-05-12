import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listForwarders } from "@/actions/forwarder";
import { Receipt, Printer, ChevronRight, Home, Search } from "lucide-react";

type Params = Promise<{ from?: string; to?: string }>;

/** Receipt history — shipments that have been delivered / arrived in TH.
 *  Customer can print the invoice from here (server-rendered PDF view
 *  lives at /service-import/[fNo]/receipt). */
export default async function ServiceImportReceiptsPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const res = await listForwarders({
    status: ["arrived_thailand", "out_for_delivery", "delivered"],
    limit: 200,
  });
  const all = res.ok ? (res.data ?? []) : [];

  // Server-side date range filter (defaults to last 60 days)
  const today = new Date();
  const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
  const from = sp.from ? new Date(sp.from) : sixtyDaysAgo;
  const to   = sp.to   ? new Date(sp.to)   : today;
  // Inclusive: roll `to` to end-of-day
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const items = all.filter((f) => {
    const ref = f.date_delivered ? new Date(f.date_delivered)
              : f.date_arrived_thailand ? new Date(f.date_arrived_thailand)
              : new Date(f.created_at);
    return ref >= from && ref <= toEnd;
  });

  const totalAmount = items.reduce((s, f) => s + Number(f.total_price ?? 0), 0);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/service-import" className="hover:text-primary-600">รายการฝากนำเข้า</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">ประวัติใบเสร็จ</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600">
                <Receipt className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">ประวัติใบเสร็จรายการฝากนำเข้าสินค้า</h1>
                <p className="text-xs text-muted mt-0.5">ใบเสร็จ + ใบแจ้งหนี้ที่ออกแล้ว — กดพิมพ์เป็น PDF / กระดาษ A4</p>
              </div>
            </div>
            <Link
              href="/service-import"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ← กลับรายการฝากนำเข้า
            </Link>
          </div>

          {/* Date range filter */}
          <form action="/service-import/receipts" className="mt-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-[11px] text-muted block mb-1">วันที่เริ่ม</label>
              <input
                type="date"
                name="from"
                defaultValue={fmt(from)}
                className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="text-muted self-end pb-2.5">→</div>
            <div>
              <label className="text-[11px] text-muted block mb-1">วันที่สิ้นสุด</label>
              <input
                type="date"
                name="to"
                defaultValue={fmt(to)}
                className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600 inline-flex items-center gap-1.5"
            >
              <Search className="w-4 h-4" /> ค้นหาข้อมูล
            </button>
            <div className="ml-auto text-right">
              <p className="text-[11px] text-muted">รวม {items.length} ใบเสร็จ</p>
              <p className="text-base font-bold font-mono text-red-600">
                ฿{totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-muted">
                <Receipt className="w-7 h-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">ไม่มีใบเสร็จในช่วงวันที่เลือก</p>
              <p className="mt-1 text-xs text-muted">ลองขยายช่วงวันที่ หรือออเดอร์ใหม่</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 w-[140px]">วันที่</th>
                    <th className="px-4 py-3 w-[160px]">เลขที่ใบเสร็จ</th>
                    <th className="px-4 py-3">เลขที่ฝากนำเข้า</th>
                    <th className="px-4 py-3 text-right w-[140px]">จำนวนเงิน</th>
                    <th className="px-4 py-3 w-[160px]">พิมพ์ใบเสร็จ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((f) => {
                    const refDate = f.date_delivered ?? f.date_arrived_thailand ?? f.created_at;
                    const d = new Date(refDate);
                    return (
                      <tr key={f.id} className="hover:bg-surface-alt/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap align-top">
                          <div>{d.toLocaleDateString("th-TH")}</div>
                          <div>{d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs align-top">
                          <span className="inline-flex rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold">
                            RC-{f.f_no ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {f.f_no ? (
                            <Link href={`/service-import/${f.f_no}`} className="font-mono text-xs text-primary-600 hover:underline">
                              {f.f_no}
                            </Link>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono align-top">
                          <span className="text-sm font-bold text-foreground">
                            ฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {f.f_no && (
                            <Link
                              href={`/service-import/${f.f_no}/receipt`}
                              target="_blank"
                              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-3 py-1.5 text-xs font-bold shadow-sm hover:shadow-md transition-shadow"
                            >
                              <Printer className="w-3.5 h-3.5" /> พิมพ์ใบเสร็จ
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
