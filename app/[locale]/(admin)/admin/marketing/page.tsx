import { Link } from "@/i18n/navigation";
import {
  FileText, Megaphone, BadgePercent, PhoneCall, MessageSquare, BarChart3,
  Mail, MessageCircle, ArrowRight, type LucideIcon,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/admin/page-header";

// Reads live counts via the service-role client on each request.
export const dynamic = "force-dynamic";

/**
 * /admin/marketing — the marketing control room (owner 2026-06-23 "ระบบการตลาด").
 * A HUB that surfaces the marketing tools (content / acquisition / analytics)
 * that already exist but were scattered across the sidebar, ≤1 click from here,
 * plus a few live counts. Read-only — every action lives on the linked page.
 */

type Tool = { title: string; desc: string; href: string; icon: LucideIcon };

function ToolCard({ title, desc, href, icon: Icon }: Tool) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_14px_30px_rgba(179,0,0,0.10)]"
    >
      <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1 text-sm font-bold text-foreground group-hover:text-primary-700">
          {title}
          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </h3>
        <p className="mt-0.5 text-[12px] leading-snug text-muted">{desc}</p>
      </div>
    </Link>
  );
}

function Section({ title, tools }: { title: string; tools: Tool[] }) {
  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-black uppercase tracking-wide text-muted">{title}</h2>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => <ToolCard key={t.href + t.title} {...t} />)}
      </div>
    </div>
  );
}

export default async function MarketingHubPage() {
  await requireAdmin(["super", "ultra", "manager", "sales_admin", "sales", "ops"]);
  const admin = createAdminClient();

  // ── Live quick stats (cheap counts · §0c destructure error · soft-fail → null) ──
  const [pubRes, pendRes, leadsRes, leadsPendRes] = await Promise.all([
    admin.from("cms_articles").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("cms_articles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("imported_leads").select("id", { count: "exact", head: true }),
    admin.from("imported_leads").select("id", { count: "exact", head: true }).eq("call_status", ""),
  ]);
  if (pubRes.error) console.error("[marketing:pub] failed", { message: pubRes.error.message });
  if (pendRes.error) console.error("[marketing:pend] failed", { message: pendRes.error.message });
  if (leadsRes.error) console.error("[marketing:leads] failed", { message: leadsRes.error.message });
  if (leadsPendRes.error) console.error("[marketing:leadsPend] failed", { message: leadsPendRes.error.message });

  const stats = [
    { label: "บทความเผยแพร่",      value: pubRes.count ?? 0,       href: "/admin/articles?status=published", tone: "text-green-700" },
    { label: "บทความรออนุมัติ",    value: pendRes.count ?? 0,      href: "/admin/articles?status=pending",   tone: "text-amber-700" },
    { label: "Leads ทั้งหมด",       value: leadsRes.count ?? 0,     href: "/admin/leads",                     tone: "text-foreground" },
    { label: "Leads รอดำเนินการ",  value: leadsPendRes.count ?? 0, href: "/admin/leads?segment=pending",     tone: "text-rose-700" },
  ];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        eyebrow="ADMIN · MARKETING"
        title="ระบบการตลาด"
        subtitle="ศูนย์รวมเครื่องมือการตลาดทั้งหมดไว้ที่เดียว — คอนเทนต์ · ประกาศ · โปรโมชัน · หาลูกค้า · วิเคราะห์"
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl border border-border bg-white dark:bg-surface p-3.5 shadow-sm transition hover:border-primary-200">
            <p className="text-[11px] text-muted">{s.label}</p>
            <p className={`mt-0.5 text-2xl font-black ${s.tone}`}>{s.value.toLocaleString("th-TH")}</p>
          </Link>
        ))}
      </div>

      <Section
        title="คอนเทนต์ & ประกาศ"
        tools={[
          { title: "เขียนบทความ",       desc: "สาระน่ารู้ · ข่าวสาร · ผลงานของเรา — เขียน → อนุมัติ → ขึ้นเว็บ", href: "/admin/articles",         icon: FileText },
          { title: "Broadcasts ประกาศ", desc: "ป๊อปอัป/ประกาศแจ้งลูกค้าทุกคนในระบบ",                            href: "/admin/broadcasts",       icon: Megaphone },
          { title: "แบนเนอร์โปรโมชัน",  desc: "จัดการแบนเนอร์โปรโมชันบนหน้าเว็บ",                                href: "/admin/settings/promos",  icon: BadgePercent },
        ]}
      />

      <Section
        title="หาลูกค้า & ดูแลลูกค้า (CRM)"
        tools={[
          { title: "โทรเซลล์ (Leads)",  desc: "มอบหมาย/สุ่มแบ่งโทรเซลล์ · บันทึกผลโทร · ปิดการขาย",          href: "/admin/leads",                 icon: PhoneCall },
          { title: "CRM",               desc: "ดูแลลูกค้า 360° · มอบหมายเซลล์/CS · ไปป์ไลน์",                href: "/admin/crm",                   icon: MessageSquare },
          { title: "แหล่งที่มาลูกค้า",   desc: "ลูกค้ามาจากช่องทางไหน — วัดผลแคมเปญ",                          href: "/admin/reports/lead-source",   icon: BarChart3 },
          { title: "กล่องข้อความติดต่อ", desc: "ข้อความจากฟอร์มติดต่อบนเว็บ",                                  href: "/admin/contact-messages",      icon: Mail },
          { title: "LINE inbox",        desc: "แชต LINE OA ของลูกค้า",                                        href: "/admin/line-inbox",            icon: MessageCircle },
        ]}
      />

      <Section
        title="วิเคราะห์"
        tools={[
          { title: "KPI Dashboard", desc: "ภาพรวมตัวเลขสำคัญของธุรกิจ", href: "/admin/kpi", icon: BarChart3 },
        ]}
      />
    </main>
  );
}
