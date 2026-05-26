import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";

/**
 * Admin > จัดการทรัพยากรบุคคล (hub)
 *
 * ภูม brief 2026-05-20 ค่ำ — Pacred sidebar slim-down. The legacy
 * `OOP/CargoAndFreight/menu-hr-manage-human-resource.php` block is
 * now a single sidebar leaf → lands here; depth surfaces via the
 * TOP menubar (purple gradient · cascading dropdowns · sister of
 * /admin/accounting/cargo + /admin/customers).
 *
 * Hub-body: 6-card grid quick-access to the live HR sub-pages so
 * the page is useful immediately. Menubar leaves cover the full
 * blockHrHumanResource shape from lib/admin/sidebar-menu.ts.
 *
 * Pattern source: /admin/accounting/cargo/page.tsx (Server Component
 * · requireAdmin gate · force-dynamic · TOP menubar + body).
 */

// ── Menubar config — transcribed from blockHrHumanResource ─────────
const HR_HR_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/hr/humanresource" },
  {
    label: "ผังองค์กร",
    children: [
      { label: "ภาพ",   href: "/admin/hr/org-chart" },
      { label: "ตาราง", href: "/admin/hr/org-table" },
    ],
  },
  {
    label: "สรรหา",
    children: [
      { label: "ประกาศใหม่", href: "/admin/hr/recruitment/new" },
      { label: "ผู้สมัคร",    href: "/admin/hr/recruitment" },
    ],
  },
  {
    label: "พนักงาน",
    children: [
      { label: "ทั้งหมด", href: "/admin/admins" },
      { label: "audit",  href: "/admin/hr/audit" },
      { label: "นโยบาย", href: "/admin/hr/policies" },
    ],
  },
  {
    label: "เวลาเข้างาน",
    children: [
      { label: "สรุป",  href: "/admin/hr/attendance" },
      { label: "ลา",    href: "/admin/hr/attendance/leaves" },
      { label: "อบรม", href: "/admin/hr/training" },
    ],
  },
];

// ── Hub body — 6-card quick-access grid ────────────────────────────
const HUB_CARDS = [
  {
    title: "ผังองค์กร — ภาพ",
    desc: "Tree view · CEO → Directors → Sections → Positions",
    href: "/admin/hr/org-chart",
    badge: "live",
  },
  {
    title: "ผังองค์กร — ตาราง",
    desc: "ทุก position พร้อม quota + ผู้นั่งปัจจุบัน",
    href: "/admin/hr/org-table",
    badge: "live",
  },
  {
    title: "พนักงาน — ทั้งหมด",
    desc: "Datatable · ทั้งหมด · ทำงาน · พักงาน · ค้นหา · RBAC",
    href: "/admin/admins",
    badge: "live",
  },
  {
    title: "สรรหา / รับสมัครงาน",
    desc: "ลงประกาศ · รับใบสมัคร · นัดสัมภาษณ์ · รับเข้าทำงาน",
    href: "/admin/hr/recruitment",
    badge: "live",
  },
  {
    title: "เวลาเข้างาน / ลา",
    desc: "TAS · clock-in/out · ลา · นับชั่วโมงงาน",
    href: "/admin/hr/attendance",
    badge: "live",
  },
  {
    title: "ออดิทพนักงาน + นโยบาย",
    desc: "ชมเชย · ตักเตือน · โทษวินัย · Policy library",
    href: "/admin/hr/audit",
    badge: "live",
  },
];

// Force-dynamic — auth gate reads cookies.
export const dynamic = "force-dynamic";

// ── Page ────────────────────────────────────────────────────────────
export default async function AdminHrHumanResourceHubPage() {
  // super-only — HR is org-management; ภูม brief 2026-05-20 ค่ำ
  // calls out HR/QA hubs as super-gated.
  await requireAdmin(["super"]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">จัดการทรัพยากรบุคคล</h1>
        <p className="mt-1 text-sm text-muted">
          ผังองค์กร · สรรหา · พนักงาน · เวลาเข้างาน · นโยบาย · ออดิท
        </p>
      </div>

      {/* TOP menubar — purple bar with cascading dropdowns */}
      <PageTopMenubar items={HR_HR_MENUBAR} activeHref="/admin/hr/humanresource" />

      {/* Hub body — quick-access cards */}
      <section>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">
          เข้าใช้งานเร็ว — หน้า HR ที่ใช้ได้ตอนนี้
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HUB_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm hover:shadow-md hover:border-primary-300 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{card.title}</h3>
                <span className="rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[10px] font-medium uppercase">
                  {card.badge}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted leading-relaxed">{card.desc}</p>
              <p className="mt-3 text-xs font-medium text-primary-600">เปิด →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Note about the menubar */}
      <p className="text-xs text-muted italic">
        เมนูด้านบน (ผังองค์กร / สรรหา / พนักงาน / เวลาเข้างาน) ใช้รูปแบบเดียวกับ
        legacy <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">menu-hr-manage-human-resource.php</code>
      </p>
    </main>
  );
}
