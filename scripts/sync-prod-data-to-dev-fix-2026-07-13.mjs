// Fix-pass for the 6 tables the main sync-prod-data-to-dev script skipped:
//  - jsonb columns (corporate_docs · slip_paths): node-pg sends a JS array as a
//    postgres array literal → "invalid input syntax for type json" → stringify + ::jsonb.
//  - secondary UNIQUE (tb_receipt.rid · momo_import_tracks.momo_tracking_no ·
//    momo_box_detail(base_tracking,box_tracking)): a prod row's business key may sit
//    on a DIFFERENT dev pk → clear that stale dev row first, then upsert on pk.
//  - tb_forwarder_tax_invoice: FK → tb_receipt(id) · runs AFTER receipt syncs.
//   apply: node scripts/sync-prod-data-to-dev-fix-2026-07-13.mjs --apply
import pg from "pg";
const APPLY = process.argv.includes("--apply");
async function conn(ref, pw) { const c = new pg.Client({ connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 }); await c.connect(); return c; }
const prod = await conn("yzljakczhwrpbxflnmco", "DqOzfEZVXfMHIryz");
const dev = await conn("lozntlidlqqzzcaathnm", "n61OKDy28QcrB1ZJ");
const qid = (s) => '"' + s.replace(/"/g, '""') + '"';

// per-table: pk (single), jsonb cols, business-unique key(s) to clear collisions
const CFG = [
  { t: "tb_corporate", pk: "id", jsonb: ["corporate_docs"], uniq: [] },
  { t: "tb_forwarder_invoice", pk: "id", jsonb: ["slip_paths"], uniq: [] },
  { t: "tb_receipt", pk: "id", jsonb: [], uniq: [["rid"]] },
  { t: "momo_import_tracks", pk: "id", jsonb: [], uniq: [["momo_tracking_no"]] },
  { t: "momo_box_detail", pk: "id", jsonb: [], uniq: [["base_tracking", "box_tracking"]] },
  { t: "tb_forwarder_tax_invoice", pk: "id", jsonb: [], uniq: [] },
];

async function colsOf(client, t) { return (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t])).rows.map(r => r.column_name); }
async function seqCol(client, t) { return (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_default LIKE 'nextval%'`, [t])).rows[0]?.column_name ?? null; }

console.log(`\n═══ SYNC FIX prod → dev · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ═══\n`);
const report = [];
for (const { t, pk, jsonb, uniq } of CFG) {
  try {
    const [pCols, dCols] = await Promise.all([colsOf(prod, t), colsOf(dev, t)]);
    const cols = pCols.filter(c => dCols.includes(c));
    const { rows } = await prod.query(`SELECT ${cols.map(qid).join(",")} FROM ${qid(t)}`);
    if (!APPLY) { report.push({ table: t, prod: rows.length, status: "would fix" }); continue; }

    // 1. clear secondary-unique collisions: delete EVERY dev row holding a prod
    //    business-key (no pk guard — avoids the in-statement musical-chairs collision
    //    when prod reassigns a rid/tracking across ids). Dev-only keys (not in prod) survive.
    for (const key of uniq) {
      const keyVals = rows.map(r => key.map(k => r[k]));
      const CH = 300;
      for (let i = 0; i < keyVals.length; i += CH) {
        const slice = keyVals.slice(i, i + CH).filter(kv => kv.every(v => v != null));
        if (!slice.length) continue;
        const params = []; const tuples = slice.map(kv => `(${kv.map(v => { params.push(v); return `$${params.length}`; }).join(",")})`).join(",");
        await dev.query(`DELETE FROM ${qid(t)} WHERE (${key.map(qid).join(",")}) IN (${tuples})`, params);
      }
    }
    // 2. upsert on pk, jsonb-aware
    const nonPk = cols.filter(c => c !== pk);
    const setClause = nonPk.map(c => `${qid(c)}=EXCLUDED.${qid(c)}`).join(",");
    const BATCH = 300;
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const params = [];
      const valSql = slice.map(row => {
        const ph = cols.map(c => {
          if (jsonb.includes(c)) { params.push(row[c] == null ? null : JSON.stringify(row[c])); return `$${params.length}::jsonb`; }
          params.push(row[c]); return `$${params.length}`;
        });
        return `(${ph.join(",")})`;
      }).join(",");
      await dev.query(`INSERT INTO ${qid(t)} (${cols.map(qid).join(",")}) VALUES ${valSql} ON CONFLICT (${qid(pk)}) DO UPDATE SET ${setClause}`, params);
      done += slice.length;
    }
    const sc = await seqCol(dev, t);
    if (sc) await dev.query(`SELECT setval(pg_get_serial_sequence('${t}','${sc}'), GREATEST((SELECT COALESCE(MAX(${qid(sc)}),1) FROM ${qid(t)}),1))`);
    const after = Number((await dev.query(`SELECT count(*) n FROM ${qid(t)}`)).rows[0].n);
    report.push({ table: t, prod: rows.length, dev_after: after, status: `✅ ${done}${sc ? " · seq" : ""}` });
  } catch (e) { report.push({ table: t, status: `❌ ${String(e.message).slice(0, 90)}` }); }
}
console.table(report);
await prod.end(); await dev.end();
console.log(`\n${APPLY ? "✅ FIX APPLIED" : "🟡 DRY-RUN"}`);
