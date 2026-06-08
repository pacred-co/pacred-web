"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

/**
 * @deprecated 2026-06-08 — Lane B3 of the ops-workflow audit (ภูม session).
 *
 * THIS FILE IS A §0e DEAD-WRITE TRAP. All 4 exported functions write/read
 * the REBUILT `forwarder_driver` table which has **0 rows on prod** (the
 * twin · never used). The LIVE driver-assignment path lives in:
 *   - `actions/admin/driver-batches.ts` (admin manage)
 *   - `actions/admin/driver-work.ts`    (driver mobile work-list)
 *   - which write to legacy `tb_forwarder_driver` + `tb_forwarder_driver_item`
 *
 * Why this file still exists (instead of being renamed `.tombstone.ts`):
 * the 4 functions are still IMPORTED by 4 UI files (which themselves render
 * inside dead chains · empty rebuilt parent tables · never reach prod):
 *   - searchDriversByQuery               → driver-combobox.tsx → driver-assign-form.tsx
 *                                         → forwarders/[fNo]/page.tsx (rebuilt `forwarders` branch · 0 rows)
 *   - adminAssignDriverToForwarder       → same chain
 *   - adminUpdateDriverAssignmentStatus  → drivers/actions-cell.tsx (NO importers)
 *   - driverUpdateOwnAssignmentStatus    → driver-runs/action-buttons.tsx → driver-runs/page.tsx
 *                                         (reads rebuilt `forwarder_driver` · always empty · buttons never render)
 *
 * To physically tombstone this file: unwind the 4 UI chains FIRST (delete
 * the orphan components · drop the sidebar entries `driver.toDeliver` +
 * `driver.history` from lib/admin/sidebar-menu.ts · retarget or retire
 * `app/api/cron/expire-driver-assignments/route.ts` which also writes
 * the dead twin every hour · ภูม decision #3 in the gap doc). Then rename
 * this file `.tombstone.ts`.
 *
 * Tracker: docs/audit/driver-assignment-gap-2026-05-30.md (closure log).
 * Prod probe (2026-06-08): rebuilt `forwarder_driver` = 0 rows · rebuilt
 * `forwarders` = 0 rows · live `tb_forwarder_driver*` = populated.
 */

// ────────────────────────────────────────────────────────────
// Phase C QoL #2 — fuzzy driver search.
// ────────────────────────────────────────────────────────────
// The old "type member_code in a textbox" form was hostile to ops staff
// who don't have the PR-code memorised. This server action backs a
// combobox: type fragment of member_code / name / phone → returns top 10
// `{driver_no=member_code, name, phone, profile_id}` hits, each labelled
// `{member_code} · {name} · {phone}` for the dropdown.
//
// Driver eligibility: the schema doesn't carry a `role='driver'` flag
// on profiles — drivers are identified by holding the `driver` admin
// role in the admins table. We filter on that to avoid surfacing
// regular customers (who'd cause a NOT-a-driver assignment).

const searchDriversSchema = z.object({
  q:     z.string().trim().min(1, "ระบุคำค้น").max(80),
  limit: z.number().int().min(1).max(50).optional(),
});
export type SearchDriversInput = z.infer<typeof searchDriversSchema>;
export type DriverSearchHit = {
  profile_id:  string;
  member_code: string | null;
  name:        string;
  phone:       string | null;
  display:     string;
};

