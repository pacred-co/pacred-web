import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { sendNotification } from "@/lib/notifications";

/**
 * GET /api/cron/billing-run-overdue
 *
 * Daily overdue check for ใบวางบิล (billing-run). For every
 * tb_forwarder_invoice where status='issued' AND date_due < today, send a
 * LINE/email reminder to the customer + log the trigger.
 *
 * Schedule via vercel.json:
 *   { "path": "/api/cron/billing-run-overdue", "schedule": "0 9 * * *" }
 *   (09:00 ICT daily — staff sees same morning during work hours)
 *
 * Idempotency: we don't store "last_reminder_sent_at" on the invoice (R-2
 * scope · keeps schema simple). The cron will re-send every day until the
 * invoice flips to 'paid' or 'cancelled'. To avoid spam, we cap each run
 * at 200 invoices — large outage backlogs are throttled so we don't trip
 * LINE rate-limits.
 *
 * Index used: tb_forwarder_invoice_date_due_issued_idx (partial · WHERE status='issued').
 *
 * Auth + cron_invocations logging are handled by instrumentCron.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/billing-run-overdue",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const today = new Date().toISOString().slice(0, 10);

      // 1) Find overdue 'issued' invoices (capped at 200 per run)
      type Row = {
        id: number;
        doc_no: string;
        userid: string;
        date_due: string;
        total_thb: number | string;
      };
      const { data: overdue, error: selErr } = await supabase
        .from("tb_forwarder_invoice")
        .select("id, doc_no, userid, date_due, total_thb")
        .eq("status", "issued")
        .lt("date_due", today)
        .order("date_due", { ascending: true })
        .limit(200);

      if (selErr) {
        return {
          status:     "failure" as const,
          error:      selErr.message,
          payload:    { ok: false, error: selErr.message },
          httpStatus: 500,
        };
      }

      const rows = (overdue ?? []) as unknown as Row[];
      if (rows.length === 0) {
        return {
          status:  "success" as const,
          summary: { overdueCount: 0, notified: 0 },
          payload: { ok: true, overdueCount: 0, notified: 0 },
        };
      }

      // 2) For each overdue invoice, resolve userid → profile.id + send
      let notified = 0;
      let notFoundProfile = 0;
      let errors = 0;

      // Batch-fetch tb_users.profile_id + profiles.member_code (single
      // round-trip each) for the userids involved.
      const userids = Array.from(new Set(rows.map((r) => r.userid)));
      const profileByUserid = new Map<string, string>();

      const { data: userRows, error: userErr } = await supabase
        .from("tb_users")
        .select("userID, profile_id")
        .in("userID", userids);
      if (userErr) {
        console.error("[cron billing-run-overdue tb_users] failed", {
          code: userErr.code, message: userErr.message,
        });
      }
      for (const u of ((userRows ?? []) as Array<{ userID: string; profile_id: string | null }>)) {
        if (u.profile_id) profileByUserid.set(u.userID, u.profile_id);
      }

      // Fallback: profiles.member_code = userid for the unresolved ones
      const stillMissing = userids.filter((u) => !profileByUserid.has(u));
      if (stillMissing.length > 0) {
        const { data: pRows, error: pErr } = await supabase
          .from("profiles")
          .select("id, member_code")
          .in("member_code", stillMissing);
        if (pErr) {
          console.error("[cron billing-run-overdue profiles fallback] failed", {
            code: pErr.code, message: pErr.message,
          });
        }
        for (const p of ((pRows ?? []) as Array<{ id: string; member_code: string }>)) {
          profileByUserid.set(p.member_code, p.id);
        }
      }

      // 3) Send notifications
      for (const row of rows) {
        const profileId = profileByUserid.get(row.userid);
        if (!profileId) {
          notFoundProfile += 1;
          continue;
        }
        try {
          const totalThb = Number(row.total_thb);
          await sendNotification(profileId, {
            category:       "payment",
            severity:       "warning",
            title:          `⚠️ ใบวางบิล ${row.doc_no} เลยกำหนดชำระแล้ว`,
            body:           `เลยกำหนดตั้งแต่ ${row.date_due} · ยอดค้าง ฿${totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · กรุณาชำระโดยเร็ว`,
            link_href:      `/billing-run/${row.id}`,
            reference_type: "forwarder_invoice",
            reference_id:   String(row.id),
          });
          notified += 1;
        } catch (e) {
          errors += 1;
          console.error("[cron billing-run-overdue notify] failed", { docNo: row.doc_no, e });
        }
      }

      return {
        status:  "success" as const,
        summary: { overdueCount: rows.length, notified, notFoundProfile, errors },
        payload: { ok: true, overdueCount: rows.length, notified, notFoundProfile, errors },
      };
    },
  });
}
