/**
 * backfill-blank-carrier-from-history-2026-07-21.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-07-21: *"ไล่เช็คออเดอร์ที่ยังไม่มีค่าส่งและขนส่งในระบบทั้งหมด ให้ดูประวัติงาน
 * และแทรคกิ้งใกล้เคียง ให้ fill ค่าที่ว่างทั้งหมด แล้วหลังจากนี้ก็ยึดตามงานล่าสุดของ PR
 * นั้นๆ … งานไหนที่ไม่เคยมีประวัติอะไรเลย … ก็ค่อยให้ CS มาใส่อีกที"*
 *
 * เติม `fshipby` ที่ว่างจาก **ขนส่งที่ลูกค้าคนนั้นใช้ล่าสุด** + วิธีเก็บเงิน/ค่าส่งไทย
 * ตามกติกากลาง (เอกชน = ปลายทาง ค่าส่งไทย ฿0 · เหมาๆ/รับเอง = ต้นทาง ฿0 เพราะค่า ฿100
 * คิดครั้งเดียวที่ anchor).
 *
 * GUARDS (fail-closed):
 *   • เฉพาะ fstatus 1-5 · ข้าม paydeposit='1' (วางบิลล่วงหน้าที่จ่ายแล้ว) · ข้ามแถวที่อยู่
 *     บนใบวางบิลที่ยัง live · ข้ามแถวที่มีใบเสร็จ
 *   • ขนส่ง "เอกชน" ต้องให้บริการจังหวัดปลายทางจริง (ลิสต์ปิด · carrier-coverage-guard)
 *     ไม่ผ่าน = ข้าม ให้ CS เลือกเอง (ห้ามยัดขนส่งที่ไม่วิ่งจังหวัดนั้น)
 *   • ลูกค้าที่ไม่เคยมีประวัติ = ไม่แตะเลย (owner: ให้ CS/ลูกค้าตั้งเอง)
 *   • ไม่แตะ PRE/PCSE (ค่าส่งด่วนคิดจากคิว — คนตั้ง ไม่ใช่ระบบเดา)
 *   • dry-run เป็นค่าเริ่มต้น + backup JSON ก่อน --apply
 *
 * RUN: npx tsx scripts/backfill-blank-carrier-from-history-2026-07-21.ts [--apply]
 */
import pg from "pg";
import fs from "node:fs";
import { isOwnFleetCarrier } from "../lib/forwarder/carrier-coverage-guard";
import { isMaoCarrier } from "../lib/forwarder/mao-fee";
import { derivePayMethod } from "../lib/forwarder/pay-method";
import { carriersForProvince, canonicalProvince } from "../lib/forwarder/carrier-province-coverage";

type Row = {
  id: number; userid: string; ftrackingchn: string; fstatus: string;
  faddressprovince: string | null; ftransportprice: string | number | null;
};

