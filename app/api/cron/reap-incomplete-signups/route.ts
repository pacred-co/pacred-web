import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/reap-incomplete-signups
 *
 * Owner directive (2026-06-11): "แก้ flow ตั้งแต่สมัครเข้ามาทุกช่องทาง จนถึง
 * การรันรหัส ห้ามค้าง process ทุกลูกค้า." — no signup may hang the pipeline.
 *
 * Every signup channel (registerPersonal · registerJuristicStep1 ·
 * adminCreateCustomer) mints a `profiles` row + a legacy `tb_users` mirror
 * (userActive='0'). A customer who QUITS a juristic signup after step 1 leaves
 * a `profiles.status='incomplete'` row + a bare pending `tb_users` mirror
 * FOREVER — it clogs the /admin/customers/pending approval queue and squats a
 * PR member_code that never frees up.
 *
 * This daily off-peak sweep HARD-deletes only the genuinely-abandoned
 * incomplete signups so the queue never clogs + codes recycle. It is
 * deliberately conservative: a real signup never takes 14 days, and every
 * activity / staff guard below must be CLEAR before a row is touched.
 *
 * ── Deletion criteria (ALL must hold) ──────────────────────────────────────
 *   - profiles.status = 'incomplete'                  (never completed signup)
 *   - profiles.created_at < now() - 14 days           (conservative grace)
 *   - profiles.member_code ~ '^PR[0-9]+$'             (a customer code, not staff)
 *   - coalesce(employee_code,'') = '' AND NOT in admins  (NEVER touch staff)
 *   - ZERO activity under the member_code: no tb_header_order, tb_forwarder,
 *     tb_payment, tb_wallet — and its tb_users mirror (if any) is still pending
 *     (userActive IN ('','0'), i.e. never approved to '1').
 *
 * For each match: delete auth.users (CASCADE → profiles + its children) +
 * delete the tb_users mirror row (frees the legacy userTel UNIQUE + email).
 * Mirrors the proven removal order in actions/admin/customers.ts
 * deletePendingCustomer (auth→profiles cascade, then tb_users).
 *
 * Guards:
 *   - BATCH CAP 100/run (runaway guard — a bug can never mass-wipe).
 *   - Every deleted member_code is logged (recovery trail) + summarised.
 *   - ?dryRun=1 → lists what WOULD be reaped without deleting (owner eyeball).
 *
 * Schedule: "30 2 * * *" = daily 02:30 UTC = 09:30 ICT (off-peak).
 * Auth: CRON_SECRET / x-vercel-cron (centralised in instrumentCron).
 *
 * Response: { ok, scanned, reaped, codes:[...], dryRun? }.
 */

export const dynamic = "force-dynamic";

const GRACE_DAYS = 14;
const BATCH_CAP = 100;

