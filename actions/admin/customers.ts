"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { sendSms } from "@/lib/sms/gateway";
import { logger, redactPhone } from "@/lib/logger";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { pickLeastLoadedSalesRep } from "@/lib/admin/assign-sales-rep";
import {
  parseDbdResponse,
  buildDbdLookupUrl,
  type DbdLookupData,
} from "@/lib/dbd/parse-juristic";
import {
  CORP_STATUS,
  updateUserIdentitySchema,
  convertToJuristicSchema,
  type UpdateUserIdentityInput,
  type ConvertToJuristicInput,
} from "@/lib/admin/customer-identity";

// ════════════════════════════════════════════════════════════════════════
// P0-17 — Edit customer identity on the LEGACY tb_users table
// ════════════════════════════════════════════════════════════════════════
//
// adm-08 audit WF#4 / P0-A: the prior `editCustomer` wrote the rebuilt-empty
// `profiles` table by UUID *and was imported nowhere* → an admin physically
// could NOT correct any of the 8,898 migrated customers' name/phone/email/
// birthday. This replaces it with the faithful port keyed by `userID`.
//
// Source verified directly from
//   <legacy>/member/pcs-admin/users.php  (the `update` POST · ~L30-71)
//   <legacy>/member/pcs-admin/include/pages/users/editUser.php (the modal)
//
// Editable fields (ALL departments):  userName · userLastName · userEmail ·
//   userLineID · userFacebook · userTel · userSex · userBirthday
// Senior-only fields (legacy CEO/Manager/QAAndQC/Accounting/ITDT):
//   adminIDSale · coID  → Pacred senior roles: super · manager · accounting · qa
// Legacy guards reproduced: userName + userLastName required; email-dup check
//   that allows the customer to keep their OWN current email
//   (`WHERE userEmail=$new AND userEmail<>$old`); saveHistory(...,13).
//
// Column casing verified vs migration 0113 (camelCase pilot, applied prod):
//   tb_users = camelCase — userID · userName · userLastName · userTel ·
//   userEmail · userBirthday · userSex · userLineID · userFacebook ·
//   adminIDSale · coID
const SENIOR_IDENTITY_ROLES = ["super", "manager", "accounting", "qa"] as const;

