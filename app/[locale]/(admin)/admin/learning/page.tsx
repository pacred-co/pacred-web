import { Link } from "@/i18n/navigation";

/**
 * Learning hub — internal knowledge for staff. Mirrors legacy
 * Learning sidebar (กฎระเบียบ, การอบรม, ข่าวสาร, เงื่อนไขลูกค้า).
 * Phase H ships the shell; admin uploads content via Supabase Storage
 * + a (future) editor.
 */
export default function AdminLearningPage() {
  const sections = [
    {
      slug:  "rules",
      icon:  "📜",
      title: "กฎระเบียบและสัญญา",
      desc:  "กฎระเบียบของบริษัทและสัญญาจ้าง — เซ็นรับทราบครั้งแรก",
      href:  "/admin/learning/rules",
    },
    {
      slug:  "training",
      icon:  "🎓",
      title: "การอบรม",
      desc:  "วิดีโอ + เอกสารอบรมสำหรับพนักงานใหม่และอัพเดทประจำปี",
      href:  "/admin/learning/training",
    },
    {
      slug:  "news",
      icon:  "📢",
      title: "ข่าวสารภายในองค์กร",
      desc:  "ประกาศจากผู้บริหาร + อัพเดทระบบสำคัญ",
      href:  "/admin/learning/news",
    },
    {
      slug:  "customer-terms",
      icon:  "📋",
      title: "เงื่อนไขการให้บริการลูกค้า",
      desc:  "T&C ฉบับล่าสุด + ประวัติเวอร์ชัน",
      href:  "/admin/learning/customer-terms",
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
            className="group block rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm hover:shadow-md hover:border-primary-300 transition-all"
          >
            <div className="text-4xl mb-3">{s.icon}</div>
            <h3 className="font-bold text-lg group-hover:text-primary-600">{s.title}</h3>
            <p className="mt-1 text-xs text-muted">{s.desc}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
        ระบบอัพโหลด/แก้ไขเนื้อหา + เซ็นรับทราบ — เพิ่มในเฟสถัดไป (Phase G+)
      </div>
    </main>
  );
}
