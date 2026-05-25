/**
 * /admin/admins — รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล (Wave 20 P1 rewrite)
 *
 * Per `docs/audit/admin-pages-audit-2026-05-25-night.md` P1 + AGENTS §0a
 * design philosophy: we KEEP the legacy `tb_admin` + `tb_org_*` reads
 * (correct already · faithful workflow) but REPLACE the verbatim
 * Bootstrap-4 + `.pcs-legacy` CSS scope with Pacred's Tailwind v4
 * design tokens, mirroring `/admin/forwarders` + `/admin/customers`
 * patterns (PageTopMenubar + filter pills + bordered table).
 *
 * Behaviour preserved 1:1 from the prior `.pcs-legacy` version:
 *   - Status filter (`?s=all|1|2`) — defaults to active staff (s=1 fallback)
 *   - Company filter (`?c=1|2|3`) — Freight&Cargo / Pacred Freight / Pacred
 *   - Type filter (`?type=1..7,3and4`)
 *   - Position filter (`?position=messenger|driver|shipping-*`)
 *   - Permission gate (`canMutate` = `super` role) hides adminType=7 row
 *     + the "เพิ่มใหม่"/edit/delete/reset-pass actions for non-mutators
 *   - Status overview tabs (ทั้งหมด · ยังทำงานอยู่ · ลาออก) with badge counts
 *   - 15 columns: registered date · id · adminID · name · nickname · company
 *     · type · department · section · personal email/tel · org email/tel ·
 *     suspended-flag · action buttons
 *
 * SQL reads against `tb_admin` + the org-channel ships/labels are unchanged
 * (the comments + helper functions still cite the legacy `home.php` line
 * numbers). The `checkRightsName` org-chart inline table + the badge label
 * helpers (`nameCompanyType`, `nameAdminType`, `generateBadgeDepartment`,
 * `generateBadgeSection`) are reused — Tailwind classes substituted for the
 * old `badge badge-danger badge-pill` Bootstrap classes via `BADGE_CLS`.
 *
 * Action buttons (edit / delete / reset-pass) — Wave 20 P1 ships them as
 * READ-ONLY links to the detail page; the inline-edit + reset-pass + delete
 * modals were a jQuery+Bootstrap-4 set in the legacy and are deferred to
 * **Wave 21** (Tailwind dialog rewrite of `admin-profile-client.tsx`). The
 * link itself works (lands on `/admin/admins/[id]`); the row banner below
 * tells ภูม what's wired vs deferred.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ============================================================================
// Inline helpers — see prior commits for the legacy `function.php` line
// citations. The badge labels are unchanged; we map the legacy Bootstrap
// color name (danger/warning/success/info/primary/secondary) to a Tailwind
// pill class via BADGE_CLS instead of relying on `.pcs-legacy` CSS.
// ============================================================================

const BADGE_CLS: Record<string, string> = {
  danger:    "bg-red-100 text-red-700 border-red-200",
  warning:   "bg-amber-100 text-amber-700 border-amber-200",
  success:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  info:      "bg-sky-100 text-sky-700 border-sky-200",
  primary:   "bg-primary-100 text-primary-700 border-primary-200",
  secondary: "bg-slate-100 text-slate-700 border-slate-200",
};

/** Legacy `nameCompanyType($int)` — function.php L2899-2907 */
function nameCompanyType(t: string | null): { label: string; color: string } | null {
  switch (t) {
    case "1": return { label: "Freight & Cargo", color: "danger" };
    case "2": return { label: "Pacred Freight",  color: "success" };
    case "3": return { label: "Pacred",          color: "warning" };
    default:  return null;
  }
}

/** Legacy `nameAdminType($int)` — function.php L3139-3151 */
function nameAdminType(t: string | null): { label: string; color: string } | null {
  switch (t) {
    case "1": return { label: "พนักงานประจำ", color: "danger" };
    case "2": return { label: "ทดลองงาน",     color: "warning" };
    case "3": return { label: "เด็กฝึกงาน",    color: "info" };
    case "4": return { label: "สหกิจศึกษา",    color: "success" };
    case "5": return { label: "พาสเนอร์",      color: "danger" };
    case "6": return { label: "ฟรีแลนซ์",     color: "warning" };
    case "7": return { label: "คนในบ้าน",     color: "primary" };
    default:  return null;
  }
}

