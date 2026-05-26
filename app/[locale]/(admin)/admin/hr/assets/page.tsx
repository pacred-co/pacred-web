import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";

/**
 * Admin > จัดการทรัพย์สินองค์กร (hub)
 *
 * ภูม brief 2026-05-20 ค่ำ — Pacred sidebar slim-down. The legacy
 * `OOP/CargoAndFreight/menu-hr-manage-corporate-assets.php` block is
 * now a single sidebar leaf → lands here; depth surfaces via the TOP
 * menubar (purple gradient · cascading dropdowns · sister of
 * /admin/hr/humanresource + /admin/accounting/cargo).
 *
 * Sub-pages are Phase 2 (not yet built) — menubar leaves are stub
 * `href: "#"` placeholders + body has 3 "อยู่ระหว่างพัฒนา" cards.
 *
 * Pattern source: /admin/accounting/cargo/page.tsx (Server Component
 * · requireAdmin gate · force-dynamic · TOP menubar + body).
 */

// ── Menubar config — transcribed from blockHrCorporateAssets ───────
const HR_ASSETS_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/hr/assets" },
  {
    label: "ทรัพย์สิน",
    children: [
      // Phase 2 — not yet built; live in /admin/inventory once wired.
      { label: "บำรุงรักษา", href: "#" },
      { label: "สั่งซื้อ",   href: "#" },
      { label: "คงเหลือ",   href: "#" },
    ],
  },
];

// ── Hub body — 3-card placeholder ──────────────────────────────────
const HUB_CARDS = [
  {
    title: "บำรุงรักษา",
    desc: "Maintenance queue — ครุภัณฑ์ที่ต้องซ่อม / ตรวจ / บริการ",
    href: "#",
    badge: "phase-2",
  },
  {
    title: "สั่งซื้อ",
    desc: "Purchasing — ใบสั่งซื้อทรัพย์สิน / approval flow",
    href: "#",
    badge: "phase-2",
  },
  {
    title: "คงเหลือ",
    desc: "Stock — รายการครุภัณฑ์คงเหลือทั้งหมด",
    href: "#",
    badge: "phase-2",
  },
];

// Force-dynamic — auth gate reads cookies.
export const dynamic = "force-dynamic";

// ── Page ────────────────────────────────────────────────────────────
export default async function AdminHrAssetsHubPage() {
  // super-only — corporate-assets is org-management; per Phase-2 gate.
  await requireAdmin(["super"]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">จัดการทรัพย์สินองค์กร</h1>
        <p className="mt-1 text-sm text-muted">
          บำรุงรักษา · สั่งซื้อ · คงเหลือ — ครุภัณฑ์และทรัพย์สินของบริษัท
        </p>
      </div>

      {/* TOP menubar — purple bar with cascading dropdowns */}
      <PageTopMenubar items={HR_ASSETS_MENUBAR} activeHref="/admin/hr/assets" />

      {/* Hub body — placeholder cards */}
      <section>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">
          โมดูลทรัพย์สินองค์กร — อยู่ระหว่างพัฒนา (Phase 2)
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HUB_CARDS.map((card) => (
            <div
              key={card.title}
              className="block rounded-2xl border border-dashed border-border bg-surface-alt/30 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{card.title}</h3>
                <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-medium uppercase">
                  {card.badge}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted leading-relaxed">{card.desc}</p>
              <p className="mt-3 text-xs font-medium text-muted italic">รอสร้างหน้าจริง</p>
            </div>
          ))}
        </div>
      </section>

      {/* Note about the menubar */}
      <p className="text-xs text-muted italic">
        เมนูด้านบนยังเป็น placeholder · โมดูลทรัพย์สินองค์กรจะเปิดตัวใน Phase 2 ตาม
        legacy <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">menu-hr-manage-corporate-assets.php</code>
      </p>
    </main>
  );
}
