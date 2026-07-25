/**
 * READ-ONLY (rollback) — ทดสอบ "กดนำเข้าระบบ" จริงกับ schema prod ทุกเคส
 * โดย INSERT แล้ว ROLLBACK เสมอ (ไม่มีข้อมูลค้าง ไม่มีเลขงานถูกกิน).
 *
 * เหตุ: 2026-07-25 เขียน fimages=null ทับคอลัมน์ NOT NULL → พนักงานกดนำเข้าไม่ได้ทั้งหน้า
 * (tsc/lint/build เขียวหมด — ไม่มี gate ไหนเห็น constraint ของ DB).
 * ตัวนี้คือ gate ที่เห็น: ยิงชุดคอลัมน์จริงของ commitMomoRowCore ลง prod แล้ว rollback.
 *
 * RUN: SUPABASE_DB_PASSWORD='…' ./node_modules/.bin/tsx scripts/verify-momo-commit-insert-2026-07-25.ts
 */
import pg from "pg";

const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

/** ค่าที่ commitMomoRowCore เขียนจริง (ยกมาจาก source · ตัวแปร = ค่าที่เป็นไปได้จริง). */
function payload(over: Record<string, unknown>): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return {
    // core identity
    ftrackingchn: "TESTROLLBACK001", famount: 1, fdate: nowIso, userid: "PR594",
    fshipby: "PCS", ftransporttype: "2", adminidcreator: "sys-test", subuserid: "",
    paymethod: "1", fusercompany: "0", priceother: 0, fwarehousename: "8",
    fdatestatus2: null, fdatestatus3: null, fcosttotalpricesheet: 0, fstatus: "2",
    // address
    faddressname: "ทดสอบ", faddresslastname: "ระบบ", faddressno: "1",
    faddresssubdistrict: "-", faddressdistrict: "-", faddressprovince: "กรุงเทพมหานคร",
    faddresszipcode: "10240", faddressnote: "", faddresstel: "0800000000", faddresstel2: "",
    // metrics
    fdatetothai: null, fweight: 31.5, fwidth: 70, flength: 36, fheight: 40, fvolume: 0.1008,
    ftransportprice: 0, fwarehousechina: "1", fproductstype: "1", fdiscount: 0,
    // cabinet + cost defaults
    crate: "2", pricecrate: 0, ftransportpricechnthb: 0, pricemore: "0", customrate: "0",
    frefrate: 0, frefprice: "0", ftotalprice: 0, customratekg: 0, customratecbm: 0,
    fcabinetnumber: "", fdatecontainerclose: null, fidorco: null, famountcount: 1, smpcs: null,
    // NOT NULL defaults
    fdetail: "", paydeposit: "0", ftrackingth: "-", ffreeshipping: "0",
    fnote: null, fnoteuser: "0", fnoteuserread: "0",
    fcover: "", fimages: "[]",
    fphotoend: "", fpallet: null, fstatuscaron: "0", fstatuscaradminon: "",
    fstatuscaroff: "0", fstatuscaradminoff: "", printstatus1: "0", printstatus2: "0",
    printstatus3: "0", printstatus4: "0", ftrackingchn2: "", fproductstype2: "",
    ftransportpricesum: "0", faddresslatitude: 0, faddresslongitude: 0,
    adminid: "", adminidkey: "", adminidupdate: "", session: "", reforder: "",
    fcredit: "", fsendsms1day: "0", fsendsms3day: "0", fsendsms3eday: "0",
    fqc: "0", fqcprice: 0, linkapiorder: "0",
    fcostrefrate: 0, fpriceupdate: 0, fcosttotalprice: 0,
    fprofittransportchn: 0, fprofitpriceupdate: 0, fprofittotal: 0,
    ...over,
  };
}

const CASES: Array<{ name: string; over: Record<string, unknown> }> = [
  { name: "เคสปกติ — ยังไม่มีตู้ · ไม่มีรูปเพิ่ม", over: {} },
  { name: "มีตู้จริง + สถานะกำลังส่งมาไทย", over: { fcabinetnumber: "GZS260720-1", fstatus: "3", fdatecontainerclose: "2026-07-25", fdatetothai: "2026-08-08" } },
  { name: "มีรูปที่แอดมินเพิ่ม (fimages เป็น JSON array)", over: { fimages: JSON.stringify(["admin/momo-staging/x/1.jpg", "admin/momo-staging/x/2.jpg"]), fcover: "admin/momo-staging/x/1.jpg" } },
  { name: "กรอก Product/Rem จาก docs (ยาวสุดที่ action ยอม)", over: { fdetail: "ก".repeat(300), fnote: "ข".repeat(500) } },
  { name: "ที่อยู่ยังไม่มี (ลูกค้าใหม่ · EMPTY_ADDRESS)", over: { faddressname: "", faddresslastname: "", faddressno: "", faddresssubdistrict: "", faddressdistrict: "", faddressprovince: "", faddresszipcode: "", faddresstel: "" } },
  { name: "เลขแทรคยาวสุด 50 + PR ยาวสุด 10", over: { ftrackingchn: "T".repeat(50), userid: "PR12345678" } },
  { name: "ค่าตีลังไม้ + ประเภทพิเศษ (เงิน)", over: { crate: "1", pricecrate: 1500, fproductstype: "4" } },
  { name: "🔴 regression: fimages=null (บั๊กที่เจอ) — ต้องพัง", over: { fimages: null } },
];

async function main() {
  const c = new pg.Client({
    connectionString: `postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(PW!)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const results: Array<{ เคส: string; ผล: string }> = [];

  for (const cs of CASES) {
    const p = payload(cs.over);
    const cols = Object.keys(p);
    const sql = `INSERT INTO tb_forwarder (${cols.map((k) => `"${k}"`).join(",")})
                 VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`;
    await c.query("BEGIN");
    try {
      await c.query(sql, cols.map((k) => p[k]));
      results.push({ เคส: cs.name, ผล: "✅ ผ่าน" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ เคส: cs.name, ผล: `❌ ${msg.slice(0, 90)}` });
    } finally {
      await c.query("ROLLBACK"); // ไม่มีข้อมูลค้างเสมอ
    }
  }

  console.table(results);
  const { rows } = await c.query(`SELECT count(*)::int n FROM tb_forwarder WHERE ftrackingchn LIKE 'TESTROLLBACK%' OR ftrackingchn = $1`, ["T".repeat(50)]);
  console.log(`ยืนยันไม่มีข้อมูลค้างจากเทส: ${rows[0].n} แถว (ต้องเป็น 0)`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