/** Legacy `diffDateNow($datetime)` — function.php L1426-1450 */
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

/** Legacy `checkRightsName(...)` — function.php L3023-3054 (org-chart lookup) */
type OrgRow = {
  companyNo: number; departmentNo: number; sectionNo: number;
  departmentName: string; sectionName: string;
};
const ORG_CHART: OrgRow[] = [
  { companyNo: 1, departmentNo: 0, sectionNo: 0,  departmentName: "CEO",         sectionName: "CEO" },
  { companyNo: 1, departmentNo: 1, sectionNo: 1,  departmentName: "Manager",     sectionName: "Manager" },
  { companyNo: 1, departmentNo: 2, sectionNo: 2,  departmentName: "HR",          sectionName: "HR Manager" },
  { companyNo: 1, departmentNo: 2, sectionNo: 3,  departmentName: "HR",          sectionName: "HR" },
  { companyNo: 1, departmentNo: 2, sectionNo: 4,  departmentName: "HR",          sectionName: "Maid" },
  { companyNo: 1, departmentNo: 3, sectionNo: 5,  departmentName: "QA & QC",     sectionName: "QA Manager" },
  { companyNo: 1, departmentNo: 3, sectionNo: 6,  departmentName: "QA & QC",     sectionName: "QA" },
  { companyNo: 1, departmentNo: 3, sectionNo: 7,  departmentName: "QA & QC",     sectionName: "QC" },
  { companyNo: 1, departmentNo: 4, sectionNo: 8,  departmentName: "Accounting",  sectionName: "Accounting Manager" },
  { companyNo: 1, departmentNo: 4, sectionNo: 9,  departmentName: "Accounting",  sectionName: "Admin Accounting" },
  { companyNo: 1, departmentNo: 5, sectionNo: 10, departmentName: "Marketing",   sectionName: "Manager Marketing" },
  { companyNo: 1, departmentNo: 5, sectionNo: 11, departmentName: "Marketing",   sectionName: "Pricing" },
  { companyNo: 1, departmentNo: 5, sectionNo: 12, departmentName: "Marketing",   sectionName: "Marketing/Creative" },
  { companyNo: 1, departmentNo: 5, sectionNo: 13, departmentName: "Marketing",   sectionName: "Graphic/Editing" },
  { companyNo: 1, departmentNo: 6, sectionNo: 14, departmentName: "ITDT",        sectionName: "IT Project Manager" },
  { companyNo: 1, departmentNo: 6, sectionNo: 15, departmentName: "ITDT",        sectionName: "Front End" },
  { companyNo: 1, departmentNo: 6, sectionNo: 16, departmentName: "ITDT",        sectionName: "Back End" },
  { companyNo: 1, departmentNo: 6, sectionNo: 17, departmentName: "ITDT",        sectionName: "Full Stack" },
  { companyNo: 2, departmentNo: 1, sectionNo: 1,  departmentName: "Sales Freight", sectionName: "Sales Manager" },
  { companyNo: 2, departmentNo: 1, sectionNo: 2,  departmentName: "Sales Freight", sectionName: "Sales" },
  { companyNo: 2, departmentNo: 2, sectionNo: 3,  departmentName: "Freight Export", sectionName: "Manager Export" },
  { companyNo: 2, departmentNo: 2, sectionNo: 4,  departmentName: "Freight Export", sectionName: "CS/Doc Export" },
  { companyNo: 2, departmentNo: 2, sectionNo: 5,  departmentName: "Freight Export", sectionName: "Shipping Doc Export" },
  { companyNo: 2, departmentNo: 2, sectionNo: 6,  departmentName: "Freight Export", sectionName: "Shipping Clearance Export" },
  { companyNo: 2, departmentNo: 2, sectionNo: 7,  departmentName: "Freight Export", sectionName: "Shipping Clearance Import & Export" },
  { companyNo: 2, departmentNo: 2, sectionNo: 8,  departmentName: "Freight Export", sectionName: "Messenger" },
  { companyNo: 2, departmentNo: 3, sectionNo: 9,  departmentName: "Freight Import", sectionName: "Manager Import" },
  { companyNo: 2, departmentNo: 3, sectionNo: 10, departmentName: "Freight Import", sectionName: "CS/Doc Import" },
  { companyNo: 2, departmentNo: 3, sectionNo: 11, departmentName: "Freight Import", sectionName: "Shipping Doc Import" },
  { companyNo: 2, departmentNo: 3, sectionNo: 12, departmentName: "Freight Import", sectionName: "Shipping Clearance Import" },
  { companyNo: 2, departmentNo: 3, sectionNo: 13, departmentName: "Freight Import", sectionName: "Shipping Clearance Import & Export" },
  { companyNo: 2, departmentNo: 3, sectionNo: 14, departmentName: "Freight Import", sectionName: "Messenger" },
  { companyNo: 3, departmentNo: 1, sectionNo: 1,  departmentName: "Sales Cargo",   sectionName: "Sales Manager" },
  { companyNo: 3, departmentNo: 1, sectionNo: 2,  departmentName: "Sales Cargo",   sectionName: "Sales" },
  { companyNo: 3, departmentNo: 2, sectionNo: 3,  departmentName: "CS Purchasing", sectionName: "Manager Purchasing" },
  { companyNo: 3, departmentNo: 2, sectionNo: 4,  departmentName: "CS Purchasing", sectionName: "Purchasing" },
  { companyNo: 3, departmentNo: 3, sectionNo: 5,  departmentName: "Warehouse",     sectionName: "Manager warehouse" },
  { companyNo: 3, departmentNo: 3, sectionNo: 6,  departmentName: "Warehouse",     sectionName: "Warehouse" },
  { companyNo: 3, departmentNo: 3, sectionNo: 7,  departmentName: "Warehouse",     sectionName: "Driver" },
  { companyNo: 1, departmentNo: 5, sectionNo: 18, departmentName: "Marketing",     sectionName: "Sales All" },
];
function checkRightsName(
  companyType: string | null, department: string | null, section: string | null, adminType: string | null,
): { departmentName: string; sectionName: string } {
  const c = Number(companyType ?? 0);
  const d = Number(department ?? 0);
  const s = Number(section ?? 0);
  const row = ORG_CHART.find((r) => r.companyNo === c && r.departmentNo === d && r.sectionNo === s);
  if (row) return { departmentName: row.departmentName, sectionName: row.sectionName };
  if (adminType === "7") return { departmentName: "คนในบ้าน", sectionName: "คนในบ้าน" };
  return { departmentName: "unknown", sectionName: "unknown" };
}

