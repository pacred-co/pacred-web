/**
 * Department taxonomy (owner ปอน 2026-06-27).
 *
 * Pacred staff are grouped into SIX fixed departments. A department is one axis
 * of the admin model; the other two axes are the money-visibility tier
 * (ultra/super/normies · lib/admin/money-visibility.ts) and the POSITION
 * (ตำแหน่ง · admin_positions table) which drives the actual WORKSPACE (which
 * menus/pages a staffer sees · lib/admin/sidebar-menu.ts).
 *
 * `defaultWorkspace` = the base workspace-role a NEW position/role inherits when
 * created under this department ("สร้าง role ใหม่ จะอิงแผนก"). It is an existing
 * AdminRole menu key (lib/admin/sidebar-menu.ts ROLE_MENUS) — the closest legacy
 * function-role menu for that department. Departments without a dedicated legacy
 * menu (marketing/hr/it) fall back to a broad base for now; a tailored workspace
 * can be built via the positions/role builder.
 *
 * Pure data module (no server-only) so both server + client can import it.
 * `AdminRole` is a type-only import (no runtime pull-in).
 */
import type { AdminRole } from "@/lib/auth/require-admin";

export type Department = {
  /** stable key — stored in admin_contact_extras.department + admin_positions.department */
  key: string;
  /** Thai label shown in the dropdown + HR surfaces */
  labelTh: string;
  /** base workspace-role a new position/role under this dept inherits */
  defaultWorkspace: AdminRole;
};

export const DEPARTMENTS = [
  { key: "executive", labelTh: "ฝ่ายบริหาร",                     defaultWorkspace: "super" },
  { key: "biz_cs",    labelTh: "ฝ่ายพัฒนาธุรกิจและบริการลูกค้า", defaultWorkspace: "sales_admin" },
  { key: "marketing", labelTh: "ฝ่ายการตลาด",                   defaultWorkspace: "sales_admin" },
  { key: "logistics", labelTh: "ฝ่ายปฏิบัติการโลจิสติกส์",       defaultWorkspace: "warehouse" },
  { key: "hr",        labelTh: "ฝ่ายทรัพยากรบุคคล",              defaultWorkspace: "super" },
  { key: "finance",   labelTh: "ฝ่ายบัญชีและการเงิน",            defaultWorkspace: "accounting" },
  { key: "it",        labelTh: "ฝ่ายเทคโนโลยีสารสนเทศและพัฒนาระบบ", defaultWorkspace: "super" },
] as const satisfies readonly Department[];

export type DepartmentKey = (typeof DEPARTMENTS)[number]["key"];

/** All department keys (for SQL `.in()` filters + zod enum). */
export const DEPARTMENT_KEYS = DEPARTMENTS.map((d) => d.key) as [DepartmentKey, ...DepartmentKey[]];

/** Thai label for a department key (falls back to the raw key if unknown). */
export function departmentLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return DEPARTMENTS.find((d) => d.key === key)?.labelTh ?? key;
}

/** The base workspace-role for a department (for "new role อิงแผนก"). */
export function departmentDefaultWorkspace(key: string | null | undefined): AdminRole | null {
  if (!key) return null;
  return DEPARTMENTS.find((d) => d.key === key)?.defaultWorkspace ?? null;
}

/** Is this a known department key? */
export function isDepartmentKey(key: string | null | undefined): key is DepartmentKey {
  return !!key && DEPARTMENTS.some((d) => d.key === key);
}
