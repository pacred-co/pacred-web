import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listForwarders, type ForwarderSummary } from "@/actions/forwarder";
import { ForwarderList } from "./forwarder-list";
import { Package, Plus, ChevronRight, Home, MapPin } from "lucide-react";

type StatusFilter = ForwarderSummary["status"];

const TAB_DEFS: { key: StatusFilter | "all"; label: string; badgeTone: "info" | "warning" | "neutral" }[] = [
  { key: "all",               label: "ทั้งหมด",            badgeTone: "info" },
  { key: "pending_payment",   label: "รอชำระเงิน",         badgeTone: "warning" },
  { key: "shipped_china",     label: "ถึงโกดังจีนแล้ว",     badgeTone: "neutral" },
  { key: "in_transit",        label: "กำลังส่งมาไทย",      badgeTone: "neutral" },
  { key: "arrived_thailand",  label: "ถึงไทยแล้ว",         badgeTone: "neutral" },
  { key: "out_for_delivery",  label: "กำลังจัดส่ง",        badgeTone: "neutral" },
  { key: "delivered",         label: "ส่งแล้ว",             badgeTone: "neutral" },
  { key: "cancelled",         label: "ยกเลิก",             badgeTone: "warning" },
];

export default async function ServiceImportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const res = await listForwarders({ limit: 200 });
  const allItems = res.ok ? (res.data ?? []) : [];

  const counts = allItems.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});

  const activeTab = (sp.q && TAB_DEFS.some((t) => t.key === sp.q)) ? sp.q : "all";
  const filtered = activeTab === "all" ? allItems : allItems.filter((f) => f.status === activeTab);

  // Sum of pending-payment so the bottom checkout bar can render a useful total
  const pendingTotal = allItems
    .filter((f) => f.status === "pending_payment")
    .reduce((s, f) => s + Number(f.total_price ?? 0), 0);
  const pendingCount = allItems.filter((f) => f.status === "pending_payment").length;

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-5 pb-32">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">รายการฝากนำเข้า</span>
        </nav>

        {/* Page header card */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">รายการฝากนำเข้าสินค้า</h1>
                <p className="text-xs text-muted mt-0.5">นำเข้าสินค้าจีน-ไทย ทางรถ/เรือ/อากาศ — ลงทะเบียน Tracking แล้วติดตามได้ทันที</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/service-import/warehouse-addresses"
                className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt inline-flex items-center gap-1.5"
              >
                <MapPin className="w-4 h-4" /> ที่อยู่โกดังจีน
              </Link>
              <Link
                href="/service-import/receipts"
                className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt inline-flex items-center gap-1.5"
              >
                🧾 ประวัติใบเสร็จ
              </Link>
              <Link
                href="/service-import/add"
                className="rounded-lg bg-primary-500 text-white px-3 py-2 text-xs sm:text-sm font-bold hover:bg-primary-600 inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> เพิ่มรายการนำเข้า
              </Link>
            </div>
          </div>

          {/* Status tabs */}
          <div className="mt-5 border-b border-border -mx-5 px-5">
            <div className="flex flex-wrap gap-x-1 gap-y-1 overflow-x-auto -mb-px">
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.key;
                const count = counts[tab.key] ?? 0;
                const href = tab.key === "all" ? "/service-import" : `/service-import?q=${tab.key}`;
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

        <ForwarderList items={filtered} activeFilter={activeTab} />
      </main>

      {/* Fixed bottom payment bar (legacy PCS .b-pay) — only when there's pending */}
      {pendingCount > 0 && (
        <div className="fixed bottom-0 left-[var(--sidebar-w,16px)] right-0 z-30 bg-white dark:bg-surface border-t border-border shadow-[0_-6px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <span className="text-muted">รอชำระเงิน:</span>{" "}
              <b className="text-foreground">{pendingCount}</b> รายการ ·{" "}
              <span className="text-muted">ยอดรวม:</span>{" "}
              <b className="text-red-600 font-mono">฿{pendingTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b>
            </div>
            <Link
              href="/service-import?q=pending_payment"
              className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white px-5 py-2.5 text-sm font-bold shadow-md hover:shadow-lg transition-all ${activeTab !== "pending_payment" ? "animate-pulse" : ""}`}
            >
              💳 ดูรายการรอชำระ
            </Link>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
