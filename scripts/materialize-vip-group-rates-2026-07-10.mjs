// Materialize VIP-group rates → per-customer custom rates (owner 2026-07-10:
// ยกเลิก tier VIP/SVIP/VVIP → ยึดเรทขายหน้า profile · Materialize · ราคาไม่เปลี่ยน).
// For each customer whose coID points to a VIP-group (tb_rate_vip_*) and who does
// NOT already have a per-customer custom rate (tb_rate_custom_*), COPY their group's
// rate rows into tb_rate_custom_* keyed by their userid — so when the resolver later
// drops the VIP-group tier, their price is UNCHANGED (custom rate = their old group rate).
// Then set coID → 'PR' (general) so no customer is "on a VIP-group" anymore.
// Default DRY-RUN. Pass --apply to write. Idempotent (skips users who already have custom).
import pg from "pg";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");

const DESTS = [
  { ref: "yzljakczhwrpbxflnmco", pass: "DqOzfEZVXfMHIryz", label: "PROD" },
  { ref: "lozntlidlqqzzcaathnm", pass: "n61OKDy28QcrB1ZJ", label: "DEV" },
];
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
async function connect({ ref, pass, label }) {
  const enc = encodeURIComponent(pass);
  const attempts = [
    ...HOSTS.flatMap((h) => [`postgresql://postgres.${ref}:${enc}@${h}:5432/postgres`, `postgresql://postgres.${ref}:${enc}@${h}:6543/postgres`]),
    `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
  ];
  for (const c of attempts) { try { const cl = new Client({ connectionString: c, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await cl.connect(); return cl; } catch { /* next */ } }
  throw new Error(`cannot connect ${label}`);
}

async function run(cfg) {
  const c = await connect(cfg);
  console.log(`\n=== ${cfg.label} (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  // 1. VIP-group coids
  const { rows: gRows } = await c.query(`SELECT DISTINCT coid FROM tb_rate_vip_cbm`);
  const groups = gRows.map((r) => r.coid);
  // 2. customers on a VIP-group
  const { rows: custs } = await c.query(`SELECT "userID" AS userid, "coID" AS coid FROM tb_users WHERE "coID" = ANY($1)`, [groups]);
  // 3. users who already have a custom rate (skip)
  const { rows: hasCbm } = await c.query(`SELECT DISTINCT userid FROM tb_rate_custom_cbm`);
  const { rows: hasKg }  = await c.query(`SELECT DISTINCT userid FROM tb_rate_custom_kg`);
  const hasCustom = new Set([...hasCbm.map((r) => r.userid), ...hasKg.map((r) => r.userid)]);
  const toDo = custs.filter((u) => !hasCustom.has(u.userid));
  console.log(`VIP-group customers: ${custs.length} · already have custom (skip): ${custs.length - toDo.length} · to materialize: ${toDo.length}`);

  // 4. cache each group's rate rows (cbm + kg)
  const groupRate = {};
  for (const g of groups) {
    const cbm = (await c.query(`SELECT sourcewarehouse,rtransporttype,rproductstype,rcbm,adminidupdate FROM tb_rate_vip_cbm WHERE coid=$1`, [g])).rows;
    const kg  = (await c.query(`SELECT sourcewarehouse,rtransporttype,rproductstype,rkg,adminidupdate FROM tb_rate_vip_kg WHERE coid=$1`, [g])).rows;
    groupRate[g] = { cbm, kg };
  }
  // spot-check
  const sample = toDo[0];
  if (sample) console.log(`spot-check: ${sample.userid} (coid ${sample.coid}) → cbm rows ${groupRate[sample.coid]?.cbm.length} · kg rows ${groupRate[sample.coid]?.kg.length} · e.g. cbm[0]=${JSON.stringify(groupRate[sample.coid]?.cbm[0])}`);

  if (!APPLY) { console.log(`(dry-run · would create custom rows for ${toDo.length} customers + set their coID→'PR' · --apply เพื่อลงจริง)`); await c.end(); return; }

  // backup the original coID mapping (reversible) before the UPDATE.
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`/tmp/vip-coid-backup-${cfg.label}-${Date.now()}.json`, JSON.stringify(custs, null, 1));
  console.log(`backup: ${custs.length} original coID mappings saved.`);

  let cbmIns = 0, kgIns = 0, coidUpd = 0;
  for (const u of toDo) {
    const gr = groupRate[u.coid];
    if (!gr) continue;
    for (const r of gr.cbm) {
      await c.query(`INSERT INTO tb_rate_custom_cbm (userid,sourcewarehouse,rtransporttype,rproductstype,rcbm,adminidupdate) VALUES ($1,$2,$3,$4,$5,$6)`,
        [u.userid, r.sourcewarehouse, r.rtransporttype, r.rproductstype, r.rcbm, r.adminidupdate || "materialize0710"]); cbmIns++;
    }
    for (const r of gr.kg) {
      await c.query(`INSERT INTO tb_rate_custom_kg (userid,sourcewarehouse,rtransporttype,rproductstype,rkg,adminidupdate) VALUES ($1,$2,$3,$4,$5,$6)`,
        [u.userid, r.sourcewarehouse, r.rtransporttype, r.rproductstype, r.rkg, r.adminidupdate || "materialize0710"]); kgIns++;
    }
  }
  // set coID → PR for ALL VIP-group customers (they now use their custom rate / general)
  const upd = await c.query(`UPDATE tb_users SET "coID"='PR' WHERE "coID" = ANY($1)`, [groups]);
  coidUpd = upd.rowCount;
  console.log(`APPLIED: custom_cbm +${cbmIns} · custom_kg +${kgIns} · coID→PR ${coidUpd} customers`);
  await c.end();
}
for (const d of DESTS) await run(d);
console.log("\n✅ done. (Deploy the resolver change AFTER this so prices stay identical.)");
