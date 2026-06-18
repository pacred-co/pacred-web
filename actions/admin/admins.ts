"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { findLegacyUserIdByPhone } from "@/lib/auth/legacy-bridge-tb-users";
import { normalizePhone } from "@/lib/utils/phone";
import {
  AdminCreateSchema,
  AdminUpdateSchema,
  AdminToggleActiveSchema,
  AdminChangeRoleSchema,
  adminRoleSchema,
  hasAnyHRField,
} from "@/lib/validators/admin-form";
import type {
  AdminCreateInput,
  AdminUpdateInput,
  AdminToggleActiveInput,
  AdminChangeRoleInput,
} from "@/lib/validators/admin-form";

// 2026-06-16 — consolidated onto the FULL 24-role `adminRoleSchema`
// (lib/validators/admin-form.ts · ADMIN_ROLES). Previously this was a
// STALE 7-value enum (super/ops/accounting/sales_admin/warehouse/driver/
// interpreter) that silently rejected grants of manager/sales/qa/pricing +
// the 13 freight roles — so adminGrantRole/adminToggleRole below could not
// grant any newer role. The grid + /edit form route through
// adminChangeRole/adminToggleActive (already full-24); this keeps the older
// grant/toggle actions consistent so NO role is ungrantable from any path.
const ROLE = adminRoleSchema;

// ────────────────────────────────────────────────────────────
// Grant role to an existing profile
// ────────────────────────────────────────────────────────────
const grantSchema = z.object({
  profile_id: z.string().uuid(),
  role:       ROLE,
});

