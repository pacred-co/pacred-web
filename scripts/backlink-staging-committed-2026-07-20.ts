/**
 * backlink-staging-committed-2026-07-20.ts — one-off prod sweep for the
 * "ยังไม่เข้าระบบ ทั้งที่มีในระบบแล้ว" backlog (owner 2026-07-20) + the #52051
 * cabinet answer (PCS20260528-SEA01 = GZE260707-1 · owner เคาะ).
 *
 * The standing heal = runMomoSync pass 3.55 (same brain:
 * lib/admin/backlink-staging-committed.ts). This script clears the backlog NOW
 * + fixes #52051, with dry-run + backup.
 *
 *   dry-run:  npx tsx --env-file=.env.local scripts/backlink-staging-committed-2026-07-20.ts
 *   apply:    npx tsx --env-file=.env.local scripts/backlink-staging-committed-2026-07-20.ts --apply
 *
 * Writes: momo_import_tracks stamp columns only + tb_forwarder.fcabinetnumber
 * on the PCS20260528-SEA01 rows (display/reporting field · no money column).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { backlinkStagingCommitted } from "../lib/admin/backlink-staging-committed";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log(`mode = ${APPLY ? "APPLY" : "DRY-RUN"}`);

  // ── 1. #52051 + any sibling rows on the placeholder → the real container ──
  const PLACEHOLDER = "PCS20260528-SEA01";
  const REAL = "GZE260707-1"; // owner 2026-07-20: "PCS20260528-SEA01 = GZE260707-1 ครับ"
  const { data: phRows, error: phErr } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, fcabinetnumber, fstatus, userid")
    .eq("fcabinetnumber", PLACEHOLDER);
  if (phErr) { console.error("placeholder scan failed:", phErr.message); process.exit(1); }
  console.log(`\n[cabinet] rows on ${PLACEHOLDER}: ${(phRows ?? []).length}`);
  for (const r of phRows ?? []) console.log(`  #${r.id} ${r.ftrackingchn} (${r.userid} · fstatus=${r.fstatus}) → ${REAL}`);

  // ── 2. staging back-link plan (same brain as the sync heal) ──
  const bl = await backlinkStagingCommitted(admin, { apply: APPLY });
  console.log(`\n[backlink] uncommitted staging scanned: ${bl.scannedStaging}`);
  const byKind: Record<string, number> = {};
  for (const m of bl.matches) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  console.log(`[backlink] matches: ${bl.matches.length} (${JSON.stringify(byKind)}) · dupSkipped: ${bl.dupSkipped.length}`);
  for (const m of bl.matches.slice(0, 40)) console.log(`  ${m.kind.padEnd(11)} ${m.tracking} → #${m.fid} (${m.userid})`);
  if (bl.matches.length > 40) console.log(`  … and ${bl.matches.length - 40} more`);
  if (bl.dupSkipped.length) console.log(`  dup-live skipped: ${bl.dupSkipped.join(", ")}`);

  if (!APPLY) { console.log("\nDRY-RUN — nothing written. Re-run with --apply."); return; }

  // backup (staging ids stamped had all-null stamp cols → reversible by listing ids)
  const backupPath = `/tmp/backlink-staging-backup-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ placeholderRows: phRows, backlinkMatches: bl.matches }, null, 1));
  console.log(`\nbackup → ${backupPath}`);
  console.log(`[backlink] stamped: ${bl.stamped} · errors: ${bl.errors.length}`);
  for (const e of bl.errors) console.log(`  ERR ${e}`);

  // cabinet fix — writing a REAL container over a MOMO placeholder = the heal
  // direction the guard allows; re-guard on the exact current value.
  let cabFixed = 0;
  for (const r of phRows ?? []) {
    const { error, data } = await admin
      .from("tb_forwarder")
      .update({ fcabinetnumber: REAL })
      .eq("id", r.id)
      .eq("fcabinetnumber", PLACEHOLDER)
      .select("id");
    if (error) console.log(`  cabinet ERR #${r.id}: ${error.message}`);
    else if ((data ?? []).length > 0) cabFixed += 1;
  }
  console.log(`[cabinet] fixed ${cabFixed}/${(phRows ?? []).length} rows → ${REAL}`);

  // verify
  const { count } = await admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .eq("fcabinetnumber", PLACEHOLDER);
  const bl2 = await backlinkStagingCommitted(admin, { apply: false });
  console.log(`\nVERIFY: rows still on ${PLACEHOLDER} = ${count ?? "?"} · unstamped-but-live remaining = ${bl2.matches.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
