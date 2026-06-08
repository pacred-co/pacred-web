/**
 * 2026-06-08 — verify migration 0150 + the cabinet-lock wiring on prod.
 *
 * B4 / backlog #259 — defensive belt vs MOMO/partner-sync overwriting an
 * admin's manual cabinet correction. The lock column is purely defensive;
 * this probe is read-only.
 *
 * Run:
 *   node --env-file=.env.local scripts/probe-fcabinet-locked-0150.mjs
 *
 * Asserts (prints + non-zero exit if any fail):
 *   1. `tb_forwarder.fcabinet_locked` column reachable via PostgREST
 *      (BEFORE migration apply: the SELECT errors out clearly — that's
 *      the intended fail signal · AFTER apply: 0 locked rows · default).
 *   2. Distribution: total rows · locked count · sample latest 10 rows
 *      with their lock state (sanity sample · should all be false by
 *      default the moment after apply).
 *   3. If ANY locked rows present, list a few + their tracking + cabinet —
 *      so we can audit which rows staff has locked manually.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[probe-fcabinet-locked-0150] missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

let failed = false;
function check(label, ok, detail) {
  console.log(`${ok ? "✅" : "❌"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failed = true;
}

console.log(`\n══ probe-fcabinet-locked-0150 · ${url} ══\n`);

// ─── 1. Column reachability ───
// BEFORE 0150 apply: PostgREST returns 400 ("column tb_forwarder.fcabinet_locked
// does not exist"). The probe surfaces that as a clear failure — the operator
// then runs the migration.
const { error: shapeErr } = await admin
  .from("tb_forwarder")
  .select("fcabinet_locked", { count: "exact", head: true })
  .limit(0);
check(
  `tb_forwarder.fcabinet_locked column reachable via PostgREST`,
  !shapeErr,
  shapeErr ? `(err: ${shapeErr.message}) — apply 0150 first` : "",
);

if (shapeErr) {
  console.log(`\n══ ❌ migration 0150 not applied yet — bail ══\n`);
  process.exit(1);
}

// ─── 2. Total rows + locked count ───
const { count: total, error: totalErr } = await admin
  .from("tb_forwarder")
  .select("*", { count: "exact", head: true });
if (totalErr) {
  check("count tb_forwarder total", false, `(err: ${totalErr.message})`);
} else {
  console.log(`\nTotal tb_forwarder rows: ${total}`);
}

const { count: locked, error: lockedErr } = await admin
  .from("tb_forwarder")
  .select("*", { count: "exact", head: true })
  .eq("fcabinet_locked", true);
if (lockedErr) {
  check("count tb_forwarder fcabinet_locked=true", false, `(err: ${lockedErr.message})`);
} else {
  console.log(`Rows with fcabinet_locked=true (staff-locked):  ${locked}`);
  console.log(`Rows with fcabinet_locked=false (default):      ${(total ?? 0) - (locked ?? 0)}`);
}

// ─── 3. Sample of locked rows (audit) ───
if (locked && locked > 0) {
  const { data: lockedSample, error: sampleErr } = await admin
    .from("tb_forwarder")
    .select("id, fidorco, userid, ftrackingchn, fcabinetnumber, fstatus, adminidupdate, fdateadminstatus")
    .eq("fcabinet_locked", true)
    .order("fdateadminstatus", { ascending: false })
    .limit(20);
  if (sampleErr) {
    check("locked-rows sample", false, `(err: ${sampleErr.message})`);
  } else {
    console.log(`\nLocked rows sample (latest 20 by fdateadminstatus):`);
    for (const r of lockedSample ?? []) {
      console.log(
        `   #${r.id} ${r.fidorco ?? ""}  uid=${r.userid}  ` +
        `cab=${JSON.stringify(r.fcabinetnumber ?? "")}  ` +
        `track=${r.ftrackingchn ?? ""}  fstatus=${r.fstatus}  ` +
        `by=${r.adminidupdate ?? "?"}  at=${r.fdateadminstatus ?? "?"}`,
      );
    }
  }
}

// ─── 4. Sample of the latest 10 unlocked rows (sanity — default state) ───
const { data: recentSample, error: recentErr } = await admin
  .from("tb_forwarder")
  .select("id, fidorco, fcabinetnumber, fcabinet_locked, fstatus")
  .order("id", { ascending: false })
  .limit(10);
if (recentErr) {
  check("recent rows sample", false, `(err: ${recentErr.message})`);
} else {
  console.log(`\nLatest 10 tb_forwarder rows (sanity · expect locked=false):`);
  for (const r of recentSample ?? []) {
    console.log(
      `   #${r.id} ${r.fidorco ?? ""}  cab=${JSON.stringify(r.fcabinetnumber ?? "")}  ` +
      `locked=${r.fcabinet_locked === true}  fstatus=${r.fstatus}`,
    );
  }
}

console.log(`\n══ ${failed ? "❌ FAIL" : "✅ all checks passed"} ══\n`);
process.exit(failed ? 1 : 0);
