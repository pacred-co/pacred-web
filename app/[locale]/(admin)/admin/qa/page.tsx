import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";

/**
 * Admin > QA & QC — Service-Level Queues (hub)
 *
 * ภูม brief 2026-05-20 ค่ำ — Phase 2 super-only hub. The legacy
 * `OOP/Cargo/menu-QAAndQC.php` block (12 SLA-breach queues) is now
 * a single sidebar leaf → lands here; the 12 queues surface as
 * menubar leaves + 12 alert cards.
 *
 * The destination URLs are the URL contract (Wave-B P0.5 pattern) —
 * many do not yet have a focused report page; they fall back to
 * `/admin/reports?status=...` query-string filters until per-queue
 * pages get built. The Phase-2 super-only gate at the page level +
 * via `proxy.ts` keeps everyone else out.
 *
 * Pattern source: /admin/accounting/cargo/page.tsx (Server Component
 * · requireAdmin gate · force-dynamic · TOP menubar + body).
 */

// ── SLA-queue catalogue — single source of truth for menubar + cards ──
// Each entry maps the legacy queue key → ลาเบล Thai (matches messages/th.json
// `qa.<key>`) + href (existing report or stub). Keep this list aligned with
// the 12 leaves under blockQA in lib/admin/sidebar-menu.ts (Agent A owns).
type QaQueue = {
  key: string;
  label: string;
  href: string;
  /** SLA-breach alerts (the 10 คาดการณ์ล่าช้า) vs general work (the 2 งาน) */
  kind: "alert" | "work";
};

const QA_QUEUES: QaQueue[] = [
  // 11 SLA-breach alerts (คาดการณ์ล่าช้า) — Wave 10 (2026-05-23) built 10;
  // Wave 26 (2026-05-28 ดึก) added the 11th `orderCancellations` queue per
  // legacy `pcs-admin/.../QAAndQC.php` L30-34 — orderCancellationList is the
  // 3rd item in the legacy menu (planned PHP `orderCancellationList.php`
  // never built in legacy, but Pacred ships it as a dedicated QA queue).
  // Each queue reads tb_* with the precise SLA condition.
  { key: "payShopOver1d",      label: "รอชำระสินค้าเกิน 1 วัน",          href: "/admin/qa/pay-shop-over-1d",     kind: "alert" },
  { key: "payFwdOver2d",       label: "รอชำระค่านำเข้าเกิน 2 วัน",        href: "/admin/qa/pay-fwd-over-2d",      kind: "alert" },
  { key: "orderCancellations", label: "รายการยกเลิกออเดอร์",             href: "/admin/qa/order-cancellations",  kind: "alert" },
  { key: "creditOverdue",      label: "เครดิตเกินกำหนด",                 href: "/admin/qa/credit-overdue",       kind: "alert" },
  { key: "orderOver10min",     label: "สั่งซื้อรอเกิน 10 นาที",          href: "/admin/qa/order-over-10min",     kind: "alert" },
  { key: "chnShopOver2d",      label: "สั่งซื้อรอร้านจีนส่งเกิน 2 วัน",  href: "/admin/qa/chn-shop-over-2d",     kind: "alert" },
  { key: "chnWhOver2d",        label: "รอเข้าโกดังจีนเกิน 2 วัน",        href: "/admin/qa/chn-wh-over-2d",       kind: "alert" },
  { key: "transitOverdue",     label: "กำลังมาไทยเกินกำหนด",             href: "/admin/qa/transit-overdue",      kind: "alert" },
  { key: "ownerlessGoods",     label: "สินค้าไม่มีเจ้าของ",              href: "/admin/qa/ownerless-goods",      kind: "alert" },
  { key: "prepareOverdue",     label: "เตรียมส่งเกินกำหนด",              href: "/admin/qa/prepare-overdue",      kind: "alert" },
  { key: "newClientNoContact", label: "ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน",   href: "/admin/qa/new-client-no-contact", kind: "alert" },
  // 1 งาน (work) — ย้ายเซลส์ดูแลลูกค้า (cross-cutting QA tool)
  { key: "transferSalesRep",   label: "ย้ายพนักงานขายที่ดูแลลูกค้า",     href: "/admin/customers/transfer-rep", kind: "work" },
];

// ── Menubar config — mirrors the 12 leaves grouped by alert/work ────
const QA_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/qa" },
  {
    label: "คาดการณ์ล่าช้า",
    children: QA_QUEUES.filter((q) => q.kind === "alert").map((q) => ({ label: q.label, href: q.href })),
  },
  {
    label: "งาน",
    children: QA_QUEUES.filter((q) => q.kind === "work").map((q) => ({ label: q.label, href: q.href })),
  },
];

// Force-dynamic — auth gate reads cookies.
export const dynamic = "force-dynamic";

// ── Page ────────────────────────────────────────────────────────────
export default async function AdminQaHubPage() {
  // Phase 2 super-only — duplicates the proxy.ts gate so direct-link
  // attempts also 404 even if the proxy is bypassed.
  await requireAdmin(["super"]);

  const alerts = QA_QUEUES.filter((q) => q.kind === "alert");
  const works = QA_QUEUES.filter((q) => q.kind === "work");

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* TOP menubar — purple bar with cascading dropdowns */}
      <PageTopMenubar items={QA_MENUBAR} activeHref="/admin/qa" />

      {/* Header — §0h consistent <PageHeader> hierarchy */}
      <PageHeader
        eyebrow="ADMIN · PHASE 2"
        title="QA & QC — Service-Level Queues"
        subtitle="คาดการณ์ล่าช้า · งานที่ค้างเกิน SLA — เปิดดูรายชื่อ + จัดการ"
      />

      {/* Hub body — alert cards (10) */}
      <section>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">
          คาดการณ์ล่าช้า ({alerts.length})
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {alerts.map((q) => (
            <Link
              key={q.key}
              href={q.href}
              className="block rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm hover:bg-red-100 hover:border-red-300 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none" aria-hidden>⚠️</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-red-900 leading-snug">{q.label}</p>
                  <p className="mt-1.5 text-[11px] text-red-700">เปิดคิว →</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Hub body — work cards (2) */}
      <section>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">
          งาน ({works.length})
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {works.map((q) => (
            <Link
              key={q.key}
              href={q.href}
              className="block rounded-xl border border-border bg-white dark:bg-surface p-4 shadow-sm hover:bg-surface-alt hover:border-primary-300 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none" aria-hidden>📝</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground leading-snug">{q.label}</p>
                  <p className="mt-1.5 text-[11px] text-primary-600">เปิด →</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Note */}
      <p className="text-xs text-muted italic">
        เมนูและการ์ดด้านบนเป็นโครงเดียวกับ legacy{" "}
        <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">menu-QAAndQC.php</code>
        {" "}— บางลิงก์ปลายทางยังเป็น query-string filter บน /admin/reports หรือ
        /admin/forwarders (รอสร้างหน้า SLA-focused ของแต่ละคิว)
      </p>
    </main>
  );
}