export async function GET(request: Request) {
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  return instrumentCron({
    cronPath: "/api/cron/reap-incomplete-signups",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const cutoffIso = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

      console.log("[cron.reap-incomplete-signups] start", { dryRun, cutoffIso });

      // 1) Candidate pool — incomplete profiles older than the grace window,
      //    bearing a customer PR member_code, with NO employee_code (staff).
      //    Cap the SELECT well above BATCH_CAP so the activity/staff filters
      //    below can whittle it down and still fill a batch.
      const { data: candidates, error: candErr } = await supabase
        .from("profiles")
        .select("id, member_code, employee_code, status, created_at")
        .eq("status", "incomplete")
        .lt("created_at", cutoffIso)
        .is("employee_code", null)
        .order("created_at", { ascending: true })
        .limit(BATCH_CAP * 5);

      if (candErr) {
        console.error("[cron.reap-incomplete-signups] candidate query err", candErr.message);
        return {
          status: "failure" as const,
          error: candErr.message,
          payload: { ok: false, stage: "candidates", error: candErr.message },
          httpStatus: 500,
        };
      }

      type Cand = {
        id: string;
        member_code: string | null;
        employee_code: string | null;
        status: string | null;
        created_at: string | null;
      };
      // member_code must be a pure customer code (PR + digits). Defends against
      // any non-PR/staff/legacy-anchor row slipping through.
      const pool = ((candidates ?? []) as Cand[]).filter(
        (c) => typeof c.member_code === "string" && /^PR[0-9]+$/.test(c.member_code),
      );

      if (pool.length === 0) {
        console.log("[cron.reap-incomplete-signups] done — 0 candidates");
        return {
          status: "success" as const,
          summary: { scanned: 0, reaped: 0, dryRun },
          payload: { ok: true, scanned: 0, reaped: 0, codes: [], dryRun },
        };
      }

      const poolIds = pool.map((c) => c.id);
      const poolCodes = pool.map((c) => c.member_code as string);

      // 2) NEVER touch staff — drop any profile that has an `admins` row.
      const { data: adminRows, error: adminErr } = await supabase
        .from("admins")
        .select("profile_id")
        .in("profile_id", poolIds);
      if (adminErr) {
        console.error("[cron.reap-incomplete-signups] admins query err", adminErr.message);
        return {
          status: "failure" as const,
          error: adminErr.message,
          payload: { ok: false, stage: "admins", error: adminErr.message },
          httpStatus: 500,
        };
      }
      const staffIds = new Set((adminRows ?? []).map((r) => (r as { profile_id: string }).profile_id));

      // 3) Activity check — a member_code with ANY order/forwarder/payment/wallet
      //    row is a REAL customer (even if the profile never reached 'active').
      //    Batch four `.in()` lookups over the candidate codes.
      const activeCodes = new Set<string>();
      const markActive = (rows: { userid: string | null }[] | null) => {
        for (const r of rows ?? []) {
          const code = (r.userid ?? "").trim();
          if (code) activeCodes.add(code);
        }
      };

      const [hdr, fwd, pay, wal] = await Promise.all([
        supabase.from("tb_header_order").select("userid").in("userid", poolCodes),
        supabase.from("tb_forwarder").select("userid").in("userid", poolCodes),
        supabase.from("tb_payment").select("userid").in("userid", poolCodes),
        supabase.from("tb_wallet").select("userid").in("userid", poolCodes),
      ]);
      for (const [label, res] of [
        ["tb_header_order", hdr],
        ["tb_forwarder", fwd],
        ["tb_payment", pay],
        ["tb_wallet", wal],
      ] as const) {
        if (res.error) {
          console.error(`[cron.reap-incomplete-signups] activity ${label} err`, res.error.message);
          return {
            status: "failure" as const,
            error: res.error.message,
            payload: { ok: false, stage: `activity:${label}`, error: res.error.message },
            httpStatus: 500,
          };
        }
        markActive(res.data as { userid: string | null }[] | null);
      }

      // 4) tb_users mirror — only reap rows whose mirror (if present) is still
      //    pending (userActive IN ('','0')). An approved ('1') mirror means a
      //    staffer already activated the customer → leave it alone.
      const { data: mirrors, error: mirrorErr } = await supabase
        .from("tb_users")
        .select("userID, userActive")
        .in("userID", poolCodes);
      if (mirrorErr) {
        console.error("[cron.reap-incomplete-signups] tb_users mirror err", mirrorErr.message);
        return {
          status: "failure" as const,
          error: mirrorErr.message,
          payload: { ok: false, stage: "mirror", error: mirrorErr.message },
          httpStatus: 500,
        };
      }
      const mirrorActiveByCode = new Map<string, string | null>();
      for (const m of (mirrors ?? []) as { userID: string; userActive: string | null }[]) {
        mirrorActiveByCode.set(m.userID, m.userActive);
      }

      // 5) Final reap set — pass every guard, capped at BATCH_CAP.
      const reapList = pool
        .filter((c) => {
          const code = c.member_code as string;
          if (staffIds.has(c.id)) return false;          // staff
          if (activeCodes.has(code)) return false;       // has activity
          // mirror: if a mirror exists, it must still be pending.
          if (mirrorActiveByCode.has(code)) {
            const ua = mirrorActiveByCode.get(code);
            if (ua !== "" && ua !== "0") return false;   // approved/active mirror
          }
          return true;
        })
        .slice(0, BATCH_CAP);

      const reapCodes = reapList.map((c) => c.member_code as string);

      if (dryRun) {
        console.log(
          `[cron.reap-incomplete-signups] DRY-RUN — scanned=${pool.length} wouldReap=${reapList.length}`,
          reapCodes,
        );
        return {
          status: "success" as const,
          summary: { scanned: pool.length, reaped: 0, wouldReap: reapList.length, dryRun: true },
          payload: {
            ok: true,
            dryRun: true,
            scanned: pool.length,
            reaped: 0,
            wouldReap: reapList.length,
            codes: reapCodes,
          },
        };
      }

      // 6) Delete — auth.users (CASCADE → profiles + children) then tb_users
      //    mirror. Per-row, best-effort: one failure doesn't abort the batch.
      const reapedCodes: string[] = [];
      const failed: { code: string; stage: string; error: string }[] = [];

      for (const c of reapList) {
        const code = c.member_code as string;

        // 6a. Delete the auth user — CASCADEs to profiles + its children.
        const { error: authErr } = await supabase.auth.admin.deleteUser(c.id);
        if (authErr) {
          // The auth row may already be gone (manual cleanup) — try profiles
          // directly so an orphaned profile still gets removed.
          logger.warn("cron.reap-incomplete-signups", "auth deleteUser reported error (may already be gone)", {
            memberCode: code,
            reason: authErr.message,
          });
          const { error: profErr } = await supabase.from("profiles").delete().eq("id", c.id);
          if (profErr) {
            console.error("[cron.reap-incomplete-signups] profiles delete err", { code, message: profErr.message });
            failed.push({ code, stage: "profiles", error: profErr.message });
            continue;
          }
        }

        // 6b. Delete the legacy tb_users mirror (frees userTel UNIQUE + email).
        const { error: tbErr } = await supabase.from("tb_users").delete().eq("userID", code);
        if (tbErr) {
          console.error("[cron.reap-incomplete-signups] tb_users delete err", { code, message: tbErr.message });
          failed.push({ code, stage: "tb_users", error: tbErr.message });
          // auth/profiles already gone — record the partial so it's visible.
          continue;
        }

        reapedCodes.push(code);
      }

      console.log(
        `[cron.reap-incomplete-signups] done — scanned=${pool.length} reaped=${reapedCodes.length} failed=${failed.length}`,
        reapedCodes,
      );
      logger.info("cron.reap-incomplete-signups", "reaped abandoned incomplete signups", {
        scanned: pool.length,
        reaped: reapedCodes.length,
        codes: reapedCodes,
        failed,
        cutoffIso,
      });

      return {
        status: failed.length > 0 ? ("partial" as const) : ("success" as const),
        summary: { scanned: pool.length, reaped: reapedCodes.length, failed: failed.length, dryRun: false },
        error: failed.length > 0 ? `${failed.length} row(s) failed to delete` : undefined,
        payload: {
          ok: true,
          dryRun: false,
          scanned: pool.length,
          reaped: reapedCodes.length,
          codes: reapedCodes,
          ...(failed.length > 0 ? { failed } : {}),
        },
      };
    },
  });
}
