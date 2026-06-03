/**
 * /admin/admins/[id] — Pacred admin profile (read-only · Wave 23 P0 rewrite)
 *
 * ── Why this rewrite (Task #150) ────────────────────────────────────
 * Wave 22 swapped the admin list (`/admin/admins`) + edit form (`/admin/
 * admins/[id]/edit`) onto the NEW Pacred shape:
 *
 *     admins  JOIN  profiles  JOIN  admin_contact_extras
 *
 * The list now passes a `profile_id` (UUID) as the row link, NOT the
 * legacy `tb_admin.adminid` string. The Wave 20 P1 read-only detail page
 * (the prior version of this file) was still keyed by `tb_admin.adminid`
 * and queried 13 legacy tables → on prod it 500'd with
 * `column tb_admin.adminid does not exist` because prod uses camelCase
 * (`adminID`) and our lowercase port never resolved.
 *
 * This rewrite mirrors the patterns Agents I + J established:
 *   - 3 parallel queries (admins · profiles · admin_contact_extras),
 *     NOT a PostgREST cross-embed (PGRST200 — no direct FK between
 *     admins and admin_contact_extras; both FK to profiles)
 *   - UUID-keyed lookup against `profiles.id`
 *   - §0c discipline: destructure { data, error } from every supabase
 *     call · throw on hard error · soft-log when optional row missing
 *   - notFound() ONLY when profile genuinely doesn't exist (never as a
 *     fall-through for transient DB errors)
 *
 * ── UI scope (kept faithful to legacy admin-profile.php; design Pacred) ──
 * Per AGENTS §0a — copy WORKFLOW, apply Pacred Tailwind:
 *   - Identity card        — avatar · ชื่อ-นามสกุล · nickname · member_code
 *                            · role badge · status pill
 *   - Identity section     — email · phone · birthday · sex
 *   - HR section           — company · employee_type · department · section
 *                            · hired_at · work_email · work_phone
 *   - Legacy bridge        — legacy_admin_id + recreated_at banner
 *   - Notes/contract       — admin_note · contract_end_date · suspended_at
 *                            · ended_at
 *   - Role grants list     — every (profile_id, role) row from admins,
 *                            historical inactives included
 *   - Action buttons       — "แก้ไข" → /[id]/edit · "Reset password" →
 *                            Supabase Dashboard link · "Audit log" →
 *                            /admin/admin-audit-log?admin_id=…
 *
 * ── What this rewrite deferred (Wave 23 follow-up) ─────────────────
 * The Wave 20 P1 page rendered 5 extra sections that read JOIN tables
 * which DON'T exist on the new Pacred shape (only on the legacy `tb_admin`
 * universe — and ภูม chose NOT to auto-migrate the 13 legacy admins):
 *   - Personal docs (national ID + file links)            — Wave 23
 *   - Bank accounts table (tb_account_pcs)                — Wave 23
 *   - Education history table (tb_education_background)   — Wave 23
 *   - Organisation channel labels (email/tel/line/wechat) — Wave 23
 *   - Interpreter commission cog (tb_set_comm_interpreter) — Wave 23
 *
 * These are NOT removed — they were never wired into the new shape
 * (the Pacred-native 4 super-admins don't have them; the 13 legacy ones
 * will be recreated through /admin/admins/new without them). When a
 * future migration ports those join tables into a Pacred-shape sidecar,
 * re-add the sections here.
 *
 * The `admin-profile-client.tsx` (jQuery+BS4 → native dialog) bundle is
 * also NOT imported — its server actions still target legacy `tb_admin`
 * and would 500 the same way. The action buttons here point to the
 * Pacred-native `/edit` subroute instead.
 *
 * ── References ─────────────────────────────────────────────────────
 * - List/source pattern:    app/[locale]/(admin)/admin/admins/page.tsx
 * - Edit/source pattern:    app/[locale]/(admin)/admin/admins/[id]/edit/page.tsx
 * - PGRST200 lesson:        docs/learnings/supabase-rls-patterns.md
 * - §0c verify-deep-flow:   AGENTS.md §0c
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ============================================================================
// Inline helpers (label lookups · date formatting)
// ============================================================================

const BADGE_CLS: Record<string, string> = {
  danger:    "bg-red-100 text-red-700 border-red-200",
  warning:   "bg-amber-100 text-amber-700 border-amber-200",
  success:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  info:      "bg-sky-100 text-sky-700 border-sky-200",
  primary:   "bg-primary-100 text-primary-700 border-primary-200",
  secondary: "bg-slate-100 text-slate-700 border-slate-200",
};

/** Legacy `DateThai2($strDate)` — function.php L137-144 */
function DateThai2(strDate: string | null | undefined): string {
  if (!strDate) return "-";
  const d = new Date(strDate);
  if (Number.isNaN(d.getTime())) return "-";
  const months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d.getDate()} ${months[d.getMonth() + 1]} ${d.getFullYear()}`;
}

/** Legacy `diffDateNow($datetime)` — function.php L1426-1450 */
function diffDateNow(iso: string | null | undefined): string {
  if (!iso) return "-";
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "-";
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

/** Pacred `profiles.sex` enum → display label */
function nameSex(sex: string | null | undefined): string {
  switch (sex) {
    case "male":   return "ชาย";
    case "female": return "หญิง";
    case "other":  return "อื่นๆ / ไม่ระบุ";
    default:       return "ไม่ระบุ";
  }
}

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
    case "full_time": return { label: "พนักงานประจำ",       color: "danger" };
    case "probation": return { label: "ทดลองงาน",            color: "warning" };
    case "intern":    return { label: "เด็กฝึกงาน/สหกิจ",   color: "info" };
    case "partner":   return { label: "พาสเนอร์",            color: "primary" };
    case "contract":  return { label: "สัญญาจ้าง",           color: "secondary" };
    case "daily":     return { label: "รายวัน",              color: "secondary" };
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
      return { label: role.replace(/_/g, " "), color: "secondary" };
  }
}

// ============================================================================
// Page
// ============================================================================

export default async function AdminProfilePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const profileId = decodeURIComponent(idParam);

  // Auth — any signed-in admin can view. `super` gates the mutate buttons.
  const { roles, user } = await requireAdmin();
  const canMutate = roles.includes("super");

  // Defensive — the page is keyed by profile UUID (set by Wave 22 list).
  // If the caller landed here with a non-UUID string (legacy bookmark to
  // the old tb_admin.adminid path), 404 cleanly so the link is visibly
  // broken instead of silently mis-querying.
  if (!/^[0-9a-f-]{32,36}$/i.test(profileId)) {
    notFound();
  }

  const admin = createAdminClient();

  // ── 3 parallel queries (admins · profiles · admin_contact_extras) ──
  // Why not a PostgREST embed: `admins` and `admin_contact_extras` both
  // FK to `profiles(id)` but NOT to each other → cross-embed fails
  // PGRST200 (docs/learnings/supabase-rls-patterns.md 2026-05-27 entry).
  // The 3-query merge is the proven pattern from Agent I's list + Agent
  // J's loadAdminForEdit.
  const [profileRes, rolesRes, extrasRes] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, member_code, first_name, last_name, email, phone, avatar_url, " +
        "birthday, sex, last_login_at, is_active, created_at, " +
        "migrated_from_pcs, legacy_pcs_user_id",
      )
      .eq("id", profileId)
      .maybeSingle<{
        id: string;
        member_code: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        avatar_url: string | null;
        birthday: string | null;
        sex: string | null;
        last_login_at: string | null;
        is_active: boolean | null;
        created_at: string | null;
        migrated_from_pcs: boolean | null;
        legacy_pcs_user_id: string | null;
      }>(),
    admin
      .from("admins")
      .select("role, is_active, granted_at, granted_by")
      .eq("profile_id", profileId)
      .order("is_active", { ascending: false })
      .order("granted_at", { ascending: false, nullsFirst: false }),
    admin
      .from("admin_contact_extras")
      .select(
        "nickname, display_name, direct_phone, company, employee_type, " +
        "department, section, work_email, work_phone, hired_at, suspended_at, " +
        "contract_end_date, legacy_admin_id, ended_at, legacy_admin_type, " +
        "legacy_admin_status, admin_note, updated_at",
      )
      .eq("profile_id", profileId)
      .maybeSingle<{
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
        updated_at: string | null;
      }>(),
  ]);

  // §0c — hard errors throw (Next renders error boundary, never silent 404).
  if (profileRes.error) {
    console.error("[admins/[id]] profiles query failed", {
      profileId,
      code:    profileRes.error.code,
      message: profileRes.error.message,
      details: profileRes.error.details,
      hint:    profileRes.error.hint,
    });
    throw new Error(
      `admins/[id]: profiles load failed — ${profileRes.error.code ?? "unknown"}: ${profileRes.error.message}`,
    );
  }
  if (rolesRes.error) {
    console.error("[admins/[id]] admins query failed", {
      profileId,
      code:    rolesRes.error.code,
      message: rolesRes.error.message,
    });
    throw new Error(
      `admins/[id]: role grants load failed — ${rolesRes.error.code ?? "unknown"}: ${rolesRes.error.message}`,
    );
  }
  // extras is OPTIONAL — 4 native super-admins have no admin_contact_extras
  // row (created before HR sidecar existed). Soft-log + continue with null.
  if (extrasRes.error) {
    console.error("[admins/[id]] admin_contact_extras query failed (soft)", {
      profileId,
      code:    extrasRes.error.code,
      message: extrasRes.error.message,
    });
  }

  if (!profileRes.data) notFound();
  const p = profileRes.data;
  const x = extrasRes.data;
  const grantRows = (rolesRes.data ?? []) as Array<{
    role: string; is_active: boolean; granted_at: string | null; granted_by: string | null;
  }>;
  const activeGrants = grantRows.filter((g) => g.is_active);

  // If a profile has zero role grants at all (admins row never inserted),
  // it isn't a Pacred admin → notFound. Mirrors the list which only shows
  // profiles WITH at least one admins row.
  if (grantRows.length === 0) notFound();

  // ── Resolve granted_by uuids → names (single round-trip) ─────────
  // The history table on prod is small (a handful of grants per admin),
  // so one IN-query is plenty. Soft-failure shows the raw uuid suffix.
  const granterIds = [...new Set(grantRows.map((g) => g.granted_by).filter((v): v is string => v != null))];
  const grantersMap = new Map<string, { name: string; member_code: string | null }>();
  if (granterIds.length > 0) {
    const { data: granters, error: grantersErr } = await admin
      .from("profiles")
      .select("id, first_name, last_name, member_code")
      .in("id", granterIds);
    if (grantersErr) {
      console.error("[admins/[id]] granters lookup failed (soft)", {
        code: grantersErr.code, message: grantersErr.message,
      });
    }
    for (const row of (granters ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; member_code: string | null }>) {
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      grantersMap.set(row.id, {
        name:        fullName || "(ไม่มีชื่อ)",
        member_code: row.member_code,
      });
    }
  }

  // ── Derived display values ──────────────────────────────────────
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "(ยังไม่มีชื่อ)";
  const nickname = x?.nickname ?? x?.display_name ?? null;
  const avatar   = p.avatar_url && p.avatar_url.trim() !== ""
    ? p.avatar_url
    : "/legacy/pcs/admin/images/user.jpg";

  const companyBadge = nameCompany(x?.company);
  const typeBadge    = nameEmployeeType(x?.employee_type);

  // Status precedence (matches list page): ended > suspended > !is_active > active
  const isEnded     = !!x?.ended_at;
  const isSuspended = !!x?.suspended_at;
  const hasActiveGrant = activeGrants.length > 0;

  // Self-edit signal — true if the signed-in admin IS this admin.
  const isSelf = user.id === p.id;

  // Probation countdown (kept consistent with the list page UX).
  const isProbation = x?.employee_type === "probation";
  const probationRemaining = isProbation ? diffDateNow(x?.contract_end_date) : "";

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb + back link */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <nav className="flex items-center gap-1.5 text-muted">
          <Link href="/admin" className="hover:text-primary-600 hover:underline">หน้าแรก</Link>
          <span>›</span>
          <Link href="/admin/admins" className="hover:text-primary-600 hover:underline">รายชื่อพนักงาน</Link>
          <span>›</span>
          <span className="text-foreground">{fullName}</span>
        </nav>
        <Link href="/admin/admins" className="text-xs text-primary-600 hover:underline">
          ← รายชื่อพนักงาน
        </Link>
      </div>

      {/* Identity header card */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 flex items-start gap-5 flex-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar}
          alt={fullName}
          className="w-24 h-24 rounded-full object-cover border-2 border-border shrink-0"
        />
        <div className="flex-1 min-w-[240px]">
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · พนักงาน</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold">{fullName}</h1>
            {nickname && (
              <span className="text-sm text-muted">({nickname})</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
            <span className="font-mono font-medium">{p.member_code ?? "(no member_code)"}</span>
            {x?.legacy_admin_id && (
              <span
                className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-[10px] font-medium"
                title="PCS adminID เดิม (legacy bridge)"
              >
                legacy: {x.legacy_admin_id}
              </span>
            )}
            {/* Status pill — precedence: ended > suspended > inactive > active */}
            {isEnded && (
              <span className="rounded-full bg-red-500 text-white px-2.5 py-0.5 text-[10px] font-medium">
                ลาออกแล้ว
              </span>
            )}
            {!isEnded && isSuspended && (
              <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-[10px] font-medium">
                พักงานชั่วคราว
              </span>
            )}
            {!isEnded && !isSuspended && !hasActiveGrant && (
              <span className="rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 text-[10px] font-medium">
                ปิดสิทธิ์ทั้งหมด
              </span>
            )}
            {!isEnded && !isSuspended && hasActiveGrant && (
              <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-medium">
                ทำงานอยู่
              </span>
            )}
            {p.is_active === false && (
              <span className="rounded-full bg-slate-500 text-white px-2.5 py-0.5 text-[10px] font-medium">
                profile inactive
              </span>
            )}
          </div>
          {/* Role + company + type badges */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeGrants.length > 0 ? (
              activeGrants.map((g) => {
                const r = nameRole(g.role);
                return <Pill key={g.role} label={r.label} color={r.color} />;
              })
            ) : (
              <span className="text-[11px] text-muted italic">(ไม่มี role ที่ active)</span>
            )}
            {companyBadge && <Pill {...companyBadge} />}
            {typeBadge    && <Pill {...typeBadge} />}
            {x?.department && (
              <Pill label={x.department} color="secondary" />
            )}
          </div>
          {/* Probation countdown — only when probation + has end date */}
          {isProbation && x?.contract_end_date && (
            <div className="mt-2 text-xs text-amber-700">
              ทดลองงาน — เหลือ <span className="font-medium">{probationRemaining}</span>
              {" "}(ครบ {DateThai2(x.contract_end_date)})
            </div>
          )}
        </div>
      </div>

      {/* Legacy recreated-from banner */}
      {x?.legacy_admin_id && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
          <span aria-hidden>🔗</span>
          <div className="flex-1">
            <span className="font-medium">ระบบบันทึก:</span>{" "}
            ผู้ใช้นี้สร้างใหม่ในระบบ Pacred ผ่าน /admin/admins/new
            {p.created_at && (
              <> เมื่อ <span className="font-mono">{DateThai2(p.created_at)}</span></>
            )}
            {" "}· ก่อนหน้านี้คือ <span className="font-mono font-semibold">{x.legacy_admin_id}</span> ใน PCS เก่า
          </div>
        </div>
      )}

      {/* Wave 23 status banner — proactive transparency per AGENTS §0a. */}
      <div className="rounded-md border border-sky-200 bg-sky-50/60 p-2.5 text-xs text-sky-800 flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <div className="flex-1">
          <span className="font-medium">Wave 23 status:</span>{" "}
          ✅ Pacred-native detail · query admins/profiles/extras JOIN ·{" "}
          <span className="opacity-75">
            ⏳ Wave 23 follow-up: bank accounts · ประวัติการศึกษา · org channels
            (LINE/WeChat) · interpreter commission cog — these lived only in
            legacy tb_admin sidecar tables and aren&apos;t part of the new shape
          </span>
        </div>
      </div>

      {/* Action toolbar */}
      <div className="rounded-xl border border-border bg-surface-alt/40 p-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted font-medium">การจัดการ:</span>
        {(canMutate || isSelf) && (
          <Link
            href={`/admin/admins/${p.id}/edit`}
            className="rounded-lg border border-sky-500 bg-sky-500 px-3 py-1.5 text-white hover:bg-sky-600"
            title="แก้ไขข้อมูล HR + role + is_active"
          >
            ✏️ แก้ไขข้อมูล
          </Link>
        )}
        <Link
          href={`/admin/admin-audit-log?admin_id=${encodeURIComponent(p.id)}`}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-foreground hover:bg-surface-alt"
          title="Audit log ของพนักงานคนนี้"
        >
          📜 Audit log
        </Link>
        {canMutate && (
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-muted hover:bg-surface-alt"
            title="เปิด Supabase Dashboard → Authentication → Users เพื่อ reset password"
          >
            🔐 Reset password (Supabase) →
          </a>
        )}
      </div>

      {/* Identity */}
      <Section title="ข้อมูลส่วนตัว (Personal)">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="space-y-1">
            <KV label="อีเมล (login)" value={p.email ?? "-"} mono />
            <KV label="เบอร์โทรส่วนตัว"
                value={
                  p.phone
                    ? <a href={`tel:${p.phone}`} className="text-primary-600 hover:underline">{p.phone}</a>
                    : "-"
                }
                mono />
            {x?.direct_phone && (
              <KV label="เบอร์โทรตรง (HR)"
                  value={<a href={`tel:${x.direct_phone}`} className="text-primary-600 hover:underline">{x.direct_phone}</a>}
                  mono />
            )}
            <KV label="วันเกิด" value={DateThai2(p.birthday)} />
            <KV label="อายุ"     value={diffDateNow(p.birthday)} />
            <KV label="เพศ"      value={nameSex(p.sex)} />
          </div>
          <div className="space-y-1">
            <KV label="member_code"   value={p.member_code ?? "-"} mono />
            <KV label="profile UUID"  value={<span className="text-[10px] break-all">{p.id}</span>} mono />
            <KV label="วันที่สร้างบัญชี" value={DateThai2(p.created_at)} />
            <KV label="ล็อกอินล่าสุด"     value={DateThai2(p.last_login_at)} />
            <KV label="สถานะ profile"    value={p.is_active === false ? "ปิด" : "เปิด"} />
            {p.migrated_from_pcs && (
              <KV label="legacy PCS userid"
                  value={p.legacy_pcs_user_id ?? "(unknown)"}
                  mono />
            )}
          </div>
        </div>
      </Section>

      {/* HR */}
      <Section title="ข้อมูลพนักงาน (HR)">
        {x ? (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="space-y-1">
              <KV label="ชื่อเล่น"        value={x.nickname ?? "-"} />
              <KV label="display_name"   value={x.display_name ?? "-"} />
              <KV label="บริษัท"          value={companyBadge ? <Pill {...companyBadge} /> : "-"} />
              <KV label="ประเภทพนักงาน"  value={typeBadge ? <Pill {...typeBadge} /> : "-"} />
              <KV label="แผนก"            value={x.department ?? "-"} />
              <KV label="ตำแหน่ง"         value={x.section ?? "-"} />
            </div>
            <div className="space-y-1">
              <KV label="อีเมลบริษัท"
                  value={
                    x.work_email
                      ? <a href={`mailto:${x.work_email}`} className="text-primary-600 hover:underline break-all">{x.work_email}</a>
                      : "-"
                  } />
              <KV label="โทรบริษัท"
                  value={
                    x.work_phone
                      ? <a href={`tel:${x.work_phone}`} className="text-primary-600 hover:underline">{x.work_phone}</a>
                      : "-"
                  }
                  mono />
              <KV label="วันเริ่มงาน"        value={DateThai2(x.hired_at)} />
              <KV label="วันสิ้นสุดสัญญา"   value={DateThai2(x.contract_end_date)} />
              <KV label="พักงานชั่วคราว"     value={x.suspended_at ? DateThai2(x.suspended_at) : "-"} />
              <KV label="ลาออก"             value={x.ended_at ? DateThai2(x.ended_at) : "-"} />
              <KV label="อัปเดตข้อมูลล่าสุด"  value={DateThai2(x.updated_at)} />
            </div>
          </div>
        ) : (
          <Empty>ยังไม่มีข้อมูล HR (admin_contact_extras row ว่าง) — กด ✏️ แก้ไขข้อมูล เพื่อเพิ่ม</Empty>
        )}
      </Section>

      {/* Legacy bridge — only render when there is bridge data */}
      {x && (x.legacy_admin_id || x.legacy_admin_type || x.legacy_admin_status) && (
        <Section title="ตัวเชื่อมระบบเก่า (Legacy bridge)">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="space-y-1">
              <KV label="legacy_admin_id"
                  value={x.legacy_admin_id ?? "-"}
                  mono />
              <KV label="legacy_admin_type" value={x.legacy_admin_type ?? "-"} mono />
              <KV label="legacy_admin_status" value={x.legacy_admin_status ?? "-"} mono />
            </div>
            <div className="space-y-1 text-xs text-muted">
              <p>
                <strong>legacy_admin_id</strong> = `tb_admin.adminID` เดิม (e.g.
                <span className="font-mono"> admin_nat</span>). ใช้ในการ JOIN กับ
                <span className="font-mono"> tb_users.adminidsale</span> เพื่อให้
                ลูกค้า ~8,890 คน ยังจำคู่ sales rep ได้ระหว่างย้ายระบบ.
              </p>
              <p>
                <strong>legacy_admin_type / status</strong> = raw value จาก
                tb_admin (เก็บไว้เป็น audit trail · ของจริงใช้ employee_type +
                role ของ Pacred แทน).
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* Notes */}
      {x?.admin_note && (
        <Section title="หมายเหตุภายใน (HR note)">
          <div className="p-5 text-sm whitespace-pre-wrap">{x.admin_note}</div>
        </Section>
      )}

      {/* Role grants history */}
      <Section
        title={`สิทธิ์ที่ได้รับ (${activeGrants.length} active / ${grantRows.length} total)`}
      >
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>สถานะ</Th>
              <Th>วันที่ให้สิทธิ์</Th>
              <Th>ให้สิทธิ์โดย</Th>
            </tr>
          </thead>
          <tbody>
            {grantRows.map((g) => {
              const r = nameRole(g.role);
              const granter = g.granted_by ? grantersMap.get(g.granted_by) : null;
              return (
                <tr key={g.role} className="border-t border-border">
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Pill label={r.label} color={r.color} />
                      <span className="font-mono text-[10px] text-muted">{g.role}</span>
                    </div>
                  </Td>
                  <Td>
                    {g.is_active
                      ? <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px]">active</span>
                      : <span className="rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-[10px]">inactive</span>}
                  </Td>
                  <Td>{DateThai2(g.granted_at)}</Td>
                  <Td>
                    {granter
                      ? (
                        <Link
                          href={`/admin/admins/${g.granted_by}`}
                          className="text-primary-600 hover:underline"
                        >
                          {granter.name}
                          {granter.member_code && <span className="text-muted text-[10px] ml-1">({granter.member_code})</span>}
                        </Link>
                      )
                      : (g.granted_by
                          ? <span className="font-mono text-[10px] text-muted" title={g.granted_by}>{g.granted_by.slice(0, 8)}…</span>
                          : <span className="text-muted">-</span>)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Section>

      {/* Footer */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/admins"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายชื่อพนักงาน
        </Link>
        {(canMutate || isSelf) && (
          <Link
            href={`/admin/admins/${p.id}/edit`}
            className="rounded-md border border-sky-500 bg-sky-500 px-3 py-2 text-xs text-white hover:bg-sky-600"
          >
            ✏️ แก้ไขข้อมูล
          </Link>
        )}
      </div>
    </main>
  );
}

// ============================================================================
// tiny helpers
// ============================================================================
function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${
        BADGE_CLS[color] ?? BADGE_CLS.secondary
      }`}
    >
      {label}
    </span>
  );
}
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={`text-right break-words ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}
function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <table className="w-full text-xs">{children}</table>
    </div>
  );
}
function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted bg-surface-alt/50 text-left whitespace-nowrap">
      {children}
    </th>
  );
}
function Td({ children, mono }: { children?: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-3 py-2 align-top ${mono ? "font-mono" : ""}`}>{children}</td>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-muted">{children}</p>;
}
