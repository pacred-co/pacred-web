import "server-only";

/**
 * lib/admin/reassign-member-code-mover.ts — server-side ATOMIC mover for the
 * "รันเลข PR ลูกค้าใหม่" feature. Shared by the ultra-gated server action
 * (actions/admin/reassign-customer-code.ts). Mirrors, statement-for-statement,
 * the proven dry-run script scripts/reassign-member-code.mjs.
 *
 * WHY a raw `pg` transaction (not the Supabase JS client): the move MUST be
 * ATOMIC across 52+ tables + tb_users PK + profiles.member_code — the Supabase
 * REST client cannot open a multi-statement transaction, so a mid-flight failure
 * there would split a real customer's history across two codes. A single pg
 * BEGIN/COMMIT gives all-or-nothing. The connection is opened + closed per call
 * (no long-lived pool in a serverless action).
 *
 * WHY introspection (not a hardcoded table list): information_schema is queried
 * for EVERY userid column (userid / userID / member_code) so a newly-added table
 * is covered automatically — nothing is missed. Same query the script uses.
 *
 * WHY the auth email is realigned via the Supabase admin API AFTER commit (not
 * inside the SQL txn): auth.users has a paired auth.identities row; the JS
 * `updateUserById({ email, email_confirm })` updates both consistently, whereas a
 * raw `UPDATE auth.users SET email` leaves the identity stale → login breaks
 * (exactly the PR168 bug fix-auth-email-pr168-pr540 repaired). The table move is
 * the atomic unit; the auth realign is a deterministic post-step that this
 * function reports on (and never silently swallows).
 */

import pg from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeLowestVacantPrCode,
  describeReassignPlan,
  reassignSyntheticEmail,
  PR_CODE_RE,
  type ReassignPlan,
} from "./reassign-member-code";

const { Client } = pg;

export type ReassignMoveResult =
  | {
      ok: true;
      plan: ReassignPlan;
      movedRows: number;
      authRealigned: boolean;
      /** Set when the table move committed but the auth-email realign failed. */
      authWarning?: string;
    }
  | { ok: false; error: string };

