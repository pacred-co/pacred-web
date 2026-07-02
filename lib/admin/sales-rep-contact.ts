/**
 * sales-rep-contact — resolve the assigned sales rep contact (name + tel)
 * for a customer (tb_users.userid).
 *
 * Used by the customer-facing fallback banner on
 * `/service-import/[fNo]/invoice` when no `tb_receipt` has been issued
 * yet, so the customer knows whom to contact ("กรุณาติดต่อเซลล์ผู้ดูแล …").
 *
 * Data path:
 *   tb_users.adminidsale → tb_admin.adminID → { adminName, adminTel }
 *
 * If the user has no `adminidsale` on file (legacy walk-ins · imports
 * with NULL sales rep) the helper returns a safe Pacred-wide fallback
 * (CONTACT.phoneCs · CONTACT.phoneCsDisplay) so the customer is never
 * shown an empty contact box.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACT } from "@/components/seo/site";

export type SalesRepContact = {
  /** Display name (admin's first+last when available · "Pacred CS" fallback). */
  name:        string;
  /** Short display name — nickname, else first name (compact UI · "Pacred"). */
  nickname:    string;
  /** Phone — international form for `tel:` href. */
  phone:       string;
  /** Phone — display form (xx-xxx-xxxx). */
  phoneDisplay: string;
  /** Email (best-effort — may be empty). */
  email:       string;
  /**
   * Rep photo URL (a public `/images/Character_Icon/*.png` path or storage URL)
   * resolved from the rep's `profiles.avatar_url` via the legacy bridge
   * `admin_contact_extras.legacy_admin_id = adminID → profile_id → profiles`.
   * `null` when the rep has no photo on file (or fallback CS).
   */
  avatarUrl:   string | null;
  /** True when this is the assigned sales rep · false when fallback CS. */
  isAssigned:  boolean;
};

/**
 * Resolve the assigned sales rep for a customer's tb_users.userid
 * (tb_users.adminIDSale → tb_admin). Returns the Pacred CS fallback when no
 * assigned rep is on file.
 */
export async function getSalesRepContactForUserid(
  userid: string,
): Promise<SalesRepContact> {
  return resolveRepContactByColumn(userid, "adminIDSale");
}

/**
 * Resolve the assigned CS rep for a customer's tb_users.userid
 * (tb_users.adminIDCS → tb_admin). Same shape + Pacred fallback as the sales
 * resolver (migration 0141 added adminIDCS).
 */
export async function getCsRepContactForUserid(
  userid: string,
): Promise<SalesRepContact> {
  return resolveRepContactByColumn(userid, "adminIDCS");
}

/** tb_admin fields needed to render a rep contact. */
type AdminRow = {
  adminID:       string | null;
  adminName:     string | null;
  adminLastName: string | null;
  adminNickname: string | null;
  adminTel:      string | null;
  adminEmail:    string | null;
};

const REP_ADMIN_COLS =
  "adminID, adminName, adminLastName, adminNickname, adminTel, adminEmail";

/**
 * Shared body — resolve a customer's rep for EITHER the sales (adminIDSale)
 * or CS (adminIDCS) column of tb_users. Order of preference:
 *   1. the customer's ASSIGNED rep, IF that admin is still active in this role
 *      (tb_admin.adminStatusA='1' AND adminStatusSale/CS='1');
 *   2. otherwise (rep disabled / deleted / de-flagged) the FIRST still-active
 *      rep of this kind — so the customer always sees a WORKING contact
 *      (owner directive 2026-07-02: a dead rep hands off to a live one);
 *   3. otherwise the Pacred-wide CS fallback (never an empty box).
 */
