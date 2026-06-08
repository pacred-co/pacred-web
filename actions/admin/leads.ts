"use server";

/**
 * /admin/leads — the acquisition CALL-QUEUE (CEO opening-day directive §6).
 *
 * Source of truth for what to build:
 *   docs/research/ceo-directives-2026-06-01.md §6 + §7.1
 *   docs/research/big-audit-2026-06-01/01-customer-identity.md (U-2 win-back)
 *
 * CEO directive (paraphrased): "START NOW — call ALL old AX customers + the
 * big-PCS customers. Sales+CS work a call-list top-down. Day-1 a customer
 * sends a phone → call to close." The biggest single opportunity in the data
 * is the 6,936 never-activated cold leads (`tb_users.userActive=''` with a
 * phone) — 78% of the customer base is an un-worked lead pile.
 *
 * ── Tables (⚠️ tb_users is camelCase on prod; tb_forwarder is lowercase) ──
 *   tb_users      — THE lead pool. `userID` (PR code) · `userTel` · `userName`/
 *                   `userLastName` · `userActive` (''=cold lead · '1'=contacted)
 *                   · `adminIDSale` (assigned rep) · `userRegistered`.
 *   tb_forwarder  — order history. `userid` (LOWERCASE) → group-count gives
 *                   the big-PCS ranking (top order owners).
 *   lead_call_log — NEW (migration 0133). One row per call attempt, keyed by
 *                   `userid` (= tb_users.userID). Latest row per userid =
 *                   the lead's current call-state.
 *
 * RBAC: super + sales_admin + sales + ops (the staff who actually call).
 * Reads use createAdminClient (RLS-bypass) — a PDPA/PII surface (phones).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import { logAdminExport } from "./export-log";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { pickLeastLoadedCsRep } from "@/lib/admin/assign-cs-rep";
import {
  LEAD_CALL_STATUSES,
  type LeadCallStatus,
  type LeadQueueFilter,
  type LeadQueueResult,
  type LeadQueueRow,
  type LeadStats,
  type LogLeadCallInput,
} from "./leads-types";

const ROLES = ["super", "sales_admin", "sales", "ops"] as const;
const PAGE_SIZE = 200;
// Safety cap for the "export all filtered" path (owner directive 2026-06-07).
// 10,000 comfortably covers the full cold-lead pool (~6,936) in one file while
// bounding the in-memory build. If a slice ever exceeds this the export flags
// `truncated` so the operator knows to narrow the filter.
const EXPORT_CAP = 10000;

// Bound for the big-PCS ranking scan. True full-base ranking over the 47,636
// tb_forwarder orders needs an aggregate RPC (a follow-up); for the day-1
// call-queue we rank the most-recent slice — recent big owners are exactly who
// Sales wants to call first. The orchestrator can swap this for an RPC later.
const BIG_PCS_SCAN = 8000;
const BIG_PCS_TOP = 200;

type TbUserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userActive: string | null;
  adminIDSale: string | null;
  userRegistered: string | null;
};

function isValidStatus(s: string): s is LeadCallStatus {
  return (LEAD_CALL_STATUSES as readonly string[]).includes(s);
}

/** Escape a user search term for a PostgREST `.or(ilike)` filter. */
function escapeTerm(raw: string): string {
  return raw.replace(/[\\%_,]/g, (m) => "\\" + m);
}

