import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin > "รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล" — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo admin
 * `pcs-admin/admin-table.php` default view
 * (the include `pcs-admin/include/pages/admin-table/home.php`),
 * per D1 / ADR-0017 + the faithful-port transcription runbook
 * (`docs/runbook/faithful-port-transcription.md` §8 — admin pilot).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML structure `admin-table.php` -> `home.php` renders —
 * same Bootstrap-4 markup, same elements, same labels, same column
 * order. The visual identity comes from the legacy admin CSS,
 * brought in verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/admin/admin-base.css` (the BS4 + Modern-Admin
 * theme subset that the admin chrome uses) and
 * `public/legacy/pcs/admin/admin-table.css` (the page-specific
 * inline-<style> block + DataTables filter widget chrome), both
 * loaded via plain <link rel="stylesheet"> so they bypass the
 * app's Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `home.php` source structure transcribed here:
 *   - Title bar      home.php L1   (window/page title)
 *   - Breadcrumb     home.php L72 → breadcrumbAdmin() helper in
 *                    pcs-admin/include/function.php L2976-2996
 *   - Card header    home.php L85-113  (page heading + "เพิ่มใหม่" CTA
 *                    visible only to HR / ITDT / CEO)
 *   - Status nav     home.php L257-285 (ทั้งหมด · ยังทำงานอยู่ · ลาออก)
 *                    with count badges from the s1/s2/sAll queries
 *                    L243-256.
 *   - DataTables     home.php L286-417 (15-column table with full
 *                    row rendering; "action" cell shows edit /
 *                    delete / reset-pass only to HR/ITDT/CEO).
 *
 * Data — every `home.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to
 * service_role, so reads go through the admin client.
 *   - $arrEmailOrg  → tb_org_email_ships ⋈ tb_organization_email
 *                     (home.php L116-127)
 *   - $arrTellOrg   → tb_org_tell_ships  ⋈ tb_organization_tell
 *                     (home.php L128-139)
 *   - $sAll/$s1/$s2 → tb_admin filtered by adminStatusA + ?s/?c/?type/?position
 *                     (home.php L243-256 — the count-by-status overview)
 *   - $sql_Table    → tb_admin WHERE 1 + same filters,
 *                     order by [0] (DataTables default = "วันที่สมัครใช้ระบบ"
 *                     desc = adminregistered desc) — home.php L143-239,
 *                     L289 datatables init order [[0, 'desc']].
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate is "HR / ITDT / CEO can add/edit/delete; everyone else can
 * see the list" (home.php L94-99, L394-405; admin-table.php L19-30,
 * L42-50). The closest Pacred V3 RBAC role is `super` — used here
 * as the "can mutate" gate. All admins can view the list.
 *
 * URL filters (transcribed from home.php L145-234) — exposed as
 * search params on this Next.js route, same query-string shape as
 * the legacy URL:
 *   ?s=all|1|2           → status filter (default = "1" / active)
 *   ?c=1|2|3|all         → company filter (1/2/3 = Cargo&Freight/Freight/Cargo)
 *   ?type=…              → adminType filter (1..7 + 3and4)
 *   ?position=…          → section filter (messenger/driver/shipping-*)
 *
 * Rebrand DONE: legacy `PCS<n>` member-code style → `PR<n>` + the
 * visible company-type badge labels ("PCS Freight" / "PCS Cargo")
 * → "Pacred Freight" / "Pacred" per the 2026-05-22 owner directive
 * ("เปลี่ยนหมดเลย ถ้าเรื่อง rebrand"). The underlying
 * `tb_admin.companytype` integer column ("2" / "3") is data and
 * unchanged.
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The legacy edit-user (`editUser()`) + delete-user
 *     (`deleteAdmin()`) + recover (`recoverUser()`) jQuery+AJAX
 *     handlers (home.php L465-525) — those mutations are SEPARATE
 *     pilots (`?page=edit`/`detail`/`add` map to sibling routes:
 *     `/admin/admins/[id]/edit`, `/admin/admins/[id]`,
 *     `/admin/admins/add`). The action buttons in the row are
 *     rendered with their legacy href/aria but the click handler
 *     is wired in a follow-up.
 *   - The SweetAlert sweet-alert popup after add/update
 *     (home.php L586-604) — deferred with the add/edit pilots.
 *   - The DataTables JS init (home.php L526-585): sortable headers,
 *     export-buttons (copy/csv/excel/print), per-page length
 *     selector, fixed header — those plugins are not in the Pacred
 *     dependency tree. The static markup carries the same wrapper
 *     classes (`.dataTables_wrapper`, `#myTable`, `.dt-buttons`)
 *     and the CSS reproduces the filter chrome so the screen looks
 *     identical at rest. Functional sort/filter is a follow-up
 *     (likely a small Pacred-side React DataTables shim or
 *     `<DataTable>` import).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Inline transcription of pcs-admin/include/function.php helper functions —
