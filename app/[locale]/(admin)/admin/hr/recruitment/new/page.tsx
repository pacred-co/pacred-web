import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Plus } from "lucide-react";
import { NewPostingForm } from "./new-posting-form";

/**
 * D1 faithful port of post-job.php — the 13-field "ลงประกาศรับสมัครงาน" form.
 * Writes the migrated legacy `tb_post_job` via adminCreatePosting.
 */
export default async function NewRecruitmentPostingPage() {
  await requireAdmin();

  return (
    <main className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr/recruitment" className="hover:text-primary-600">ลงประกาศรับสมัครงาน</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">ลงประกาศใหม่</span>
      </nav>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Plus className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest opacity-80">HR · RECRUITMENT</p>
            <h1 className="text-xl sm:text-2xl font-bold">ลงประกาศรับสมัครงานใหม่</h1>
            <p className="text-xs opacity-80 mt-0.5">กรอกข้อมูลตำแหน่ง — สถานะจะคำนวณจากช่วงเวลาเริ่ม-สิ้นสุดประกาศ</p>
          </div>
        </div>
      </div>

      <NewPostingForm />
    </main>
  );
}
