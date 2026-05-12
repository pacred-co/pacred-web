import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listServiceOrders, type ServiceOrderSummary } from "@/actions/service-order";
import { ServiceOrderList } from "./service-order-list";
import { ShoppingCart, Plus, ChevronRight, Home } from "lucide-react";

type StatusFilter = ServiceOrderSummary["status"];

const TAB_DEFS: { key: StatusFilter | "all"; label: string; badgeTone: "info" | "warning" | "neutral" }[] = [
  { key: "all",                   label: "ทั้งหมด",          badgeTone: "info" },
  { key: "pending",               label: "รอดำเนินการ",     badgeTone: "neutral" },
  { key: "awaiting_payment",      label: "รอชำระเงิน",       badgeTone: "warning" },
  { key: "ordered",               label: "สั่งสินค้า",         badgeTone: "neutral" },
  { key: "awaiting_chn_dispatch", label: "รอร้านจีนจัดส่ง",  badgeTone: "neutral" },
  { key: "completed",             label: "สำเร็จ",             badgeTone: "neutral" },
  { key: "cancelled",             label: "ยกเลิก",            badgeTone: "warning" },
];

export default async function ServiceOrderPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  // Always fetch all rows so the tab counters can render — filter client-side via the URL param.
  const res = await listServiceOrders({ limit: 200 });
  const allItems = res.ok ? (res.data ?? []) : [];

  // Build counter map (group by status)
  const counts = allItems.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});

  const activeTab = (sp.q && TAB_DEFS.some((t) => t.key === sp.q)) ? sp.q : "all";
  const filtered = activeTab === "all" ? allItems : allItems.filter((o) => o.status === activeTab);

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">รายการฝากสั่งซื้อสินค้า</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-600">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">รายการฝากสั่งซื้อสินค้า</h1>
                <p className="text-xs text-muted mt-0.5">ออเดอร์สินค้าจีน — รถเข็น เปิดบิล จ่ายเงิน ติดตามสถานะ</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/service-order/cart"
                className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt inline-flex items-center gap-1.5"
              >
                <ShoppingCart className="w-4 h-4" /> เปิดรถเข็น
              </Link>
              <Link
                href="/service-order/add"
                className="rounded-lg bg-primary-500 text-white px-3 py-2 text-xs sm:text-sm font-bold hover:bg-primary-600 inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> สั่งสินค้าเพิ่ม
              </Link>
            </div>
          </div>

          {/* Status tabs */}
          <div className="mt-5 border-b border-border -mx-5 px-5">
            <div className="flex flex-wrap gap-x-1 gap-y-1 overflow-x-auto -mb-px">
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.key;
                const count = counts[tab.key] ?? 0;
                const href = tab.key === "all" ? "/service-order" : `/service-order?q=${tab.key}`;
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

        <ServiceOrderList items={filtered} activeFilter={activeTab} />
      </main>
      <Footer />
    </>
  );
}
