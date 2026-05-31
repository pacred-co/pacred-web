/**
 * Legacy code → Thai label maps for the HR attendance/recruitment surfaces,
 * ported verbatim from `pcs-admin/include/function.php` + the cascade selects
 * in `pcs-admin/post-job.php`. Shared by the (server) pages and the (client)
 * forms — pure data, no server-only deps.
 *
 * D1 faithful port — these are the EXACT label maps the legacy UI renders.
 */

// ── tas_leave.type (describeLeaveType — function.php:3508) ──────────────────
export const LEAVE_TYPE_LABEL: Record<string, string> = {
  "1": "ลาป่วย",
  "2": "ลาพักผ่อน",
  "3": "ลากิจส่วนตัว",
  "4": "ลาคลอด",
};

// ── tas_leave.duration (durationLeaveTypeText — function.php) ────────────────
export const LEAVE_DURATION_LABEL: Record<string, string> = {
  "1": "ทั้งวัน",
  "2": "ครึ่งวันเช้า",
  "3": "ครึ่งวันบ่าย",
};

// ── tas_leave.status (displayLeaveStatus — function.php:3548) ────────────────
export const LEAVE_STATUS_LABEL: Record<string, string> = {
  "1": "รอ HR ตรวจสอบ",
  "2": "รอผู้บริหารอนุมัติ",
  "3": "อนุมัติ",
  "4": "ไม่อนุมัติ",
};

// ── tb_post_job.companytype — values STORED by post-job.php form (L93-94) ───
//    (NB: the read-side nameCompanyType() helper relabels 1→"Freight & Cargo";
//     we follow the FORM, which is what actually lands in the column.)
export const POST_COMPANY_LABEL: Record<string, string> = {
  "1": "PCS Cargo",
  "2": "PCS Freight",
};

// ── tb_post_job.admintype — post-job.php form (L101-102) ────────────────────
export const POST_ADMIN_TYPE_LABEL: Record<string, string> = {
  "1": "พนักงานประจำ",
  "2": "เด็กฝึกงาน",
};

/**
 * Department + Section cascades — verbatim from the post-job.php listDepartment()
 * / listSection() JS (the option values that get stored in tb_post_job).
 * Keyed by companytype → department code → label, and companytype → section
 * code → label (sections are flat per company in the legacy form).
 */
export const POST_DEPARTMENT_LABEL: Record<string, Record<string, string>> = {
  // companyType 1 = Cargo
  "1": {
    "2": "Accounting",
    "3": "Marketing",
    "4": "Admin",
    "5": "HR",
    "6": "Purchasing",
    "7": "Sales",
    "8": "Warehouse",
  },
  // companyType 2 = Freight
  "2": {
    "2": "Booking",
    "3": "Accounting",
    "4": "Sales",
    "5": "Messenger",
    "6": "Shipping",
    "7": "Forms",
  },
};

export const POST_SECTION_LABEL: Record<string, Record<string, string>> = {
  // companyType 1 = Cargo (union of all listSection branches)
  "1": {
    "2": "Accounting",
    "3": "Marketing",
    "4": "Graphic",
    "5": "Creative",
    "6": "Customer Service Admin",
    "7": "Customer Service Warehouse",
    "8": "HR",
    "9": "Chinese translator",
    "10": "Driver",
    "11": "Warehouse Worker",
    "12": "Sales",
  },
  // companyType 2 = Freight
  "2": {
    "2": "CS Export",
    "3": "CS Import",
    "4": "Document Export",
    "5": "Document Import",
    "6": "Accounting",
    "7": "Sales",
    "8": "Messenger",
    "9": "Shipping Coordinator",
    "10": "Shipping Document",
    "11": "Invoice & Packing List",
    "12": "คนรับฟอร์ม",
  },
};

export function postCompanyLabel(code: string): string {
  return POST_COMPANY_LABEL[code] ?? code;
}
export function postAdminTypeLabel(code: string): string {
  return POST_ADMIN_TYPE_LABEL[code] ?? code;
}
export function postDepartmentLabel(companyType: string, code: string): string {
  return POST_DEPARTMENT_LABEL[companyType]?.[code] ?? code;
}
export function postSectionLabel(companyType: string, code: string): string {
  return POST_SECTION_LABEL[companyType]?.[code] ?? code;
}

/** Derived posting status (post-job-hs.php L124-127): in-window vs expired. */
export function postingIsActive(startdate: string | null, enddate: string | null, now = new Date()): boolean {
  if (!startdate || !enddate) return false;
  const s = new Date(startdate).getTime();
  const e = new Date(enddate).getTime();
  const n = now.getTime();
  return s < n && n < e;
}