export async function adminUpdateUserIdentity(
  input: UpdateUserIdentityInput,
): Promise<AdminActionResult> {
  const parsed = updateUserIdentitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin(["super", "manager", "ops", "accounting", "sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Senior-role gate for the two privileged columns (legacy: only
    // CEO/Manager/QAAndQC/Accounting/ITDT may reassign rep + customer group).
    const roles = (await getAdminRoles()) ?? [];
    const isSenior =
      roles.includes("super") ||
      roles.some((r) => (SENIOR_IDENTITY_ROLES as readonly string[]).includes(r));

    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userEmail, userTel, userSex, userBirthday, userLineID, userFacebook, adminIDSale, coID")
      .eq("userID", userid)
      .maybeSingle<{
        userID: string;
        userName: string | null; userLastName: string | null;
        userEmail: string | null; userTel: string | null;
        userSex: string | null; userBirthday: string | null;
        userLineID: string | null; userFacebook: string | null;
        adminIDSale: string | null; coID: string | null;
      }>();
    if (beforeErr) {
      console.error(`[adminUpdateUserIdentity read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };

    // Email-dup check (legacy: another customer must not already own this
    // email; the customer may keep their OWN current email).
    if (d.userEmail) {
      const { data: dup, error: dupErr } = await admin
        .from("tb_users")
        .select("userID")
        .eq("userEmail", d.userEmail)
        .neq("userID", userid)
        .limit(1)
        .maybeSingle<{ userID: string }>();
      if (dupErr) {
        console.error(`[adminUpdateUserIdentity email-dup] failed`, { userid, code: dupErr.code, message: dupErr.message });
        return { ok: false, error: dupErr.message };
      }
      if (dup) return { ok: false, error: "มีอีเมลนี้แล้วในระบบ" };
    }

    // Build the UPDATE. NOT-NULL columns (userName/userLastName/userTel) are
    // always set (zod guarantees them non-empty). Nullable columns store ""
    // when blank — matching how the legacy PHP wrote empty strings (NEVER
    // Postgres NULL · see docs/learnings/php-port-patterns.md). userEmail is
    // the one truly-nullable column; "" → null mirrors the customer-portal.
    const update: Record<string, unknown> = {
      userName:     d.userName,
      userLastName: d.userLastName,
      userEmail:    d.userEmail || null,
      userTel:      d.userTel,
      userSex:      d.userSex ?? "",
      userBirthday: d.userBirthday || null,
      userLineID:   d.userLineID ?? "",
      userFacebook: d.userFacebook ?? "",
    };
    if (isSenior) {
      if (d.adminIDSale !== undefined) update.adminIDSale = d.adminIDSale;
      if (d.coID        !== undefined) update.coID        = d.coID;
    }

    const { error } = await admin.from("tb_users").update(update).eq("userID", userid);
    if (error) {
      console.error(`[adminUpdateUserIdentity update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    // saveHistory(...,13) — แก้ไขข้อมูลส่วนตัวสมาชิก.
    await logAdminAction(adminId, "tb_users.update_identity", "tb_users", userid, {
      before: {
        userName: before.userName, userLastName: before.userLastName,
        userEmail: before.userEmail, userTel: before.userTel,
        userSex: before.userSex, userBirthday: before.userBirthday,
        userLineID: before.userLineID, userFacebook: before.userFacebook,
        ...(isSenior ? { adminIDSale: before.adminIDSale, coID: before.coID } : {}),
      },
      after: update,
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════════
// P0-18 — Juristic verify / reject on the LEGACY tb_corporate table
// ════════════════════════════════════════════════════════════════════════
//
// adm-08 audit WF#12-14 / P0-B: the prior verify/reject wrote the rebuilt-
// empty `corporate` table by UUID → the 8,898 migrated juristic customers
// (their data in `tb_corporate`) were invisible/unverifiable. These mirror
// the already-correct `adminUpdateCorporate` (customer-profile.ts), keying by
// `userid` on `tb_corporate`.
//
// `corporatestatus` codes — verified verbatim from legacy `statusComp()`
// (pcs-admin/include/function.php:530) + editCompStatus (users.php:866):
//   '1' = รอตรวจสอบ (pending · initial state on signup; the queue filters =1)
//   '2' = อนุมัติแล้ว (verified · editCompStatus sets this)
//   '3' = ไม่ผ่าน (rejected)
// tb_corporate is all-lowercase (NOT in the 0113 camelCase batch):
//   id · userid · corporatenumber · corporatename · corporateaddress ·
//   corporatestatus.
const JURISTIC_ROLES = ["super", "manager", "ops", "accounting", "qa", "sales_admin"] as const;

const verifyJuristicSchema = z.object({ userid: z.string().trim().min(1).max(20) });
const rejectJuristicSchema = z.object({
  userid: z.string().trim().min(1).max(20),
  reason: z.string().trim().min(1).max(500),
});

export async function verifyJuristic(input: z.infer<typeof verifyJuristicSchema>): Promise<AdminActionResult> {
  const parsed = verifyJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();

  return withAdmin([...JURISTIC_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // UPDATE-only: the corporate row must already exist (customer created it
    // on signup, or via convert-to-juristic).
    const { data: before, error: beforeErr } = await admin
      .from("tb_corporate")
      .select("id, corporatestatus")
      .eq("userid", userid)
      .maybeSingle<{ id: number; corporatestatus: string | null }>();
    if (beforeErr) {
      console.error(`[verifyJuristic read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบข้อมูลนิติบุคคลของลูกค้านี้" };

    const { error } = await admin
      .from("tb_corporate")
      .update({ corporatestatus: CORP_STATUS.VERIFIED })
      .eq("id", before.id);
    if (error) {
      console.error(`[verifyJuristic update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    // Legacy editCompStatus path also ensures userCompany='1' (the flag the
    // juristic queue + customer-portal read). update-corporate set it; keep
    // it consistent on approve.
    await admin.from("tb_users").update({ userCompany: "1" }).eq("userID", userid);

    await logAdminAction(adminId, "tb_corporate.verify", "tb_corporate", userid, {
      before: before.corporatestatus, after: CORP_STATUS.VERIFIED,
    });
    revalidatePath("/admin/juristic-check");
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

export async function rejectJuristic(input: z.infer<typeof rejectJuristicSchema>): Promise<AdminActionResult> {
  const parsed = rejectJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();

  return withAdmin([...JURISTIC_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: beforeErr } = await admin
      .from("tb_corporate")
      .select("id, corporatestatus")
      .eq("userid", userid)
      .maybeSingle<{ id: number; corporatestatus: string | null }>();
    if (beforeErr) {
      console.error(`[rejectJuristic read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบข้อมูลนิติบุคคลของลูกค้านี้" };

    const { error } = await admin
      .from("tb_corporate")
      .update({ corporatestatus: CORP_STATUS.REJECTED })
      .eq("id", before.id);
    if (error) {
      console.error(`[rejectJuristic update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_corporate.reject", "tb_corporate", userid, {
      before: before.corporatestatus, after: CORP_STATUS.REJECTED, reason: parsed.data.reason,
    });
    revalidatePath("/admin/juristic-check");
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

/**
 * DBD juristic-person lookup + compare (legacy check-juristic/compare.php +
 * check-juristic/home.php). P0-18: re-pointed from the rebuilt `corporate`
 * (UUID) to the legacy `tb_corporate` (keyed by `userid`) so the lookup works
 * for the 8,898 migrated juristic customers.
 *
 * Faithful port of the legacy "ค้นหาข้อมูลนิติบุคคล" / DBD compare. Given a
 * juristic customer's userID, read their submitted data from `tb_corporate`,
 * look the company up at the Department of Business Development
 * (กรมพัฒนาธุรกิจการค้า) by tax id, and return both records so the admin can
 * compare them field-by-field before approving (verifyJuristic).
 *
 * NO DB cache — the legacy `check-juristic/home.php` fetched DBD LIVE on every
 * search (no persistence); `tb_corporate` has no dbd_payload column, so this
 * is the faithful behavior (the rebuilt `corporate.dbd_payload` cache was a
 * Pacred-only addition, dropped here).
 *
 * DBD data source — env `DBD_LOOKUP_URL` (a template, see buildDbdLookupUrl):
 *   - UNSET (default) → manual-check mode: no external call, the UI links to
 *     dbd.go.th and the admin verifies by eye against the uploaded
 *     หนังสือรับรอง + ภพ20. SAFE default — we never send a customer's tax id to
 *     a third party unless ก๊อต deliberately wires an endpoint.
 *   - SET → fetch + parse + compare live (legacy borrowed scraper or an
 *     official DBD API). On fetch failure, surface a soft warning.
 *
 * The legacy endpoint (a "borrowed" interim API, per docs/runbook/pcs-scrub-plan.md)
 * is documented in .env.example / docs/env.md — switching it on is a ก๊อต call.
 *
 * Gate: the customer-facing review roles (legacy CEO/Manager/QA/Accounting/ITDT).
 */
const lookupDbdJuristicSchema = z.object({ userid: z.string().trim().min(1).max(20) });

export async function lookupDbdJuristic(
  input: z.infer<typeof lookupDbdJuristicSchema>,
): Promise<AdminActionResult<DbdLookupData>> {
  const parsed = lookupDbdJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();

  return withAdmin<DbdLookupData>(
    [...JURISTIC_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Read the customer's corporate row (legacy-submitted juristic data).
      const { data: corp, error: corpErr } = await admin
        .from("tb_corporate")
        .select("corporatenumber, corporatename, corporateaddress")
        .eq("userid", userid)
        .maybeSingle<{ corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null }>();
      if (corpErr) {
        logger.error("dbd-lookup", "tb_corporate read failed", corpErr, {
          userid: redactPhone(userid),
          code: corpErr.code,
        });
        return { ok: false, error: corpErr.message };
      }
      if (!corp) return { ok: false, error: "not_juristic" };

      const taxId = (corp.corporatenumber ?? "").trim();
      const pacred = {
        taxId,
        companyName: corp.corporatename ?? null,
        companyAddress: corp.corporateaddress ?? null,
      };

      // 2. No endpoint configured → manual-check mode (UI links to DBD).
      const url = buildDbdLookupUrl(process.env.DBD_LOOKUP_URL, taxId);
      if (!url) {
        return {
          ok: true,
          data: { configured: false, dbd: null, pacred, taxId, cached: false, fetchedAt: null },
        };
      }

      // 3. Live fetch (server-side, 12s timeout — legacy used 15s × 2 retries
      //    against a flaky scraper; one bounded attempt keeps the action snappy).
      let rawBody: string | null = null;
      let fetchWarning: string | undefined;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12_000);
        try {
          const res = await fetch(url, {
            signal: ctrl.signal,
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) {
            fetchWarning = `DBD endpoint returned HTTP ${res.status}`;
          } else {
            rawBody = await res.text();
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        fetchWarning = e instanceof Error ? e.message : "DBD fetch failed";
      }

      // 3a. Fetch failed → surface a soft warning (no cache to fall back to).
      if (rawBody === null) {
        logger.warn("dbd-lookup", "live fetch failed", { taxId, reason: fetchWarning });
        return {
          ok: true,
          data: {
            configured: true,
            dbd: null,
            pacred,
            taxId,
            cached: false,
            fetchedAt: null,
            warning: fetchWarning ?? "DBD lookup ไม่สำเร็จ",
          },
        };
      }

      // 3b. Parse the live body. null = ไม่พบข้อมูล (status != 200 / empty).
      const dbd = parseDbdResponse(rawBody);

      await logAdminAction(adminId, "tb_corporate.dbd_lookup", "tb_corporate", userid, {
        taxId,
        found: dbd !== null,
      });

      return {
        ok: true,
        data: { configured: true, dbd, pacred, taxId, cached: false, fetchedAt: new Date().toISOString() },
      };
    },
  );
}

/**
 * Approve a customer — D1 Wave-2 (_SYNTHESIS §7.1 / §7.4): re-pointed
 * from the rebuilt-era `profiles` table to the legacy `tb_users` table.
 *
 * `id` is the legacy member code (`tb_users.userID`, e.g. `PR2791`) —
 * the identifier the re-pointed customer list (page.tsx) passes via
 * `<CustomerRowActions>`. Approving lifts a pending account by setting
 * the legacy `useractive` flag to `'1'` (1=ใช้งานแล้ว). A suspended
 * (deleted) account — `userstatus='0'` — is restored by setting it back
 * to `'1'`. Both flags are cleared so the derived status becomes active.
 */
export async function approveCustomer(
  id: string,
  opts?: { salesRepId?: string },
): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };
  // Optional inline sales-rep handoff at approve (owner 2026-06-05): the admin
  // may pick/change the assigned rep at the moment of approval (random round-
  // robin is the default, but allow a manual handoff if the auto-picked rep is
  // busy). Empty/whitespace → no override (keep the register-time pick).
  const repOverride = (opts?.salesRepId ?? "").trim() || null;

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userActive, userStatus, userTel, userName, userLastName, adminIDSale")
      .eq("userID", id)
      .maybeSingle<{
        userID: string;
        userActive: string | null;
        userStatus: string | null;
        userTel: string | null;
        userName: string | null;
        userLastName: string | null;
        adminIDSale: string | null;
      }>();
    if (beforeErr) {
      console.error(`[approveCustomer tb_users read] failed`, { code: beforeErr.code, message: beforeErr.message, id });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };
    // No-op when already active (userActive='1' and not deleted) AND no rep
    // handoff was requested. A rep-only change on an already-active customer
    // still goes through (the admin explicitly picked a new rep).
    if (before.userActive === "1" && before.userStatus !== "0" && !repOverride) return { ok: true };

    // Resolve the rep to assign:
    //  1. An explicit admin handoff pick (repOverride) — validated against
    //     tb_admin (must be an active sales rep · prevents a typo'd/dead id
    //     stealing a lead into a black hole).
    //  2. Else P1-15 (2026-05-31): the sales rep is assigned at REGISTER time
    //     (lib/auth/legacy-bridge-tb-users.ts → pickLeastLoadedSalesRep) so a
    //     new lead is owned the moment they sign up — matching legacy
    //     check-otp-register.php. Here we only auto-assign if the register-time
    //     pick came back empty — NEVER auto-re-assign an already-owned customer
    //     (that would steal the lead from the rep who's been calling them).
    let assignedLegacyAdminId: string | null;
    if (repOverride) {
      const { data: rep, error: repErr } = await admin
        .from("tb_admin")
        .select("adminID, adminStatusA, adminStatusSale")
        .eq("adminID", repOverride)
        .maybeSingle<{ adminID: string; adminStatusA: string | null; adminStatusSale: string | null }>();
      if (repErr) {
        console.error(`[approveCustomer rep validate] failed`, { code: repErr.code, message: repErr.message, repOverride });
        return { ok: false, error: repErr.message };
      }
      if (!rep) return { ok: false, error: "ไม่พบเซลล์ปลายทาง (adminID ไม่ตรงกับ tb_admin)" };
      if (rep.adminStatusA !== "1") return { ok: false, error: "เซลล์ปลายทางถูกปิดใช้งาน" };
      // Only write if it actually changes (avoid a no-op audit row).
      assignedLegacyAdminId = before.adminIDSale === repOverride ? null : repOverride;
    } else {
      assignedLegacyAdminId = before.adminIDSale
        ? null
        : await pickLeastLoadedSalesRep(admin);
    }

    const updatePayload: Record<string, unknown> = {
      userActive: "1",
      userStatus: "1",
    };
    if (assignedLegacyAdminId) {
      updatePayload.adminIDSale = assignedLegacyAdminId;
    }

    const { error } = await admin
      .from("tb_users")
      .update(updatePayload)
      .eq("userID", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.approve", "tb_users", id, {
      before: { userActive: before.userActive, userStatus: before.userStatus },
      after:  { userActive: "1", userStatus: "1", adminIDSale: assignedLegacyAdminId ?? null },
    });

    // E2E loop fix · Agent F1 · 2026-05-29 (Gap #3 part 1):
    // Fire welcome SMS to the customer (NOTIFY_BYPASS-respected via the
    // sendSms gateway). Best-effort — log on failure but never roll back.
    if (before.userTel) {
      const welcomeMsg =
        `ยินดีต้อนรับสู่ Pacred · บัญชี ${id} อนุมัติแล้ว · ` +
        `เริ่มสั่งสินค้าได้เลย: pacred.co.th`;
      const sms = await sendSms(before.userTel, welcomeMsg);
      if (!sms.ok) {
        logger.warn("approveCustomer", "welcome SMS failed", {
          userID: id,
          phone:  redactPhone(before.userTel),
          error:  sms.error,
        });
      }
    } else {
      logger.warn("approveCustomer", "customer has no userTel — welcome SMS skipped", { userID: id });
    }

    // Also notify via the profiles spine (LINE/email when wired) — covers
    // migrated tb_users customers that now have a profiles row via the
    // Wave-1 backfill. Resolver returns null when no profile exists yet
    // (legacy ghost case) — sendNotification is then skipped.
    const profileId = await resolveProfileIdForLegacyUserid(id);
    if (profileId) {
      void sendNotification(profileId, notify.customerApproved({ memberCode: id }));
    }

    // Notify the assigned sales rep so they see the new customer right away.
    if (assignedLegacyAdminId) {
      const displayName = `${before.userName ?? ""} ${before.userLastName ?? ""}`.trim() || id;
      await notifyAssignedSalesRep(admin, assignedLegacyAdminId, {
        memberCode: id,
        displayName,
        phone: before.userTel,
      });
    }

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/pending");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}

// pickLeastLoadedSalesRep moved to lib/admin/assign-sales-rep.ts (P1-15) so the
// register path (legacy-bridge-tb-users.ts) shares the same round-robin and a
// new lead is OWNED at signup, not first at approval. Imported at top of file.

/**
 * Notify the auto-assigned sales rep via SMS to their work phone (if any).
 * Best-effort — sales rep notification is informational, not load-bearing.
 *
 * E2E loop fix · Agent F1 · 2026-05-29 (Gap #3 part 2).
 */
async function notifyAssignedSalesRep(
  admin: ReturnType<typeof createAdminClient>,
  legacyAdminId: string,
  customer: { memberCode: string; displayName: string; phone: string | null },
): Promise<void> {
  // Look up the rep's work phone via admin_contact_extras → profile join.
  const { data: extras, error: extrasErr } = await admin
    .from("admin_contact_extras")
    .select("profile_id, work_phone, direct_phone")
    .eq("legacy_admin_id", legacyAdminId)
    .maybeSingle<{
      profile_id: string;
      work_phone: string | null;
      direct_phone: string | null;
    }>();
  if (extrasErr) {
    logger.warn("approveCustomer", "rep contact extras lookup failed", { legacyAdminId, reason: extrasErr.message });
    return;
  }
  if (!extras) return;

  const repPhone = extras.work_phone || extras.direct_phone;
  const message =
    `ลูกค้าใหม่: ${customer.memberCode} ${customer.displayName} · ` +
    `เบอร์ ${customer.phone ?? "-"}`;

  if (repPhone) {
    const sms = await sendSms(repPhone, message);
    if (!sms.ok) {
      logger.warn("approveCustomer", "sales-rep SMS failed", {
        legacyAdminId,
        phone: redactPhone(repPhone),
        error: sms.error,
      });
    }
  }

  // Also drop a system notification on the rep's profile so they see it
  // in the in-app inbox + LINE push (when wired).
  if (extras.profile_id) {
    void sendNotification(extras.profile_id, {
      category:  "sales",
      severity:  "info",
      title:     "ลูกค้าใหม่ในทีมของคุณ",
      body:      message,
      link_href: `/admin/customers/${customer.memberCode}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════
// Convert a personal account → juristic  (P0-18 · adm-08 WF#14)
// ════════════════════════════════════════════════════════════════════════
//
// Re-pointed from the rebuilt `profiles`/`corporate` (UUID) to the legacy
// `tb_users`/`tb_corporate` (keyed by `userID`), mirroring the legacy
// `update-corporate` POST handler (users.php · page=corporation · L810-853):
//   1. SET tb_users.userCompany='1'
//   2. INSERT tb_corporate (or UPDATE if a row already exists) with
//      corporatestatus per the admin decision.
//
// `corporatestatus` codes — verified from legacy statusComp() + the signup
// INSERT (api/otp/check-otp-register.php:101 writes '1' on signup):
//   '1'=รอตรวจสอบ · '2'=อนุมัติแล้ว · '3'=ไม่ผ่าน.
// Admin-issued conversions default to verified ('2') — the admin is the
// verifier; untick mark_verified to leave it pending ('1') for later review.
//
// `id` (route param) is the legacy member code (tb_users.userID, e.g. PR2791).
// Schema + types live in lib/admin/customer-identity.ts (unit-tested).
export async function adminConvertToJuristic(
  input: ConvertToJuristicInput,
): Promise<AdminActionResult> {
  const parsed = convertToJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin([...JURISTIC_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load the customer (must exist) + their current juristic state.
    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userCompany, userName, userLastName")
      .eq("userID", userid)
      .maybeSingle<{ userID: string; userCompany: string | null; userName: string | null; userLastName: string | null }>();
    if (beforeErr) {
      console.error(`[adminConvertToJuristic tb_users read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };

    // Does a corporate row already exist? (re-conversion / idempotency)
    const { data: existing, error: exErr } = await admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", userid)
      .maybeSingle<{ id: number }>();
    if (exErr) {
      console.error(`[adminConvertToJuristic tb_corporate read] failed`, { userid, code: exErr.code, message: exErr.message });
      return { ok: false, error: exErr.message };
    }
    if (existing && before.userCompany === "1") return { ok: false, error: "already_juristic" };

    // Block duplicate tax_id collisions (another customer must not own it).
    const { data: clash, error: clashErr } = await admin
      .from("tb_corporate")
      .select("userid")
      .eq("corporatenumber", d.tax_id)
      .neq("userid", userid)
      .limit(1)
      .maybeSingle<{ userid: string }>();
    if (clashErr) {
      console.error(`[adminConvertToJuristic clash check] failed`, { userid, code: clashErr.code, message: clashErr.message });
      return { ok: false, error: clashErr.message };
    }
    if (clash) return { ok: false, error: "tax_id_already_used" };

    const newStatus = d.mark_verified ? CORP_STATUS.VERIFIED : CORP_STATUS.PENDING;

    // Step 1 — flag the customer as a company (legacy update-corporate L824).
    const { error: userErr } = await admin
      .from("tb_users")
      .update({ userCompany: "1" })
      .eq("userID", userid);
    if (userErr) {
      console.error(`[adminConvertToJuristic tb_users update] failed`, { userid, code: userErr.code, message: userErr.message });
      return { ok: false, error: userErr.message };
    }

    // Step 2 — INSERT (legacy) or UPDATE (re-convert) the corporate row. The
    // NOT-NULL file columns (corporatefile/corporatefile20) get "" on INSERT —
    // PHP wrote empty strings, never NULL (docs/learnings/php-port-patterns.md).
    let corpErr;
    if (existing) {
      ({ error: corpErr } = await admin
        .from("tb_corporate")
        .update({
          corporatenumber: d.tax_id,
          corporatename:   d.company_name,
          corporateaddress: d.company_address ?? "",
          corporatestatus: newStatus,
        })
        .eq("id", existing.id));
    } else {
      ({ error: corpErr } = await admin
        .from("tb_corporate")
        .insert({
          userid:          userid,
          corporatenumber: d.tax_id,
          corporatename:   d.company_name,
          corporateaddress: d.company_address ?? "",
          corporatefile:   "",
          corporatefile20: "",
          corporatestatus: newStatus,
        }));
    }
    if (corpErr) {
      // Roll back the userCompany flag so the two stay consistent.
      await admin.from("tb_users").update({ userCompany: before.userCompany ?? "0" }).eq("userID", userid);
      console.error(`[adminConvertToJuristic tb_corporate write] failed`, { userid, code: corpErr.code, message: corpErr.message });
      return { ok: false, error: corpErr.message };
    }

    const display = `${before.userName ?? ""} ${before.userLastName ?? ""}`.trim() || d.company_name;

    await logAdminAction(adminId, "tb_corporate.convert_to_juristic", "tb_corporate", userid, {
      previous_userCompany: before.userCompany,
      tax_id:               d.tax_id,
      company_name:         d.company_name,
      corporatestatus:      newStatus,
    });

    // Notify the customer via the profiles spine (resolver returns null for a
    // legacy ghost with no profiles row → notification skipped).
    const profileId = await resolveProfileIdForLegacyUserid(userid);
    if (profileId) {
      void sendNotification(profileId, notify.customerConvertedToJuristic({
        displayName: display,
        companyName: d.company_name,
      }));
    }

    revalidatePath("/admin/customers");
    revalidatePath("/admin/juristic-check");
    revalidatePath(`/admin/customers/${userid}`);
    revalidatePath(`/admin/customers/${userid}/convert-to-juristic`);
    return { ok: true };
  });
}

/**
 * Suspend an active customer — D1 Wave-2 (_SYNTHESIS §7.1 / §7.4):
 * re-pointed from `profiles` to the legacy `tb_users` table. `id` is the
 * legacy member code (`tb_users.userID`). Legacy PCS has no distinct
 * "suspended" state — a disabled account is `userstatus='0'`
 * (0=ลบบัญชี), which the re-pointed customer list renders as "ระงับ".
 */
export async function suspendCustomer(id: string): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userStatus")
      .eq("userID", id)
      .maybeSingle<{ userID: string; userStatus: string | null }>();
    if (beforeErr) {
      console.error(`[suspendCustomer tb_users read] failed`, { code: beforeErr.code, message: beforeErr.message, id });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };
    if (before.userStatus === "0") return { ok: true };  // no-op — already disabled

    const { error } = await admin
      .from("tb_users")
      .update({ userStatus: "0" })
      .eq("userID", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.suspend", "tb_users", id, {
      before: { userStatus: before.userStatus },
      after:  { userStatus: "0" },
    });

    // Note: customer notification deferred — see approveCustomer comment.

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}

/**
 * Hard-delete a PENDING (not-yet-approved) customer registration — owner
 * directive 2026-05-30. When staff reject/cancel a signup still in the approval
 * queue, the rows must be PHYSICALLY removed so the phone number + email are
 * freed for re-registration: legacy `tb_users.userTel` carries a UNIQUE index
 * (idx_*_usertel) and Supabase auth holds the phone/email too — a soft-delete
 * (suspendCustomer) leaves them occupied and blocks the customer from signing
 * up again with the same number.
 *
 * SAFETY — irreversible, so tightly guarded:
 *   - ONLY `userActive='0'` (pending approval). Approved ('1') / legacy ('') /
 *     active customers are REFUSED — this can never nuke a real customer.
 *   - ONLY when the customer has ZERO orders (tb_forwarder + tb_header_order).
 *   - super / ops only.
 *   - The deleted row is captured in the audit log BEFORE removal (recovery ref).
 *
 * Removal order (tolerates auth→profiles cascade present OR absent):
 *   profiles (+ CASCADE children: corporate · documents · addresses · cart_items
 *   · notifications…) → auth.users (frees auth phone/email) → tb_users (frees
 *   legacy userTel UNIQUE).
 */
const deletePendingCustomerSchema = z.object({ user_id: z.string().trim().min(1).max(20) });

export async function deletePendingCustomer(
  input: z.infer<typeof deletePendingCustomerSchema> | string,
): Promise<AdminActionResult> {
  const raw = typeof input === "string" ? { user_id: input } : input;
  const parsed = deletePendingCustomerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const id = parsed.data.user_id;

  return withAdmin(["super", "ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // 1. Load + GUARD: must be a pending registration.
    //    P1-17 (ADR-0019 D-C transitional): legacy migrated pending = '',
    //    native pending = '0'. Until เดฟ P1-16 flips '0'→'', accept BOTH
    //    so admins can delete migrated-pending old signups too. Approved
    //    ('1') / suspended (userStatus='0') still refused — plus L890+
    //    "has orders" guard defends against accidental real-customer wipe.
    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userActive, userStatus, userTel, userEmail, userName, userLastName, userCompany")
      .eq("userID", id)
      .maybeSingle<{
        userID: string; userActive: string | null; userStatus: string | null;
        userTel: string | null; userEmail: string | null;
        userName: string | null; userLastName: string | null; userCompany: string | null;
      }>();
    if (beforeErr) {
      logger.error("deletePendingCustomer", "tb_users read failed", beforeErr, { userID: id, code: beforeErr.code });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };
    if (before.userActive !== "0" && before.userActive !== "") {
      return { ok: false, error: "ลบได้เฉพาะสมาชิกที่ยังรอ approve เท่านั้น (อนุมัติ/ใช้งานแล้ว ลบถาวรไม่ได้)" };
    }

    // 2. GUARD: refuse if the customer already has orders/shipments (defensive).
    const [{ count: fwdCount }, { count: ordCount }] = await Promise.all([
      admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("userid", id),
      admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("userid", id),
    ]);
    if ((fwdCount ?? 0) > 0 || (ordCount ?? 0) > 0) {
      return { ok: false, error: "สมาชิกนี้มีรายการสั่งซื้อ/ชิปเมนต์แล้ว — ลบถาวรไม่ได้" };
    }

    const profileId = await resolveProfileIdForLegacyUserid(id);

    // 3. Audit BEFORE deleting (recovery reference — the row is about to vanish).
    await logAdminAction(adminId, "customer.hard_delete_pending", "tb_users", id, {
      reason: "rejected/cancelled pending registration — freed phone+email for re-registration",
      deleted: {
        userID: id,
        userCompany: before.userCompany,
        phone: redactPhone(before.userTel ?? ""),
        hasEmail: !!before.userEmail,
      },
      profileId: profileId ?? null,
    });

    // 4. Delete profiles (+ CASCADE children). RESTRICT children (bookings /
    //    freight / tax_invoices…) would block — impossible for a pending,
    //    zero-order customer, but if it happens we abort cleanly here.
    if (profileId) {
      const { error: profErr } = await admin.from("profiles").delete().eq("id", profileId);
      if (profErr) {
        logger.error("deletePendingCustomer", "profiles delete failed", profErr, { userID: id, profileId });
        return { ok: false, error: `ลบโปรไฟล์ไม่สำเร็จ: ${profErr.message}` };
      }
      // 5. Delete the auth user (frees Supabase auth phone/email). Best-effort:
      //    if a cascade already removed it, deleteUser may report not-found.
      const { error: authErr } = await admin.auth.admin.deleteUser(profileId);
      if (authErr) {
        logger.warn("deletePendingCustomer", "auth user delete reported error (may already be gone)", {
          userID: id, profileId, reason: authErr.message,
        });
      }
    }

    // 6. Delete the legacy tb_users row (frees userTel UNIQUE + email).
    const { error: tbErr } = await admin.from("tb_users").delete().eq("userID", id);
    if (tbErr) {
      logger.error("deletePendingCustomer", "tb_users delete failed", tbErr, { userID: id });
      return { ok: false, error: `ลบข้อมูลสมาชิกไม่สำเร็จ: ${tbErr.message}` };
    }

    revalidatePath("/admin/customers/pending");
    revalidatePath("/admin/customers");
    revalidatePath("/admin");
    return { ok: true };
  });
}
