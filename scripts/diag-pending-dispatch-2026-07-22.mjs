/**
 * diag-pending-dispatch-2026-07-22.mjs  (READ-ONLY)
 * owner/ภูม 2026-07-22: บนแท็บ "สำเร็จ" มีแถว fstatus=6 (เตรียมส่ง) ที่จริงส่งไปแล้ว
 * แต่พนักงานโกดังไม่ได้กดมอบงานคนขับ → ค้างที่ 6. ดูขอบเขตก่อน (แยกตู้/ขนส่ง/paid).
 */
import pg from "pg";

const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("ต้องส่ง SUPABASE_DB_PASSWORD"); process.exit(1); }

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const SHIP = { PCS: "รับเองโกดัง", PCSF: "เหมาๆ(PCSF)", PRF: "เหมาๆ(PRF)", PCSE: "Express(PCSE)", PRE: "Express(PRE)", "2": "Flash", "24": "J&T", "11": "ไปรษณีย์", "4": "J&T(4)" };
const selfPickup = new Set(["PCS", "2", "4"]);
const label = (k) => SHIP[k] || (k ? k : "(ว่าง)");

const { rows: six } = await c.query(
  `select id, fcabinetnumber, ftrackingchn, userid, coalesce(fshipby,'') fshipby,
          coalesce(paydeposit,'') paydeposit, coalesce(ftotalprice,0)::float ftotalprice
   from tb_forwarder where fstatus = '6' order by fcabinetnumber, id`);
console.log("รวม fstatus=6 (เตรียมส่ง) =", six.length, "แถว");

const ids = six.map((r) => Number(r.id));
const inOpenBatch = new Set();
if (ids.length) {
  const { rows: openItems } = await c.query(
    `select di.fid from tb_forwarder_driver_item di join tb_forwarder_driver d on d.id=di.fdid
     where di.fid = any($1) and (di.fdistatus in ('','1') or di.fdistatus is null) and d.fdstatus = '1'`, [ids]);
  for (const r of openItems) inOpenBatch.add(Number(r.fid));
}

// which customers are VIP-team (earn-trigger money exposure)
const userids = [...new Set(six.map((r) => r.userid).filter(Boolean))];
const vipCoids = new Set(["THADA.VIP", "SIN.VIP", "OOAEOM.VIP", "SWAN"]);
const vipUsers = new Set();
if (userids.length) {
  const { rows: us } = await c.query(`select "userID" as userid, coalesce("coID",'') coid from tb_users where "userID" = any($1)`, [userids]);
  for (const u of us) if (vipCoids.has(u.coid)) vipUsers.add(u.userid);
}

const byCab = new Map();
for (const r of six) { const k = r.fcabinetnumber || "(ไม่มีตู้)"; if (!byCab.has(k)) byCab.set(k, []); byCab.get(k).push(r); }

console.log("\n=== แยกตามตู้ ===");
let totSelf = 0, totDriver = 0, totPaydep = 0, totOpen = 0, totVip = 0;
for (const [cab, rows] of [...byCab.entries()].sort()) {
  let self = 0, driver = 0, paydep = 0, open = 0, vip = 0;
  const carriers = new Map();
  for (const r of rows) {
    carriers.set(r.fshipby, (carriers.get(r.fshipby) ?? 0) + 1);
    if (vipUsers.has(r.userid)) vip++;
    if (inOpenBatch.has(Number(r.id))) { open++; continue; }
    if (r.paydeposit === "1") { paydep++; continue; }
    if (selfPickup.has(r.fshipby)) self++; else driver++;
  }
  totSelf += self; totDriver += driver; totPaydep += paydep; totOpen += open; totVip += vip;
  const carrierStr = [...carriers.entries()].map(([k, v]) => `${label(k)}×${v}`).join(" · ");
  console.log(`  ${cab}: ${rows.length} แถว [${carrierStr}] → ปิดได้: รับเอง ${self} · คนขับ ${driver}${paydep ? ` · credit ${paydep}` : ""}${open ? ` · รอบเปิด ${open}` : ""}${vip ? ` · 🟡VIP ${vip}` : ""}`);
}
console.log(`\nสรุปปิดได้: รับเองโกดัง ${totSelf} · ต้องมอบคนขับ ${totDriver} · credit(paydeposit=1) ${totPaydep} · อยู่ในรอบเปิด ${totOpen} · VIP-team(มี commission) ${totVip}`);
await c.end();
