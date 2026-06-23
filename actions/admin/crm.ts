"use server";

/**
 * CRM core — server actions for the omni-inbox + customer-360 + sales-rep
 * routing (CEO opening-day directive: omni-inbox + lead funnel + "ลูกค้าคนนี้
 * เซลไหนดูแล" rep-routing).
 *
 *   Spec: docs/research/ceo-directives-2026-06-01.md (CRM / no-handoff ask)
 *   Data inventory: docs/research/big-audit-2026-06-01/_MASTER-PLAN.md
 *
 * ── Disjoint-files rule ──
 * This file is NEW and must NOT collide with actions/admin/leads.ts (the
 * acquisition call-queue — DONE) or actions/admin/customers.ts (identity
 * editor). It reuses the SAME underlying tables but owns its OWN actions:
 *   - getCrmReps         — the assignable sales-rep list (+ ownership counts)
 *   - getCrmCsReps       — the assignable CS list (tb_admin pool · 0141)
 *   - getCustomer360     — the read-only 360 snapshot for a LINE contact / userid
 *   - setCustomerSalesRep — mutation: write tb_users.adminIDSale
 *   - setCustomerCsRep   — mutation: write tb_users.adminIDCS (CS mirror)
 *   - getCrmFunnel       — the new→contacted→quoted→won funnel counts
 *
 * ── Tables (⚠️ casing) ──
 *   tb_users      camelCase: userID · userName · userLastName · userTel ·
 *                 userCompany · userLineID · userFacebook · adminIDSale · userActive
 *   tb_wallet     lowercase: userid · wallettotal
 *   tb_forwarder  lowercase: userid
 *   Podeng_customers_line  lowercase (ปอน's Worker; we never write it)
 *   lead_call_log lowercase: userid · status · called_at (0133)
 *   freight_quote lowercase: id · created_at (0134) — funnel "quoted" proxy
 *   admins / admin_contact_extras — rep list + display names + legacy_admin_id
 *
 * §0c (AGENTS.md): EVERY supabase query destructures `{ data, error }` (or
 * `{ count, error }`); reads use createAdminClient (service-role, server-only),
 * the (admin) layout + requireAdmin gate auth/PII.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { bustCustomerChrome } from "@/lib/cache/revalidate-chrome";
import type {
  CrmRep,
  CrmRepsResult,
  CrmCsRep,
  CrmCsRepsResult,
  Customer360,
  CrmFunnel,
  CrmConversation,
  CrmConversationsResult,
} from "@/lib/admin/crm-types";

// Staff who work the CRM (route + view conversations): super + managers +
// sales + CS/ops. Mirrors /admin/leads' RBAC plus manager.
const CRM_ROLES = ["super", "manager", "sales_admin", "sales", "ops"] as const;
// Reassigning a customer's owning rep is a senior action (legacy: only
// CEO/Manager/Sales-manager/Accounting reassign adminIDSale).
const ROUTING_ROLES = ["super", "manager", "sales_admin"] as const;

const REP_ROLES = ["sales", "sales_admin", "super", "ultra"] as const;

// ════════════════════════════════════════════════════════════════════════
// getCrmReps — the assignable sales-rep list (+ how many customers each owns)
// ════════════════════════════════════════════════════════════════════════
//
// A rep is assignable only if it has a `legacy_admin_id` (the varchar that
// tb_users.adminIDSale stores). Pacred-native admins with a NULL legacy id
// can't own legacy tb_users rows — they're excluded, and if NONE qualify we
// return a gateNote (the 13-admin recreate per ADR-0022 hasn't happened).
//
// Mirrors the rep-resolution in lib/admin/assign-sales-rep.ts (admins +
// admin_contact_extras), but adds the display name + the owned-count, and is
// READ-only (no auto-assign).
export async function getCrmReps(): Promise<AdminActionResult<CrmRepsResult>> {
  return withAdmin<CrmRepsResult>([...CRM_ROLES], async () => {
    const admin = createAdminClient();

    // 1) Active sales/sales_admin/super admin rows.
    const { data: roleRows, error: rolesErr } = await admin
      .from("admins")
      .select("profile_id, role, is_active")
      .in("role", [...REP_ROLES])
      .eq("is_active", true);
    if (rolesErr) {
      console.error("[crm reps:admins] failed", { code: rolesErr.code, message: rolesErr.message });
      return { ok: false, error: `query_failed: ${rolesErr.message}` };
    }
    const roleByProfile = new Map<string, string>();
    for (const r of (roleRows ?? []) as { profile_id: string; role: string }[]) {
      // first role wins (a profile can hold super + sales_admin); don't double-count
      if (!roleByProfile.has(r.profile_id)) roleByProfile.set(r.profile_id, r.role);
    }
    const profileIds = [...roleByProfile.keys()];
    if (profileIds.length === 0) {
      return {
        ok: true,
        data: {
          reps: [],
          gateNote:
            "ยังไม่มีเซลล์ที่ใช้งานอยู่ในระบบ (admins) — รอสร้างแอดมิน 13 คน (ADR-0022) ก่อนจึงจะมอบหมายเซลล์ได้",
        },
      };
    }

    // 2) Their contact extras (legacy_admin_id + display_name). Only reps with
    //    a legacy_admin_id can own tb_users rows.
    const { data: extras, error: extrasErr } = await admin
      .from("admin_contact_extras")
      .select("profile_id, legacy_admin_id, display_name, ended_at, suspended_at")
      .in("profile_id", profileIds);
    if (extrasErr) {
      console.error("[crm reps:extras] failed", { code: extrasErr.code, message: extrasErr.message });
      return { ok: false, error: `query_failed: ${extrasErr.message}` };
    }
    type Extra = {
      profile_id: string;
      legacy_admin_id: string | null;
      display_name: string | null;
      ended_at: string | null;
      suspended_at: string | null;
    };
    const reps: CrmRep[] = [];
    const legacyIds: string[] = [];
    for (const e of (extras ?? []) as Extra[]) {
      if (!e.legacy_admin_id) continue;     // can't own legacy rows
      if (e.ended_at) continue;             // permanently left
      if (e.suspended_at) continue;         // temporarily paused
      reps.push({
        profileId: e.profile_id,
        legacyId: e.legacy_admin_id,
        name: e.display_name?.trim() || e.legacy_admin_id,
        role: roleByProfile.get(e.profile_id) ?? "sales",
        ownedCount: 0,
      });
      legacyIds.push(e.legacy_admin_id);
    }

    if (reps.length === 0) {
      return {
        ok: true,
        data: {
          reps: [],
          gateNote:
            "มีแอดมินเซลล์แต่ยังไม่ได้ผูกรหัสเดิม (legacy_admin_id) — ลูกค้าเดิม (tb_users) จะมอบหมายให้ได้ต่อเมื่อแอดมินมีรหัสเดิม (ADR-0022)",
        },
      };
    }

    // 3) Owned-count per rep (active customers only). One query + JS group.
    const { data: owned, error: ownedErr } = await admin
      .from("tb_users")
      .select("adminIDSale")
      .in("adminIDSale", legacyIds)
      .eq("userActive", "1");
    if (ownedErr) {
      console.error("[crm reps:owned] failed", { code: ownedErr.code, message: ownedErr.message });
      // soft-fail: counts stay 0 rather than failing the whole rep list
    } else {
      const counts = new Map<string, number>();
      for (const r of (owned ?? []) as { adminIDSale: string | null }[]) {
        const id = (r.adminIDSale ?? "").trim();
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      for (const rep of reps) rep.ownedCount = counts.get(rep.legacyId) ?? 0;
    }

    // Sort: fewest-owned first (who has capacity), then name.
    reps.sort((a, b) => a.ownedCount - b.ownedCount || a.name.localeCompare(b.name, "th"));
    return { ok: true, data: { reps, gateNote: null } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// getAssignableAdmins — EVERY active staff member, keyed by profile_id
// ════════════════════════════════════════════════════════════════════════
//
// The "มอบหมายโทรเซลล์" (imported-leads) assign/distribute/handoff pool. Unlike
// getCrmReps (sales-role + legacy_admin_id keyed — the legacy tb_users ownership
// model), this MIRRORS the /admin/admins roster: one row per active, non-suspended,
// non-resigned admin PERSON, keyed by their **profile_id**.
//
// Why profile_id (owner 2026-06-23 "ให้มันมาทุก user เลยในระบบ … ไปเข้า user นี้ตรงๆ"):
// the legacy picker dropped every admin created via /admin/admins/new (they have an
// admin_login_id but NO legacy_admin_id), so on prod the list came up incomplete.
// profile_id is present for EVERY admin AND equals the id the logged-in admin carries
// (withAdmin's adminId), so imported_leads.assigned_admin_id stores it and the
// "ลูกค้าของฉัน" filter matches it directly — no legacy bridge, no one dropped.
//
// Shape = CrmRepsResult (drop-in for the assign panel + the imported-leads validators),
// but each rep's `legacyId` field carries the **profile_id** (the assignment key).
export async function getAssignableAdmins(): Promise<AdminActionResult<CrmRepsResult>> {
  return withAdmin<CrmRepsResult>([...CRM_ROLES], async () => {
    const admin = createAdminClient();

    // 1) All grants → one row per person; "active" iff ANY grant is active; the
    //    effective role = the most-recent ACTIVE grant (mirrors /admin/admins).
    const { data: grantRows, error: grantErr } = await admin
      .from("admins")
      .select("profile_id, role, is_active, granted_at")
      .order("granted_at", { ascending: false, nullsFirst: false });
    if (grantErr) {
      console.error("[assignable admins:admins] failed", { code: grantErr.code, message: grantErr.message });
      return { ok: false, error: `query_failed: ${grantErr.message}` };
    }
    const anyActive = new Map<string, boolean>();
    const effectiveRole = new Map<string, string>();
    for (const r of (grantRows ?? []) as { profile_id: string; role: string; is_active: boolean }[]) {
      anyActive.set(r.profile_id, (anyActive.get(r.profile_id) ?? false) || r.is_active);
      if (r.is_active && !effectiveRole.has(r.profile_id)) effectiveRole.set(r.profile_id, r.role);
    }
    const profileIds = [...anyActive.keys()];
    if (profileIds.length === 0) {
      return { ok: true, data: { reps: [], gateNote: "ยังไม่มีแอดมินที่ใช้งานอยู่ในระบบ" } };
    }

    // 2) Names + status (profiles = name/login/active · extras = display/nickname/ended/suspended).
    const [profilesRes, extrasRes] = await Promise.all([
      admin.from("profiles").select("id, first_name, last_name, admin_login_id, is_active").in("id", profileIds),
      admin
        .from("admin_contact_extras")
        .select("profile_id, display_name, nickname, legacy_admin_id, ended_at, suspended_at")
        .in("profile_id", profileIds),
    ]);
    if (profilesRes.error) {
      console.error("[assignable admins:profiles] failed", { code: profilesRes.error.code, message: profilesRes.error.message });
      return { ok: false, error: `query_failed: ${profilesRes.error.message}` };
    }
    if (extrasRes.error) {
      // Hard-fail: without extras we can't honour ended/suspended → we'd risk
      // offering a resigned admin. Better to surface the error than misassign.
      console.error("[assignable admins:extras] failed", { code: extrasRes.error.code, message: extrasRes.error.message });
      return { ok: false, error: `query_failed: ${extrasRes.error.message}` };
    }
    type P = { id: string; first_name: string | null; last_name: string | null; admin_login_id: string | null; is_active: boolean | null };
    type X = { profile_id: string; display_name: string | null; nickname: string | null; legacy_admin_id: string | null; ended_at: string | null; suspended_at: string | null };
    const profById = new Map<string, P>(((profilesRes.data ?? []) as unknown as P[]).map((p) => [p.id, p]));
    const exById = new Map<string, X>(((extrasRes.data ?? []) as unknown as X[]).map((e) => [e.profile_id, e]));

    const reps: CrmRep[] = [];
    for (const pid of profileIds) {
      if (!anyActive.get(pid)) continue;        // no active grant → not working
      const x = exById.get(pid);
      if (x?.ended_at) continue;                // resigned
      if (x?.suspended_at) continue;            // paused — no new leads
      const p = profById.get(pid);
      const fullName = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
      const name =
        x?.display_name?.trim() ||
        fullName ||
        x?.nickname?.trim() ||
        p?.admin_login_id?.trim() ||
        x?.legacy_admin_id?.trim() ||
        "แอดมิน";
      reps.push({
        profileId: pid,
        legacyId: pid,                          // ⚠️ assignment key = profile_id (see header)
        name,
        role: effectiveRole.get(pid) ?? "staff",
        ownedCount: 0,
      });
    }

    reps.sort((a, b) => a.name.localeCompare(b.name, "th"));
    return { ok: true, data: { reps, gateNote: null } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// getCrmCsReps — the assignable CS list (+ how many customers each owns)
// ════════════════════════════════════════════════════════════════════════
//
// CS twin of getCrmReps, over the LEGACY pool: tb_admin WHERE adminStatusA='1'
// (active) AND adminStatusCS='1' (flagged CS · migration 0141) — exactly the
// pool `pickLeastLoadedCsRep` auto-assigns from on logLeadCall('closed').
// There is NO Pacred-bridge equivalent for CS (the flag lives only on
// tb_admin), so this reads tb_admin directly — populated on prod today.
export async function getCrmCsReps(): Promise<AdminActionResult<CrmCsRepsResult>> {
  return withAdmin<CrmCsRepsResult>([...CRM_ROLES], async () => {
    const admin = createAdminClient();

    // 1) Active CS pool.
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname")
      .eq("adminStatusA", "1")
      .eq("adminStatusCS", "1")
      .order("adminNickname", { ascending: true })
      .limit(500);
    if (error) {
      console.error("[crm csReps:tb_admin] failed", { code: error.code, message: error.message });
      return { ok: false, error: `query_failed: ${error.message}` };
    }
    type Raw = {
      adminID: string | null;
      adminName: string | null;
      adminLastName: string | null;
      adminNickname: string | null;
    };
    const reps: CrmCsRep[] = [];
    const csIds: string[] = [];
    for (const r of (data ?? []) as unknown as Raw[]) {
      const id = (r.adminID ?? "").trim();
      if (!id) continue;
      reps.push({
        adminID: id,
        name: `${r.adminName ?? ""} ${r.adminLastName ?? ""}`.trim() || id,
        nickname: r.adminNickname?.trim() || null,
        ownedCount: 0,
      });
      csIds.push(id);
    }

    if (reps.length === 0) {
      return {
        ok: true,
        data: {
          reps: [],
          gateNote:
            "ยังไม่มี CS ที่ใช้งานอยู่ในระบบ (tb_admin.adminStatusCS='1') — เปิดสิทธิ์ CS ที่โปรไฟล์แอดมินก่อนจึงจะมอบหมายได้",
        },
      };
    }

    // 2) Owned-count per CS (active customers only · mirror getCrmReps).
    const { data: owned, error: ownedErr } = await admin
      .from("tb_users")
      .select("adminIDCS")
      .in("adminIDCS", csIds)
      .eq("userActive", "1");
    if (ownedErr) {
      console.error("[crm csReps:owned] failed", { code: ownedErr.code, message: ownedErr.message });
      // soft-fail: counts stay 0 rather than failing the whole CS list
    } else {
      const counts = new Map<string, number>();
      for (const r of (owned ?? []) as { adminIDCS: string | null }[]) {
        const id = (r.adminIDCS ?? "").trim();
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      for (const rep of reps) rep.ownedCount = counts.get(rep.adminID) ?? 0;
    }

    // Sort: fewest-owned first (who has capacity), then name (mirror getCrmReps).
    reps.sort((a, b) => a.ownedCount - b.ownedCount || a.name.localeCompare(b.name, "th"));
    return { ok: true, data: { reps, gateNote: null } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// getCustomer360 — read-only snapshot for a selected conversation/customer
// ════════════════════════════════════════════════════════════════════════
//
// Resolution order (best-effort link LINE contact → tb_users customer):
//   1. If `userid` is given directly (manual link / leads drill-in) → use it.
//   2. Else if a LINE contact id is given → load the Podeng row, then try:
//        a. tb_users.userLineID == Podeng line_user_id   (rare — customers
//           usually type a display LINE id, not the platform U… id)
//        b. tb_users.userLineID == Podeng display_name   (some workers store
//           the typed LINE id as the display name)
//      When neither matches → linked=false (panel shows "ยังไม่ผูกกับลูกค้า"
//      + a manual search box).
//
// We DON'T fabricate a link: an unmatched contact returns linked=false rather
// than a wrong customer.
export async function getCustomer360(input: {
  userid?: string | null;
  lineCustomerId?: string | null;
}): Promise<AdminActionResult<Customer360>> {
  return withAdmin([...CRM_ROLES], async () => {
    const admin = createAdminClient();

    let userid = (input?.userid ?? "").trim().toUpperCase() || null;
    let matchedBy: Customer360["matchedBy"] = userid ? "manual" : null;

    // Resolve via the LINE contact when no direct userid was supplied.
    if (!userid && input?.lineCustomerId) {
      const { data: contact, error: contactErr } = await admin
        .from("Podeng_customers_line")
        .select("line_user_id, display_name")
        .eq("id", input.lineCustomerId)
        .maybeSingle<{ line_user_id: string | null; display_name: string | null }>();
      if (contactErr) {
        console.error("[crm 360:line contact] failed", { code: contactErr.code, message: contactErr.message });
        // fall through — return an unlinked snapshot rather than failing
      }

      const lineId = (contact?.line_user_id ?? "").trim();
      const displayName = (contact?.display_name ?? "").trim();

      // (a) match by the platform user id stored in tb_users.userLineID
      if (lineId) {
        const { data: byId, error: byIdErr } = await admin
          .from("tb_users")
          .select("userID")
          .eq("userLineID", lineId)
          .limit(1)
          .maybeSingle<{ userID: string }>();
        if (byIdErr) {
          console.error("[crm 360:match userLineID] failed", { code: byIdErr.code, message: byIdErr.message });
        } else if (byId?.userID) {
          userid = byId.userID;
          matchedBy = "userLineID";
        }
      }
      // (b) fallback: the worker sometimes stores the typed LINE id as display_name
      if (!userid && displayName) {
        const { data: byName, error: byNameErr } = await admin
          .from("tb_users")
          .select("userID")
          .eq("userLineID", displayName)
          .limit(1)
          .maybeSingle<{ userID: string }>();
        if (byNameErr) {
          console.error("[crm 360:match display_name] failed", { code: byNameErr.code, message: byNameErr.message });
        } else if (byName?.userID) {
          userid = byName.userID;
          matchedBy = "display_name";
        }
      }
    }

    // No customer to load → unlinked snapshot.
    if (!userid) {
      return { ok: true, data: emptyCustomer360() };
    }

    // ── Load the tb_users identity ──
    const { data: user, error: userErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, userCompany, adminIDSale, adminIDCS, userActive")
      .eq("userID", userid)
      .maybeSingle<{
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userTel: string | null;
        userCompany: string | null;
        adminIDSale: string | null;
        adminIDCS: string | null;
        userActive: string | null;
      }>();
    if (userErr) {
      console.error("[crm 360:tb_users] failed", { code: userErr.code, message: userErr.message, userid });
      return { ok: false, error: `query_failed: ${userErr.message}` };
    }
    if (!user) {
      // The link pointed at a userid that no longer exists.
      return { ok: true, data: emptyCustomer360() };
    }

    const repLegacyId = (user.adminIDSale ?? "").trim() || null;
    const csLegacyId = (user.adminIDCS ?? "").trim() || null;

    // ── Parallel: order count · wallet balance · latest call · rep/CS names ──
    const [ordersRes, walletRes, callRes, repNameRes, csNameRes] = await Promise.all([
      admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("userid", userid),
      admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", userid)
        .maybeSingle<{ wallettotal: number | string | null }>(),
      admin
        .from("lead_call_log")
        .select("status, called_at")
        .eq("userid", userid)
        .order("called_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: string | null; called_at: string | null }>(),
      repLegacyId
        ? admin
            .from("admin_contact_extras")
            .select("display_name")
            .eq("legacy_admin_id", repLegacyId)
            .maybeSingle<{ display_name: string | null }>()
        : Promise.resolve({ data: null, error: null }),
      // CS name comes from the LEGACY tb_admin (the CS pool · 0141) — there's
      // no admin_contact_extras bridge for CS.
      csLegacyId
        ? admin
            .from("tb_admin")
            .select("adminName, adminLastName, adminNickname")
            .eq("adminID", csLegacyId)
            .maybeSingle<{
              adminName: string | null;
              adminLastName: string | null;
              adminNickname: string | null;
            }>()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (ordersRes.error) {
      console.error("[crm 360:orders] failed", { code: ordersRes.error.code, message: ordersRes.error.message });
    }
    if (walletRes.error) {
      console.error("[crm 360:wallet] failed", { code: walletRes.error.code, message: walletRes.error.message });
    }
    if (callRes.error) {
      console.error("[crm 360:call] failed", { code: callRes.error.code, message: callRes.error.message });
    }
    if (repNameRes.error) {
      console.error("[crm 360:repName] failed", { code: repNameRes.error.code, message: repNameRes.error.message });
    }
    if (csNameRes.error) {
      console.error("[crm 360:csName] failed", { code: csNameRes.error.code, message: csNameRes.error.message });
    }

    const walletRaw = walletRes.data?.wallettotal;
    const walletBalance =
      walletRaw === null || walletRaw === undefined ? null : Number(walletRaw);

    const csFullName =
      `${csNameRes.data?.adminName ?? ""} ${csNameRes.data?.adminLastName ?? ""}`.trim();

    return {
      ok: true,
      data: {
        linked: true,
        matchedBy: matchedBy ?? "manual",
        userid: user.userID,
        name: `${user.userName ?? ""} ${user.userLastName ?? ""}`.trim() || "—",
        tel: (user.userTel ?? "").trim() || null,
        isCompany: (user.userCompany ?? "").trim() === "1",
        repLegacyId,
        repName: repNameRes.data?.display_name?.trim() || (repLegacyId ?? null),
        csLegacyId,
        csName: csLegacyId
          ? csFullName || csNameRes.data?.adminNickname?.trim() || csLegacyId
          : null,
        orderCount: ordersRes.count ?? 0,
        walletBalance: walletBalance !== null && Number.isNaN(walletBalance) ? null : walletBalance,
        leadStatus: callRes.data?.status ?? null,
        lastCallAt: callRes.data?.called_at ?? null,
        userActive: user.userActive ?? null,
      },
    };
  });
}

function emptyCustomer360(): Customer360 {
  return {
    linked: false,
    matchedBy: null,
    userid: null,
    name: null,
    tel: null,
    isCompany: false,
    repLegacyId: null,
    repName: null,
    csLegacyId: null,
    csName: null,
    orderCount: 0,
    walletBalance: null,
    leadStatus: null,
    lastCallAt: null,
    userActive: null,
  };
}

// ════════════════════════════════════════════════════════════════════════
// setCustomerSalesRep — THE mutation: assign/clear a customer's owning rep
// ════════════════════════════════════════════════════════════════════════
//
// Writes tb_users.adminIDSale = the chosen rep's legacy_admin_id (the value
// the legacy column stores · same contract as lib/admin/assign-sales-rep.ts
// and actions/admin/customers.ts). Pass legacyId='' to clear ownership.
//
// We validate the target rep exists + is active before writing (don't strand a
// customer on a non-rep). Logged via admin_audit_log.
//
// 🔴 2026-06-02 — DEATH FIX. The rep was ONLY validated against
// admin_contact_extras.legacy_admin_id — which is EMPTY on prod (the 13-admin
// recreate · ADR-0022 · hasn't happened), so EVERY CRM reassign returned
// invalid_rep. We now ALSO accept the LEGACY model: a `tb_admin.adminID` that
// is active + sales-eligible (adminStatusA='1' AND adminStatusSale='1') — the
// exact rep set the inline profile editor (actions/admin/customer-profile.ts
// listSalesAdmins) offers. So CRM reassign works on prod today, and keeps
// working through the Pacred bridge once admins are recreated.
export async function setCustomerSalesRep(input: {
  userid: string;
  /** Rep's legacy_admin_id; "" to unassign. */
  legacyId: string;
}): Promise<AdminActionResult<{ userid: string; legacyId: string }>> {
  const userid = (input?.userid ?? "").trim().toUpperCase();
  const legacyId = (input?.legacyId ?? "").trim();
  if (!userid) return { ok: false, error: "missing_userid" };

  return withAdmin([...ROUTING_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the customer exists (and we get a clean error if not).
    const { data: customer, error: custErr } = await admin
      .from("tb_users")
      .select("userID, adminIDSale")
      .eq("userID", userid)
      .maybeSingle<{ userID: string; adminIDSale: string | null }>();
    if (custErr) {
      console.error("[crm setRep:customer] failed", { code: custErr.code, message: custErr.message, userid });
      return { ok: false, error: `query_failed: ${custErr.message}` };
    }
    if (!customer) return { ok: false, error: "customer_not_found" };

    // When assigning (not clearing), validate the rep is real + active.
    // Accept EITHER model (whichever the prod data supports today):
    //   (A) Pacred bridge — admin_contact_extras.legacy_admin_id active +
    //       an active sales/super role grant in `admins`.
    //   (B) Legacy — tb_admin.adminID active + sales-eligible
    //       (adminStatusA='1' AND adminStatusSale='1'). This is the set the
    //       inline profile editor (listSalesAdmins) offers, and it's populated
    //       on prod TODAY (unlike admin_contact_extras).
    // The rep is valid if EITHER path validates.
    if (legacyId) {
      // (A) Pacred bridge path.
      let validViaBridge = false;
      const { data: rep, error: repErr } = await admin
        .from("admin_contact_extras")
        .select("profile_id, legacy_admin_id, ended_at, suspended_at")
        .eq("legacy_admin_id", legacyId)
        .maybeSingle<{
          profile_id: string;
          legacy_admin_id: string | null;
          ended_at: string | null;
          suspended_at: string | null;
        }>();
      if (repErr) {
        console.error("[crm setRep:rep lookup] failed", { code: repErr.code, message: repErr.message, legacyId });
        return { ok: false, error: `query_failed: ${repErr.message}` };
      }
      if (rep && !rep.ended_at && !rep.suspended_at) {
        const { data: roleRow, error: roleErr } = await admin
          .from("admins")
          .select("role")
          .eq("profile_id", rep.profile_id)
          .in("role", [...REP_ROLES])
          .eq("is_active", true)
          .limit(1)
          .maybeSingle<{ role: string }>();
        if (roleErr) {
          console.error("[crm setRep:role check] failed", { code: roleErr.code, message: roleErr.message });
          return { ok: false, error: `query_failed: ${roleErr.message}` };
        }
        validViaBridge = Boolean(roleRow);
      }

      // (B) Legacy tb_admin path — only checked if the bridge didn't validate
      // (saves a query once the bridge is populated).
      let validViaLegacy = false;
      if (!validViaBridge) {
        const { data: legacyRep, error: legacyErr } = await admin
          .from("tb_admin")
          .select("adminID, adminStatusA, adminStatusSale")
          .eq("adminID", legacyId)
          .maybeSingle<{ adminID: string; adminStatusA: string | null; adminStatusSale: string | null }>();
        if (legacyErr) {
          console.error("[crm setRep:legacy tb_admin lookup] failed", { code: legacyErr.code, message: legacyErr.message, legacyId });
          return { ok: false, error: `query_failed: ${legacyErr.message}` };
        }
        validViaLegacy = Boolean(
          legacyRep && legacyRep.adminStatusA === "1" && legacyRep.adminStatusSale === "1",
        );
      }

      if (!validViaBridge && !validViaLegacy) {
        return { ok: false, error: "invalid_rep" };
      }
    }

    // Write. Empty string clears ownership (legacy stores '' for "no rep").
    const { error: updErr } = await admin
      .from("tb_users")
      .update({ adminIDSale: legacyId })
      .eq("userID", userid);
    if (updErr) {
      console.error("[crm setRep:update] failed", { code: updErr.code, message: updErr.message, userid });
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    // Audit — best-effort (resolve the acting admin's legacy code for context).
    const actorLegacy = (await getAdminLegacyId(adminId)) ?? adminId;
    void logAdminAction(adminId, "crm.set_sales_rep", "tb_users", userid, {
      from: customer.adminIDSale ?? null,
      to: legacyId || null,
      actor_legacy_id: actorLegacy,
    });

    revalidatePath("/admin/crm");
    // The customer sidebar "ผู้ดูแล" card renders the rep contact via
    // lib/legacy/pcs-chrome.ts (unstable_cache 60s) — bust it so the change is
    // visible immediately (precedent: adminUpdateUserSaleRep, 2026-06-08).
    bustCustomerChrome();
    return { ok: true, data: { userid, legacyId } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// setCustomerCsRep — the CS mirror: assign / change / clear a customer's CS
// ════════════════════════════════════════════════════════════════════════
//
// Writes tb_users.adminIDCS = the chosen tb_admin.adminID (migration 0141 —
// same contract as lib/admin/assign-cs-rep.ts auto-assign and
// actions/admin/customer-profile.ts adminUpdateUserCsRep). Pass adminID=''
// to clear: CEO brief — sale/CS ownership is flexible (a CS can run a job
// solo; sales can take the CS role), so manual clear/reassign must work.
// This control is the MANUAL OVERRIDE of the logLeadCall('closed') →
// pickLeastLoadedCsRep auto-handoff (which only fills an EMPTY slot).
//
// Validation = the LEGACY model only: tb_admin adminStatusA='1' AND
// adminStatusCS='1'. The CS flag exists ONLY on tb_admin (0141) — there is no
// admin_contact_extras bridge equivalent, so no two-path check à la
// setCustomerSalesRep. Logged via admin_audit_log (crm.set_cs_rep).
export async function setCustomerCsRep(input: {
  userid: string;
  /** Target CS's tb_admin.adminID; "" to unassign. */
  adminID: string;
}): Promise<AdminActionResult<{ userid: string; adminID: string }>> {
  const userid = (input?.userid ?? "").trim().toUpperCase();
  const adminID = (input?.adminID ?? "").trim();
  if (!userid) return { ok: false, error: "missing_userid" };

  return withAdmin([...ROUTING_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the customer exists (and we get a clean error if not).
    const { data: customer, error: custErr } = await admin
      .from("tb_users")
      .select("userID, adminIDCS")
      .eq("userID", userid)
      .maybeSingle<{ userID: string; adminIDCS: string | null }>();
    if (custErr) {
      console.error("[crm setCs:customer] failed", { code: custErr.code, message: custErr.message, userid });
      return { ok: false, error: `query_failed: ${custErr.message}` };
    }
    if (!customer) return { ok: false, error: "customer_not_found" };

    // When assigning (not clearing), validate the target is a real, active CS.
    if (adminID) {
      const { data: rep, error: repErr } = await admin
        .from("tb_admin")
        .select("adminID, adminStatusA, adminStatusCS")
        .eq("adminID", adminID)
        .maybeSingle<{ adminID: string; adminStatusA: string | null; adminStatusCS: string | null }>();
      if (repErr) {
        console.error("[crm setCs:rep lookup] failed", { code: repErr.code, message: repErr.message, adminID });
        return { ok: false, error: `query_failed: ${repErr.message}` };
      }
      if (!rep || rep.adminStatusA !== "1" || rep.adminStatusCS !== "1") {
        return { ok: false, error: "invalid_cs" };
      }
    }

    // Write. Empty string clears ownership (0141 default '' = "no CS").
    const { error: updErr } = await admin
      .from("tb_users")
      .update({ adminIDCS: adminID })
      .eq("userID", userid);
    if (updErr) {
      console.error("[crm setCs:update] failed", { code: updErr.code, message: updErr.message, userid });
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    // Audit — best-effort (resolve the acting admin's legacy code for context).
    const actorLegacy = (await getAdminLegacyId(adminId)) ?? adminId;
    void logAdminAction(adminId, "crm.set_cs_rep", "tb_users", userid, {
      from: customer.adminIDCS ?? null,
      to: adminID || null,
      actor_legacy_id: actorLegacy,
    });

    revalidatePath("/admin/crm");
    // The customer sidebar "ผู้ดูแล" card renders the CS contact via
    // resolveCsRep (lib/legacy/pcs-chrome.ts · unstable_cache 60s) — bust it
    // so the change is visible immediately (precedent: adminUpdateUserCsRep).
    bustCustomerChrome();
    return { ok: true, data: { userid, adminID } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// getCrmFunnel — new → contacted → quoted → won acquisition funnel
// ════════════════════════════════════════════════════════════════════════
//
// Built from what's actually in the DB (no fabrication). Stages are
// INDEPENDENT counts (not strict subsets) — the UI labels them as such:
//   new       → tb_users.userActive='' with a phone (the cold-lead pool)
//   contacted → distinct userids with ANY lead_call_log row
//   quoted    → freight_quote rows (RFQ funnel · best-effort proxy)
//   won       → distinct userids whose LATEST lead_call_log status='closed'
//
// Best-effort: a failed sub-count surfaces as 0 rather than failing the page.
export async function getCrmFunnel(): Promise<AdminActionResult<CrmFunnel>> {
  return withAdmin([...CRM_ROLES], async () => {
    const admin = createAdminClient();

    // new — cold-lead pool (head count only).
    const { count: newCount, error: newErr } = await admin
      .from("tb_users")
      .select("userID", { count: "exact", head: true })
      .eq("userActive", "")
      .neq("userTel", "");
    if (newErr) console.error("[crm funnel:new] failed", { code: newErr.code, message: newErr.message });

    // contacted — distinct userids that appear in lead_call_log.
    // PostgREST has no DISTINCT; pull userids (bounded) + dedupe in JS.
    const { data: contactedRows, error: contactedErr } = await admin
      .from("lead_call_log")
      .select("userid")
      .limit(20000);
    if (contactedErr) console.error("[crm funnel:contacted] failed", { code: contactedErr.code, message: contactedErr.message });
    const contactedSet = new Set<string>();
    for (const r of (contactedRows ?? []) as { userid: string }[]) contactedSet.add(r.userid);

    // quoted — freight RFQ rows.
    const { count: quotedCount, error: quotedErr } = await admin
      .from("freight_quote")
      .select("id", { count: "exact", head: true });
    if (quotedErr) console.error("[crm funnel:quoted] failed", { code: quotedErr.code, message: quotedErr.message });

    // won — distinct userids with a 'closed' call row (approximates latest=closed;
    // a closed lead is rarely re-opened — exact "latest=closed" needs an RPC).
    const { data: wonRows, error: wonErr } = await admin
      .from("lead_call_log")
      .select("userid")
      .eq("status", "closed")
      .limit(20000);
    if (wonErr) console.error("[crm funnel:won] failed", { code: wonErr.code, message: wonErr.message });
    const wonSet = new Set<string>();
    for (const r of (wonRows ?? []) as { userid: string }[]) wonSet.add(r.userid);

    return {
      ok: true,
      data: {
        newLeads: newCount ?? 0,
        contacted: contactedSet.size,
        quoted: quotedCount ?? 0,
        won: wonSet.size,
      },
    };
  });
}

// ════════════════════════════════════════════════════════════════════════
// getCrmConversations — the omni-inbox list (LINE channel, rep-enriched)
// ════════════════════════════════════════════════════════════════════════
//
// Reads the LINE contacts (Podeng_customers_line · ปอน's Worker · read-only),
// then best-effort links each to a tb_users customer (by userLineID matching
// either the LINE platform id OR the display name) and attaches that customer's
// owning rep. Supports a `repFilter` (legacy_admin_id) for the "แสดงเฉพาะลูกค้า
// ของเซล X" view.
//
// Link strategy is batched: we collect every contact's lineId + displayName,
// query tb_users once with an `.in()` over both, and build a lookup. Contacts
// with no match keep linkedUserid=null (shown as "ยังไม่ผูก" in the UI).
//
// `repFilter` semantics: when set, only conversations whose linked customer's
// adminIDSale === repFilter are returned (unlinked contacts are excluded).
export async function getCrmConversations(input?: {
  repFilter?: string | null;
}): Promise<AdminActionResult<CrmConversationsResult>> {
  return withAdmin<CrmConversationsResult>([...CRM_ROLES], async () => {
    const admin = createAdminClient();
    const repFilter = (input?.repFilter ?? "").trim() || null;

    // 1) LINE contacts — most-recently-active first (mirror line-inbox).
    const { data: contacts, error: contactsErr } = await admin
      .from("Podeng_customers_line")
      .select(
        "id, line_user_id, display_name, picture_url, last_message_text, " +
          "last_message_at, total_messages, status",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (contactsErr) {
      console.error("[crm conversations:contacts] failed", { code: contactsErr.code, message: contactsErr.message });
      return { ok: false, error: `query_failed: ${contactsErr.message}` };
    }
    type Contact = {
      id: string;
      line_user_id: string | null;
      display_name: string | null;
      picture_url: string | null;
      last_message_text: string | null;
      last_message_at: string | null;
      total_messages: number | null;
      status: string | null;
    };
    // Podeng_* tables aren't in the generated Supabase types → PostgREST infers
    // a generic shape; cast through `unknown` to our hand-written Contact type
    // (same pattern as actions/admin/line-inbox.ts).
    const rows = (contacts ?? []) as unknown as Contact[];
    const totalScanned = rows.length;

    // 2) Batch-resolve tb_users by userLineID (match the platform id OR the
    //    display name — the worker stores one or the other).
    const lineKeys = new Set<string>();
    for (const c of rows) {
      const lineId = (c.line_user_id ?? "").trim();
      const dn = (c.display_name ?? "").trim();
      if (lineId) lineKeys.add(lineId);
      if (dn) lineKeys.add(dn);
    }
    // userLineID → { userid, adminIDSale }
    const userByLineKey = new Map<string, { userid: string; rep: string | null }>();
    if (lineKeys.size > 0) {
      const { data: users, error: usersErr } = await admin
        .from("tb_users")
        .select("userID, userLineID, adminIDSale")
        .in("userLineID", [...lineKeys])
        .neq("userLineID", "");
      if (usersErr) {
        console.error("[crm conversations:tb_users] failed", { code: usersErr.code, message: usersErr.message });
        // soft-fail: continue unlinked rather than failing the whole inbox
      } else {
        for (const u of (users ?? []) as { userID: string; userLineID: string | null; adminIDSale: string | null }[]) {
          const key = (u.userLineID ?? "").trim();
          if (!key) continue;
          // first match wins (duplicate userLineID across customers is rare)
          if (!userByLineKey.has(key)) {
            userByLineKey.set(key, { userid: u.userID, rep: (u.adminIDSale ?? "").trim() || null });
          }
        }
      }
    }

    // 3) Resolve rep display names for the legacy ids we found.
    const repIds = new Set<string>();
    for (const v of userByLineKey.values()) if (v.rep) repIds.add(v.rep);
    const repNameById = new Map<string, string>();
    if (repIds.size > 0) {
      const { data: extras, error: extrasErr } = await admin
        .from("admin_contact_extras")
        .select("legacy_admin_id, display_name")
        .in("legacy_admin_id", [...repIds]);
      if (extrasErr) {
        console.error("[crm conversations:rep names] failed", { code: extrasErr.code, message: extrasErr.message });
      } else {
        for (const e of (extras ?? []) as { legacy_admin_id: string | null; display_name: string | null }[]) {
          const id = (e.legacy_admin_id ?? "").trim();
          if (id) repNameById.set(id, e.display_name?.trim() || id);
        }
      }
    }

    // 4) Assemble + apply the rep filter.
    const conversations: CrmConversation[] = [];
    for (const c of rows) {
      const lineId = (c.line_user_id ?? "").trim();
      const dn = (c.display_name ?? "").trim();
      const linked =
        (lineId && userByLineKey.get(lineId)) ||
        (dn && userByLineKey.get(dn)) ||
        null;

      const repLegacyId = linked?.rep ?? null;

      if (repFilter) {
        // only conversations owned by the filtered rep (must be linked)
        if (!linked || repLegacyId !== repFilter) continue;
      }

      conversations.push({
        id: c.id,
        displayName: c.display_name,
        pictureUrl: c.picture_url,
        lastMessageText: c.last_message_text,
        lastMessageAt: c.last_message_at,
        totalMessages: c.total_messages,
        status: c.status,
        linkedUserid: linked?.userid ?? null,
        repLegacyId,
        repName: repLegacyId ? (repNameById.get(repLegacyId) ?? repLegacyId) : null,
      });
    }

    return { ok: true, data: { conversations, totalScanned } };
  });
}
