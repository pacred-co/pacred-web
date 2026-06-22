"use server";

/**
 * Admin-side customer CRUD — the staff-CRUD gap (CLAUDE.md §PM-6 #3.3):
 *
 *   1. adminCreateCustomer    — create a customer WITHOUT self-register/OTP.
 *   2. adminHardDeleteCustomer — super-only HARD delete of a truly-empty
 *                                (0-activity) account (test/orphan rows).
 *
 * Both write the LEGACY `tb_users` SOT (camelCase per migration 0113) +
 * bridge `profiles`/auth so login works. They reuse the SAME register seed
 * helpers (lib/auth/legacy-bridge-tb-users.ts) so an admin-created customer
 * is a FULL tb_* citizen (wallet + cashback rows + sales-rep round-robin),
 * not a half-provisioned orphan.
 *
 * Architecture (§PM-6 §5):
 *   tb_users   = customer SOT (userID = member code PR###).
 *   profiles   = UUID→auth.users bridge for Supabase login.
 *   Round-robin sales pool = tb_admin adminStatusA='1' AND adminStatusSale='1'
 *     (admin_pee + admin_may · lib/admin/assign-sales-rep.ts), never null.
 */

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { logger, redactPhone } from "@/lib/logger";
import { normalizePhone } from "@/lib/utils/phone";
import {
  insertLegacyTbUserRow,
  findLegacyUserIdByPhone,
  upsertLegacyCorporate,
} from "@/lib/auth/legacy-bridge-tb-users";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { signCustomerLoginToken } from "@/lib/auth/customer-magic-link";
import { CORP_STATUS } from "@/lib/admin/customer-identity";
import {
  adminCreateCustomerSchema,
  hardDeleteCustomerSchema,
  type AdminCreateCustomerInput,
  type AdminCreateCustomerData,
  type HardDeleteCustomerInput,
} from "@/lib/validators/customer-admin";

// ════════════════════════════════════════════════════════════════════════
// FEATURE 1 — admin-create-customer (no self-register / no OTP)
// ════════════════════════════════════════════════════════════════════════

// Alphanumeric, no visually-confusable chars (O / 0 / l / 1 / I) — same set as
// the password-reset flow so an admin can relay an auto-generated password by
// phone/LINE without mis-types.
const PWD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += PWD_ALPHABET[bytes[i]! % PWD_ALPHABET.length];
  return out;
}

/**
 * Create a customer from the admin console — no self-register, no OTP, no
 * captcha. The admin is trusted; the SMS round-trip is skipped. Mirrors the
 * faithful self-register seed (actions/auth.ts → registerPersonal) EXCEPT:
 *   - auth.users is created with phone_confirm + email_confirm true (no OTP).
 *   - the customer lands userActive='1' (ACTIVE immediately), not '0' (pending)
 *     — an admin-created account doesn't go through the approval queue.
 *
 * Seed tables (same as register): auth.users → profiles (trigger mints
 * member_code) → tb_users (sales-rep round-robin) → tb_wallet + tb_cash_back
 * (seedLegacyWalletRows inside insertLegacyTbUserRow). Juristic → tb_corporate
 * (verified) + userCompany='1'.
 *
 * Role gate: super / ops / sales_admin (creating customers is a sales/ops act).
 * Returns the minted member code + the cleartext password (revealed ONCE so
 * the admin can hand it to the customer — never persisted to the audit log).
 */