async function resolveRepContactByColumn(
  userid: string,
  column: "adminIDSale" | "adminIDCS",
): Promise<SalesRepContact> {
  const fallback: SalesRepContact = {
    name:         "Pacred Customer Service",
    nickname:     "Pacred",
    phone:        CONTACT.phoneCs,
    phoneDisplay: CONTACT.phoneCsDisplay,
    email:        CONTACT.emailDocs,
    avatarUrl:    null,
    isAssigned:   false,
  };
  if (!userid) return fallback;

  // The tb_admin flag that marks an ACTIVE rep of this kind (migration 0141).
  const roleFlag = column === "adminIDSale" ? "adminStatusSale" : "adminStatusCS";

  const admin = createAdminClient();

  // 1 — the customer's ASSIGNED rep adminID (tb_users.adminIDSale / adminIDCS).
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select(column)
    .eq("userID", userid)
    .maybeSingle();
  if (userErr) {
    console.error(`[rep-contact tb_users ${column} lookup] failed`, {
      code: userErr.code, message: userErr.message, userid,
    });
    return fallback;
  }
  const assignedId = (
    userRow as { adminIDSale?: string | null; adminIDCS?: string | null } | null
  )?.[column]?.trim();

  // 2 — use the assigned rep ONLY if their account is still active in this role.
  if (assignedId) {
    const { data: row, error } = await admin
      .from("tb_admin")
      .select(`${REP_ADMIN_COLS}, adminStatusA, ${roleFlag}`)
      .eq("adminID", assignedId)
      .maybeSingle();
    if (error) {
      console.error(`[rep-contact tb_admin assigned lookup] failed`, {
        code: error.code, message: error.message, assignedId,
      });
    }
    const r = row as (AdminRow & Record<string, string | null>) | null;
    if (r && r.adminStatusA === "1" && r[roleFlag] === "1") {
      return buildRepContact(admin, r, fallback);
    }
    // else the assigned rep is disabled / deleted / no longer this role →
    // fall through to an active substitute.
  }

  // 3 — substitute: the first STILL-ACTIVE rep of this kind (deterministic).
  const { data: poolRow, error: poolErr } = await admin
    .from("tb_admin")
    .select(REP_ADMIN_COLS)
    .eq("adminStatusA", "1")
    .eq(roleFlag, "1")
    .order("adminID", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (poolErr) {
    console.error(`[rep-contact tb_admin active-pool lookup] failed`, {
      code: poolErr.code, message: poolErr.message, roleFlag,
    });
    return fallback;
  }
  if (poolRow) return buildRepContact(admin, poolRow as AdminRow, fallback);

  // 4 — no active rep at all → the Pacred-wide fallback.
  return fallback;
}

/** Build a resolved rep contact (name + nickname + tel + photo) from a
 *  tb_admin row. The photo resolves via the legacy bridge
 *  admin_contact_extras.legacy_admin_id (= adminID) → profile → avatar_url
 *  (best-effort: a missing link / no photo just yields null). */
async function buildRepContact(
  admin: ReturnType<typeof createAdminClient>,
  row: AdminRow,
  fallback: SalesRepContact,
): Promise<SalesRepContact> {
  const adminId = row.adminID?.trim() ?? "";

  let avatarUrl: string | null = null;
  if (adminId) {
    const { data: extraRow, error: extraErr } = await admin
      .from("admin_contact_extras")
      .select("profile_id")
      .eq("legacy_admin_id", adminId)
      .maybeSingle<{ profile_id: string | null }>();
    if (extraErr) {
      console.error(`[rep-contact admin_contact_extras lookup] failed`, {
        code: extraErr.code, message: extraErr.message, adminId,
      });
    }
    const repProfileId = extraRow?.profile_id ?? null;
    if (repProfileId) {
      const { data: repProfile, error: repProfErr } = await admin
        .from("profiles")
        .select("avatar_url")
        .eq("id", repProfileId)
        .maybeSingle<{ avatar_url: string | null }>();
      if (repProfErr) {
        console.error(`[rep-contact profiles avatar lookup] failed`, {
          code: repProfErr.code, message: repProfErr.message, repProfileId,
        });
      }
      const a = repProfile?.avatar_url?.trim();
      avatarUrl = a && a !== "" ? a : null;
    }
  }

  const first = row.adminName?.trim() ?? "";
  const last = row.adminLastName?.trim() ?? "";
  const nick = row.adminNickname?.trim() ?? "";
  const tel = (row.adminTel ?? "").trim();

  return {
    name:         `${first} ${last}`.trim() || nick || fallback.name,
    nickname:     nick || first || fallback.nickname,
    phone:        tel ? toIntlPhone(tel) : fallback.phone,
    phoneDisplay: tel ? toDisplayPhone(tel) : fallback.phoneDisplay,
    email:        row.adminEmail?.trim() || fallback.email,
    avatarUrl,
    isAssigned:   true,
  };
}

/** "0617799299" → "+66617799299" — best-effort, returns input unchanged
 *  if it's not a 0-leading Thai mobile/landline. */
function toIntlPhone(s: string): string {
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+66" + digits.slice(1);
  return digits;
}

/** "0617799299" → "061-779-9299" — Thai mobile-tel display format. */
function toDisplayPhone(s: string): string {
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith("0")) {
    // 02-xxx-xxxx (Bangkok landline)
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return s;
}
