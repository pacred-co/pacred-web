import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";

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
 * Schedule: "*\/5 * * * *" (every 5 minutes).
 *
 * U4-1: wrapped in instrumentCron — response shape preserved. Reports
 * 'partial' status when any item-level fan-out reported failures (lets
 * /admin/system/crons surface the partial-failure case distinctly).
 *
 * Designed for idempotency: if a broadcast is mid-fan-out and the cron
 * fires again, the optimistic status='sending' lock prevents double-send.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/send-scheduled-broadcasts",
    request,
    handler: async () => {
      const admin = createAdminClient();
      const nowIso = new Date().toISOString();

      const { data: dueRows, error: selErr } = await admin
        .from("broadcasts")
        .select("id, title, body, link_href, audience, audience_ids")
        .eq("status", "scheduled")
        .lte("scheduled_for", nowIso);

      if (selErr) {
        return {
          status:     "failure" as const,
          error:      selErr.message,
          payload:    { ok: false, error: selErr.message },
          httpStatus: 500,
        };
      }

      if (!dueRows || dueRows.length === 0) {
        return {
          status:  "success" as const,
          summary: { scheduled_due: 0 },
          payload: { ok: true, scheduled_due: 0 },
        };
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
        const { error: lockErr, count: lockedCount } = await admin
          .from("broadcasts")
          .update({ status: "sending" }, { count: "exact" })
          .eq("id", bc.id)
          .eq("status", "scheduled");
        if (lockErr || lockedCount === 0) continue;

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

      const anyFailed = results.some((r) => r.failed_count > 0 || r.error);
      const totalSent   = results.reduce((s, r) => s + r.sent_count,   0);
      const totalFailed = results.reduce((s, r) => s + r.failed_count, 0);
      const errorList   = results.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`).join("; ");

      return {
        status:  anyFailed ? ("partial" as const) : ("success" as const),
        summary: {
          scheduled_due: dueRows.length,
          processed:     results.length,
          total_sent:    totalSent,
          total_failed:  totalFailed,
        },
        error: errorList || undefined,
        payload: {
          ok:            true,
          scheduled_due: dueRows.length,
          processed:     results.length,
          results,
          ran_at:        nowIso,
        },
      };
    },
  });
}