export async function adminGrantRole(input: z.infer<typeof grantSchema>): Promise<AdminActionResult> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admins")
      .upsert(
        { profile_id: parsed.data.profile_id, role: parsed.data.role, is_active: true, granted_by: adminId, granted_at: new Date().toISOString() },
        { onConflict: "profile_id,role" },
      );
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin.grant", "admins", `${parsed.data.profile_id}/${parsed.data.role}`, parsed.data);
    revalidatePath("/admin/admins");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Toggle active / inactive (don't drop the row so history stays)
// ────────────────────────────────────────────────────────────
const toggleSchema = z.object({
  profile_id: z.string().uuid(),
  role:       ROLE,
  is_active:  z.boolean(),
});

export async function adminToggleRole(input: z.infer<typeof toggleSchema>): Promise<AdminActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admins")
      .update({ is_active: parsed.data.is_active })
      .eq("profile_id", parsed.data.profile_id)
      .eq("role", parsed.data.role);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin.toggle", "admins", `${parsed.data.profile_id}/${parsed.data.role}`, parsed.data);
    revalidatePath("/admin/admins");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Update admin's contact extras (display_name, direct_phone, department)
// ────────────────────────────────────────────────────────────
const contactSchema = z.object({
  profile_id:   z.string().uuid(),
  display_name: z.string().trim().max(200).optional(),
  direct_phone: z.string().trim().max(50).optional(),
  department:   z.string().trim().max(100).optional(),
  section:      z.string().trim().max(100).optional(),
});

export async function adminUpdateContactExtras(input: z.infer<typeof contactSchema>): Promise<AdminActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admin_contact_extras")
      .upsert(
        {
          profile_id:   d.profile_id,
          display_name: d.display_name ?? null,
          direct_phone: d.direct_phone ?? null,
          department:   d.department ?? null,
          section:      d.section ?? null,
        },
        { onConflict: "profile_id" },
      );
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin.contact_update", "admin_contact_extras", d.profile_id, d);
    revalidatePath("/admin/admins");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Assign sales rep to a customer (sets profiles.sales_admin_id)
// Available to super OR sales_admin
//
// ⚠️ 2026-06-02 — DEAD-WRITE TOMBSTONE (0 callers). Writes ONLY the rebuilt
// `profiles.sales_admin_id`, which no live surface reads. DO NOT wire this to
// any UI — it would be a silent dead-write (§0e). The reachable reassign paths
// are: adminTransferSalesRep (this file · per-customer + bulk-via-loop),
// adminBulkTransferSalesRepTb (this file · /admin/customers/transfer-rep bulk),
// adminUpdateUserSaleRep (customer-profile.ts · inline editor), and
// setCustomerSalesRep (crm.ts) — all write the LIVE tb_users.adminIDSale.
// ────────────────────────────────────────────────────────────
const assignRepSchema = z.object({
  customer_id:    z.string().uuid(),
  sales_admin_id: z.string().nullable(),                     // null = unassign
});

export async function adminAssignSalesRep(input: z.infer<typeof assignRepSchema>): Promise<AdminActionResult> {
  const parsed = assignRepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ sales_admin_id: parsed.data.sales_admin_id })
      .eq("id", parsed.data.customer_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.assign_rep", "profile", parsed.data.customer_id, parsed.data);
    revalidatePath(`/admin/customers/${parsed.data.customer_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Transfer a customer's sales rep WITH a reason and dual-side notification.
// Port of legacy PHP `transferSalesCustomers.php` for the single-customer
// case. Bulk transfer is a separate workflow (adminBulkTransferSalesRep).
//
// Difference from adminAssignSalesRep():
//   • mandatory non-empty `reason` (audited)
//   • surfaces who the previous rep was in the audit payload
//   • fires three in-app notifications:
//       - the old rep ("ลูกค้า X ถูกย้ายออกจากทีมของท่าน")
//       - the new rep ("ลูกค้า X ถูกย้ายเข้าทีมของท่าน")
//       - the customer    ("ทีมเซลล์ของท่านถูกย้ายไปดูแลโดย Y")
//     (the second + third skip silently if either id is null)
//
// 🔴 2026-06-02 — DEATH FIX (sales-rep reassignment). The input ids are Pacred
// profile UUIDs (the combobox returns admins.profile_id; the page passes
// profiles.id), but the LIVE column-of-truth the whole system reads is the
// LEGACY `tb_users.adminIDSale` (a varchar holding `tb_admin.adminID`). The
// CRM, reports, the customer-facing rep banner (lib/admin/sales-rep-contact.ts),
// pcs-chrome + every faithful surface read THAT — so writing only
// profiles.sales_admin_id (the rebuilt, near-empty column) was a silent
// dead-write (green toast → invisible to everyone). We now ALSO write the live
// column, resolved through the bridge:
//   • customer profile UUID → profiles.member_code === tb_users.userID (PR####)
//   • rep profile UUID      → admin_contact_extras.legacy_admin_id === tb_admin.adminID
// profiles.sales_admin_id is kept in sync (dual-write) so the per-customer page
// that still reads `profiles` + the notification fan-out stay coherent, but the
// LEGACY column is now canonical.
// ────────────────────────────────────────────────────────────
const transferRepSchema = z.object({
  customer_id:        z.string().uuid(),
  new_sales_admin_id: z.string().uuid().nullable(),         // null = unassign (released to pool)
  reason:             z.string().trim().min(3, "กรุณาระบุเหตุผล").max(500),
});
export type TransferSalesRepInput = z.infer<typeof transferRepSchema>;

export async function adminTransferSalesRep(input: TransferSalesRepInput): Promise<AdminActionResult> {
  const parsed = transferRepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load current state so we can notify the previous rep and audit the delta.
    // member_code is the bridge to tb_users.userID (PR####) — we write the
    // LIVE legacy column keyed on it.
    const { data: before, error: beforeErr } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, company_name, account_type, sales_admin_id")
      .eq("id", d.customer_id)
      .maybeSingle<{
        id: string; member_code: string | null; first_name: string | null; last_name: string | null;
        company_name: string | null; account_type: "personal" | "juristic"; sales_admin_id: string | null;
      }>();

    if (beforeErr) {
      console.error(`[profiles mutation lookup] failed`, { code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: `db_error:${beforeErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "customer_not_found" };

    const previous_sales_admin_id = before.sales_admin_id;
    if (previous_sales_admin_id === d.new_sales_admin_id) {
      return { ok: false, error: "same_rep_no_change" };
    }

    // Resolve the NEW rep's legacy adminID (the value tb_users.adminIDSale
    // stores). Unassign (null) → clear the legacy column to '' (legacy "no
    // rep" sentinel). Assign → require the rep profile to carry a
    // legacy_admin_id, else the move would be invisible to every legacy
    // surface (better to refuse than silently dead-write).
    let newLegacyAdminId = "";
    if (d.new_sales_admin_id) {
      const { data: repExtra, error: repExtraErr } = await admin
        .from("admin_contact_extras")
        .select("legacy_admin_id")
        .eq("profile_id", d.new_sales_admin_id)
        .maybeSingle<{ legacy_admin_id: string | null }>();
      if (repExtraErr) {
        console.error(`[transfer-rep legacy id lookup] failed`, { code: repExtraErr.code, message: repExtraErr.message });
        return { ok: false, error: `db_error:${repExtraErr.code ?? "unknown"}` };
      }
      newLegacyAdminId = (repExtra?.legacy_admin_id ?? "").trim();
      if (!newLegacyAdminId) {
        return {
          ok: false,
          error: "เซลล์ปลายทางยังไม่ได้ผูกรหัสเดิม (legacy_admin_id) — ผูกผ่าน /admin/admins ก่อน จึงจะมอบหมายลูกค้าเดิมได้",
        };
      }
    }

    // ── LIVE column write (canonical) — tb_users.adminIDSale keyed on the
    //    customer's member_code (= userID). Skip only if the customer was
    //    never migrated to tb_users (no member_code) — then profiles is the
    //    only home we have.
    if (before.member_code) {
      const { error: tbErr } = await admin
        .from("tb_users")
        .update({ adminIDSale: newLegacyAdminId })
        .eq("userID", before.member_code);
      if (tbErr) {
        console.error(`[transfer-rep tb_users.adminIDSale write] failed`, { userid: before.member_code, code: tbErr.code, message: tbErr.message });
        return { ok: false, error: `db_error:${tbErr.code ?? "unknown"}` };
      }
    }

    // ── Keep the rebuilt column in sync (dual-write) so the per-customer page
    //    + notification fan-out stay coherent. Non-fatal: the legacy column is
    //    canonical, so a sync failure logs but doesn't fail the transfer.
    const { error: updErr } = await admin
      .from("profiles")
      .update({ sales_admin_id: d.new_sales_admin_id })
      .eq("id", d.customer_id);
    if (updErr) {
      console.error(`[transfer-rep profiles sync] failed (non-fatal)`, { code: updErr.code, message: updErr.message });
    }

    await logAdminAction(adminId, "customer.transfer_rep", "profile", d.customer_id, {
      userid:                 before.member_code ?? null,
      previous_sales_admin_id,
      new_sales_admin_id:     d.new_sales_admin_id,
      new_legacy_admin_id:    newLegacyAdminId || null,
      reason:                 d.reason,
    });

    const customerDisplay = before.account_type === "juristic"
      ? (before.company_name ?? "ลูกค้า")
      : `${before.first_name ?? ""} ${before.last_name ?? ""}`.trim() || "ลูกค้า";
    const customerLabel = `${customerDisplay}${before.member_code ? ` (${before.member_code})` : ""}`;

    // Notify old rep (silently skipped if unassigned).
    // link_href points at the customer detail so the previous rep can
    // verify the move (and see the new assignee) instead of being
    // dead-ended on a notification with nowhere to click.
    if (previous_sales_admin_id) {
      void sendNotification(previous_sales_admin_id, notify.salesRepTransferOutgoing({
        customerLabel,
        reason:     d.reason,
        customerId: d.customer_id,
      }));
    }
    // Notify new rep
    if (d.new_sales_admin_id) {
      void sendNotification(d.new_sales_admin_id, notify.salesRepTransferIncoming({
        customerLabel,
        reason:     d.reason,
        customerId: d.customer_id,
      }));
    }
    // Notify customer (only if newly assigned to someone — unassign isn't worth notifying)
    if (d.new_sales_admin_id) {
      void sendNotification(d.customer_id, notify.salesRepReassignedCustomerNotice());
    }

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.customer_id}`);
    revalidatePath(`/admin/customers/${d.customer_id}/transfer-rep`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Fuzzy search for sales-admin reps (Phase C QoL #1).
// Drives the transfer-rep combobox in
// /admin/customers/[id]/transfer-rep — replaces the legacy UUID-paste
// flow. Admin types name / member_code / phone fragment → debounced
// 300ms client call → top 10 matches returned. Match is case-insensitive
// against profiles.member_code, first_name, last_name, phone, company_name
// + admin_contact_extras.display_name. Only `super` + `sales_admin` rows
// with is_active=true are returned (you can't transfer a customer to a
// non-rep). Returns a shape compatible with the existing dropdown
// `{ profile_id, display }` so the rest of the form doesn't change.
// ────────────────────────────────────────────────────────────
const searchAdminsSchema = z.object({
  q:     z.string().trim().min(1, "ระบุคำค้น").max(80),
  limit: z.number().int().min(1).max(50).optional(),
});
export type SearchAdminsInput = z.infer<typeof searchAdminsSchema>;
export type AdminSearchHit = {
  profile_id:  string;
  member_code: string | null;
  name:        string;
  phone:       string | null;
  role:        string;
  display:     string;
};

export async function searchAdminsByQuery(
  input: SearchAdminsInput,
): Promise<AdminActionResult<{ hits: AdminSearchHit[] }>> {
  const parsed = searchAdminsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { q } = parsed.data;
  const limit = parsed.data.limit ?? 10;

  return withAdmin<{ hits: AdminSearchHit[] }>(["super", "sales_admin"], async () => {
    const admin = createAdminClient();

    // PostgREST `or` over the joined profiles row uses the `profiles.<col>.op.val`
    // path. Escape literal commas / parens in the user input so it can't break
    // out of the filter expression (ILIKE special chars are fine inside the value).
    const safeQ = q.replace(/[(),]/g, " ");
    const pattern = `%${safeQ}%`;

    // Wave 22 — removed the inline `contact:admin_contact_extras!profile_id`
    // embed. There's no direct FK between `admins` and `admin_contact_extras`
    // (both FK to profiles separately), so PostgREST rejects the embed with
    // PGRST200. Fetch contact extras separately + merge in JS — dataset is
    // tiny so the extra round-trip is negligible.
    const { data, error } = await admin
      .from("admins")
      .select(`
        profile_id, role,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone, company_name )
      `)
      .in("role", ["sales_admin", "super", "ultra"])
      .eq("is_active", true)
      .or(
        [
          `member_code.ilike.${pattern}`,
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `phone.ilike.${pattern}`,
          `company_name.ilike.${pattern}`,
        ].join(","),
        { referencedTable: "profiles" },
      )
      .limit(limit * 2);                            // over-fetch so the join filter still yields ≥limit
    if (error) return { ok: false, error: error.message };

    type ProfileShape = {
      member_code: string | null; first_name: string | null; last_name: string | null;
      phone: string | null; company_name: string | null;
    };
    type Row = {
      profile_id: string; role: string;
      profile:    ProfileShape | ProfileShape[] | null;
    };

    // Fetch contact extras for the matched admins (de-dupe profile_ids first).
    const candidateRows = (data ?? []) as Row[];
    const profileIds = [...new Set(candidateRows.map((r) => r.profile_id))];
    type ContactShape = { profile_id: string; display_name: string | null; direct_phone: string | null };
    let contactsMap = new Map<string, ContactShape>();
    if (profileIds.length > 0) {
      const { data: contacts, error: contactsErr } = await admin
        .from("admin_contact_extras")
        .select("profile_id, display_name, direct_phone")
        .in("profile_id", profileIds);
      if (contactsErr) {
        console.error("[searchAdminsByQuery] contact_extras lookup failed", contactsErr);
        // Soft-fail: continue without display overrides — names still resolve via profiles.
      } else {
        contactsMap = new Map(
          (contacts ?? []).map((c) => [(c as ContactShape).profile_id, c as ContactShape]),
        );
      }
    }

    // De-dupe (a profile can hold multiple roles — `super` + `sales_admin`
    // would surface twice from the IN clause). First role wins; we don't
    // pretend to rank by role here.
    const seen = new Set<string>();
    const hits: AdminSearchHit[] = [];
    for (const r of candidateRows) {
      if (seen.has(r.profile_id)) continue;
      const prof    = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      const contact = contactsMap.get(r.profile_id) ?? null;
      // The OR filter is on profiles.* — null-profile rows (deleted profile)
      // shouldn't match anyway, but skip defensively.
      if (!prof) continue;

      const fallbackName = `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim();
      const name = contact?.display_name ?? (fallbackName || "—");
      const phone = contact?.direct_phone ?? prof.phone ?? null;

      seen.add(r.profile_id);
      hits.push({
        profile_id:  r.profile_id,
        member_code: prof.member_code,
        name,
        phone,
        role:        r.role,
        display:     `${name} · ${prof.member_code ?? "—"} · ${phone ?? "—"}`,
      });
      if (hits.length >= limit) break;
    }

    return { ok: true, data: { hits } };
  });
}

