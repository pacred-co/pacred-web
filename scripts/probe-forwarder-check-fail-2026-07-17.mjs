// READ-ONLY probe — งานข้อ 5: "แจ้งชำระเงินสำเร็จ 0 · ผิดพลาด 8"
// จำลอง guard ของ adminCallPriceUser ทีละแถว เพื่อหา "เหตุผลจริง" ของแถวที่ถูกข้าม
//   node scripts/probe-forwarder-check-fail-2026-07-17.mjs
import pg from "pg";
const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// คิวตรวจสอบทั้งหมด + ข้อมูลที่ guard ใช้
const { rows } = await c.query(`
  SELECT cf."fID"                AS qfid,
         cf."date"              AS queued_at,
         cf."adminID"           AS queued_by,
         f.id, f.userid, f.fstatus, f.ftrackingchn, f.fcabinetnumber,
         f.fshipby, f.paymethod, f.faddressdistrict, f.faddresszipcode,
         f.ftotalprice, f.ftransportprice, f.fweight, f.fvolume,
         f.fwidth, f.flength, f.fheight,
         u."userName", u."userLastName", u."userCredit", u."userCompany"
    FROM tb_check_forwarder cf
    LEFT JOIN tb_forwarder f ON f.id = cf."fID"
    LEFT JOIN tb_users u ON u."userID" = f.userid
   ORDER BY cf."date" DESC NULLS LAST
   LIMIT 500`);

console.log(`\n════════ คิวตรวจสอบ tb_check_forwarder: ${rows.length} แถว ════════`);

// mirror lib/forwarder/domestic-shipping.ts
const MAO = new Set(["PCSF", "PRF"]);
const isMao = (s) => MAO.has((s ?? "").trim().toUpperCase());
const baseTracking = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");

const codBases = new Set();
for (const r of rows) {
  if ((r.paymethod ?? "").toString().trim() === "2") {
    const b = baseTracking(r.ftrackingchn);
    if (b) codBases.add(b);
  }
}

const buckets = { ok: [], zeroPrice: [], noThShip: [], notStatus4: [], noRow: [] };

for (const r of rows) {
  if (!r.id) { buckets.noRow.push(r); continue; }
  // ⚠️ action อ่านเฉพาะ fstatus='4' — แถวอื่น "หายเงียบ" ไม่ถูกนับเลย
  if (String(r.fstatus) !== "4") { buckets.notStatus4.push(r); continue; }
  if ((Number(r.ftotalprice) || 0) <= 0) { buckets.zeroPrice.push(r); continue; }

  const s = (r.fshipby ?? "").trim().toUpperCase();
  const cod = (r.paymethod ?? "").toString().trim() === "2";
  const shipmentIsCod = codBases.has(baseTracking(r.ftrackingchn));
  const required = !(s === "PCS" || isMao(s) || cod || shipmentIsCod);
  const cost = Number(r.ftransportprice);
  if (required && (!Number.isFinite(cost) || cost <= 0)) { buckets.noThShip.push(r); continue; }
  buckets.ok.push(r);
}

const name = (r) => `${r.userid} ${(r.userName ?? "").trim()} ${(r.userLastName ?? "").trim()}`.trim();
const show = (title, arr, extra = () => "") => {
  console.log(`\n── ${title}: ${arr.length} ──`);
  for (const r of arr) {
    console.log(
      `  #${r.id ?? r.qfid} · ${name(r)} · ตู้ ${r.fcabinetnumber ?? "-"} · ${r.ftrackingchn ?? "-"}` +
      ` · fstatus=${r.fstatus} · ค่านำเข้า=${r.ftotalprice} · ขนส่งไทย=${r.ftransportprice}` +
      ` · fshipby=${r.fshipby ?? "-"} · paymethod=${r.paymethod ?? "-"}${extra(r)}`,
    );
  }
};

show("✅ ผ่าน (จะแจ้งชำระได้)", buckets.ok);
show("🔴 C1 ค่านำเข้า ฿0 (ยังไม่ตั้งราคา/วัด)", buckets.zeroPrice);
show("🔴 C2 ยังไม่กรอกค่าส่งไทย", buckets.noThShip,
  (r) => ` · น้ำหนัก=${r.fweight} · กว้างxยาวxสูง=${r.fwidth}x${r.flength}x${r.fheight} · zip=${r.faddresszipcode ?? "-"}`);
show("⚠️ ไม่ใช่สถานะ 4 → action อ่านไม่เจอ = หายเงียบ (ไม่นับทั้ง สำเร็จ/ผิดพลาด)", buckets.notStatus4);
show("⚠️ ไม่มีแถว tb_forwarder (queue orphan)", buckets.noRow);

console.log(`\n════════ สรุป ════════`);
console.log(`  ผ่าน ${buckets.ok.length} · C1 ค่านำเข้า฿0 ${buckets.zeroPrice.length} · C2 ไม่มีค่าส่งไทย ${buckets.noThShip.length} · ไม่ใช่สถานะ4 ${buckets.notStatus4.length} · orphan ${buckets.noRow.length}`);

await c.end();