// these are pure functions that turn integer codes into HTML strings.
// Kept inline (not extracted to lib/) because this is a pilot; the
// pattern lift-to-`lib/` happens after a few admin pilots show the
// repeated callers.
// ============================================================================

/** Legacy `nameCompanyType($int)` — function.php L2899-2907 */
function nameCompanyType(t: string | null): { label: string; cls: string } | null {
  switch (t) {
    case "1": return { label: "Freight & Cargo", cls: "badge badge-danger badge-pill" };
    case "2": return { label: "Pacred Freight",      cls: "badge badge-success badge-pill" };
    case "3": return { label: "Pacred",        cls: "badge badge-warning badge-pill" };
    default:  return null;
  }
}

/** Legacy `nameAdminType($int)` — function.php L3139-3151 */
function nameAdminType(t: string | null): { label: string; cls: string } | null {
  switch (t) {
    case "1": return { label: "พนักงานประจำ", cls: "badge badge-danger  badge-pill" };
    case "2": return { label: "ทดลองงาน",     cls: "badge badge-warning badge-pill" };
    case "3": return { label: "เด็กฝึกงาน",    cls: "badge badge-info    badge-pill" };
    case "4": return { label: "สหกิจศึกษา",    cls: "badge badge-success badge-pill" };
    case "5": return { label: "พาสเนอร์",      cls: "badge badge-danger  badge-pill" };
    case "6": return { label: "ฟรีแลนซ์",     cls: "badge badge-warning badge-pill" };
    case "7": return { label: "คนในบ้าน",     cls: "badge badge-primary badge-pill" };
    default:  return null;
  }
}

/** Legacy `diffDateNow($datetime)` — function.php L1426-1450.
 *  Returns "<m> เดือน <d> วัน" / "<y> ปี <m> เดือน <d> วัน" etc. */
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
  // legacy uses abs values
  y = Math.abs(y); m = Math.abs(m); d = Math.abs(d);
  if (y === 0 && m === 0) return `${d} วัน `;
  if (y === 0)            return `${m} เดือน ${d} วัน `;
  return `${y} ปี ${m} เดือน ${d} วัน `;
}

/** Legacy `checkRightsName([companyType, department, section, adminType])`
 *  — function.php L3023-3054. The PHP version reads the org-chart from
 *  pcs-admin/include/pages/organization-chart/dataJson.php (40 rows of
 *  (companyNo, departmentNo, sectionNo, …) -> (companyName, departmentName,
 *  sectionName)). Inlined here verbatim so the lookup is a faithful
 *  identical mapping. */
type OrgRow = {
  companyNo: number;
  departmentNo: number;
  sectionNo: number;
  departmentName: string;
  sectionName: string;
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
  companyType: string | null, department: string | null, section: string | null, adminType: string | null
): { departmentName: string; sectionName: string } {
  const c = Number(companyType ?? 0);
  const d = Number(department ?? 0);
  const s = Number(section ?? 0);
  const row = ORG_CHART.find((r) => r.companyNo === c && r.departmentNo === d && r.sectionNo === s);
  if (row) return { departmentName: row.departmentName, sectionName: row.sectionName };
  // Legacy fallback (function.php L3045-3051): adminType=7 -> "คนในบ้าน"
  if (adminType === "7") return { departmentName: "คนในบ้าน", sectionName: "คนในบ้าน" };
  return { departmentName: "unknown", sectionName: "unknown" };
}

/** Legacy `generateBadgeDepartment($role)` — function.php L3256-3279 */
function generateBadgeDepartment(role: string): { label: string; cls: string } {
  switch (role) {
    case "CEO":
    case "Manager":
    case "HR":
    case "QA & QC":
    case "Accounting":
    case "Marketing":
    case "ITDT":
      return { label: role, cls: "badge badge-danger badge-pill" };
    case "Sales Freight":
    case "Sales Cargo":
      return { label: role, cls: "badge badge-info badge-pill" };
    case "FREIGHT Export":
      return { label: role, cls: "badge badge-primary badge-pill" };
    case "FREIGHT Import":
    case "CS Purchasing":
      return { label: role, cls: "badge badge-success badge-pill" };
    case "Warehouse":
      return { label: role, cls: "badge badge-warning badge-pill" };
    default:
      return { label: role, cls: "badge badge-secondary badge-pill" };
  }
}

