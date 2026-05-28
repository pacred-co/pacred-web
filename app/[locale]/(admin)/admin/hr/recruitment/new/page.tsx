import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Plus } from "lucide-react";
import { NewPostingForm } from "./new-posting-form";

type Position = {
  id: string;
  name: string;
  section: { name: string; branch: { name: string } | { name: string }[] | null } | { name: string; branch: { name: string } | { name: string }[] | null }[] | null;
};

export default async function NewRecruitmentPostingPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("org_positions")
    .select(`
      id, name, sort_order,
      section:org_sections!section_id (
        name, sort_order,
        branch:org_branches!branch_id ( name, sort_order )
      )
    `)
    .order("sort_order");
  if (error) {
    console.error(`[org_positions list] failed`, { code: error.code, message: error.message });
  }

  const positions = ((data ?? []) as Position[]).map((p) => {
    const sec = Array.isArray(p.section) ? p.section[0] ?? null : p.section;
    const br  = sec?.branch ? (Array.isArray(sec.branch) ? sec.branch[0] ?? null : sec.branch) : null;
    return {
      id:          p.id,
      name:        p.name,
      sectionName: sec?.name ?? "—",
      branchName:  br?.name  ?? "—",
    };
  });

  return (
    <main className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr/recruitment" className="hover:text-primary-600">สรรหา</Link>
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
            <p className="text-xs opacity-80 mt-0.5">กรอกข้อมูลตำแหน่ง — หลังบันทึกจะเปิด pipeline ผู้สมัครให้อัตโนมัติ</p>
          </div>
        </div>
      </div>

      <NewPostingForm positions={positions} />
    </main>
  );
}