export async function searchDriversByQuery(
  input: SearchDriversInput,
): Promise<AdminActionResult<{ hits: DriverSearchHit[] }>> {
  const parsed = searchDriversSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { q } = parsed.data;
  const limit = parsed.data.limit ?? 10;

  return withAdmin<{ hits: DriverSearchHit[] }>(["ops", "super"], async () => {
    const admin = createAdminClient();

    // Defensive escape — strip commas/parens so the OR filter can't be broken out of.
    const safeQ = q.replace(/[(),]/g, " ");
    const pattern = `%${safeQ}%`;

    const { data, error } = await admin
      .from("admins")
      .select(`
        profile_id, role,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )
      `)
      .eq("role", "driver")
      .eq("is_active", true)
      .or(
        [
          `member_code.ilike.${pattern}`,
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `phone.ilike.${pattern}`,
        ].join(","),
        { referencedTable: "profiles" },
      )
      .limit(limit * 2);
    if (error) return { ok: false, error: error.message };

    type ProfileShape = {
      member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null;
    };
    type Row = {
      profile_id: string; role: string;
      profile:    ProfileShape | ProfileShape[] | null;
    };

    const seen = new Set<string>();
    const hits: DriverSearchHit[] = [];
    for (const r of (data ?? []) as Row[]) {
      if (seen.has(r.profile_id)) continue;
      const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      if (!prof) continue;

      const name  = `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "—";
      const phone = prof.phone ?? null;

      seen.add(r.profile_id);
      hits.push({
        profile_id:  r.profile_id,
        member_code: prof.member_code,
        name,
        phone,
        display:     `${prof.member_code ?? "—"} · ${name} · ${phone ?? "—"}`,
      });
      if (hits.length >= limit) break;
    }

    return { ok: true, data: { hits } };
  });
}

/**
 * Admin actions on forwarder_driver assignments (P-18 + T-P1 cargo revenue path).
 * Admins can:
 *   - CREATE assignments via adminAssignDriverToForwarder (T-P1 — biggest cargo workflow gap)
 *   - Transition status via adminUpdateDriverAssignmentStatus (P-18)
 * Cron handles the auto 1→3 expiry (17h timeout).
 */

type Status = 1 | 2 | 3 | 4;

const updateSchema = z.object({
  id:        z.string().uuid(),
  status:    z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  note:      z.string().trim().max(500).optional(),
});
export type AdminUpdateDriverAssignmentInput = z.infer<typeof updateSchema>;

const STATUS_LABEL: Record<Status, string> = {
  1: "มอบหมายแล้ว (รอรับงาน)",
  2: "รับงานแล้ว",
  3: "หมดเวลารับงาน",
  4: "ส่งงานเสร็จ",
};

// ────────────────────────────────────────────────────────────
// CT-7: driver self-updates own assignment status
// ────────────────────────────────────────────────────────────
// Driver lands on /admin/driver-runs, accepts (1→2) and completes (2→4)
// their own rows without admin/ops intervention. Self-row check enforced
// in the action so driver can't modify someone else's assignment.

const driverSelfUpdateSchema = z.object({
  id:     z.string().uuid(),
  action: z.enum(["accept", "complete"]),
});
export type DriverSelfUpdateInput = z.infer<typeof driverSelfUpdateSchema>;

export async function driverUpdateOwnAssignmentStatus(
  input: DriverSelfUpdateInput,
): Promise<AdminActionResult> {
  const parsed = driverSelfUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["driver", "ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing, error: existingErr } = await admin
      .from("forwarder_driver")
      .select("id, status, profile_id, forwarder_id, accepted_at")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: Status; profile_id: string; forwarder_id: string; accepted_at: string | null }>();
    if (existingErr) {
      console.error(`[forwarder_driver mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };

    // Self-row check — driver can only update OWN assignments. ops/super bypass for admin overrides.
    // (adminId is the profile id from common.ts withAdmin context.)
    const isSelf = existing.profile_id === adminId;
    if (!isSelf) {
      // Only ops/super may touch others' rows — verify by re-reading the wrapper's
      // role context indirectly via a second admin lookup.
      const { data: caller, error: callerErr } = await admin
        .from("admins")
        .select("role")
        .eq("profile_id", adminId)
        .in("role", ["ops", "super"])
        .maybeSingle();
      if (callerErr) {
        console.error(`[admins mutation lookup] failed`, { code: callerErr.code, message: callerErr.message });
        return { ok: false, error: `db_error:${callerErr.code ?? "unknown"}` };
      }
      if (!caller) return { ok: false, error: "ไม่อนุญาต — งานนี้ไม่ใช่ของคุณ" };
    }

    // Allowed transitions
    let nextStatus: Status;
    if (d.action === "accept") {
      if (existing.status !== 1) return { ok: false, error: "งานนี้ไม่ได้อยู่ในสถานะรอรับ" };
      nextStatus = 2;
    } else {
      if (existing.status !== 2) return { ok: false, error: "ต้องรับงานก่อน + ยังไม่ครบเงื่อนไขส่งสำเร็จ" };
      nextStatus = 4;
    }

    const update: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 2) update.accepted_at  = new Date().toISOString();
    if (nextStatus === 4) update.completed_at = new Date().toISOString();

    const { error } = await admin
      .from("forwarder_driver")
      .update(update)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, `forwarder_driver.driver_${d.action}`, "forwarder_driver", existing.id, {
      forwarder_id: existing.forwarder_id,
      by_self:      isSelf,
      before:       { status: existing.status },
      after:        { status: nextStatus, label: STATUS_LABEL[nextStatus] },
    });

    revalidatePath("/admin/driver-runs");
    revalidatePath("/admin/drivers");
    return { ok: true };
  });
}

