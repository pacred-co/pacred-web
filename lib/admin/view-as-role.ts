import "server-only";
import { cookies } from "next/headers";
import type { AdminRole } from "@/lib/auth/require-admin";
import { isGodRole } from "@/lib/admin/god-role";

/**
 * 👁 VIEW-AS-ROLE — display-only role preview (ภูม/พี่ป๊อป 2026-07-22).
 *
 * WHY: each role sees a DIFFERENT admin sidebar (ROLE_MENUS). To audit another
 * department's screens for bugs/gaps, staff otherwise had to log out and log in
 * as a real staff account. This lets a GOD user (ultra/super) preview any role's
 * sidebar (+ cost-blur) IN PLACE — while their REAL permissions stay unchanged.
 *
 * 🔒 SAFETY — this is DISPLAY-ONLY, by construction:
 *   • The cookie is read ONLY by the (admin) layout to choose which SIDEBAR menu
 *     + cost-blur to render. It is NEVER consulted by `requireAdmin`, any server
 *     action's role gate, RLS, or a data query. So a preview can only change the
 *     MENU SHOWN — it can never grant or deny real access. The viewer stays ultra
 *     for every actual operation (clicking a previewed page works because ultra
 *     can reach everything; a page that truly excludes ultra can't be viewed even
 *     in preview — which is itself a finding).
 *   • Only a god role may activate it (checked here AND in the set action). A
 *     non-god cookie value is ignored (returns null). Fails CLOSED.
 */

export const VIEW_AS_COOKIE = "pacred_view_as_role";

/**
 * Roles offered in the preview picker, with Thai labels, in a sensible order.
 * Every AdminRole has a ROLE_MENUS entry so any could be previewed; this is the
 * curated department list worth auditing. `super`/`normies` included so a god can
 * see the near-full menu as a non-ultra super sees it.
 */
export const PREVIEWABLE_ROLES: ReadonlyArray<{ v: AdminRole; l: string }> = [
  { v: "super", l: "หัวหน้า (Super · เห็นกำไร ไม่เห็นต้นทุน)" },
  { v: "normies", l: "หัวหน้า (ไม่เห็นต้นทุน/กำไร)" },
  { v: "manager", l: "ผู้จัดการ (Cargo Manager)" },
  { v: "ops", l: "ปฏิบัติการ (Ops)" },
  { v: "accounting", l: "บัญชี" },
  { v: "pricing", l: "ตั้งราคา/ต้นทุน (Pricing)" },
  { v: "sales_admin", l: "หัวหน้าเซล (Sales Manager)" },
  { v: "sales", l: "เซล (Sales)" },
  { v: "qa", l: "QA / QC" },
  { v: "warehouse", l: "โกดัง (Warehouse)" },
  { v: "driver", l: "คนขับรถ (Driver)" },
  { v: "interpreter", l: "ล่าม (Interpreter)" },
  { v: "purchaser", l: "ผู้สั่งซื้อ (Purchaser)" },
  { v: "purchaser_lead", l: "หัวหน้าสั่งซื้อ (Purchaser Lead)" },
  { v: "freight_sales_manager", l: "เฟรท · หัวหน้าเซล" },
  { v: "freight_sales", l: "เฟรท · เซล" },
  { v: "freight_import_cs", l: "เฟรท · CS/เอกสารนำเข้า" },
  { v: "freight_export_cs", l: "เฟรท · CS/เอกสารส่งออก" },
  { v: "freight_import_clearance", l: "เฟรท · เคลียร์ของนำเข้า" },
  { v: "freight_export_clearance", l: "เฟรท · เคลียร์ของส่งออก" },
] as const;

const VALID = new Set<string>(PREVIEWABLE_ROLES.map((r) => r.v));

/** Is `v` a role we allow previewing? (runtime guard for the cookie value + action input). */
export function isPreviewableRole(v: string | null | undefined): v is AdminRole {
  return !!v && VALID.has(v);
}

/** Thai label for a role value (falls back to the raw code). */
export function previewRoleLabel(v: string): string {
  return PREVIEWABLE_ROLES.find((r) => r.v === v)?.l ?? v;
}

/**
 * The ACTIVE preview role for the current request, or null. Returns a role ONLY
 * when (a) the caller is a real god (ultra/super) AND (b) the cookie holds a
 * previewable role. DISPLAY-ONLY — the (admin) layout uses it to pick the sidebar
 * menu + cost-blur; nothing else may consult it.
 */
export async function resolveViewAsRole(realRoles: AdminRole[]): Promise<AdminRole | null> {
  if (!isGodRole(realRoles)) return null; // only a god may preview · fails closed
  const c = await cookies();
  const v = c.get(VIEW_AS_COOKIE)?.value ?? null;
  return isPreviewableRole(v) ? v : null;
}
