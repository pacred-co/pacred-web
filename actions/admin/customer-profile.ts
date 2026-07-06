"use server";

/**
 * Admin customer-profile mutations — faithful port of the legacy PCS
 * `users.php` (page=profile) POST handlers + the `include/pages/address/*`
 * AJAX handlers. (เดฟ 2026-05-30)
 *
 * Why a NEW file: keeps the profile-page completion disjoint from the
 * existing rate editor (actions/admin/customer-rate.ts) + the rebuilt-
 * schema customer actions (actions/admin/customers.ts, which write the
 * mostly-empty `profiles`/`corporate` Pacred-native tables). EVERYTHING
 * here writes the LEGACY `tb_*` tables that the profile page reads, so the
 * back-office + the customer portal + PHP staff all see one consistent
 * record (no split-brain).
 *
 * Source verified directly from
 *   <legacy>/member/pcs-admin/users.php
 *     - updateAdminIDSale   ~L199-218 → tb_users.adminIDSale
 *     - add-address         ~L220-287 → tb_address (+ first-addr auto-main)
 *     - update (addr edit)  ~L288-331 → tb_address
 *     - update-corporate    ~L594-642 → tb_corporate (UPDATE-only · file skipped)
 *     - update_userNote     ~L643-653 → tb_users.userNote
 *   <legacy>/member/pcs-admin/include/pages/address/
 *     - deleteAddress.php   → refuse if addressID is the main address, else DELETE
 *     - setMainAddress.php  → UPDATE tb_address_main.addressID (UPSERT here)
 *
 * Column casing (verified vs prod schema 0081 + camelCase pilot 0113):
 *   tb_users      = camelCase  (userID, userNote, adminIDSale)
 *   tb_corporate  = lowercase  (id, userid, corporatenumber, corporatename, corporateaddress)
 *   tb_address    = lowercase  (addressid, userid, addressname, …, addressstatus)
 *   tb_address_main = lowercase (id, addressid, userid)
 *   tb_admin      = camelCase  (adminID, adminName, adminLastName, adminNickname, adminStatusA, adminStatusSale)
 *
 * NOT-NULL note: our migrated tb_address declares addressnote/adminid/
 * latitude/longitude NOT NULL (the MySQL original relied on implicit
 * defaults). We therefore supply explicit fallbacks on INSERT.
 */

import { revalidatePath } from "next/cache";
import { bustCustomerChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadToBucket } from "@/lib/storage/upload";
import {
  CORPORATE_DOC_TYPES,
  type CorporateDoc,
  type CorporateDocType,
  parseCorporateDocs,
} from "@/lib/admin/corporate-docs";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Role gate for every write here (per task brief).
// 2026-07-05 (owner) — added `sales` (Cargo Sales Staff) so the Sales/CS staff
// tier can edit the profile (incl. upload นิติ docs + assign the ทีม Pricing reps)
// with NO PIN — matches the profile-page gate ops/sales_admin/sales/accounting + god.
const WRITE_ROLES = ["super", "accounting", "sales_admin", "sales", "ops"] as const;

// ── resolve the acting admin's legacy adminID (for audit columns) ─────────
// Mirrors the helper in customer-rate.ts. tb_address.adminid + the rep
// string stored in tb_users.adminIDSale both expect the legacy varchar.
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[customer-profile auth.getUser] failed`, { code: authErr.code, message: authErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[customer-profile tb_admin] failed`, { code: error.code, message: error.message });
  }
  return ((data?.adminID || email.split("@")[0] || "system")).slice(0, 20); // 2026-06-05 varchar(20)
}

const useridSchema = z.string().trim().min(1).max(20);

// ────────────────────────────────────────────────────────────
// Task 2 reader — the 8 stat-card counts (cheap COUNT/head queries)
// ────────────────────────────────────────────────────────────
//
// Sources verified from legacy profile.php L75-129:
//   ฝากสั่งซื้อ      = COUNT(tb_header_order) by userid
//   ฝากนำเข้า       = COUNT(tb_forwarder)    by userid
//   ฝากชำระ/โอน     = COUNT(tb_payment)      by userid
//   wallet balance  = SUM(tb_wallet.wallettotal)
//   ชำระเงิน        = COUNT(tb_wallet_hs WHERE type='1')
//   ชำระเงิน        = COUNT(tb_wallet_hs WHERE type IN ('2','4','6','7'))
//   ถอนเงิน         = COUNT(tb_wallet_hs WHERE type='3')
//   Cash Back       = COUNT(tb_cash_back_hs) by userid
//
// tb_wallet_hs.type is varchar(1) → compare with strings, NOT numbers.
// Each field is independently nullable: a single query failure logs +
// degrades that ONE card to `null` (rendered as "—") rather than blowing
// up the whole profile (AGENTS §0c — never show a WRONG number).
export type CustomerStatCounts = {
  shop: number | null;
  forwarder: number | null;
  payment: number | null;
  walletAdd: number | null;
  walletPay: number | null;
  walletWithdraw: number | null;
  cashBack: number | null;
};

type CountResult = { count: number | null; error: { code?: string; message?: string } | null };

function reduceCount(label: string, uid: string, res: CountResult): number | null {
  if (res.error) {
    console.error(`[getCustomerStatCounts ${label}] failed`, { uid, code: res.error.code, message: res.error.message });
    return null;
  }
  return res.count ?? 0;
}

