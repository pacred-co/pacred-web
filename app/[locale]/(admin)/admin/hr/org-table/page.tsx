import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Table2 } from "lucide-react";

type Branch  = { id: string; slug: string; name: string; color_tone: string; sort_order: number };
type Section = { id: string; branch_id: string; slug: string; name: string; sort_order: number };
type Position = {
  id: string; section_id: string; slug: string; name: string;
  quota_employee: number; quota_internship: number; quota_partner: number; sort_order: number;
};
type Assignment = {
  id: string; position_id: string; profile_id: string;
  kind: "employee" | "internship" | "partner"; ended_at: string | null;
  profile?: { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
};

const TONE_BG: Record<string, string> = {
  cyan:   "bg-cyan-50 text-cyan-700 border-cyan-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  red:    "bg-red-50 text-red-700 border-red-200",
  grey:   "bg-gray-50 text-gray-700 border-gray-200",
};

export default async function OrgTablePage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [branchesRes, sectionsRes, positionsRes, assignmentsRes] = await Promise.all([
    admin.from("org_branches").select("*").order("sort_order"),
    admin.from("org_sections").select("*").order("sort_order"),
    admin.from("org_positions").select("*").order("sort_order"),
    admin.from("org_assignments")
      .select(`id, position_id, profile_id, kind, ended_at,
               profile:profiles!profile_id ( member_code, first_name, last_name, phone )`)
      .is("ended_at", null),
  ]);

  const branches    = (branchesRes.data    ?? []) as Branch[];
  const sections    = (sectionsRes.data    ?? []) as Section[];
  const positions   = (positionsRes.data   ?? []) as Position[];
  const assignments = ((assignmentsRes.data ?? []) as Array<Assignment & { profile: Assignment["profile"] | Assignment["profile"][] | null }>).map((a) => ({
    ...a,
    profile: Array.isArray(a.profile) ? (a.profile[0] ?? null) : a.profile,
  })) as Assignment[];

  const branchById  = new Map(branches.map((b) => [b.id, b]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const positionsBySection = new Map<string, Position[]>();
  for (const p of positions) {
    if (!positionsBySection.has(p.section_id)) positionsBySection.set(p.section_id, []);
    positionsBySection.get(p.section_id)!.push(p);
  }
  const assignmentsByPosition = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!assignmentsByPosition.has(a.position_id)) assignmentsByPosition.set(a.position_id, []);
    assignmentsByPosition.get(a.position_id)!.push(a);
  }

  // Totals row
  const totals = positions.reduce(
    (acc, p) => {
      const fills = assignmentsByPosition.get(p.id) ?? [];
      acc.quotaE += p.quota_employee;   acc.filledE += fills.filter((a) => a.kind === "employee").length;
      acc.quotaI += p.quota_internship; acc.filledI += fills.filter((a) => a.kind === "internship").length;
      acc.quotaP += p.quota_partner;    acc.filledP += fills.filter((a) => a.kind === "partner").length;
      return acc;
    },
    { quotaE: 0, filledE: 0, quotaI: 0, filledI: 0, quotaP: 0, filledP: 0 },
  );

  return (
    <main className="p-4 lg:p-6 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">ผังองค์กรแบบตาราง</span>
      </nav>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600">
              <Table2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pacred — Org Chart (ตาราง)</h1>
              <p className="text-xs text-muted mt-0.5">
                {branches.length} branches · {sections.length} sections · {positions.length} positions ·{" "}
                <b>{totals.filledE}/{totals.quotaE}</b> employees · <b>{totals.filledI}/{totals.quotaI}</b> interns · <b>{totals.filledP}/{totals.quotaP}</b> partners
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/hr/org-chart"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ← ดูแบบภาพ
            </Link>
            <Link
              href="/admin/hr"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              กลับ HR
            </Link>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3 text-center">Employee</th>
                <th className="px-4 py-3 text-center">Internship</th>
                <th className="px-4 py-3 text-center">Partner</th>
                <th className="px-4 py-3">ผู้นั่งตำแหน่งปัจจุบัน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {positions.map((p) => {
                const sec  = sectionById.get(p.section_id);
                const br   = sec ? branchById.get(sec.branch_id) : undefined;
                const fills = assignmentsByPosition.get(p.id) ?? [];
                const e = fills.filter((a) => a.kind === "employee").length;
                const i = fills.filter((a) => a.kind === "internship").length;
                const pa = fills.filter((a) => a.kind === "partner").length;
                return (
                  <tr key={p.id} className="hover:bg-surface-alt/30 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_BG[br?.color_tone ?? "grey"]}`}>
                        {br?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-sm font-medium text-foreground">{sec?.name ?? "—"}</td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-bold text-foreground">{p.name}</p>
                      <p className="text-[10px] text-muted font-mono">{p.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <QuotaCell filled={e} quota={p.quota_employee} />
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <QuotaCell filled={i} quota={p.quota_internship} />
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      <QuotaCell filled={pa} quota={p.quota_partner} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      {fills.length === 0 ? (
                        <span className="text-[11px] text-muted italic">— ยังไม่มีคน —</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {fills.map((a) => (
                            <li key={a.id} className="text-xs">
                              <span className="font-mono text-primary-600">{a.profile?.member_code ?? "—"}</span>{" "}
                              {a.profile?.first_name ?? ""} {a.profile?.last_name ?? ""}
                              <span className="text-[10px] text-muted ml-1">({a.kind})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        Phase 2 (เร็วๆ นี้): ปุ่ม assign / unassign คน · เพิ่ม / ลบ / rename position · แก้ quota inline
      </div>
    </main>
  );
}

function QuotaCell({ filled, quota }: { filled: number; quota: number }) {
  if (quota === 0 && filled === 0) return <span className="text-muted text-xs">—</span>;
  const isOver  = filled > quota;
  const isFull  = filled === quota && quota > 0;
  const isEmpty = filled === 0 && quota > 0;
  const tone = isOver  ? "bg-blue-50 text-blue-700 border-blue-200"
              : isFull ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : isEmpty ? "bg-gray-50 text-gray-700 border-gray-200"
                        : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold font-mono ${tone}`}>
      {filled} / {quota}
    </span>
  );
}
