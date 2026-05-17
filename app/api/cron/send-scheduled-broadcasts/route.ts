import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/send-scheduled-broadcasts
 *
 * V-G3.1 — cron that fires scheduled admin broadcasts.
 *
 * Looks for broadcasts rows where:
 *   - status = 'scheduled'
 *   - scheduled_for <= now()
 *
 * For each: flip to 'sending' (race-safe optimistic update), resolve
 * audience to profile_ids, bulk-insert notifications rows (chunks of
 * 1000), then mark 'sent' with sent_count + failed_count.
 *
 * Same fan-out logic as actions/admin/broadcasts.ts::adminSendBroadcastNow.
 * Re-implemented here (instead of importing the action) because Server
 * Actions can't be called from a route handler without an HTTP round-trip,
 * and we want this to run inline as service_role inside the cron worker.
 *
 * Schedule via vercel.json:
 *   { "path": "/api/cron/send-scheduled-broadcasts", "schedule": "* / 5 * * * *" }
 *
 * Auth (mirror /api/cron/auto-cancel-orders pattern):
 *   - prod: requires x-vercel-cron header OR Bearer CRON_SECRET
 *   - dev:  open for manual testing
 *
 * Designed for idempotency: if a broadcast is mid-fan-out and the cron
 * fires again, the optimistic status='sending' lock prevents double-send.
 * (A broadcast left stuck in 'sending' = a previous cron crashed; admin
 * can manually flip back to 'draft' via Supabase Studio for retry.)
 *
 * V1 limitations:
 *   - In-app only (notifications rows). LINE push fan-out = V-G3.2
 *     (needs per-LINE-OA-second rate limiting + LINE_PUSH_BYPASS gate).
 *   - Processes ALL eligible scheduled rows in one tick; if 100k+
 *     customers in audience the request can run long (Vercel allows
 *     up to 300s for cron on Pro plan).
 */
export async function GET(request: Request) {
  // Auth.
  const isProd     = process.env.NODE_ENV === "production";
  const vercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;
  const bearerOk   = !!secret && authHeader === `Bearer ${secret}`;

  if (isProd && !vercelCron && !bearerOk) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Find candidates: scheduled + past-due.
  const { data: dueRows, error: selErr } = await admin
    .from("broadcasts")
    .select("id, title, body, link_href, audience, audience_ids")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso);

  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }

  if (!dueRows || dueRows.length === 0) {
    return NextResponse.json({ ok: true, scheduled_due: 0 });
  }

  type DueRow = {
    id:           string;
    title:        string;
    body:         string;
    link_href:    string | null;
    audience:     "all" | "juristic_only" | "personal_only" | "specific_ids";
    audience_ids: string[] | null;
  };

  const results: Array<{
    id:           string;
    title:        string;
    sent_count:   number;
    failed_count: number;
    error?:       string;
  }> = [];

  for (const bc of dueRows as DueRow[]) {
    // Optimistic lock: only the cron that wins the eq("status","scheduled")
    // race gets to fan out.
    const { error: lockErr, count: lockedCount } = await admin
      .from("broadcasts")
      .update({ status: "sending" }, { count: "exact" })
      .eq("id", bc.id)
      .eq("status", "scheduled");
    if (lockErr || lockedCount === 0) {
      // Another worker won (or row moved). Skip.
      continue;
    }

    // Resolve audience to profile_ids.
    // AUDIT-FOLLOWUP (Agent F LOW #4) — page through profiles so audience
    // isn't truncated past 1000-row PostgREST cap. Mirror action's logic.
    let targetIds: string[] = [];
    try {
      if (bc.audience === "specific_ids") {
        targetIds = bc.audience_ids ?? [];
      } else {
        const PAGE = 1000;
        const GLOBAL_CAP = 1_000_000;
        let from = 0;
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
          if (profErr) throw profErr;
          if (!page || page.length === 0) break;
          for (const p of page as Array<{ id: string }>) {
            targetIds.push(p.id);
          }
          if (page.length < PAGE) break;
          from += PAGE;
        }
      }
    } catch (e) {
      // Audience resolve failed — roll back to scheduled for retry next tick.
      await admin
        .from("broadcasts")
        .update({ status: "scheduled" })
        .eq("id", bc.id);
      results.push({
        id:           bc.id,
        title:        bc.title,
        sent_count:   0,
        failed_count: 0,
        error:        `audience_resolve_failed: ${(e as Error).message ?? "unknown"}`,
      });
      continue;
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
        .eq("id", bc.id);
      results.push({ id: bc.id, title: bc.title, sent_count: 0, failed_count: 0 });
      continue;
    }

    // Fan-out in chunks of 1000 (same chunk size as adminSendBroadcastNow).
    type NotifPayload = {
      profile_id:   string;
      category:     string;
      severity:     string;
      title:        string;
      body:         string;
      link_href:    string | null;
      broadcast_id: string;
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
      .eq("id", bc.id);

    results.push({
      id:           bc.id,
      title:        bc.title,
      sent_count:   totalInserted,
      failed_count: totalFailed,
    });
  }

  return NextResponse.json({
    ok: true,
    scheduled_due: dueRows.length,
    processed:     results.length,
    results,
    ran_at:        nowIso,
  });
}