export async function getCustomerStatCounts(userid: string): Promise<CustomerStatCounts> {
  const admin = createAdminClient();
  const uid = userid.trim();

  // Each is an independent COUNT/head query (cheap — no rows transferred).
  // A failure on one logs + degrades that single card to null ("—").
  const [shopRes, forwarderRes, paymentRes, addRes, payRes, withdrawRes, cashBackRes] = await Promise.all([
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("userid", uid),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("userid", uid),
    admin.from("tb_payment").select("id", { count: "exact", head: true }).eq("userid", uid),
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("userid", uid).eq("type", "1"),
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("userid", uid).in("type", ["2", "4", "6", "7"]),
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("userid", uid).eq("type", "3"),
    admin.from("tb_cash_back_hs").select("cbhid", { count: "exact", head: true }).eq("userid", uid),
  ]);

  return {
    shop: reduceCount("shop", uid, shopRes),
    forwarder: reduceCount("forwarder", uid, forwarderRes),
    payment: reduceCount("payment", uid, paymentRes),
    walletAdd: reduceCount("walletAdd", uid, addRes),
    walletPay: reduceCount("walletPay", uid, payRes),
    walletWithdraw: reduceCount("walletWithdraw", uid, withdrawRes),
    cashBack: reduceCount("cashBack", uid, cashBackRes),
  };
}

// ────────────────────────────────────────────────────────────
// Task 6 reader — active sales admins for the editSale dropdown
// ────────────────────────────────────────────────────────────
//
// Faithful to legacy: the editSale modal lists admins from tb_admin and
// writes the chosen tb_admin.adminID straight into tb_users.adminIDSale.
// We read tb_admin DIRECTLY (camelCase, post-0113) + filter to active +
// sales-eligible (adminStatusA='1' AND adminStatusSale='1') — this is
// what populates the legacy badge-sale dropdown. (Unlike the rebuilt
// transfer-rep bridge in admins.ts, this needs NO admin_contact_extras
// recreation, so it works on prod today.)
export type SalesAdminOption = {
  adminID: string;
  name: string;
  nickname: string | null;
};

