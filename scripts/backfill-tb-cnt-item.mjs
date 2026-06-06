/**
 * scripts/backfill-tb-cnt-item.mjs — B1 backfill from save-point 2026-06-05 late-PM.
 *
 * Problem (ภูม flag · /admin/report-cnt audit):
 *   tb_cnt has 970 rows with a CSV cabinet list in `cntName`
 *   (e.g. "GZE-2026-1,GZE-2026-2,GZE-2026-3").
 *   tb_cnt_item (the per-cabinet payout child table) is 0 rows.
 *
 * Result: every cabinet on /admin/report-cnt shows "ยังไม่จ่าย" because the
 *   paid-join (paidSet from tb_cnt_item) is empty. Code is correct — the
 *   legacy data migration missed the CSV-explode step.
 *
 * Fix: explode each tb_cnt.cntName CSV into N tb_cnt_item rows.
 *
 * Per AGENTS.md §11 — dry-run + backup FIRST, then --apply.
 *
 * USAGE:
 *   pnpm tsx scripts/backfill-tb-cnt-item.mjs           # dry-run (default)
 *   pnpm tsx scripts/backfill-tb-cnt-item.mjs --apply   # actually INSERT
 *
 * Idempotency: SKIPS rows where (cntID, fCabinetNumber) already exists in
 *   tb_cnt_item — so re-running after a partial apply is safe and a no-op
 *   once everything has been backfilled.
 *
 * Output: prints count of planned inserts, first 10 samples (dry-run),
 *   then either prints "WOULD INSERT" total or actually inserts in
 *   chunks of 500.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const CHUNK = 500;

function loadEnv() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    console.error("✗ missing .env.local");
    process.exit(1);
  }
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("───────────────────────────────────────────────────────────────");
  console.log(`B1 backfill tb_cnt_item · mode = ${APPLY ? "🔴 APPLY (will INSERT)" : "🟡 DRY-RUN"}`);
  console.log("───────────────────────────────────────────────────────────────\n");

  // ── Step 1: count tb_cnt + tb_cnt_item current state ──
  const { count: cntCount, error: cntCountErr } = await sb
    .from("tb_cnt")
    .select("*", { count: "exact", head: true });
  if (cntCountErr) { console.error("✗ tb_cnt count failed:", cntCountErr.message); process.exit(1); }
  const { count: itemCount, error: itemCountErr } = await sb
    .from("tb_cnt_item")
    .select("*", { count: "exact", head: true });
  if (itemCountErr) { console.error("✗ tb_cnt_item count failed:", itemCountErr.message); process.exit(1); }

  console.log(`Current state:`);
  console.log(`  tb_cnt      = ${cntCount?.toLocaleString("th-TH")} rows`);
  console.log(`  tb_cnt_item = ${itemCount?.toLocaleString("th-TH")} rows\n`);

  // ── Step 2: pull all tb_cnt + tb_cnt_item ──
  // Pull in pages of 1000 to avoid PostgREST default cap.
  console.log(`Loading tb_cnt rows (cntName CSV explode source)…`);
  const cntRows = [];
  for (let page = 0; ; page++) {
    const from = page * 1000;
    const to   = from + 999;
    const { data, error } = await sb
      .from("tb_cnt")
      .select(`"ID","cntName"`)
      .order("ID", { ascending: true })
      .range(from, to);
    if (error) { console.error("✗ tb_cnt fetch failed:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    cntRows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`  loaded ${cntRows.length.toLocaleString("th-TH")} tb_cnt rows\n`);

  console.log(`Loading existing tb_cnt_item rows (for idempotency check)…`);
  const existingPairs = new Set();
  for (let page = 0; ; page++) {
    const from = page * 1000;
    const to   = from + 999;
    const { data, error } = await sb
      .from("tb_cnt_item")
      .select(`"cntID","fCabinetNumber"`)
      .range(from, to);
    if (error) { console.error("✗ tb_cnt_item fetch failed:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.cntID != null && r.fCabinetNumber) {
        existingPairs.add(`${r.cntID}|${r.fCabinetNumber}`);
      }
    }
    if (data.length < 1000) break;
  }
  console.log(`  loaded ${existingPairs.size.toLocaleString("th-TH")} existing pairs\n`);

  // ── Step 3: explode CSVs ──
  const planned = [];
  let skippedExisting = 0;
  let skippedEmptyName = 0;
  for (const row of cntRows) {
    const cntID = row.ID;
    const cntName = (row.cntName ?? "").trim();
    if (!cntName) { skippedEmptyName += 1; continue; }
    const cabinets = cntName
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c !== "");
    for (const cab of cabinets) {
      const key = `${cntID}|${cab}`;
      if (existingPairs.has(key)) { skippedExisting += 1; continue; }
      planned.push({ cntID, fCabinetNumber: cab });
      existingPairs.add(key); // dedup within CSV (e.g. "X,X")
    }
  }

  console.log(`Plan:`);
  console.log(`  total planned inserts: ${planned.length.toLocaleString("th-TH")}`);
  console.log(`  skipped (empty cntName): ${skippedEmptyName}`);
  console.log(`  skipped (already exists): ${skippedExisting}\n`);

  if (planned.length === 0) {
    console.log("→ nothing to backfill · exiting clean");
    process.exit(0);
  }

  // ── Step 4: sample preview ──
  console.log(`First 10 sample inserts:`);
  for (const p of planned.slice(0, 10)) {
    console.log(`  cntID=${p.cntID} · fCabinetNumber="${p.fCabinetNumber}"`);
  }
  console.log("");

  // ── Step 5: dry-run summary or actual apply ──
  if (!APPLY) {
    console.log("🟡 DRY-RUN — no rows inserted.");
    console.log(`   Re-run with --apply to insert ${planned.length.toLocaleString("th-TH")} rows.`);
    process.exit(0);
  }

  // APPLY mode — insert in chunks of 500
  console.log(`🔴 APPLY — inserting ${planned.length.toLocaleString("th-TH")} rows in chunks of ${CHUNK}…`);
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < planned.length; i += CHUNK) {
    const chunk = planned.slice(i, i + CHUNK);
    const { error } = await sb.from("tb_cnt_item").insert(chunk);
    if (error) {
      failed += chunk.length;
      console.error(`  ✗ chunk ${i}-${i + chunk.length - 1} failed:`, error.code, error.message);
      // Continue · don't abort. May be partial dup or other transient.
    } else {
      inserted += chunk.length;
      if ((i / CHUNK) % 10 === 0) {
        process.stdout.write(`  ✓ inserted ${inserted.toLocaleString("th-TH")} so far…\r`);
      }
    }
  }
  console.log(`\n\nDone:`);
  console.log(`  inserted = ${inserted.toLocaleString("th-TH")}`);
  console.log(`  failed   = ${failed.toLocaleString("th-TH")}`);
  if (failed > 0) {
    console.log(`\n⚠️ ${failed} rows failed — re-run dry-run + investigate before re-apply.`);
    process.exit(1);
  }
  console.log(`\n✅ Complete · /admin/report-cnt should now show "จ่ายแล้ว" badges correctly.`);
}

main().catch((e) => {
  console.error("✗ uncaught:", e);
  process.exit(1);
});
