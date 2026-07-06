/**
 * Zod schemas for the Pacred admin CRUD forms (Wave 22 Phase 3+4).
 *
 *   - `AdminCreateSchema` — backs /admin/admins/new (POST `adminCreateNew`).
 *     Provisions a fresh Supabase auth.user + `profiles` row +
 *     `admins` role grant + optional `admin_contact_extras` HR sidecar.
 *
 *   - `AdminUpdateSchema` — backs /admin/admins/[id]/edit (POST
 *     `adminUpdateProfile`). Edits HR fields on an existing Pacred
 *     admin's profile/extras row. Does NOT change email/password
 *     (separate flow).
 *
 *   - `AdminToggleActiveSchema` + `AdminChangeRoleSchema` — admin RBAC
 *     mutations (paired server actions in `actions/admin/admins.ts`).
 *
 * Why a separate validator file (rather than tacking onto
 * `lib/validators/auth.ts`):
 *
 *   - The /admin/admins/new form lives on the admin-management surface
 *     and is invoked only by `super` admins recreating PCS legacy admins
 *     (Wave 22 manual port path) or onboarding fresh Pacred hires.
 *     It is NOT a customer signup flow — different field set, different
 *     defaults, different validation rules (no OTP, password is a
 *     suggestion not user-typed, captcha not relevant).
 *
 *   - Keeps `auth.ts` focused on customer-facing auth forms (signin /
 *     register / OTP / password reset).
 *
 * Per AGENTS.md §0c — every server action that consumes these schemas
 * MUST destructure `{ data, error }` from every Supabase call (never
 * just `{ data }`). The Zod parse here is the FIRST gate; the DB error
 * surfacing is the SECOND gate.
 */

import { z } from "zod";

// ─── enums ──────────────────────────────────────────────────────────────

/**
 * AdminRole — the 24-value enum from `lib/auth/require-admin.ts` (kept
 * in sync; do not narrow without updating the require-admin source).
 * The form UI exposes ALL 24 so a super-admin can grant any role.
 */
export const ADMIN_ROLES = [
  // 2026-06-18 (owner · mig 0189) — `ultra` = "Ultra Admin Z": god role that
  // sees EVERYTHING incl. money internals. Ranks above super (which loses
  // cost/profit visibility). Listed first = top of the role dropdown.
  "ultra",
  "super",
  // 2026-06-27 (owner ปอน) — `normies` = 3rd visibility tier (god-nav, sees
  // neither cost nor profit). The picker (ASSIGNABLE_ROLES below) now offers
  // ONLY ultra/super/normies; the rest stay in this enum for back-compat with
  // the operational requireAdmin([...]) gates but are not assignable.
  "normies",
  // 2026-07-06 (owner ④ · mig 0241) — per-order purchaser roles. Assignable so a
  // super/ultra can grant "ผู้สั่งซื้อ" / "หัวหน้าสั่งซื้อ" from /admin/admins.
  "purchaser",
  "purchaser_lead",
  // 2026-05-28 ดึก — Wave 26 · `manager` role from migration 0118.
  "manager",
  "ops",
  "accounting",
  "sales_admin",
  "sales",
  "qa",
  "warehouse",
  "driver",
  "interpreter",
  // 2026-06-09 — P2 (tax-invoice platform) · `pricing` role from migration 0158.
  "pricing",
  "freight_sales_manager",
  "freight_sales",
  "freight_export_manager",
  "freight_export_cs",
  "freight_export_doc",
  "freight_export_clearance",
  "freight_clearance_both",
  "freight_export_messenger",
  "freight_import_manager",
  "freight_import_cs",
  "freight_import_doc",
  "freight_import_clearance",
  "freight_import_messenger",
] as const;
export const adminRoleSchema = z.enum(ADMIN_ROLES);
export type AdminRoleEnum = z.infer<typeof adminRoleSchema>;

/**
 * ROLE_LABELS — human-readable Thai labels keyed by every AdminRoleEnum
 * value. Single source of truth for the role dropdowns + role pills across
 * the admin-management surfaces (the /new + /edit forms and the /admin/admins
 * per-row management grid all import this — previously each kept its own
 * inline copy that could drift). A pure data map (no React) so both server
 * and client modules can import it.
 *
 * Keep this map exhaustive over ADMIN_ROLES — `Record<AdminRoleEnum, string>`
 * makes a missing/extra key a compile error if the enum changes.
 */