/** Legacy `generateBadgeDepartment($role)` — function.php L3256-3279 */
function generateBadgeDepartment(role: string): { label: string; color: string } {
  switch (role) {
    case "CEO": case "Manager": case "HR": case "QA & QC":
    case "Accounting": case "Marketing": case "ITDT":
      return { label: role, color: "danger" };
    case "Sales Freight": case "Sales Cargo":
      return { label: role, color: "info" };
    case "FREIGHT Export":
      return { label: role, color: "primary" };
    case "FREIGHT Import": case "CS Purchasing":
      return { label: role, color: "success" };
    case "Warehouse":
      return { label: role, color: "warning" };
    default:
      return { label: role, color: "secondary" };
  }
}

/** Legacy `generateBadgeSection($role)` — function.php L3281-3328 */
function generateBadgeSection(role: string): { label: string; color: string } {
  const dangerSet = new Set([
    "CEO", "Manager", "HR Manager", "HR", "Maid",
    "QA Manager", "QA", "QC", "Accounting Manager", "Admin Accounting",
    "Manager Marketing", "Pricing", "Marketing/Creative", "Graphic/Editing",
    "IT Project Manager", "Front End", "Back End", "Full Stack",
    "Sales Manager", "Manager Export", "Manager Import",
    "Manager Purchasing", "Manager Warehouse",
  ]);
  const warningSet = new Set([
    "Shipping Doc Export", "Shipping Clearance Export",
    "Shipping Clearance Import & Export", "Messenger",
    "CS/Doc Import", "Shipping Doc Import", "Shipping Clearance Import",
    "Driver", "Warehouse",
  ]);
  if (dangerSet.has(role))  return { label: role, color: "danger" };
  if (role === "Sales" || role === "Sales All") return { label: role, color: "info" };
  if (role === "CS/Doc Export" || role === "Purchasing")
                            return { label: role, color: "success" };
  if (warningSet.has(role)) return { label: role, color: "warning" };
  return { label: role, color: "secondary" };
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
// SQL — admin client, RLS-locked to service_role.
// ============================================================================

type AdminRow = {
  id: number;
  adminregistered: string | null;
  adminid: string;
  adminname: string;
  adminlastname: string;
  adminnickname: string | null;
  adminpicture: string | null;
  adminemail: string | null;
  admintel: string | null;
  admintype: string | null;
  admintmp: string | null;
  adminstatusa: string | null;
  admindel: string | null;
  companytype: string | null;
  department: string | null;
  section: string | null;
  enddate: string | null;
};

type SP = { s?: string; c?: string; type?: string; position?: string };

export default async function AdminTablePage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  // home.php is wrapped by admin-table.php which is wrapped by include/header.php
  // -> the header.php gate is "any logged-in admin can view". Per runbook §3
  // we keep the Pacred auth chain; require any admin role.
  const { roles } = await requireAdmin();

  // Legacy `departmentKey == 'HR' || 'ITDT' || 'CEO'` — the gate for the
  // "เพิ่มใหม่" CTA + the action-cell buttons (edit / delete / reset-pass).
  // Closest V3 RBAC role = `super` (the role that owns admin-mutation).
  const canMutate = roles.includes("super");

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── tb_admin filtered query (home.php L143-239) ──────────────
  let q = admin.from("tb_admin").select(
    "id, adminregistered, adminid, adminname, adminlastname, adminnickname, " +
    "adminpicture, adminemail, admintel, admintype, admintmp, adminstatusa, " +
    "admindel, companytype, department, section, enddate"
  );

  switch (sp.s) {
    case "1":   q = q.eq("adminstatusa", "1"); break;
    case "2":   q = q.eq("adminstatusa", "0"); break;
    case "all": /* no action */ break;
    default:    /* not set — match legacy: defaults visually to active tab but data is unfiltered */ break;
  }
  switch (sp.c) {
    case "1": q = q.eq("companytype", "1"); break;
    case "2": q = q.eq("companytype", "2"); break;
    case "3": q = q.eq("companytype", "3"); break;
  }
  switch (sp.position) {
    case "messenger":                q = q.in("section", ["8", "14"]); break;
    case "driver":                   q = q.eq("section", "7"); break;
    case "shipping-import":          q = q.eq("section", "12"); break;
    case "shipping-export":          q = q.eq("section", "6"); break;
    case "shipping-importAndExport": q = q.in("section", ["7", "13"]).eq("companytype", "2"); break;
  }
  switch (sp.type) {
    case "1":     q = q.eq("admintype", "1"); break;
    case "2":     q = q.eq("admintype", "2"); break;
    case "3and4": q = q.in("admintype", ["3", "4"]); break;
    case "3":     q = q.eq("admintype", "3"); break;
    case "4":     q = q.eq("admintype", "4"); break;
    case "5":     q = q.eq("admintype", "5"); break;
    case "6":     q = q.eq("admintype", "6"); break;
    case "7":     q = q.eq("admintype", "7"); break;
  }
  // Legacy L235-239: hide adminType=7 from non-HR viewers.
  if (!canMutate) q = q.neq("admintype", "7");

  // DataTables default order — adminregistered desc.
  q = q.order("adminregistered", { ascending: false, nullsFirst: false });

  // ── Status overview counts (home.php L243-256) ───────────────
  const buildCountQ = (statusVal: "active" | "all") => {
    let cq = admin.from("tb_admin").select("id", { count: "exact", head: true }).neq("admintype", "");
    if (statusVal === "active") cq = cq.eq("adminstatusa", "1");
    switch (sp.c) {
      case "1": cq = cq.eq("companytype", "1"); break;
      case "2": cq = cq.eq("companytype", "2"); break;
      case "3": cq = cq.eq("companytype", "3"); break;
    }
    switch (sp.position) {
      case "messenger":                cq = cq.in("section", ["8", "14"]); break;
      case "driver":                   cq = cq.eq("section", "7"); break;
      case "shipping-import":          cq = cq.eq("section", "12"); break;
      case "shipping-export":          cq = cq.eq("section", "6"); break;
      case "shipping-importAndExport": cq = cq.in("section", ["7", "13"]).eq("companytype", "2"); break;
    }
    switch (sp.type) {
      case "1":     cq = cq.eq("admintype", "1"); break;
      case "2":     cq = cq.eq("admintype", "2"); break;
      case "3and4": cq = cq.in("admintype", ["3", "4"]); break;
      case "3":     cq = cq.eq("admintype", "3"); break;
      case "4":     cq = cq.eq("admintype", "4"); break;
      case "5":     cq = cq.eq("admintype", "5"); break;
      case "6":     cq = cq.eq("admintype", "6"); break;
      case "7":     cq = cq.eq("admintype", "7"); break;
    }
    if (!canMutate) cq = cq.neq("admintype", "7");
    return cq;
  };

  const [tableRes, sAllRes, s1Res, emailShipsRes, tellShipsRes, emailOrgRes, tellOrgRes] = await Promise.all([
    q,
    buildCountQ("all"),
    buildCountQ("active"),
    admin.from("tb_org_email_ships").select("adminid, oeid"),
    admin.from("tb_org_tell_ships").select("adminid, otid"),
    admin.from("tb_organization_email").select("id, email"),
    admin.from("tb_organization_tell").select("id, tell"),
  ]);

  // §0c — surface real errors instead of swallowing into empty list.
  if (tableRes.error) {
    console.error("[admins list] tb_admin query failed", {
      code: tableRes.error.code,
      message: tableRes.error.message,
      details: tableRes.error.details,
    });
    throw new Error(
      `admins: failed to load tb_admin — ${tableRes.error.code ?? "unknown"}: ${tableRes.error.message}`,
    );
  }

  const rows: AdminRow[] = (tableRes.data ?? []) as unknown as AdminRow[];
  const sAll = sAllRes.count ?? 0;
  const s1   = s1Res.count   ?? 0;
  const s2   = sAll - s1;

  const emailById = new Map<number, string>();
  for (const r of (emailOrgRes.data ?? []) as Array<{ id: number; email: string }>) {
    emailById.set(Number(r.id), r.email);
  }
  const tellById = new Map<number, string>();
  for (const r of (tellOrgRes.data ?? []) as Array<{ id: number; tell: string }>) {
    tellById.set(Number(r.id), r.tell);
  }
  const arrEmailOrg = new Map<string, string>();
  for (const r of (emailShipsRes.data ?? []) as Array<{ adminid: string; oeid: number }>) {
    const email = emailById.get(Number(r.oeid));
    if (email) arrEmailOrg.set(r.adminid, email);
  }
  const arrTellOrg = new Map<string, string>();
  for (const r of (tellShipsRes.data ?? []) as Array<{ adminid: string; otid: number }>) {
    const tell = tellById.get(Number(r.otid));
    if (tell) arrTellOrg.set(r.adminid, tell);
  }

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
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">รายชื่อพนักงานทั้งหมด</h1>
          <p className="text-sm text-muted mt-0.5">
            {rows.length.toLocaleString("th-TH")} รายการ (จาก {sAll.toLocaleString("th-TH")} ทั้งหมด)
          </p>
        </div>
        {canMutate && (
          <Link
            href="/admin/admins/add"
            className="rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
          >
            + เพิ่มพนักงานใหม่
          </Link>
        )}
      </div>

      {/* Wave 20 status banner — proactive transparency per AGENTS §0a. */}
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <div className="flex-1">
          <span className="font-medium">Wave 20 P1 status:</span>{" "}
          ✅ Tailwind chrome · all `tb_admin` + org_* reads · status tabs · company/type/position filters ·
          row → detail link ·{" "}
          <span className="opacity-75">⏳ Wave 21: inline edit / delete / reset-pass modals
          (จาก `admin-profile-client.tsx` ที่ยังอยู่ใน Bootstrap-4)</span>
        </div>
      </div>

      {/* Status overview tabs — ทั้งหมด · ยังทำงานอยู่ · ลาออก */}
      <div className="flex flex-wrap gap-0 border-b border-border -mx-1">
        {([
          { v: "all", l: "ทั้งหมด",                    n: sAll },
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

      {/* Active filter chips (read-only summary of `?c=`, `?type=`, `?position=`).
          Legacy lets you set these via dropdowns inside admin-table.php's
          sidebar — that side-nav is a separate Wave 21 task. */}
      {(sp.c || sp.type || sp.position) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted font-medium">กำลังกรอง:</span>
          {sp.c && (
            <span className="rounded-full border border-border bg-surface-alt px-2.5 py-1">
              บริษัท: {nameCompanyType(sp.c)?.label ?? sp.c}
            </span>
          )}
          {sp.type && (
            <span className="rounded-full border border-border bg-surface-alt px-2.5 py-1">
              ประเภท: {sp.type === "3and4" ? "ฝึกงาน/สหกิจ" : nameAdminType(sp.type)?.label ?? sp.type}
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

      {/* Table — replaces the legacy DataTables 15-column wrapper. Wide column
          set → scrollbar-x-visible (per AGENTS §0c bug-2 fix · Windows Chrome
          hides scrollbars by default). */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs">
            <thead className="bg-surface-alt/60">
              <tr className="text-left">
                <Th>วันที่สมัคร</Th>
                <Th>รหัส</Th>
                <Th>ผู้ใช้งาน</Th>
                <Th>ชื่อ - นามสกุล</Th>
                <Th>ชื่อเล่น</Th>
                <Th>บริษัท</Th>
                <Th>ประเภท</Th>
                <Th>แผนก</Th>
                <Th>ตำแหน่ง</Th>
                <Th>อีเมลส่วนตัว</Th>
                <Th>เบอร์ส่วนตัว</Th>
                <Th>อีเมลบริษัท</Th>
                <Th>โทรบริษัท</Th>
                <Th>สถานะ</Th>
                <Th>ตัวเลือก</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-muted">
                    ไม่พบข้อมูลพนักงานตามเงื่อนไข
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  // home.php L320: adminPicture is a bare filename under
                  // legacy/pcs/admin/images/. The customer-images backfill
                  // (Phase A) will populate per-admin photos; until then
                  // every row resolves to the user.jpg default.
                  const pic = row.adminpicture && row.adminpicture.trim() !== ""
                    ? row.adminpicture : "user.jpg";
                  const picUrl = `/legacy/pcs/admin/images/${pic}`;

                  const companyBadge = nameCompanyType(row.companytype);
                  const typeBadge    = nameAdminType(row.admintype);
                  const rights       = checkRightsName(row.companytype, row.department, row.section, row.admintype);
                  const deptBadge    = generateBadgeDepartment(rights.departmentName);
                  const sectBadge    = generateBadgeSection(rights.sectionName);
                  const isTrainee    = row.admintype === "3" || row.admintype === "4";
                  const remaining    = isTrainee ? diffDateNow(row.enddate) : "";
                  const dueDate      = row.enddate ? row.enddate.slice(0, 10) : "";
                  const isInactive   = row.adminstatusa === "0";
                  const detailHref   = `/admin/admins/${encodeURIComponent(row.adminid)}`;

                  return (
                    <tr key={row.id} className="border-t border-border hover:bg-surface-alt/40">
                      <Td>{row.adminregistered ? row.adminregistered.slice(0, 16).replace("T", " ") : "-"}</Td>
                      <Td mono>[{row.id}]</Td>
                      <Td>
                        <Link href={detailHref} className="font-mono text-primary-600 hover:underline">
                          {row.adminid}
                        </Link>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 min-w-[180px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={picUrl}
                            alt={`${row.adminname} ${row.adminlastname}`}
                            className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                          />
                          <Link href={detailHref} className="text-foreground hover:text-primary-600 hover:underline truncate">
                            {row.adminname} {row.adminlastname}
                          </Link>
                        </div>
                      </Td>
                      <Td>{row.adminnickname ?? "-"}</Td>
                      <Td>{companyBadge && <Pill {...companyBadge} />}</Td>
                      <Td>
                        {typeBadge && <Pill {...typeBadge} />}
                        {isTrainee && (
                          <div className="mt-1 text-[10px] text-muted">
                            <div>เหลือ: <span className="text-red-600 font-medium">{remaining}</span></div>
                            <div>ครบ: {dueDate}</div>
                          </div>
                        )}
                      </Td>
                      <Td><Pill {...deptBadge} /></Td>
                      <Td><Pill {...sectBadge} /></Td>
                      <Td>
                        {row.adminemail
                          ? <a href={`mailto:${row.adminemail}`} className="text-primary-600 hover:underline truncate block max-w-[160px]">{row.adminemail}</a>
                          : "-"}
                      </Td>
                      <Td mono>
                        {row.admintel
                          ? <a href={`tel:${row.admintel}`} className="text-primary-600 hover:underline">{row.admintel}</a>
                          : "-"}
                      </Td>
                      <Td>
                        <span className="truncate block max-w-[160px]">{arrEmailOrg.get(row.adminid) ?? "-"}</span>
                      </Td>
                      <Td mono>{arrTellOrg.get(row.adminid) ?? "-"}</Td>
                      <Td>
                        {row.admintmp === "2" ? (
                          <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] whitespace-nowrap">
                            พักงานชั่วคราว
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted">-</span>
                        )}
                      </Td>
                      <Td>
                        {isInactive ? (
                          <div className="flex flex-col gap-0.5 min-w-[120px]">
                            <span className="rounded bg-red-500 text-white px-2 py-0.5 text-[10px] text-center">
                              ลบแล้ว
                            </span>
                            <span className="text-[10px] text-muted text-center">โดย {row.admindel ?? "-"}</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            <Link
                              href={detailHref}
                              className="rounded-lg border border-border bg-white px-2 py-1 text-[10px] text-foreground hover:bg-primary-50 hover:border-primary-200"
                              title="ดูข้อมูล / แก้ไข"
                            >
                              ดู
                            </Link>
                            {canMutate && (
                              <>
                                {/* TODO Wave 21: wire delete + reset-pass modals
                                    (the legacy ones in admin-profile-client.tsx
                                    are jQuery+BS4 and won't open with our
                                    Tailwind chrome). For now → link to detail
                                    page where action lives. */}
                                <Link
                                  href={`${detailHref}#delete`}
                                  className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700 hover:bg-red-100"
                                  title="ลบบัญชี (Wave 21)"
                                >
                                  ลบ
                                </Link>
                                <Link
                                  href={`${detailHref}#reset`}
                                  className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-700 hover:bg-sky-100"
                                  title="รีเซ็ตรหัสผ่าน (Wave 21)"
                                >
                                  รหัส
                                </Link>
                              </>
                            )}
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
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
function Td({ children, mono }: { children?: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-3 py-2 align-top ${mono ? "font-mono" : ""}`}>
      {children}
    </td>
  );
}
