import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Building2 } from "lucide-react";
import { loadOrgTree, deptTotals, type OrgUnit } from "@/lib/admin/hr-org";

/**
 * /admin/hr/org-table — ผังองค์กรแบบตาราง (owner 2026-08-03 · เฟส 1).
 * repoint จากผังเก่า org_* (mig 0017) → hr_org_units (mig 0287). read-only.
 */

export const dynamic = "force-dynamic";

const cell = "border border-border/60 px-3 py-2 text-[13px]";

function qStr(have: number, quota: number) {
  if (quota === 0 && have === 0) return "—";
  return `${have}/${quota}`;
}

export default async function OrgTablePage() {
  await requireAdmin(["super", "accounting"]);
  const { root, error } = await loadOrgTree();

  const ceo = root?.children.find((c) => c.code === "ceo");
  const head = ceo?.children.find((c) => c.kind === "position");
  const depts: OrgUnit[] = (head?.children ?? []).filter((c) => c.kind === "department");

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground"><Home className="h-3.5 w-3.5" /> หน้าหลัก</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/hr" className="hover:text-foreground">HR</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">ผังองค์กร (ตาราง)</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · HUMAN RESOURCES</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6 text-primary-600" /> ผังองค์กร Pacred (ตาราง)</h1>
        </div>
        <Link href="/admin/hr/org-chart" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ดูแบบผังภาพ →
        </Link>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">โหลดผังไม่สำเร็จ ({error})</div>
      ) : (
        <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface">
          <table className="w-full border-collapse">
            <thead className="bg-surface-alt/60 text-left text-xs text-muted">
              <tr>
                <th className={cell}>แผนก</th>
                <th className={cell}>ตำแหน่ง</th>
                <th className={cell}>หัวหน้า</th>
                <th className={`${cell} text-right`}>พนักงาน</th>
                <th className={`${cell} text-right`}>ฝึกงาน</th>
                <th className={`${cell} text-right`}>พาร์ทเนอร์</th>
                <th className={cell}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => {
                const t = deptTotals(d);
                return (
                  <>
                    <tr key={d.id} className="bg-[#161616] text-white">
                      <td className={`${cell} font-semibold`}>{d.nameTh}</td>
                      <td className={cell}>รวมทั้งแผนก</td>
                      <td className={cell}></td>
                      <td className={`${cell} text-right tabular-nums font-semibold`}>{qStr(t.hE, t.qE)}</td>
                      <td className={`${cell} text-right tabular-nums`}>{qStr(t.hI, t.qI)}</td>
                      <td className={`${cell} text-right tabular-nums`}>{qStr(t.hP, t.qP)}</td>
                      <td className={cell}></td>
                    </tr>
                    {d.children.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-alt/30">
                        <td className={cell}></td>
                        <td className={`${cell} font-medium`}>{p.nameTh}</td>
                        <td className={cell}>{p.isHead ? "✓" : ""}</td>
                        <td className={`${cell} text-right tabular-nums`}>{qStr(p.haveEmployee, p.quotaEmployee)}</td>
                        <td className={`${cell} text-right tabular-nums`}>{qStr(p.haveInternship, p.quotaInternship)}</td>
                        <td className={`${cell} text-right tabular-nums`}>{qStr(p.havePartner, p.quotaPartner)}</td>
                        <td className={`${cell} text-[11px] text-muted`}>{p.note ?? ""}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