// ────────────────────────────────────────────────────────────
// Bulk transfer sales rep across many customers in one shot.
// Ports legacy transferSalesCustomers.php — used when a rep leaves
// or for portfolio rebalancing between reps. Complements the per-customer
// adminTransferSalesRep() above; bulk path skips the reason field +
// per-customer notification fan-out to keep the single UPDATE tight.
//
// ⚠️ 2026-06-02 — DEAD-WRITE TOMBSTONE (0 callers). Writes ONLY the rebuilt
// `profiles.sales_admin_id` (no live reader). The LIVE bulk path used by
// /admin/customers/transfer-rep is adminBulkTransferSalesRepTb (below), which
// writes tb_users.adminIDSale; the reasoned bulk path
// (/admin/customers/transfer-bulk) goes through adminTransferSalesRep (live).
// DO NOT wire this to a UI — it would be a silent dead-write (§0e).
// ────────────────────────────────────────────────────────────
const bulkTransferRepSchema = z.object({
  customer_ids:       z.array(z.string().uuid()).min(1, "เลือกอย่างน้อย 1 ลูกค้า").max(500),
  new_sales_admin_id: z.string().uuid().nullable(),    // null = unassign
});

export async function adminBulkTransferSalesRep(
  input: z.infer<typeof bulkTransferRepSchema>,
): Promise<AdminActionResult<{ updated: number }>> {
  const parsed = bulkTransferRepSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    // If a target rep is given, verify it's an active sales_admin/super to
    // prevent accidentally pointing customers at a non-admin profile.
    if (d.new_sales_admin_id) {
      const { data: target, error: targetErr } = await admin
        .from("admins")
        .select("profile_id, role, is_active")
        .eq("profile_id", d.new_sales_admin_id)
        .in("role", ["sales_admin", "super", "ultra"])
        .eq("is_active", true)
        .maybeSingle();
      if (targetErr) {
        console.error(`[admins mutation lookup] failed`, { code: targetErr.code, message: targetErr.message });
        return { ok: false, error: `db_error:${targetErr.code ?? "unknown"}` };
      }
      if (!target) return { ok: false, error: "target_not_active_sales_admin" };
    }

    const { error, count } = await admin
      .from("profiles")
      .update({ sales_admin_id: d.new_sales_admin_id }, { count: "exact" })
      .in("id", d.customer_ids);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.bulk_transfer_rep", "profile", `${d.customer_ids.length}_customers`, {
      customer_ids:       d.customer_ids,
      new_sales_admin_id: d.new_sales_admin_id,
    });

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/transfer-rep");
    return { ok: true, data: { updated: count ?? d.customer_ids.length } };
  });
}

// ────────────────────────────────────────────────────────────
// Bulk transfer sales rep on the LEGACY `tb_users.adminIDSale` column
// (D1 / ADR-0017 Phase-B faithful port).
//
// Why a separate action from adminBulkTransferSalesRep above:
//   The earlier action updates the REBUILT `profiles.sales_admin_id`
//   column which is empty on prod. The legacy column-of-truth is
//   `tb_users.adminIDSale` (varchar holding the admin's legacy
//   `tb_admin.adminID` username, e.g. "PR0001"). The new `/admin/
//   customers/transfer-rep` bulk page writes against the legacy column
//   so the assignment is visible to PHP staff + the new Pacred admin
//   surfaces that join tb_users.adminIDSale.
//
// Target admin id is the legacy varchar `tb_admin.adminID` (NOT a
// Pacred profile UUID) — passing the raw legacy adminid keeps the
// foreign-key shape PHP expects.
// ────────────────────────────────────────────────────────────
const bulkTransferRepTbSchema = z.object({
  user_ids:          z.array(z.string().trim().regex(/^PR\d+$/i, "user_ids ต้องเป็นรหัส PR####"))
                       .min(1, "เลือกอย่างน้อย 1 ลูกค้า")
                       .max(500, "เลือกได้สูงสุด 500 รายต่อรอบ"),
  new_admin_userid:  z.string().trim().min(1, "เลือก admin ปลายทาง").max(20),
});
export type AdminBulkTransferSalesRepTbInput = z.infer<typeof bulkTransferRepTbSchema>;

