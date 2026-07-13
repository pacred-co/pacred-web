// Sync BUSINESS DATA prod → dev (owner 2026-07-13: "ซิงค์ข้อมูล prod↔dev · แต่แยกเว้นกัน
// ห้ามชนกัน เส้นใครเส้นมัน" — so juniors on dev can repro prod bugs).
//
// MODEL: one-way UPSERT prod → dev (INSERT ... ON CONFLICT (pk) DO UPDATE).
//  - dev-only rows (PKs not in prod) SURVIVE — ภูม's dev lane is preserved.
//  - shared rows are refreshed to prod (prod = truth).
//  - LOGIN lane kept separate: auth.users / profiles / admins are NOT touched
//    (each env keeps its own logins — the owner's "เส้นใครเส้นมัน").
//  - only columns present in BOTH schemas are synced (defensive).
//  - sequences bumped to max(id) after, so dev's next INSERT won't collide.
//
//   dry:   SUPABASE_DB_PASSWORD unused — reads both via hardcoded refs+pw below.
//          node scripts/sync-prod-data-to-dev-2026-07-13.mjs
//   apply: node scripts/sync-prod-data-to-dev-2026-07-13.mjs --apply
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PW_PROD = "DqOzfEZVXfMHIryz", PW_DEV = "n61OKDy28QcrB1ZJ";
const REF_PROD = "yzljakczhwrpbxflnmco", REF_DEV = "lozntlidlqqzzcaathnm";
const HOST = "aws-1-ap-southeast-1.pooler.supabase.com";
async function conn(ref, pw) { const c = new pg.Client({ connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${HOST}:5432/postgres`, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 }); await c.connect(); return c; }

// Scope: business + transactional + pricing/config + doc tables. NO login-identity.
const TABLES = [
  "tb_users", "tb_corporate", "tb_address",
  "tb_forwarder", "tb_forwarder_item", "tb_check_forwarder",
  "tb_header_order", "tb_order", "tb_payment",
  "tb_forwarder_invoice", "tb_receipt", "tb_forwarder_tax_invoice", "tb_shop_tax_invoice",
  "tb_cnt", "tb_cnt_item",
  "tb_wallet", "tb_wallet_hs", "tb_credit",
  "momo_import_tracks", "momo_box_detail",
  "tb_rate_custom_kg", "tb_rate_custom_cbm", "tb_rate_g_kg", "tb_rate_g_cbm",
  "tb_rate_vip_kg", "tb_rate_vip_cbm", "tb_co", "tb_settings",
];

const prod = await conn(REF_PROD, PW_PROD);
const dev = await conn(REF_DEV, PW_DEV);

async function pkOf(client, t) {
  const r = await client.query(`SELECT a.attname AS col FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisprimary`, [t]);
  return r.rows.map(x => x.col);
}
async function colsOf(client, t) {
  const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t]);
  return r.rows.map(x => x.column_name);
}
async function seqCol(client, t) {
  const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_default LIKE 'nextval%'`, [t]);
  return r.rows[0]?.column_name ?? null;
}
const qid = (s) => '"' + s.replace(/"/g, '""') + '"';

console.log(`\n═══ SYNC prod → dev · mode = ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ═══\n`);
const report = [];

for (const t of TABLES) {
  try {
    const [pCols, dCols, pPk] = await Promise.all([colsOf(prod, t), colsOf(dev, t), pkOf(prod, t)]);
    if (dCols.length === 0) { report.push({ table: t, status: "skip: not on dev" }); continue; }
    if (pPk.length === 0) { report.push({ table: t, status: "skip: no PK" }); continue; }
    const cols = pCols.filter(c => dCols.includes(c)); // intersection
    const pOnly = pCols.filter(c => !dCols.includes(c));
    const { rows } = await prod.query(`SELECT ${cols.map(qid).join(",")} FROM ${qid(t)}`);
    const devCount = Number((await dev.query(`SELECT count(*) n FROM ${qid(t)}`)).rows[0].n);

    if (!APPLY) {
      report.push({ table: t, prod: rows.length, dev: devCount, cols: cols.length, pOnly: pOnly.length ? pOnly.join(",") : "-", status: `would upsert ${rows.length}` });
      continue;
    }
    // Upsert in batches
    const nonPk = cols.filter(c => !pPk.includes(c));
    const setClause = nonPk.length ? nonPk.map(c => `${qid(c)}=EXCLUDED.${qid(c)}`).join(",") : null;
    const BATCH = 400;
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const params = [];
      const valSql = slice.map((row) => {
        const ph = cols.map((c) => { params.push(row[c]); return `$${params.length}`; });
        return `(${ph.join(",")})`;
      }).join(",");
      const conflict = setClause
        ? `ON CONFLICT (${pPk.map(qid).join(",")}) DO UPDATE SET ${setClause}`
        : `ON CONFLICT (${pPk.map(qid).join(",")}) DO NOTHING`;
      await dev.query(`INSERT INTO ${qid(t)} (${cols.map(qid).join(",")}) VALUES ${valSql} ${conflict}`, params);
      done += slice.length;
    }
    // Bump sequence
    const sc = await seqCol(dev, t);
    if (sc) {
      await dev.query(`SELECT setval(pg_get_serial_sequence('${t}','${sc}'), GREATEST((SELECT COALESCE(MAX(${qid(sc)}),1) FROM ${qid(t)}), 1))`);
    }
    const after = Number((await dev.query(`SELECT count(*) n FROM ${qid(t)}`)).rows[0].n);
    report.push({ table: t, prod: rows.length, dev_before: devCount, dev_after: after, status: `✅ upserted ${done}${sc ? " · seq bumped" : ""}` });
  } catch (e) {
    report.push({ table: t, status: `❌ ${String(e.message).slice(0, 80)}` });
  }
}

console.table(report);
await prod.end(); await dev.end();
console.log(`\n${APPLY ? "✅ APPLIED (dev updated · prod untouched · login lane separate)" : "🟡 DRY-RUN — re-run with --apply"}`);
