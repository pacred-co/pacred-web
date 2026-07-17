/**
 * Apply 0258_hs_library_unified.sql to prod + dev, then VERIFY.
 *
 * Additive + idempotent (add column if not exists · create index if not exists ·
 * a provenance UPDATE guarded by `where provenance is null`). Runs inside a
 * transaction per env; verifies the columns + generated keys actually exist
 * afterwards rather than trusting a clean exit.
 *
 *   node scripts/apply-migration-0258.mjs            # dry-run (prints plan)
 *   node scripts/apply-migration-0258.mjs --apply    # execute
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const SQL = readFileSync(new URL("../supabase/migrations/0258_hs_library_unified.sql", import.meta.url), "utf8");

const ENVS = [
  { label: "PROD", user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz" },
  { label: "DEV",  user: "postgres.lozntlidlqqzzcaathnm", password: "n61OKDy28QcrB1ZJ" },
];

const NEW_COLS = [
  "source", "provenance", "is_canonical", "duty_confirmed", "decl_count",
  "decl_duty_pct", "decl_form_e_pct", "decl_duty_stable", "decl_last_used",
  "updated_by", "hs8_key", "hs8_is_padded",
];

async function run({ label, user, password }) {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com",
    port: 5432, user, password, database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`\n──────── ${label} ────────`);

  const before = await c.query(`
    select count(*) filter (where column_name = any($1)) new_cols
    from information_schema.columns where table_name='hs_codes'`, [NEW_COLS]);
  const botKey = await c.query(`
    select count(*) n from information_schema.columns
    where table_name='doc_bot_hs_codes' and column_name='hs8_key'`);
  console.log(`before: hs_codes new cols ${before.rows[0].new_cols}/${NEW_COLS.length} · doc_bot.hs8_key ${botKey.rows[0].n}/1`);

  if (!APPLY) {
    console.log("DRY-RUN — would execute 0258 (additive · idempotent). Pass --apply to run.");
    await c.end();
    return;
  }

  try {
    await c.query("begin");
    await c.query(SQL);
    await c.query("commit");
    console.log("applied ✓");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error(`FAILED (rolled back): ${e.message}`);
    await c.end();
    process.exitCode = 1;
    return;
  }

  // ── VERIFY (read the real catalog, don't trust the clean exit) ──
  const cols = await c.query(`
    select column_name, is_generated from information_schema.columns
    where table_name='hs_codes' and column_name = any($1) order by column_name`, [NEW_COLS]);
  const missing = NEW_COLS.filter((n) => !cols.rows.some((r) => r.column_name === n));
  const bot = await c.query(`
    select column_name, is_generated from information_schema.columns
    where table_name='doc_bot_hs_codes' and column_name='hs8_key'`);
  const idx = await c.query(`
    select indexname from pg_indexes
    where tablename in ('hs_codes','doc_bot_hs_codes')
      and indexname in ('hs_codes_hs8_key_idx','doc_bot_hs_codes_hs8_key_idx','hs_codes_source_idx',
                        'hs_codes_decl_count_idx','hs_codes_desc_trgm_idx','hs_codes_desc_en_trgm_idx',
                        'doc_bot_hs_codes_th_trgm_idx')
    order by indexname`);
  const prov = await c.query(`
    select provenance, duty_confirmed, count(*) n from hs_codes group by 1,2 order by 1,2`);
  // the generated keys must actually populate + branch correctly
  const keys = await c.query(`
    select count(*) rows, count(hs8_key) keyed, count(*) filter (where hs8_is_padded) padded from hs_codes`);
  const botKeys = await c.query(`
    select count(*) rows, count(hs8_key) keyed, count(distinct hs8_key) distinct_keys from doc_bot_hs_codes`);
  const overlap = await c.query(`
    select count(*) n from (select distinct hs8_key k from hs_codes where hs8_key is not null
      intersect select distinct hs8_key from doc_bot_hs_codes where hs8_key is not null) x`);

  console.log(`cols     : ${cols.rows.length}/${NEW_COLS.length}${missing.length ? ` ❌ MISSING ${missing.join(",")}` : " ✓"}`);
  console.log(`generated: hs8_key=${cols.rows.find((r) => r.column_name === "hs8_key")?.is_generated} · hs8_is_padded=${cols.rows.find((r) => r.column_name === "hs8_is_padded")?.is_generated}`);
  console.log(`doc_bot  : hs8_key ${bot.rows.length ? `✓ (generated=${bot.rows[0].is_generated})` : "❌ MISSING"}`);
  console.log(`indexes  : ${idx.rows.length}/7 ${idx.rows.length === 7 ? "✓" : "❌ " + idx.rows.map((r) => r.indexname).join(",")}`);
  console.log(`hs_codes : ${keys.rows[0].rows} rows · ${keys.rows[0].keyed} keyed · ${keys.rows[0].padded} padded`);
  console.log(`doc_bot  : ${botKeys.rows[0].rows} rows · ${botKeys.rows[0].keyed} keyed · ${botKeys.rows[0].distinct_keys} distinct keys`);
  console.log(`hs∩bot   : ${overlap.rows[0].n} (expect 74)`);
  console.table(prov.rows);

  if (missing.length || !bot.rows.length || idx.rows.length !== 7) process.exitCode = 1;
  await c.end();
}

for (const e of ENVS) {
  try { await run(e); } catch (e2) { console.error(`${e.label} ERR ${e2.message}`); process.exitCode = 1; }
}