export async function adminBulkTransferSalesRepTb(
  input: AdminBulkTransferSalesRepTbInput,
): Promise<AdminActionResult<{ updated: number }>> {
  const parsed = bulkTransferRepTbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ updated: number }>(
    ["sales_admin", "super"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Validate target admin: must exist as a Pacred admin (lookup via
      // bridge column admin_contact_extras.legacy_admin_id, then verify
      // matching profile + admins-role-grant both active).
      //
      // The transfer-rep flow stores the LEGACY varchar adminID string in
      // tb_users.adminIDSale to preserve PHP-staff visibility — so we
      // resolve the requested legacy string via the bridge column ภูม fills
      // in when recreating each legacy admin through /admin/admins/new.
      //
      // 3 separate queries (NOT a PostgREST embed): admins and
      // admin_contact_extras both FK to profiles but NOT to each other →
      // cross-embed fails PGRST200. Profile embed via profiles!profile_id
      // works because that IS a direct FK.
      const { data: extrasRow, error: extrasErr } = await admin
        .from("admin_contact_extras")
        .select(`
          profile_id, legacy_admin_id, nickname,
          profile:profiles!profile_id ( id, first_name, last_name, is_active )
        `)
        .eq("legacy_admin_id", d.new_admin_userid)
        .maybeSingle();
      if (extrasErr) {
        console.error(`[admin transfer lookup] failed`, { code: extrasErr.code, message: extrasErr.message });
        return { ok: false, error: `db_error:${extrasErr.code ?? "unknown"}` };
      }
      if (!extrasRow) {
        return { ok: false, error: "ไม่พบ admin ปลายทาง (legacy_admin_id ไม่ตรง · ภูม recreate ผ่าน /admin/admins/new ก่อน)" };
      }

      const profile = Array.isArray(extrasRow.profile) ? extrasRow.profile[0] : extrasRow.profile;
      if (!profile?.is_active) return { ok: false, error: "admin ปลายทางถูก suspend" };

      // Verify the profile has at least one active admins row.
      const { data: adminRow, error: adminErr } = await admin
        .from("admins")
        .select("role, is_active")
        .eq("profile_id", extrasRow.profile_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (adminErr) {
        console.error(`[admin transfer lookup] admins gate failed`, adminErr);
        return { ok: false, error: `db_error:${adminErr.code ?? "unknown"}` };
      }
      if (!adminRow) return { ok: false, error: "admin ปลายทางไม่มี role-grant ที่ active" };

      const target = {
        legacy_admin_id: extrasRow.legacy_admin_id,
        nickname:        extrasRow.nickname,
      };

      // Normalise user ids to upper-case (PR uses upper case in prod).
      const userIds = d.user_ids.map((u) => u.toUpperCase());

      // Validate the customers exist (filter so partial-bad input doesn't
      // silently update 0 rows; surface the bad list).
      const { data: validRows, error: readErr } = await admin
        .from("tb_users")
        .select("userID, adminIDSale")
        .in("userID", userIds);
      if (readErr) return { ok: false, error: readErr.message };
      const validIds = (validRows ?? []).map((r) => (r as { userID: string }).userID);
      if (validIds.length === 0) {
        return { ok: false, error: "ไม่พบลูกค้าตาม userid ที่เลือก" };
      }

      const { error: updErr, count } = await admin
        .from("tb_users")
        .update({ adminIDSale: target.legacy_admin_id }, { count: "exact" })
        .in("userID", validIds);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "tb_users.bulk_transfer_rep", "tb_users", validIds.join(","), {
        new_admin_userid: target.legacy_admin_id,
        new_admin_nick:   target.nickname,
        new_admin_name:   profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : null,
        affected_userids: validIds,
        requested_count:  userIds.length,
        valid_count:      validIds.length,
      });

      revalidatePath("/admin/customers");
      revalidatePath("/admin/customers/transfer-rep");
      return { ok: true, data: { updated: count ?? validIds.length } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// listActiveTbAdmins — for the transfer-rep target dropdown
// ────────────────────────────────────────────────────────────
//
// Returns active Pacred admins eligible to receive customer rep
// reassignment. Used by /admin/customers/transfer-rep dropdown.
//
// Wave 22 migration — was reading tb_admin directly (lowercase against
// prod's camelCase columns → silently returned empty for months).
// Now reads admins JOIN profiles JOIN admin_contact_extras and filters
// to rows that have `legacy_admin_id` set — that's the bridge column
// ภูม fills when recreating each legacy admin through /admin/admins/new.
// Only admins WITH a legacy_admin_id can be sales-rep targets because
// tb_users.adminIDSale stores the legacy string (not a profile UUID).
//
// Empty dropdown until ภูม recreates the 13 legacy admins (Phase 3 of
// this wave). The page is used quarterly for rep-rotation, not daily.
export type TbAdminLite = {
  adminID:        string;
  adminNickname:  string | null;
  adminName:      string | null;
  adminLastName:  string | null;
  adminPicture:   string | null;
  department:     string | null;
  section:        string | null;
};

export async function listActiveTbAdmins(): Promise<AdminActionResult<{ rows: TbAdminLite[] }>> {
  return withAdmin<{ rows: TbAdminLite[] }>(
    ["sales_admin", "super"],
    async () => {
      const admin = createAdminClient();

      // 3 separate queries (NOT a PostgREST embed). admins and
      // admin_contact_extras both FK to profiles but NOT to each other →
      // PostgREST cross-embed fails PGRST200. profile via profiles!profile_id
      // works (direct FK); admins fetched separately by profile_id.
      const { data: extrasRows, error: extrasErr } = await admin
        .from("admin_contact_extras")
        .select(`
          profile_id, legacy_admin_id, nickname, department, section,
          profile:profiles!profile_id ( first_name, last_name, avatar_url, is_active )
        `)
        .not("legacy_admin_id", "is", null)
        .order("nickname", { ascending: true, nullsFirst: false })
        .limit(500);
      if (extrasErr) return { ok: false, error: extrasErr.message };

      const candidates = extrasRows ?? [];
      const profileIds = [...new Set(candidates.map((r) => (r as { profile_id: string }).profile_id))];

      // Fetch active admins rows for those profiles
      let activeProfileIds = new Set<string>();
      if (profileIds.length > 0) {
        const { data: adminRows, error: adminErr } = await admin
          .from("admins")
          .select("profile_id")
          .in("profile_id", profileIds)
          .eq("is_active", true);
        if (adminErr) return { ok: false, error: adminErr.message };
        activeProfileIds = new Set(
          (adminRows ?? []).map((r) => (r as { profile_id: string }).profile_id),
        );
      }

      // Flatten + filter to active.
      const rows: TbAdminLite[] = candidates
        .map((r) => {
          const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile;
          return { r: r as { profile_id: string; legacy_admin_id: string | null; nickname: string | null; department: string | null; section: string | null }, profile };
        })
        .filter(({ r, profile }) => profile?.is_active && activeProfileIds.has(r.profile_id))
        .map(({ r, profile }) => ({
          adminID:       r.legacy_admin_id ?? "",
          adminNickname: r.nickname ?? null,
          adminName:     profile?.first_name ?? null,
          adminLastName: profile?.last_name ?? null,
          adminPicture:  profile?.avatar_url ?? null,
          department:    r.department ?? null,
          section:       r.section ?? null,
        }));

      return { ok: true, data: { rows } };
    },
  );
}

// ════════════════════════════════════════════════════════════════════════
// Wave 22 Phase 3+4 — Pacred admin CRUD
// ════════════════════════════════════════════════════════════════════════
// The four functions below back the new /admin/admins/new + /[id]/edit
// forms. They replace the legacy tb_admin INSERT/UPDATE that ภูม used to
// do directly in phpMyAdmin — every Pacred admin is now provisioned via
// Supabase Auth Admin API + a profiles row + an admins role grant +
// (optional) admin_contact_extras HR sidecar.
//
// Per AGENTS.md §0c — every Supabase call destructures { data, error }.
// On failure the auth.user is rolled back (deleteUser) so the next attempt
// is clean instead of leaving an orphan auth row.
//
// Validators live in lib/validators/admin-form.ts (importable from both
// the server action and the client form).
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// Sales-rep roster self-service (owner 2026-06-15: "ให้มันผูกกันหมดออโต้")
// ════════════════════════════════════════════════════════════════════════
// The sales pool that the round-robin (lib/admin/assign-sales-rep.ts) + the
// customer-facing team carousel + admin rep filters all read is the LEGACY
// flag `tb_admin.adminStatusSale='1'` (active staff). These two functions let
// a super-admin manage that flag from the UI — so adding a 4th/5th sales rep
// is a toggle, never a code change or a DB edit. SOT reader: lib/admin/sales-roster.ts.

export type StaffSalesFlagRow = {
  adminID:   string;
  name:      string;   // nickname || first name || adminID
  fullName:  string;
  tel:       string;
  isSales:   boolean;  // adminStatusSale === '1'
};

/** List ACTIVE legacy staff (adminStatusA='1') with their current sales-rep
 *  flag, so the management UI can show a per-row toggle. Super-only. */
export async function listStaffSalesFlags(): Promise<AdminActionResult<{ rows: StaffSalesFlagRow[] }>> {
  return withAdmin<{ rows: StaffSalesFlagRow[] }>(["super"], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname, adminTel, adminStatusSale")
      .eq("adminStatusA", "1")
      .order("adminStatusSale", { ascending: false }) // sales reps first
      .order("adminID", { ascending: true });
    if (error) {
      console.error("[listStaffSalesFlags] failed", { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    type Raw = {
      adminID: string | null; adminName: string | null; adminLastName: string | null;
      adminNickname: string | null; adminTel: string | null; adminStatusSale: string | null;
    };
    const rows: StaffSalesFlagRow[] = [];
    for (const r of (data ?? []) as Raw[]) {
      const id = r.adminID?.trim();
      if (!id) continue;
      const first = r.adminName?.trim() ?? "";
      const last = r.adminLastName?.trim() ?? "";
      const nick = r.adminNickname?.trim();
      rows.push({
        adminID:  id,
        name:     nick || first || id,
        fullName: `${first} ${last}`.trim() || nick || id,
        tel:      (r.adminTel ?? "").trim(),
        isSales:  (r.adminStatusSale ?? "").trim() === "1",
      });
    }
    return { ok: true, data: { rows } };
  });
}

/**
 * Next staff employee code — auto-running YYMMNO (owner 2026-06-15: "ออโต้ไปเลย
 * มีกี่นัมเบอร์แล้วก็รันไป · เปลี่ยนปีเปลี่ยนเดือนก็รันไป"). Format = Buddhist-year
 * last-2 + month + per-month running number (legacy: 690601…690619 for พ.ศ.2569
 * เดือน 06). New month → the prefix rolls + the counter restarts at 01
 * (690701). Super-only. Returns e.g. "690620". Best-effort: a read error
 * returns the month prefix + "01" so the form still pre-fills something sane.
 */
export async function getNextEmployeeCode(): Promise<AdminActionResult<{ code: string }>> {
  return withAdmin<{ code: string }>(["super"], async () => {
    const admin = createAdminClient();
    const now = new Date();
    const yy = String((now.getFullYear() + 543) % 100).padStart(2, "0"); // Buddhist year last-2
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yymm = `${yy}${mm}`;
    const { data, error } = await admin
      .from("profiles")
      .select("employee_code")
      .like("employee_code", `${yymm}%`);
    if (error) {
      console.error("[getNextEmployeeCode] failed", { code: error.code, message: error.message });
      return { ok: true, data: { code: `${yymm}01` } };
    }
    let max = 0;
    for (const r of (data ?? []) as { employee_code: string | null }[]) {
      const ec = r.employee_code?.trim() ?? "";
      if (!ec.startsWith(yymm) || !/^\d{6,}$/.test(ec)) continue;
      const n = parseInt(ec.slice(4), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return { ok: true, data: { code: `${yymm}${String(max + 1).padStart(2, "0")}` } };
  });
}

const salesFlagSchema = z.object({
  adminID: z.string().trim().min(1),
  isSales: z.boolean(),
});

/** Toggle a staffer's sales-rep flag (`tb_admin.adminStatusSale`). Super-only,
 *  audit-logged. Only flips ACTIVE staff (adminStatusA='1') — a 0-row result
 *  means the id isn't an active staffer. Everything that reads the roster
 *  (round-robin · carousel · rep filters) picks the change up automatically. */
export async function adminSetSalesRepFlag(
  input: z.infer<typeof salesFlagSchema>,
): Promise<AdminActionResult> {
  const parsed = salesFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { adminID, isSales } = parsed.data;
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("tb_admin")
      .update({ adminStatusSale: isSales ? "1" : "0" })
      .eq("adminID", adminID)
      .eq("adminStatusA", "1")
      .select("adminID")
      .maybeSingle();
    if (error) {
      console.error("[adminSetSalesRepFlag] failed", { code: error.code, message: error.message, adminID });
      return { ok: false, error: error.message };
    }
    if (!updated) return { ok: false, error: "ไม่พบพนักงาน (สถานะ active) รหัสนี้" };
    await logAdminAction(adminId, "admin.set_sales_flag", "tb_admin", adminID, { isSales });
    revalidatePath("/admin/admins");
    revalidatePath("/admin/admins/sales-team");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// adminCreateNew — provision auth + profile + admin grant + HR extras
// ────────────────────────────────────────────────────────────
//
// Flow (rollback-safe):
//   1. supabase.auth.admin.createUser({ email, password, email_confirm: true })
//   2. profiles INSERT (member_code auto-assigned by trigger to PR<n>)
//   3. admins INSERT (role grant + is_active=true + granted_by)
//   4. admin_contact_extras INSERT (only if any HR field provided)
//
// On any step ≥ 2 failure → deleteUser(profileId) so the next /new POST
// can re-use the email cleanly.
//
// Auth gate: super only (admin RBAC mutation).
export async function adminCreateNew(
  input: AdminCreateInput,
): Promise<AdminActionResult<{ profileId: string; member_code: string | null }>> {
  const parsed = AdminCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ profileId: string; member_code: string | null }>(
    ["super"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── 0. Cross-system phone dedupe (เดฟ 2026-06-08 · root-cause fix for
      //       the PR112/PR10584 duplicate-identity bug) ──────────────
      // The customer-create paths (register · adminCreateCustomer) already
      // refuse when a phone belongs to an existing tb_users customer; the
      // admin-create path did NOT — so provisioning an admin for a person who
      // was already a (often migrated/cold) legacy customer minted a SECOND
      // member_code. We surface the existing code and refuse unless the operator
      // explicitly confirms (allow_existing_phone) that they intend to make this
      // existing customer into staff.
      if (d.phone && !d.allow_existing_phone) {
        const existing = await findLegacyUserIdByPhone(admin, normalizePhone(d.phone));
        if (existing) {
          return { ok: false, error: `phone_exists_customer:${existing}` };
        }
      }

      // ── 1. Provision Supabase auth.user ────────────────────────
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email:         d.email,
        password:      d.password,
        email_confirm: true,                  // skip Supabase's confirmation email
        user_metadata: {
          first_name:        d.first_name,
          last_name:         d.last_name,
          provisioned_by:    adminId,
          provisioned_via:   "admin-create-form",
          provisioned_at:    new Date().toISOString(),
          legacy_admin_id:   d.legacy_admin_id ?? null,
        },
      });

      if (authErr) {
        // Most common: "User already registered" → email collision.
        // Surface the raw Supabase message so the operator can react
        // (use /edit if they meant to update an existing admin).
        return { ok: false, error: `auth.createUser: ${authErr.message}` };
      }
      if (!authData?.user?.id) {
        return { ok: false, error: "auth.createUser returned no user id" };
      }
      const profileId = authData.user.id;

      // ── 2-4. Profile + admins + extras (rollback on failure) ──
      try {
        // 2. profiles row.
        // - member_code: omitted → the trigger `generate_member_code` now mints
        //   a PR from the SHARED customer pool (migration 0184, owner 2026-06-15:
        //   "พนักงานมีรหัส PR ด้วย · ใช้เลขร่วมกับลูกค้า · ห้ามชน"). The lock +
        //   cross-table lowest-vacant + UNIQUE make it collision-proof. (Was:
        //   0174 left staff member_code NULL.) employee_code is the staff's
        //   running code (auto-filled by the create form); we keep a STAFF-
        //   placeholder fallback when the operator left it blank.
        // - status: 'active' so the admin can sign in immediately
        // - is_active: true (gates the customer-side `active` filter)
        // - account_type: 'personal' (admins are individuals — juristic
        //   would force company-fields; not applicable here)
        const staffEmployeeCode =
          d.employee_code?.trim() || `STAFF-${profileId.replace(/-/g, "").slice(0, 12)}`;
        const { error: profErr } = await admin.from("profiles").insert({
          id:            profileId,
          email:         d.email,
          first_name:    d.first_name,
          last_name:     d.last_name,
          phone:         d.phone ?? null,
          avatar_url:    d.avatar_url ?? null,
          birthday:      d.birthday ?? null,
          sex:           d.sex ?? null,
          employee_code: staffEmployeeCode,
          account_type:  "personal",
          status:        "active",
          is_active:     true,
          register_with: "email",
        });
        if (profErr) {
          throw new Error(`profiles insert: ${profErr.message}`);
        }

        // 3. admins role grant (UPSERT to be idempotent on the
        //    extremely rare retry where step 2 succeeded but step 3
        //    failed on the first attempt — without UPSERT a retry
        //    would surface a duplicate-key error and confuse ภูม).
        const { error: roleErr } = await admin
          .from("admins")
          .upsert(
            {
              profile_id: profileId,
              role:       d.role,
              is_active:  true,
              granted_by: adminId,
              granted_at: new Date().toISOString(),
            },
            { onConflict: "profile_id,role" },
          );
        if (roleErr) {
          throw new Error(`admins insert: ${roleErr.message}`);
        }

        // 4. admin_contact_extras (only if any HR field is set).
        if (hasAnyHRField(d)) {
          const { error: extrasErr } = await admin
            .from("admin_contact_extras")
            .insert({
              profile_id:        profileId,
              display_name:      d.nickname ?? null,    // legacy display_name reused for chat-cards
              nickname:          d.nickname ?? null,
              company:           d.company ?? "pacred",
              employee_type:     d.employee_type ?? "full_time",
              department:        d.department ?? null,
              section:           d.section ?? null,
              work_email:        d.work_email ?? null,
              work_phone:        d.work_phone ?? null,
              hired_at:          d.hired_at ?? null,
              contract_end_date: d.contract_end_date ?? null,
              legacy_admin_id:   d.legacy_admin_id ?? null,
              admin_note:        d.admin_note ?? null,
            });
          if (extrasErr) {
            throw new Error(`admin_contact_extras insert: ${extrasErr.message}`);
          }
        }

        // ── 5. Read back member_code (trigger-assigned) for the
        //       success toast on the create form.
        const { data: created, error: readErr } = await admin
          .from("profiles")
          .select("member_code")
          .eq("id", profileId)
          .maybeSingle<{ member_code: string | null }>();
        if (readErr) {
          // Non-fatal: the row was created, we just can't display the code.
          console.error("[adminCreateNew member_code read]", { code: readErr.code, message: readErr.message });
        }

        await logAdminAction(adminId, "admin.create", "profiles", profileId, {
          email:           d.email,
          role:            d.role,
          legacy_admin_id: d.legacy_admin_id ?? null,
          has_hr_fields:   hasAnyHRField(d),
        });

        revalidatePath("/admin/admins");
        revalidatePath(`/admin/admins/${profileId}`);
        return {
          ok:   true,
          data: { profileId, member_code: created?.member_code ?? null },
        };
      } catch (e) {
        // Rollback the auth.user so the next retry sees a clean slate.
        // deleteUser failure is logged but not surfaced — the original
        // error is more useful to the operator.
        const { error: delErr } = await admin.auth.admin.deleteUser(profileId);
        if (delErr) {
          console.error("[adminCreateNew rollback deleteUser failed]", {
            profileId,
            message: delErr.message,
          });
        }
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `provisioning_failed: ${message}` };
      }
    },
  );
}

// ────────────────────────────────────────────────────────────
// adminUpdateProfile — edit profiles + admin_contact_extras
// ────────────────────────────────────────────────────────────
//
// Updates the editable fields on an existing Pacred admin's profile
// row + their HR sidecar. Does NOT touch:
//   - email   (changing the email = changing the login key → separate flow)
//   - password (rotation = separate flow)
//   - role    (use adminToggleActive or adminChangeRole)
//
// The admin_contact_extras row is UPSERTed so an admin who was created
// without HR data can have HR data added later (the legacy 13 admins
// fall into this case: ภูม fills HR via /edit after the bare /new POST).
//
// Auth gate: super only.
//
// NOTE — this is intentionally distinct from the EXISTING
// `adminUpdateProfile` in `actions/admin/admin-profile.ts`, which targets
// the LEGACY tb_admin table (admin-profile.php port). That action stays
// for the legacy detail page (`/admin/admins/[id]`); THIS action targets
// the Pacred-native `profiles` + `admin_contact_extras` tables (Wave 22
// merge target). Different function name (`adminUpdateProfileFields`) to
// avoid an import-time naming collision.
export async function adminUpdateProfileFields(
  input: AdminUpdateInput,
): Promise<AdminActionResult> {
  const parsed = AdminUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── Profile fields ─────────────────────────────────────────
    // Only set columns the caller actually supplied (undefined = leave
    // alone). Empty string from the form is treated as "clear field"
    // by the Zod transform → null reaches the DB.
    const profileUpdate: Record<string, unknown> = {};
    if (d.first_name !== undefined) profileUpdate.first_name = d.first_name;
    if (d.last_name  !== undefined) profileUpdate.last_name  = d.last_name;
    if (d.phone      !== undefined) profileUpdate.phone      = d.phone ?? null;
    if (d.avatar_url !== undefined) profileUpdate.avatar_url = d.avatar_url ?? null;
    if (d.birthday   !== undefined) profileUpdate.birthday   = d.birthday ?? null;
    if (d.sex        !== undefined) profileUpdate.sex        = d.sex ?? null;
    if (d.employee_code !== undefined) profileUpdate.employee_code = d.employee_code ?? null;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profErr } = await admin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", d.profile_id);
      if (profErr) {
        console.error("[adminUpdateProfileFields profiles update]", {
          code: profErr.code, message: profErr.message,
        });
        return { ok: false, error: `profiles update: ${profErr.message}` };
      }
    }

    // 2026-06-06 (ภูม flag · เดฟ note): mirror avatar_url → tb_admin.adminPicture
    // when an admin's avatar changes — same idea as the customer-side mirror
    // in actions/profile-avatar.ts. The legacy admin reader (e.g. the staff
    // directory on /admin/admins, the sidebar staff-pill, and any legacy
    // PHP-shaped surface that still queries tb_admin) reads `adminPicture`;
    // without the mirror it shows the old picture forever after a profile
    // update. The bridge is `admin_contact_extras.legacy_admin_id` =
    // tb_admin.adminID.
    //
    // Only fires when `avatar_url` was actually in the form payload — so
    // editing just the name doesn't waste a round-trip. Non-fatal: if the
    // mirror fails (e.g. no legacy_admin_id), modern surfaces still see the
    // new picture via profiles.avatar_url.
    if (d.avatar_url !== undefined) {
      const { data: extras, error: extrasReadErr } = await admin
        .from("admin_contact_extras")
        .select("legacy_admin_id")
        .eq("profile_id", d.profile_id)
        .maybeSingle<{ legacy_admin_id: string | null }>();
      if (extrasReadErr) {
        console.error(
          "[adminUpdateProfileFields tb_admin mirror · extras read] non-fatal",
          { code: extrasReadErr.code, message: extrasReadErr.message },
        );
      }
      const legacyAdminId = extras?.legacy_admin_id ?? null;
      if (legacyAdminId) {
        const { error: tbErr } = await admin
          .from("tb_admin")
          .update({ adminPicture: d.avatar_url ?? null })
          .eq("adminID", legacyAdminId);
        if (tbErr) {
          console.error(
            "[adminUpdateProfileFields tb_admin.adminPicture mirror] non-fatal",
            { code: tbErr.code, message: tbErr.message, legacyAdminId },
          );
        }
      }
    }

    // ── HR sidecar (admin_contact_extras) — UPSERT ─────────────
    // Only fire when at least one HR field was provided; otherwise an
    // UPSERT with all-null columns would clear a row the form simply
    // didn't render.
    if (hasAnyHRField(d)) {
      const extrasRow: Record<string, unknown> = { profile_id: d.profile_id };
      if (d.nickname           !== undefined) {
        extrasRow.nickname     = d.nickname ?? null;
        extrasRow.display_name = d.nickname ?? null;  // keep customer-card label in sync
      }
      if (d.company            !== undefined) extrasRow.company            = d.company;
      if (d.employee_type      !== undefined) extrasRow.employee_type      = d.employee_type;
      if (d.department         !== undefined) extrasRow.department         = d.department ?? null;
      if (d.section            !== undefined) extrasRow.section            = d.section ?? null;
      if (d.work_email         !== undefined) extrasRow.work_email         = d.work_email ?? null;
      if (d.work_phone         !== undefined) extrasRow.work_phone         = d.work_phone ?? null;
      if (d.hired_at           !== undefined) extrasRow.hired_at           = d.hired_at ?? null;
      if (d.contract_end_date  !== undefined) extrasRow.contract_end_date  = d.contract_end_date ?? null;
      if (d.legacy_admin_id    !== undefined) extrasRow.legacy_admin_id    = d.legacy_admin_id ?? null;
      if (d.admin_note         !== undefined) extrasRow.admin_note         = d.admin_note ?? null;

      const { error: extrasErr } = await admin
        .from("admin_contact_extras")
        .upsert(extrasRow, { onConflict: "profile_id" });
      if (extrasErr) {
        console.error("[adminUpdateProfileFields admin_contact_extras upsert]", {
          code: extrasErr.code, message: extrasErr.message,
        });
        return { ok: false, error: `admin_contact_extras upsert: ${extrasErr.message}` };
      }
    }

    await logAdminAction(adminId, "admin.update_profile", "profiles", d.profile_id, {
      profile_fields: Object.keys(profileUpdate),
      hr_updated:     hasAnyHRField(d),
    });

    revalidatePath("/admin/admins");
    revalidatePath(`/admin/admins/${d.profile_id}`);
    revalidatePath(`/admin/admins/${d.profile_id}/edit`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// adminToggleActive — flip is_active on a specific role grant
// ────────────────────────────────────────────────────────────
//
// Mirrors the existing `adminToggleRole` (kept above for back-compat),
// but uses the validator from `lib/validators/admin-form.ts` so the
// /edit form can call ONE schema-typed action without depending on the
// older inline `toggleSchema`.
//
// Auth gate: super only.
export async function adminToggleActive(
  input: AdminToggleActiveInput,
): Promise<AdminActionResult> {
  const parsed = AdminToggleActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admins")
      .update({ is_active: d.is_active })
      .eq("profile_id", d.profile_id)
      .eq("role", d.role);
    if (error) {
      console.error("[adminToggleActive admins update]", { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "admin.toggle_active", "admins", `${d.profile_id}/${d.role}`, d);
    revalidatePath("/admin/admins");
    revalidatePath(`/admin/admins/${d.profile_id}`);
    revalidatePath(`/admin/admins/${d.profile_id}/edit`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// adminChangeRole — swap a role grant on a profile
// ────────────────────────────────────────────────────────────
//
// Pattern: INSERT the new role first (so the admin always has at least
// one active role between operations), then soft-delete (is_active=false)
// the old role row. Both rows stay in the table for audit trail — the
// old row is still visible in /admin/admins history but no longer grants
// access.
//
// If the new role row already exists (admin had it before and was
// toggled inactive), we upsert it back to active.
//
// Auth gate: super only.
export async function adminChangeRole(
  input: AdminChangeRoleInput,
): Promise<AdminActionResult> {
  const parsed = AdminChangeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // 1. UPSERT new role to active.
    const { error: insErr } = await admin
      .from("admins")
      .upsert(
        {
          profile_id: d.profile_id,
          role:       d.new_role,
          is_active:  true,
          granted_by: adminId,
          granted_at: now,
        },
        { onConflict: "profile_id,role" },
      );
    if (insErr) {
      console.error("[adminChangeRole admins upsert new]", { code: insErr.code, message: insErr.message });
      return { ok: false, error: `grant new role: ${insErr.message}` };
    }

    // 2. Soft-delete old role (is_active=false). Leave the row so the
    //    history is preserved.
    const { error: oldErr } = await admin
      .from("admins")
      .update({ is_active: false })
      .eq("profile_id", d.profile_id)
      .eq("role", d.old_role);
    if (oldErr) {
      // The new role is already active; surface the warning but don't
      // roll back (the admin can still sign in, just with extra roles).
      console.error("[adminChangeRole admins soft-delete old]", {
        code: oldErr.code, message: oldErr.message,
      });
      // Audit-log the partial success so HR can clean up later.
      await logAdminAction(adminId, "admin.change_role.partial", "admins", `${d.profile_id}`, {
        old_role:   d.old_role,
        new_role:   d.new_role,
        soft_delete_error: oldErr.message,
      });
      return { ok: false, error: `revoke old role: ${oldErr.message}` };
    }

    await logAdminAction(adminId, "admin.change_role", "admins", `${d.profile_id}`, d);
    revalidatePath("/admin/admins");
    revalidatePath(`/admin/admins/${d.profile_id}`);
    revalidatePath(`/admin/admins/${d.profile_id}/edit`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// loadAdminForEdit — read back an admin for the /edit form
// ────────────────────────────────────────────────────────────
//
// Server-side fetch the /edit page hits before rendering. Returns the
// joined profiles + admins + admin_contact_extras row, or null if no
// matching admin (the page should notFound() in that case).
export type AdminEditLoad = {
  profile_id:       string;
  email:            string | null;
  first_name:       string | null;
  last_name:        string | null;
  phone:            string | null;
  avatar_url:       string | null;
  birthday:         string | null;
  sex:              "male" | "female" | "other" | null;
  employee_code:    string | null;
  member_code:      string | null;
  is_active:        boolean;
  roles:            Array<{ role: string; is_active: boolean }>;
  // HR sidecar (null if no admin_contact_extras row exists yet)
  nickname:           string | null;
  company:            string | null;
  employee_type:      string | null;
  department:         string | null;
  section:            string | null;
  work_email:         string | null;
  work_phone:         string | null;
  hired_at:           string | null;
  contract_end_date:  string | null;
  legacy_admin_id:    string | null;
  admin_note:         string | null;
};

export async function loadAdminForEdit(
  profileId: string,
): Promise<AdminActionResult<{ row: AdminEditLoad | null }>> {
  return withAdmin<{ row: AdminEditLoad | null }>(["super"], async () => {
    const admin = createAdminClient();

    const [profileRes, rolesRes, extrasRes] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, email, first_name, last_name, phone, avatar_url, birthday, sex, employee_code, member_code, is_active",
        )
        .eq("id", profileId)
        .maybeSingle<{
          id: string; email: string | null; first_name: string | null; last_name: string | null;
          phone: string | null; avatar_url: string | null; birthday: string | null;
          sex: "male" | "female" | "other" | null; employee_code: string | null; member_code: string | null; is_active: boolean;
        }>(),
      admin
        .from("admins")
        .select("role, is_active")
        .eq("profile_id", profileId),
      admin
        .from("admin_contact_extras")
        .select(
          "nickname, company, employee_type, department, section, work_email, work_phone, hired_at, contract_end_date, legacy_admin_id, admin_note",
        )
        .eq("profile_id", profileId)
        .maybeSingle<{
          nickname: string | null; company: string | null; employee_type: string | null;
          department: string | null; section: string | null;
          work_email: string | null; work_phone: string | null;
          hired_at: string | null; contract_end_date: string | null;
          legacy_admin_id: string | null; admin_note: string | null;
        }>(),
    ]);

    if (profileRes.error) {
      console.error("[loadAdminForEdit profiles read]", {
        code: profileRes.error.code, message: profileRes.error.message,
      });
      return { ok: false, error: `profiles read: ${profileRes.error.message}` };
    }
    if (rolesRes.error) {
      console.error("[loadAdminForEdit admins read]", {
        code: rolesRes.error.code, message: rolesRes.error.message,
      });
      return { ok: false, error: `admins read: ${rolesRes.error.message}` };
    }
    if (extrasRes.error) {
      // Non-fatal — the row may not exist for legacy/native admins
      // who never set HR fields. We still want to show the profile.
      console.error("[loadAdminForEdit admin_contact_extras read]", {
        code: extrasRes.error.code, message: extrasRes.error.message,
      });
    }

    if (!profileRes.data) {
      return { ok: true, data: { row: null } };
    }
    const p = profileRes.data;
    const e = extrasRes.data;
    const roles = (rolesRes.data ?? []) as Array<{ role: string; is_active: boolean }>;

    return {
      ok:   true,
      data: {
        row: {
          profile_id:       p.id,
          email:            p.email,
          first_name:       p.first_name,
          last_name:        p.last_name,
          phone:            p.phone,
          avatar_url:       p.avatar_url,
          birthday:         p.birthday,
          sex:              p.sex,
          employee_code:    p.employee_code,
          member_code:      p.member_code,
          is_active:        p.is_active,
          roles,
          nickname:           e?.nickname           ?? null,
          company:            e?.company            ?? null,
          employee_type:      e?.employee_type      ?? null,
          department:         e?.department         ?? null,
          section:            e?.section            ?? null,
          work_email:         e?.work_email         ?? null,
          work_phone:         e?.work_phone         ?? null,
          hired_at:           e?.hired_at           ?? null,
          contract_end_date:  e?.contract_end_date  ?? null,
          legacy_admin_id:    e?.legacy_admin_id    ?? null,
          admin_note:         e?.admin_note         ?? null,
        },
      },
    };
  });
}
