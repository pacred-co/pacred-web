import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Crown, Users2, AlertCircle, Plus, Minus } from "lucide-react";

type Branch = {
  id: string;
  slug: string;
  name: string;
  director_profile_id: string | null;
  color_tone: "red" | "cyan" | "yellow" | "purple" | "grey" | "blue" | "green";
  sort_order: number;
};
type Section = {
  id: string;
  branch_id: string;
  slug: string;
  name: string;
  manager_profile_id: string | null;
  sort_order: number;
};
type Position = {
  id: string;
  section_id: string;
  slug: string;
  name: string;
  quota_employee: number;
  quota_internship: number;
  quota_partner: number;
  sort_order: number;
};
type Assignment = {
  id: string;
  position_id: string;
  profile_id: string;
  kind: "employee" | "internship" | "partner";
  ended_at: string | null;
  profile?: { member_code: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null };
};

const TONE_RING: Record<Branch["color_tone"], string> = {
  red:    "ring-red-500",
  cyan:   "ring-cyan-400",
  yellow: "ring-amber-400",
  purple: "ring-purple-500",
  grey:   "ring-gray-300",
  blue:   "ring-blue-500",
  green:  "ring-emerald-500",
};

const TONE_BG: Record<Branch["color_tone"], string> = {
  red:    "bg-red-50 border-red-200 text-red-700",
  cyan:   "bg-cyan-50 border-cyan-200 text-cyan-700",
  yellow: "bg-amber-50 border-amber-200 text-amber-700",
  purple: "bg-purple-50 border-purple-200 text-purple-700",
  grey:   "bg-gray-50 border-gray-200 text-gray-700",
  blue:   "bg-blue-50 border-blue-200 text-blue-700",
  green:  "bg-emerald-50 border-emerald-200 text-emerald-700",
};

/** PCS-style state from quota vs filled count. */
function stateColor(quota: number, filled: number, branchTone: Branch["color_tone"]): Branch["color_tone"] {
  if (quota === 0 && filled === 0) return "grey";
  if (filled === 0 && quota > 0)   return "grey";  // empty seat
  if (filled > quota)              return "blue";   // over-staffed
  if (filled === quota)            return branchTone;
  return "grey";                                     // partial fill (รอเลื่อน)
}

