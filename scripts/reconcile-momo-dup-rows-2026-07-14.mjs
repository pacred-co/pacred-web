/**
 * RECONCILE MOMO duplicate/stale tb_forwarder rows against momo_box_detail (MOMO truth).
 *
 * Owner 2026-07-14 "ทำไมยังเกิดอีก": the 2026-07-09 re-sync (pre Fix F) created
 * DUPLICATE + stale-aggregate tb_forwarder rows for MOMO bases — some bases double/
 * triple-counted (e.g. 1783582423: 24 rows / Σ2994kg vs MOMO's 23 boxes / Σ2007kg).
 * box_detail (fed from MOMO Live, pass 3) is the AUTHORITATIVE box list.
 *
 * ALGORITHM (per affected base):
 *   1. Load box_detail boxes (TRUE set) + every tb_forwarder row (bare + "-N"/"-N/M").
 *   2. normalize(ftrackingchn) = strip trailing "/n" → the box key.
 *   3. Group tb_forwarder rows by box key. Keep exactly ONE row per box-detail key
 *      (prefer: fweight closest to box_detail box weight → staging_ptr → newest id).
 *      A key NOT in box_detail (stale box MOMO no longer lists) → all its rows DELETE.
 *   4. Classify each delete: EXACT_DUP = identical fweight AND ftotalprice to the kept
 *      survivor of that box (money-neutral by identity). Else = STALE/DIFF.
 *   5. 🔒 INVARIANT: survivors row-count === box_detail box-count, AND
 *        ( Σ fweight matches box_detail Σ within 2%  OR  every delete is EXACT_DUP ).
 *      A base failing this is LEFT UNTOUCHED + flagged.
 *   6. 🔒 MONEY GUARD: a delete target MUST be unbilled (fstatus 1-4 · paydeposit=0 ·
 *      NOT on any invoice item). A billed target → skip the whole base + flag.
 *
 * DRY-RUN by default. --apply writes (JSON backup of every deleted row first).
 * RUN: SUPABASE_DB_PASSWORD=… node scripts/reconcile-momo-dup-rows-2026-07-14.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});

const norm = (t) => String(t || "").trim().replace(/\/\d+$/, "");
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

async function main() {
  await c.connect();
  const { rows: dupBases } = await c.query(`
    SELECT DISTINCT split_part(ftrackingchn,'-',1) base FROM tb_forwarder
    WHERE ftrackingchn IN (
      SELECT ftrackingchn FROM tb_forwarder WHERE ftrackingchn<>'' GROUP BY ftrackingchn HAVING count(*)>1)
    ORDER BY 1`);
  const bases = dupBases.map((r) => r.base);
  console.log(`${APPLY ? "*** APPLY ***" : "*** DRY-RUN ***"}  affected bases: ${bases.length}\n`);

  const toDelete = [];
  const flagged = [];
  const okBases = [];
  const survivorsByBase = new Map(); // base → { byKey: Map<normKey, survivorId>, first: lowestSurvivorId }

  for (const base of bases) {
    const { rows: bd } = await c.query(
      `SELECT box_tracking, weight_kg, quantity FROM momo_box_detail WHERE base_tracking=$1`, [base]);
    if (bd.length === 0) { flagged.push({ base, reason: "no box_detail" }); continue; }
    const boxKeys = new Set(bd.map((b) => norm(b.box_tracking)));
    const bdWeightByKey = new Map();
    for (const b of bd) bdWeightByKey.set(norm(b.box_tracking), { wpp: num(b.weight_kg), qty: Math.max(num(b.quantity), 1) });
    const bdBoxCount = bd.length;
    const bdSumPP = bd.reduce((s, b) => s + num(b.weight_kg), 0);
    const bdSumQ = bd.reduce((s, b) => s + num(b.weight_kg) * Math.max(num(b.quantity), 1), 0);

    const { rows: fwd } = await c.query(`
      SELECT f.id, f.ftrackingchn, f.fweight, f.famount, f.ftotalprice, f.fstatus, f.paydeposit,
             (SELECT committed_forwarder_id FROM momo_import_tracks m WHERE m.momo_tracking_no=f.ftrackingchn) staging_ptr,
             (SELECT count(*) FROM tb_forwarder_invoice_item ii WHERE ii.forwarder_id=f.id) on_inv
      FROM tb_forwarder f WHERE f.ftrackingchn=$1 OR f.ftrackingchn LIKE $1||'-%' ORDER BY f.id`, [base]);

    const byKey = new Map();
    for (const r of fwd) { const k = norm(r.ftrackingchn); (byKey.get(k) || byKey.set(k, []).get(k)).push(r); }

    const del = [];
    for (const [k, rows] of byKey) {
      if (!boxKeys.has(k)) { for (const r of rows) del.push({ r, reason: `stale_key(${k})`, exact: false }); continue; }
      if (rows.length === 1) continue;
      const target = bdWeightByKey.get(k);
      const boxWt = target ? [target.wpp, target.wpp * target.qty] : [];
      const score = (r) => { const w = num(r.fweight); return boxWt.length ? Math.min(...boxWt.map((bw) => Math.abs(w - bw))) : 0; };
      const sorted = [...rows].sort((a, b) => {
        const d = score(a) - score(b); if (Math.abs(d) > 0.01) return d;
        const aS = String(a.id) === String(a.staging_ptr) ? 0 : 1, bS = String(b.id) === String(b.staging_ptr) ? 0 : 1;
        if (aS !== bS) return aS - bS; return Number(b.id) - Number(a.id);
      });
      const keep = sorted[0];
      for (const r of sorted.slice(1)) {
        const exact = num(r.fweight) === num(keep.fweight) && num(r.ftotalprice) === num(keep.ftotalprice);
        del.push({ r, reason: `dup_of_box(${k}) keep=${keep.id}${exact ? " EXACT" : ""}`, exact });
      }
    }

    const billed = del.some((d) => !["1", "2", "3", "4"].includes(String(d.r.fstatus)) || String(d.r.paydeposit) === "1" || Number(d.r.on_inv) > 0);
    if (billed) { flagged.push({ base, reason: "delete target billed/paid — manual" }); continue; }

    const delIds = new Set(del.map((d) => String(d.r.id)));
    const survivors = fwd.filter((r) => !delIds.has(String(r.id)));
    const survSum = survivors.reduce((s, r) => s + num(r.fweight), 0);
    const countOk = survivors.length === bdBoxCount;
    const sigmaOk = Math.abs(survSum - bdSumPP) <= bdSumPP * 0.02 + 0.5 || Math.abs(survSum - bdSumQ) <= bdSumQ * 0.02 + 0.5;
    const allExact = del.length > 0 && del.every((d) => d.exact);
    const pass = del.length > 0 && countOk && (sigmaOk || allExact);

    console.log(`base ${base}: bd ${bdBoxCount}box Σpp=${bdSumPP.toFixed(1)}/×q=${bdSumQ.toFixed(1)} · fwd ${fwd.length}→del ${del.length}→surv ${survivors.length} Σ=${survSum.toFixed(1)} · ${pass ? "✅ PASS" : "🔴 FLAG"}${allExact ? " (all exact-dup)" : sigmaOk ? " (Σ match)" : ""}`);
    for (const d of del) console.log(`    DEL id=${d.r.id} '${d.r.ftrackingchn}' wt=${d.r.fweight} tot=${d.r.ftotalprice} · ${d.reason}`);

    if (pass) {
      okBases.push(base);
      for (const d of del) toDelete.push({ base, ...d.r, reason: d.reason });
      // survivor map for staging re-point: norm-key → survivor id, + base fallback
      const byKeySurv = new Map();
      for (const s of survivors) { const k = norm(s.ftrackingchn); if (!byKeySurv.has(k)) byKeySurv.set(k, s.id); }
      survivorsByBase.set(base, { byKey: byKeySurv, first: survivors.length ? Math.min(...survivors.map((s) => Number(s.id))) : null });
    } else flagged.push({ base, reason: `invariant: count ${survivors.length}/${bdBoxCount} Σ${survSum.toFixed(1)} vs pp${bdSumPP.toFixed(1)}/q${bdSumQ.toFixed(1)}` });
  }

  console.log("\n════════ SUMMARY ════════");
  console.log(`bases PASS (delete): ${okBases.length} · rows to delete: ${toDelete.length}`);
  console.log(`bases FLAGGED (untouched): ${flagged.length}`);
  for (const f of flagged) console.log(`  🔴 ${f.base} — ${f.reason}`);

  if (APPLY && toDelete.length) {
    const backup = `scripts/_backup-reconcile-dup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const ids = toDelete.map((d) => Number(d.id));
    const { rows: full } = await c.query(`SELECT * FROM tb_forwarder WHERE id = ANY($1::bigint[])`, [ids]);
    // staging re-point: any momo_import_tracks.committed_forwarder_id pointing at a
    // deleted row → re-point to the box's survivor (norm match), else the base's first
    // survivor. Prevents a dangling committed ref → the next sync re-committing a dup.
    const idSet = new Set(ids.map(String));
    const { rows: stg } = await c.query(
      `SELECT momo_tracking_no, committed_forwarder_id FROM momo_import_tracks WHERE committed_forwarder_id::bigint = ANY($1::bigint[])`, [ids]);
    const repoints = [];
    for (const s of stg) {
      const base = String(s.momo_tracking_no).split("-")[0];
      const info = survivorsByBase.get(base);
      if (!info) continue;
      const k = norm(s.momo_tracking_no);
      const to = info.byKey.get(k) ?? info.first;
      if (to && !idSet.has(String(to))) repoints.push({ track: s.momo_tracking_no, from: s.committed_forwarder_id, to });
    }
    writeFileSync(backup, JSON.stringify({ deleted: full, plan: toDelete, repoints }, null, 2));
    console.log(`\nBackup: ${backup} (${full.length} rows · ${repoints.length} staging re-points)`);
    await c.query("BEGIN");
    try {
      for (const rp of repoints) {
        await c.query(`UPDATE momo_import_tracks SET committed_forwarder_id=$1 WHERE momo_tracking_no=$2 AND committed_forwarder_id::bigint=$3`,
          [String(rp.to), rp.track, Number(rp.from)]);
      }
      const r = await c.query(`DELETE FROM tb_forwarder WHERE id = ANY($1::bigint[])`, [ids]);
      await c.query("COMMIT");
      console.log(`*** re-pointed ${repoints.length} staging · DELETED ${r.rowCount} rows across ${okBases.length} bases ***`);
    } catch (e) { await c.query("ROLLBACK"); console.error("ROLLBACK:", e.message); }
  } else if (!APPLY) console.log("\n*** DRY-RUN — nothing written. --apply to delete. ***");
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