/** Legacy `generateBadgeSection($role)` — function.php L3281-3328 */
function generateBadgeSection(role: string): { label: string; cls: string } {
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
  if (dangerSet.has(role))  return { label: role, cls: "badge badge-danger badge-pill" };
  if (role === "Sales" || role === "Sales All") return { label: role, cls: "badge badge-info badge-pill" };
  if (role === "CS/Doc Export" || role === "Purchasing")
                            return { label: role, cls: "badge badge-success badge-pill" };
  if (warningSet.has(role)) return { label: role, cls: "badge badge-warning badge-pill" };
  return { label: role, cls: "badge badge-secondary badge-pill" };
}

/** Legacy `checkNULL($data,$lable,$enter,$link)` — function.php L697-709.
 *  Renders the value as a link if a link target is provided, else plain text. */
function CheckNull({ value, link }: { value: string | null | undefined; link?: string }) {
  if (!value) return null;
  if (link) return <a href={link}>{value}</a>;
  return <>{value}</>;
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
  // The legacy combines four filter blocks (s = status, c = company,
  // position = section list, type = adminType) into a single WHERE.
  // Each filter resolves to a Postgrest predicate; the s=1 default
  // (no ?s query param) is the "active staff" view.
  let q = admin.from("tb_admin").select(
    "id, adminregistered, adminid, adminname, adminlastname, adminnickname, " +
    "adminpicture, adminemail, admintel, admintype, admintmp, adminstatusa, " +
    "admindel, companytype, department, section, enddate"
  );

  switch (sp.s) {
    case "1":   q = q.eq("adminstatusa", "1"); break;
    case "2":   q = q.eq("adminstatusa", "0"); break;
    case "all": /* no action */ break;
    default:    /* not set — legacy datatable defaults to s-1 visual; data
                   shows all (the active filter is applied client-side via
                   the active CSS class) — match by leaving unfiltered. */ break;
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
  // Legacy L235-239: non-HR / non-section-0 viewers cannot see
  // adminType=7 (คนในบ้าน). Pacred V3 has no `departmentKey`/`section`
  // equivalent — the closest match is "hide adminType=7 unless super".
  if (!canMutate) q = q.neq("admintype", "7");

  // DataTables default order is column 0 desc — "วันที่สมัครใช้ระบบ"
  // = adminregistered (home.php L289 + L545).
  q = q.order("adminregistered", { ascending: false, nullsFirst: false });

  // ── Status overview counts (home.php L243-256) ───────────────
  // sAll = filtered total ignoring the status filter.
  // s1   = filtered active count.
  // s2   = sAll - s1.
  // Re-runs the same filter chain without the status predicate; in
  // PostgREST we use head:true + count:"exact" so no rows are read.
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

  // ── tb_org_email_ships ⋈ tb_organization_email (home.php L116-127) ──
  //    SELECT email, adminID FROM tb_org_email_ships LEFT JOIN tb_organization_email
  //    -> arrEmailOrg[adminID] = email
  // Same shape for tell.
  const [tableRes, sAllRes, s1Res, emailShipsRes, tellShipsRes, emailOrgRes, tellOrgRes] = await Promise.all([
    q,
    buildCountQ("all"),
    buildCountQ("active"),
    admin.from("tb_org_email_ships").select("adminid, oeid"),
    admin.from("tb_org_tell_ships").select("adminid, otid"),
    admin.from("tb_organization_email").select("id, email"),
    admin.from("tb_organization_tell").select("id, tell"),
  ]);

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

  // ── Page title — admin-table.php L251 ────────────────────────
  const pageTitle = "รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล";

  // Active tab — home.php L455-463 (sets the `.active` class on
  // the status nav-link based on ?s). Default tab when no ?s = "1".
  const activeTab = sp.s === "all" ? "all" : sp.s === "2" ? "2" : "1";

  // Build URL preserving non-status filters (so changing the status
  // tab doesn't lose the c/position/type filters).
  const buildStatusUrl = (s: "all" | "1" | "2") => {
    const params = new URLSearchParams();
    params.set("s", s);
    if (sp.c)        params.set("c", sp.c);
    if (sp.type)     params.set("type", sp.type);
    if (sp.position) params.set("position", sp.position);
    return `/admin/admins?${params.toString()}`;
  };

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-table.css" />

      {/* BEGIN: Content — admin-table.php L? → home.php L68 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — home.php L72 → breadcrumbAdmin($title)
              (function.php L2976-2996) */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/admins">{pageTitle}</Link>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body body-new">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        {/* ── Card header — home.php L84-114 ── */}
                        <div className="row">
                          <div className="content-header-left col-md-8 col-12">
                            <div className="text-center text-md-left">
                              <h2 className="text-color-main">{pageTitle}</h2>
                              <div className="pcs-sequence"></div>
                            </div>
                          </div>
                          {canMutate && (
                            <div className="content-header-right col-md-4 col-12">
                              <div className="text-center text-md-right">
                                <Link href="/admin/admins/add">
                                  <button
                                    className="btn btn-sm btn-circle btn-success text-white"
                                    type="button"
                                    title="เพิ่มใหม่"
                                  >
                                    <svg className="pcs-icon" viewBox="0 0 24 24">
                                      <line x1="12" y1="5" x2="12" y2="19" />
                                      <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                  </button>
                                  <span className="font-normal text-dark"> เพิ่มใหม่</span>
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── Status overview tabs — home.php L257-285 ── */}
                        <div className="row">
                          <div className="col-md-12">
                            <div className="p-05">
                              <ul className="nav nav-tabs nav-underline pcs-tabs no-hover-bg">
                                <li className={`nav-item s-all ${activeTab === "all" ? "active" : ""}`}>
                                  <a className={`nav-link s-all ${activeTab === "all" ? "active" : ""}`} href={buildStatusUrl("all")}>
                                    ทั้งหมด
                                    {sAll > 0 && (
                                      <div className="pcs-badge badge-secondary pcs-badge-pill">{sAll}</div>
                                    )}
                                  </a>
                                </li>
                                <li className={`nav-item s-1 ${activeTab === "1" ? "active" : ""}`}>
                                  <a className={`nav-link s-1 ${activeTab === "1" ? "active" : ""}`} href={buildStatusUrl("1")}>
                                    ยังทำงานอยู่
                                    {s1 > 0 && (
                                      <div className="pcs-badge badge-warning pcs-badge-pill">{s1}</div>
                                    )}
                                  </a>
                                </li>
                                <li className={`nav-item s-2 ${activeTab === "2" ? "active" : ""}`}>
                                  <a className={`nav-link s-2 ${activeTab === "2" ? "active" : ""}`} href={buildStatusUrl("2")}>
                                    ลาออกแล้ว/หมดเวลาทำงาน
                                    {s2 > 0 && (
                                      <div className="pcs-badge badge-danger pcs-badge-pill">{s2}</div>
                                    )}
                                  </a>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        {/* ── DataTables-wrapped admin table — home.php L286-417 ── */}
                        <div className="row">
                          <div className="col-md-12">
                            <div className="table-responsive">
                              <div className="dataTables_wrapper">
                                <table id="myTable" className="table display table-bordered table-striped dataTable no-footer dtr-inlind">
                                  <thead>
                                    <tr className="text-center bg-white">
                                      <th className="">วันที่สมัครใช้ระบบ</th>
                                      <th className="">รหัสพนักงาน<br />เชื่อมเครื่อง<br />สแกนนิ้ว</th>
                                      <th className="">ชื่อผู้ใช้งานระบบ</th>
                                      <th className="">ชื่อ - นามสกุล</th>
                                      <th className="">ชิ่อเล่น</th>
                                      <th className="">บริษัท</th>
                                      <th className="">ประเภทพนักงาน</th>
                                      <th className="">แผนก</th>
                                      <th className="">ตำแหน่ง</th>
                                      <th className="">อีเมลส่วนตัว</th>
                                      <th className="">เบอร์ส่วนตัว</th>
                                      <th className="">อีเมลบริษัท</th>
                                      <th className="">เบอร์โทรบริษัท</th>
                                      <th className="">สถานะพักงาน</th>
                                      <th className="">........ตัวเลือก........</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row) => {
                                      // home.php L320-321 — adminPicture lives under
                                      // basePath/images/admin/<file>. The migrated
                                      // tb_admin.adminpicture is a bare filename
                                      // (default 'user.jpg'). Customer image backfill
                                      // ✅ done (ภูม → S3 prod 2026-05-24,
                                      // pcsracgo/public/member); verify that the
                                      // images/admin/* admin photos were included
                                      // in the same upload — until verified, every
                                      // row resolves to the user.jpg default.
                                      // Path mirrors the legacy.
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

                                      return (
                                        <tr key={row.id} className="text- font-12">
                                          {/* 1 — วันที่สมัครใช้ระบบ */}
                                          <td className="">{row.adminregistered ?? ""}</td>
                                          {/* 2 — รหัสพนักงาน (ID) */}
                                          <td className="">[{row.id}]</td>
                                          {/* 3 — ชื่อผู้ใช้งานระบบ (adminID link) */}
                                          <td className="">
                                            <a target="_blank" href={`/admin/admins/${encodeURIComponent(row.adminid)}`}>
                                              {row.adminid}
                                            </a>
                                          </td>
                                          {/* 4 — รูป + ชื่อ-นามสกุล */}
                                          <td className="">
                                            <a className="image-popup-vertical-fit el-link" href={picUrl}>
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img src={picUrl} alt="user" className="rounded-circle" width={35} />
                                            </a>
                                            {" "}
                                            <a
                                              href={`/admin/admins/${encodeURIComponent(row.adminid)}`}
                                              className="text-info"
                                              target="_blank"
                                            >
                                              {row.adminname} {row.adminlastname}
                                            </a>
                                          </td>
                                          {/* 5 — ชื่อเล่น */}
                                          <td className="text-center">{row.adminnickname ?? ""}</td>
                                          {/* 6 — บริษัท */}
                                          <td className="text-center">
                                            {companyBadge && (
                                              <span className={companyBadge.cls}>{companyBadge.label}</span>
                                            )}
                                          </td>
                                          {/* 7 — ประเภทพนักงาน (+ trainee remaining) */}
                                          <td className="text-center">
                                            {typeBadge && (
                                              <span className={typeBadge.cls}>{typeBadge.label}</span>
                                            )}
                                            {isTrainee && (
                                              <>
                                                <br />
                                                เหลือเวลาฝึก : <span className="bg-danger2">{remaining}</span>
                                                <br />
                                                ครบกำหนด : {dueDate}
                                              </>
                                            )}
                                          </td>
                                          {/* 8 — แผนก */}
                                          <td className="text-center">
                                            <span className={deptBadge.cls}>{deptBadge.label}</span>
                                          </td>
                                          {/* 9 — ตำแหน่ง */}
                                          <td className="text-center">
                                            <span className={sectBadge.cls}>{sectBadge.label}</span>
                                          </td>
                                          {/* 10 — อีเมลส่วนตัว */}
                                          <td>
                                            <CheckNull value={row.adminemail} link={row.adminemail ? `mailto:${row.adminemail}` : undefined} />
                                          </td>
                                          {/* 11 — เบอร์ส่วนตัว */}
                                          <td>
                                            <CheckNull value={row.admintel} link={row.admintel ? `tel:${row.admintel}` : undefined} />
                                          </td>
                                          {/* 12 — อีเมลบริษัท */}
                                          <td>{arrEmailOrg.get(row.adminid) ?? ""}</td>
                                          {/* 13 — เบอร์โทรบริษัท */}
                                          <td>{arrTellOrg.get(row.adminid) ?? ""}</td>
                                          {/* 14 — สถานะพักงาน */}
                                          <td className="text-center">
                                            {row.admintmp === "2" && " (พักงานชั่วคราว ปิดรับออเดอร์)"}
                                          </td>
                                          {/* 15 — ตัวเลือก (action buttons) */}
                                          <td className="text-center action">
                                            {isInactive ? (
                                              <>
                                                <span className="text-white bg-danger">บัญชีนี้ถูกลบแล้ว</span>
                                                <span className="text-white bg-danger">ลบโดย {row.admindel}</span>
                                              </>
                                            ) : (
                                              canMutate && (
                                                <>
                                                  <a target="_blank" href={`/admin/admins/${encodeURIComponent(row.adminid)}`}>
                                                    <button type="button" className="btn btn-warning btn-rounded btn-sm" title="แก้ไขข้อมูล">
                                                      <svg className="pcs-icon" viewBox="0 0 24 24">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                      </svg>
                                                    </button>
                                                  </a>
                                                  {" "}
                                                  <button type="button" className="btn btn-danger btn-rounded btn-sm" title="ลบบัญชี" data-action-delete={row.adminid}>
                                                    <svg className="pcs-icon" viewBox="0 0 24 24">
                                                      <polyline points="3 6 5 6 21 6" />
                                                      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                                                      <path d="M10 11v6" />
                                                      <path d="M14 11v6" />
                                                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                  </button>
                                                  {" "}
                                                  <button type="button" className="btn btn-info btn-rounded btn-sm" title="รีเซ็ตรหัสผ่าน" data-action-reset={row.adminid}>
                                                    <svg className="pcs-icon" viewBox="0 0 24 24">
                                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                    </svg>
                                                  </button>
                                                </>
                                              )
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* legacy editForm/resetPass injection slots — home.php L429-430.
          The modals are AJAX-rendered in the legacy; the equivalent
          Pacred routes are sibling pilots (see file-header notes). */}
      <div id="editForm"></div>
      <div id="resetPass"></div>
      {/* END: Content */}
    </div>
  );
}
