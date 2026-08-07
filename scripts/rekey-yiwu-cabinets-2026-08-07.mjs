/**
 * rekey-yiwu-cabinets-2026-08-07.mjs — รีเลขตู้อี้อูทั้งหมด → แพทเทิร์นเดียวกับกวางโจว
 *
 * owner 2026-08-07: "รี เลขตู้ของทางอี้อูใหม่ ... YW + S(SEA)/E(EK) + YYMMDD + -N
 * (N = ลำดับตู้ที่ปิดในวันนั้น) แบบเดียวกับกวางโจว" + "เคลียร์แถวแพคกิ้งที่ไม่ใช่
 * ลูกค้า PR ของเราออก — เจ้าอื่นของ TTW ไม่ได้ใช้ เกะกะ"
 * ⚠️ SUPERSEDES กติกา 2026-07-20 "ใช้เลขตู้ TTW verbatim" — owner เปลี่ยนเอง
 * เพราะเลขปนกัน 3 รูปแบบ (GZS…T เก่า · YWS…T · SEA0625-8211YW/YWYY13164 verbatim)
 * ทำให้ ตามของ/ตามตู้/เก็บเงิน/หาสถานะ กันไม่เจอ.
 *
 * ทำไม YWYY13164 → YWS260717-1: แพคกิ้งลิสยืนยัน X9002853 (PR107 · 6 กล่อง)
 * อยู่ตู้ YWS260717-8T — แถวจริงถูกประทับเลข verbatim คนละตัว = ตู้เดียวแตก 2 ชื่อ.
 *
 * เงิน: ไม่แตะราคา/ต้นทุน/สถานะแม้แต่คอลัมน์เดียว — ยันด้วย Σ ftotalprice +
 * Σ fcosttotalprice ของแถวที่โดน ก่อน==หลัง เป๊ะ + ห้ามมีแถวบนใบวางบิล active.
 * tb_cost_container (เรทต้นทุน TTW 2,600/คิว) ย้ายตามชื่อใหม่ในทรานแซกชันเดียวกัน —
 * แถมปิดบั๊กเดิม: เรทเคยค้างใต้ GZS260707-6T แต่แถวจริงเป็น YWS260707-6T = หาไม่เจอเงียบ.
 *
 * dry-run โดย default · `--apply` ถึงเขียนจริง · backup ลง scripts/_backup-*.json (gitignored)
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PW = process.env.PGPW;
if (!PW) { console.error("ต้องส่ง PGPW=<prod pw> (chat-only ห้ามลงไฟล์)"); process.exit(1); }

// ── แม็พชื่อ (ตรวจกับ prod แล้ว 2026-08-07 · วันที่ในชื่อเดิม = วันปิดตู้ · ทุกวันมีตู้เดียว → -1) ──
const FW_MAP = {
  "SEA0625-8211YW": "YWS260625-1",
  "YWS260707-6T":   "YWS260707-1",
  "GZS260714-7T":   "YWS260714-1",
  "YWS260717-8T":   "YWS260717-1",
  "YWYY13164":      "YWS260717-1", // ตู้เดียวกับ 0717 (หลักฐาน: staging X9002853)
  "YWS260720-9T":   "YWS260720-1",
  "YWS260723-1T":   "YWS260723-1",
};
// จำนวนแถวที่คาดไว้ต่อชื่อเดิม (TOCTOU guard — ต่างจากที่ probe ไว้ = abort)
const FW_EXPECT = {
  "SEA0625-8211YW": 7, "YWS260707-6T": 7, "GZS260714-7T": 3,
  "YWS260717-8T": 2, "YWYY13164": 6, "YWS260720-9T": 1, "YWS260723-1T": 4,
};
const STAGING_MAP = {
  "GZS260614-1T": "YWS260614-1", "GZS260615-2T": "YWS260615-1",
  "GZS260618-3T": "YWS260618-1", "GZS260619-4T": "YWS260619-1",
  "GZS260625-5T": "YWS260625-1", "GZS260707-6T": "YWS260707-1",
  "GZS260714-7T": "YWS260714-1", "YWS260717-8T": "YWS260717-1",
  "YWS260720-9T": "YWS260720-1", "YWS260722-10T": "YWS260722-1",
  "YWS260723-1T": "YWS260723-1", "YWS260724-2T": "YWS260724-1",
};
const COST_MAP = { "SEA0625-8211YW": "YWS260625-1", "GZS260707-6T": "YWS260707-1" };
const NEW_NAMES = [...new Set([...Object.values(FW_MAP), ...Object.values(STAGING_MAP)])];

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

try {
  // ── 0. PRE-FLIGHT (นอกทรานแซกชัน · read-only) ─────────────────────────────
  // ชื่อใหม่ต้องยังไม่มีที่ไหน (ยกเว้นเกิดจากการ rename ของเราเอง)
  for (const t of [["tb_forwarder", "fcabinetnumber"], ["ttw_packing_line", "container_no"], ["tb_cost_container", "fcabinetnumber"]]) {
    const r = await c.query(`select ${t[1]} nm, count(*)::int n from ${t[0]} where ${t[1]} = any($1) group by 1`, [NEW_NAMES]);
    if (r.rows.length > 0) throw new Error(`ชื่อใหม่ชนของเดิมใน ${t[0]}: ${JSON.stringify(r.rows)}`);
  }
  // ห้ามมีแถวอี้อูบนใบวางบิล active
  const inv = await c.query(`
    select count(*)::int n from tb_forwarder f
    join tb_forwarder_invoice_item it on it.forwarder_id = f.id
    join tb_forwarder_invoice i on i.id = it.invoice_id and i.status <> 'cancelled'
    where f.fcabinetnumber = any($1)`, [Object.keys(FW_MAP)]);
  if (inv.rows[0].n > 0) throw new Error(`มี ${inv.rows[0].n} แถวบนใบวางบิล active — หยุด รอเคาะ`);

  // นับแถวต่อชื่อเดิม + ยอดเงินรวม (ยันหลังเขียน)
  const before = await c.query(`
    select fcabinetnumber cab, count(*)::int n,
           coalesce(sum(ftotalprice),0) sell, coalesce(sum(fcosttotalprice),0) cost
    from tb_forwarder where fcabinetnumber = any($1) group by 1`, [Object.keys(FW_MAP)]);
  for (const [old, exp] of Object.entries(FW_EXPECT)) {
    const got = before.rows.find((r) => r.cab === old)?.n ?? 0;
    if (got !== exp) throw new Error(`TOCTOU: ${old} คาด ${exp} แถว เจอ ${got} — ข้อมูลขยับหลัง probe, abort`);
  }
  const sumBefore = before.rows.reduce((a, r) => ({ sell: a.sell + Number(r.sell), cost: a.cost + Number(r.cost) }), { sell: 0, cost: 0 });

  // แถว staging ที่จะลบ (เจ้าอื่นของ TTW: ไม่มี PR + ไม่เคย commit)
  const doomed = await c.query(`
    select * from ttw_packing_line
    where coalesce(member_code,'') = '' and committed_forwarder_id is null`);
  // แถวที่จะโดน rename (เก็บ backup)
  const fwRows = await c.query(`select id, fcabinetnumber from tb_forwarder where fcabinetnumber = any($1)`, [Object.keys(FW_MAP)]);
  const costRows = await c.query(`select * from tb_cost_container where fcabinetnumber = any($1)`, [Object.keys(COST_MAP)]);
  const stgKeep = await c.query(`select id, container_no from ttw_packing_line where container_no = any($1) and not (coalesce(member_code,'')='' and committed_forwarder_id is null)`, [Object.keys(STAGING_MAP)]);

  console.log(`── แผน ──
  tb_forwarder rename: ${fwRows.rows.length} แถว (${Object.keys(FW_MAP).length} ชื่อเดิม → ${new Set(Object.values(FW_MAP)).size} ชื่อใหม่)
  tb_cost_container rename: ${costRows.rows.length} แถว (เรท TTW ตามชื่อใหม่)
  ttw_packing_line: ลบเจ้าอื่น ${doomed.rows.length} แถว · rename ของเราที่เหลือ ${stgKeep.rows.length} แถว
  Σ sell=${sumBefore.sell.toFixed(2)} Σ cost=${sumBefore.cost.toFixed(2)} (ต้องเท่าเดิมเป๊ะหลังเขียน)`);
  for (const [o, n] of Object.entries(FW_MAP)) console.log(`    fw: ${o} → ${n} (${FW_EXPECT[o]} แถว)`);

  const stamp = Date.now();
  writeFileSync(`scripts/_backup-yiwu-rekey-${stamp}.json`, JSON.stringify({
    at: new Date().toISOString(), FW_MAP, STAGING_MAP, COST_MAP,
    forwarder: fwRows.rows, cost: costRows.rows, stagingRenamed: stgKeep.rows, stagingDeleted: doomed.rows,
  }, null, 1));
  console.log(`  backup → scripts/_backup-yiwu-rekey-${stamp}.json`);

  if (!APPLY) { console.log("\nDRY-RUN เท่านั้น — ใส่ --apply เพื่อเขียนจริง"); process.exit(0); }

  // ── เขียนจริง (ทรานแซกชันเดียว) ────────────────────────────────────────────
  await c.query("begin");
  const del = await c.query(`delete from ttw_packing_line where coalesce(member_code,'')='' and committed_forwarder_id is null`);
  if (del.rowCount !== doomed.rows.length) throw new Error(`ลบ staging ได้ ${del.rowCount} ≠ แผน ${doomed.rows.length}`);
  for (const [o, n] of Object.entries(FW_MAP)) {
    const r = await c.query(`update tb_forwarder set fcabinetnumber=$1 where fcabinetnumber=$2`, [n, o]);
    if (r.rowCount !== FW_EXPECT[o]) throw new Error(`fw ${o}: เขียน ${r.rowCount} ≠ คาด ${FW_EXPECT[o]}`);
  }
  for (const [o, n] of Object.entries(STAGING_MAP)) {
    await c.query(`update ttw_packing_line set container_no=$1, updated_at=now() where container_no=$2`, [n, o]);
  }
  for (const [o, n] of Object.entries(COST_MAP)) {
    const r = await c.query(`update tb_cost_container set fcabinetnumber=$1 where fcabinetnumber=$2`, [n, o]);
    if (r.rowCount !== 1) throw new Error(`cost ${o}: เขียน ${r.rowCount} ≠ 1`);
  }
  // ── ยันหลังเขียน (ในทรานแซกชัน · ผิด = rollback ทั้งก้อน) ──────────────────
  const after = await c.query(`
    select coalesce(sum(ftotalprice),0) sell, coalesce(sum(fcosttotalprice),0) cost, count(*)::int n
    from tb_forwarder where fcabinetnumber = any($1)`, [NEW_NAMES]);
  const a = after.rows[0];
  if (Number(a.n) !== fwRows.rows.length) throw new Error(`หลังเขียน: แถวใต้ชื่อใหม่ ${a.n} ≠ ${fwRows.rows.length}`);
  if (Math.abs(Number(a.sell) - sumBefore.sell) > 0.001 || Math.abs(Number(a.cost) - sumBefore.cost) > 0.001)
    throw new Error(`เงินขยับ! sell ${a.sell} vs ${sumBefore.sell} · cost ${a.cost} vs ${sumBefore.cost}`);
  const leftover = await c.query(`
    select 'fw' t, fcabinetnumber nm from tb_forwarder where fcabinetnumber = any($1)
    union all select 'stg', container_no from ttw_packing_line where container_no = any($2)
    union all select 'cost', fcabinetnumber from tb_cost_container where fcabinetnumber = any($3)`,
    [Object.keys(FW_MAP), Object.keys(STAGING_MAP), Object.keys(COST_MAP)]);
  if (leftover.rows.length > 0) throw new Error(`ชื่อเก่ายังเหลือ: ${JSON.stringify(leftover.rows)}`);
  await c.query("commit");

  const groups = await c.query(`
    select fcabinetnumber cab, count(*)::int rows from tb_forwarder
    where fcabinetnumber = any($1) group by 1 order by 1`, [NEW_NAMES]);
  console.log("\n✅ APPLIED — ตู้อี้อูหลังรีเลข:"); console.table(groups.rows);
  const stg = await c.query(`select container_no, count(*)::int lines from ttw_packing_line group by 1 order by 1`);
  console.log("staging ที่เหลือ (ของเราเท่านั้น):"); console.table(stg.rows);
} catch (e) {
  try { await c.query("rollback"); } catch {}
  console.error("❌", e.message); process.exitCode = 1;
} finally { await c.end(); }