export async function listSalesAdmins(): Promise<AdminActionResult<{ rows: SalesAdminOption[] }>> {
  return withAdmin<{ rows: SalesAdminOption[] }>([...WRITE_ROLES], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname, adminStatusSale")
      .eq("adminStatusA", "1")
      .eq("adminStatusSale", "1")
      .order("adminNickname", { ascending: true })
      .limit(500);
    if (error) {
      console.error(`[listSalesAdmins tb_admin] failed`, { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    type Raw = { adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null };
    const rows: SalesAdminOption[] = ((data ?? []) as unknown as Raw[])
      .filter((r) => !!r.adminID)
      .map((r) => ({
        adminID: r.adminID,
        name: `${r.adminName ?? ""} ${r.adminLastName ?? ""}`.trim() || r.adminID,
        nickname: r.adminNickname,
      }));
    return { ok: true, data: { rows } };
  });
}

// ────────────────────────────────────────────────────────────
// CS reader — active CS admins for the CS-rep dropdown (FEATURE 1)
// ────────────────────────────────────────────────────────────
//
// CS twin of listSalesAdmins. Same shape, but filters tb_admin on the
// CS flag (adminStatusCS='1') instead of the sales flag (adminStatusSale).
// Populates the in-profile "CS ผู้ดูแล" reassign dropdown. Writes to
// tb_users.adminIDCS (migration 0141) via adminUpdateUserCsRep below.
export async function listCsAdmins(): Promise<AdminActionResult<{ rows: SalesAdminOption[] }>> {
  return withAdmin<{ rows: SalesAdminOption[] }>([...WRITE_ROLES], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname, adminStatusCS")
      .eq("adminStatusA", "1")
      .eq("adminStatusCS", "1")
      .order("adminNickname", { ascending: true })
      .limit(500);
    if (error) {
      console.error(`[listCsAdmins tb_admin] failed`, { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    type Raw = { adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null };
    const rows: SalesAdminOption[] = ((data ?? []) as unknown as Raw[])
      .filter((r) => !!r.adminID)
      .map((r) => ({
        adminID: r.adminID,
        name: `${r.adminName ?? ""} ${r.adminLastName ?? ""}`.trim() || r.adminID,
        nickname: r.adminNickname,
      }));
    return { ok: true, data: { rows } };
  });
}

// ────────────────────────────────────────────────────────────
// Extra-reps reader — active admins for the ล่ามจีน / Pricing / ผู้สั่งซื้อ
// dropdowns (owner 2026-06-26). FEATURE D.
// ────────────────────────────────────────────────────────────
//
// Unlike sales/CS there is no dedicated tb_admin status flag for these three
// roles, so the dropdown lists every ACTIVE admin (adminStatusA='1'). Same
// shape as listSalesAdmins/listCsAdmins so the UI components are interchangeable.
export async function listActiveAdmins(): Promise<AdminActionResult<{ rows: SalesAdminOption[] }>> {
  // 2026-07-06 (owner ④) — the ผู้สั่งซื้อ reassign UI on /admin/service-orders +
  // /admin/forwarders needs this active-admin list for interpreter/purchaser_lead
  // too (they can reassign). Read-only name list → safe to widen the gate.
  return withAdmin<{ rows: SalesAdminOption[] }>(
    [...WRITE_ROLES, "interpreter", "purchaser_lead"],
    async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname")
      .eq("adminStatusA", "1")
      .order("adminNickname", { ascending: true })
      .limit(500);
    if (error) {
      console.error(`[listActiveAdmins tb_admin] failed`, { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    type Raw = { adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null };
    const rows: SalesAdminOption[] = ((data ?? []) as unknown as Raw[])
      .filter((r) => !!r.adminID)
      .map((r) => ({
        adminID: r.adminID,
        name: `${r.adminName ?? ""} ${r.adminLastName ?? ""}`.trim() || r.adminID,
        nickname: r.adminNickname,
      }));
    return { ok: true, data: { rows } };
  });
}

// ────────────────────────────────────────────────────────────
// editInterpreter / editPricing / editPurchaser — extra owner-reps
// (owner 2026-06-26 · FEATURE D · twins of editCs / editSale).
// ────────────────────────────────────────────────────────────
//
// Each is a 1:1 mirror of adminUpdateUserCsRep: UPDATE tb_users SET <col>=$adminID
// after VALIDATING the chosen adminID exists + is active in tb_admin
// (adminStatusA='1'). Writes the legacy varchar(20) column (migration 0217)
// the profile page reads. No money/status side-effects.
//
// Factored into ONE helper so the three are provably identical (same ownership,
// audit, validation, revalidate shape) — only the target column + the log action
// name differ.
const extraRepSchema = z.object({
  userid: useridSchema,
  adminID: z.string().trim().min(1, "เลือกผู้ดูแล").max(20),
});

async function updateUserExtraRep(
  input: z.infer<typeof extraRepSchema>,
  opts: { column: "adminIDInterpreter" | "adminIDPricing" | "adminIDPurchaser"; logAction: string; roleLabel: string },
): Promise<AdminActionResult> {
  const parsed = extraRepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();
  const adminID = parsed.data.adminID;
  const { column, logAction, roleLabel } = opts;

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Validate the target admin.
    const { data: rep, error: repErr } = await admin
      .from("tb_admin")
      .select("adminID, adminStatusA")
      .eq("adminID", adminID)
      .maybeSingle<{ adminID: string; adminStatusA: string | null }>();
    if (repErr) {
      console.error(`[updateUserExtraRep ${column} rep read] failed`, { adminID, code: repErr.code, message: repErr.message });
      return { ok: false, error: repErr.message };
    }
    if (!rep) return { ok: false, error: `ไม่พบ${roleLabel}ปลายทาง (adminID ไม่ตรงกับ tb_admin)` };
    if (rep.adminStatusA !== "1") return { ok: false, error: `${roleLabel}ปลายทางถูกปิดใช้งาน` };

    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select(`userID, ${column}`)
      .eq("userID", userid)
      .maybeSingle<{ userID: string } & Record<string, string | null>>();
    if (beforeErr) {
      console.error(`[updateUserExtraRep ${column} customer read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };
    if (before[column] === adminID) return { ok: true }; // no-op

    const { error } = await admin
      .from("tb_users")
      .update({ [column]: adminID })
      .eq("userID", userid);
    if (error) {
      console.error(`[updateUserExtraRep ${column} update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, logAction, "tb_users", userid, {
      before: before[column] ?? null,
      after: adminID,
    });
    revalidatePath(`/admin/customers/${userid}`);
    // Bust the customer-chrome cache so any sidebar surface that ever reads these
    // refreshes immediately (mirrors the sales/CS rep busts).
    bustCustomerChrome();
    return { ok: true };
  });
}

export async function adminUpdateUserInterpreter(input: z.infer<typeof extraRepSchema>): Promise<AdminActionResult> {
  return updateUserExtraRep(input, { column: "adminIDInterpreter", logAction: "tb_users.update_interpreter", roleLabel: "ล่ามจีน" });
}
export async function adminUpdateUserPricing(input: z.infer<typeof extraRepSchema>): Promise<AdminActionResult> {
  return updateUserExtraRep(input, { column: "adminIDPricing", logAction: "tb_users.update_pricing", roleLabel: "Pricing" });
}
export async function adminUpdateUserPurchaser(input: z.infer<typeof extraRepSchema>): Promise<AdminActionResult> {
  return updateUserExtraRep(input, { column: "adminIDPurchaser", logAction: "tb_users.update_purchaser", roleLabel: "ผู้สั่งซื้อ" });
}

// ────────────────────────────────────────────────────────────
// Task 3 — inline edit note (tb_users.userNote)
// ────────────────────────────────────────────────────────────
const noteSchema = z.object({
  userid: useridSchema,
  note: z.string().max(2000),
});

export async function adminUpdateUserNote(
  input: z.infer<typeof noteSchema>,
): Promise<AdminActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();
  const note = parsed.data.note.trim();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userNote")
      .eq("userID", userid)
      .maybeSingle<{ userID: string; userNote: string | null }>();
    if (beforeErr) {
      console.error(`[adminUpdateUserNote read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };

    const { error } = await admin
      .from("tb_users")
      .update({ userNote: note })
      .eq("userID", userid);
    if (error) {
      console.error(`[adminUpdateUserNote update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_users.update_note", "tb_users", userid, {
      before: before.userNote ?? null,
      after: note,
    });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Task 6 — editSale (tb_users.adminIDSale)
// ────────────────────────────────────────────────────────────
//
// Legacy updateAdminIDSale: UPDATE tb_users SET adminIDSale=$adminIDSale.
// We additionally VALIDATE the chosen adminID exists + is sales-active in
// tb_admin (prevents typo'd / dead rep ids). Writing the legacy varchar
// keeps the profile badge + PHP staff in sync. This is the canonical
// reassign path; the former split-brain (the rebuilt transfer-rep page wrote
// profiles.sales_admin_id) was fixed 2026-06-02 — adminTransferSalesRep +
// crm.setCustomerSalesRep now also write tb_users.adminIDSale.
const saleRepSchema = z.object({
  userid: useridSchema,
  adminID: z.string().trim().min(1, "เลือกเซลล์").max(20),
});

export async function adminUpdateUserSaleRep(
  input: z.infer<typeof saleRepSchema>,
): Promise<AdminActionResult> {
  const parsed = saleRepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();
  const adminID = parsed.data.adminID;

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Validate the target rep.
    const { data: rep, error: repErr } = await admin
      .from("tb_admin")
      .select("adminID, adminStatusA, adminStatusSale")
      .eq("adminID", adminID)
      .maybeSingle<{ adminID: string; adminStatusA: string | null; adminStatusSale: string | null }>();
    if (repErr) {
      console.error(`[adminUpdateUserSaleRep rep read] failed`, { adminID, code: repErr.code, message: repErr.message });
      return { ok: false, error: repErr.message };
    }
    if (!rep) return { ok: false, error: "ไม่พบเซลล์ปลายทาง (adminID ไม่ตรงกับ tb_admin)" };
    if (rep.adminStatusA !== "1") return { ok: false, error: "เซลล์ปลายทางถูกปิดใช้งาน" };

    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, adminIDSale")
      .eq("userID", userid)
      .maybeSingle<{ userID: string; adminIDSale: string | null }>();
    if (beforeErr) {
      console.error(`[adminUpdateUserSaleRep customer read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };
    if (before.adminIDSale === adminID) return { ok: true }; // no-op

    const { error } = await admin
      .from("tb_users")
      .update({ adminIDSale: adminID })
      .eq("userID", userid);
    if (error) {
      console.error(`[adminUpdateUserSaleRep update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_users.update_sale_rep", "tb_users", userid, {
      before: before.adminIDSale ?? null,
      after: adminID,
    });
    revalidatePath(`/admin/customers/${userid}`);
    // 2026-06-08 follow-up (Lane 1 batch · ภูม): bust the customer-chrome
    // `unstable_cache` (60s TTL) so the "ผู้ดูแล" sidebar card on the customer's
    // portal refreshes the moment the sales-rep is reassigned (mirrors the CS
    // bust at L394). Without this, the sidebar shows the OLD rep for up to 60s.
    bustCustomerChrome();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// editCs (tb_users.adminIDCS) — FEATURE 1 · CS twin of editSale
// ────────────────────────────────────────────────────────────
//
// CS twin of adminUpdateUserSaleRep: UPDATE tb_users SET adminIDCS=$adminID.
// VALIDATEs the chosen adminID exists + is CS-active in tb_admin
// (adminStatusA='1' AND adminStatusCS='1') before writing — prevents typo'd /
// dead CS ids. Writes the legacy varchar tb_users.adminIDCS (migration 0141)
// which resolveCsRep (lib/legacy/pcs-chrome.ts) reads to render the customer-
// sidebar CS contact. Mirrors the sales reassign exactly (same ownership /
// audit / revalidatePath shape).
const csRepSchema = z.object({
  userid: useridSchema,
  adminID: z.string().trim().min(1, "เลือก CS").max(20),
});

export async function adminUpdateUserCsRep(
  input: z.infer<typeof csRepSchema>,
): Promise<AdminActionResult> {
  const parsed = csRepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();
  const adminID = parsed.data.adminID;

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Validate the target CS.
    const { data: rep, error: repErr } = await admin
      .from("tb_admin")
      .select("adminID, adminStatusA, adminStatusCS")
      .eq("adminID", adminID)
      .maybeSingle<{ adminID: string; adminStatusA: string | null; adminStatusCS: string | null }>();
    if (repErr) {
      console.error(`[adminUpdateUserCsRep rep read] failed`, { adminID, code: repErr.code, message: repErr.message });
      return { ok: false, error: repErr.message };
    }
    if (!rep) return { ok: false, error: "ไม่พบ CS ปลายทาง (adminID ไม่ตรงกับ tb_admin)" };
    if (rep.adminStatusA !== "1") return { ok: false, error: "CS ปลายทางถูกปิดใช้งาน" };
    if (rep.adminStatusCS !== "1") return { ok: false, error: "admin ปลายทางไม่ได้เปิดสิทธิ์ CS" };

    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, adminIDCS")
      .eq("userID", userid)
      .maybeSingle<{ userID: string; adminIDCS: string | null }>();
    if (beforeErr) {
      console.error(`[adminUpdateUserCsRep customer read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };
    if (before.adminIDCS === adminID) return { ok: true }; // no-op

    const { error } = await admin
      .from("tb_users")
      .update({ adminIDCS: adminID })
      .eq("userID", userid);
    if (error) {
      console.error(`[adminUpdateUserCsRep update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_users.update_cs_rep", "tb_users", userid, {
      before: before.adminIDCS ?? null,
      after: adminID,
    });
    revalidatePath(`/admin/customers/${userid}`);
    // 2026-06-05: bust the unstable_cache wrapping loadPcsChromeData (tag set in
    // lib/legacy/pcs-chrome.ts:478-482) so the customer's sidebar "ผู้ดูแล" card
    // refreshes immediately instead of waiting up to 60s for the TTL to lapse.
    // Mirror of the spec for FEATURE 1 — the assigned CS appears live next time
    // the customer (or this admin in customer-view mode) lands on a protected
    // page. (Uses the shared helper that wraps the Next-16 2-arg revalidateTag.)
    bustCustomerChrome();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Task 4 — edit นิติบุคคล (tb_corporate · UPDATE-only, file deferred)
// ────────────────────────────────────────────────────────────
//
// Legacy update-corporate UPDATEs an EXISTING tb_corporate row's number/
// name/address (and optionally the uploaded file). It never INSERTs from
// this handler — a customer creates their corporate row on signup. We
// mirror UPDATE-only. PDF upload (corporateFile/corporateFile20) is
// bannered "รอบหน้า" per the brief; we never null those NOT-NULL columns.
const corporateSchema = z.object({
  userid: useridSchema,
  corporatenumber: z.string().trim().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้อง 13 หลัก"),
  corporatename: z.string().trim().min(1, "กรอกชื่อบริษัท").max(300),
  corporateaddress: z.string().trim().min(1, "กรอกที่อยู่บริษัท").max(2000),
});

export async function adminUpdateCorporate(
  input: z.infer<typeof corporateSchema>,
): Promise<AdminActionResult> {
  const parsed = corporateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: beforeErr } = await admin
      .from("tb_corporate")
      .select("id, corporatenumber, corporatename, corporateaddress")
      .eq("userid", userid)
      .maybeSingle<{ id: number; corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null }>();
    if (beforeErr) {
      console.error(`[adminUpdateCorporate read] failed`, { userid, code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: beforeErr.message };
    }
    // UPDATE-only (legacy semantics): the corporate row must already exist.
    if (!before) {
      return { ok: false, error: "ลูกค้ายังไม่มีข้อมูลนิติบุคคล — ลูกค้าต้องกรอกข้อมูลบริษัทจากฝั่งสมาชิกก่อน" };
    }

    const { error } = await admin
      .from("tb_corporate")
      .update({
        corporatenumber: d.corporatenumber,
        corporatename: d.corporatename,
        corporateaddress: d.corporateaddress,
      })
      .eq("id", before.id);
    if (error) {
      console.error(`[adminUpdateCorporate update] failed`, { userid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_corporate.update", "tb_corporate", userid, {
      before: {
        corporatenumber: before.corporatenumber,
        corporatename: before.corporatename,
        corporateaddress: before.corporateaddress,
      },
      after: {
        corporatenumber: d.corporatenumber,
        corporatename: d.corporatename,
        corporateaddress: d.corporateaddress,
      },
    });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Task 4b — บุคคล → นิติบุคคล: convert + multi-doc upload + verify
// (owner 2026-06-26 · BEYOND legacy: legacy set juristic at signup only +
// 2 single doc files. Here an admin can UPGRADE a personal customer, attach
// MANY typed docs [ภพ.20/หนังสือรับรอง/บัตรกรรมการ/อื่นๆ], and verify.)
// LIVE tables: juristic marker = tb_users.userCompany='1' · data = tb_corporate
// · docs = tb_corporate.corporate_docs jsonb (mig 0214 · legacy
// corporatefile/corporatefile20 kept + mirrored for the 2 legacy types).
// ────────────────────────────────────────────────────────────

// CORPORATE_DOC_TYPES / CorporateDoc / parseCorporateDocs live in
// @/lib/admin/corporate-docs (this is a "use server" file → only async
// functions may be exported, so the const + pure parser + types moved out).
const CORPORATE_DOCS_CAP = 30;

function isMissingDocsColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /corporate_docs/i.test(err.message ?? "");
}
const DOCS_NOT_READY =
  "คลังเอกสารนิติฯ ยังไม่พร้อม — ต้องรัน migration 0214 (corporate_docs) บน prod ก่อน · แจ้งทีม backend";

// adminConvertToJuristic — upgrade a PERSONAL customer → นิติบุคคล (set the
// userCompany='1' marker + INSERT the tb_corporate row, pending verify).
const convertSchema = z.object({
  userid: useridSchema,
  corporatenumber: z.string().trim().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้อง 13 หลัก"),
  corporatename: z.string().trim().min(1, "กรอกชื่อบริษัท").max(300),
  corporateaddress: z.string().trim().min(1, "กรอกที่อยู่บริษัท").max(2000),
});
export async function adminConvertToJuristic(
  input: z.infer<typeof convertSchema>,
): Promise<AdminActionResult> {
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: u, error: uErr } = await admin
      .from("tb_users").select("userID, userCompany").eq("userID", userid)
      .maybeSingle<{ userID: string; userCompany: string | null }>();
    if (uErr) {
      console.error(`[adminConvertToJuristic user] failed`, { userid, code: uErr.code, message: uErr.message });
      return { ok: false, error: uErr.message };
    }
    if (!u) return { ok: false, error: "ไม่พบลูกค้า" };

    const { data: existing, error: exErr } = await admin
      .from("tb_corporate").select("id").eq("userid", userid).maybeSingle<{ id: number }>();
    if (exErr) {
      console.error(`[adminConvertToJuristic existing] failed`, { userid, code: exErr.code, message: exErr.message });
      return { ok: false, error: exErr.message };
    }
    if (existing) {
      // Repair the flag if it drifted, but don't double-insert.
      if (u.userCompany !== "1") await admin.from("tb_users").update({ userCompany: "1" }).eq("userID", userid);
      return { ok: false, error: "ลูกค้ารายนี้มีข้อมูลนิติบุคคลอยู่แล้ว — แก้ที่ฟอร์มข้อมูลบริษัท" };
    }

    const { error: flagErr } = await admin.from("tb_users").update({ userCompany: "1" }).eq("userID", userid);
    if (flagErr) {
      console.error(`[adminConvertToJuristic flag] failed`, { userid, code: flagErr.code, message: flagErr.message });
      return { ok: false, error: flagErr.message };
    }

    const { error: insErr } = await admin.from("tb_corporate").insert({
      userid,
      corporatenumber: d.corporatenumber,
      corporatename: d.corporatename,
      corporateaddress: d.corporateaddress,
      corporatefile: "",
      corporatefile20: "",
      corporatestatus: "1", // รอตรวจสอบ
      cpdatecreate: new Date().toISOString(),
    });
    if (insErr) {
      // Roll back the flag so we never leave a juristic-marked customer with no row.
      await admin.from("tb_users").update({ userCompany: u.userCompany ?? "" }).eq("userID", userid);
      console.error(`[adminConvertToJuristic insert] failed`, { userid, code: insErr.code, message: insErr.message });
      return { ok: false, error: insErr.message };
    }

    await logAdminAction(adminId, "tb_corporate.convert", "tb_corporate", userid, {
      corporatenumber: d.corporatenumber, corporatename: d.corporatename,
    });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// adminUploadCorporateDoc — attach ONE typed doc (multi-call for many). FormData:
// `userid` + `docType` (vat|affidavit|director_id|other) + `file`. Appends to the
// corporate_docs jsonb gallery; mirrors the 2 legacy single columns when empty.
export async function adminUploadCorporateDoc(formData: FormData): Promise<AdminActionResult> {
  const userid = String(formData.get("userid") ?? "").trim().toUpperCase();
  const docType = String(formData.get("docType") ?? "").trim();
  const file = formData.get("file");
  if (!userid) return { ok: false, error: "ไม่พบรหัสลูกค้า" };
  if (!(CORPORATE_DOC_TYPES as readonly string[]).includes(docType)) return { ok: false, error: "ประเภทเอกสารไม่ถูกต้อง" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์" };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "ไฟล์ใหญ่เกิน 5 MB — เลือกไฟล์ใหม่" };

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: corp, error: cErr } = await admin
      .from("tb_corporate").select("id, corporate_docs, corporatefile, corporatefile20").eq("userid", userid)
      .maybeSingle<{ id: number; corporate_docs: unknown; corporatefile: string | null; corporatefile20: string | null }>();
    if (cErr) {
      if (isMissingDocsColumn(cErr)) return { ok: false, error: DOCS_NOT_READY };
      console.error(`[adminUploadCorporateDoc read] failed`, { userid, code: cErr.code, message: cErr.message });
      return { ok: false, error: cErr.message };
    }
    if (!corp) return { ok: false, error: "ลูกค้ายังไม่เป็นนิติบุคคล — กดอัปเกรดเป็นนิติฯ ก่อน" };

    const current = parseCorporateDocs(corp.corporate_docs);
    if (current.length >= CORPORATE_DOCS_CAP) return { ok: false, error: `อัปได้สูงสุด ${CORPORATE_DOCS_CAP} ไฟล์ — ลบบางไฟล์ก่อน` };

    const upload = await uploadToBucket(file, "member-docs", `corporate/${userid}/${docType}`);
    if (!upload.ok) return { ok: false, error: upload.error ?? "อัปโหลดไม่สำเร็จ" };

    const next: CorporateDoc[] = [
      ...current,
      { type: docType as CorporateDocType, key: upload.filename, name: file.name.slice(0, 200), at: new Date().toISOString() },
    ];
    const update: Record<string, unknown> = { corporate_docs: next };
    if (docType === "affidavit" && !(corp.corporatefile && corp.corporatefile.trim() !== "")) update.corporatefile = upload.filename;
    if (docType === "vat" && !(corp.corporatefile20 && corp.corporatefile20.trim() !== "")) update.corporatefile20 = upload.filename;

    const { error: upErr } = await admin.from("tb_corporate").update(update).eq("id", corp.id);
    if (upErr) {
      if (isMissingDocsColumn(upErr)) return { ok: false, error: DOCS_NOT_READY };
      console.error(`[adminUploadCorporateDoc update] failed`, { userid, code: upErr.code, message: upErr.message });
      return { ok: false, error: upErr.message };
    }

    await logAdminAction(adminId, "tb_corporate.add_doc", "tb_corporate", userid, { type: docType, name: file.name, count: next.length });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// adminRemoveCorporateDoc — drop one doc KEY from the gallery (storage GC'd later).
const removeDocSchema = z.object({ userid: useridSchema, key: z.string().trim().min(1).max(500) });
export async function adminRemoveCorporateDoc(input: z.infer<typeof removeDocSchema>): Promise<AdminActionResult> {
  const parsed = removeDocSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data; const userid = d.userid.toUpperCase();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: corp, error: cErr } = await admin
      .from("tb_corporate").select("id, corporate_docs, corporatefile, corporatefile20").eq("userid", userid)
      .maybeSingle<{ id: number; corporate_docs: unknown; corporatefile: string | null; corporatefile20: string | null }>();
    if (cErr) {
      if (isMissingDocsColumn(cErr)) return { ok: false, error: DOCS_NOT_READY };
      console.error(`[adminRemoveCorporateDoc read] failed`, { userid, code: cErr.code, message: cErr.message });
      return { ok: false, error: cErr.message };
    }
    if (!corp) return { ok: false, error: "ไม่พบข้อมูลนิติบุคคล" };

    const current = parseCorporateDocs(corp.corporate_docs);
    const next = current.filter((x) => x.key !== d.key);
    const isLegacyKey = (corp.corporatefile ?? "") === d.key || (corp.corporatefile20 ?? "") === d.key;
    // Not in the gallery AND not one of the 2 legacy single columns → nothing to remove.
    if (next.length === current.length && !isLegacyKey) return { ok: false, error: "ไม่พบเอกสารที่จะลบ" };

    const update: Record<string, unknown> = { corporate_docs: next };
    if ((corp.corporatefile ?? "") === d.key) update.corporatefile = "";
    if ((corp.corporatefile20 ?? "") === d.key) update.corporatefile20 = "";

    const { error: upErr } = await admin.from("tb_corporate").update(update).eq("id", corp.id);
    if (upErr) {
      console.error(`[adminRemoveCorporateDoc update] failed`, { userid, code: upErr.code, message: upErr.message });
      return { ok: false, error: upErr.message };
    }
    await logAdminAction(adminId, "tb_corporate.remove_doc", "tb_corporate", userid, { key: d.key, count: next.length });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// adminSetCorporateStatus — the verify step (ตรวจ): 1=รอตรวจสอบ · 2=อนุมัติ · 3=ไม่ผ่าน.
const statusSchema = z.object({ userid: useridSchema, status: z.enum(["1", "2", "3"]) });
export async function adminSetCorporateStatus(input: z.infer<typeof statusSchema>): Promise<AdminActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data; const userid = d.userid.toUpperCase();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: corp, error: cErr } = await admin
      .from("tb_corporate").select("id, corporatestatus").eq("userid", userid)
      .maybeSingle<{ id: number; corporatestatus: string | null }>();
    if (cErr) {
      console.error(`[adminSetCorporateStatus read] failed`, { userid, code: cErr.code, message: cErr.message });
      return { ok: false, error: cErr.message };
    }
    if (!corp) return { ok: false, error: "ไม่พบข้อมูลนิติบุคคล" };

    const { error: upErr } = await admin.from("tb_corporate").update({ corporatestatus: d.status }).eq("id", corp.id);
    if (upErr) {
      console.error(`[adminSetCorporateStatus update] failed`, { userid, code: upErr.code, message: upErr.message });
      return { ok: false, error: upErr.message };
    }
    await logAdminAction(adminId, "tb_corporate.set_status", "tb_corporate", userid, { from: corp.corporatestatus, to: d.status });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Task 5 — Address CRUD (tb_address + tb_address_main)
// ────────────────────────────────────────────────────────────
const addressFields = {
  addressname: z.string().trim().min(1, "กรอกชื่อจริง").max(200),
  addresslastname: z.string().trim().min(1, "กรอกนามสกุล").max(200),
  addresstel: z.string().trim().regex(/^\d{9,10}$/, "เบอร์โทร 9-10 หลัก (ไม่มีขีด)"),
  addresstel2: z.string().trim().regex(/^\d{9,10}$/, "เบอร์สำรอง 9-10 หลัก").or(z.literal("")),
  addressno: z.string().trim().min(1, "กรอกที่อยู่").max(200),
  addresssubdistrict: z.string().trim().min(1, "กรอกตำบล/แขวง").max(255),
  addressdistrict: z.string().trim().min(1, "กรอกอำเภอ/เขต").max(255),
  addressprovince: z.string().trim().min(1, "กรอกจังหวัด").max(255),
  addresszipcode: z.string().trim().regex(/^\d{5}$/, "รหัสไปรษณีย์ 5 หลัก"),
  addressnote: z.string().trim().max(255).optional().default(""),
};

const addAddressSchema = z.object({ userid: useridSchema, ...addressFields });

export async function adminAddAddress(
  input: z.infer<typeof addAddressSchema>,
): Promise<AdminActionResult<{ addressid: number }>> {
  const parsed = addAddressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin<{ addressid: number }>([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = await resolveLegacyAdminId();

    // Customer must exist.
    const { data: cust, error: custErr } = await admin
      .from("tb_users")
      .select("userID")
      .eq("userID", userid)
      .maybeSingle<{ userID: string }>();
    if (custErr) {
      console.error(`[adminAddAddress customer read] failed`, { userid, code: custErr.code, message: custErr.message });
      return { ok: false, error: custErr.message };
    }
    if (!cust) return { ok: false, error: "ไม่พบลูกค้า" };

    // INSERT the address. Our migrated schema declares addressnote/adminid/
    // latitude/longitude NOT NULL → supply explicit fallbacks (the MySQL
    // original relied on implicit defaults).
    const { data: inserted, error: insErr } = await admin
      .from("tb_address")
      .insert({
        addressstatus: "1",
        addressname: d.addressname,
        addresslastname: d.addresslastname,
        addresstel: d.addresstel,
        addresstel2: d.addresstel2 || "",
        addressno: d.addressno,
        addresssubdistrict: d.addresssubdistrict,
        addressdistrict: d.addressdistrict,
        addressprovince: d.addressprovince,
        addresszipcode: d.addresszipcode,
        addressnote: d.addressnote ?? "",
        userid,
        adminid: legacyAdminId,
        latitude: 0,
        longitude: 0,
      })
      .select("addressid")
      .single<{ addressid: number }>();
    if (insErr || !inserted) {
      console.error(`[adminAddAddress insert] failed`, { userid, code: insErr?.code, message: insErr?.message });
      return { ok: false, error: insErr?.message ?? "insert_failed" };
    }

    // First-address-auto-main (legacy users.php L277-283): if the customer
    // has no main-address row yet, point it at this new address.
    const { data: mainRow, error: mainErr } = await admin
      .from("tb_address_main")
      .select("id")
      .eq("userid", userid)
      .maybeSingle<{ id: number }>();
    if (mainErr) {
      console.error(`[adminAddAddress main read] failed`, { userid, code: mainErr.code, message: mainErr.message });
      // Non-fatal — the address is saved; main-flag just may not be set.
    } else if (!mainRow) {
      const { error: mainInsErr } = await admin
        .from("tb_address_main")
        .insert({ addressid: inserted.addressid, userid });
      if (mainInsErr) {
        console.error(`[adminAddAddress main insert] failed`, { userid, code: mainInsErr.code, message: mainInsErr.message });
      }
    }

    await logAdminAction(adminId, "tb_address.add", "tb_address", `${userid}/${inserted.addressid}`, {
      addressid: inserted.addressid,
    });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true, data: { addressid: inserted.addressid } };
  });
}

const editAddressSchema = z.object({
  userid: useridSchema,
  addressid: z.coerce.number().int().positive(),
  ...addressFields,
});

export async function adminUpdateAddress(
  input: z.infer<typeof editAddressSchema>,
): Promise<AdminActionResult> {
  const parsed = editAddressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the address belongs to this customer (guard cross-customer edit).
    const { data: owner, error: ownerErr } = await admin
      .from("tb_address")
      .select("addressid, userid")
      .eq("addressid", d.addressid)
      .maybeSingle<{ addressid: number; userid: string }>();
    if (ownerErr) {
      console.error(`[adminUpdateAddress owner read] failed`, { addressid: d.addressid, code: ownerErr.code, message: ownerErr.message });
      return { ok: false, error: ownerErr.message };
    }
    if (!owner) return { ok: false, error: "ไม่พบที่อยู่" };
    if (owner.userid !== userid) return { ok: false, error: "ที่อยู่นี้ไม่ใช่ของลูกค้ารายนี้" };

    const { error } = await admin
      .from("tb_address")
      .update({
        addressname: d.addressname,
        addresslastname: d.addresslastname,
        addresstel: d.addresstel,
        addresstel2: d.addresstel2 || "",
        addressno: d.addressno,
        addresssubdistrict: d.addresssubdistrict,
        addressdistrict: d.addressdistrict,
        addressprovince: d.addressprovince,
        addresszipcode: d.addresszipcode,
        addressnote: d.addressnote ?? "",
      })
      .eq("addressid", d.addressid);
    if (error) {
      console.error(`[adminUpdateAddress update] failed`, { addressid: d.addressid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_address.update", "tb_address", `${userid}/${d.addressid}`, {
      addressid: d.addressid,
    });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

const deleteAddressSchema = z.object({
  userid: useridSchema,
  addressid: z.coerce.number().int().positive(),
});

export async function adminDeleteAddress(
  input: z.infer<typeof deleteAddressSchema>,
): Promise<AdminActionResult> {
  const parsed = deleteAddressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify ownership.
    const { data: owner, error: ownerErr } = await admin
      .from("tb_address")
      .select("addressid, userid")
      .eq("addressid", d.addressid)
      .maybeSingle<{ addressid: number; userid: string }>();
    if (ownerErr) {
      console.error(`[adminDeleteAddress owner read] failed`, { addressid: d.addressid, code: ownerErr.code, message: ownerErr.message });
      return { ok: false, error: ownerErr.message };
    }
    if (!owner) return { ok: false, error: "ไม่พบที่อยู่" };
    if (owner.userid !== userid) return { ok: false, error: "ที่อยู่นี้ไม่ใช่ของลูกค้ารายนี้" };

    // Legacy guard (deleteAddress.php L5-10): refuse if this is the main
    // address — the customer must set another address as main first.
    const { data: mainRow, error: mainErr } = await admin
      .from("tb_address_main")
      .select("id")
      .eq("userid", userid)
      .eq("addressid", d.addressid)
      .maybeSingle<{ id: number }>();
    if (mainErr) {
      console.error(`[adminDeleteAddress main read] failed`, { addressid: d.addressid, code: mainErr.code, message: mainErr.message });
      return { ok: false, error: mainErr.message };
    }
    if (mainRow) {
      return { ok: false, error: "ลบที่อยู่หลักไม่ได้ — ตั้งที่อยู่อื่นเป็นที่อยู่หลักก่อน" };
    }

    const { error } = await admin.from("tb_address").delete().eq("addressid", d.addressid);
    if (error) {
      console.error(`[adminDeleteAddress delete] failed`, { addressid: d.addressid, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_address.delete", "tb_address", `${userid}/${d.addressid}`, {
      addressid: d.addressid,
    });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

const setMainAddressSchema = z.object({
  userid: useridSchema,
  addressid: z.coerce.number().int().positive(),
});

export async function adminSetMainAddress(
  input: z.infer<typeof setMainAddressSchema>,
): Promise<AdminActionResult> {
  const parsed = setMainAddressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const userid = d.userid.toUpperCase();

  return withAdmin([...WRITE_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the target address belongs to this customer.
    const { data: owner, error: ownerErr } = await admin
      .from("tb_address")
      .select("addressid, userid")
      .eq("addressid", d.addressid)
      .maybeSingle<{ addressid: number; userid: string }>();
    if (ownerErr) {
      console.error(`[adminSetMainAddress owner read] failed`, { addressid: d.addressid, code: ownerErr.code, message: ownerErr.message });
      return { ok: false, error: ownerErr.message };
    }
    if (!owner) return { ok: false, error: "ไม่พบที่อยู่" };
    if (owner.userid !== userid) return { ok: false, error: "ที่อยู่นี้ไม่ใช่ของลูกค้ารายนี้" };

    // UPSERT tb_address_main (legacy setMainAddress.php UPDATEs; if no row
    // exists yet we INSERT — covers the legacy case where the main row was
    // never created).
    const { data: mainRow, error: mainErr } = await admin
      .from("tb_address_main")
      .select("id")
      .eq("userid", userid)
      .maybeSingle<{ id: number }>();
    if (mainErr) {
      console.error(`[adminSetMainAddress main read] failed`, { userid, code: mainErr.code, message: mainErr.message });
      return { ok: false, error: mainErr.message };
    }

    if (mainRow) {
      const { error } = await admin
        .from("tb_address_main")
        .update({ addressid: d.addressid })
        .eq("id", mainRow.id);
      if (error) {
        console.error(`[adminSetMainAddress update] failed`, { userid, code: error.code, message: error.message });
        return { ok: false, error: error.message };
      }
    } else {
      const { error } = await admin
        .from("tb_address_main")
        .insert({ addressid: d.addressid, userid });
      if (error) {
        console.error(`[adminSetMainAddress insert] failed`, { userid, code: error.code, message: error.message });
        return { ok: false, error: error.message };
      }
    }

    await logAdminAction(adminId, "tb_address.set_main", "tb_address_main", `${userid}/${d.addressid}`, {
      addressid: d.addressid,
    });
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}
