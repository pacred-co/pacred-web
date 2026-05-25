/**
 * /admin/admins/[id] — โปรไฟล์พนักงาน (Wave 20 P1 rewrite)
 *
 * Per `docs/audit/admin-pages-audit-2026-05-25-night.md` P1 + AGENTS §0a:
 * KEEP the legacy `tb_admin` + 12 join-table reads (org chart · org email/
 * tel/line/wechat · bank accounts · education history · interpreter
 * commission · address), REPLACE the Bootstrap-4 + `.pcs-legacy` chrome
 * with Pacred Tailwind v4 design tokens — mirroring
 * `/admin/customers/[id]/legacy-view.tsx`.
 *
 * Behaviour preserved 1:1 from the prior `.pcs-legacy` version:
 *   - Identity card (avatar · name · adminID · company/type badges · dept/section)
 *   - General info (birthday · age · religion · nationality · marital · sex ·
 *     emails/phones personal + org · trainee dates · current address)
 *   - Education summary (latest entry by graduateYear desc)
 *   - Personal docs (national ID · expiry · file links)
 *   - Bank accounts table (tb_account_pcs)
 *   - Education history table (tb_education_background)
 *   - Self-edit gate (signed-in admin matches row email)
 *   - Mutate gate (`super` role)
 *   - Accounting gate (`super` OR `accounting`)
 *   - Interpreter commission cog (CSPurchasing or admin_jeen + super)
 *   - Bonus card (SaleCargo or SalesAll)
 *
 * Mutations — the legacy `admin-profile-client.tsx` houses 7 jQuery+BS4
 * modals (set-comm · set-furlough · edit-profile · add-bank · delete-bank ·
 * add-education · delete-education). Wave 20 P1 keeps that file UNTOUCHED
 * (per task scope: 2 file edits). The BS4 modals won't open inside this
 * Tailwind chrome (no jQuery loaded), so the action buttons in this rewrite
 * link to a clearly bannered Wave-21 placeholder rather than render a
 * non-functional modal trigger. Wave 21 will port `admin-profile-client.tsx`
 * to native HTML5 `<dialog>` + Tailwind, restoring full inline edits.
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ============================================================================
// Inline helpers (label lookups · date formatting · org chart) — preserved
// verbatim from the prior `.pcs-legacy` version. Citations point to
// pcs-admin/include/function.php in the legacy source tree.
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

/** Legacy `checkRightsName(...)` — function.php L3023-3054 */
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