export async function adminUpdateDriverAssignmentStatus(
  input: AdminUpdateDriverAssignmentInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing, error: existingErr } = await admin
      .from("forwarder_driver")
      .select("id, status, profile_id, forwarder_id, fd_date, accepted_at, completed_at")
      .eq("id", d.id)
      .maybeSingle<{
        id: string;
        status: Status;
        profile_id: string;
        forwarder_id: string;
        fd_date: string;
        accepted_at: string | null;
        completed_at: string | null;
      }>();

    if (existingErr) {
      console.error(`[forwarder_driver mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === d.status) return { ok: true };  // no-op

    const update: Record<string, unknown> = { status: d.status };
    if (d.note !== undefined)               update.note         = d.note;
    if (d.status === 2 && !existing.accepted_at)  update.accepted_at  = new Date().toISOString();
    if (d.status === 4 && !existing.completed_at) update.completed_at = new Date().toISOString();

    const { error } = await admin
      .from("forwarder_driver")
      .update(update)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      adminId,
      "forwarder_driver.update_status",
      "forwarder_driver",
      existing.id,
      {
        forwarder_id: existing.forwarder_id,
        driver_id:    existing.profile_id,
        before:       { status: existing.status },
        after:        { status: d.status, label: STATUS_LABEL[d.status] },
      },
    );

    revalidatePath("/admin/drivers");
    revalidatePath(`/admin/drivers/${existing.id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// T-P1: ASSIGN driver to forwarder (the missing-link from P-18)
// ────────────────────────────────────────────────────────────
//
// P-18 only built the status-transition action.  Admins still couldn't
// CREATE an assignment from the UI — they had to insert the row by hand
// in Supabase Table Editor.  Per Part T-P1 (cargo revenue path), this
// is one of the highest-leverage admin workflow gaps because every
// cargo shipment needs a driver before it can leave the warehouse.
//
// Driver identification: the schema allows any profile_id (no driver
// role flag).  In practice ops staff knows the driver by their member
// code (PR + min 3 digits, e.g. PR001), so we accept member_code OR raw
// profile_id.  Resolving by member_code is friendlier — typing UUIDs is
// error-prone.
//
// Re-assignment: if an open (status=1 or 2) assignment already exists
// for this forwarder, fail loud — admin should explicitly cancel the
// old one (mark status=3 expired or status=4 completed) before creating
// a new one.  Prevents accidental double-assignment.

const assignSchema = z.object({
  forwarder_id: z.string().uuid(),
  // Either provide member_code (friendlier) or profile_id (fallback).
  // At least one must be present.
  member_code:  z.string().trim().regex(/^PR\d{3,}$/i, "member_code ต้องเป็นรูปแบบ PR001").optional(),
  profile_id:   z.string().uuid().optional(),
  note:         z.string().trim().max(500).optional(),
}).refine(
  (d) => d.member_code || d.profile_id,
  { message: "ต้องระบุ member_code หรือ profile_id อย่างน้อย 1 อย่าง" },
);
export type AdminAssignDriverInput = z.infer<typeof assignSchema>;

export async function adminAssignDriverToForwarder(
  input: AdminAssignDriverInput,
): Promise<AdminActionResult<{ assignment_id: string }>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // 1. Resolve driver profile_id ────────────────────────────
    let driverProfileId: string;
    if (d.profile_id) {
      driverProfileId = d.profile_id;
    } else {
      // member_code → profile_id lookup; case-insensitive (uppercase
      // stored, but admins might type lowercase).
      const code = d.member_code!.toUpperCase();
      const { data: prof, error: profErr } = await admin
        .from("profiles")
        .select("id")
        .eq("member_code", code)
        .maybeSingle<{ id: string }>();
      if (profErr) {
        console.error(`[profiles list] failed`, { code: profErr.code, message: profErr.message });
      }
      if (!prof) return { ok: false, error: `ไม่พบ profile member_code = ${code}` };
      driverProfileId = prof.id;
    }

    // 2. Verify forwarder exists + grab info for the notification ──
    const { data: forwarder, error: forwarderErr } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id, status")
      .eq("id", d.forwarder_id)
      .maybeSingle<{ id: string; f_no: string; profile_id: string; status: string }>();
    if (forwarderErr) {
      console.error(`[forwarders mutation lookup] failed`, { code: forwarderErr.code, message: forwarderErr.message });
      return { ok: false, error: `db_error:${forwarderErr.code ?? "unknown"}` };
    }
    if (!forwarder) return { ok: false, error: "forwarder_not_found" };

    // 3. Reject if there's already an OPEN assignment ─────────
    const { data: existing, error: existingErr } = await admin
      .from("forwarder_driver")
      .select("id, status")
      .eq("forwarder_id", d.forwarder_id)
      .in("status", [1, 2])  // 1=assigned, 2=accepted (open states)
      .maybeSingle<{ id: string; status: number }>();
    if (existingErr) {
      console.error(`[forwarder_driver list] failed`, { code: existingErr.code, message: existingErr.message });
    }
    if (existing) {
      return {
        ok: false,
        error: `forwarder นี้มีคนขับมอบหมายอยู่แล้ว (assignment ${existing.id} status=${existing.status}). กรุณายกเลิกของเดิมก่อน`,
      };
    }

    // 4. Insert new assignment (status=1 = waiting for accept) ──
    const { data: created, error } = await admin
      .from("forwarder_driver")
      .insert({
        forwarder_id: d.forwarder_id,
        profile_id:   driverProfileId,
        status:       1,
        note:         d.note ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      adminId,
      "forwarder_driver.assign",
      "forwarder_driver",
      created.id,
      {
        forwarder_id: d.forwarder_id,
        f_no:         forwarder.f_no,
        driver_id:    driverProfileId,
        member_code:  d.member_code ?? null,
      },
    );

    // 5. Notify driver (LINE push if linked, else falls through to
    //    notifications table).  Driver has 17h to accept before cron
    //    auto-expires the assignment to status=3.
    // Reference type "forwarder" so the driver's notification deep-links
    // back to the shipment.  No "forwarder_driver" reference type in the
    // notification schema (drivers see assignments via /driver/jobs UI
    // which lists by status).
    void sendNotification(driverProfileId, {
      category: "forwarder",
      severity: "info",
      title:    `งานใหม่ — ${forwarder.f_no}`,
      body:     `มีงานขนส่งมอบหมายให้คุณ — กรุณารับงานภายใน 17 ชม.`,
      link_href: `/driver/jobs/${created.id}`,
      reference_type: "forwarder",
      reference_id:   forwarder.id,
    });

    revalidatePath(`/admin/forwarders/${forwarder.f_no}`);
    revalidatePath("/admin/drivers");
    return { ok: true, data: { assignment_id: created.id } };
  });
}