export default async function OrgChartPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [branchesRes, sectionsRes, positionsRes, assignmentsRes] = await Promise.all([
    admin.from("org_branches").select("*").order("sort_order"),
    admin.from("org_sections").select("*").order("sort_order"),
    admin.from("org_positions").select("*").order("sort_order"),
    admin.from("org_assignments")
      .select(`id, position_id, profile_id, kind, ended_at,
               profile:profiles!profile_id ( member_code, first_name, last_name, avatar_url )`)
      .is("ended_at", null),
  ]);

  const branches    = (branchesRes.data    ?? []) as Branch[];
  const sections    = (sectionsRes.data    ?? []) as Section[];
  const positions   = (positionsRes.data   ?? []) as Position[];
  const assignments = ((assignmentsRes.data ?? []) as Array<Assignment & { profile: Assignment["profile"] | Assignment["profile"][] | null }>).map((a) => ({
    ...a,
    profile: Array.isArray(a.profile) ? (a.profile[0] ?? null) : a.profile,
  })) as Assignment[];

  // Group
  const sectionsByBranch = new Map<string, Section[]>();
  for (const s of sections) {
    if (!sectionsByBranch.has(s.branch_id)) sectionsByBranch.set(s.branch_id, []);
    sectionsByBranch.get(s.branch_id)!.push(s);
  }
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

  // Aggregate totals per branch for the director card
  const branchTotals = new Map<string, { e: { f: number; q: number }; i: { f: number; q: number }; p: { f: number; q: number } }>();
  for (const b of branches) {
    const bSections = sectionsByBranch.get(b.id) ?? [];
    const t = { e: { f: 0, q: 0 }, i: { f: 0, q: 0 }, p: { f: 0, q: 0 } };
    for (const s of bSections) {
      const pos = positionsBySection.get(s.id) ?? [];
      for (const p of pos) {
        const fills = assignmentsByPosition.get(p.id) ?? [];
        t.e.q += p.quota_employee;   t.e.f += fills.filter((a) => a.kind === "employee").length;
        t.i.q += p.quota_internship; t.i.f += fills.filter((a) => a.kind === "internship").length;
        t.p.q += p.quota_partner;    t.p.f += fills.filter((a) => a.kind === "partner").length;
      }
    }
    branchTotals.set(b.id, t);
  }

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
        <span className="text-foreground font-medium">ผังองค์กรแบบภาพ</span>
      </nav>

      {/* Header + legend */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600">
              <Users2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pacred — Organization Chart</h1>
              <p className="text-xs text-muted mt-0.5">ผังองค์กรแบบภาพ · CEO → 3 Directors → Sections → Positions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/hr/org-table"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ดูแบบตาราง →
            </Link>
            <Link
              href="/admin/hr"
              className="rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-medium hover:bg-surface-alt"
            >
              ← กลับ HR
            </Link>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-muted">สีวงแหวน:</span>
          <LegendChip tone="red"    label="CEO" />
          <LegendChip tone="cyan"   label="BD & Tech" />
          <LegendChip tone="yellow" label="Operations" />
          <LegendChip tone="purple" label="Finance & Admin" />
          <span className="mx-2 text-muted">·</span>
          <LegendChip tone="grey"  label="ยังไม่มีคน" />
          <LegendChip tone="blue"  label="เกิน" />
        </div>
      </div>

      {/* CEO */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
        <div className="flex justify-center">
          <NodeCard
            tone="red"
            avatar={null}
            title="CEO"
            subtitle="ประธานเจ้าหน้าที่บริหาร"
            name="Pacred CEO"
            big
          />
        </div>

        {/* Connector line — CEO down to 3 directors */}
        <div className="mt-4 flex justify-center">
          <div className="h-6 w-0.5 bg-border" />
        </div>
        <div className="h-0.5 bg-border mx-auto" style={{ maxWidth: "1100px" }} />

        {/* 3 directors row */}
        <div className="mt-1 grid grid-cols-1 md:grid-cols-3 gap-4">
          {branches.map((b) => {
            const t = branchTotals.get(b.id)!;
            return (
              <div key={b.id} className="flex flex-col items-center">
                <div className="h-6 w-0.5 bg-border" />
                <NodeCard
                  tone={b.color_tone}
                  avatar={null}
                  title={b.name}
                  subtitle="Director"
                  name={b.director_profile_id ? "—" : "ยังไม่ได้กำหนด"}
                />
                {/* Totals */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  {t.e.q > 0 && <QuotaPill kind="employee"   filled={t.e.f} quota={t.e.q} />}
                  {t.i.q > 0 && <QuotaPill kind="internship" filled={t.i.f} quota={t.i.q} />}
                  {t.p.q > 0 && <QuotaPill kind="partner"    filled={t.p.f} quota={t.p.q} />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Branches — sections + positions */}
      {branches.map((b) => {
        const bSections = sectionsByBranch.get(b.id) ?? [];
        return (
          <section key={b.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
            <header className="flex items-center gap-3 pb-3 border-b border-border">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${TONE_BG[b.color_tone]}`}>
                <Crown className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold">{b.name}</h2>
                <p className="text-xs text-muted">{bSections.length} sections · {bSections.reduce((s, sec) => s + (positionsBySection.get(sec.id)?.length ?? 0), 0)} positions</p>
              </div>
            </header>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bSections.map((s) => {
                const pos = positionsBySection.get(s.id) ?? [];
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-surface-alt/30 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-bold text-sm text-foreground">{s.name}</p>
                      <span className="text-[10px] text-muted">{pos.length} ตำแหน่ง</span>
                    </div>
                    <div className="space-y-2">
                      {pos.map((p) => {
                        const fills = assignmentsByPosition.get(p.id) ?? [];
                        const e = fills.filter((a) => a.kind === "employee").length;
                        const i = fills.filter((a) => a.kind === "internship").length;
                        const pa = fills.filter((a) => a.kind === "partner").length;
                        const stateE = stateColor(p.quota_employee, e, b.color_tone);
                        return (
                          <div key={p.id} className={`rounded-lg border bg-white dark:bg-surface p-2.5 ring-1 ${TONE_RING[stateE]} ring-inset`}>
                            <p className="text-xs font-bold text-foreground">{p.name}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.quota_employee   > 0 && <QuotaPill kind="employee"   filled={e}  quota={p.quota_employee} />}
                              {p.quota_internship > 0 && <QuotaPill kind="internship" filled={i}  quota={p.quota_internship} />}
                              {p.quota_partner    > 0 && <QuotaPill kind="partner"    filled={pa} quota={p.quota_partner} />}
                              {p.quota_employee + p.quota_internship + p.quota_partner === 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                                  <AlertCircle className="w-2.5 h-2.5" /> ยังไม่ได้ตั้งโควต้า
                                </span>
                              )}
                            </div>
                            {fills.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {fills.map((a) => (
                                  <span key={a.id} className="inline-flex items-center rounded-full bg-surface-alt text-foreground border border-border px-2 py-0.5 text-[10px]">
                                    {a.profile?.first_name ?? "—"} {a.profile?.last_name ?? ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        จะ assign คนเข้าตำแหน่งได้จากหน้า <Link href="/admin/hr/org-table" className="text-primary-600 hover:underline">ผังตาราง</Link>{" "}
        — ตอนนี้ทุกตำแหน่งจะแสดงเป็น <b>grey</b> (ยังไม่มีคน) จนกว่าจะมีการ assign
      </div>
    </main>
  );
}

function LegendChip({ tone, label }: { tone: Branch["color_tone"]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-full ring-2 ${TONE_RING[tone]} bg-white`} />
      <span className="text-foreground">{label}</span>
    </span>
  );
}

function NodeCard({
  tone, avatar, title, subtitle, name, big = false,
}: {
  tone: Branch["color_tone"];
  avatar: string | null;
  title: string;
  subtitle?: string;
  name: string;
  big?: boolean;
}) {
  const size = big ? "h-20 w-20" : "h-14 w-14";
  return (
    <div className="text-center">
      <div className={`mx-auto rounded-full ring-4 ${TONE_RING[tone]} bg-surface-alt flex items-center justify-center overflow-hidden ${size}`}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className={`font-bold text-muted ${big ? "text-2xl" : "text-base"}`}>
            {name.charAt(0)}
          </span>
        )}
      </div>
      <p className={`mt-2 font-bold text-foreground ${big ? "text-sm" : "text-xs"}`}>{title}</p>
      {subtitle && <p className="text-[10px] text-muted">{subtitle}</p>}
      <p className="text-[11px] text-muted mt-0.5">{name}</p>
    </div>
  );
}

function QuotaPill({ kind, filled, quota }: { kind: "employee" | "internship" | "partner"; filled: number; quota: number }) {
  const KIND_LABEL = { employee: "Employee", internship: "Internship", partner: "Partner" }[kind];
  const KIND_TONE  = {
    employee:   "bg-cyan-50   text-cyan-700   border-cyan-200",
    internship: "bg-amber-50  text-amber-700  border-amber-200",
    partner:    "bg-purple-50 text-purple-700 border-purple-200",
  }[kind];
  const isOver  = filled > quota;
  const isFull  = filled === quota;
  const Icon    = isOver ? Plus : isFull ? null : Minus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${KIND_TONE}`}>
      {Icon && <Icon className="w-2.5 h-2.5" />}
      {KIND_LABEL} ({filled}/{quota})
    </span>
  );
}
