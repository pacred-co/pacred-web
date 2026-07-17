/** READ-ONLY verification of mig 0258 + the anchor-inversion claim. No writes. */
import pg from "pg";

const ENVS = [
  { label: "PROD", user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz" },
  { label: "DEV", user: "postgres.lozntlidlqqzzcaathnm", password: "n61OKDy28QcrB1ZJ" },
];

const NEW_COLS = [
  "source", "provenance", "is_canonical", "duty_confirmed", "decl_count",
  "decl_duty_pct", "decl_form_e_pct", "decl_duty_stable", "decl_last_used",
  "updated_by", "hs8_key", "hs8_is_padded",
];

for (const env of ENVS) {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com",
    port: 5432, user: env.user, password: env.password,
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`\n═══════════ ${env.label} ═══════════`);

  // 1. 0258 columns on hs_codes
  const cols = await c.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='hs_codes' and column_name = any($1)`,
    [NEW_COLS],
  );
  const have = new Set(cols.rows.map((r) => r.column_name));
  const missing = NEW_COLS.filter((x) => !have.has(x));
  console.log(`hs_codes 0258 cols : ${have.size}/${NEW_COLS.length}${missing.length ? "  MISSING: " + missing.join(",") : "  ✓"}`);

  // 2. hs8_key on doc_bot_hs_codes
  const bot = await c.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='doc_bot_hs_codes' and column_name='hs8_key'`,
  );
  console.log(`doc_bot hs8_key    : ${bot.rows.length ? "✓" : "❌ MISSING"}`);

  // 3. indexes
  const idx = await c.query(
    `select indexname from pg_indexes where schemaname='public'
     and indexname in ('hs_codes_hs8_key_idx','doc_bot_hs_codes_hs8_key_idx','hs_codes_source_idx',
                       'hs_codes_decl_count_idx','hs_codes_desc_trgm_idx','hs_codes_desc_en_trgm_idx',
                       'doc_bot_hs_codes_th_trgm_idx')`,
  );
  console.log(`indexes            : ${idx.rows.length}/7`);

  // 4. 🔴 THE ANCHOR CLAIM — FKs referencing hs_codes
  const fks = await c.query(`
    select tc.table_name, kcu.column_name, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and ccu.table_name='hs_codes'`);
  console.log(`FKs → hs_codes     : ${fks.rows.length}`);
  for (const f of fks.rows) console.log(`   ${f.table_name}.${f.column_name}  ON DELETE ${f.delete_rule}`);

  // 5. provenance backfill + canonical marking
  const p = await c.query(`
    select provenance, count(*) n, count(*) filter (where duty_confirmed) confirmed
    from hs_codes group by provenance order by n desc`);
  console.log("provenance:");
  for (const r of p.rows) console.log(`   ${(r.provenance ?? "(null)").padEnd(14)} n=${String(r.n).padEnd(5)} confirmed=${r.confirmed}`);

  const canon = await c.query(`select count(*) n from hs_codes where is_canonical`);
  console.log(`is_canonical=true  : ${canon.rows[0].n}`);

  // 6. RLS posture unchanged
  const rls = await c.query(
    `select tablename, count(*) n from pg_policies where schemaname='public'
     and tablename in ('hs_codes','doc_bot_hs_codes','doc_bot_hs_overrides') group by tablename`,
  );
  console.log("RLS policies:");
  for (const r of rls.rows) console.log(`   ${r.tablename.padEnd(22)} ${r.n}`);
  const noPol = ["doc_bot_hs_codes", "doc_bot_hs_overrides"].filter(
    (t) => !rls.rows.find((r) => r.tablename === t),
  );
  if (noPol.length) console.log(`   (0 policies = service-role only: ${noPol.join(", ")})`);

  // 7. hs8_key actually populates (the join basis)
  const k = await c.query(`
    select (select count(*) from hs_codes where hs8_key is not null) hs_keyed,
           (select count(*) from hs_codes) hs_total,
           (select count(*) from doc_bot_hs_codes where hs8_key is not null) bot_keyed,
           (select count(*) from doc_bot_hs_codes) bot_total`);
  const r = k.rows[0];
  console.log(`hs8_key populated  : hs_codes ${r.hs_keyed}/${r.hs_total} · doc_bot ${r.bot_keyed}/${r.bot_total}`);

  await c.end();
}
console.log("\n(read-only — nothing written)");