/** Build the lead-queue serializable rows for the table. */
function toRow(
  u: TbUserRow,
  orderCount: number,
  call: { status: string | null; called_at: string | null } | undefined,
): LeadQueueRow {
  const callStatus =
    call?.status && isValidStatus(call.status) ? call.status : null;
  return {
    userid: u.userID,
    name: `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—",
    tel: (u.userTel ?? "").trim(),
    rep: (u.adminIDSale ?? "").trim(),
    registered: u.userRegistered,
    orderCount,
    callStatus,
    lastCall: call?.called_at ?? null,
  };
}

/**
 * The call-queue. segment:
 *   - 'cold'    → tb_users.userActive='' (never-contacted lead) WITH a phone.
 *   - 'big-pcs' → top forwarder-order owners (most-recent slice ranked by count).
 *   - 'all'     → every customer with a phone (most-recently registered first).
 *
 * For each visible lead we attach: lifetime forwarder order count + the latest
 * lead_call_log status. The `status` filter then narrows to a call-state.
 */
export async function getLeadQueue(
  filter: LeadQueueFilter,
): Promise<AdminActionResult<LeadQueueResult>> {
  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();
    const segment = filter.segment ?? "cold";
    // "export all" path: one big page (capped) instead of the 200-row window.
    const pageSize = filter.exportAll ? EXPORT_CAP : PAGE_SIZE;
    const page = filter.exportAll ? 1 : Math.max(1, Math.floor(filter.page ?? 1));
    const from = (page - 1) * pageSize;
    const to = from + pageSize; // fetch one extra to compute hasMore

    let users: TbUserRow[] = [];
    // Per-lead order count (big-PCS ranking signal + display).
    const orderCountByUser = new Map<string, number>();

    const userSelect =
      "userID, userName, userLastName, userTel, userActive, adminIDSale, userRegistered";

    if (segment === "big-pcs") {
      // 1) Rank owners by forwarder order count over a recent slice.
      const { data: fwd, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("userid")
        .order("id", { ascending: false })
        .limit(BIG_PCS_SCAN);
      if (fwdErr) {
        console.error(`[tb_forwarder big-pcs scan] failed`, { code: fwdErr.code, message: fwdErr.message });
        return { ok: false, error: `query_failed: ${fwdErr.message}` };
      }
      for (const r of (fwd ?? []) as { userid: string | null }[]) {
        const uid = (r.userid ?? "").trim();
        if (!uid) continue;
        orderCountByUser.set(uid, (orderCountByUser.get(uid) ?? 0) + 1);
      }
      // 2) Top N owners by count.
      let ranked = [...orderCountByUser.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, BIG_PCS_TOP)
        .map(([uid]) => uid);

      // 3) Load their tb_users rows.
      const usersById = new Map<string, TbUserRow>();
      if (ranked.length > 0) {
        const { data: us, error: usErr } = await admin
          .from("tb_users")
          .select(userSelect)
          .in("userID", ranked);
        if (usErr) {
          console.error(`[tb_users big-pcs load] failed`, { code: usErr.code, message: usErr.message });
          return { ok: false, error: `query_failed: ${usErr.message}` };
        }
        for (const u of (us ?? []) as unknown as TbUserRow[]) usersById.set(u.userID, u);
      }

      // 4) Optional free-text narrow (over the ranked set, in memory).
      if (filter.q && filter.q.trim()) {
        const term = filter.q.trim().toLowerCase();
        ranked = ranked.filter((uid) => {
          const u = usersById.get(uid);
          if (!u) return false;
          const hay = `${u.userID} ${u.userTel ?? ""} ${u.userName ?? ""} ${u.userLastName ?? ""}`.toLowerCase();
          return hay.includes(term);
        });
      }

      // 5) Preserve rank order, then page.
      const orderedUsers = ranked
        .map((uid) => usersById.get(uid))
        .filter((u): u is TbUserRow => Boolean(u));
      users = orderedUsers.slice(from, to);
    } else {
      // 'cold' | 'all' — page tb_users directly.
      let q = admin
        .from("tb_users")
        .select(userSelect)
        .order("userRegistered", { ascending: false })
        .range(from, to - 1);

      if (segment === "cold") {
        // never-contacted lead (legacy '' sentinel) WITH a phone to call.
        q = q.eq("userActive", "").neq("userTel", "");
      } else {
        // 'all' — anyone with a phone.
        q = q.neq("userTel", "");
      }

      if (filter.q && filter.q.trim()) {
        const term = escapeTerm(filter.q.trim());
        q = q.or(
          `userID.ilike.%${term}%,userTel.ilike.%${term}%,userName.ilike.%${term}%,userLastName.ilike.%${term}%`,
        );
      }

      const { data, error } = await q;
      if (error) {
        console.error(`[tb_users lead queue] failed`, { code: error.code, message: error.message });
        return { ok: false, error: `query_failed: ${error.message}` };
      }
      users = (data ?? []) as unknown as TbUserRow[];

      // Order counts for the visible page only (bounded .in()).
      const ids = users.map((u) => u.userID);
      if (ids.length > 0) {
        const { data: fwd, error: fwdErr } = await admin
          .from("tb_forwarder")
          .select("userid")
          .in("userid", ids);
        if (fwdErr) {
          console.error(`[tb_forwarder page counts] failed`, { code: fwdErr.code, message: fwdErr.message });
        }
        for (const r of (fwd ?? []) as { userid: string | null }[]) {
          const uid = (r.userid ?? "").trim();
          if (!uid) continue;
          orderCountByUser.set(uid, (orderCountByUser.get(uid) ?? 0) + 1);
        }
      }
    }

    // hasMore + trim the extra row (only for the direct-paged segments;
    // big-pcs already sliced exactly to pageSize above).
    let hasMore = false;
    if (segment !== "big-pcs" && users.length > pageSize) {
      hasMore = true;
      users = users.slice(0, pageSize);
    }

    // Latest call-state per visible lead (one query, newest-first, dedup in JS).
    const visibleIds = users.map((u) => u.userID);
    const latestCallByUser = new Map<string, { status: string | null; called_at: string | null }>();
    if (visibleIds.length > 0) {
      const { data: calls, error: callsErr } = await admin
        .from("lead_call_log")
        .select("userid, status, called_at")
        .in("userid", visibleIds)
        .order("called_at", { ascending: false });
      if (callsErr) {
        console.error(`[lead_call_log latest] failed`, { code: callsErr.code, message: callsErr.message });
      }
      for (const c of (calls ?? []) as { userid: string; status: string | null; called_at: string | null }[]) {
        if (!latestCallByUser.has(c.userid)) {
          latestCallByUser.set(c.userid, { status: c.status, called_at: c.called_at });
        }
      }
    }

    let rows = users.map((u) =>
      toRow(u, orderCountByUser.get(u.userID) ?? 0, latestCallByUser.get(u.userID)),
    );

    // Call-state filter (applied after the join).
    const statusFilter = filter.status && filter.status !== "all" ? filter.status : null;
    if (statusFilter) {
      rows = rows.filter((r) => r.callStatus === statusFilter);
    }

    return { ok: true, data: { rows, page, hasMore } };
  });
}

/** One CSV row for the leads export (matches the on-screen columns). */
export type LeadExportRow = Record<string, string | number | null | undefined>;

/**
 * Export the ENTIRE filtered lead list (all pages, capped at EXPORT_CAP) as
 * CSV rows — for the "⬇ CSV ทั้งหมด" button on /admin/leads. Reuses
 * getLeadQueue with `exportAll` so the export can never drift from the table.
 * Writes an admin_export_log audit row (PII walk-off trail — owner directive).
 */
export async function exportLeadsAll(
  filter: Omit<LeadQueueFilter, "page" | "exportAll">,
): Promise<{ rows: LeadExportRow[]; truncated: boolean }> {
  const res = await getLeadQueue({ ...filter, exportAll: true });
  if (!res.ok || !res.data) {
    console.error("[exportLeadsAll] query failed:", res.ok ? "no_data" : res.error);
    return { rows: [], truncated: false };
  }
  const rows: LeadExportRow[] = res.data.rows.map((r) => ({
    tel: r.tel ?? "",
    name: r.name,
    userid: r.userid,
    orderCount: r.orderCount,
    rep: r.rep ?? "",
    lastCall: r.lastCall ?? "",
    callStatus: r.callStatus,
    registered: r.registered ?? "",
  }));
  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "leads",
    filters: { segment: filter.segment, status: filter.status ?? "all", q: filter.q ?? "" },
    rowCount: rows.length,
    truncated,
  });
  return { rows, truncated };
}

/**
 * Log a call attempt against a lead. Inserts a lead_call_log row tagged with
 * the calling rep's legacy admin id; the latest row becomes the lead's
 * current call-state on the queue.
 */
export async function logLeadCall(
  input: LogLeadCallInput,
): Promise<AdminActionResult<{ id: string; csAssigned?: string | null }>> {
  const userid = (input?.userid ?? "").trim();
  const status = input?.status;
  if (!userid) return { ok: false, error: "missing_userid" };
  if (!status || !isValidStatus(status)) return { ok: false, error: "invalid_status" };
  const note = (input?.note ?? "").trim();

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    // Prefer the rep's legacy admin code (matches tb_users.adminIDSale); fall
    // back to the profile uuid when the admin was never bridged to PCS.
    const repId = (await getAdminLegacyId(adminId)) ?? adminId;

    const { data: inserted, error: insErr } = await admin
      .from("lead_call_log")
      .insert({
        userid,
        admin_id: repId,
        status,
        note: note || null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      console.error(`[lead_call_log insert] failed`, { code: insErr?.code, message: insErr?.message });
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    // Sales→CS handoff (CEO §5: "ปิดการขายแล้ว cs ทำงานต่อ"). Closing a lead hands
    // it to a CS who then follows the order status — UNLESS it's a เคลียร์/แอร์ job
    // (bypassCs · "ทะลุ cs ได้เลย"). Only assign when the customer has no CS yet
    // (never overwrite an existing owner). Best-effort: a handoff failure must NOT
    // fail the already-recorded call log.
    let csAssigned: string | null = null;
    if (status === "closed" && !input.bypassCs) {
      try {
        const { data: cust, error: custErr } = await admin
          .from("tb_users")
          .select("adminIDCS")
          .eq("userID", userid)
          .maybeSingle<{ adminIDCS: string | null }>();
        if (custErr) {
          console.error(`[leads CS-handoff] tb_users read failed`, { code: custErr.code, message: custErr.message });
        } else if (!((cust?.adminIDCS ?? "").trim())) {
          const cs = await pickLeastLoadedCsRep(admin);
          const { error: updErr } = await admin
            .from("tb_users")
            .update({ adminIDCS: cs })
            .eq("userID", userid);
          if (updErr) {
            console.error(`[leads CS-handoff] adminIDCS assign failed`, { code: updErr.code, message: updErr.message });
          } else {
            csAssigned = cs;
          }
        } else {
          csAssigned = (cust!.adminIDCS ?? "").trim(); // already owned — surface it
        }
      } catch (e) {
        console.error(`[leads CS-handoff] unexpected`, e);
      }
    }

    revalidatePath("/admin/leads");
    return { ok: true, data: { id: inserted.id, csAssigned } };
  });
}

/**
 * Top-of-page counts: cold-lead pool · calls logged today · closed leads.
 * Best-effort — a failed sub-count surfaces as 0 rather than failing the page.
 */
export async function getLeadStats(): Promise<AdminActionResult<LeadStats>> {
  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();

    // Cold-lead pool: userActive='' with a phone (head: count-only).
    const { count: coldCount, error: coldErr } = await admin
      .from("tb_users")
      .select("userID", { count: "exact", head: true })
      .eq("userActive", "")
      .neq("userTel", "");
    if (coldErr) {
      console.error(`[tb_users cold count] failed`, { code: coldErr.code, message: coldErr.message });
    }

    // Calls logged today (server-local midnight → now).
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count: todayCount, error: todayErr } = await admin
      .from("lead_call_log")
      .select("id", { count: "exact", head: true })
      .gte("called_at", startOfDay.toISOString());
    if (todayErr) {
      console.error(`[lead_call_log today count] failed`, { code: todayErr.code, message: todayErr.message });
    }

    // Closed leads — distinct userids whose LATEST call-state = 'closed'.
    // Approximated by counting distinct userids among 'closed' rows (a lead is
    // rarely re-opened after a close; exact "latest=closed" needs an RPC).
    const { data: closedRows, error: closedErr } = await admin
      .from("lead_call_log")
      .select("userid")
      .eq("status", "closed")
      .limit(5000);
    if (closedErr) {
      console.error(`[lead_call_log closed] failed`, { code: closedErr.code, message: closedErr.message });
    }
    const closedSet = new Set<string>();
    for (const r of (closedRows ?? []) as { userid: string }[]) closedSet.add(r.userid);

    return {
      ok: true,
      data: {
        cold: coldCount ?? 0,
        calledToday: todayCount ?? 0,
        closed: closedSet.size,
      },
    };
  });
}
