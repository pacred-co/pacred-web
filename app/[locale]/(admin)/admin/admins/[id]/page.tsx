import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminProfileClient } from "./admin-profile-client";

/**
 * Admin > "โปรไฟล์พนักงาน" — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo admin `pcs-admin/admin-profile.php` detail view
 * (the legacy `?page=detail&id=X` sub-route of admin-table.php).
 *
 * Per D1 / ADR-0017 + faithful-port runbook §8 (admin pilot) +
 * §9 gotcha-list. This is a transcription, NOT a reinterpretation —
 * JSX = exact Bootstrap-4 markup from admin-profile.php, with the
 * same classes, structure, labels, and ordering; SQL = the exact
 * legacy SELECTs (admin-profile.php L256-288 + the inline SELECTs
 * at L678-738, L991-1024, L1052-1066, L1072-1109, L1226-1250,
 * L1328-1354). Mutations live in actions/admin/admin-profile.ts and
 * are invoked from <AdminProfileClient> (forms + Bootstrap modals).
 *
 * Auth — legacy `departmentKey == 'CEO' | 'Manager' | 'ITDT' | 'HR'`
 * gates the EDIT controls; everyone (signed-in admins) can VIEW.
 * Mirrors the customer pilot — `requireAdmin()` gates view; the
 * `super` role gates mutations.
 *
 * Rebrand: `PCS<n>` member-code style → `PR<n>` is a pure-text
 * concern; the underlying schema column (`tb_admin.adminid`) is
 * untouched per data-migration plan. The literal company labels
 * ("PCS Cargo", "PCS Freight") stay because those are company-brand
 * names recorded in `tb_admin.companytype` — per CLAUDE.md /
 * ADR-0017, the PCS scrub is API-switchover-gated.
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The Croppie / Cropper image-upload flow (admin-profile.php
 *     L1411-1473) — uses the legacy upload endpoint
 *     include/pages/uploadNew.php. Pacred image upload is a
 *     follow-up; the view falls back to the legacy default
 *     `/legacy/pcs/admin/images/user.jpg` (per pilot §9 gotcha #6
 *     "missing brand asset → use the legacy PCS asset").
 *   - The jQuery.Thailand.js auto-fill address picker (L1631-1635).
 *     The current-address form fields are plain text inputs in this
 *     port — the data persists round-trip; the autocomplete-from-
 *     zip-code helper is deferred.
 *   - DataTables JS (L1551-1585) — bank-account + education tables
 *     render statically with the same wrapper classes (per the
 *     admin-table.php pattern in admin-base.css/admin-table.css).
 *     Functional sort/export = follow-up.
 *   - SweetAlert toasts (L1802-1830) — replaced by inline plain-Thai
 *     error / success status messages on the client component.
 *   - The bootstrap-datetimepicker (L1680-1703) — replaced by plain
 *     <input type="date"> (HTML5 native picker).
 *   - The dropify file-upload widgets (L612-623, L781) — placeholder
 *     plain <input type="file"> markup is rendered; the actual
 *     upload backend is a follow-up (the legacy `uploadNew.php` is
 *     not ported either).
 */
export const dynamic = "force-dynamic";

// ============================================================================
// Inline transcription of pcs-admin/include/function.php helper functions —
// the page-side formatters (label lookups for sex / religion / marital /
// education-level / bank / company-type / admin-type / department /
// section / date formatting). Kept inline per faithful-port runbook §8 —
// the lift to `lib/legacy/admin-helpers.ts` happens after a few admin
// pilots show the same helpers repeated.
// ============================================================================

