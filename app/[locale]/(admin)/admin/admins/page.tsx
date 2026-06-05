/**
 * /admin/admins — รายชื่อพนักงานทั้งหมด (Wave 22 Phase 2 rewrite)
 *
 * Per Wave 22 Phase 1 (`docs/research/tb-admin-merge-intel-2026-05-27.md`):
 * the legacy `tb_admin` (camelCase columns "ID"/"adminID"/"adminStatusA")
 * is **DEPRECATED** for the admin directory. Pacred reads the NEW shape:
 *
 *   admins  JOIN  profiles  JOIN  admin_contact_extras
 *
 * Why the swap (Task #141):
 *   - Prod `tb_admin` has camelCase columns; Pacred code queried lowercase →
 *     "column tb_admin.adminregistered does not exist" → 500
 *   - ภูม chose (Q4 this session) NOT to auto-migrate the 13 legacy admins;
 *     each is manually recreated through `/admin/admins/new` (Phase 3 ·
 *     Agent J). Until then this page shows the 4 native Pacred super-admins.
 *
 * Per AGENTS §0a — copy WORKFLOW (filters · status pills · row actions ·
 * column set), apply OUR Tailwind design (unchanged from the prior rewrite
 * since that visual layer was already Pacred-native).
 *
 * Behaviour vs. legacy:
 *   - Status tabs (ทั้งหมด · ยังทำงานอยู่ · ลาออก) — now read `admins.is_active`
 *   - Company filter (`?c=1|2|3`) — maps to `admin_contact_extras.company`
 *     enum (1→pacred-cargo · 2→pacred-freight · 3→pacred)
 *   - Type filter (`?type=…`) — maps to `admin_contact_extras.employee_type`
 *     enum (1→full_time · 2→probation · 3and4→intern · 5→partner · 6→contract
 *     · 7→partner [family]). Imperfect: legacy had 7 codes, our enum has 6 →
 *     code 7 collapses into 'partner' (closest match). ภูม can refine later.
 *   - Position filter (`?position=…`) — maps to `admin_contact_extras.section`
 *     by FREE-TEXT match (legacy used numbered sections; our column is text).
 *     Best-effort string match. Bookmarks to numeric values won't resolve.
 *   - Permission gate (`canMutate` = `super` role) — gates "เพิ่มใหม่" CTA +
 *     edit/delete row actions
 *   - Row → /admin/admins/<profile_id> (uuid) — Agent J builds the detail
 *     page; until then this link 404s gracefully
 *   - Empty state: clear "ยังไม่มีพนักงาน" + CTA (critical because the 13
 *     legacy admins are gone from this list until ภูม recreates them)
 *
 * SQL — §0c discipline: every supabase call destructures `error`; throws on
 * the main table query (per Wave 18 case study `/admin/customers/PR10899`
 * silent-404 bug).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ============================================================================
// Inline helpers — label maps from legacy `function.php`. Citations kept for
// the §0a "workflow source of truth" trail.
// ============================================================================

const BADGE_CLS: Record<string, string> = {
  danger:    "bg-red-100 text-red-700 border-red-200",
  warning:   "bg-amber-100 text-amber-700 border-amber-200",
  success:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  info:      "bg-sky-100 text-sky-700 border-sky-200",
  primary:   "bg-primary-100 text-primary-700 border-primary-200",
  secondary: "bg-slate-100 text-slate-700 border-slate-200",
};

/** Pacred `admin_contact_extras.company` enum → display label */
function nameCompany(c: string | null | undefined): { label: string; color: string } | null {
  switch (c) {
    case "pacred-cargo":   return { label: "Pacred Cargo",   color: "danger" };
    case "pacred-freight": return { label: "Pacred Freight", color: "success" };
    case "pacred":         return { label: "Pacred",         color: "warning" };
    default:               return null;
  }
}