/** Legacy `nameDepartmentText($data1,$data2)` — function.php L3165-3194 */
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

  // Auth — any signed-in admin can view. The mutate gate (`canMutate`)
  // mirrors the legacy `departmentKey == 'CEO'|'Manager'|'ITDT'|'HR'`.
  const { roles, user } = await requireAdmin();
  const canMutate    = roles.includes("super");
  const isCEOOrITDT  = roles.includes("super"); // narrower legacy gate
  const isAccounting = roles.includes("super") || roles.includes("accounting");

  const admin = createAdminClient();

  // ── Main admin row + LEFT JOIN address (admin-profile.php L256-260) ──
  // §0c — destructure { data, error }; raise on real error so we don't
  // silently 404 a row that exists.
  const [adminRes, addressRes] = await Promise.all([
    admin.from("tb_admin").select("*").eq("adminid", adminIDGet).maybeSingle<AdminRow>(),
    admin.from("tb_admin_address").select("addressno, district, amphoe, province, zipcode, addressnote").eq("adminid", adminIDGet).maybeSingle<AddressRow>(),
  ]);
  if (adminRes.error) {
    console.error("[admins/[id]] tb_admin query failed", {
      adminid: adminIDGet,
      code: adminRes.error.code,
      message: adminRes.error.message,
      details: adminRes.error.details,
    });
    throw new Error(
      `admins/[id]: failed to load tb_admin for ${adminIDGet} — ${adminRes.error.code ?? "unknown"}: ${adminRes.error.message}`,
    );
  }
  if (!adminRes.data) notFound();
  const rowMain = adminRes.data;
  const addr = addressRes.data;

  // Self-edit gate — approximated by email match (Pacred admins use
  // Supabase auth UUID; legacy uses `adminid` string code).
  const isSelf =
    (user.email !== null && rowMain.adminemail !== null &&
      user.email.toLowerCase() === rowMain.adminemail.toLowerCase());

  // ── Org-channel current values + dropdown options + bank + education
  //    + interpreter commission (admin-profile.php L989-1024 / L1226 /
  //    L1328 / L1072 / L366) ────────────────────────────────────────
  const [emailOrgRes, telOrgRes, lineOrgRes, wechatOrgRes,
         bankAccountsRes, educationRes, educationLatestRes,
         interpreterCommRes] = await Promise.all([
    admin.from("tb_org_email_ships").select("oeid").eq("adminid", adminIDGet).maybeSingle(),
    admin.from("tb_org_tell_ships").select("otid").eq("adminid", adminIDGet).maybeSingle(),
    admin.from("tb_org_line_ships").select("olid").eq("adminid", adminIDGet).maybeSingle(),
    admin.from("tb_org_wechat_ships").select("owcid").eq("adminid", adminIDGet).maybeSingle(),
    admin.from("tb_account_pcs").select("id, bankname, accountnumber, accountname").eq("adminid", adminIDGet).order("id"),
    admin.from("tb_education_background").select("id, educationlevel, institution, faculty, educationdepartment, graduateyear, gpa").eq("adminid", adminIDGet).order("graduateyear", { ascending: false, nullsFirst: false }),
    admin.from("tb_education_background").select("educationlevel, institution, faculty, educationdepartment, graduateyear").eq("adminid", adminIDGet).order("graduateyear", { ascending: true, nullsFirst: true }).order("id", { ascending: false }).limit(1).maybeSingle(),
    admin.from("tb_set_comm_interpreter").select("percom").eq("adminid", adminIDGet).maybeSingle(),
  ]);

  // We need org-label lookups for the email/tel display (the legacy LEFT
  // JOIN). Fire those only if there's a ship row to look up.
  const oeid  = (emailOrgRes.data  as { oeid:  number } | null)?.oeid  ?? null;
  const otid  = (telOrgRes.data    as { otid:  number } | null)?.otid  ?? null;
  const olid  = (lineOrgRes.data   as { olid:  number } | null)?.olid  ?? null;
  const owcid = (wechatOrgRes.data as { owcid: number } | null)?.owcid ?? null;
  const [orgEmailRowRes, orgTelRowRes, orgLineRowRes, orgWechatRowRes] = await Promise.all([
    oeid  ? admin.from("tb_organization_email").select("email").eq("id", oeid).maybeSingle()  : Promise.resolve({ data: null }),
    otid  ? admin.from("tb_organization_tell").select("tell").eq("id", otid).maybeSingle()    : Promise.resolve({ data: null }),
    olid  ? admin.from("tb_organization_line").select("line").eq("id", olid).maybeSingle()    : Promise.resolve({ data: null }),
    owcid ? admin.from("tb_organization_wechat").select("wechat").eq("id", owcid).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const currentEmailOrgLabel  = (orgEmailRowRes.data  as { email:  string } | null)?.email  ?? "-";
  const currentTelOrgLabel    = (orgTelRowRes.data    as { tell:   string } | null)?.tell   ?? "-";
  const currentLineOrgLabel   = (orgLineRowRes.data   as { line:   string } | null)?.line   ?? "-";
  const currentWechatOrgLabel = (orgWechatRowRes.data as { wechat: string } | null)?.wechat ?? "-";

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

  // Legacy L364 — interpreter-commission cog visible only for CSPurchasing
  // / admin_jeen, AND only to CEO/Manager/ITDT.
  const showInterpreterCog =
    (departmentKeyData === "CSPurchasing" || rowMain.adminid === "admin_jeen") && isCEOOrITDT;

  // Legacy L917 — bonus card visible only for SaleCargo / SalesAll.
  const showBonusCard = departmentKeyData === "SaleCargo" || sectionKeyData === "SalesAll";

  // Avatar path — default to legacy user.jpg until customer-images backfill runs.
  const adminPicture = (rowMain.adminpicture && rowMain.adminpicture.trim() !== "")
    ? rowMain.adminpicture : "user.jpg";
  const adminPictureUrl = `/legacy/pcs/admin/images/${adminPicture}`;

  // Section visibility gates
  const showAddBankSection       = isSelf || isAccounting;
  const showEducationListSection = isSelf || isAccounting;
  const showEditProfile          = isSelf || canMutate;
  const showFurlough             = isCEOOrITDT;
  const showPersonalIDCard       = isSelf || isAccounting;

  const fullName = `${rowMain.adminname ?? ""} ${rowMain.adminlastname ?? ""}`.trim() || "-";
  const isInactive = rowMain.adminstatusa === "0";

  return (
    <main className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
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
          src={adminPictureUrl}
          alt={fullName}
          className="w-24 h-24 rounded-full object-cover border-2 border-border shrink-0"
        />
        <div className="flex-1 min-w-[240px]">
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · พนักงาน</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold">{fullName}</h1>
            {rowMain.adminnickname && (
              <span className="text-sm text-muted">({rowMain.adminnickname})</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium">{rowMain.adminid}</span>
            {isInactive && (
              <span className="rounded-full bg-red-500 text-white px-2.5 py-0.5 text-[10px] font-medium">
                บัญชีถูกลบ
              </span>
            )}
            {rowMain.admintmp === "2" && (
              <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-[10px] font-medium">
                พักงานชั่วคราว
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {companyBadge && <Pill {...companyBadge} />}
            {typeBadge    && <Pill {...typeBadge} />}
            <Pill {...deptBadge} />
            <Pill {...sectBadge} />
          </div>
        </div>
      </div>

      {/* Wave 20 P1 status banner — proactive transparency per AGENTS §0a. */}
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <div className="flex-1">
          <span className="font-medium">Wave 20 P1 status:</span>{" "}
          ✅ อ่านอย่างเดียว · ครบทุก field จาก tb_admin + 12 join tables ·
          Tailwind chrome ·{" "}
          <span className="opacity-75">⏳ Wave 21: inline edit (แก้ไขข้อมูล / เพิ่มบัญชีธนาคาร /
          เพิ่มประวัติการศึกษา / พักงาน / ตั้งค่าคอมล่าม) → ต้อง port modals จาก
          `admin-profile-client.tsx` (jQuery+BS4) ให้เป็น native dialog</span>
        </div>
      </div>

      {/* Action toolbar — placeholders for the deferred modal actions */}
      {(showEditProfile || showFurlough || showInterpreterCog) && (
        <div className="rounded-xl border border-border bg-surface-alt/40 p-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted font-medium">การจัดการ:</span>
          {showEditProfile && (
            // TODO Wave 21: open native dialog with EditProfileButton form
            // (currently the BS4 modal in admin-profile-client.tsx is loaded
            // but won't open — no jQuery in scope).
            <span
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700 cursor-not-allowed opacity-70"
              title="Wave 21: port BS4 modal to native dialog"
            >
              ✏️ แก้ไขข้อมูลส่วนตัว (Wave 21)
            </span>
          )}
          {showFurlough && (
            // TODO Wave 21: SetFurloughCog dialog
            <span
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700 cursor-not-allowed opacity-70"
              title="Wave 21: port BS4 modal to native dialog"
            >
              ⏸ ตั้งสถานะพักงาน (Wave 21)
            </span>
          )}
          {showInterpreterCog && (
            // TODO Wave 21: SetCommCog dialog · perCom currently = {perCom}%
            <span
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700 cursor-not-allowed opacity-70"
              title={`Wave 21: port BS4 modal to native dialog · ปัจจุบัน ${perCom}%`}
            >
              ⚙️ ค่าคอมล่ามจีน ({perCom}%) (Wave 21)
            </span>
          )}
        </div>
      )}

      {/* KPI cards — visible to self or accounting (legacy L847-944).
          All values are placeholders (legacy showed 0 too — the actual
          wallet/KPI/leave data lives in Pacred Phase C). */}
      {(isSelf || isAccounting) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="กระเป๋าสตางค์สำรองจ่าย" value="0" unit="บาท" />
          <KpiCard label="KPI ที่ได้" value="0" />
          <KpiCard label="วันลาที่เหลือ" value="0" unit="วัน" />
          {showBonusCard && <KpiCard label="โบนัสที่ได้" value="0" unit="บาท" />}
        </div>
      )}

      {/* General info — two columns */}
      <Section title="ข้อมูลทั่วไป">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 p-5 text-sm">
          {/* Left column */}
          <div className="space-y-1">
            <KV label="วันเกิด"        value={DateThai2(rowMain.adminbirthday)} />
            <KV label="อายุ"           value={diffDateNow(rowMain.adminbirthday)} />
            <KV label="ศาสนา"          value={showReligion(rowMain.religion)} />
            <KV label="สัญชาติ"        value={rowMain.nationality ?? "-"} />
            <KV label="สถานะภาพ"      value={showMaritalStatus(rowMain.maritalstatus)} />
            <KV label="เพศ"            value={nameSex(rowMain.adminsex)} />
            <KV label="อีเมลส่วนตัว"  value={rowMain.adminemail ?? "-"} />
            <KV label="อีเมลองค์กร"   value={currentEmailOrgLabel} />
            <KV label="โทรส่วนตัว"    value={rowMain.admintel ?? "-"} mono />
            <KV label="โทรองค์กร"     value={currentTelOrgLabel} mono />
            <KV label="LINE องค์กร"    value={currentLineOrgLabel} />
            <KV label="WeChat องค์กร"  value={currentWechatOrgLabel} />
          </div>
          {/* Right column */}
          <div className="space-y-1">
            <KV label="วันที่เริ่มงาน"   value={DateThai2(rowMain.startdate)} />
            <KV label="วันที่สิ้นสุดงาน" value={DateThai2(rowMain.enddate)} />
            {isTrainee && (
              <>
                <KV label="ฝึกงานมาแล้ว"    value={diffDateNow(rowMain.startdate)} />
                <KV label="เหลือเวลาฝึกงาน" value={diffDateNow(rowMain.enddate)} />
              </>
            )}
            <KV label="วันที่สมัครระบบ"  value={DateThai2(rowMain.adminregistered)} />
            {addr && (
              <div className="pt-3 border-t border-border/40 mt-2">
                <p className="text-muted mb-1">ที่อยู่ปัจจุบัน</p>
                <p className="text-sm">
                  {addr.addressno ?? ""} ตำบล/แขวง {addr.district ?? "-"} อำเภอ/เขต {addr.amphoe ?? "-"} จังหวัด {addr.province ?? "-"} {addr.zipcode ?? ""}
                </p>
                {addr.addressnote && (
                  <p className="text-xs text-muted italic mt-0.5">หมายเหตุ: {addr.addressnote}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Education summary */}
      <Section title="ประวัติการศึกษาล่าสุด">
        {educationLatest ? (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <KV label="ระดับการศึกษา" value={showEducationLevel(educationLatest.educationlevel)} />
            <KV label="สถานศึกษา"     value={educationLatest.institution ?? "-"} />
            <KV label="คณะ"           value={educationLatest.faculty ?? "-"} />
            <KV label="สาขา"          value={educationLatest.educationdepartment ?? "-"} />
            <KV label="ปีที่จบ"       value={educationLatest.graduateyear ? String(educationLatest.graduateyear) : "-"} />
          </div>
        ) : (
          <Empty>ไม่ระบุประวัติการศึกษา</Empty>
        )}
      </Section>

      {/* Personal docs / national ID */}
      {showPersonalIDCard && (
        <Section title="ข้อมูลส่วนตัว">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <KV label="เลขบัตรประชาชน"   value={rowMain.nationalidcard ?? "-"} mono />
            <KV label="วันหมดอายุบัตร"   value={DateThai2(rowMain.expirydate)} />
            <KV label="ไฟล์บัตรประชาชน" value={rowMain.nationalidcardfile
              ? <a href={`/legacy/pcs/admin/store/${rowMain.nationalidcardfile}`} className="text-primary-600 hover:underline">ดูไฟล์</a>
              : "ยังไม่แนบไฟล์"} />
            <KV label="ไฟล์สำเนาทะเบียนบ้าน" value={rowMain.copyhouseregistrationfile
              ? <a href={`/legacy/pcs/admin/store/${rowMain.copyhouseregistrationfile}`} className="text-primary-600 hover:underline">ดูไฟล์</a>
              : "ยังไม่แนบไฟล์"} />
            <KV label="ไฟล์ resume" value={rowMain.resumefile
              ? <a href={`/legacy/pcs/admin/store/${rowMain.resumefile}`} className="text-primary-600 hover:underline">ดูไฟล์</a>
              : "ยังไม่แนบไฟล์"} />
          </div>
        </Section>
      )}

      {/* Bank accounts */}
      {showAddBankSection && (
        <Section
          title={`บัญชีธนาคารในระบบ (${bankAccounts.length})`}
          actionLabel={canMutate ? "+ เพิ่มบัญชี (Wave 21)" : undefined}
        >
          {bankAccounts.length === 0 ? (
            <Empty>ยังไม่มีบัญชีธนาคาร</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>ธนาคาร</Th>
                  <Th>เลขที่บัญชี</Th>
                  <Th>ชื่อบัญชี</Th>
                  {canMutate && <Th>ตัวเลือก</Th>}
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((row, idx) => (
                  <tr key={row.id} className="border-t border-border">
                    <Td>{idx + 1}</Td>
                    <Td>{nameBank(row.bankname)}</Td>
                    <Td mono>{row.accountnumber ?? "-"}</Td>
                    <Td>{row.accountname ?? "-"}</Td>
                    {canMutate && (
                      <Td>
                        {/* TODO Wave 21: DeleteBankButton confirm flow */}
                        <span className="text-[10px] text-muted italic">(ลบ — Wave 21)</span>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}

      {/* Education history */}
      {showEducationListSection && (
        <Section
          title={`ประวัติการศึกษาทั้งหมด (${educationRows.length})`}
          actionLabel={canMutate ? "+ เพิ่มประวัติการศึกษา (Wave 21)" : undefined}
        >
          {educationRows.length === 0 ? (
            <Empty>ยังไม่มีประวัติการศึกษา</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>ระดับ</Th>
                  <Th>สถานศึกษา</Th>
                  <Th>คณะ</Th>
                  <Th>สาขา</Th>
                  <Th>ปีที่จบ</Th>
                  <Th>เกรด</Th>
                  {canMutate && <Th>ตัวเลือก</Th>}
                </tr>
              </thead>
              <tbody>
                {educationRows.map((row, idx) => (
                  <tr key={row.id} className="border-t border-border">
                    <Td>{idx + 1}</Td>
                    <Td>{showEducationLevel(row.educationlevel)}</Td>
                    <Td>{row.institution ?? "-"}</Td>
                    <Td>{row.faculty ?? "-"}</Td>
                    <Td>{row.educationdepartment ?? "-"}</Td>
                    <Td mono>{row.graduateyear ?? "-"}</Td>
                    <Td mono>{row.gpa ?? "-"}</Td>
                    {canMutate && (
                      <Td>
                        {/* TODO Wave 21: DeleteEducationButton confirm flow */}
                        <span className="text-[10px] text-muted italic">(ลบ — Wave 21)</span>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}
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
function KpiCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono">
        {value}
        {unit && <span className="text-sm font-normal text-muted ml-1">{unit}</span>}
      </p>
    </div>
  );
}
function Section({
  title,
  actionLabel,
  children,
}: {
  title: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actionLabel && (
          <span
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] text-amber-700 cursor-not-allowed opacity-70"
            title="Wave 21: port BS4 modal to native dialog"
          >
            {actionLabel}
          </span>
        )}
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