function connString(): string {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
  if (!password) throw new Error("SUPABASE_DB_PASSWORD not configured");
  // Prefer an explicit pooled connection string if the deployment provides one;
  // else assemble the session-pooler URL for the prod ref (matches the scripts).
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const ref = process.env.SUPABASE_DB_PROJECT_REF || "yzljakczhwrpbxflnmco";
  const host = process.env.SUPABASE_DB_HOST || "aws-0-ap-southeast-1.pooler.supabase.com";
  const enc = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${enc}@${host}:5432/postgres`;
}

/**
 * Perform the atomic PR-code move. `newCode` optional → the lowest CLEAN vacant
 * gap is computed. Returns the plan + moved-row count + auth-realign status.
 */
export async function moveMemberCode(args: {
  fromCode: string;
  newCode?: string | null;
}): Promise<ReassignMoveResult> {
  const from = args.fromCode.trim().toUpperCase();
  if (!PR_CODE_RE.test(from)) return { ok: false, error: "invalid_from_code" };
  const explicitTo = args.newCode?.trim().toUpperCase() || null;
  if (explicitTo && !PR_CODE_RE.test(explicitTo)) return { ok: false, error: "invalid_new_code" };
  if (explicitTo && explicitTo === from) return { ok: false, error: "new_code_equals_old" };

  const c = new Client({ connectionString: connString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await c.connect();
  try {
    // 1. Customer must exist at `from`.
    const who = (await c.query(`SELECT "userID" FROM tb_users WHERE "userID"=$1`, [from])).rows;
    if (!who.length) return { ok: false, error: "customer_not_found" };

    // 2. Introspect every userid column.
    const cols = (await c.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name IN ('userid','userID','member_code')
        ORDER BY table_name`)).rows as { table_name: string; column_name: string }[];

    const tables: { table: string; column: string; rows: number }[] = [];
    for (const t of cols) {
      try {
        const n = (await c.query(
          `SELECT count(*)::int c FROM "${t.table_name}" WHERE "${t.column_name}"=$1`, [from])).rows[0]?.c ?? 0;
        if (n) tables.push({ table: t.table_name, column: t.column_name, rows: n });
      } catch {
        // A column of a non-text type that can't compare to a PR string — skip.
      }
    }

    // 3. Registry of used PR codes (both registries).
    const reg = (await c.query(
      `SELECT "userID" code FROM tb_users WHERE "userID" ~ '^PR[0-9]+$'
        UNION SELECT member_code FROM profiles WHERE member_code ~ '^PR[0-9]+$'`)).rows as { code: string }[];
    const used = new Set(reg.map((r) => r.code));

    // Resolve target.
    let to: string;
    if (explicitTo) {
      if (used.has(explicitTo)) return { ok: false, error: "target_code_in_use" };
      // must be clean of orphan rows too
      for (const t of tables) {
        const hit = await c.query(`SELECT 1 FROM "${t.table}" WHERE "${t.column}"=$1 LIMIT 1`, [explicitTo]);
        if (hit.rows.length) return { ok: false, error: `target_code_has_orphan_rows:${t.table}` };
      }
      to = explicitTo;
    } else {
      let cand = computeLowestVacantPrCode([...used]);
      for (;;) {
        let dirty = false;
        for (const t of tables) {
          const hit = await c.query(`SELECT 1 FROM "${t.table}" WHERE "${t.column}"=$1 LIMIT 1`, [cand]);
          if (hit.rows.length) { dirty = true; break; }
        }
        if (!dirty) break;
        used.add(cand);
        cand = computeLowestVacantPrCode([...used]);
      }
      to = cand;
    }

    // Current auth row for `from`.
    const prof = (await c.query(`SELECT id, email FROM profiles WHERE member_code=$1`, [from])).rows[0] as
      | { id: string; email: string | null }
      | undefined;
    const supa = createAdminClient();
    let authEmailFrom: string | null = null;
    if (prof?.id) {
      const { data } = await supa.auth.admin.getUserById(prof.id);
      authEmailFrom = data?.user?.email ?? null;
    }

    const plan = describeReassignPlan({ fromCode: from, toCode: to, tables, authEmailFrom });

    // 4. ONE transaction: move every reference. Verify per-table + no leftovers.
    let moved = 0;
    await c.query("BEGIN");
    try {
      for (const t of plan.tables) {
        const r = await c.query(`UPDATE "${t.table}" SET "${t.column}"=$1 WHERE "${t.column}"=$2`, [to, from]);
        if (r.rowCount !== t.rows) throw new Error(`mismatch ${t.table}.${t.column}: ${r.rowCount}≠${t.rows}`);
        moved += r.rowCount ?? 0;
      }
      for (const t of plan.tables) {
        const left = (await c.query(`SELECT count(*)::int c FROM "${t.table}" WHERE "${t.column}"=$1`, [from])).rows[0].c;
        if (left) throw new Error(`verify: ${left} ${from} rows remain in ${t.table}`);
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      return { ok: false, error: `move_rolled_back:${(e as Error).message}` };
    }

    // 5. Realign the auth email (post-commit) so NATIVE login still resolves.
    let authRealigned = false;
    let authWarning: string | undefined;
    if (prof?.id) {
      const { error: aeErr } = await supa.auth.admin.updateUserById(prof.id, {
        email: plan.authEmailTo,
        email_confirm: true,
      });
      if (aeErr) {
        // Tables are moved (committed) but the email lags → surface loudly.
        authWarning = `tables_moved_but_auth_email_stale:${aeErr.message}`;
      } else {
        authRealigned = true;
        // profiles.email is display-only; keep it in sync best-effort.
        await supa.from("profiles").update({ email: plan.authEmailTo }).eq("id", prof.id);
      }
    }

    return { ok: true, plan, movedRows: moved, authRealigned, authWarning };
  } finally {
    await c.end();
  }
}

export { reassignSyntheticEmail };
