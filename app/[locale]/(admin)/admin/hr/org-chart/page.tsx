import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Building2, Table2, Users } from "lucide-react";
import { loadOrgTree } from "@/lib/admin/hr-org";
import { OrgChartView } from "./org-chart-view";

/**
 * /admin/hr/org-chart — ผังองค์กร Pacred (owner 2026-08-03 · เฟส 1).
 *
 * แทนผังเก่า org_branches/org_sections (mig 0017 · วาดเล่น ไม่ตรงงานจริง).
 * อ่านจาก `hr_org_units` (mig 0287 · แก้จากหลังบ้านได้) → render โครง PCS
 * ยุบเหลือบริษัทเดียว: CEO → Manager·AUDIT/QC → 9 แผนก → ตำแหน่ง.
 *
 * ⚠️ คนจริง (have_*) = seed จากผังที่ owner วาด — เฟส 2 จะสลับไปนับสดจาก row
 * พนักงานที่ย้ายเข้าตำแหน่ง (ตอนนี้ยังไม่ผูก employee).
 * RBAC: super | accounting (HR อยู่กลุ่มนี้) · §0c error surfaced.
 */

export const dynamic = "force-dynamic";

const LEGEND: { cls: string; label: string }[] = [
  { cls: "bg-[#c62828] text-white", label: "ไม่มีคนทำงาน" },
  { cls: "bg-[#f3f2f1] border-2 border-dashed border-gray-400 text-gray-600", label: "รอคนเลื่อนตำแหน่งมา" },
  { cls: "bg-blue-50 border-2 border-blue-400 text-blue-800", label: "มีคนเกินมา" },
  { cls: "bg-[#f2fbf4] border-2 border-emerald-500 text-emerald-800", label: "ตำแหน่งงานลงตัวแล้ว" },
  { cls: "bg-white border-2 border-red-600 text-red-700", label: "มีคนแล้วแต่ยังไม่ครบโควตา" },
];

export default async function OrgChartPage() {
  await requireAdmin(["super", "accounting"]);
  const { root, error } = await loadOrgTree();

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground"><Home className="h-3.5 w-3.5" /> หน้าหลัก</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/hr" className="hover:text-foreground">HR</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">ผังองค์กร</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · HUMAN RESOURCES</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6 text-primary-600" /> ผังองค์กร Pacred</h1>
          <p className="mt-0.5 text-xs text-muted leading-relaxed">
            บริษัทเดียว · โครงแบบ PCS → แผนก → ตำแหน่ง · ตัวเลข = <b>คนจริง / โควตา</b> ·
            หัวหน้าเลื่อนแบบ PCS (ย้ายคนขึ้นกล่องหัวหน้า)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/hr/staff" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700">
            <Users className="h-4 w-4" /> จัดคนเข้าตำแหน่ง
          </Link>
          <Link href="/admin/hr/org-table" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            <Table2 className="h-4 w-4" /> ดูแบบตาราง
          </Link>
        </div>
      </header>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11.5px] text-amber-800 leading-relaxed">
        📌 <b>เฟส 1</b> — คนจริงในผังนี้คือค่าเริ่มต้นตามที่วางไว้ · <b>เฟส 2</b> จะย้ายพนักงานจริงเข้าแต่ละตำแหน่ง แล้วตัวเลขจะนับสดจากทะเบียนพนักงาน ·
        ผังนี้แก้จากหลังบ้านได้ (ไม่ hardcode)
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          โหลดผังไม่สำเร็จ ({error}) — ลองรีเฟรชอีกครั้ง
        </div>
      ) : !root ? (
        <div className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-8 text-center text-sm text-muted">
          ยังไม่มีข้อมูลผังองค์กร
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
          <OrgChartView root={root} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white dark:bg-surface p-3">
        <h3 className="w-full text-xs font-bold">ความหมายของสัญลักษณ์</h3>
        {LEGEND.map((l) => (
          <span key={l.label} className={`rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ${l.cls}`}>{l.label}</span>
        ))}
        <p className="mt-1 w-full text-[11px] text-muted leading-relaxed">
          กล่องเทา (หัวหน้า/Supervisor) = <b>ตำแหน่งจริง โควตา 1</b> · เลื่อนตำแหน่ง = ย้ายคนจากทีมขึ้นมานั่ง
          (ทีมว่างลง 1 · ไม่รับคนเพิ่ม) · หัวหน้า = สิทธิ์เห็นมากกว่าลูกทีม
        </p>
      </div>
    </main>
  );
}
