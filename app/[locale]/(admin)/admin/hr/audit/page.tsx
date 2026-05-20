import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, ClipboardList, Calendar, Search,
  Star, FileText, AlertTriangle, ShieldX, GraduationCap, TrendingUp, MoreHorizontal,
} from "lucide-react";
import { NewAuditButton, AuditDeleteButton } from "./audit-actions";

type Profile = {
  id: string;
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};
type Entry = {
  id: string;
  profile_id: string;
  entry_type: "praise" | "note" | "warning" | "disciplinary" | "training" | "review" | "other";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  related_at: string | null;
  created_at: string;
  created_by: string | null;
  profile: Profile | Profile[] | null;
};

const TYPE_CFG: Record<Entry["entry_type"], { label: string; cls: string; Icon: typeof Star }> = {
  praise:       { label: "ชมเชย",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Star },
  note:         { label: "บันทึก",      cls: "bg-blue-50 text-blue-700 border-blue-200",         Icon: FileText },
  warning:      { label: "ตักเตือน",    cls: "bg-amber-50 text-amber-700 border-amber-200",      Icon: AlertTriangle },
  disciplinary: { label: "โทษทางวินัย", cls: "bg-red-50 text-red-700 border-red-200",            Icon: ShieldX },
  training:     { label: "อบรม",        cls: "bg-cyan-50 text-cyan-700 border-cyan-200",         Icon: GraduationCap },
  review:       { label: "ประเมิน",     cls: "bg-purple-50 text-purple-700 border-purple-200",   Icon: TrendingUp },
  other:        { label: "อื่นๆ",       cls: "bg-gray-50 text-gray-700 border-gray-200",         Icon: MoreHorizontal },
};
const SEV_CLS: Record<Entry["severity"], string> = {
  info:     "bg-gray-50 text-gray-700 border-gray-200",
  low:      "bg-blue-50 text-blue-700 border-blue-200",
  medium:   "bg-amber-50 text-amber-700 border-amber-200",
  high:     "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};
const SEV_LABEL: Record<Entry["severity"], string> = {
  info: "Info", low: "น้อย", medium: "ปานกลาง", high: "สูง", critical: "วิกฤต",
};

export default async function AdminHRAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; profile_id?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [entriesRes, adminsRes] = await Promise.all([
    admin.from("employee_audit_entries")
      .select(`id, profile_id, entry_type, severity, title, description, related_at, created_at, created_by,
               profile:profiles!profile_id ( id, member_code, first_name, last_name, avatar_url )`)
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("admins")
      .select(`profile_id, profile:profiles!profile_id ( id, member_code, first_name, last_name )`)
      .eq("is_active", true),
  ]);

  const rows = ((entriesRes.data ?? []) as Entry[]).map((e) => ({
    ...e, profile_one: Array.isArray(e.profile) ? e.profile[0] ?? null : e.profile,
  }));

  type AdminRow = { profile_id: string; profile: Profile | Profile[] | null };
  const allEmployees = ((adminsRes.data ?? []) as AdminRow[]).map((a) => {
    const p = Array.isArray(a.profile) ? a.profile[0] ?? null : a.profile;
    const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
    return { id: a.profile_id, label: `${p?.member_code ?? "—"} · ${full}` };
  }).sort((a, b) => a.label.localeCompare(b.label, "th"));

  // Apply filters
  const q = sp.q?.trim().toLowerCase();
  let visible = rows;
  if (sp.type)       visible = visible.filter((r) => r.entry_type === sp.type);
  if (sp.profile_id) visible = visible.filter((r) => r.profile_id === sp.profile_id);
  if (q) visible = visible.filter((r) =>
    [r.title, r.description, r.profile_one?.first_name, r.profile_one?.last_name, r.profile_one?.member_code]
      .some((v) => (v ?? "").toLowerCase().includes(q)),
  );

  // Totals
  const totals = {
    all:        rows.length,
    praise:     rows.filter((r) => r.entry_type === "praise").length,
    warning:    rows.filter((r) => r.entry_type === "warning").length,
    disciplinary: rows.filter((r) => r.entry_type === "disciplinary").length,
    review:     rows.filter((r) => r.entry_type === "review").length,
  };

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">ออดิทพนักงาน</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest opacity-80">HR · EMPLOYEE AUDIT</p>
              <h1 className="text-xl sm:text-2xl font-bold">ออดิทพนักงาน</h1>
              <p className="text-xs opacity-80 mt-0.5">
                ทั้งหมด {totals.all} บันทึก · ชมเชย {totals.praise} · ตักเตือน {totals.warning} · วินัย {totals.disciplinary} · ประเมิน {totals.review}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NewAuditButton employees={allEmployees} preselect={sp.profile_id} />
            <Link
              href="/admin/hr"
              className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
            >
              ← HR
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <form action="/admin/hr/audit" method="get" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="ค้นหา ชื่อพนักงาน / รหัส / หัวข้อ / รายละเอียด"
            className="w-full rounded-lg border border-border bg-surface-alt/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40"
          />
        </label>
        <select name="type" defaultValue={sp.type ?? ""} className="rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm">
          <option value="">ทุกประเภท</option>
          {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="profile_id" defaultValue={sp.profile_id ?? ""} className="rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm min-w-[200px]">
          <option value="">ทุกพนักงาน</option>
          {allEmployees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm font-medium hover:bg-primary-600">
          ค้นหา
        </button>
      </form>

      {/* Entries */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-30" />
          {rows.length === 0 ? "ยังไม่มีบันทึกออดิทพนักงาน" : "ไม่พบบันทึกในเงื่อนไขที่เลือก"}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((e) => {
            const t = TYPE_CFG[e.entry_type];
            const p = e.profile_one;
            const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
            return (
              <article key={e.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-start gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${t.cls}`}>
                  <t.Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${t.cls}`}>{t.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SEV_CLS[e.severity]}`}>
                      {SEV_LABEL[e.severity]}
                    </span>
                  </div>
                  <h3 className="font-bold text-foreground">{e.title}</h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <Link href={`/admin/admins/${e.profile_id}`} className="inline-flex items-center gap-1.5 text-primary-600 hover:underline">
                      <Avatar src={p?.avatar_url ?? null} name={full} />
                      <span className="font-mono">{p?.member_code ?? "—"}</span>
                      <span>·</span>
                      <span>{full}</span>
                    </Link>
                    {e.related_at && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        เกิดเหตุ {new Date(e.related_at).toLocaleDateString("th-TH")}
                      </span>
                    )}
                    <span className="text-[10px]">บันทึกเมื่อ {new Date(e.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>

                  {e.description && (
                    <p className="text-xs text-foreground bg-surface-alt/40 border border-border rounded-md px-2 py-1.5 whitespace-pre-wrap">
                      {e.description}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <AuditDeleteButton id={e.id} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        บันทึกออดิทเป็นไฟล์ประวัติของพนักงาน — ใช้ประกอบการประเมินผลงาน, ขึ้นเงินเดือน, และกรณีพิจารณาทางวินัย
      </div>
    </main>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="h-5 w-5 rounded-full object-cover ring-1 ring-border shrink-0" />
    );
  }
  return (
    <div className="h-5 w-5 rounded-full bg-surface-alt ring-1 ring-border flex items-center justify-center text-[9px] font-bold text-muted shrink-0">
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}
