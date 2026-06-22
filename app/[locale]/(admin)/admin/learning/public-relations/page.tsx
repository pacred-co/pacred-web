import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

// Faithful port of legacy pcs-admin publicRelations.php (ประชาสัมพันธ์) —
// an internal staff announcements / PR board. The legacy page read a content
// table that Pacred has NOT yet ported, so this renders a clean read-only
// section explainer + links back to the /admin/learning hub instead of
// inventing a table (status = partial · no migration). The editor + upload +
// sign-acknowledge flow ships in Phase H (same plan as the rest of /learning).
export const dynamic = "force-dynamic";

const HIGHLIGHTS = [
  {
    icon: "📣",
    title: "ประกาศจากผู้บริหาร",
    desc: "ข่าวสาร · นโยบาย · ประกาศสำคัญที่ทีมงานทุกฝ่ายต้องรับทราบ",
  },
  {
    icon: "🎉",
    title: "กิจกรรมและความเคลื่อนไหว",
    desc: "กิจกรรมภายในบริษัท · วันสำคัญ · ความสำเร็จของทีม Pacred",
  },
  {
    icon: "🤝",
    title: "ประชาสัมพันธ์ภายนอก",
    desc: "โปรโมชั่น · แคมเปญการตลาด · ข่าวที่สื่อสารถึงลูกค้าและพาร์ทเนอร์",
  },
];

export default async function AdminLearningPublicRelationsPage() {
  // Any admin role can view internal PR content.
  await requireAdmin();

  return (
    <main className="mx-auto max-w-4xl p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · LEARNING</p>
        <div className="mt-1 text-xs text-muted">
          <Link href="/admin/learning" className="hover:text-primary-600 hover:underline">
            ← ย้อนกลับไปหน้ารวมการเรียนรู้
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-bold">📣 ประชาสัมพันธ์</h1>
        <p className="mt-1 text-sm text-muted">
          กระดานข่าวสารและประกาศภายในองค์กรสำหรับพนักงานทุกฝ่าย
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg">ศูนย์ประชาสัมพันธ์ภายใน</h2>
            <p className="mt-2 text-sm text-muted">
              รวมประกาศ · ข่าวสาร · และกิจกรรมขององค์กรไว้ในที่เดียว
              เพื่อให้ทีมงานทุกฝ่ายรับข้อมูลตรงกัน
            </p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 whitespace-nowrap">
            อยู่ระหว่างจัดเตรียมเนื้อหา
          </span>
        </div>

        <div className="mt-5 grid sm:grid-cols-3 gap-4">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className="rounded-xl border border-border bg-surface-alt/40 dark:bg-surface/60 p-4"
            >
              <div className="text-2xl mb-2">{h.icon}</div>
              <h3 className="font-semibold text-sm">{h.title}</h3>
              <p className="mt-1 text-xs text-muted">{h.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-dashed border-border pt-5 text-sm text-muted space-y-2">
          <p>
            หน้านี้พอร์ตจากระบบเดิม{" "}
            <code className="rounded bg-surface-alt px-1.5 py-0.5 text-[11px]">publicRelations.php</code>{" "}
            (ประชาสัมพันธ์) — ในระบบเดิมดึงเนื้อหาจากตารางข่าวสารที่ Pacred ยังไม่ได้พอร์ต
          </p>
          <p>
            ระบบเพิ่ม/แก้ไขประกาศ · อัปโหลดรูปภาพ · และการแจ้งเตือนทีมงาน
            จะเปิดใช้งานในเฟสถัดไป (Phase H — editor + upload + sign-acknowledge)
          </p>
          <p className="text-xs">
            ระหว่างนี้ดูข่าวสารภายในได้ที่{" "}
            <Link href="/admin/learning/news" className="text-primary-600 hover:underline">
              ข่าวสารภายในองค์กร
            </Link>{" "}
            หรือเสนอเนื้อหาผ่าน{" "}
            <Link href="/admin/board/inbox" className="text-primary-600 hover:underline">
              /admin/board/inbox
            </Link>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/learning"
          className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm font-medium shadow-sm hover:border-primary-300 hover:text-primary-600 transition-colors"
        >
          📚 หน้ารวมการเรียนรู้
        </Link>
        <Link
          href="/admin/learning/new-system"
          className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-2.5 text-sm font-medium shadow-sm hover:border-primary-300 hover:text-primary-600 transition-colors"
        >
          🆕 แนะนำระบบใหม่
        </Link>
      </div>
    </main>
  );
}
