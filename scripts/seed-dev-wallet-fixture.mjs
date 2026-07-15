/**
 * seed-dev-wallet-fixture.mjs — DEV-ONLY fixture for /admin/wallet/[id]
 *
 * WHY: the legacy PCS screenshot ปอน is styling against is a **pending**
 * wallet top-up (รอดำเนินการ) — that shape renders the whole right-hand
 * pane (date-picker + "บันทึกวันที่โอน และตรวจสอบรายการซ้ำ" + approve/reject)
 * plus the slip image. The dev DB has:
 *   - 0 rows at status='1'  → the form half never renders
 *   - slip files only on PROD S3 → every slip resolves broken on dev
 *   - tb_wallet balances all ฿0 → the two top cards render ฿0.00
 * so there is nothing on dev that renders the page fully.
 *
 * WHAT: creates ONE clearly-marked fixture row (id 900001) + uploads a
 * watermarked "DEV FIXTURE" slip to the dev `slips` bucket + gives the
 * fixture customer a non-zero wallet/cash-back balance.
 *
 * SAFETY
 *   - REFUSES to run against the prod project ref (hard guard below).
 *   - Dry-run by default. Pass --apply to write.
 *   - Backs up every row it touches to scripts/_backup-dev-wallet-fixture.json
 *   - Pass --revert to undo (restores balances, deletes the fixture row+file).
 *   - The slip is watermarked so it can never be mistaken for a real slip.
 *
 * USAGE
 *   node --env-file=.env.local scripts/seed-dev-wallet-fixture.mjs
 *   node --env-file=.env.local scripts/seed-dev-wallet-fixture.mjs --apply
 *   node --env-file=.env.local scripts/seed-dev-wallet-fixture.mjs --revert --apply
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert");

const PROD_REF = "yzljakczhwrpbxflnmco";
const DEV_REF = "lozntlidlqqzzcaathnm";

const FIXTURE_ID = 900001; // type='1' standalone topup (เติมเงิน)
const FIXTURE_USER = "PR032";
const FIXTURE_AMOUNT = 2742.3;
const SLIP_PATH = `admin/wallet-hs/${FIXTURE_USER}/dev-fixture-slip.svg`;
const BACKUP = "scripts/_backup-dev-wallet-fixture.json";

// ── the "เติม-แล้วจ่าย" PAIR — the real target page ────────────────────
// ปอน is styling "รายการจ่ายค่าฝากนำเข้ากระเป๋าสตางค์" = a type='4' row.
// Legacy pairs it with a funding topup linked via tb_wallet_paydeposit,
// which is what makes the page render BOTH the partner slip AND the
// "รายการนี้มาพร้อมกับรายการชำระเงิน" block. Reproduce that exact shape:
//   900002 type='1' (topup, holds the slip)  ──paydeposit──▶  fwd 52176
//   900003 type='4' (the spend · reforder=52176) ── reverse-join finds 900002
const PAIR_TOPUP_ID = 900002;
const PAIR_SPEND_ID = 900003;
const PAIR_FORWARDER = "52176"; // real PR032 forwarder on dev (X9002717)
const PAIR_AMOUNT = 3719.54; // = that forwarder's ftotalprice → ยอดที่ต้องชำระ ตรงกัน
const PAIR_SLIP_PATH = `admin/wallet-hs/${FIXTURE_USER}/dev-fixture-slip-pair.svg`;

// ── guard: never touch prod ─────────────────────────────────────────────
const ref = (URL ?? "").replace(/^https?:\/\//, "").split(".")[0];
if (!URL || !KEY) {
  console.error("🔴 missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (ref === PROD_REF) {
  console.error("🔴 REFUSING: this is the PROD project. This fixture is DEV-only.");
  process.exit(1);
}
if (ref !== DEV_REF) {
  console.error(`🔴 REFUSING: unknown project ref "${ref}" (expected dev ${DEV_REF}).`);
  process.exit(1);
}
console.log(`DB = ${ref} (DEV) · mode = ${REVERT ? "REVERT" : "SEED"} · ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path} → ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── the fixture slip (watermarked so it can't pass as a real slip) ──────
function slipSvg(amount = FIXTURE_AMOUNT) {
  const amt = amount.toLocaleString("en-US", { minimumFractionDigits: 2 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="720" viewBox="0 0 420 720" font-family="system-ui,'Segoe UI',sans-serif">
  <rect width="420" height="720" fill="#ffffff"/>
  <rect width="420" height="120" fill="#0f9d58"/>
  <text x="24" y="46" fill="#fff" font-size="19" font-weight="700">KASIKORNBANK</text>
  <text x="24" y="72" fill="#d7f5e3" font-size="12">K PLUS · หลักฐานการโอนเงิน</text>
  <text x="24" y="98" fill="#fff" font-size="15" font-weight="600">โอนเงินสำเร็จ</text>
  <circle cx="382" cy="60" r="22" fill="#ffffff" opacity="0.16"/>
  <path d="M372 60 l7 8 l14 -16" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

  <text x="24" y="156" fill="#6b7280" font-size="11">วันที่ / เวลา</text>
  <text x="24" y="176" fill="#111827" font-size="14" font-weight="600">15 ก.ค. 2569 - 09:23</text>

  <text x="24" y="210" fill="#6b7280" font-size="11">รหัสอ้างอิง</text>
  <text x="24" y="230" fill="#111827" font-size="13" font-family="monospace">DEVFIXTURE0000000001</text>

  <line x1="24" y1="252" x2="396" y2="252" stroke="#e5e7eb" stroke-width="1"/>

  <text x="24" y="280" fill="#6b7280" font-size="11">จาก</text>
  <text x="24" y="301" fill="#111827" font-size="14" font-weight="600">ตุ๋ยสโตร์ คาร์โก้</text>
  <text x="24" y="321" fill="#6b7280" font-size="12" font-family="monospace">xxx-x-x1234-5</text>

  <text x="24" y="356" fill="#6b7280" font-size="11">ไปยัง</text>
  <text x="24" y="377" fill="#111827" font-size="14" font-weight="600">บจก. แพคเรด (ประเทศไทย)</text>
  <text x="24" y="397" fill="#6b7280" font-size="12" font-family="monospace">225-2-91144-0</text>

  <line x1="24" y1="420" x2="396" y2="420" stroke="#e5e7eb" stroke-width="1"/>

  <text x="24" y="450" fill="#6b7280" font-size="11">จำนวนเงิน</text>
  <text x="396" y="460" fill="#111827" font-size="30" font-weight="700" text-anchor="end">${amt}</text>
  <text x="396" y="482" fill="#6b7280" font-size="12" text-anchor="end">บาท</text>

  <rect x="24" y="510" width="110" height="110" fill="#f3f4f6" stroke="#d1d5db"/>
  <text x="79" y="570" fill="#9ca3af" font-size="11" text-anchor="middle">QR</text>
  <text x="150" y="546" fill="#6b7280" font-size="11">สแกนเพื่อตรวจสอบ</text>
  <text x="150" y="566" fill="#6b7280" font-size="11">สถานะการโอนเงิน</text>

  <rect x="0" y="646" width="420" height="74" fill="#fef2f2"/>
  <text x="210" y="674" fill="#b91c1c" font-size="13" font-weight="700" text-anchor="middle">⚠ DEV FIXTURE — ไม่ใช่สลิปจริง</text>
  <text x="210" y="696" fill="#dc2626" font-size="11" text-anchor="middle">สร้างโดย scripts/seed-dev-wallet-fixture.mjs</text>
  <text x="210" y="712" fill="#dc2626" font-size="10" text-anchor="middle">สำหรับแต่งหน้าตา UI บน dev เท่านั้น</text>

  <text x="210" y="380" fill="#ef4444" font-size="46" font-weight="800" text-anchor="middle" opacity="0.13" transform="rotate(-28 210 380)">DEV FIXTURE</text>
</svg>`;
}

// ── REVERT ──────────────────────────────────────────────────────────────
if (REVERT) {
  if (!existsSync(BACKUP)) {
    console.error(`🔴 no backup at ${BACKUP} — nothing to revert.`);
    process.exit(1);
  }
  const bk = JSON.parse(readFileSync(BACKUP, "utf8"));
  console.log("plan:");
  console.log(`  DELETE tb_wallet_hs id in (${FIXTURE_ID}, ${PAIR_TOPUP_ID}, ${PAIR_SPEND_ID})`);
  console.log(`  DELETE tb_wallet_paydeposit whid=${PAIR_TOPUP_ID}`);
  console.log(`  DELETE storage slips/${SLIP_PATH} + slips/${PAIR_SLIP_PATH}`);
  console.log(`  RESTORE tb_wallet ${FIXTURE_USER}.wallettotal → ${bk.wallet_before}`);
  console.log(`  RESTORE tb_cash_back ${FIXTURE_USER}.cbtotal → ${bk.cb_before}`);
  if (!APPLY) {
    console.log("\n(dry-run · add --apply to execute)");
    process.exit(0);
  }
  await rest(`tb_wallet_paydeposit?whid=eq.${PAIR_TOPUP_ID}`, { method: "DELETE" });
  await rest(`tb_wallet_hs?id=in.(${FIXTURE_ID},${PAIR_TOPUP_ID},${PAIR_SPEND_ID})`, { method: "DELETE" });
  for (const p of [SLIP_PATH, PAIR_SLIP_PATH]) {
    await fetch(`${URL}/storage/v1/object/slips/${p}`, {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
  }
  await rest(`tb_wallet?userid=eq.${FIXTURE_USER}`, {
    method: "PATCH",
    body: JSON.stringify({ wallettotal: bk.wallet_before }),
  });
  await rest(`tb_cash_back?userid=eq.${FIXTURE_USER}`, {
    method: "PATCH",
    body: JSON.stringify({ cbtotal: bk.cb_before }),
  });
  console.log("\n✅ reverted.");
  process.exit(0);
}

// ── SEED ────────────────────────────────────────────────────────────────
const existing = await rest(`tb_wallet_hs?id=eq.${FIXTURE_ID}&select=id`);
const walletRow = await rest(`tb_wallet?userid=eq.${FIXTURE_USER}&select=userid,wallettotal`);
const cbRow = await rest(`tb_cash_back?userid=eq.${FIXTURE_USER}&select=userid,cbtotal`);

const walletBefore = walletRow?.[0]?.wallettotal ?? 0;
const cbBefore = cbRow?.[0]?.cbtotal ?? 0;

console.log("plan:");
console.log(`  ${existing?.length ? "REPLACE" : "INSERT "} tb_wallet_hs id=${FIXTURE_ID}`);
console.log(`      type='1' (ลูกค้าโอน) · status='1' (รอตรวจสอบ) · dateslip=NULL`);
console.log(`      → unlocks: ปฏิทินเลือกวันโอน + ปุ่มบันทึก/อนุมัติ/ปฏิเสธ + แถบแดง "ยังไม่ได้กรอก"`);
console.log(`      amount=${FIXTURE_AMOUNT} · userid=${FIXTURE_USER}`);
console.log(`  UPLOAD  slips/${SLIP_PATH}  (watermarked DEV FIXTURE slip)`);
console.log(`\n  INSERT  tb_wallet_hs id=${PAIR_TOPUP_ID}  type='1' topup (ถือสลิป) · status='1' · ฿${PAIR_AMOUNT}`);
console.log(`  INSERT  tb_wallet_paydeposit { whid:${PAIR_TOPUP_ID}, hno:'${PAIR_FORWARDER}' }`);
console.log(`  INSERT  tb_wallet_hs id=${PAIR_SPEND_ID}  ★ type='4' จ่ายค่าฝากนำเข้า · status='1' · reforder='${PAIR_FORWARDER}'`);
console.log(`      ★ = หน้าเป้าหมาย "รายการจ่ายค่าฝากนำเข้ากระเป๋าสตางค์"`);
console.log(`      → renders: สลิปจากรายการคู่กัน + "นี่คือการจ่ายค่า F${PAIR_FORWARDER}" + ฟอร์มรออนุมัติ`);
console.log(`  UPLOAD  slips/${PAIR_SLIP_PATH}`);
console.log(`\n  UPDATE  tb_wallet     ${FIXTURE_USER}.wallettotal  ${walletBefore} → 8420.55`);
console.log(`  UPDATE  tb_cash_back  ${FIXTURE_USER}.cbtotal      ${cbBefore} → 128.4`);
console.log(`\n  backup → ${BACKUP}`);
console.log(`  pages  → http://localhost:3000/admin/wallet/${PAIR_SPEND_ID}   ★ type=4 (เป้าหมาย)`);
console.log(`           http://localhost:3000/admin/wallet/${FIXTURE_ID}   type=1 (เติมเงิน)`);

if (!APPLY) {
  console.log("\n(dry-run · add --apply to execute)");
  process.exit(0);
}

// Write the backup ONCE. A re-run reads back the ALREADY-SEEDED balances, so
// overwriting here would bake the fixture values in as "the originals" and the
// revert would restore garbage. First run wins; re-runs keep the true originals.
if (existsSync(BACKUP)) {
  const prev = JSON.parse(readFileSync(BACKUP, "utf8"));
  console.log(`\n✓ backup already exists — keeping the ORIGINAL pre-fixture values`);
  console.log(`    (wallettotal=${prev.wallet_before} · cbtotal=${prev.cb_before})`);
} else {
  writeFileSync(
    BACKUP,
    JSON.stringify(
      { at: "2026-07-15", ref, fixture_id: FIXTURE_ID, userid: FIXTURE_USER, wallet_before: walletBefore, cb_before: cbBefore },
      null,
      2,
    ),
  );
  console.log(`\n✓ backup written → ${BACKUP}`);
}

// 1. slip → dev storage
const up = await fetch(`${URL}/storage/v1/object/slips/${SLIP_PATH}`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "image/svg+xml", "x-upsert": "true" },
  body: slipSvg(),
});
if (!up.ok) throw new Error(`slip upload failed: ${up.status} ${await up.text()}`);
console.log(`✓ slip uploaded → slips/${SLIP_PATH}`);

// 2. fixture row (delete-then-insert so re-runs are idempotent)
await rest(`tb_wallet_hs?id=eq.${FIXTURE_ID}`, { method: "DELETE" });
await rest("tb_wallet_hs", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    id: FIXTURE_ID,
    date: "2026-07-15T09:23:32",
    dateslip: null, // ← the red "(ยังไม่ได้กรอก)" + the date-picker form
    amount: FIXTURE_AMOUNT,
    status: "1", // ← รอตรวจสอบ → renders <ApproveRejectForm>
    type: "1", // ← ลูกค้าโอน → slip expected
    typenew: "1",
    typeservice: "1",
    paydeposit: "0",
    imagesslip: SLIP_PATH,
    depositnamebank: "กสิกรไทย",
    nameuserbank: "บจก. แพคเรด (ประเทศไทย)",
    nouserbank: "225-2-91144-0",
    // Left EMPTY on purpose: `note` is the real หมายเหตุ slot (it carries the
  // reject reason), and a fixture marker here renders as a live note on the
  // page — noise while styling. The slip's own DEV-FIXTURE watermark is what
  // keeps these rows unmistakable.
  note: "",
    adminid: "admin_web",
    adminidupdate: null,
    session: "dev-fixture",
    reforder: "",
    reforder2: null,
    whno: "",
    wusercredit: "0",
    userid: FIXTURE_USER,
    adminidcrate: "admin_web",
  }),
});
console.log(`✓ fixture row inserted → tb_wallet_hs #${FIXTURE_ID}`);

// 3. the "เติม-แล้วจ่าย" PAIR — the type='4' target page
const up2 = await fetch(`${URL}/storage/v1/object/slips/${PAIR_SLIP_PATH}`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "image/svg+xml", "x-upsert": "true" },
  body: slipSvg(PAIR_AMOUNT),
});
if (!up2.ok) throw new Error(`pair slip upload failed: ${up2.status} ${await up2.text()}`);

await rest(`tb_wallet_paydeposit?whid=eq.${PAIR_TOPUP_ID}`, { method: "DELETE" });
await rest(`tb_wallet_hs?id=in.(${PAIR_TOPUP_ID},${PAIR_SPEND_ID})`, { method: "DELETE" });

const pairBase = {
  date: "2026-07-15T09:45:31",
  dateslip: null,
  amount: PAIR_AMOUNT,
  status: "1",
  typenew: "1",
  paydeposit: "0",
  depositnamebank: "กสิกรไทย",
  nameuserbank: "บจก. แพคเรด (ประเทศไทย)",
  nouserbank: "225-2-91144-0",
  // Left EMPTY on purpose: `note` is the real หมายเหตุ slot (it carries the
  // reject reason), and a fixture marker here renders as a live note on the
  // page — noise while styling. The slip's own DEV-FIXTURE watermark is what
  // keeps these rows unmistakable.
  note: "",
  adminid: "admin_web",
  adminidupdate: null,
  session: "dev-fixture",
  reforder2: null,
  whno: "",
  wusercredit: "0",
  userid: FIXTURE_USER,
  adminidcrate: "admin_web",
};

await rest("tb_wallet_hs", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify([
    // the funding topup — holds the slip the type='4' page borrows
    { ...pairBase, id: PAIR_TOPUP_ID, type: "1", typeservice: "1", imagesslip: PAIR_SLIP_PATH, reforder: "" },
    // ★ the target: จ่ายค่าฝากนำเข้า — no own slip (legacy: type 4 never has one)
    { ...pairBase, id: PAIR_SPEND_ID, type: "4", typeservice: "2", imagesslip: null, reforder: PAIR_FORWARDER },
  ]),
});

// the link that makes the reverse-join (spend → funding topup → slip) resolve
await rest("tb_wallet_paydeposit", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({ whid: PAIR_TOPUP_ID, hno: PAIR_FORWARDER }),
});
console.log(`✓ pair inserted → #${PAIR_TOPUP_ID} (topup+slip) ──paydeposit──▶ F${PAIR_FORWARDER} ◀── #${PAIR_SPEND_ID} (type=4 ★)`);

// 4. balances so the two top cards show real digits
await rest(`tb_wallet?userid=eq.${FIXTURE_USER}`, {
  method: "PATCH",
  body: JSON.stringify({ wallettotal: 8420.55 }),
});
await rest(`tb_cash_back?userid=eq.${FIXTURE_USER}`, {
  method: "PATCH",
  body: JSON.stringify({ cbtotal: 128.4 }),
});
console.log(`✓ balances seeded for ${FIXTURE_USER}`);

console.log(`\n✅ done`);
console.log(`   ★ เป้าหมาย (type=4 จ่ายค่าฝากนำเข้า) → http://localhost:3000/admin/wallet/${PAIR_SPEND_ID}`);
console.log(`     type=1 เติมเงิน                  → http://localhost:3000/admin/wallet/${FIXTURE_ID}`);
console.log(`   revert: node --env-file=.env.local scripts/seed-dev-wallet-fixture.mjs --revert --apply`);