async function main() {
  const APPLY = process.argv.includes("--apply");
  const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PGPW;
  if (!PW) { console.error("missing SUPABASE_DB_PASSWORD / PGPW"); process.exit(1); }
  const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres", ssl: { rejectUnauthorized: false } });
  await c.connect();

  const blanks = (await c.query<Row>(`
    select f.id, f.userid, f.ftrackingchn, f.fstatus, f.faddressprovince, f.ftransportprice
    from tb_forwarder f
    where coalesce(btrim(f.fshipby),'') = ''
      and f.fstatus in ('1','2','3','4','5')
      and coalesce(f.paydeposit,'') <> '1'
      and not exists (select 1 from tb_forwarder_invoice_item ii
            join tb_forwarder_invoice i on i.id = ii.invoice_id
            where ii.forwarder_id = f.id and i.status <> 'cancelled')
      and not exists (select 1 from tb_receipt_item ri where ri.fid = f.id)
    order by f.userid, f.id`)).rows;

  // ขนส่งล่าสุดต่อลูกค้า (ข้ามแถวว่าง) — "ยึดตามงานล่าสุดของ PR นั้นๆ"
  const latest = new Map<string, string>();
  for (const uid of [...new Set(blanks.map((b) => b.userid))]) {
    const r = await c.query<{ fshipby: string }>(
      `select fshipby from tb_forwarder where userid=$1 and coalesce(btrim(fshipby),'')<>''
       and fstatus not in ('','0','99') order by id desc limit 1`, [uid]);
    if (r.rows[0]?.fshipby) latest.set(uid, r.rows[0].fshipby.trim());
  }

  const plan: { id: number; userid: string; carrier: string; payMethod: string; price: number }[] = [];
  const skipped: { id: number; userid: string; why: string }[] = [];
  for (const b of blanks) {
    const carrier = latest.get(b.userid);
    if (!carrier) { skipped.push({ id: b.id, userid: b.userid, why: "ไม่มีประวัติขนส่ง → CS/ลูกค้าตั้งเอง" }); continue; }
    if (carrier === "PCSE" || carrier === "PRE") { skipped.push({ id: b.id, userid: b.userid, why: "ด่วน (PRE) ค่าส่งคิดจากคิว → คนตั้ง" }); continue; }
    // เอกชน: ต้องวิ่งจังหวัดนั้นจริง
    if (!isOwnFleetCarrier(carrier)) {
      const prov = canonicalProvince(b.faddressprovince);
      if (!prov) { skipped.push({ id: b.id, userid: b.userid, why: "ยังไม่มีจังหวัดปลายทาง → ตรวจสิทธิ์ขนส่งไม่ได้" }); continue; }
      if (!carriersForProvince(prov).some((x) => x.code === carrier)) {
        skipped.push({ id: b.id, userid: b.userid, why: `ขนส่ง ${carrier} ไม่วิ่ง ${prov}` }); continue;
      }
    }
    const payMethod = derivePayMethod(carrier);
    // ค่าส่งไทย: ปลายทาง = 0 (ลูกค้าจ่ายที่ปลายทาง) · เหมาๆ/รับเอง = 0 (฿100 อยู่ที่ anchor)
    const price = payMethod === "2" || isMaoCarrier(carrier) || carrier === "PCS" ? 0 : Number(b.ftransportprice ?? 0) || 0;
    plan.push({ id: b.id, userid: b.userid, carrier, payMethod, price });
  }

  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — งานที่ยังไม่มีขนส่ง ${blanks.length} แถว`);
  console.log(`  เติมได้ ${plan.length} แถว · ข้าม ${skipped.length} แถว`);
  const byCarrier = new Map<string, number>();
  for (const p of plan) byCarrier.set(p.carrier, (byCarrier.get(p.carrier) ?? 0) + 1);
  console.log("  แยกตามขนส่งที่จะเติม:", JSON.stringify(Object.fromEntries(byCarrier)));
  const byWhy = new Map<string, number>();
  for (const s of skipped) byWhy.set(s.why, (byWhy.get(s.why) ?? 0) + 1);
  console.log("  เหตุที่ข้าม:", JSON.stringify(Object.fromEntries(byWhy)));

  if (!APPLY || plan.length === 0) { await c.end(); return; }

  const backup = `scripts/_backup-blank-carrier-${Date.now()}.json`;
  fs.writeFileSync(backup, JSON.stringify({ blanks, plan, skipped }, null, 1), "utf8");
  console.log("backup →", backup);

  await c.query("begin");
  try {
    let n = 0;
    for (const p of plan) {
      const r = await c.query(
        `update tb_forwarder set fshipby=$2, paymethod=$3, ftransportprice=$4, adminidupdate='fill-hist'
         where id=$1 and coalesce(btrim(fshipby),'')='' and fstatus in ('1','2','3','4','5')`,
        [p.id, p.carrier, p.payMethod, p.price]);
      n += r.rowCount ?? 0;
    }
    await c.query("commit");
    console.log(`APPLIED — ${n} แถว`);
  } catch (e) {
    await c.query("rollback");
    console.error("ROLLED BACK:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
  const left = await c.query(`select count(*)::int n from tb_forwarder
    where coalesce(btrim(fshipby),'')='' and fstatus in ('1','2','3','4','5')`);
  console.log("เหลือว่าง (รอ CS):", left.rows[0].n);
  await c.end();
}
main();