export async function adminCreateCustomer(
  input: AdminCreateCustomerInput,
): Promise<AdminActionResult<AdminCreateCustomerData>> {
  const parsed = adminCreateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    const phone = normalizePhone(d.phone);
    const email = d.email && d.email.trim().length > 0 ? d.email.trim() : null;

    // Identity guard (mirrors register · the PR005 orphan defense): refuse when
    // the phone already belongs to an existing customer. Creating a second
    // identity for the same phone mints a parallel orphan disconnected from the
    // real tb_users account. Surface the existing code so the admin can find it.
    const existingUserId = await findLegacyUserIdByPhone(admin, phone);
    if (existingUserId) {
      return { ok: false, error: `เบอร์นี้มีลูกค้าอยู่แล้ว: ${existingUserId}` };
    }

    // Validate any explicit เซลล์/CS pick against the active pool BEFORE we
    // provision anything — fail fast so we never half-create a customer and
    // then reject. Blank = auto (the seed's round-robin picks the least-loaded).
    // tb_admin is camelCase per migration 0113 (assign-sales-rep.ts queries it
    // the same way). The flag columns: adminStatusSale='1' (is a เซลล์),
    // adminStatusCS='1' (is a CS · migration 0141), adminStatusA='1' (active).
    const wantSalesRep = (d.salesRepId ?? "").trim();
    const wantCsRep = (d.csRepId ?? "").trim();
    // Compose the staff note saved to tb_users.userNote: a "บริการที่ใช้" line
    // (the selected service chips · de-duped, order-preserved) above the
    // free-text remark. Both land in the SAME field the customer profile
    // shows/edits — "เลือกเพื่อโน๊ต".
    const services = Array.from(
      new Set((d.services ?? []).map((s) => s.trim()).filter(Boolean)),
    );
    const freeNote = (d.note ?? "").trim();
    const note = [
      services.length > 0 ? `บริการที่ใช้: ${services.join(", ")}` : "",
      freeNote,
    ]
      .filter(Boolean)
      .join("\n");
    if (wantSalesRep || wantCsRep) {
      const ids = Array.from(new Set([wantSalesRep, wantCsRep].filter(Boolean)));
      const { data: pool, error: poolErr } = await admin
        .from("tb_admin")
        .select("adminID, adminStatusA, adminStatusSale, adminStatusCS")
        .in("adminID", ids);
      if (poolErr) {
        logger.error("adminCreateCustomer", "tb_admin pool validation failed", poolErr, {});
        return { ok: false, error: "ตรวจสอบเซลล์/CS ไม่สำเร็จ ลองอีกครั้ง" };
      }
      const byId = new Map(
        (pool ?? []).map((r) => [
          (r as { adminID: string }).adminID,
          r as { adminStatusA: string | null; adminStatusSale: string | null; adminStatusCS: string | null },
        ]),
      );
      if (wantSalesRep) {
        const row = byId.get(wantSalesRep);
        if (!row || row.adminStatusA !== "1" || row.adminStatusSale !== "1") {
          return { ok: false, error: "เซลล์ที่เลือกไม่ถูกต้องหรือไม่ได้เปิดใช้งาน" };
        }
      }
      if (wantCsRep) {
        const row = byId.get(wantCsRep);
        if (!row || row.adminStatusA !== "1" || row.adminStatusCS !== "1") {
          return { ok: false, error: "CS ที่เลือกไม่ถูกต้องหรือไม่ได้เปิดใช้งาน" };
        }
      }
    }

    const generated = !(d.password && d.password.length > 0);
    const password = generated ? generatePassword(8) : d.password!;

    // 1. Create the auth user — phone+email confirmed (no OTP / no provider SMS).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
      email: email ?? undefined,
      email_confirm: !!email,
      user_metadata: { first_name: d.firstName, last_name: d.lastName },
    });
    if (createErr || !created.user) {
      logger.error("adminCreateCustomer", "auth createUser failed", createErr ?? undefined, {
        phone: redactPhone(phone),
      });
      return { ok: false, error: createErr?.message ?? "สร้างผู้ใช้ไม่สำเร็จ" };
    }

    // 2. Insert profiles (trigger mints member_code). On failure, delete the
    //    orphan auth.user so the phone/email free up for a retry (mirrors
    //    registerPersonal's cleanup).
    const accountType = d.isJuristic ? "juristic" : "personal";
    const { data: profileRow, error: profileErr } = await admin
      .from("profiles")
      .insert({
        id: created.user.id,
        account_type: accountType,
        first_name: d.firstName,
        last_name: d.lastName,
        phone,
        email,
        status: "active",
      })
      .select("member_code")
      .single<{ member_code: string | null }>();
    if (profileErr || !profileRow?.member_code) {
      logger.error("adminCreateCustomer", "profiles insert failed — cleaning up auth user", profileErr ?? undefined, {
        userId: created.user.id,
        code: profileErr?.code,
      });
      const { error: delErr } = await admin.auth.admin.deleteUser(created.user.id);
      if (delErr) {
        logger.error("adminCreateCustomer", "orphan auth.user cleanup failed", delErr, { userId: created.user.id });
      }
      return { ok: false, error: profileErr?.message ?? "สร้างโปรไฟล์ไม่สำเร็จ" };
    }

    const memberCode = profileRow.member_code;

    // 3. Seed the legacy tb_users row + money-plane rows (tb_wallet +
    //    tb_cash_back) + sales-rep round-robin — the SAME helper register uses.
    //    insertLegacyTbUserRow defaults userActive='0' (pending); step 4 flips
    //    it to '1' (admin-created = active, skips the approval queue).
    const seeded = await insertLegacyTbUserRow(admin, {
      memberCode,
      phone,
      email,
      accountType,
      firstName: d.firstName,
      lastName: d.lastName,
    });
    if (!seeded.ok) {
      // The auth + profile are committed; the tb_users mirror is the source of
      // the admin-visible customer. Surface the failure loud (rare — only a
      // schema/RLS problem reaches here) so the admin retries rather than
      // believing they created a customer that ops can't see.
      logger.error("adminCreateCustomer", "tb_users seed failed", undefined, {
        memberCode,
        reason: seeded.error,
      });
      return { ok: false, error: `สร้างข้อมูลลูกค้าไม่สำเร็จ: ${seeded.error ?? "tb_users seed"}` };
    }

    // 4. Flip userActive '0' → '1' (admin-created customers are active right
    //    away — no pending-approval window). The round-robin sales rep written
    //    by the bridge stays (the lead is already owned).
    //
    //    `.select()` to ALSO detect the no-row case: insertLegacyTbUserRow
    //    no-ops (returns ok) if the phone already belongs to ANOTHER tb_users
    //    row that our upstream findLegacyUserIdByPhone guard skipped (a
    //    userStatus='0' soft-deleted account holds the phone). In that case no
    //    tb_users row exists under THIS member_code → the customer is a
    //    half-created orphan (auth+profile but no ops-visible row). Detect it,
    //    clean up auth+profile, and surface the collision rather than report
    //    a phantom success.
    const { data: flipped, error: activeErr } = await admin
      .from("tb_users")
      .update({ userActive: "1", userStatus: "1" })
      .eq("userID", memberCode)
      .select("userID");
    if (activeErr) {
      // Non-fatal — the row exists + is visible; an admin can Approve from
      // the queue. Log loud rather than roll back a committed signup.
      logger.warn("adminCreateCustomer", "userActive flip failed — customer left pending", {
        memberCode,
        reason: activeErr.message,
      });
    } else if (!flipped || flipped.length === 0) {
      // No tb_users row under this member_code → seed no-opped on a phone
      // collision. Roll back the orphan auth+profile so the phone/email free up.
      logger.error("adminCreateCustomer", "tb_users row missing after seed — phone collision orphan", undefined, {
        memberCode,
        phone: redactPhone(phone),
      });
      await admin.from("profiles").delete().eq("id", created.user.id);
      const { error: delErr } = await admin.auth.admin.deleteUser(created.user.id);
      if (delErr) {
        logger.error("adminCreateCustomer", "orphan cleanup (collision) failed", delErr, { userId: created.user.id });
      }
      return { ok: false, error: "เบอร์นี้ถูกใช้แล้วในระบบ (อาจเป็นบัญชีที่ถูกระงับ) — สร้างไม่สำเร็จ" };
    }

    // 4.5 — post-seed tb_users customizations the create form collected:
    //       · เซลล์/CS override — insertLegacyTbUserRow already round-robined
    //         BOTH adminIDSale + adminIDCS (every customer is owned at create);
    //         overwrite only what the admin explicitly picked (validated against
    //         the active pool above).
    //       · userNote — the staff remark (same field the profile shows/edits).
    //       Best-effort: the customer exists + is owned; a failed write just
    //       keeps the round-robin pick / empty note (log loud, never roll back a
    //       committed signup).
    const postSeed: Record<string, string> = {};
    if (wantSalesRep) postSeed.adminIDSale = wantSalesRep;
    if (wantCsRep) postSeed.adminIDCS = wantCsRep;
    if (note) postSeed.userNote = note;
    if (Object.keys(postSeed).length > 0) {
      const { error: psErr } = await admin
        .from("tb_users")
        .update(postSeed)
        .eq("userID", memberCode);
      if (psErr) {
        logger.warn("adminCreateCustomer", "post-seed tb_users update failed — kept round-robin pick / empty note", {
          memberCode,
          reason: psErr.message,
        });
      }
    }

    // 5. Juristic — mirror the company data into the LEGACY tb_corporate (keyed
    //    by userid = member_code) + flag userCompany='1'. Admin-created juristic
    //    defaults verified ('2') — the admin is the verifier. Best-effort: the
    //    customer already exists; a corporate-write miss is recoverable by ops.
    if (d.isJuristic && d.companyName && d.taxId) {
      const corp = await upsertLegacyCorporate(admin, {
        memberCode,
        corporateNumber: d.taxId.trim(),
        corporateName: d.companyName.trim(),
        corporateAddress: (d.companyAddress ?? "").trim(),
      });
      if (corp.ok) {
        // upsertLegacyCorporate writes status '1' (pending) — bump to verified
        // for an admin-created juristic (the admin vouches for it).
        await admin.from("tb_corporate").update({ corporatestatus: CORP_STATUS.VERIFIED }).eq("userid", memberCode);
        await admin.from("tb_users").update({ userCompany: "1" }).eq("userID", memberCode);
      } else {
        logger.warn("adminCreateCustomer", "tb_corporate seed failed for juristic", {
          memberCode,
          reason: corp.error,
        });
      }
    }

    // 6. Audit (cleartext password NEVER logged — only the fact of creation).
    await logAdminAction(adminId, "customer.admin_create", "tb_users", memberCode, {
      created_by: adminId,
      account_type: accountType,
      phone: redactPhone(phone),
      hasEmail: !!email,
      isJuristic: d.isJuristic,
      password_generated: generated,
      salesRepChosen: wantSalesRep || "(auto)",
      csRepChosen: wantCsRep || "(auto)",
      services: services.length > 0 ? services.join(", ") : "(none)",
      note_set: freeNote.length > 0,
    });

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/pending");
    // New customer provisioned → refresh the admin sidebar customer badges.
    bustAdminChrome();

    // Magic-login capability token (owner 2026-06-22) — the success panel turns
    // this into `/k/<token>`, a non-expiring OTP-gated link the staff sends the
    // customer to log straight into their own account.
    const loginLinkToken = signCustomerLoginToken(memberCode);

    return { ok: true, data: { memberCode, password, generated, loginLinkToken } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// FEATURE 2 — admin HARD-delete (super-only · truly-empty accounts only)
// ════════════════════════════════════════════════════════════════════════
//
// ⚠️ IRREVERSIBLE. This physically removes auth.users + profiles + tb_users
// (+ the empty seed rows). It is the cleanup tool for test/orphan rows — NOT a
// customer-management action. STRONG guards (refuse unless EVERY condition
// holds):
//   - super ONLY (requireAdmin(["super"]) via withAdmin).
//   - double-confirm: the schema requires confirm === user_id (the admin types
//     the PR-code); re-checked here server-side.
//   - SAFETY GATE — refuse if the customer has ANY of:
//       · orders/shipments (tb_forwarder · tb_header_order · tb_payment)
//       · a non-zero wallet balance (tb_wallet.wallettotal ≠ 0)
//       · any wallet history (tb_wallet_hs — money ever moved)
//     → only truly-empty, 0-activity accounts (the test/orphan/phone-collision
//       rows from §PM-6 #2) can be hard-deleted.
//   - the FULL row snapshot is captured in the audit log BEFORE removal.
//
// This is stricter than the existing deletePendingCustomer (actions/admin/
// customers.ts), which only frees a *pending* signup's phone. This one allows
// deleting an ACTIVE-but-empty account too (a provisioned test row), gated
// behind super + the wallet checks deletePendingCustomer doesn't do.

export async function adminHardDeleteCustomer(
  input: HardDeleteCustomerInput,
): Promise<AdminActionResult> {
  const parsed = hardDeleteCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const id = parsed.data.user_id.toUpperCase();

  // SUPER ONLY — the most destructive customer action in the app.
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Defense-in-depth — re-verify the typed confirmation matches (the schema
    // already enforces this, but a destructive op double-checks).
    if (parsed.data.confirm.toUpperCase() !== id) {
      return { ok: false, error: "รหัสยืนยันไม่ตรงกับรหัสสมาชิก" };
    }

    // 1. Load the customer (must exist) + snapshot for the audit log.
    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userActive, userStatus, userTel, userEmail, userName, userLastName, userCompany, adminIDSale, userRegistered")
      .eq("userID", id)
      .maybeSingle<{
        userID: string; userActive: string | null; userStatus: string | null;
        userTel: string | null; userEmail: string | null;
        userName: string | null; userLastName: string | null;
        userCompany: string | null; adminIDSale: string | null; userRegistered: string | null;
      }>();
    if (beforeErr) {
      logger.error("adminHardDeleteCustomer", "tb_users read failed", beforeErr, { userID: id, code: beforeErr.code });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };

    // 2. SAFETY GATE — refuse if the account has ANY order/shipment activity.
    const [{ count: fwdCount }, { count: ordCount }, { count: payCount }] = await Promise.all([
      admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("userid", id),
      admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("userid", id),
      admin.from("tb_payment").select("id", { count: "exact", head: true }).eq("userid", id),
    ]);
    if ((fwdCount ?? 0) > 0 || (ordCount ?? 0) > 0 || (payCount ?? 0) > 0) {
      return {
        ok: false,
        error: `ลบถาวรไม่ได้ — ลูกค้านี้มีรายการ (ฝากนำเข้า ${fwdCount ?? 0} · ฝากสั่ง ${ordCount ?? 0} · ฝากโอน ${payCount ?? 0}). ลบได้เฉพาะบัญชีที่ไม่มีกิจกรรมเลย (test/orphan).`,
      };
    }

    // 3. SAFETY GATE — refuse on a non-zero wallet balance OR any wallet
    //    history (money ever moved through this account). tb_wallet keyed by
    //    lowercase `userid`; balance numeric. tb_wallet_hs = the ledger.
    const { data: wallet, error: walletErr } = await admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", id)
      .maybeSingle<{ wallettotal: number | null }>();
    if (walletErr) {
      logger.error("adminHardDeleteCustomer", "tb_wallet read failed", walletErr, { userID: id });
      return { ok: false, error: walletErr.message };
    }
    const balance = Number(wallet?.wallettotal ?? 0);
    if (balance !== 0) {
      return { ok: false, error: `ลบถาวรไม่ได้ — ยอดกระเป๋าเงินไม่เป็นศูนย์ (฿${balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}).` };
    }

    const { count: walletHsCount, error: walletHsErr } = await admin
      .from("tb_wallet_hs")
      .select("id", { count: "exact", head: true })
      .eq("userid", id);
    if (walletHsErr) {
      logger.error("adminHardDeleteCustomer", "tb_wallet_hs read failed", walletHsErr, { userID: id });
      return { ok: false, error: walletHsErr.message };
    }
    if ((walletHsCount ?? 0) > 0) {
      return { ok: false, error: `ลบถาวรไม่ได้ — มีประวัติกระเป๋าเงิน ${walletHsCount} รายการ (เคยมีการเคลื่อนไหวเงิน).` };
    }

    const profileId = await resolveProfileIdForLegacyUserid(id);

    // 4. Audit the FULL snapshot BEFORE deleting (the only recovery reference —
    //    the rows are about to vanish).
    await logAdminAction(adminId, "customer.admin_hard_delete", "tb_users", id, {
      deleted_by: adminId,
      reason: "super hard-delete of a zero-activity (test/orphan) account",
      snapshot: {
        userID: before.userID,
        userName: before.userName,
        userLastName: before.userLastName,
        userCompany: before.userCompany,
        userActive: before.userActive,
        userStatus: before.userStatus,
        adminIDSale: before.adminIDSale,
        userRegistered: before.userRegistered,
        phone: redactPhone(before.userTel ?? ""),
        hasEmail: !!before.userEmail,
      },
      profileId: profileId ?? null,
    });

    // 5. Delete profiles (+ CASCADE children: corporate · documents · addresses
    //    · cart_items · notifications…). A RESTRICT child (bookings/freight/
    //    tax_invoices) would block — impossible for a 0-activity account, but if
    //    it somehow fires we abort cleanly here (nothing else deleted yet).
    if (profileId) {
      const { error: profErr } = await admin.from("profiles").delete().eq("id", profileId);
      if (profErr) {
        logger.error("adminHardDeleteCustomer", "profiles delete failed", profErr, { userID: id, profileId });
        return { ok: false, error: `ลบโปรไฟล์ไม่สำเร็จ: ${profErr.message}` };
      }
      // 6. Delete the auth user (frees Supabase auth phone/email). Best-effort:
      //    a cascade may have already removed it (deleteUser → not-found).
      const { error: authErr } = await admin.auth.admin.deleteUser(profileId);
      if (authErr) {
        logger.warn("adminHardDeleteCustomer", "auth user delete reported error (may already be gone)", {
          userID: id, profileId, reason: authErr.message,
        });
      }
    }

    // 7. Delete the legacy loose-coupled rows keyed by `userid` (the legacy
    //    tb_* dump carries NO FK to tb_users, so profiles' CASCADE never reaches
    //    them — clean them explicitly so no orphan row keeps the phone/data).
    //    The money-plane rows (tb_wallet / tb_cash_back) are verified
    //    zero-balance/zero-history above. Order: all children first so nothing
    //    FK-blocks the tb_users parent delete (only tb_forwarder_tax_invoice
    //    has a RESTRICT FK, and a 0-order account can't have one).
    await admin.from("tb_wallet").delete().eq("userid", id);
    await admin.from("tb_cash_back").delete().eq("userid", id);
    await admin.from("tb_corporate").delete().eq("userid", id);
    await admin.from("tb_address").delete().eq("userid", id);
    await admin.from("tb_address_main").delete().eq("userid", id);

    const { error: tbErr } = await admin.from("tb_users").delete().eq("userID", id);
    if (tbErr) {
      logger.error("adminHardDeleteCustomer", "tb_users delete failed", tbErr, { userID: id });
      return { ok: false, error: `ลบข้อมูลลูกค้าไม่สำเร็จ: ${tbErr.message}` };
    }

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/pending");
    // Customer hard-deleted (incl. their tb_wallet/tb_cash_back rows) → the
    // customer queue + wallet-total badges changed; refresh the admin sidebar.
    bustAdminChrome();

    return { ok: true };
  });
}
