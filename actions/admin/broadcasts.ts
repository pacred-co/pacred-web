"use server";

/**
 * Admin broadcasts — the customer login-popup announcement.
 *
 * ── 2026-06-01 — REPOINTED to legacy `tb_notify` (re-sweep M-1 · FG-1) ───────
 * Faithful port of `pcs-admin/popup.php` (the "รายการ pop up ประกาศ" screen):
 * an admin creates ONE `tb_notify` row and EVERY active customer sees it at
 * login (filtered by the `datestart..dateexp` display window) until each one
 * acknowledges it — which inserts a `tb_notify_read` receipt (userid + popid).
 *
 * This reaches ALL 8,898 migrated customers because the customer popup reads
 * `tb_notify` directly (join key = the customer's `userid` = profile.member_code).
 * The previous rebuilt fan-out wrote one `notifications` row per `profiles` row,
 * which only covered the small subset of customers that had logged in to the
 * rebuilt app.
 *
 * Legacy SQL (popup.php L31-33):
 *   INSERT INTO `tb_notify`(`title`,`content`,`dateExp`,`dateStart`,`url`,`adminID`)
 *   VALUES ('$title','$content','$dateExp','$dateStart','$url','$adminID')
 * `tb_notify` columns (migration 0081, all lowercase): id · title varchar(400)
 *   · content varchar(100) · datestart · dateexp · url varchar(400) NOT NULL
 *   · adminid varchar(10) NOT NULL.
 *
 * ── AUDIENCE MAPPING (legacy has none) ──────────────────────────────────────
 * Legacy `tb_notify` has NO audience/targeting column — a popup is always shown
 * to ALL active customers. The rebuilt form's `audience` field (all /
 * juristic_only / personal_only / specific_ids) has no faithful equivalent and
 * is dropped from the create flow. If per-segment popups are ever needed, that
 * is a Phase-C enhancement (would require a new column + a customer-side filter).
 *
 * ── DEAD TWIN (removable — kept this pass, do NOT extend) ─────────────────────
 * `adminScheduleBroadcast` / `adminSendBroadcastNow` / `adminCancelBroadcast`
 * below still operate on the rebuilt `broadcasts` + `notifications` tables and
 * are now orphaned (the create flow no longer produces `broadcasts` rows). The
 * cron at `/api/cron/send-scheduled-broadcasts` is likewise dormant. They are
 * left in place so this pass is reversible; delete them (and the rebuilt
 * `broadcasts`/`notifications`/`notification_reads` tables) when the rebuilt
 * notification stack is retired.
 *
 * RBAC: super + sales_admin. Audit: every mutation writes admin_audit_log.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createNotifySchema,      type CreateNotifyInput,
  deleteNotifySchema,      type DeleteNotifyInput,
  scheduleBroadcastSchema, type ScheduleBroadcastInput,
  sendBroadcastNowSchema,  type SendBroadcastNowInput,
  cancelBroadcastSchema,   type CancelBroadcastInput,
} from "@/lib/validators/broadcast";

const ROLES = ["super", "sales_admin"] as const;

// ────────────────────────────────────────────────────────────
// Resolve current admin's legacy id (tb_notify.adminid is varchar(10)).
// Same helper as the other repointed actions (forwarder-cost.ts etc.) —
// kept local; the legacy admin code is short (e.g. "admin_nat") so cap at 10.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase getUser] failed`, { code: dataErr.code, message: dataErr.message });
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
    console.error(`[tb_admin lookup] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID.slice(0, 10);
  return email.slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// 1) Create a tb_notify popup (faithful — popup.php save_notify)
// ────────────────────────────────────────────────────────────

export async function adminCreateBroadcast(
  input: CreateNotifyInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createNotifySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const adminLegacyId = await resolveLegacyAdminId();

    // Display window: default to "show from now, for 1 year" when the admin
    // doesn't pin a window (legacy required both, but our UI keeps them
    // optional so a quick announcement just works).
    const now = new Date();
    const datestart = d.datestart ?? now.toISOString();
    const dateexp =
      d.dateexp ??
      new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // `url` + `content` are NOT NULL / capped in the legacy schema — coalesce
    // to "" exactly like the legacy PHP string-interpolation did (a missing
    // PHP value interpolates to the empty string, never SQL NULL).
    const { data: inserted, error: insErr } = await admin
      .from("tb_notify")
      .insert({
        title:     d.title,
        content:   d.content ?? "",
        url:       d.url ?? "",
        datestart,
        dateexp,
        adminid:   adminLegacyId,
      })
      .select("id")
      .single<{ id: number }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "notify.create", "tb_notify", String(inserted.id), {
      title:     d.title,
      datestart,
      dateexp,
    });

    revalidatePath("/admin/broadcasts");
    return { ok: true, data: { id: String(inserted.id) } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Delete a tb_notify popup + its read receipts (faithful — popup/delete.php)
// ────────────────────────────────────────────────────────────

export async function adminDeleteNotify(
  input: DeleteNotifyInput,
): Promise<AdminActionResult<void>> {
  const parsed = deleteNotifySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Legacy deletes the notify row first, then its read receipts.
    const { error: delErr } = await admin.from("tb_notify").delete().eq("id", id);
    if (delErr) return { ok: false, error: `delete_failed: ${delErr.message}` };

    const { error: delReadErr } = await admin
      .from("tb_notify_read")
      .delete()
      .eq("popid", id);
    if (delReadErr) {
      // Non-fatal — the popup is already gone; orphan receipts are harmless.
      console.error(`[tb_notify_read delete] failed`, {
        code: delReadErr.code,
        message: delReadErr.message,
        popid: id,
      });
    }

    await logAdminAction(adminId, "notify.delete", "tb_notify", String(id), {});

    revalidatePath("/admin/broadcasts");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════
// DEAD TWIN — rebuilt `broadcasts` fan-out (orphaned 2026-06-01)
//
// These act on the rebuilt `broadcasts` + `notifications` tables. The create
// flow no longer produces `broadcasts` rows, so nothing reaches them — they are
// kept only to make this pass reversible. Do NOT extend; delete with the rebuilt
// notification stack. See file header.
// ════════════════════════════════════════════════════════════

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
      const PAGE = 1000;
      let from = 0;
      const GLOBAL_CAP = 1_000_000;
      while (from < GLOBAL_CAP) {
        let query = admin
          .from("profiles")
          .select("id")
          .eq("status", "active")
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (bc.audience === "juristic_only") {
          query = query.eq("account_type", "juristic");
        } else if (bc.audience === "personal_only") {
          query = query.eq("account_type", "personal");
        }
        const { data: page, error: profErr } = await query;
        if (profErr) {
          await admin.from("broadcasts").update({ status: "draft" }).eq("id", d.id);
          return { ok: false, error: `audience_resolve_failed: ${profErr.message}` };
        }
        if (!page || page.length === 0) break;
        for (const p of page as Array<{ id: string }>) {
          targetIds.push(p.id);
        }
        if (page.length < PAGE) break;                                  // last page
        from += PAGE;
      }
    }

    if (targetIds.length === 0) {
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

    const { data: row, error: rowErr } = await admin
      .from("broadcasts")
      .select("id, status, title")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; title: string }>();
    if (rowErr) {
      console.error(`[broadcasts mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
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