/** Legacy `DateThai2($strDate)` — function.php L137-144 */
function DateThai2(strDate: string | null | undefined): string {
  if (!strDate) return "";
  const d = new Date(strDate);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d.getDate()} ${months[d.getMonth() + 1]} ${d.getFullYear()}`;
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
  if (y === 0 && m === 0) return `${d} วัน `;
  if (y === 0)            return `${m} เดือน ${d} วัน `;
  return `${y} ปี ${m} เดือน ${d} วัน `;
}

/** Legacy `nameCompanyType($int)` — function.php L2899-2907 — string variant */
function nameCompanyType(t: string | null): { label: string; cls: string } | null {
  switch (t) {
    case "1": return { label: "Freight & Cargo", cls: "badge badge-danger badge-pill" };
    case "2": return { label: "PCS Freight",     cls: "badge badge-success badge-pill" };
    case "3": return { label: "PCS Cargo",       cls: "badge badge-warning badge-pill" };
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

/** Legacy `nameSex($data)` — function.php L3351-3358 */
function nameSex(data: string | null | undefined): string {
  switch (data) {
    case "1": return "ชาย";
    case "2": return "หญิง";
    case "3": return "LGBTQ";
    default:  return "ไม่ระบุ";
  }
}

/** Legacy `showReligion($data)` — function.php L3392-3408 */
function showReligion(data: string | null | undefined): string {
  const map: Record<string, string> = {
    "1": "พุทธ", "2": "คริสต์", "3": "อิสลาม", "4": "ฮินดู",
    "5": "ซิกข์", "6": "ยูดาห์", "7": "ไม่มีศาสนา", "8": "ศาสนาอื่น ๆ",
  };
  return data && map[data] ? map[data] : "ไม่ได้ระบุไว้";
}

/** Legacy `showMaritalStatus($data)` — function.php L3421-3437 */
function showMaritalStatus(data: string | null | undefined): string {
  const map: Record<string, string> = {
    "1": "โสด", "2": "แต่งงานแล้ว", "3": "หย่าร้าง", "4": "ม่าย",
    "5": "แยกกันอยู่", "6": "มีความสัมพันธ์", "7": "หมั้น", "8": "อื่น ๆ",
  };
  return data && map[data] ? map[data] : "ไม่ได้ระบุไว้";
}

/** Legacy `showEducationLevel($level)` — function.php L3360-3379 */
function showEducationLevel(level: string | null | undefined): string {
  const map: Record<string, string> = {
    "1": "ต่ำกว่ามัธยมศึกษา", "2": "มัธยมศึกษาตอนต้น", "3": "มัธยมศึกษาตอนปลาย",
    "4": "ปวช.", "5": "ปวท.", "6": "ปวส.", "7": "อนุปริญญา",
    "8": "ปริญญาตรี", "9": "ปริญญาโท", "10": "ปริญญาเอก",
  };
  return level && map[level] ? map[level] : "ระดับการศึกษาไม่ถูกต้อง";
}

/** Legacy `nameBank($ID)` — function.php L299-321 */
function nameBank(id: string | null | undefined): string {
  const map: Record<string, string> = {
    "1": "กรุงเทพ", "2": "กสิกรไทย", "3": "กรุงไทย", "4": "ทหารไทย", "5": "ไทยพาณิชย์",
    "6": "กรุงศรีอยุธยา", "7": "เกียรตินาคิน", "8": "ซีไอเอ็มบีไทย", "9": "ทิสโก้",
    "10": "ธนชาต", "11": "ยูโอบี", "12": "แลนด์ แอนด์ เฮาส์", "13": "ออมสิน",
    "14": "พร้อมเพย์", "15": "CIMB", "16": "ICBC",
  };
  return id && map[id] ? map[id] : "ไม่พบข้อมูล";
}

/** Legacy `checkRightsName(...)` — function.php L3023-3054.
 *  Same org-chart inlined here as in the admin-table pilot. */
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
  const dep = Number(department ?? 0);
  const s = Number(section ?? 0);
  const row = ORG_CHART.find((r) => r.companyNo === c && r.departmentNo === dep && r.sectionNo === s);
  if (row) return { departmentName: row.departmentName, sectionName: row.sectionName };
  if (adminType === "7") return { departmentName: "คนในบ้าน", sectionName: "คนในบ้าน" };
  return { departmentName: "unknown", sectionName: "unknown" };
}

/** Legacy `generateBadgeDepartment($role)` — function.php L3256-3279 */
function generateBadgeDepartment(role: string): { label: string; cls: string } {
  switch (role) {
    case "CEO": case "Manager": case "HR": case "QA & QC":
    case "Accounting": case "Marketing": case "ITDT":
      return { label: role, cls: "badge badge-danger badge-pill" };
    case "Sales Freight": case "Sales Cargo":
      return { label: role, cls: "badge badge-info badge-pill" };
    case "FREIGHT Export":
      return { label: role, cls: "badge badge-primary badge-pill" };
    case "FREIGHT Import": case "CS Purchasing":
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

/** Legacy `nameDepartmentText($data1,$data2)` — function.php L3165-3194 —
 *  returns the "key" form (CEO/HR/ITDT/Manager/Accounting/CSPurchasing/...)
 *  used for permission gates. */
function nameDepartmentText(d: string | null, c: string | null): string {
  const dep = Number(d ?? 0);
  const co  = Number(c ?? 0);
  if (co === 1) {
    switch (dep) {
      case 0: return "CEO";
      case 1: return "Manager";
      case 2: return "HR";
      case 3: return "QAAndQC";
      case 4: return "Accounting";
      case 5: return "Marketing";
      case 6: return "ITDT";
    }
  } else if (co === 2) {
    switch (dep) {
      case 1: return "SaleFreight";
      case 2: return "FreightExport";
      case 3: return "FreightImport";
    }
  } else if (co === 3) {
    switch (dep) {
      case 1: return "SaleCargo";
      case 2: return "CSPurchasing";
      case 3: return "Warehouse";
      case 5: return "Marketing";
    }
  }
  return "";
}

/** Legacy `nameSectionText($data1,$data2)` — function.php L3195-3250 */
function nameSectionText(s: string | null, c: string | null): string {
  const sec = Number(s ?? 0);
  const co  = Number(c ?? 0);
  if (co === 1) {
    const map: Record<number, string> = {
      0: "CEO", 1: "Manager", 2: "HRManager", 3: "HR", 4: "Maid",
      5: "QAManager", 6: "QA", 7: "QC", 8: "AccountingManager", 9: "AdminAccounting",
      10: "ManagerMarketing", 11: "Pricing", 12: "MarketingORCreative", 13: "GraphicOrEditing",
      14: "ITProjectManager", 15: "FrontEnd", 16: "BackEnd", 17: "FullStack", 18: "SalesAll",
    };
    return map[sec] ?? "";
  }
  return "";
}

// ============================================================================
// Row + lookup types
// ============================================================================
type AdminRow = {
  id: number;
  adminid: string;
  adminstatusa: string | null;
  adminname: string | null;
  adminlastname: string | null;
  adminnickname: string | null;
  adminemail: string | null;
  admintel: string | null;
  adminsex: string | null;
  adminbirthday: string | null;
  adminpicture: string | null;
  adminregistered: string | null;
  admintype: string | null;
  department: string | null;
  section: string | null;
  companytype: string | null;
  startdate: string | null;
  enddate: string | null;
  enddateoflogin: string | null;
  admintmp: string | null;
  adminemailorg: number | string | null;
  admintelorg: number | string | null;
  salarytype: string | null;
  salary: number | string | null;
  nationalidcard: string | null;
  expirydate: string | null;
  religion: string | null;
  nationality: string | null;
  maritalstatus: string | null;
  nationalidcardfile: string | null;
  copyhouseregistrationfile: string | null;
  resumefile: string | null;
};

type AddressRow = {
  addressno: string | null;
  district: string | null;
  amphoe: string | null;
  province: string | null;
  zipcode: string | null;
  addressnote: string | null;
};

// ============================================================================
// Page
// ============================================================================
export default async function AdminProfilePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const adminIDGet = decodeURIComponent(idParam);

  // Auth — any signed-in admin can view. The mutate-controls only render
  // when `canMutate` (legacy departmentKey == 'CEO'|'Manager'|'ITDT'|'HR').
  const { roles, user } = await requireAdmin();
  const canMutate    = roles.includes("super");
  const isCEOOrITDT  = roles.includes("super"); // narrower legacy gate (CEO/Manager/ITDT)
  const isAccounting = roles.includes("super") || roles.includes("accounting");

  const admin = createAdminClient();

  // ── Main admin row + LEFT JOIN address (admin-profile.php L256-260) ──
  // Legacy: SELECT *, a.adminID, DATE(adminBirthday), DATE(startDate), DATE(endDate)
  //         FROM tb_admin AS a LEFT JOIN tb_admin_address AS aa ON aa.adminID = a.adminID
  //         WHERE a.adminID = ?
  const [adminRes, addressRes] = await Promise.all([
    admin.from("tb_admin").select("*").eq("adminid", adminIDGet).maybeSingle<AdminRow>(),
    admin.from("tb_admin_address").select("addressno, district, amphoe, province, zipcode, addressnote").eq("adminid", adminIDGet).maybeSingle<AddressRow>(),
  ]);
  if (!adminRes.data) notFound();
  const rowMain = adminRes.data;
  const addr = addressRes.data;

  // Self-edit gate — when the signed-in admin IS the target admin
  // (the legacy `$adminIDData == $adminID` check). Pacred's admins use
  // Supabase auth (UUID) instead of the legacy `adminid` (string code) —
  // there's no direct mapping. The closest equivalent: lookup the
  // signed-in user's `admins.adminid` mirror. For the pilot we approximate
  // as "the signed-in admin's email matches the row's email", which
  // covers the common case (own-profile viewing).
  const isSelf =
    (user.email !== null && rowMain.adminemail !== null &&
      user.email.toLowerCase() === rowMain.adminemail.toLowerCase());

  // Org-channel current value lookups (admin-profile.php L989-1024) ──
  const [emailOrgRes, telOrgRes, lineOrgRes, wechatOrgRes,
         orgEmailListRes, orgTelListRes, orgLineListRes, orgWechatListRes,
         bankAccountsRes, educationRes, educationLatestRes,
         interpreterCommRes] = await Promise.all([
    // Current org-link ships (DELETE+INSERT pattern — only one row per admin)
    admin.from("tb_org_email_ships").select("oeid").eq("adminid", adminIDGet).maybeSingle(),
    admin.from("tb_org_tell_ships").select("otid").eq("adminid", adminIDGet).maybeSingle(),
    admin.from("tb_org_line_ships").select("olid").eq("adminid", adminIDGet).maybeSingle(),
    admin.from("tb_org_wechat_ships").select("owcid").eq("adminid", adminIDGet).maybeSingle(),
    // Dropdown options for the edit-profile modal (L678, L695, L714, L731)
    admin.from("tb_organization_email").select("id, email").order("id"),
    admin.from("tb_organization_tell").select("id, tell").order("id"),
    admin.from("tb_organization_line").select("id, line").order("id"),
    admin.from("tb_organization_wechat").select("id, wechat").order("id"),
    // Bank accounts (L1226)
    admin.from("tb_account_pcs").select("id, bankname, accountnumber, accountname").eq("adminid", adminIDGet).order("id"),
    // Education history (L1328 — sorted by graduateYear DESC)
    admin.from("tb_education_background").select("id, educationlevel, institution, faculty, educationdepartment, graduateyear, gpa").eq("adminid", adminIDGet).order("graduateyear", { ascending: false, nullsFirst: false }),
    // Latest education for the summary card (L1072 — ORDER BY graduateYear, id DESC LIMIT 1)
    admin.from("tb_education_background").select("educationlevel, institution, faculty, educationdepartment, graduateyear").eq("adminid", adminIDGet).order("graduateyear", { ascending: true, nullsFirst: true }).order("id", { ascending: false }).limit(1).maybeSingle(),
    // Interpreter commission (L366)
    admin.from("tb_set_comm_interpreter").select("percom").eq("adminid", adminIDGet).maybeSingle(),
  ]);

  // Resolve organisation labels via map (legacy did LEFT JOIN — same shape)
  const orgEmailOpts  = (orgEmailListRes.data  ?? []) as Array<{ id: number; email: string }>;
  const orgTelOpts    = (orgTelListRes.data    ?? []) as Array<{ id: number; tell: string }>;
  const orgLineOpts   = (orgLineListRes.data   ?? []) as Array<{ id: number; line: string }>;
  const orgWechatOpts = (orgWechatListRes.data ?? []) as Array<{ id: number; wechat: string }>;
  const currentEmailOrg  = (emailOrgRes.data  as { oeid:  number } | null)?.oeid  ?? null;
  const currentTelOrg    = (telOrgRes.data    as { otid:  number } | null)?.otid  ?? null;
  const currentLineOrg   = (lineOrgRes.data   as { olid:  number } | null)?.olid  ?? null;
  const currentWechatOrg = (wechatOrgRes.data as { owcid: number } | null)?.owcid ?? null;
  const currentEmailOrgLabel = orgEmailOpts.find((o)  => o.id === currentEmailOrg)?.email   ?? "";
  const currentTelOrgLabel   = orgTelOpts.find((o)    => o.id === currentTelOrg)?.tell      ?? "";
  const bankAccounts = (bankAccountsRes.data ?? []) as Array<{ id: number; bankname: string | null; accountnumber: string | null; accountname: string | null }>;
  const educationRows = (educationRes.data ?? []) as Array<{ id: number; educationlevel: string | null; institution: string | null; faculty: string | null; educationdepartment: string | null; graduateyear: number | null; gpa: number | null }>;
  const educationLatest = educationLatestRes.data as { educationlevel: string | null; institution: string | null; faculty: string | null; educationdepartment: string | null; graduateyear: number | null } | null;
  const perCom = ((interpreterCommRes.data as { percom: number | null } | null)?.percom ?? 0);

  // Derived display values (admin-profile.php L284-288 + L833-843)
  const rights = checkRightsName(rowMain.companytype, rowMain.department, rowMain.section, rowMain.admintype);
  const departmentKeyData = nameDepartmentText(rowMain.department, rowMain.companytype);
  const sectionKeyData    = nameSectionText(rowMain.section, rowMain.companytype);
  const companyBadge = nameCompanyType(rowMain.companytype);
  const typeBadge    = nameAdminType(rowMain.admintype);
  const deptBadge    = generateBadgeDepartment(rights.departmentName);
  const sectBadge    = generateBadgeSection(rights.sectionName);
  const isTrainee    = rowMain.admintype === "2" || rowMain.admintype === "3" || rowMain.admintype === "4";

  // Legacy L364: interpreter-commission gate — show the cog only when
  // (target dept is CSPurchasing OR adminID = 'admin_jeen') AND viewer is CEO/Manager/ITDT.
  const showInterpreterCog =
    (departmentKeyData === "CSPurchasing" || rowMain.adminid === "admin_jeen") && isCEOOrITDT;

  // Legacy L917: bonus card visible only for SaleCargo / SalesAll.
  const showBonusCard = departmentKeyData === "SaleCargo" || sectionKeyData === "SalesAll";

  // adminPicture path — defaults to user.jpg per the customer-images
  // backfill convention (pilot §9 gotcha #6).
  const adminPicture = (rowMain.adminpicture && rowMain.adminpicture.trim() !== "")
    ? rowMain.adminpicture : "user.jpg";
  const adminPictureUrl = `/legacy/pcs/admin/images/${adminPicture}`;
  // Cover image — legacy genCoverAdminProfile() picks 1..9 random; we pick a
  // deterministic value (hash of the adminID) so SSR stays stable.
  const coverIdx = (rowMain.adminid.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 9) + 1;
  const coverUrl = `/legacy/pcs/admin/images/artboard-cover-admin/${coverIdx}.jpg`;

  // Page-edit gates (mirrors the PHP `if` chains around each section)
  const showAddBankSection      = isSelf || isAccounting;
  const showEducationListSection = isSelf || isAccounting;
  // The "edit profile" pencil-icon link is visible when self OR (CEO/Manager/ITDT/HR).
  const showEditProfile = isSelf || canMutate;
  // The "set-furlough" cog is CEO/Manager/ITDT only (legacy L407).
  const showFurlough = isCEOOrITDT;
  // The "show personal stuff" (id-card, files) gate (legacy L1109).
  const showPersonalIDCard = isSelf || isAccounting;

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-table.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-profile.css" />

      {/* BEGIN: Content — admin-profile.php L351-1369 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb (mirrors admin-table pilot — legacy uses
              include/header.php's breadcrumbAdmin) */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item"><Link href="/admin">หน้าแรก</Link></li>
                    <li className="breadcrumb-item"><Link href="/admin/admins">รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล</Link></li>
                    <li className="breadcrumb-item">
                      โปรไฟล์ {rowMain.adminname} {rowMain.adminlastname}
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* ─────────── Profile header card — L355-1146 ─────────── */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        {/* Cover image + action cogs (L361-756) */}
                        <div
                          className="text-center pb-05"
                          style={{
                            backgroundImage: `url('${coverUrl}')`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                            margin: "-22px -22px -60px -22px",
                          }}
                        >
                          <ul className="list-inline dl text-right p-1">
                            {/* set-comm-interpreter cog (L363-404) — handled in client */}
                            {showInterpreterCog && (
                              <li className="list-inline-item">
                                <AdminProfileClient.SetCommCog
                                  adminId={rowMain.adminid}
                                  currentPerCom={perCom}
                                />
                              </li>
                            )}
                            {/* set-furlough cog (L407-444) */}
                            {showFurlough && (
                              <li className="list-inline-item">
                                <AdminProfileClient.SetFurloughCog
                                  adminId={rowMain.adminid}
                                />
                              </li>
                            )}
                            {/* edit-profile pencil (L448-754) */}
                            {showEditProfile && (
                              <li className="list-inline-item">
                                <AdminProfileClient.EditProfileButton
                                  adminId={rowMain.adminid}
                                  showJobPosition={canMutate}
                                  initialValues={{
                                    admin_tel:        rowMain.admintel ?? "",
                                    admin_email:      rowMain.adminemail ?? "",
                                    admin_name:       rowMain.adminname ?? "",
                                    admin_last_name:  rowMain.adminlastname ?? "",
                                    admin_nickname:   rowMain.adminnickname ?? "",
                                    admin_sex:        rowMain.adminsex ?? "",
                                    marital_status:   rowMain.maritalstatus ?? "",
                                    religion:         rowMain.religion ?? "",
                                    nationality:      rowMain.nationality ?? "",
                                    national_id_card: rowMain.nationalidcard ?? "",
                                    admin_birthday:   rowMain.adminbirthday ? rowMain.adminbirthday.slice(0, 10) : "",
                                    expiry_date:      rowMain.expirydate ? rowMain.expirydate.slice(0, 10) : "",
                                    address_no:       addr?.addressno ?? "",
                                    district:         addr?.district ?? "",
                                    amphoe:           addr?.amphoe ?? "",
                                    province:         addr?.province ?? "",
                                    zipcode:          addr?.zipcode ?? "",
                                    address_note:     addr?.addressnote ?? "",
                                    company_type:     rowMain.companytype ?? "",
                                    admin_type:       rowMain.admintype ?? "",
                                    admin_tmp:        rowMain.admintmp ?? "",
                                    salary_type:      rowMain.salarytype ?? "",
                                    department:       rowMain.department ?? "",
                                    section:          rowMain.section ?? "",
                                    start_date:       rowMain.startdate ? rowMain.startdate.slice(0, 10) : "",
                                    end_date:         rowMain.enddate ? rowMain.enddate.slice(0, 10) : "",
                                    salary:           rowMain.salary != null ? String(rowMain.salary) : "",
                                    admin_email_org:  currentEmailOrg != null ? String(currentEmailOrg) : "",
                                    admin_tel_org:    currentTelOrg != null ? String(currentTelOrg) : "",
                                    admin_line_org:   currentLineOrg != null ? String(currentLineOrg) : "",
                                    admin_wechat_org: currentWechatOrg != null ? String(currentWechatOrg) : "",
                                  }}
                                  orgEmailOpts={orgEmailOpts}
                                  orgTelOpts={orgTelOpts}
                                  orgLineOpts={orgLineOpts}
                                  orgWechatOpts={orgWechatOpts}
                                />
                              </li>
                            )}
                          </ul>

                          {/* Avatar + identity stack (L757-844) */}
                          <div className="text-center">
                            <a className="image-popup-vertical-fit el-link" href={adminPictureUrl}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={adminPictureUrl} alt="profile" className="rounded-circle" width={150} />
                            </a>
                            {/* The "edit profile picture" button (L762-816) is NOT
                                transcribed in this pilot — see file-header
                                "Not transcribed" note. */}
                            <h2 className="pt-1">
                              <span className="d-inline-block badge-info badge-pill pl-1 pr-1">
                                {rowMain.adminname} {rowMain.adminlastname}
                                {rowMain.adminnickname ? ` (${rowMain.adminnickname})` : ""}
                              </span>
                            </h2>
                            <h5 className="d-inline-block badge-info badge-pill pl-1 pr-1">
                              <span>{rowMain.adminid}</span>
                              {rowMain.admintmp === "2" && " (พักงานชั่วคราว ปิดรับออเดอร์)"}
                            </h5>
                            <h5 className="profile-badge">
                              {companyBadge && <span className={companyBadge.cls}>{companyBadge.label}</span>}{" "}
                              {typeBadge    && <span className={typeBadge.cls}>{typeBadge.label}</span>}
                              <br />
                              <span className={deptBadge.cls}>{deptBadge.label}</span>{" "}
                              <span className={sectBadge.cls}>{sectBadge.label}</span>
                            </h5>
                          </div>
                        </div>

                        {/* KPI cards row (L847-944) — only for self/CEO/Manager/Accounting/ITDT */}
                        {(isSelf || isAccounting) ? (
                          <div className="row">
                            <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                              <a href="#"><div className="card pull-up"><div className="card-content"><div className="card-body">
                                <div className="media d-flex">
                                  <div className="media-body text-left">
                                    <h2 className="success"><span className="tam-counter" data-count={0}>0</span><span className="font-14"> บาท</span></h2>
                                    <h4>กระเป๋าสตางค์สำรองจ่าย</h4>
                                  </div>
                                  <div><i className="icon-wallet success font-large-2 float-right"></i></div>
                                </div>
                                <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                                  <div className="progress-bar bg-gradient-x-success" role="progressbar" style={{ width: "100%" }} aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}></div>
                                </div>
                              </div></div></div></a>
                            </div>
                            <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                              <a href="#"><div className="card pull-up"><div className="card-content"><div className="card-body">
                                <div className="media d-flex">
                                  <div className="media-body text-left">
                                    <h2 className="success"><span className="tam-counter" data-count={0}>0</span><span className="font-14"></span></h2>
                                    <h4>KPI ที่ได้</h4>
                                  </div>
                                  <div><i className="icon-wallet success font-large-2 float-right"></i></div>
                                </div>
                                <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                                  <div className="progress-bar bg-gradient-x-success" role="progressbar" style={{ width: "100%" }} aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}></div>
                                </div>
                              </div></div></div></a>
                            </div>
                            <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                              <a href="#"><div className="card pull-up"><div className="card-content"><div className="card-body">
                                <div className="media d-flex">
                                  <div className="media-body text-left">
                                    <h2 className="success"><span className="tam-counter" data-count={0}>0</span><span className="font-14"></span></h2>
                                    <h4>วันลาที่เหลือ</h4>
                                  </div>
                                  <div><i className="icon-wallet success font-large-2 float-right"></i></div>
                                </div>
                                <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                                  <div className="progress-bar bg-gradient-x-success" role="progressbar" style={{ width: "100%" }} aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}></div>
                                </div>
                              </div></div></div></a>
                            </div>
                            {showBonusCard && (
                              <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                                <a href="#"><div className="card pull-up"><div className="card-content"><div className="card-body">
                                  <div className="media d-flex">
                                    <div className="media-body text-left">
                                      <h2 className="success"><span className="tam-counter" data-count={0}>0</span><span className="font-14"></span></h2>
                                      <h4>โบนัสที่ได้</h4>
                                    </div>
                                    <div><i className="icon-wallet success font-large-2 float-right"></i></div>
                                  </div>
                                  <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                                    <div className="progress-bar bg-gradient-x-success" role="progressbar" style={{ width: "100%" }} aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}></div>
                                  </div>
                                </div></div></div></a>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="pt-5 mb-1"></div>
                        )}

                        {/* General info two-column row (L950-1141) */}
                        <hr className="mt-0" />
                        <h3>ข้อมูลทั่วไป</h3>
                        <hr />
                        <div className="row text-profile-group">
                          {/* Left column (L954-1067) */}
                          <div className="col-12 col-md-6">
                            <div className="row">
                              <div className="col-12 col-md-6"><span>วันเกิด : {DateThai2(rowMain.adminbirthday)}</span></div>
                              <div className="col-12 col-md-6"><span>อายุ : {diffDateNow(rowMain.adminbirthday)}</span></div>
                            </div>
                            <div className="row">
                              <div className="col-12 col-md-6"><span>ศาสนา : {showReligion(rowMain.religion)} </span></div>
                              <div className="col-12 col-md-6"><span>สัญชาติ : {rowMain.nationality ?? ""} </span></div>
                            </div>
                            <div className="row">
                              <div className="col-12 col-md-6"><span>สถานะภาพ : {showMaritalStatus(rowMain.maritalstatus)} </span></div>
                              <div className="col-12 col-md-6"><span>เพศ : {nameSex(rowMain.adminsex)}</span></div>
                            </div>
                            <div className="row">
                              <div className="col-12 col-md-6"><span>อีเมลส่วนตัว : {rowMain.adminemail ?? ""}</span></div>
                              <div className="col-12 col-md-6">
                                <span>อีเมลในองค์กร : {currentEmailOrgLabel}</span>
                              </div>
                            </div>
                            <div className="row">
                              <div className="col-12 col-md-6"><span>เบอร์โทรส่วนตัว : {rowMain.admintel ?? ""}</span></div>
                              <div className="col-12 col-md-6">
                                <span>เบอร์โทรในองค์กร : {currentTelOrgLabel}</span>
                              </div>
                            </div>
                            {isTrainee && (
                              <>
                                <div className="row">
                                  <div className="col-12 col-md-6"><span>ฝึกงานมาแล้ว : {diffDateNow(rowMain.startdate)}</span></div>
                                  <div className="col-12 col-md-6"><span>เหลือเวลาฝึกงาน : {diffDateNow(rowMain.enddate)}</span></div>
                                </div>
                                <div className="row">
                                  <div className="col-12 col-md-6"><span>วันที่เริ่มต้นฝึกงาน : {rowMain.startdate ? rowMain.startdate.slice(0, 10) : ""}</span></div>
                                  <div className="col-12 col-md-6"><span>วันที่สิ้นสุดฝึกงาน : {rowMain.enddate ? rowMain.enddate.slice(0, 10) : ""}</span></div>
                                </div>
                              </>
                            )}
                            <hr />
                            <div className="row">
                              <div className="col-12">
                                <span>ที่อยู่ปัจจุบัน : {addr ? (
                                  <>
                                    {addr.addressno ?? ""} ตำบล/แขวง {addr.district ?? ""} อำเภอ/เขต {addr.amphoe ?? ""} จังหวัด {addr.province ?? ""} {addr.zipcode ?? ""}
                                    {addr.addressnote ? ` (${addr.addressnote})` : ""}
                                  </>
                                ) : null}</span>
                              </div>
                            </div>
                          </div>

                          {/* Right column — education summary + personal ID (L1068-1140) */}
                          <div className="col-12 col-md-6">
                            <span className="text-h-profile">ประวัติการศึกษา</span>
                            {educationLatest ? (
                              <>
                                <hr />
                                <div className="hs-group">
                                  <div className="row">
                                    <div className="col-12 col-md-6"><span>ระดับการศึกษา : {showEducationLevel(educationLatest.educationlevel)}</span></div>
                                    <div className="col-12 col-md-6"><span>สถานศึกษา : {educationLatest.institution ?? ""}</span></div>
                                  </div>
                                  <div className="row">
                                    <div className="col-12 col-md-6"><span>คณะ : {educationLatest.faculty ?? ""}</span></div>
                                    <div className="col-12 col-md-6"><span>สาขา : {educationLatest.educationdepartment ?? ""}</span></div>
                                  </div>
                                  <div className="row">
                                    <div className="col-12 col-md-6"><span>ปีที่จบการศึกษา : {educationLatest.graduateyear ?? ""}</span></div>
                                    <div className="col-12 col-md-6"></div>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <><hr /><span>ไม่ระบุประวัติการศึกษา</span></>
                            )}

                            {showPersonalIDCard && (
                              <>
                                <hr />
                                <span className="text-h-profile">ข้อมูลส่วนตัว</span>
                                <hr />
                                <div className="hs-group">
                                  <div className="row">
                                    <div className="col-12 col-md-6"><span>เลขบัตรประชาชน : {rowMain.nationalidcard ?? ""}</span></div>
                                    <div className="col-12 col-md-6">
                                      <span>ไฟล์บัตรประชาชน : {rowMain.nationalidcardfile
                                        ? <a href={`/legacy/pcs/admin/store/${rowMain.nationalidcardfile}`}>ดูไฟล์</a>
                                        : "ยังไม่แนบไฟล์"}</span>
                                    </div>
                                  </div>
                                  <div className="row">
                                    <div className="col-12 col-md-6"><span>วันที่หมดอายุบัตรประขาชน : {DateThai2(rowMain.expirydate)}</span></div>
                                    <div className="col-12 col-md-6">
                                      <span>ไฟล์สำเนาทะเบียนบ้าน : {rowMain.copyhouseregistrationfile
                                        ? <a href={`/legacy/pcs/admin/store/${rowMain.copyhouseregistrationfile}`}>ดูไฟล์</a>
                                        : "ยังไม่แนบไฟล์"}</span>
                                    </div>
                                  </div>
                                  <div className="row">
                                    <div className="col-12 col-md-6">
                                      <span>ไฟล์ resume : {rowMain.resumefile
                                        ? <a href={`/legacy/pcs/admin/store/${rowMain.resumefile}`}>ดูไฟล์</a>
                                        : "ยังไม่แนบไฟล์"}</span>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ─────────── Bank accounts card — L1148-1261 ─────────── */}
            {showAddBankSection && (
              <section>
                <div className="row">
                  <div className="col-md-12 col-sm-12">
                    <div className="card">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="row">
                            <div className="col-md-6"><h3>รายชื่อบัญชีธนาคารในระบบ</h3></div>
                            <div className="col-md-6">
                              <div className="float-md-right">
                                <div className="text-center text-md-right mb-1">
                                  <AdminProfileClient.AddBankAccountButton adminId={rowMain.adminid} />
                                </div>
                              </div>
                            </div>
                            <div className="col-md-12">
                              <div className="table-responsive">
                                <table id="tableAccAdmin" className="table display table-bordered table-striped dataTable no-footer dtr-inline header-fixed">
                                  <thead>
                                    <tr className="text-center">
                                      <th>ลำดับ</th>
                                      <th>ชื่อธนาคาร</th>
                                      <th>เลขที่บัญชี</th>
                                      <th>ชื่อบัญชี</th>
                                      <th>ตัวเลือก</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bankAccounts.map((row, idx) => (
                                      <tr key={row.id} className={`accID-${row.id}`}>
                                        <td>{idx + 1}</td>
                                        <td>{nameBank(row.bankname)}</td>
                                        <td>{row.accountnumber ?? ""}</td>
                                        <td>{row.accountname ?? ""}</td>
                                        <td className="text-center">
                                          <AdminProfileClient.DeleteBankButton accountId={row.id} adminId={rowMain.adminid} />
                                        </td>
                                      </tr>
                                    ))}
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
              </section>
            )}

            {/* ─────────── Education history card — L1262-1366 ─────────── */}
            {showEducationListSection && (
              <section>
                <div className="row">
                  <div className="col-md-12 col-sm-12">
                    <div className="card">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="row">
                            <div className="col-md-6"><h3>ประวัติการศึกษาทั้งหมด</h3></div>
                            <div className="col-md-6">
                              <div className="float-md-right">
                                <div className="text-center text-md-right mb-1">
                                  <AdminProfileClient.AddEducationButton adminId={rowMain.adminid} />
                                </div>
                              </div>
                            </div>
                            <div className="col-md-12">
                              <div className="table-responsive">
                                <table id="tableEducation" className="table display table-bordered table-striped dataTable no-footer dtr-inline header-fixed">
                                  <thead>
                                    <tr className="text-center">
                                      <th>ลำดับ</th>
                                      <th>ระดับการศึกษา</th>
                                      <th>สถานศึกษา</th>
                                      <th>คณะ</th>
                                      <th>สาขา</th>
                                      <th>ปีที่จบการศึกษา</th>
                                      <th>เกรด</th>
                                      <th>ตัวเลือก</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {educationRows.map((row, idx) => (
                                      <tr key={row.id} className={`educationID-${row.id}`}>
                                        <td>{idx + 1}</td>
                                        <td>{showEducationLevel(row.educationlevel)}</td>
                                        <td>{row.institution ?? ""}</td>
                                        <td>{row.faculty ?? ""}</td>
                                        <td>{row.educationdepartment ?? ""}</td>
                                        <td>{row.graduateyear ?? ""}</td>
                                        <td>{row.gpa ?? ""}</td>
                                        <td className="text-center">
                                          <AdminProfileClient.DeleteEducationButton educationId={row.id} adminId={rowMain.adminid} />
                                        </td>
                                      </tr>
                                    ))}
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
              </section>
            )}
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