/** Pacred `admin_contact_extras.employee_type` enum → display label */
function nameEmployeeType(t: string | null | undefined): { label: string; color: string } | null {
  switch (t) {
    case "full_time": return { label: "พนักงานประจำ", color: "danger" };
    case "probation": return { label: "ทดลองงาน",     color: "warning" };
    case "intern":    return { label: "เด็กฝึกงาน/สหกิจ", color: "info" };
    case "partner":   return { label: "พาสเนอร์",      color: "primary" };
    case "contract":  return { label: "สัญญาจ้าง",     color: "secondary" };
    case "daily":     return { label: "รายวัน",        color: "secondary" };
    default:          return null;
  }
}

/** Pacred admin `role` (RBAC) → display label + color */
function nameRole(role: string): { label: string; color: string } {
  switch (role) {
    case "super":            return { label: "Super Admin",       color: "danger" };
    case "ops":              return { label: "Ops",               color: "primary" };
    case "accounting":       return { label: "Accounting",        color: "success" };
    case "sales_admin":      return { label: "Sales Mgr (Cargo)", color: "info" };
    case "sales":            return { label: "Sales (Cargo)",     color: "info" };
    case "qa":               return { label: "QA / QC",           color: "warning" };
    case "warehouse":        return { label: "Warehouse",         color: "warning" };
    case "driver":           return { label: "Driver",            color: "warning" };
    case "interpreter":      return { label: "ล่ามจีน",            color: "secondary" };
    default:
      // Freight roles (#16-28) — keep raw name for now
      return { label: role.replace(/_/g, " "), color: "secondary" };
  }
}

