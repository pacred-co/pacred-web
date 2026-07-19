/**
 * ttw-auto-match-pr-2026-07-18.mjs — auto-match PRs onto staged TTW packing lines
 * (owner 2026-07-18 "จับคู่ PR ให้เราด้วยเลย · อันไหนไม่เจอค่อยกรองไว้ให้ CS เทียบใบส่งของ").
 *
 * Two passes, both idempotent + fill-when-NULL-only (never overwrites a CS/mark PR):
 *
 *  PASS 1 — TRACKING: a staged line's 单号 (base_tracking) that CS already keyed into
 *  tb_forwarder from a delivery note (possibly as -N/M box rows · X9002769-1/3) tells us
 *  the customer. Join on the BASE tracking (suffix stripped) → userid. pr_source='tracking'.
 *
 *  PASS 2 — MARK-FAMILY: the 唛头 mark is TTW's per-CUSTOMER code (SPK/KTM888/SEA = one
 *  customer's stream). Where a mark's known PRs (from PR### marks / tracking / CS) all
 *  AGREE on exactly ONE PR → fill that mark's remaining NULL rows. pr_source='mark'.
 *  A mark with CONFLICTING known PRs is skipped + reported (never guess).
 *
 * SAFETY: ttw_packing_line = STAGING (no money · §0e). Only member_code/pr_source written.
 * committed rows untouched (committed_forwarder_id IS NULL guard). Dry-run + backup.
 * RUN: SUPABASE_DB_PASSWORD='…' node scripts/ttw-auto-match-pr-2026-07-18.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

async function main() {
  const c = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();

  // ── PASS 1 · tracking-join (base = the -N/M suffix stripped) ──
  const { rows: p1 } = await c.query(`
    SELECT t.id, t.base_tracking, t.shipping_mark, f.userid
    FROM ttw_packing_line t
    JOIN LATERAL (
      SELECT DISTINCT userid FROM tb_forwarder f
      WHERE regexp_replace(f.ftrackingchn, '-[0-9]+(/[0-9]+)?$', '') = t.base_tracking
        AND f.userid LIKE 'PR%'
    ) f ON true
    WHERE t.member_code IS NULL AND t.committed_forwarder_id IS NULL`);
  // a base tracking matching >1 distinct PR = ambiguous → skip
  const byLine = new Map();
  for (const r of p1) {
    const cur = byLine.get(r.id);
    if (cur && cur.userid !== r.userid) cur.conflict = true;
    else if (!cur) byLine.set(r.id, r);
  }
  const p1ok = [...byLine.values()].filter((r) => !r.conflict);
  console.log(`\nPASS 1 (tracking-join · base-suffix-aware): ${p1ok.length} lines matched`);
  console.table(p1ok.map((r) => ({ id: r.id.slice(0, 8), trk: r.base_tracking, mark: r.shipping_mark, pr: r.userid })));

  if (APPLY) {
    for (const r of p1ok) {
      await c.query(
        `UPDATE ttw_packing_line SET member_code=$1, pr_source='tracking', updated_at=now()
         WHERE id=$2 AND member_code IS NULL AND committed_forwarder_id IS NULL`,
        [r.userid, r.id],
      );
    }
  }

  // ── PASS 2 · mark-family propagation (after pass 1 so its PRs seed the marks) ──
  const { rows: marks } = await c.query(`
    SELECT shipping_mark,
           count(*) FILTER (WHERE member_code IS NULL AND committed_forwarder_id IS NULL) AS nulls,
           array_agg(DISTINCT member_code) FILTER (WHERE member_code IS NOT NULL) AS prs
    FROM ttw_packing_line
    WHERE shipping_mark IS NOT NULL AND shipping_mark <> ''
    GROUP BY 1`);
  const fillable = marks.filter((m) => (m.prs?.length ?? 0) === 1 && Number(m.nulls) > 0);
  const conflicted = marks.filter((m) => (m.prs?.length ?? 0) > 1);
  console.log(`\nPASS 2 (mark-family): ${fillable.length} marks propagate → ${fillable.reduce((s, m) => s + Number(m.nulls), 0)} lines`);
  console.table(fillable.map((m) => ({ mark: m.shipping_mark, pr: m.prs[0], fills: Number(m.nulls) })));
  if (conflicted.length) {
    console.log(`⚠ marks with CONFLICTING PRs (skipped · CS ตรวจ):`);
    console.table(conflicted.map((m) => ({ mark: m.shipping_mark, prs: m.prs.join(",") })));
  }

  if (!APPLY) {
    // remaining after both passes (simulated)
    const p1Fills = p1ok.length;
    const p2Fills = fillable.reduce((s, m) => s + Number(m.nulls), 0);
    const { rows: [{ nulls }] } = await c.query(
      `SELECT count(*)::int nulls FROM ttw_packing_line WHERE member_code IS NULL AND committed_forwarder_id IS NULL`);
    console.log(`\n(dry-run) currently NULL=${nulls} → after apply ≈ ${nulls - p1Fills - p2Fills} lines · CS workload = per-MARK not per-line`);
    await c.end(); return;
  }

  // backup current state before pass-2 writes
  const { rows: backup } = await c.query(`SELECT id, member_code, pr_source FROM ttw_packing_line`);
  writeFileSync(`/tmp/backup-ttw-auto-match-2026-07-18.json`, JSON.stringify(backup, null, 2));

  let p2n = 0;
  for (const m of fillable) {
    const res = await c.query(
      `UPDATE ttw_packing_line SET member_code=$1, pr_source='mark', updated_at=now()
       WHERE shipping_mark=$2 AND member_code IS NULL AND committed_forwarder_id IS NULL`,
      [m.prs[0], m.shipping_mark],
    );
    p2n += res.rowCount ?? 0;
  }

  const { rows: [after] } = await c.query(`
    SELECT count(*)::int total,
           count(member_code)::int with_pr,
           count(*) FILTER (WHERE member_code IS NULL)::int nulls,
           count(DISTINCT shipping_mark) FILTER (WHERE member_code IS NULL)::int null_marks
    FROM ttw_packing_line`);
  console.log(`\n✅ applied — pass1=${p1ok.length} · pass2=${p2n} · now: ${after.with_pr}/${after.total} มี PR · เหลือ ${after.nulls} แถว = ${after.null_marks} มาร์ค (CS ใส่ครั้งเดียวต่อมาร์ค → ติดทั้งมาร์ค)`);
  console.log(`📦 backup → /tmp/backup-ttw-auto-match-2026-07-18.json`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
