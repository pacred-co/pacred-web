"use server";

/**
 * Customer activity timeline (CRM depth · 2026-06-08).
 *
 * "เห็นว่าคุยอะไร · คนมาทำงานต่อได้" — a chronological feed of everything the
 * team has logged against a customer so the next rep can pick up the thread.
 *
 * UNION of two sources, newest-first:
 *   - lead_call_log (0133) — call attempts + outcomes (status + note).
 *   - customer_note (0155) — free-text manual notes any rep drops.
 *
 * NOTE on LINE messages: `Podeng_line_messages` is keyed by the LINE customer
 * row, not by phone/userid — there is no trivial phone→tb_users→Podeng link
 * (customers type a display LINE id, not the platform U… id). Per the build
 * brief we SKIP LINE here rather than fabricate a wrong link; the omni-inbox at
 * /admin/crm already shows the LINE thread for a matched contact.
 *
 * Backed by customer_note (0155 · 1 isolated table · NO FK · RLS service-role).
 * Keyed by `userid` = tb_users.userID.
 *
 * RBAC: super/manager/sales_admin/sales/ops (mirror the CRM roles — the staff
 * who read/write a customer's history). Reads/writes via createAdminClient
 * (RLS-bypass · server-only) through withAdmin.
 *
 * §0c (AGENTS.md): EVERY supabase query destructures `{ data, error }`.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import type { ActivityEntry } from "./customer-activity-types";

// Mirror the CRM roles (super/manager/sales_admin/sales/ops) + accounting,
// since the customer-detail page where the timeline renders gates ops/
// sales_admin/accounting — an accounting admin must be able to read/add notes.
const ROLES = ["super", "manager", "sales_admin", "sales", "ops", "accounting"] as const;

// Cap per source so a chatty customer can't blow the page (merged + capped).
const PER_SOURCE_CAP = 100;
const MERGED_CAP = 150;
const MAX_BODY_LEN = 2000;

function normUserid(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * The merged activity timeline for one customer (calls + notes, newest-first).
 * Best-effort per source — if one source errors it's logged and skipped rather
 * than failing the whole timeline.
 */
export async function getCustomerActivity(
  userid: string,
): Promise<AdminActionResult<ActivityEntry[]>> {
  const uid = normUserid(userid);
  if (!uid) return { ok: false, error: "missing_userid" };

  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();

    const [callsRes, notesRes] = await Promise.all([
      admin
        .from("lead_call_log")
        .select("id, status, note, called_at, admin_id")
        .eq("userid", uid)
        .order("called_at", { ascending: false })
        .limit(PER_SOURCE_CAP),
      admin
        .from("customer_note")
        .select("id, body, created_at, created_by")
        .eq("userid", uid)
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_CAP),
    ]);

    const entries: ActivityEntry[] = [];

    if (callsRes.error) {
      console.error("[customer-activity lead_call_log] failed", { code: callsRes.error.code, message: callsRes.error.message, userid: uid });
    } else {
      for (const c of (callsRes.data ?? []) as {
        id: string;
        status: string | null;
        note: string | null;
        called_at: string | null;
        admin_id: string | null;
      }[]) {
        entries.push({
          kind: "call",
          id: `call:${c.id}`,
          at: c.called_at,
          by: (c.admin_id ?? "").trim() || null,
          callStatus: c.status ?? null,
          body: (c.note ?? "").trim() || null,
        });
      }
    }

    if (notesRes.error) {
      console.error("[customer-activity customer_note] failed", { code: notesRes.error.code, message: notesRes.error.message, userid: uid });
    } else {
      for (const n of (notesRes.data ?? []) as {
        id: number;
        body: string | null;
        created_at: string | null;
        created_by: string | null;
      }[]) {
        entries.push({
          kind: "note",
          id: `note:${n.id}`,
          at: n.created_at,
          by: (n.created_by ?? "").trim() || null,
          callStatus: null,
          body: (n.body ?? "").trim() || null,
        });
      }
    }

    // Merge newest-first across both sources, then cap.
    entries.sort((a, b) => {
      const ta = a.at ? Date.parse(a.at) : 0;
      const tb = b.at ? Date.parse(b.at) : 0;
      return tb - ta;
    });

    return { ok: true, data: entries.slice(0, MERGED_CAP) };
  });
}

/**
 * Add a free-text note to a customer's timeline. Returns the refreshed merged
 * timeline so the client re-renders without a round-trip.
 */
export async function addCustomerNote(
  userid: string,
  body: string,
): Promise<AdminActionResult<ActivityEntry[]>> {
  const uid = normUserid(userid);
  const text = (body ?? "").trim().slice(0, MAX_BODY_LEN);
  if (!uid) return { ok: false, error: "missing_userid" };
  if (!text) return { ok: false, error: "empty_note" };

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const createdBy = (await getAdminLegacyId(adminId)) ?? adminId;

    const { error: insErr } = await admin
      .from("customer_note")
      .insert({ userid: uid, body: text, created_by: createdBy });
    if (insErr) {
      console.error("[customer_note addCustomerNote] failed", { code: insErr.code, message: insErr.message, userid: uid });
      return { ok: false, error: `insert_failed: ${insErr.message}` };
    }

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/customers/${uid}`);

    // Return the refreshed timeline (best-effort — the write already landed).
    const res = await getCustomerActivity(uid);
    return { ok: true, data: res.ok ? (res.data ?? []) : [] };
  });
}
