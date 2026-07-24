/**
 * กวาด "แถวรวม (bare) ที่ซ้อนกล่องแตกแล้ว" ใน**ครอบครัวที่บิลไปแล้ว** — ทั้งระบบ.
 *
 * owner 2026-07-24 (จาก GZS260606-1 · PR107 1780629608): *"งานนี้มีแค่ 8 กล่อง
 * นายเล่นเบิ้ลอีกแล้ว เมื่อไรจะจบปัญหาเรื่องกล่อง เรื่องแทรคกิ้ง เรื่องกรุ๊ปเข้าชิปเม้น"*
 *
 * ── ทำไมยังเหลือ ─────────────────────────────────────────────────────────
 * cron self-heal (planResidueAbsorb · 2026-07-18) กันครอบครัว **billed/settled ทุกแบบ**
 * ไว้โดยตั้งใจ — ห้ามแตะเงินที่จบแล้ว → ครอบครัวที่บิลก่อนยุค box-split จอดค้างรอเคาะ.
 * แถวนี้ (52047) ถูก flag ไว้ใน data-health ตั้งแต่ 2026-07-18 ว่า "ลบแถวรวม = เคาะ manual"
 * → วันนี้ owner เคาะแล้ว.
 *
 * ── เคสที่สคริปต์นี้แตะ (แคบมาก · fail-CLOSED ทุกทาง) ────────────────────
 * bare (ไม่มี -N ท้าย) ที่:
 *   1. มีพี่น้อง -N/M ครบทุกกล่อง (Σ famount พี่น้อง = famount ของ bare)
 *   2. คิว + กก ของ bare = Σ พี่น้อง (±0.5%) = เป็น aggregate duplicate แท้ๆ
 *   3. ขาย (ftotalprice) = 0  → ลบแล้ว Σ ขายไม่ขยับแม้แต่สตางค์
 *   4. ไม่อยู่บนใบวางบิลใดๆ (tb_forwarder_invoice_item) · ไม่อยู่บนใบเสร็จ (tb_receipt_item)
 *   5. ไม่มีงานคนขับ (tb_forwarder_driver_item) · ไม่มีลูก tb_forwarder_item ที่พี่น้องไม่มี
 * ไม่ผ่านข้อใดข้อหนึ่ง = ข้าม + รายงาน (ห้ามเดา).
 *
 * ── ทำอะไร ──────────────────────────────────────────────────────────────
 * ลบแถว bare + re-point staging (momo_import_tracks.committed_forwarder_id →
 * กล่องแรกของครอบครัว — บทเรียน dangling-ptr: ปล่อยชี้แถวที่ลบ = เครื่องปั๊ม dup รอบหน้า)
 * ผล: ขายเท่าเดิมเป๊ะ · ทุนตู้หายส่วนที่เบิ้ล · จำนวนกล่อง/คิว/กก กลับเป็นความจริง.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=… npx tsx scripts/absorb-billed-bare-residue-2026-07-24.ts          # dry-run
 *   SUPABASE_DB_PASSWORD=… npx tsx scripts/absorb-billed-bare-residue-2026-07-24.ts --apply
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PGPW;

const near = (a: number, b: number, tolPct = 0.005) =>
  Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * tolPct);

type Row = {
  id: number; ftrackingchn: string; userid: string; fcabinetnumber: string | null;
  fstatus: string; famount: number; v: number; w: number; sell: number; cost: number;
};

async function main() {
  if (!PW) throw new Error("ต้องมี SUPABASE_DB_PASSWORD");
  const c = new Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, database: "postgres",
    user: "postgres.yzljakczhwrpbxflnmco", password: PW,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 25000,
  });
  await c.connect();

  // ทุก bare ที่มีพี่น้อง -N (สแกน tb_forwarder ตรงๆ — ไม่พึ่ง box_detail)
  const { rows } = await c.query<Row>(`
    select b.id, b.ftrackingchn, b.userid, b.fcabinetnumber, b.fstatus,
           coalesce(b.famount,'0')::numeric famount,
           coalesce(b.fvolume,'0')::numeric v, coalesce(b.fweight,'0')::numeric w,
           coalesce(b.ftotalprice,'0')::numeric sell, coalesce(b.fcosttotalprice,'0')::numeric cost
    from tb_forwarder b
    where b.ftrackingchn !~ '-[0-9]+(/[0-9]+)?$'
      and exists (select 1 from tb_forwarder s
                   where s.userid = b.userid and s.id <> b.id
                     and s.ftrackingchn ~ ('^' || b.ftrackingchn || '-[0-9]+(/[0-9]+)?$'))`);

  const fixes: Array<{ bare: Row; anchorId: number; sibs: Row[]; stagingIds: string[] }> = [];
  const skips: Array<{ tr: string; id: number; เหตุผล: string }> = [];

  for (const bare of rows) {
    const { rows: sibs } = await c.query<Row>(`
      select id, ftrackingchn, userid, fcabinetnumber, fstatus,
             coalesce(famount,'0')::numeric famount,
             coalesce(fvolume,'0')::numeric v, coalesce(fweight,'0')::numeric w,
             coalesce(ftotalprice,'0')::numeric sell, coalesce(fcosttotalprice,'0')::numeric cost
      from tb_forwarder
      where userid = $1 and ftrackingchn ~ ('^' || $2 || '-[0-9]+(/[0-9]+)?$')
      order by ftrackingchn`, [bare.userid, bare.ftrackingchn]);

    const sV = sibs.reduce((s, x) => s + Number(x.v), 0);
    const sW = sibs.reduce((s, x) => s + Number(x.w), 0);
    const sN = sibs.reduce((s, x) => s + Number(x.famount), 0);

    // guard 1+2 — aggregate duplicate แท้ๆ เท่านั้น (disjoint-lots ตกข้อนี้ = ถูกข้าม ✓)
    if (!(near(Number(bare.v), sV) && near(Number(bare.w), sW))) {
      skips.push({ tr: bare.ftrackingchn, id: bare.id, เหตุผล: `metrics ไม่ = Σ พี่น้อง (bare ${bare.v}/${bare.w} vs Σ ${sV.toFixed(6)}/${sW.toFixed(2)}) — อาจเป็น disjoint-lots` });
      continue;
    }
    if (sN > 0 && Number(bare.famount) > 0 && Number(bare.famount) !== sN) {
      skips.push({ tr: bare.ftrackingchn, id: bare.id, เหตุผล: `กล่อง bare ${bare.famount} ≠ Σ พี่น้อง ${sN} — พี่น้องอาจยังมาไม่ครบ` });
      continue;
    }
    // guard 3 — ขายต้องเป็น 0 (ลบแล้วเงินขายไม่ขยับ)
    if (Number(bare.sell) !== 0) {
      skips.push({ tr: bare.ftrackingchn, id: bare.id, เหตุผล: `bare มีขาย ฿${bare.sell} — ต้องใช้ absorb เต็มรูป ไม่ใช่ลบ` });
      continue;
    }
    // guard 4 — ต้องไม่อยู่บนใบวางบิล/ใบเสร็จ
    const inv = await c.query(`select 1 from tb_forwarder_invoice_item where forwarder_id = $1 limit 1`, [bare.id]);
    if (inv.rowCount) { skips.push({ tr: bare.ftrackingchn, id: bare.id, เหตุผล: "อยู่บนใบวางบิล" }); continue; }
    const rc = await c.query(`select 1 from tb_receipt_item where fid::text = $1 limit 1`, [String(bare.id)]).catch(() => ({ rowCount: 0 }));
    if (rc.rowCount) { skips.push({ tr: bare.ftrackingchn, id: bare.id, เหตุผล: "อยู่บนใบเสร็จ" }); continue; }
    // งานคนขับ/receipt อ้างได้ — เราไม่ลบแถว แค่ล้างเลข (แถวคงอยู่ reference ไม่พัง)
    const anchorId = sibs[0]!.id;
    fixes.push({ bare, anchorId, sibs, stagingIds: [] });
  }

  console.log(`\nbare ที่มีพี่น้อง -N ทั้งระบบ = ${rows.length}`);
  console.log(`🔴 aggregate duplicate ลบได้ปลอดภัย = ${fixes.length}`);
  console.log(`⚪ ข้าม (fail-closed) = ${skips.length}\n`);
  console.table(fixes.map((f) => ({
    fid: f.bare.id, tracking: f.bare.ftrackingchn, PR: f.bare.userid, ตู้: f.bare.fcabinetnumber,
    st: f.bare.fstatus, กล่องเบิ้ล: Number(f.bare.famount), คิวเบิ้ล: Number(f.bare.v),
    กกเบิ้ล: Number(f.bare.w), ทุนเบิ้ล: Number(f.bare.cost), ขาย: Number(f.bare.sell),
    "staging→": f.stagingIds.length, พี่น้อง: f.sibs.length,
  })));
  if (skips.length) { console.log("⚪ ข้าม:"); console.table(skips); }

  const costRemoved = fixes.reduce((s, f) => s + Number(f.bare.cost), 0);
  console.log(`\nผลรวมถ้า apply: ทุนที่เบิ้ลหายไป ฿${costRemoved.toFixed(2)} · ขายขยับ ฿0.00 (ทุกแถว sell=0)`);

  if (!APPLY) { console.log("\n🟡 DRY-RUN — ใส่ --apply เพื่อลงมือจริง"); await c.end(); return; }

  const stamp = Date.now();
  const backupPath = `scripts/_backup-billed-bare-residue-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify({ at: new Date(stamp).toISOString(), fixes, skips }, null, 2));
  console.log(`💾 backup → ${backupPath}`);

  await c.query("BEGIN");
  try {
    for (const f of fixes) {
      // ล้างเลขของ bare ให้เป็น 0 ทั้งชุด (กล่อง/คิว/กก/ทุน) — sell เป็น 0 อยู่แล้ว (guard 3)
      // display SOT (countableGroupMembers · isMomoBillHeader) จะตัด header เปล่าออกจากทุก Σ เอง
      // guard ซ้ำระดับ SQL: ยังต้อง sell=0 อยู่ ณ วินาทีเขียน
      const r = await c.query(
        `update tb_forwarder
            set famount = '0', fvolume = '0', fweight = '0', fcosttotalprice = '0'
          where id = $1 and coalesce(ftotalprice,'0')::numeric = 0`, [f.bare.id]);
      if (r.rowCount !== 1) throw new Error(`ล้าง ${f.bare.ftrackingchn} (#${f.bare.id}) ไม่ได้ — sell เปลี่ยนระหว่างรัน?`);
    }
    await c.query("COMMIT");
    console.log(`\n✅ APPLIED — ล้างแถวรวมเบิ้ล ${fixes.length} แถว (เหลือ header เปล่า) · ทุนเบิ้ลหาย ฿${costRemoved.toFixed(2)} · ขายไม่ขยับ`);
  } catch (err) {
    await c.query("ROLLBACK");
    console.error("❌ ROLLBACK:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
  await c.end();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