/** Legacy `diffDateNow($datetime)` — function.php L1426-1450 (still useful for probation countdown) */
function diffDateNow(iso: string | null | undefined): string {
  if (!iso) return "";
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "";
  const now = new Date();
  let y = target.getFullYear() - now.getFullYear();
  let m = target.getMonth() - now.getMonth();
  let d = target.getDate() - now.getDate();
  if (d < 0) {
    const daysInPrev = new Date(target.getFullYear(), target.getMonth(), 0).getDate();
    d += daysInPrev; m -= 1;
  }
  if (m < 0) { m += 12; y -= 1; }
  y = Math.abs(y); m = Math.abs(m); d = Math.abs(d);
  if (y === 0 && m === 0) return `${d} วัน`;
  if (y === 0)            return `${m} เดือน ${d} วัน`;
  return `${y} ปี ${m} เดือน ${d} วัน`;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
        BADGE_CLS[color] ?? BADGE_CLS.secondary
      }`}
    >
      {label}
    </span>
  );
}

// ============================================================================
// Filter param → enum value mapping
// ============================================================================

/** Map legacy `?type=…` URL param → Pacred employee_type enum value(s). */
function typeParamToEmployeeTypes(t: string | undefined): string[] | null {
  switch (t) {
    case "1":     return ["full_time"];
    case "2":     return ["probation"];
    case "3and4": return ["intern"]; // legacy split intern (3) + cooperative (4); our enum collapses
    case "3":     return ["intern"];
    case "4":     return ["intern"];
    case "5":     return ["partner"];
    case "6":     return ["contract"];
    case "7":     return ["partner"]; // legacy "คนในบ้าน" → closest available enum
    default:      return null;
  }
}

/** Map legacy `?c=…` URL param → Pacred company enum value. */
function companyParamToEnum(c: string | undefined): string | null {
  switch (c) {
    case "1": return "pacred-cargo";
    case "2": return "pacred-freight";
    case "3": return "pacred";
    default:  return null;
  }
}

// ============================================================================
// SQL — admin client, RLS-locked to service_role.
// ============================================================================

type AdminRow = {
  profile_id: string;
  role: string;
  is_active: boolean;
  granted_at: string | null;
  granted_by: string | null;
  profile: {
    id: string;
    member_code: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    birthday: string | null;
    sex: string | null;
    employee_code: string | null;
    last_login_at: string | null;
    is_active: boolean | null;
    migrated_from_pcs: boolean | null;
    legacy_pcs_user_id: string | null;
  } | null;
  extras: {
    nickname: string | null;
    display_name: string | null;
    direct_phone: string | null;
    company: string | null;
    employee_type: string | null;
    department: string | null;
    section: string | null;
    work_email: string | null;
    work_phone: string | null;
    hired_at: string | null;
    suspended_at: string | null;
    contract_end_date: string | null;
    legacy_admin_id: string | null;
    ended_at: string | null;
    legacy_admin_type: string | null;
    legacy_admin_status: string | null;
    admin_note: string | null;
  } | null;
};

type SP = { s?: string; c?: string; type?: string; position?: string; sort?: string; dir?: string };

// Lane C 2026-06-02 — server-side sort whitelist (ภูม flag #3).
// Only columns on the `admins` table can be ordered by Supabase here
// because Query 1 reads admins first; profile/extras-driven sorts are
// applied as a post-JS sort below.
const ADMINS_SORT_KEYS = new Set([
  "granted_at",
  "role",
  "is_active",
  "name",      // post-JS: profile.first_name + last_name
  "company",   // post-JS: extras.company
  "type",      // post-JS: extras.employee_type
]);

export default async function AdminTablePage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const { roles } = await requireAdmin();
  const canMutate = roles.includes("super");

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── 3 separate queries + JS merge ──────────────────────────────
  // Why not PostgREST JOIN embed: `admins` and `admin_contact_extras` both
  // FK to `profiles(id)` but NOT to each other. PostgREST embed syntax
  // (`extras:admin_contact_extras!profile_id`) requires a direct FK between
  // the two tables — fails with PGRST200 "Could not find a relationship
  // between 'admins' and 'admin_contact_extras' in the schema cache" no
  // matter the schema-cache state. Dataset is tiny (~15 admin rows after
  // ภูม recreates), so 3 small queries + JS merge is the clean shape.

  // Query 1 — admin role grants (with is_active filter applied here)
  let adminQ = admin.from("admins").select("profile_id, role, is_active, granted_at, granted_by");
  switch (sp.s) {
    case "1":   adminQ = adminQ.eq("is_active", true);  break;
    case "2":   adminQ = adminQ.eq("is_active", false); break;
    case "all": /* no action */ break;
    default:    /* not set — render all (matches legacy "no `s` → unfiltered") */ break;
  }
  // Lane C 2026-06-02 — resolve sort/dir from URL. Only granted_at/role/is_active
  // can be ordered server-side (admins-table columns); the rest are sorted in JS.
  const sortKeyRaw = sp.sort && ADMINS_SORT_KEYS.has(sp.sort) ? sp.sort : "granted_at";
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const dbSortable: Record<string, string> = {
    granted_at: "granted_at",
    role:       "role",
    is_active:  "is_active",
  };
  if (dbSortable[sortKeyRaw]) {
    adminQ = adminQ.order(dbSortable[sortKeyRaw], { ascending: sortDir === "asc", nullsFirst: false });
  } else {
    // post-JS sort columns still need a stable secondary order from DB
    adminQ = adminQ.order("granted_at", { ascending: false, nullsFirst: false });
  }

  // ── Status overview counts (admins table only — fast) ──────────
  const buildCountQ = (statusVal: "active" | "inactive" | "all") => {
    let cq = admin.from("admins").select("profile_id", { count: "exact", head: true });
    if (statusVal === "active")   cq = cq.eq("is_active", true);
    if (statusVal === "inactive") cq = cq.eq("is_active", false);
    return cq;
  };

  const [adminRes, sAllRes, s1Res, s2Res] = await Promise.all([
    adminQ,
    buildCountQ("all"),
    buildCountQ("active"),
    buildCountQ("inactive"),
  ]);

  // §0c — surface real errors instead of swallowing into empty list.
  if (adminRes.error) {
    console.error("[admins list] admins query failed", {
      code:    adminRes.error.code,
      message: adminRes.error.message,
      details: adminRes.error.details,
      hint:    adminRes.error.hint,
    });
    throw new Error(
      `admins: failed to load admins — ${adminRes.error.code ?? "unknown"}: ${adminRes.error.message}`,
    );
  }
  if (sAllRes.error) console.error("[admins list] count(all) failed", sAllRes.error);
  if (s1Res.error)   console.error("[admins list] count(active) failed", s1Res.error);
  if (s2Res.error)   console.error("[admins list] count(inactive) failed", s2Res.error);

  const adminGrants = adminRes.data ?? [];
  const profileIds = [...new Set(adminGrants.map((r) => r.profile_id))];

  // Compute extras filter inputs ahead of the second-round queries so they're
  // available for the JS post-filter pass below too.
  const companyEnum = companyParamToEnum(sp.c);
  const typeEnums = typeParamToEmployeeTypes(sp.type);

  // Query 2 + 3 — profiles + extras (parallel) for the matched profile_ids
  const [profilesRes, extrasRes] = profileIds.length === 0
    ? [{ data: [], error: null }, { data: [], error: null }] as const
    : await Promise.all([
        admin.from("profiles")
          .select(
            "id, member_code, first_name, last_name, email, phone, avatar_url, " +
            "birthday, sex, employee_code, last_login_at, is_active, migrated_from_pcs, legacy_pcs_user_id",
          )
          .in("id", profileIds),
        admin.from("admin_contact_extras")
          .select(
            "profile_id, nickname, display_name, direct_phone, company, employee_type, " +
            "department, section, work_email, work_phone, hired_at, suspended_at, " +
            "contract_end_date, legacy_admin_id, ended_at, legacy_admin_type, " +
            "legacy_admin_status, admin_note",
          )
          .in("profile_id", profileIds),
      ]);

  if (profilesRes.error) {
    console.error("[admins list] profiles fetch failed", profilesRes.error);
    throw new Error(`admins: failed to load profiles — ${profilesRes.error.message}`);
  }
  if (extrasRes.error) {
    console.error("[admins list] admin_contact_extras fetch failed", extrasRes.error);
    throw new Error(`admins: failed to load admin_contact_extras — ${extrasRes.error.message}`);
  }

  // Build lookup maps (O(1) per merge) + merge into AdminRow shape.
  // Cast via `unknown` first — Supabase's typed-helper response widens to
  // include the error-state variant which can't be narrowed inline.
  const profilesArr = (profilesRes.data ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;
  const extrasArr = (extrasRes.data ?? []) as unknown as Array<{ profile_id: string } & Record<string, unknown>>;
  const profilesMap = new Map(profilesArr.map((p) => [p.id, p]));
  const extrasMap = new Map(extrasArr.map((e) => [e.profile_id, e]));

  let rawRows: AdminRow[] = adminGrants.map((g) => ({
    profile_id: g.profile_id,
    role:       g.role,
    is_active:  g.is_active,
    granted_at: g.granted_at,
    granted_by: g.granted_by,
    profile:    (profilesMap.get(g.profile_id) ?? null) as AdminRow["profile"],
    extras:     (extrasMap.get(g.profile_id) ?? null) as AdminRow["extras"],
  }));

  // Apply extras-dependent filters in JS (previously PostgREST .eq on the
  // joined relation column — now post-filter since we fetched separately).
  if (companyEnum) {
    rawRows = rawRows.filter((r) => r.extras?.company === companyEnum);
  }
  if (typeEnums && typeEnums.length > 0) {
    rawRows = rawRows.filter(
      (r) => r.extras?.employee_type != null && typeEnums.includes(r.extras.employee_type),
    );
  }
  if (sp.position) {
    const needle = sp.position.toLowerCase();
    rawRows = rawRows.filter((r) => r.extras?.section?.toLowerCase().includes(needle) ?? false);
  }

  // Drop rows with no profile (FK should prevent · defensive).
  const rows: AdminRow[] = rawRows.filter((r) => r.profile !== null);

  // Lane C 2026-06-02 — post-JS sort for columns derived from profiles / extras.
  if (sortKeyRaw === "name" || sortKeyRaw === "company" || sortKeyRaw === "type") {
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av = "", bv = "";
      if (sortKeyRaw === "name") {
        av = `${a.profile?.first_name ?? ""} ${a.profile?.last_name ?? ""}`.toLowerCase().trim();
        bv = `${b.profile?.first_name ?? ""} ${b.profile?.last_name ?? ""}`.toLowerCase().trim();
      } else if (sortKeyRaw === "company") {
        av = (a.extras?.company ?? "").toLowerCase();
        bv = (b.extras?.company ?? "").toLowerCase();
      } else if (sortKeyRaw === "type") {
        av = (a.extras?.employee_type ?? "").toLowerCase();
        bv = (b.extras?.employee_type ?? "").toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  // Lane C 2026-06-02 — pre-compute sort hrefs (preserve all current filters).
  const sortHrefs: Record<string, string> = {};
  for (const k of ADMINS_SORT_KEYS) {
    const nextDir = sortKeyRaw === k && sortDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    if (sp.s)        params.set("s", sp.s);
    if (sp.c)        params.set("c", sp.c);
    if (sp.type)     params.set("type", sp.type);
    if (sp.position) params.set("position", sp.position);
    params.set("sort", k);
    params.set("dir", nextDir);
    sortHrefs[k] = `/admin/admins?${params.toString()}`;
  }

  const sAll = sAllRes.count ?? 0;
  const s1   = s1Res.count   ?? 0;
  const s2   = s2Res.count   ?? 0;

  // Active tab — defaults to "1" (ยังทำงานอยู่) to match legacy default view.
  const activeTab = sp.s === "all" ? "all" : sp.s === "2" ? "2" : "1";

  const buildStatusUrl = (s: "all" | "1" | "2") => {
    const params = new URLSearchParams();
    params.set("s", s);
    if (sp.c)        params.set("c", sp.c);
    if (sp.type)     params.set("type", sp.type);
    if (sp.position) params.set("position", sp.position);
    return `/admin/admins?${params.toString()}`;
  };

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">รายชื่อพนักงานทั้งหมด</h1>
          <p className="text-sm text-muted mt-0.5">
            {rows.length.toLocaleString("th-TH")} รายการ (จาก {sAll.toLocaleString("th-TH")} ทั้งหมด)
          </p>
        </div>
        {canMutate && (
          <Link
            href="/admin/admins/new"
            className="rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
          >
            + เพิ่มพนักงานใหม่
          </Link>
        )}
      </div>

      {/* Wave 22 status banner — proactive transparency per AGENTS §0a. */}
      <div className="rounded-md border border-sky-200 bg-sky-50/60 p-2.5 text-xs text-sky-800 flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <div className="flex-1">
          <span className="font-medium">Wave 22 status:</span>{" "}
          ✅ List reads new shape (`admins` JOIN `profiles` JOIN `admin_contact_extras`) ·
          ✅ Status/company/type/position filters wired ·{" "}
          <span className="opacity-75">
            ⏳ Phase 3 (Agent J): `/admin/admins/new` form + `/admin/admins/[id]` UUID-keyed detail page ·
            ภูม recreates 13 legacy admins through the new form
          </span>
        </div>
      </div>

      {/* Status overview tabs — ทั้งหมด · ยังทำงานอยู่ · ลาออก */}
      <div className="flex flex-wrap gap-0 border-b border-border -mx-1">
        {([
          { v: "all", l: "ทั้งหมด",                   n: sAll },
          { v: "1",   l: "ยังทำงานอยู่",                n: s1 },
          { v: "2",   l: "ลาออกแล้ว/หมดเวลาทำงาน",  n: s2 },
        ] as const).map((t) => {
          const active = activeTab === t.v;
          return (
            <Link
              key={t.v}
              href={buildStatusUrl(t.v)}
              className={`mx-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary-600 text-primary-700 bg-primary-50/50"
                  : "border-transparent text-muted hover:text-foreground hover:bg-surface-alt"
              }`}
            >
              {t.l}
              {t.n > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[10px]">
                  {t.n.toLocaleString("th-TH")}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Active filter chips */}
      {(sp.c || sp.type || sp.position) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted font-medium">กำลังกรอง:</span>
          {sp.c && (
            <span className="rounded-full border border-border bg-surface-alt px-2.5 py-1">
              บริษัท: {nameCompany(companyEnum)?.label ?? sp.c}
            </span>
          )}
          {sp.type && (
            <span className="rounded-full border border-border bg-surface-alt px-2.5 py-1">
              ประเภท: {sp.type === "3and4" ? "ฝึกงาน/สหกิจ" : (typeEnums && nameEmployeeType(typeEnums[0])?.label) ?? sp.type}
            </span>
          )}
          {sp.position && (
            <span className="rounded-full border border-border bg-surface-alt px-2.5 py-1">
              ตำแหน่ง: {sp.position}
            </span>
          )}
          <Link
            href={`/admin/admins${activeTab === "1" ? "" : `?s=${activeTab}`}`}
            className="rounded-full border border-border bg-white px-2.5 py-1 hover:bg-surface-alt"
          >
            ล้างฟิลเตอร์ ×
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState canMutate={canMutate} hasFilters={!!(sp.c || sp.type || sp.position || sp.s)} />
      ) : (
        /* Table — wide column set → scrollbar-x-visible (per AGENTS §0c bug-2
            fix · Windows Chrome hides scrollbars by default). */
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/60">
                <tr className="text-left">
                  <SortTh label="วันที่เพิ่ม"    field="granted_at" activeKey={sortKeyRaw} activeDir={sortDir} hrefs={sortHrefs} />
                  <Th>รหัส</Th>
                  <Th>รหัสพนักงาน</Th>
                  <SortTh label="ชื่อ - นามสกุล" field="name"       activeKey={sortKeyRaw} activeDir={sortDir} hrefs={sortHrefs} />
                  <Th>ชื่อเล่น</Th>
                  <SortTh label="Role"           field="role"       activeKey={sortKeyRaw} activeDir={sortDir} hrefs={sortHrefs} />
                  <SortTh label="บริษัท"         field="company"    activeKey={sortKeyRaw} activeDir={sortDir} hrefs={sortHrefs} />
                  <SortTh label="ประเภท"         field="type"       activeKey={sortKeyRaw} activeDir={sortDir} hrefs={sortHrefs} />
                  <Th>แผนก / ตำแหน่ง</Th>
                  <Th>อีเมลส่วนตัว</Th>
                  <Th>เบอร์ส่วนตัว</Th>
                  <Th>อีเมลบริษัท</Th>
                  <Th>โทรบริษัท</Th>
                  <SortTh label="สถานะ"          field="is_active"  activeKey={sortKeyRaw} activeDir={sortDir} hrefs={sortHrefs} />
                  <Th>ตัวเลือก</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const p = row.profile;
                  const x = row.extras;
                  const fullName = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "(ยังไม่มีชื่อ)";
                  const nickname = x?.nickname ?? x?.display_name ?? null;
                  const avatar   = p?.avatar_url && p.avatar_url.trim() !== "" ? p.avatar_url : "/legacy/pcs/admin/images/user.jpg";
                  const memberCode = p?.member_code ?? "—";
                  const legacyAdminId = x?.legacy_admin_id;
                  // Show the staff username (e.g. "admin_toey") so every admin reads
                  // the same way. Admins created via /admin/admins/new have no
                  // legacy_admin_id yet → derive it from their @pacred.co.th email;
                  // fall back to the PR member-code only as a last resort.
                  const emailUser =
                    p?.email && p.email.endsWith("@pacred.co.th") ? p.email.split("@")[0] : null;
                  const idCodeDisplay = legacyAdminId ?? emailUser ?? memberCode;

                  const roleBadge    = nameRole(row.role);
                  const companyBadge = nameCompany(x?.company);
                  const typeBadge    = nameEmployeeType(x?.employee_type);
                  const isProbation  = x?.employee_type === "probation";
                  const probationRemaining = isProbation ? diffDateNow(x?.contract_end_date) : "";
                  const probationDue = x?.contract_end_date ? x.contract_end_date.slice(0, 10) : "";

                  const isInactive = !row.is_active;
                  const isSuspended = !!x?.suspended_at;
                  const isEnded     = !!x?.ended_at;

                  // Detail link — Agent J builds the uuid-keyed detail page.
                  const detailHref = `/admin/admins/${encodeURIComponent(row.profile_id)}`;

                  // Personal vs work contact (legacy split: profiles cols = personal,
                  // admin_contact_extras = work).
                  const personalEmail = p?.email;
                  const personalPhone = p?.phone ?? x?.direct_phone;
                  const workEmail     = x?.work_email;
                  const workPhone     = x?.work_phone;

                  return (
                    <tr key={`${row.profile_id}-${row.role}`} className="border-t border-border hover:bg-surface-alt/40">
                      <Td>{row.granted_at ? row.granted_at.slice(0, 16).replace("T", " ") : "-"}</Td>
                      <Td mono>
                        <Link href={detailHref} className="text-primary-600 hover:underline">
                          {idCodeDisplay}
                        </Link>
                      </Td>
                      <Td mono>{p?.employee_code ?? "—"}</Td>
                      <Td>
                        <div className="flex items-center gap-2 min-w-[180px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={avatar}
                            alt={fullName}
                            className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                          />
                          <Link href={detailHref} className="text-foreground hover:text-primary-600 hover:underline truncate">
                            {fullName}
                          </Link>
                        </div>
                      </Td>
                      <Td>{nickname ?? "-"}</Td>
                      <Td><Pill {...roleBadge} /></Td>
                      <Td>{companyBadge ? <Pill {...companyBadge} /> : <span className="text-muted">-</span>}</Td>
                      <Td>
                        {typeBadge ? <Pill {...typeBadge} /> : <span className="text-muted">-</span>}
                        {isProbation && probationDue && (
                          <div className="mt-1 text-[10px] text-muted">
                            <div>เหลือ: <span className="text-red-600 font-medium">{probationRemaining}</span></div>
                            <div>ครบ: {probationDue}</div>
                          </div>
                        )}
                      </Td>
                      <Td>
                        {x?.department && <div className="text-foreground">{x.department}</div>}
                        {x?.section    && <div className="text-muted text-[10px]">{x.section}</div>}
                        {!x?.department && !x?.section && <span className="text-muted">-</span>}
                      </Td>
                      <Td>
                        {personalEmail
                          ? <a href={`mailto:${personalEmail}`} className="text-primary-600 hover:underline truncate block max-w-[160px]">{personalEmail}</a>
                          : "-"}
                      </Td>
                      <Td mono>
                        {personalPhone
                          ? <a href={`tel:${personalPhone}`} className="text-primary-600 hover:underline">{personalPhone}</a>
                          : "-"}
                      </Td>
                      <Td>
                        {workEmail
                          ? <a href={`mailto:${workEmail}`} className="text-primary-600 hover:underline truncate block max-w-[160px]">{workEmail}</a>
                          : "-"}
                      </Td>
                      <Td mono>
                        {workPhone
                          ? <a href={`tel:${workPhone}`} className="text-primary-600 hover:underline">{workPhone}</a>
                          : "-"}
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-0.5">
                          {isEnded && (
                            <span className="rounded bg-red-500 text-white px-2 py-0.5 text-[10px] text-center whitespace-nowrap">
                              ลาออกแล้ว
                            </span>
                          )}
                          {!isEnded && isSuspended && (
                            <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] whitespace-nowrap text-center">
                              พักงานชั่วคราว
                            </span>
                          )}
                          {!isEnded && !isSuspended && isInactive && (
                            <span className="rounded bg-slate-500 text-white px-2 py-0.5 text-[10px] text-center whitespace-nowrap">
                              ปิดสิทธิ์
                            </span>
                          )}
                          {!isEnded && !isSuspended && !isInactive && (
                            <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] whitespace-nowrap text-center">
                              ทำงานอยู่
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1">
                          <Link
                            href={detailHref}
                            className="rounded-lg border border-border bg-white px-2 py-1 text-[10px] text-foreground hover:bg-primary-50 hover:border-primary-200"
                            title="ดูข้อมูล"
                          >
                            ดู
                          </Link>
                          {canMutate && (
                            <Link
                              href={`${detailHref}/edit`}
                              className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-700 hover:bg-sky-100"
                              title="แก้ไข"
                            >
                              แก้ไข
                            </Link>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

// ────────────────────────────────────────────────────────────
// Empty state — critical visibility for Wave 22 transition.
// Until ภูม recreates the 13 legacy admins, this list shows
// only the 4 native Pacred super-admins; if a filter excludes
// them, the user lands here.
// ────────────────────────────────────────────────────────────
function EmptyState({ canMutate, hasFilters }: { canMutate: boolean; hasFilters: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-surface-alt/30 px-6 py-16 text-center">
      <div className="mx-auto max-w-md space-y-3">
        <p className="text-4xl" aria-hidden>👥</p>
        <h2 className="text-lg font-bold text-foreground">
          {hasFilters ? "ไม่พบพนักงานตามเงื่อนไข" : "ยังไม่มีพนักงานในระบบ"}
        </h2>
        <p className="text-sm text-muted">
          {hasFilters
            ? "ลองล้างฟิลเตอร์หรือเปลี่ยนช่วงเวลา · หรือกดปุ่ม \"เพิ่มพนักงานใหม่\" ด้านบนเพื่อเพิ่มคนแรก"
            : "เริ่มต้นโดยการเพิ่มพนักงานคนแรก แล้วระบบจะแสดงรายชื่อทั้งหมดที่นี่"}
        </p>
        {canMutate && (
          <div className="pt-2">
            <Link
              href="/admin/admins/new"
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-500 bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
            >
              <span>+</span>
              <span>เพิ่มพนักงานคนแรก</span>
            </Link>
          </div>
        )}
        <p className="text-[10px] text-muted pt-3">
          Wave 22 transition: ภูม กำลังย้ายข้อมูล 13 พนักงานจาก legacy `tb_admin` มาที่ระบบใหม่ ผ่านฟอร์ม `/admin/admins/new`
        </p>
      </div>
    </div>
  );
}

// ── tiny helpers ─────────────────────────────────────────
function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted font-semibold whitespace-nowrap">
      {children}
    </th>
  );
}
/** Lane C 2026-06-02 — sortable column header (Link-based, server-side). */
function SortTh({
  label,
  field,
  activeKey,
  activeDir,
  hrefs,
}: {
  label: string;
  field: string;
  activeKey: string;
  activeDir: "asc" | "desc";
  hrefs: Record<string, string>;
}) {
  const active = activeKey === field;
  const arrow = active ? (activeDir === "asc" ? "↑" : "↓") : "⇵";
  return (
    <th className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap">
      <Link
        href={hrefs[field]}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? "text-primary-700" : "text-muted"
        }`}
      >
        <span>{label}</span>
        <span className="text-[9px]" aria-hidden>{arrow}</span>
      </Link>
    </th>
  );
}
function Td({ children, mono }: { children?: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-3 py-2 align-top ${mono ? "font-mono" : ""}`}>
      {children}
    </td>
  );
}