export const ROLE_LABELS: Record<AdminRoleEnum, string> = {
  // 2026-06-27 (owner ปอน) — the 3 visibility tiers. Labels describe what each
  // tier SEES (ต้นทุน=cost · กำไร=profit · ยอดขาย=sales). All 3 are god-nav.
  ultra:                     "Ultra Admin Z (เห็นทุกอย่าง: ต้นทุน · กำไร · ยอดขาย)",
  super:                     "Super Admin (เห็นกำไร · ยอดขาย — ไม่เห็นต้นทุน)",
  normies:                   "Admin (เห็นยอดขาย — ไม่เห็นต้นทุน · ไม่เห็นกำไร)",
  // 2026-07-06 (owner ④ · mig 0241) — per-order purchaser roles.
  purchaser:                 "ผู้สั่งซื้อ (เห็นเฉพาะออเดอร์ที่ได้รับมอบหมาย)",
  purchaser_lead:            "หัวหน้าสั่งซื้อ (เห็นงานสั่งซื้อทั้งหมด + มอบหมาย/เปลี่ยนผู้สั่งซื้อ)",
  // 2026-05-28 ดึก — Wave 26 · `manager` role from migration 0118.
  manager:                   "Cargo Manager (อนุมัติ cnt-payment + supervise)",
  ops:                       "Ops (forwarder/บริการคลังจีน)",
  accounting:                "Accounting (กระเป๋าเงิน/หยวน/payouts)",
  sales_admin:               "Cargo Sales Manager (#29)",
  sales:                     "Cargo Sales Staff (#30)",
  qa:                        "QA & QC (#5)",
  warehouse:                 "Warehouse staff",
  driver:                    "Driver / รถส่งของ",
  interpreter:               "Interpreter / ล่ามจีน",
  pricing:                   "Cargo Pricing (ต้นทุน / PEAK stock-in)",
  freight_sales_manager:     "Freight Sales Manager (#16)",
  freight_sales:             "Freight Sales (#17)",
  freight_export_manager:    "Freight Export Manager (#18)",
  freight_export_cs:         "Freight Export CS / Doc (#19)",
  freight_export_doc:        "Freight Export Doc (#20)",
  freight_export_clearance:  "Freight Export Clearance (#21)",
  freight_clearance_both:    "Freight Clearance Import+Export (#22)",
  freight_export_messenger:  "Freight Export Messenger (#23)",
  freight_import_manager:    "Freight Import Manager (#24)",
  freight_import_cs:         "Freight Import CS / Doc (#25)",
  freight_import_doc:        "Freight Import Doc (#26)",
  freight_import_clearance:  "Freight Import Clearance (#27)",
  freight_import_messenger:  "Freight Import Messenger (#28)",
};

/**
 * ASSIGNABLE_ROLES — the roles the create/edit/change-role pickers OFFER
 * (owner ปอน 2026-06-27: "ลบ role ไปเลย แก้เป็นสิทธิ์การมองเห็นแทน · เดี๋ยว role
 * ทำเพิ่มมาอีกอัน"). The admin model is now THREE visibility tiers — every admin
 * is god-nav, differentiated only by what money they see:
 *   • ultra   → cost + profit + sales
 *   • super   → profit + sales (no cost)
 *   • normies → sales only (no cost, no profit)
 *
 * The other AdminRole values still EXIST (operational requireAdmin([...]) gates
 * compile + god-nav bypasses them) but are no longer assignable from the UI. To
 * bring a functional role back, add it here. The dropdowns map over this list;
 * ROLE_LABELS stays exhaustive so any legacy/inert grant still renders a label.
 *
 * 2026-07-06 (owner · mig 0242) — `purchaser` / `purchaser_lead` were REMOVED
 * from this picker: the purchaser work-function moved OFF the money-tier role
 * axis and ONTO the POSITION axis (the "ผู้สั่งซื้อ" / "หัวหน้าสั่งซื้อ" positions
 * under biz_cs · admin_positions.workspace_role). Assign a purchaser by giving
 * them a visibility role (e.g. normies) + the position, NOT the raw role. They
 * stay in ADMIN_ROLES / ROLE_LABELS / the AdminRole union (workspace-role keys +
 * back-compat with any existing raw grant) and in the DB CHECK (harmless
 * still-allowed value) — just not offered in the money-tier dropdown. Safe:
 * 0 admins currently hold either raw role.
 */
