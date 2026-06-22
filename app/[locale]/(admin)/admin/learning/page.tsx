import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";

// Per-topic placeholder routing (Wave B-6 — sidebar fidelity audit fix).
// The sidebar promises 5 distinct learning destinations
// (lib/admin/sidebar-menu.ts — job-flow / business-plan / culture /
// newsfeed / regulations). Until Phase H ships the editor + upload +
// sign-acknowledge flow, each ?topic= renders a labelled placeholder
// so the 5 sidebar items LAND somewhere distinct (audit option (a) —
// keeps the 5-row sidebar contract intact).
const TOPIC_CFG: Record<string, { label: string; description: string }> = {
  "job-flow":      { label: "ผังงาน Job งาน",        description: "แผนผังขั้นตอนการทำงาน ใบสั่งซื้อ → คลังจีน → คลังไทย → จัดส่ง" },
  "business-plan": { label: "Business Plan",          description: "แผนธุรกิจ · OKRs · KPI ของบริษัท Pacred" },
  "culture":       { label: "วัฒนธรรมองค์กร",         description: "ค่านิยม · พฤติกรรมที่อยากเห็น · core values" },
  "newsfeed":      { label: "ข่าวสารภายในองค์กร",     description: "ประกาศ · ข่าวภายใน · กิจกรรมล่าสุด" },
  "regulations":   { label: "กฏระเบียบและสัญญา",     description: "ระเบียบการทำงาน · สัญญาจ้าง · workplace policies" },
};

// Reads searchParams → must be dynamic (Next 16 + AGENTS.md §11).
export const dynamic = "force-dynamic";

/**
 * Learning hub — org-wide knowledge for staff (rules · news · customer T&C).
 *
 * Decision (ภูม 2026-05-16 — close P2 brief item): KEEP /admin/learning as
 * org-wide docs surface; REDIRECT the "การอบรม" card to /admin/hr/training
 * (HR module already owns employee training per CLAUDE.md "HR 100%: training"
 * — no point duplicating). Phase H ships the editor + upload + sign-acknowledge
 * flow for the 3 remaining sections.
 *
 * Wave B-6 (2026-05-19): also honours `?topic=<key>` from the sidebar so the
 * 5 sidebar items land on 5 labelled placeholder screens instead of all
 * dumping to the same 4-card hub. No-topic case still renders the hub.
 */
export default async function AdminLearningPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" && sp.topic in TOPIC_CFG ? sp.topic : null;

  // Per-topic placeholder view — sidebar arrived with a known ?topic=
  if (topic) {
    const cfg = TOPIC_CFG[topic];
    return (
      <main className="p-6 lg:p-8 space-y-5">
        <PageHeader
          eyebrow="ADMIN · LEARNING"
          title={`📚 ${cfg.label}`}
          subtitle={
            <Link href="/admin/learning" className="hover:text-primary-600 hover:underline">← ย้อนกลับไปหน้ารวม</Link>
          }
        />

        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg">{cfg.label}</h2>
              <p className="mt-2 text-sm text-muted">{cfg.description}</p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 whitespace-nowrap">
              อยู่ระหว่างจัดเตรียมเนื้อหา
            </span>
          </div>

          <div className="mt-5 border-t border-dashed border-border pt-5 text-sm text-muted space-y-2">
            <p>หน้านี้เป็น <strong className="font-semibold text-default">placeholder</strong> สำหรับเนื้อหา &quot;{cfg.label}&quot;</p>
            <p>เจ้าหน้าที่ HR/แอดมินจะเพิ่มเอกสาร · วิดีโอ · หรือลิงก์ที่เกี่ยวข้องในเฟสถัดไป (Phase H — editor + upload + sign-acknowledge flow)</p>
            <p className="text-xs">หากต้องการเสนอเนื้อหา ติดต่อทีม HR หรือเปิด ticket ที่ <Link href="/admin/board/inbox" className="text-primary-600 hover:underline">/admin/board/inbox</Link></p>
          </div>
        </div>
      </main>
    );
  }

  // Default hub — no ?topic= (or invalid). Preserved unchanged from pre-B-6.
  const sections = [
    {
      slug:    "rules",
      icon:    "📜",
      title:   "กฎระเบียบและสัญญา",
      desc:    "กฎระเบียบของบริษัทและสัญญาจ้าง — เซ็นรับทราบครั้งแรก",
      href:    "/admin/learning/rules",
      external: false,
    },
    {
      slug:    "training",
      icon:    "🎓",
      title:   "การอบรม → HR",
      desc:    "วิดีโอ + เอกสารอบรมสำหรับพนักงาน — อยู่ที่โมดูล HR (ไม่ duplicate)",
      href:    "/admin/hr/training",
      external: true,
    },
    {
      slug:    "news",
      icon:    "📢",
      title:   "ข่าวสารภายในองค์กร",
      desc:    "ประกาศจากผู้บริหาร + อัพเดทระบบสำคัญ",
      href:    "/admin/learning/news",
      external: false,
    },
    // Wave 1 gap-fill (2026-06-12 · port publicRelations.php + introdNewSystem.php)
    {
      slug:    "public-relations",
      icon:    "📣",
      title:   "ประชาสัมพันธ์",
      desc:    "ข่าวประชาสัมพันธ์ · กิจกรรม · ประกาศภายในองค์กร",
      href:    "/admin/learning/public-relations",
      external: false,
    },
    {
      slug:    "new-system",
      icon:    "✨",
      title:   "แนะนำระบบใหม่",
      desc:    "อัปเดตฟีเจอร์/ระบบใหม่ที่เพิ่งเปิดใช้งาน",
      href:    "/admin/learning/new-system",
      external: false,
    },
    {
      slug:    "customer-terms",
      icon:    "📋",
      title:   "เงื่อนไขการให้บริการลูกค้า",
      desc:    "T&C ฉบับล่าสุด + ประวัติเวอร์ชัน",
      href:    "/admin/learning/customer-terms",
      external: false,
    },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · LEARNING"
        title="📚 เรียนรู้และข้อมูลภายใน"
        subtitle="เนื้อหาสำหรับพนักงานทุกฝ่าย"
      />

      <div className="grid sm:grid-cols-2 gap-4">
        {sections.map((s) => (
          <Link
            key={s.slug}
            href={s.href}
            className={`group block rounded-2xl border bg-white dark:bg-surface p-6 shadow-sm hover:shadow-md transition-all ${
              s.external ? "border-blue-200 hover:border-blue-400" : "border-border hover:border-primary-300"
            }`}
          >
            <div className="text-4xl mb-3">{s.icon}</div>
            <h3 className={`font-bold text-lg ${s.external ? "group-hover:text-blue-600" : "group-hover:text-primary-600"}`}>
              {s.title}
            </h3>
            <p className="mt-1 text-xs text-muted">{s.desc}</p>
            {s.external && (
              <p className="mt-2 text-[11px] text-blue-600 font-medium">→ เปิดในโมดูล HR</p>
            )}
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
        ระบบอัพโหลด/แก้ไขเนื้อหา + เซ็นรับทราบ — เพิ่มในเฟสถัดไป (Phase G+)
      </div>
    </main>
  );
}
