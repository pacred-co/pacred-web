"use server";

/**
 * V-G3 — Admin broadcasts (push popup to customers).
 *
 * Per port-spec [docs/port-specs/admin-polish-bundle.md] §V-G3.
 *
 * Status lifecycle:
 *   draft → scheduled → sending → sent (terminal)
 *                                ↘ cancelled (terminal — can branch from draft or scheduled)
 *
 * V1 actions:
 *   - adminCreateBroadcast      → draft
 *   - adminScheduleBroadcast    → draft → scheduled (V-G3.1 cron will fire)
 *   - adminSendBroadcastNow     → draft → sending → sent (immediate fan-out)
 *   - adminCancelBroadcast      → draft|scheduled → cancelled
 *
 * Fan-out (adminSendBroadcastNow):
 *   1. Resolve target profile_ids from `audience` filter
 *   2. Bulk insert notifications rows (1 per target, all linked back via
 *      notifications.broadcast_id FK from migration 0055)
 *   3. Update broadcasts.sent_count = N + status='sent' + sent_at
 *
 * V1 limitations (deferred to V-G3.1):
 *   - LINE push fan-out (V1 = in-app via notifications rows only)
 *   - Per-second rate limiting (V1 = single bulk insert which is fast)
 *   - Scheduled cron worker (V1 = "Send Now" only; admin manually fires
 *     scheduled rows; the table + status are in place for the cron)
 *
 * RBAC: super + sales_admin (per spec §"Open question for ก๊อต" default).
 *
 * Audit: every mutation writes admin_audit_log per ADR-0014.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createBroadcastSchema,   type CreateBroadcastInput,
  scheduleBroadcastSchema, type ScheduleBroadcastInput,
  sendBroadcastNowSchema,  type SendBroadcastNowInput,
  cancelBroadcastSchema,   type CancelBroadcastInput,
} from "@/lib/validators/broadcast";

const ROLES = ["super", "sales_admin"] as const;

// ────────────────────────────────────────────────────────────
// 1) Create draft
// ────────────────────────────────────────────────────────────

export async function adminCreateBroadcast(
  input: CreateBroadcastInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createBroadcastSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: inserted, error: insErr } = await admin
      .from("broadcasts")
      .insert({
        title:               d.title,
        body:                d.body,
        link_href:           d.link_href ?? null,
        audience:            d.audience,
        audience_ids:        d.audience === "specific_ids" ? d.audience_ids ?? [] : null,
        status:              "draft",
        created_by_admin_id: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "broadcast.create", "broadcast", inserted.id, {
      title:    d.title,
      audience: d.audience,
      audience_size: d.audience === "specific_ids" ? d.audience_ids?.length ?? 0 : null,
    });

    revalidatePath("/admin/broadcasts");
    return { ok: true, data: { id: inserted.id } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Schedule (draft → scheduled)
// ────────────────────────────────────────────────────────────

export async function adminScheduleBroadcast(
  input: ScheduleBroadcastInput,
): Promise<AdminActionResult<void>> {
  const parsed = scheduleBroadcastSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: row, error: readErr } = await admin
      .from("broadcasts")
      .select("id, status, title")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; title: string }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.status !== "draft") return { ok: false, error: `bad_status:${row.status}` };

    const { error: updErr } = await admin
      .from("broadcasts")
      .update({
        status:        "scheduled",
        scheduled_for: d.scheduled_for,
        scheduled_at:  now,
      })
      .eq("id", d.id)
      .eq("status", "draft");                                          // optimistic
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "broadcast.schedule", "broadcast", d.id, {
      title:         row.title,
      scheduled_for: d.scheduled_for,
    });

    revalidatePath("/admin/broadcasts");
    revalidatePath(`/admin/broadcasts/${d.id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Send now (draft → sending → sent + fan-out)
// ────────────────────────────────────────────────────────────

export async function adminSendBroadcastNow(
  input: SendBroadcastNowInput,
): Promise<AdminActionResult<{ sent_count: number; failed_count: number }>> {
  const parsed = sendBroadcastNowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load broadcast + check status.
    const { data: bc, error: readErr } = await admin
      .from("broadcasts")
      .select("id, status, title, body, link_href, audience, audience_ids")
      .eq("id", d.id)
      .maybeSingle<{
        id: string; status: string;
        title: string; body: string; link_href: string | null;
        audience: "all" | "juristic_only" | "personal_only" | "specific_ids";
        audience_ids: string[] | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!bc)     return { ok: false, error: "not_found" };
    if (!["draft", "scheduled"].includes(bc.status)) {
      return { ok: false, error: `bad_status:${bc.status}` };
    }

    // Flip to sending state — race-guard.
    const { error: lockErr } = await admin
      .from("broadcasts")
      .update({ status: "sending" })
      .eq("id", d.id)
      .in("status", ["draft", "scheduled"]);
    if (lockErr) return { ok: false, error: `lock_failed: ${lockErr.message}` };

    // Resolve target profile_ids from audience filter.
    let targetIds: string[] = [];
    if (bc.audience === "specific_ids") {
      targetIds = bc.audience_ids ?? [];
    } else {
      // Query profiles by audience filter.
      let query = admin
        .from("profiles")
        .select("id")
        .eq("status", "active")                                        // skip suspended/incomplete
        .limit(100000);
      if (bc.audience === "juristic_only") {
        query = query.eq("account_type", "juristic");
      } else if (bc.audience === "personal_only") {
        query = query.eq("account_type", "personal");
      }
      const { data: profiles, error: profErr } = await query;
      if (profErr) {
        // Roll back to draft so admin can retry.
        await admin.from("broadcasts").update({ status: "draft" }).eq("id", d.id);
        return { ok: false, error: `audience_resolve_failed: ${profErr.message}` };
      }
      targetIds = (profiles ?? []).map((p: { id: string }) => p.id);
    }

    if (targetIds.length === 0) {
      // No targets — flip to sent with 0 count.
      await admin
        .from("broadcasts")
        .update({
          status:       "sent",
          sent_count:   0,
          failed_count: 0,
          sent_at:      new Date().toISOString(),
        })
        .eq("id", d.id);
      await logAdminAction(adminId, "broadcast.send_now_empty", "broadcast", d.id, {
        title: bc.title,
      });
      revalidatePath("/admin/broadcasts");
      revalidatePath(`/admin/broadcasts/${d.id}`);
      return { ok: true, data: { sent_count: 0, failed_count: 0 } };
    }

    // Fan-out: bulk insert notifications rows.
    // category='promo' matches existing enum; broadcast_id links each row
    // back per migration 0055 FK.
    type NotifPayload = {
      profile_id:    string;
      category:      string;
      severity:      string;
      title:         string;
      body:          string;
      link_href:     string | null;
      broadcast_id:  string;
    };
    const payload: NotifPayload[] = targetIds.map((pid) => ({
      profile_id:   pid,
      category:     "promo",
      severity:     "info",
      title:        bc.title,
      body:         bc.body,
      link_href:    bc.link_href,
      broadcast_id: bc.id,
    }));

    // Supabase bulk insert is atomic per chunk — chunk to 1000 rows to be safe.
    let totalInserted = 0;
    let totalFailed   = 0;
    const CHUNK = 1000;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error: insErr } = await admin.from("notifications").insert(slice);
      if (insErr) {
        totalFailed += slice.length;
        await logAdminAction(adminId, "broadcast.fanout_chunk_failed", "broadcast", d.id, {
          chunk_start: i,
          chunk_size:  slice.length,
          error:       insErr.message,
        });
      } else {
        totalInserted += slice.length;
      }
    }

    // Mark sent.
    await admin
      .from("broadcasts")
      .update({
        status:       "sent",
        sent_count:   totalInserted,
        failed_count: totalFailed,
        sent_at:      new Date().toISOString(),
      })
      .eq("id", d.id);

    await logAdminAction(adminId, "broadcast.send_now", "broadcast", d.id, {
      title:        bc.title,
      audience:     bc.audience,
      sent_count:   totalInserted,
      failed_count: totalFailed,
    });

    revalidatePath("/admin/broadcasts");
    revalidatePath(`/admin/broadcasts/${d.id}`);
    return { ok: true, data: { sent_count: totalInserted, failed_count: totalFailed } };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Cancel (draft|scheduled → cancelled)
// ────────────────────────────────────────────────────────────

export async function adminCancelBroadcast(
  input: CancelBroadcastInput,
): Promise<AdminActionResult<void>> {
  const parsed = cancelBroadcastSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: row } = await admin
      .from("broadcasts")
      .select("id, status, title")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; title: string }>();
    if (!row) return { ok: false, error: "not_found" };
    if (!["draft", "scheduled"].includes(row.status)) {
      return { ok: false, error: `cannot_cancel_status:${row.status}` };
    }

    const { error: updErr } = await admin
      .from("broadcasts")
      .update({
        status:           "cancelled",
        cancelled_at:     now,
        cancelled_reason: d.cancelled_reason,
      })
      .eq("id", d.id)
      .in("status", ["draft", "scheduled"]);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "broadcast.cancel", "broadcast", d.id, {
      title:  row.title,
      reason: d.cancelled_reason,
    });

    revalidatePath("/admin/broadcasts");
    revalidatePath(`/admin/broadcasts/${d.id}`);
    return { ok: true };
  });
}