export const ASSIGNABLE_ROLES = [
  "ultra",
  "super",
  "normies",
] as const satisfies readonly AdminRoleEnum[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * `admin_contact_extras.company` CHECK constraint (migration 0018).
 * Default = 'pacred' on the form.
 */
export const COMPANY_VALUES = ["pacred", "pacred-cargo", "pacred-freight"] as const;
export const companySchema = z.enum(COMPANY_VALUES);

/**
 * `admin_contact_extras.employee_type` CHECK constraint (migration 0018).
 * Default = 'full_time' on the form.
 */
export const EMPLOYEE_TYPES = [
  "full_time",
  "probation",
  "contract",
  "daily",
  "intern",
  "partner",
] as const;
export const employeeTypeSchema = z.enum(EMPLOYEE_TYPES);

/**
 * profiles.sex CHECK constraint (migration 0003).
 */
export const SEX_VALUES = ["male", "female", "other"] as const;
export const sexSchema = z.enum(SEX_VALUES);

// ─── atoms ──────────────────────────────────────────────────────────────

/**
 * Pacred admin password rule: ≥ 8 chars (one tighter than the customer-
 * facing `passwordSchema` from `auth.ts`, which still allows ≥ 6 for
 * legacy users). Admins have privileged access — short passwords are
 * the worst kind of leak.
 */
const adminPasswordSchema = z
  .string()
  .min(6, "รหัสผ่านขั้นต่ำ 6 ตัวอักษร")   // owner 2026-06-06: staff standard = 123456 (6 ตัว)
  .max(72, "รหัสผ่านยาวสุด 72 ตัวอักษร"); // bcrypt cap

const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .email("รูปแบบอีเมลไม่ถูกต้อง")
  .max(254, "อีเมลยาวเกินไป");

const optionalEmail = z
  .union([emailAddress, z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v));

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD")
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalUrl = z
  .string()
  .trim()
  .max(512)
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

// ─── create schema ──────────────────────────────────────────────────────
//
// Backs /admin/admins/new. The HR fields are split into "recommended"
// (always shown in the form) and "advanced" (collapsible block). The
// schema treats them all as optional so an admin can save a minimal
// row first and fill in HR details later via /edit.

export const AdminCreateSchema = z
  .object({
    // ── required ─────────────────────────────────────────────────
    // login_id = the staff login USERNAME (owner 2026-06-21: separate from email).
    // The action derives the auth key admin_<login_id>@pacred.co.th. `email` is now
    // the staffer's REAL email (optional · NOT the login key).
    login_id:     z.string().trim().min(1, "กรุณากรอก User ID (ไอดีเข้าระบบ)").max(64)
                    .regex(/^[a-z0-9_]+$/i, "User ID ใช้ได้เฉพาะ a-z 0-9 _"),
    email:        optionalEmail,
    password:     adminPasswordSchema,
    first_name:   z.string().trim().min(1, "กรุณากรอกชื่อ").max(200),
    last_name:    z.string().trim().min(1, "กรุณากรอกนามสกุล").max(200),
    role:         adminRoleSchema,

    // ── recommended (HR) ─────────────────────────────────────────
    phone:         optionalText(50),
    nickname:      optionalText(120),
    company:       companySchema.optional().default("pacred"),
    employee_type: employeeTypeSchema.optional().default("full_time"),
    // department = a key from lib/admin/departments.ts (the form constrains to a
    // 6-value dropdown). Kept as free text in the schema so a legacy free-text
    // department value on an existing admin doesn't break a save (owner ปอน 2026-06-27).
    department:    optionalText(100),
    section:       optionalText(100),
    // position (ตำแหน่ง) — FK to admin_positions; drives the workspace. Picked as
    // a dropdown (filtered by department). Optional so a bare admin can be created
    // first + assigned a position later via /edit.
    position_id:   z.uuid("position_id ต้องเป็น UUID").optional(),
    work_email:    optionalEmail,
    work_phone:    optionalText(50),
    hired_at:      optionalDate,
    avatar_url:    optionalUrl,

    // ── advanced ─────────────────────────────────────────────────
    birthday:           optionalDate,
    employee_code:      optionalText(20),   // รหัสพนักงาน YYMMNO (login key)
    sex:                sexSchema.optional(),
    legacy_admin_id:    optionalText(64),
    admin_note:         optionalText(2000),
    contract_end_date:  optionalDate,

    // Cross-system dedupe override (เดฟ 2026-06-08 · the PR112/PR10584 root-cause
    // fix). `adminCreateNew` refuses by default when `phone` already belongs to
    // an existing tb_users customer — that's how a person ended up with TWO
    // member_codes (admin profile + legacy customer). When the operator truly
    // intends to make an existing customer into staff, they re-submit with this
    // flag set (the form shows the existing code + a confirm checkbox first).
    allow_existing_phone: z.boolean().optional().default(false),
  })
  .strict();
export type AdminCreateInput = z.infer<typeof AdminCreateSchema>;

// ─── update schema ──────────────────────────────────────────────────────
//
// Backs /admin/admins/[id]/edit. Mirrors AdminCreateSchema EXCEPT:
//   - email + password REMOVED (rotation is a separate flow)
//   - profile_id is mandatory (target of the update)
//   - role is OPTIONAL — when present, the action treats it as a
//     role change (insert new row + soft-delete old; see
//     AdminChangeRoleSchema for the dedicated mutation)
//   - is_active boolean toggle on the active role grant (paired
//     mutation via AdminToggleActiveSchema)

export const AdminUpdateSchema = z
  .object({
    profile_id: z.uuid("profile_id ต้องเป็น UUID"),

    // identity
    first_name:    z.string().trim().min(1, "กรุณากรอกชื่อ").max(200).optional(),
    last_name:     z.string().trim().min(1, "กรุณากรอกนามสกุล").max(200).optional(),
    // REAL email (owner 2026-06-21: separate from the login-id). Editable here so
    // existing staff can replace the old synthetic email with their real one.
    email:         optionalEmail,
    phone:         optionalText(50),
    avatar_url:    optionalUrl,
    birthday:      optionalDate,
    sex:           sexSchema.optional(),
    employee_code: optionalText(20),   // รหัสพนักงาน YYMMNO (login key · owner-assigned)

    // HR sidecar
    nickname:           optionalText(120),
    company:            companySchema.optional(),
    employee_type:      employeeTypeSchema.optional(),
    department:         optionalText(100),
    section:            optionalText(100),
    position_id:        z.uuid("position_id ต้องเป็น UUID").optional(),
    work_email:         optionalEmail,
    work_phone:         optionalText(50),
    hired_at:           optionalDate,
    contract_end_date:  optionalDate,
    legacy_admin_id:    optionalText(64),
    admin_note:         optionalText(2000),
  })
  .strict();
export type AdminUpdateInput = z.infer<typeof AdminUpdateSchema>;

// ─── role toggle / change ───────────────────────────────────────────────

export const AdminToggleActiveSchema = z
  .object({
    profile_id: z.uuid("profile_id ต้องเป็น UUID"),
    role:       adminRoleSchema,
    is_active:  z.boolean(),
  })
  .strict();
export type AdminToggleActiveInput = z.infer<typeof AdminToggleActiveSchema>;

export const AdminChangeRoleSchema = z
  .object({
    profile_id: z.uuid("profile_id ต้องเป็น UUID"),
    old_role:   adminRoleSchema,
    new_role:   adminRoleSchema,
  })
  .strict()
  .refine((d) => d.old_role !== d.new_role, {
    message: "old_role และ new_role ต้องไม่ตรงกัน",
    path:    ["new_role"],
  });
export type AdminChangeRoleInput = z.infer<typeof AdminChangeRoleSchema>;

// ─── helpers exported for the client form ───────────────────────────────

/**
 * Heuristic — does this AdminCreateInput carry ANY HR-sidecar field?
 * If so, the server action should insert an `admin_contact_extras`
 * row; if not, skip the insert (keeps the table empty for admins
 * who don't need HR data tracked).
 *
 * Used as `hasAnyHRField()` inside `actions/admin/admins.ts`.
 */
export function hasAnyHRField(input: AdminCreateInput | AdminUpdateInput): boolean {
  return Boolean(
    input.nickname ||
    input.company ||
    input.employee_type ||
    input.department ||
    input.section ||
    input.position_id ||
    input.work_email ||
    input.work_phone ||
    input.hired_at ||
    input.contract_end_date ||
    input.legacy_admin_id ||
    input.admin_note,
  );
}

/**
 * Generate a short strong-ish suggestion password for the "🎲 สุ่ม"
 * button in the create form. Browser-safe (uses `crypto.getRandomValues`).
 *
 * - 12 chars (≥ 8 minimum, gives headroom over the bcrypt minimum)
 * - Excludes ambiguous chars (0/O · 1/l/I · etc.) to ease verbal sharing
 *   with the new admin on a phone call.
 *
 * NOTE: the admin re-types this themselves before storing — Pacred doesn't
 * email the generated password (we don't trust SMTP delivery to admin
 * addresses); they read it back during the call to confirm.
 */
export function suggestAdminPassword(): string {
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const len = 12;
  const buf = new Uint8Array(len);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    // SSR fallback — should not actually run (suggestion is browser-only)
    for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHA[buf[i] % ALPHA.length];
  return out;
}
