/**
 * seed-dev-directslip-fixture.mjs — DEV-ONLY · add a clean DIRECT-SLIP fixture
 * (#900004) so the /admin/wallet/[id] slip→receipt loop (doc-number panel +
 * receipt issuance at approve) is demonstrable hands-on. Reuses PR032 F52065
 * (the only clean PR032 forwarder), prepped to a demo amount.
 *   revert: --revert --apply (restores F52065, deletes #900004 + slip)
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply"), REVERT = process.argv.includes("--revert");
const ref = (URL||"").replace(/^https?:\/\//,"").split(".")[0];
if (ref !== "lozntlidlqqzzcaathnm") { console.error(`🔴 REFUSE: ref="${ref}" is not dev`); process.exit(1); }
const H = { apikey: KEY, Authorization:`Bearer ${KEY}`, "Content-Type":"application/json" };
async function rest(p, init={}) { const r = await fetch(`${URL}/rest/v1/${p}`, {...init, headers:{...H, ...(init.headers??{})}}); const t = await r.text(); if(!r.ok) throw new Error(`${r.status} ${p} → ${t.slice(0,300)}`); return t?JSON.parse(t):null; }

const FID=52065, WHID=900004, USER="PR032", AMOUNT=3719.54;
const SLIP=`admin/wallet-hs/${USER}/dev-directslip-slip.svg`;
const BK="scripts/_backup-dev-directslip-fixture.json";

if (REVERT) {
  if (!existsSync(BK)) { console.error("no backup"); process.exit(1); }
  const b = JSON.parse(readFileSync(BK,"utf8")).forwarder_before;
  console.log("REVERT plan: delete #900004 + slip · restore F52065", JSON.stringify(b));
  if (!APPLY) { console.log("(dry-run · --apply)"); process.exit(0); }
  await rest(`tb_wallet_hs?id=eq.${WHID}`, { method:"DELETE" });
  await fetch(`${URL}/storage/v1/object/slips/${SLIP}`, { method:"DELETE", headers:{apikey:KEY,Authorization:`Bearer ${KEY}`} });
  await rest(`tb_forwarder?id=eq.${FID}`, { method:"PATCH", body: JSON.stringify(b) });
  console.log("✅ reverted"); process.exit(0);
}

const before = (await rest(`tb_forwarder?id=eq.${FID}&select=id,ftotalprice,ftransportprice,fpriceupdate,fshippingservice,pricecrate,ftransportpricechnthb,priceother,fdiscount,fstatus,tax_doc_pref`))?.[0];
console.log("plan:");
console.log(`  BACKUP F${FID} → ${BK}`);
console.log(`  PREP   F${FID}: ftotalprice ${before?.ftotalprice} → ${AMOUNT} · adjustments → 0 · fstatus → 5 · tax_doc_pref → receipt`);
console.log(`  UPLOAD slips/${SLIP}`);
console.log(`  INSERT tb_wallet_hs #${WHID}  type='4' typeservice='2' status='1' reforder='${FID}' (NO paydeposit → DIRECT-SLIP)`);
console.log(`  page → http://localhost:3000/admin/wallet/${WHID}`);
if (!APPLY) { console.log("\n(dry-run · --apply)"); process.exit(0); }
if (!existsSync(BK)) writeFileSync(BK, JSON.stringify({ ref, at:"2026-07-15", forwarder_before: before }, null, 2));

await rest(`tb_forwarder?id=eq.${FID}`, { method:"PATCH", body: JSON.stringify({
  ftotalprice: AMOUNT, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0,
  pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0, fstatus: "5", tax_doc_pref: "receipt",
}) });

const slip = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="640" viewBox="0 0 420 640" font-family="system-ui,sans-serif"><rect width="420" height="640" fill="#fff"/><rect width="420" height="110" fill="#0f9d58"/><text x="24" y="44" fill="#fff" font-size="18" font-weight="700">KASIKORNBANK</text><text x="24" y="68" fill="#d7f5e3" font-size="12">K PLUS · หลักฐานการโอนเงิน</text><text x="24" y="94" fill="#fff" font-size="14" font-weight="600">โอนเงินสำเร็จ</text><text x="24" y="150" fill="#6b7280" font-size="11">วันที่ / เวลา</text><text x="24" y="170" fill="#111827" font-size="14" font-weight="600">15 ก.ค. 2569 - 10:00</text><text x="24" y="204" fill="#6b7280" font-size="11">รหัสอ้างอิง</text><text x="24" y="224" fill="#111827" font-size="13" font-family="monospace">DEVFIXTURE0000000004</text><text x="24" y="270" fill="#6b7280" font-size="11">จาก</text><text x="24" y="291" fill="#111827" font-size="14" font-weight="600">ตุ๋ยสโตร์ คาร์โก้ (PR032)</text><text x="24" y="330" fill="#6b7280" font-size="11">ไปยัง</text><text x="24" y="351" fill="#111827" font-size="14" font-weight="600">บจก. แพคเรด (ประเทศไทย)</text><text x="24" y="371" fill="#6b7280" font-size="12" font-family="monospace">225-2-91144-0</text><text x="24" y="420" fill="#6b7280" font-size="11">จำนวนเงิน (จ่ายค่าฝากนำเข้า F${FID})</text><text x="396" y="432" fill="#111827" font-size="28" font-weight="700" text-anchor="end">${AMOUNT.toLocaleString("en-US",{minimumFractionDigits:2})}</text><rect x="0" y="566" width="420" height="74" fill="#fef2f2"/><text x="210" y="596" fill="#b91c1c" font-size="13" font-weight="700" text-anchor="middle">⚠ DEV FIXTURE — ไม่ใช่สลิปจริง</text><text x="210" y="618" fill="#dc2626" font-size="10" text-anchor="middle">direct-slip · จ่ายค่าฝากนำเข้า → ออกใบเสร็จ</text><text x="210" y="340" fill="#ef4444" font-size="42" font-weight="800" text-anchor="middle" opacity="0.12" transform="rotate(-28 210 340)">DEV FIXTURE</text></svg>`;
const up = await fetch(`${URL}/storage/v1/object/slips/${SLIP}`, { method:"POST", headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,"Content-Type":"image/svg+xml","x-upsert":"true"}, body: slip });
if (!up.ok) throw new Error(`slip upload: ${up.status} ${await up.text()}`);

await rest(`tb_wallet_paydeposit?whid=eq.${WHID}`, { method:"DELETE" });
await rest(`tb_wallet_hs?id=eq.${WHID}`, { method:"DELETE" });
await rest("tb_wallet_hs", { method:"POST", headers:{Prefer:"return=minimal"}, body: JSON.stringify({
  id: WHID, date:"2026-07-15T10:00:00", dateslip:null, amount:AMOUNT, status:"1", type:"4", typenew:"1", typeservice:"2",
  paydeposit:"0", imagesslip:SLIP, depositnamebank:"กสิกรไทย", nameuserbank:"บจก. แพคเรด (ประเทศไทย)", nouserbank:"225-2-91144-0",
  note:"", adminid:"admin_web", adminidupdate:null, session:"dev-fixture", reforder:String(FID), reforder2:null, whno:"", wusercredit:"0", userid:USER, adminidcrate:"admin_web",
}) });
console.log(`\n✅ done · #${WHID} direct-slip → F${FID} · http://localhost:3000/admin/wallet/${WHID}`);
