import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getCurrentYuanRate, listYuanPayments, type YuanPayment } from "@/actions/payment";
import { ArrowLeftRight, Plus, ChevronRight, Home, Eye } from "lucide-react";

type StatusFilter = YuanPayment["status"];

const STATUS_BADGE: Record<StatusFilter, string> = {
  pending:    "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  completed:  "bg-emerald-100 text-emerald-700",
  failed:     "bg-red-100 text-red-700",
  refunded:   "bg-gray-100 text-gray-600",
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  pending:    "รอตรวจสอบ",
  processing: "กำลังโอน",
  completed:  "สำเร็จ",
  failed:     "ไม่สำเร็จ",
  refunded:   "คืนเงินแล้ว",
};

const CHANNEL_LABEL: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat",
  bank:   "Bank",
};

const CHANNEL_TONE: Record<string, string> = {
  alipay: "bg-blue-50 text-blue-700 border-blue-200",
  wechat: "bg-green-50 text-green-700 border-green-200",
  bank:   "bg-gray-50 text-gray-700 border-gray-200",
};

const TAB_DEFS: { key: StatusFilter | "all"; label: string; badgeTone: "info" | "warning" | "neutral" }[] = [
  { key: "all",        label: "ทั้งหมด",     badgeTone: "info" },
  { key: "pending",    label: "รอตรวจสอบ",  badgeTone: "warning" },
  { key: "processing", label: "กำลังโอน",    badgeTone: "neutral" },
  { key: "completed",  label: "สำเร็จ",      badgeTone: "neutral" },
  { key: "failed",     label: "ไม่สำเร็จ",    badgeTone: "warning" },
  { key: "refunded",   label: "คืนเงินแล้ว", badgeTone: "neutral" },
];

export default async function ServicePaymentPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const [rateRes, listRes] = await Promise.all([
    getCurrentYuanRate(),
    listYuanPayments(200),
  ]);
  const allItems = listRes.ok ? (listRes.data ?? []) : [];

  const counts = allItems.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});

  const activeTab = (sp.q && TAB_DEFS.some((t) => t.key === sp.q)) ? sp.q : "all";
  const items = activeTab === "all" ? allItems : allItems.filter((p) => p.status === activeTab);

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">ฝากชำระ / โอนหยวน</span>
        </nav>

        {/* Page header card */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600">
                <ArrowLeftRight className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">บริการฝากชำระ/โอนเงินหยวน</h1>
                <p className="text-xs text-muted mt-0.5">ฝากโอนเงินไป Alipay / WeChat / ธนาคารจีน — ใช้สำหรับชำระร้านค้าโดยตรง</p>
              </div>
            </div>
            <Link
              href="/service-payment/add"
              className="rounded-lg bg-primary-500 text-white px-3 py-2 text-xs sm:text-sm font-bold hover:bg-primary-600 inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> เพิ่มรายการฝากชำระ
            </Link>
          </div>

          {/* Rate banner */}
          <div className="mt-4 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white p-4 flex flex-wrap items-center justify-between gap-2 shadow-sm">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/80">เรทแลกเปลี่ยน Alipay ปัจจุบัน</p>
              <p className="text-2xl sm:text-3xl font-bold font-mono mt-1">1 ¥ = ฿{rateRes.rate.toFixed(4)}</p>
            </div>
            <p className="text-[11px] text-white/85">
              อัพเดทล่าสุด: {new Date(rateRes.updated_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>

          {/* Status tabs */}
          <div className="mt-5 border-b border-border -mx-5 px-5">
            <div className="flex flex-wrap gap-x-1 gap-y-1 overflow-x-auto -mb-px">
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.key;
                const count = counts[tab.key] ?? 0;
                const href = tab.key === "all" ? "/service-payment" : `/service-payment?q=${tab.key}`;
                return (
                  <Link
                    key={tab.key}
                    href={href}
                    className={`inline-flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? "border-primary-500 text-primary-600"
                        : "border-transparent text-muted hover:text-foreground hover:border-border"
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        tab.badgeTone === "info"    ? "bg-cyan-100 text-cyan-700" :
                        tab.badgeTone === "warning" ? "bg-amber-100 text-amber-700" :
                                                      isActive ? "bg-primary-100 text-primary-700" : "bg-surface-alt text-muted"
                      }`}>
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-muted">
                <ArrowLeftRight className="w-7 h-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                {activeTab === "all" ? "ยังไม่มีรายการฝากชำระ" : "ไม่มีรายการในสถานะที่เลือก"}
              </p>
              <p className="mt-1 text-xs text-muted">
                สร้างรายการแรกของคุณเพื่อโอนหยวนไปร้านค้าจีนผ่าน Pacred
              </p>
              <Link
                href="/service-payment/add"
                className="mt-4 inline-block rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600 shadow-sm"
              >
                + เพิ่มรายการฝากชำระ
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 w-[140px]">วันที่</th>
                    <th className="px-4 py-3 w-[110px]">ช่องทาง</th>
                    <th className="px-4 py-3">ผู้รับ / รายละเอียด</th>
                    <th className="px-4 py-3 text-right w-[120px]">ยอด CNY</th>
                    <th className="px-4 py-3 text-right w-[140px]">ยอด THB</th>
                    <th className="px-4 py-3 w-[140px]">สถานะ</th>
                    <th className="px-4 py-3 w-[110px]">หลักฐาน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((p) => {
                    const created = new Date(p.created_at);
                    return (
                      <tr key={p.id} className="hover:bg-surface-alt/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap align-top">
                          <Link href={`/service-payment/${p.id}`} className="hover:text-primary-600">
                            <div>{created.toLocaleDateString("th-TH")}</div>
                            <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div>
                            <div className="mt-1 text-[10px] text-primary-600 underline-offset-2 group-hover:underline">ดูรายละเอียด →</div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${CHANNEL_TONE[p.channel] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
                            {CHANNEL_LABEL[p.channel] ?? p.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-3">{p.recipient_detail || "—"}</p>
                          {p.paid_via_wallet && (
                            <span className="mt-1 inline-block text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
                              💳 ตัดจากกระเป๋า
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono align-top">
                          <span className="text-sm font-bold text-foreground">¥{Number(p.yuan_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                          <p className="text-[10px] text-muted">@ {Number(p.exchange_rate).toFixed(4)}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono align-top">
                          <span className="text-sm font-bold text-red-600">฿{Number(p.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[p.status]}`}>
                            {STATUS_LABEL[p.status]}
                          </span>
                          {p.executed_at && (
                            <p className="text-[10px] text-muted mt-1">
                              โอนเมื่อ {new Date(p.executed_at).toLocaleDateString("th-TH")}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {p.slip_url ? (
                            <a
                              href={p.slip_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-semibold hover:bg-blue-100"
                            >
                              <Eye className="w-3.5 h-3.5" /> ดูสลิป
                            </a>
                          ) : (
                            <span className="text-[11px] text-muted">—</span>
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
