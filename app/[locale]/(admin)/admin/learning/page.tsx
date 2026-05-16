import { Link } from "@/i18n/navigation";

/**
 * Learning hub — org-wide knowledge for staff (rules · news · customer T&C).
 *
 * Decision (ภูม 2026-05-16 — close P2 brief item): KEEP /admin/learning as
 * org-wide docs surface; REDIRECT the "การอบรม" card to /admin/hr/training
 * (HR module already owns employee training per CLAUDE.md "HR 100%: training"
 * — no point duplicating). Phase H ships the editor + upload + sign-acknowledge
 * flow for the 3 remaining sections.
 */
export default function AdminLearningPage() {
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
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · LEARNING</p>
        <h1 className="mt-1 text-2xl font-bold">📚 เรียนรู้และข้อมูลภายใน</h1>
        <p className="mt-1 text-sm text-muted">เนื้อหาสำหรับพนักงานทุกฝ่าย</p>
      </div>

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
              <p className="mt-2 text-[10px] text-blue-600 font-medium">→ เปิดในโมดูล HR</p>
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
