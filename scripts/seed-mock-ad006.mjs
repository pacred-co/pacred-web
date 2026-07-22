/**
 * 🎭 MOCK DATA for AD006 (ปอน · admin_pond) — UI redesign fixture.
 *
 *   owner 2026-07-22: "Mock up รายการให้ผมหน่อยทั้งหมด เข้าไอดี Ad006 ทุกช่องที่เรามี
 *   บริการตอนนี้ ทุกสถานะ ทั้งโฟลวเลย ... ผมจะปรับระบบ ปรับหน้าตาใหม่ แล้วพอผมจะ push
 *   ลบข้อมูลจากไอดีผมหน่อย"
 *
 * SCOPE — the 3 live cargo lanes, every status a customer can land on:
 *   ฝากสั่งซื้อ   tb_header_order + tb_order   hstatus 1·2·3·4·40·5·6
 *   ฝากนำเข้า    tb_forwarder                 fstatus 1·2·3·4·5·6·7
 *   ฝากโอนหยวน   tb_payment                   paystatus 1·2·3
 *   + กระเป๋าเงิน · สลิป (รอตรวจ/ผ่าน/ปฏิเสธ) · ใบแจ้งหนี้ (issued/paid/cancelled) · ใบเสร็จ
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  THIS RUNS AGAINST **PRODUCTION** (the dev project is paused/down).
 *     Owner-approved 2026-07-22. Four hard guardrails make that safe:
 *
 *   1. NAMESPACE LOCK — every read/write/delete is filtered to userid='AD006'.
 *      There is no code path here that can touch another customer's row.
 *   2. FAKE DOC NUMBERS — invoices/receipts use MOCK-FRI-* / MOCK-FRG-*, so the
 *      real legal running series (FRI2607-00092 / FRG2607-00037) is never
 *      advanced or gapped.
 *   3. DRY-RUN BY DEFAULT — prints the plan; writes only with --apply.
 *   4. ONE-COMMAND UNDO — --clean deletes exactly what this script inserts,
 *      children-first, and reports the per-table row counts it removed.
 *
 *   Rows are tagged "🎭 MOCK" in their note fields so they are obvious in any
 *   admin list, and tracking numbers use a MOCKAD006* prefix.
 *
 *   NOT hidden from reports: while seeded, these amounts DO appear in revenue /
 *   KPI / data-health. That is the accepted trade-off — run --clean before push.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node --env-file=.env.local scripts/seed-mock-ad006.mjs           # dry-run
 *   node --env-file=.env.local scripts/seed-mock-ad006.mjs --apply   # seed
 *   node --env-file=.env.local scripts/seed-mock-ad006.mjs --clean --apply   # undo
 */
import { createClient } from "@supabase/supabase-js";

// ── namespace lock ───────────────────────────────────────────────────────────
const CODE = "AD006";
const TAG = "🎭 MOCK (AD006) — ลบด้วย --clean";
const TRACK = "MOCKAD006"; // every fake tracking no. starts with this
const MOCK_INV = "MOCK-FRI-"; // never the real FRI2607-* series
const MOCK_RCP = "MOCK-FRG-"; // never the real FRG2607-* series

const APPLY = process.argv.includes("--apply");
const CLEAN = process.argv.includes("--clean");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("⛔ ต้องมี NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const ref = url.replace(/https:\/\/([^.]+).*/, "$1");

console.log(`\n🎭 MOCK AD006`);
console.log(`   DB    : ${ref}${ref === "yzljakczhwrpbxflnmco" ? "  ⚠️  PRODUCTION" : ""}`);
console.log(`   MODE  : ${CLEAN ? "CLEAN (ลบ)" : "SEED (สร้าง)"} · ${APPLY ? "APPLY ✍️" : "DRY-RUN 👀"}`);

// ⚠️ TWO KEYS, not one. The legacy tb_* tables are keyed by userid ('AD006'), but
// the modern tables (freight_shipments / notifications / bookings) are keyed by
// profiles.id (a uuid). Miss this and --clean silently orphans rows on prod.
const { data: prof } = await db
  .from("profiles")
  .select("id, member_code")
  .eq("member_code", CODE)
  .maybeSingle();
if (!prof?.id) {
  console.error(`⛔ ไม่พบ profile ของ ${CODE} — ยกเลิก`);
  process.exit(1);
}
const PROFILE_ID = prof.id;
console.log(`   SCOPE : userid='${CODE}'  +  profile_id='${PROFILE_ID}'\n`);

const nowIso = new Date().toISOString();
const dayAgo = (d) => new Date(Date.now() - d * 86400_000).toISOString();
const dateOnly = (d) => dayAgo(d).slice(0, 10);
const money = (n) => `฿${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

// ── CLEAN — children first, every filter pinned to AD006 ──────────────────────
async function clean() {
  const removed = [];

  // ── link-keyed children (must go before their parents) ──────────────────────
  // ใบขน → linked to the mock freight shipments
  const { data: myFs } = await db
    .from("freight_shipments")
    .select("id")
    .eq("profile_id", PROFILE_ID);
  const fsIds = (myFs ?? []).map((r) => r.id);
  if (fsIds.length) {
    const { data: decl } = await db
      .from("customs_declarations")
      .select("id")
      .in("freight_shipment_id", fsIds);
    if (APPLY && decl?.length)
      await db.from("customs_declarations").delete().in("freight_shipment_id", fsIds);
    removed.push(["customs_declarations", decl?.length ?? 0]);
  } else {
    removed.push(["customs_declarations", 0]);
  }

  // งานคนขับ: delete only the MOCK batch (never a real driver run) + its items
  const { data: batches } = await db
    .from("tb_forwarder_driver")
    .select("id, fdname")
    .like("fdname", `%${TRACK}%`);
  const batchIds = (batches ?? []).map((r) => r.id);
  if (batchIds.length) {
    const { data: items } = await db
      .from("tb_forwarder_driver_item")
      .select("id")
      .in("fdid", batchIds);
    if (APPLY) {
      await db.from("tb_forwarder_driver_item").delete().in("fdid", batchIds);
      await db.from("tb_forwarder_driver").delete().in("id", batchIds);
    }
    removed.push(["tb_forwarder_driver_item", items?.length ?? 0]);
    removed.push(["tb_forwarder_driver", batchIds.length]);
  } else {
    removed.push(["tb_forwarder_driver_item", 0]);
    removed.push(["tb_forwarder_driver", 0]);
  }

  // ── profile_id-keyed modern tables ─────────────────────────────────────────
  for (const tbl of ["freight_shipments", "notifications", "bookings"]) {
    const { data: found, error } = await db.from(tbl).select("id").eq("profile_id", PROFILE_ID);
    if (error) {
      removed.push([tbl, `read-err: ${error.message.slice(0, 50)}`]);
      continue;
    }
    const n = found?.length ?? 0;
    if (APPLY && n) await db.from(tbl).delete().eq("profile_id", PROFILE_ID);
    removed.push([`${tbl} (by profile_id)`, n]);
  }

  // invoice items / receipt items reference parents; delete those first.
  const { data: invs } = await db
    .from("tb_forwarder_invoice")
    .select("id, doc_no")
    .eq("userid", CODE);
  for (const inv of invs ?? []) {
    if (APPLY) await db.from("tb_forwarder_invoice_item").delete().eq("invoice_id", inv.id);
  }
  removed.push(["tb_forwarder_invoice_item", (invs ?? []).length ? "(children)" : 0]);

  const { data: rcps } = await db.from("tb_receipt").select("rid").eq("userid", CODE);
  for (const r of rcps ?? []) {
    if (APPLY) await db.from("tb_receipt_item").delete().eq("rid", r.rid);
  }
  removed.push(["tb_receipt_item", (rcps ?? []).length ? "(children)" : 0]);

  // parents + leaf tables
  const parents = [
    ["tb_forwarder_tax_invoice", "userid"],
    ["customer_quotations", "userid"],
    // ⚠️ ORDER MATTERS: mig-0270's trg_protect_customer_main_address refuses to
    // DELETE a tb_address row while a tb_address_main row still points at it
    // ("select another main address before removing address N"). Drop the
    // pointer first, then the address.
    ["tb_address_main", "userid"],
    ["tb_address", "userid"],
    ["tb_forwarder_invoice", "userid"],
    ["tb_receipt", "userid"],
    ["tb_order", "userid"],
    ["tb_header_order", "userid"],
    ["tb_forwarder", "userid"],
    ["tb_payment", "userid"],
    ["tb_wallet_hs", "userid"],
    ["tb_wallet", "userid"],
    ["tb_cash_back", "userid"],
    ["tb_users", "userID"],
  ];
  for (const [tbl, col] of parents) {
    const { data: found, error: selErr } = await db.from(tbl).select("*", { count: "exact", head: false }).eq(col, CODE);
    if (selErr) {
      removed.push([tbl, `read-err: ${selErr.message.slice(0, 60)}`]);
      continue;
    }
    const n = found?.length ?? 0;
    if (APPLY && n) {
      const { error } = await db.from(tbl).delete().eq(col, CODE);
      if (error) {
        removed.push([tbl, `DEL-ERR ${error.message.slice(0, 60)}`]);
        continue;
      }
    }
    removed.push([tbl, n]);
  }

  console.log("ตารางที่จะลบ (filter userid='" + CODE + "'):");
  for (const [t, n] of removed) console.log(`   ${String(n).padStart(6)}  ${t}`);
  console.log(APPLY ? "\n✓ ลบเรียบร้อย" : "\n👀 DRY-RUN — ยังไม่ได้ลบ (เติม --apply เพื่อลบจริง)");
}

if (CLEAN) {
  await clean();
  process.exit(0);
}

// ── SEED ─────────────────────────────────────────────────────────────────────
// Always clean first so re-running is idempotent (never stacks duplicates).
if (APPLY) {
  console.log("↻ ล้างของเก่าก่อน (idempotent)…");
  await clean();
  console.log("");
}

// templates: clone a real row's shape so every NOT-NULL column is satisfied,
// then overwrite EVERY identity / money / status field with mock values.
const tpl = {};
for (const [name, tbl, filter] of [
  ["user", "tb_users", (q) => q.limit(1)],
  ["fwd", "tb_forwarder", (q) => q.eq("fstatus", "5").limit(1)],
  ["hdr", "tb_header_order", (q) => q.limit(1)],
  ["ord", "tb_order", (q) => q.limit(1)],
  ["pay", "tb_payment", (q) => q.limit(1)],
  ["whs", "tb_wallet_hs", (q) => q.limit(1)],
  ["inv", "tb_forwarder_invoice", (q) => q.limit(1)],
  ["rcp", "tb_receipt", (q) => q.limit(1)],
]) {
  const { data } = await filter(db.from(tbl).select("*")).maybeSingle();
  if (!data) {
    console.error(`⛔ หา template ของ ${tbl} ไม่เจอ`);
    process.exit(1);
  }
  tpl[name] = data;
}
console.log("✓ อ่าน template ครบ 8 ตาราง");

// ── REAL CONTENT POOLS ───────────────────────────────────────────────────────
// owner 2026-07-22: "เอางานจริงๆมาเลยได้ไหม มันเห็นภาพยากมาก เอาที่มีใน database
// มาผสมๆ ให้มันทำได้" — placeholder titles + "No img" made the redesign unreadable.
//
// We borrow CATALOG content only (product title / shop name / 1688 image + url /
// price / spec, and warehouse box photos). NO customer PII is copied — the mock
// identity, address and phone stay fake. Real rows are excluded from AD006 itself
// so a re-run never feeds mock data back into mock data.
const pools = {};
{
  const { data: lines } = await db
    .from("tb_order")
    .select("ctitle, cnameshop, cprovider, cimages, curl, cprice, camount, ccolor, csize, cdetails")
    .not("cimages", "is", null)
    .neq("cimages", "")
    .neq("ctitle", "")
    .neq("userid", CODE)
    .order("id", { ascending: false })
    .limit(300);
  // dedupe by title — the raw feed repeats the same offer across variants, which
  // made two different mock orders show the identical product.
  const seenTitle = new Set();
  pools.lines = (lines ?? []).filter((l) => {
    const k = (l.ctitle || "").trim();
    if (!k || seenTitle.has(k)) return false;
    seenTitle.add(k);
    return true;
  });

  const { data: covers } = await db
    .from("tb_forwarder")
    .select("fcover, fweight, fvolume, famount, fproductstype")
    .not("fcover", "is", null)
    .neq("fcover", "")
    .neq("userid", CODE)
    .order("id", { ascending: false })
    .limit(40);
  pools.covers = covers ?? [];

  const { data: details } = await db
    .from("tb_forwarder")
    .select("fdetail")
    .not("fdetail", "is", null)
    .neq("fdetail", "")
    .neq("userid", CODE)
    .order("id", { ascending: false })
    .limit(60);
  // drop anything that still looks like a previous mock run
  pools.details = [
    ...new Set(
      (details ?? [])
        .map((r) => (r.fdetail || "").trim())
        .filter((d) => d && !d.includes("MOCK") && !d.includes("🎭")),
    ),
  ];
}
if (!pools.lines.length || !pools.covers.length) {
  console.error("⛔ ดึงข้อมูลจริงมาไม่ได้ — ยกเลิก (ไม่งั้นจะได้ mock เปล่าๆ เหมือนเดิม)");
  process.exit(1);
}
const pick = (arr, i) => arr[i % arr.length];
console.log(
  `✓ ดึงของจริงมาผสม: สินค้า ${pools.lines.length} · รูปกล่อง ${pools.covers.length} · รายละเอียด ${pools.details.length}\n`,
);

const plan = [];
const note = (t, msg) => plan.push([t, msg]);

// honest error tracking — the summary must never claim success it didn't get
const failures = [];

// helper: insert a cloned row (drops the pk so the sequence assigns one)
async function ins(tbl, base, patch, pk = "id") {
  const row = { ...base, ...patch };
  delete row[pk];
  if (!APPLY) return { id: null };
  const { data, error } = await db.from(tbl).insert(row).select(pk).maybeSingle();
  if (error) {
    failures.push([tbl, error.message]);
    console.error(`   ⛔ ${tbl}: ${error.message}`);
    return { id: null, error };
  }
  return data ?? { id: null };
}

// ── 1) identity: customer row + wallet ───────────────────────────────────────
await ins("tb_users", tpl.user, {
  userID: CODE,
  // tb_users has a UNIQUE index on userTel — ปอน's real number 0958612835 already
  // belongs to customer PR10452, so the mock uses a reserved unused fake number.
  userTel: "0999999006",
  userStatus: "1",
  userPass: "",
  pcs_logged: "0",
  userName: "ปอน",
  userLastName: "(บัญชีทดสอบ UI)",
  userEmail: "mock-ad006@pacred.invalid",
  userLineID: "",
  userFacebook: "",
  userPicture: "",
  userRecoverKey: "",
  userLineNotify: "",
  userLineIDOA: "",
  userCompany: "",
  companyCustomer: "",
  coID: "PR",
  adminIDSale: "",
  adminIDCS: "",
  adminIDInterpreter: "",
  adminIDPricing: "",
  adminIDPurchaser: "",
  userCredit: "0",
  userCreditValue: 0,
  userRegistered: dayAgo(120),
  userLastLogin: nowIso,
  userNote: TAG,
}, "ID"); // ⚠️ tb_users' PK is "ID" (uppercase), not "id"
note("tb_users", `1 แถว — ลูกค้า ${CODE} (จำเป็นเพื่อให้หน้า portal ดึงชื่อ/ที่อยู่ได้)`);

for (const [tbl, obj, label] of [
  ["tb_wallet", { userid: CODE, wallettotal: 8500 }, "กระเป๋าเงิน ฿8,500"],
  ["tb_cash_back", { userid: CODE, cbtotal: 320 }, "เงินคืน ฿320"],
]) {
  if (APPLY) {
    const { error } = await db.from(tbl).insert(obj);
    if (error) console.warn(`   ! ${tbl}: ${error.message.slice(0, 80)}`);
  }
  note(tbl, `1 แถว — ${label}`);
}

// ── 2) ฝากนำเข้า — one row per fstatus 1..7 ──────────────────────────────────
// status ladder + money stay authored (that's the point — every status, and a
// sensible unpriced→priced progression). Everything a human LOOKS at — the
// description, the box photo, the weight/volume/box-count — comes from real rows.
const FWD = [
  { st: "1", t: "01", freight: 0,     ship: 0,   cab: "" },
  { st: "2", t: "02", freight: 0,     ship: 0,   cab: "" },
  { st: "3", t: "03", freight: 0,     ship: 0,   cab: "GZS2607-MOCK1" },
  { st: "4", t: "04", freight: 1_550, ship: 120, cab: "GZE2607-MOCK1" },
  { st: "5", t: "05", freight: 1_180, ship: 100, cab: "GZE2607-MOCK1" },
  { st: "6", t: "06", freight: 890,   ship: 100, cab: "GZE2607-MOCK1" },
  { st: "7", t: "07", freight: 3_240, ship: 250, cab: "GZS2607-MOCK1" },
].map((f, i) => {
  const real = pick(pools.covers, i);
  return {
    ...f,
    d: pools.details.length ? pick(pools.details, i) : "สินค้านำเข้า",
    cover: real.fcover,
    w: Number(real.fweight) || 12.5,
    v: Number(real.fvolume) || 0.09,
    box: Number(real.famount) || 1,
    ptype: real.fproductstype || "1",
  };
});

const fwdIds = [];
for (const f of FWD) {
  const paid = Number(f.st) >= 6;
  const r = await ins("tb_forwarder", tpl.fwd, {
    userid: CODE,
    fstatus: f.st,
    fcredit: "0",
    fusercompany: "0",
    paymethod: "1",
    paydeposit: paid ? "1" : "0",
    fdate: dayAgo(30 - Number(f.st) * 3),
    fdatekey: dayAgo(30 - Number(f.st) * 3),
    fdateadminstatus: nowIso,
    fdatestatus2: Number(f.st) >= 2 ? dayAgo(20) : null,
    fdatestatus3: Number(f.st) >= 3 ? dayAgo(14) : null,
    fdatestatus4: Number(f.st) >= 4 ? dayAgo(7) : null,
    fdatestatus5: Number(f.st) >= 5 ? dayAgo(5) : null,
    fdatestatus6: Number(f.st) >= 6 ? dayAgo(3) : null,
    fdatestatus7: Number(f.st) >= 7 ? dayAgo(1) : null,
    fdatetothai: Number(f.st) >= 4 ? dayAgo(7) : null,
    fdatecontainerclose: f.cab ? dayAgo(12) : null,
    // ⚠️ distinct from every tb_order.ctrackingnumber below, so the mig-0234/0235
    //    shop-status trigger never fires and rewrites the hstatus values we author.
    ftrackingchn: `${TRACK}F${f.t}`,
    ftrackingchn2: "",
    ftrackingth: Number(f.st) >= 6 ? `TH${TRACK}${f.t}` : "",
    ftransporttype: f.cab.startsWith("GZS") ? "2" : "1",
    fcabinetnumber: f.cab,
    fweight: f.w,
    fvolume: f.v,
    famount: f.box,
    famountcount: "1",
    fwidth: 0,
    flength: 0,
    fheight: 0,
    ftotalprice: f.freight,
    ftransportprice: f.ship,
    fpriceupdate: 0,
    fdiscount: 0,
    fshippingservice: 0,
    pricecrate: 0,
    ftransportpricechnthb: 0,
    priceother: 0,
    pricemore: 0,
    crate: "0",
    fcosttotalprice: 0,
    fprofittotal: 0,
    frefprice: 0,
    frefrate: 0,
    fproductstype: f.ptype,
    fdetail: f.d,
    fnote: TAG,
    fnoteuser: "0",
    fnoteuserread: "0",
    fcover: f.cover, // real warehouse box photo → the row actually shows an image
    fimg1: "", fimg2: "", fimg3: "", fimg4: "", fphotoend: "",
    reforder: "", // keep empty → no shop-order linkage side-effect
    fcabinet_locked: false,
    fexception_type: null,
    fexception_status: null,
    adminid: "admin_pond", adminidcreator: "admin_pond",
    adminidkey: "admin_pond", adminidupdate: "admin_pond",
    faddressname: "ปอน", faddresslastname: "(ทดสอบ)", faddresstel: "0958612835",
  });
  if (r?.id) fwdIds.push({ id: r.id, ...f });
}
note("tb_forwarder", `7 แถว — fstatus 1→7 ครบทุกสถานะ (รวมค่าขนส่ง ${money(FWD.reduce((s, f) => s + f.freight + f.ship, 0))})`);

// ── 3) ฝากสั่งซื้อ — one header per hstatus + line items ─────────────────────
const HDR = [
  { st: "1", n: "01" },
  { st: "2", n: "02" },
  { st: "3", n: "03" },
  { st: "4", n: "04" },
  { st: "40", n: "05" },
  { st: "5", n: "06" },
  { st: "6", n: "07" },
];
const RATE = 5.1;
const LINES_PER_ORDER = 2;

for (const [hi, h] of HDR.entries()) {
  const hno = `${TRACK}H${h.n}`;
  // 2 REAL product lines per order — real title / shop / 1688 image + url / price
  const myLines = Array.from({ length: LINES_PER_ORDER }, (_, i) =>
    pick(pools.lines, hi * LINES_PER_ORDER + i),
  );
  // totals are DERIVED from the lines, so every number on screen adds up
  const yuan =
    Math.round(
      myLines.reduce((s, l) => s + Number(l.cprice || 0) * Number(l.camount || 0), 0) * 100,
    ) / 100;
  const qty = myLines.reduce((s, l) => s + Number(l.camount || 0), 0);
  const thb = Math.round(yuan * RATE * 100) / 100;

  await ins("tb_header_order", tpl.hdr, {
    userid: CODE,
    hno,
    hstatus: h.st,
    hshoppay: "0",
    paydeposit: ["3", "4", "40", "5"].includes(h.st) ? "1" : "0",
    // mirrors submitCartOrder: the header rolls up the FIRST line (actions/cart.ts)
    // → the order LIST shows a real product name + real thumbnail instead of "No img"
    htitle: myLines[0].ctitle,
    hcover: myLines[0].cimages,
    hcount: qty,
    hdate: dayAgo(40),
    hdate2: h.st !== "1" ? dayAgo(35) : null,
    hdate3: ["3", "4", "40", "5"].includes(h.st) ? dayAgo(30) : null,
    hdate4: ["4", "40", "5"].includes(h.st) ? dayAgo(22) : null,
    hdate5: h.st === "5" ? dayAgo(10) : null,
    hdateupdate: nowIso,
    hdatepayment: h.st === "2" ? dateOnly(-3) : null,
    htransporttype: "1",
    htotalpricechn: yuan,
    htotalpriceuser: thb,
    hshippingservice: 0,
    hshippingchn: 0,
    hpriceupdate: 0,
    hrate: RATE,
    hratecost: 4.95,
    hcostall: 0,
    hcostallth: 0,
    hnote: TAG,
    hnoteuser: "0",
    hnoteuserread: "0",
    hprintbill: "0",
    hprintbill2: "0",
    hshipby: "PCS",
    hfreeshipping: "0",
    haddressname: "ปอน",
    haddresslastname: "(ทดสอบ)",
    haddressno: "1",
    haddresssubdistrict: "-",
    haddressdistrict: "-",
    haddressprovince: "กรุงเทพมหานคร",
    haddresszipcode: "10240",
    haddressnote: "",
    haddresstel: "0958612835",
    haddresstel2: "",
    paymethod: "1",
    crate: "0",
    pricecrate: 0,
    fshippingservice: 0,
    adminid: "admin_pond",
    adminidcreate: "admin_pond",
    adminidupdate: "admin_pond",
    adminidip: "admin_pond",
    adminidpurchaser: "admin_pond",
    session: "",
  });

  // real product lines
  for (const L of myLines) {
    await ins("tb_order", tpl.ord, {
      userid: CODE,
      hno,
      cdetails: L.cdetails || L.ctitle,
      curl: L.curl,
      ctitle: L.ctitle,
      cnameshop: L.cnameshop,
      cprovider: L.cprovider || "1", // varchar(1) — "1"/"2"/"4", never "1688"
      cimages: L.cimages,
      cprice: L.cprice,
      cshippingchn: 0,
      cpriceupdate: 0,
      camount: L.camount,
      ccolor: L.ccolor || "",
      csize: L.csize || "",
      // ⚠️ intentionally NOT equal to any ftrackingchn above (trigger safety)
      cshippingnumber: "",
      // ⚠️ mig-0234/0235: hstatus is a PURE FUNCTION of the linked forwarders'
      //    arrival state — the trigger RECOMPUTES it on insert. Fighting it by
      //    using orphan tracking numbers just got '40' demoted to '4'. So link
      //    for real: point at a forwarder whose fstatus yields the status we want.
      //      '40' ถึงโกดังจีน → F02 (fstatus=2, ยังไม่มีเลขตู้)
      //      '5'  สำเร็จ      → F07 (fstatus=7, มีเลขตู้แล้ว)
      //    Everything else stays unlinked so its authored status is left alone.
      ctrackingnumber:
        h.st === "40" ? `${TRACK}F02` : h.st === "5" ? `${TRACK}F07` : "",
      // these are all varchar(1); prod's dominant value is "" — match it
      crewallet: "",
      cnote: TAG,
      hwarehousename: "",
      hqc: "",
    });
  }
}
note("tb_header_order", `7 แถว — hstatus 1·2·3·4·40·5·6 ครบทุกสถานะ`);
note("tb_order", `14 แถว — รายการสินค้า 2 ชิ้น/ออเดอร์`);

// ── 4) ฝากโอนหยวน — paystatus 1 รอตรวจ / 2 อนุมัติ / 3 ปฏิเสธ ───────────────
const PAYS = [
  { st: "1", yuan: 3_200, d: "รอตรวจสอบ · โอนค่าสินค้าร้านเจ้าประจำ" },
  { st: "2", yuan: 8_750, d: "อนุมัติแล้ว · โอนค่าสินค้า + ค่าส่งในจีน" },
  { st: "3", yuan: 1_400, d: "ปฏิเสธ · สลิปไม่ชัด ขอใหม่" },
];
for (const [i, p] of PAYS.entries()) {
  await ins("tb_payment", tpl.pay, {
    userid: CODE,
    paystatus: p.st,
    paydeposit: "0",
    paytype: "1",
    paydetail: `${p.d}  ${TAG}`,
    payyuan: p.yuan,
    payrate: RATE,
    payratecost: 4.95,
    paythb: Math.round(p.yuan * RATE * 100) / 100,
    paythbcost: Math.round(p.yuan * 4.95 * 100) / 100,
    payprofitthb: Math.round(p.yuan * (RATE - 4.95) * 100) / 100,
    paydate: dayAgo(12 - i * 4),
    paydateadmin: p.st === "1" ? null : dayAgo(10 - i * 4),
    adminid: "admin_pond",
    adminidupdate: "admin_pond",
    payadminidcreator: "admin_pond",
    session: "",
    imagesslip: "",
    imagesslipadmin: "",
    certifiedtruecopy: "0",
    payee_qr_image: "", // NOT NULL (default '') — null is rejected
    reviewed_at: p.st === "2" ? dayAgo(10) : null,
  });
}
note("tb_payment", `3 แถว — รอตรวจ / อนุมัติ / ปฏิเสธ`);

// ── 5) สลิป + รายการเดินบัญชีกระเป๋าเงิน ────────────────────────────────────
const SLIPS = [
  { typenew: "1", status: "1", amt: 5_000, d: "เติมเงิน — รอตรวจสลิป" },
  { typenew: "1", status: "2", amt: 12_000, d: "เติมเงิน — ตรวจผ่านแล้ว" },
  { typenew: "1", status: "3", amt: 2_500, d: "เติมเงิน — ปฏิเสธ (ยอดไม่ตรง)" },
  { typenew: "6", status: "2", amt: 1_280, d: "ตัดชำระค่าฝากนำเข้า" },
  { typenew: "2", status: "2", amt: 990, d: "ตัดชำระจากกระเป๋า" },
];
for (const [i, s] of SLIPS.entries()) {
  await ins("tb_wallet_hs", tpl.whs, {
    userid: CODE,
    amount: s.amt,
    typenew: s.typenew,
    typeservice: s.typenew === "1" ? "1" : "2",
    status: s.status,
    paydeposit: s.status === "2" ? "1" : "0",
    date: dayAgo(15 - i * 2),
    dateslip: dateOnly(15 - i * 2),
    note: `${s.d}  ${TAG}`,
    imagesslip: "",
    depositnamebank: "KBANK",
    nameuserbank: "ปอน (ทดสอบ)",
    nouserbank: "xxx-x-x9999-x",
    whno: `${TRACK}W${String(i + 1).padStart(2, "0")}`,
    wusercredit: "0",
    reforder: "", // varchar — "" ok
    reforder2: null, // bigint — "" is not a valid bigint
    adminid: "admin_pond",
    adminidupdate: "admin_pond",
    adminidcrate: "admin_pond",
    admincreate: "admin_pond",
    session: "",
    reviewed_at: s.status === "2" ? dayAgo(14 - i * 2) : null,
  });
}
note("tb_wallet_hs", `5 แถว — สลิปรอตรวจ/ผ่าน/ปฏิเสธ + ตัดชำระ`);

// ── 6) ใบแจ้งหนี้ / ใบวางบิล — issued · paid · cancelled ─────────────────────
const INVS = [
  { no: "0001", status: "issued",    slip: "pending",  amt: 1_280, fwdIdx: 4, d: "รอชำระ — แนบสลิปแล้ว รอบัญชีตรวจ" },
  { no: "0002", status: "paid",      slip: "verified", amt: 990,   fwdIdx: 5, d: "ชำระแล้ว — ตรวจสลิปผ่าน" },
  { no: "0003", status: "cancelled", slip: null,       amt: 3_490, fwdIdx: 6, d: "ยกเลิก — ออกใบใหม่แทน" },
];
for (const v of INVS) {
  const r = await ins("tb_forwarder_invoice", tpl.inv, {
    doc_no: `${MOCK_INV}${v.no}`, // ← never the real FRI2607-* series
    userid: CODE,
    buyer_name: "ปอน (บัญชีทดสอบ UI)",
    buyer_tax_id: "",
    buyer_address: "กรุงเทพมหานคร 10240",
    buyer_branch: "",
    is_juristic: false,
    date_issued: dateOnly(6),
    date_due: dateOnly(-1),
    subtotal_thb: v.amt,
    delivery_chn_thb: 0,
    delivery_th_thb: 0,
    other_thb: 0,
    discount_thb: 0,
    mao_fee_thb: 0,
    total_thb: v.amt,
    status: v.status,
    note_for_customer: `${v.d}  ${TAG}`,
    paid_at: v.status === "paid" ? dayAgo(2) : null,
    paid_by: v.status === "paid" ? "admin_pond" : null,
    cancelled_at: v.status === "cancelled" ? dayAgo(1) : null,
    cancelled_by: v.status === "cancelled" ? "admin_pond" : null,
    cancel_reason: v.status === "cancelled" ? "ทดสอบ UI" : null,
    slip_status: v.slip,
    slip_path: null,
    slip_paths: [], // jsonb NOT NULL (default '[]') — null is rejected
    slip_uploaded_by: v.slip ? CODE : null,
    slip_uploaded_at: v.slip ? dayAgo(3) : null,
    slip_reviewed_at: v.slip === "verified" ? dayAgo(2) : null,
    issued_at: dayAgo(6),
    issued_by: "admin_pond",
    delivery_address: "กรุงเทพมหานคร 10240",
  });
  const fw = fwdIds[v.fwdIdx];
  if (r?.id && fw?.id && APPLY) {
    const { error } = await db
      .from("tb_forwarder_invoice_item")
      .insert({ invoice_id: r.id, forwarder_id: fw.id, amount_thb: v.amt });
    if (error) console.warn(`   ! invoice_item: ${error.message.slice(0, 80)}`);
  }
}
note("tb_forwarder_invoice", `3 ใบ — ${MOCK_INV}0001 รอชำระ / 0002 จ่ายแล้ว / 0003 ยกเลิก`);
note("tb_forwarder_invoice_item", `3 แถว — ผูกกับฝากนำเข้าของ ${CODE}`);

// ── 7) ใบเสร็จ ───────────────────────────────────────────────────────────────
const RCPS = [
  { no: "0001", rstatus: "1", amt: 990,   fwdIdx: 5, d: "ใบเสร็จปกติ" },
  { no: "0002", rstatus: "2", amt: 3_490, fwdIdx: 6, d: "ใบเสร็จ (สถานะ 2)" },
];
for (const rc of RCPS) {
  const rid = `${MOCK_RCP}${rc.no}`; // ← never the real FRG2607-* series
  await ins("tb_receipt", tpl.rcp, {
    rid,
    refid: `${TRACK}REF${rc.no}`,
    userid: CODE,
    rstatus: rc.rstatus,
    rdatecreate: dayAgo(2),
    rdate: dayAgo(2),
    issuedate: dateOnly(2),
    ramount: rc.amt,
    totalbeforewithholding: rc.amt,
    adminid: "admin_pond",
    statusprint: "0",
    adminidprint: "",
    statusprintcopy: "0",
    adminidprintcopy: "",
    recompnumber: "",
    recompname: "ปอน (บัญชีทดสอบ UI)",
    recompaddress: `กรุงเทพมหานคร 10240  —  ${TAG}`,
    rpopup: "0",
    corporatetype: "1",
    documentissuer: "admin_pond",
    documentapprover: "admin_pond",
    mao_fee_thb: 0,
    delivery_address: "กรุงเทพมหานคร 10240",
  }, "id");
  const fw = fwdIds[rc.fwdIdx];
  if (fw?.id && APPLY) {
    const { error } = await db.from("tb_receipt_item").insert({ rid, fid: fw.id });
    if (error) console.warn(`   ! receipt_item: ${error.message.slice(0, 80)}`);
  }
}
note("tb_receipt", `2 ใบ — ${MOCK_RCP}0001 / 0002`);
note("tb_receipt_item", `2 แถว`);

// ── 8) ที่อยู่จัดส่ง ─────────────────────────────────────────────────────────
// NOT borrowed from real rows — tb_address is the one place holding actual
// customer PII (names, phones, home addresses). Mock identity stays mock.
const ADDRS = [
  { main: "1", no: "88/12", sub: "คลองตัน", dis: "วัฒนา", prov: "กรุงเทพมหานคร", zip: "10110", note: "บ้าน — ฝากไว้ที่ รปภ. ได้" },
  { main: "0", no: "159 อาคารเสริมมิตร ชั้น 12", sub: "คลองเตยเหนือ", dis: "วัฒนา", prov: "กรุงเทพมหานคร", zip: "10110", note: "ออฟฟิศ — จ-ศ 09:00-18:00" },
];
for (const a of ADDRS) {
  if (!APPLY) continue;
  const { error } = await db.from("tb_address").insert({
    addressstatus: a.main,
    addressname: "ปอน",
    addresslastname: "(บัญชีทดสอบ UI)",
    addresstel: "0999999006",
    addresstel2: "",
    addressno: a.no,
    addresssubdistrict: a.sub,
    addressdistrict: a.dis,
    addressprovince: a.prov,
    addresszipcode: a.zip,
    addressnote: `${a.note}  ${TAG}`,
    userid: CODE,
    adminid: "admin_pond",
    latitude: 0,
    longitude: 0,
  });
  if (error) failures.push(["tb_address", error.message]);
}
note("tb_address", `2 แถว — ที่อยู่หลัก + ออฟฟิศ`);

// ── 9) เฟรทนำเข้า/ส่งออก — clone REAL shipments, re-key to AD006 ────────────
// ⚠️ HONEST NOTE: prod's freight lane is 144 jobs but the business fields are
// almost entirely unfilled — port_loading 0 rows, hs_code 0, commercial_value_usd
// 0, carrier_container_no 0. Only incoterm (93) and cost_total_thb (17) carry
// real values. So we clone the RICHEST real rows (incoterm + highest cost) and
// deliberately do NOT invent ports/HS/duty. A sparse freight card here is the
// truth about prod, not a gap in the mock.
let { data: fsReal } = await db
  .from("freight_shipments")
  .select("*")
  .neq("profile_id", PROFILE_ID)
  .not("incoterm", "is", null)
  .order("cost_total_thb", { ascending: false, nullsFirst: false })
  .limit(40);
if (!fsReal?.length) {
  ({ data: fsReal } = await db
    .from("freight_shipments")
    .select("*")
    .neq("profile_id", PROFILE_ID)
    .order("created_at", { ascending: false })
    .limit(40));
}
const FS_PLAN = [
  { st: "draft", j: "BOOKED", dir: "import", n: "001" },
  { st: "in_progress", j: "IN_TRANSIT", dir: "import", n: "002" },
  { st: "in_progress", j: "TH_CUSTOMS", dir: "import", n: "003" },
  { st: "delivered", j: "DELIVERED", dir: "import", n: "004" },
  { st: "cancelled", j: "CANCELLED", dir: "export", n: "005" },
];
const fsIds = [];
for (const [i, f] of FS_PLAN.entries()) {
  const base = pick(fsReal ?? [], i);
  if (!base) break;
  const r = await ins("freight_shipments", base, {
    profile_id: PROFILE_ID,
    job_no: `PRMOCK${f.n}`,
    status: f.st,
    journey_status: f.j,
    direction: f.dir,
    notes: TAG,
    created_by_admin_id: PROFILE_ID, // uuid column — AD006 IS an admin profile
    confirmed_at: f.j === "BOOKED" ? null : dayAgo(20),
    delivered_at: f.j === "DELIVERED" ? dayAgo(2) : null,
    cancelled_at: f.j === "CANCELLED" ? dayAgo(4) : null,
    cancelled_reason: f.j === "CANCELLED" ? "ลูกค้าเลื่อนออเดอร์" : null,
    etd_at: f.j === "BOOKED" ? null : dayAgo(18),
    eta_at: ["TH_CUSTOMS", "DELIVERED"].includes(f.j) ? dayAgo(6) : null,
    th_cleared_at: ["DELIVERED"].includes(f.j) ? dayAgo(3) : null,
    arrived_th_warehouse_at: f.j === "DELIVERED" ? dayAgo(3) : null,
    created_at: dayAgo(30 - i * 2),
  });
  if (r?.id) fsIds.push(r.id);
}
note("freight_shipments", `${FS_PLAN.length} งาน — BOOKED / IN_TRANSIT / TH_CUSTOMS / DELIVERED / CANCELLED (นำเข้า+ส่งออก)`);

// ── 10) ใบขนสินค้า — ผูกกับงานเฟรทข้างบน ────────────────────────────────────
const { data: dcReal } = await db.from("customs_declarations").select("*").limit(1).maybeSingle();
const DECLS = [
  { st: "draft", n: "001", type: "import" },
  { st: "released", n: "002", type: "import" },
];
for (const [i, d] of DECLS.entries()) {
  if (!dcReal || !fsIds[i]) break;
  await ins("customs_declarations", dcReal, {
    declaration_no: `MOCK-DECL-${d.n}`,
    freight_shipment_id: fsIds[i + 1] ?? fsIds[0],
    cargo_forwarder_id: null,
    status: d.st,
    declaration_type: d.type,
    declared_at: dayAgo(10),
    // CHECK constraints: 'released' demands the FULL submitted→accepted→released
    // trail (each *_at paired with its *_by_admin_id uuid) or the insert is refused.
    submitted_at: d.st === "draft" ? null : dayAgo(8),
    submitted_by_admin_id: d.st === "draft" ? null : PROFILE_ID,
    accepted_at: d.st === "released" ? dayAgo(7) : null,
    accepted_by_admin_id: d.st === "released" ? PROFILE_ID : null,
    released_at: d.st === "released" ? dayAgo(6) : null,
    released_by_admin_id: d.st === "released" ? PROFILE_ID : null,
    cancelled_at: null,
    cancelled_by_admin_id: null,
    cancelled_reason: null,
    notes: TAG,
    created_by_admin_id: PROFILE_ID,
    updated_by_admin_id: PROFILE_ID,
    confirm_token: null,
    customer_confirm_status: "none", // NOT NULL — CHECK allows none|sent|confirmed|rejected
    customer_confirmed_at: null,
  });
}
note("customs_declarations", `2 ใบ — ร่าง / ตรวจปล่อยแล้ว`);

// ── 11) ใบกำกับภาษี ─────────────────────────────────────────────────────────
const { data: tiReal } = await db.from("tb_forwarder_tax_invoice").select("*").limit(1).maybeSingle();
if (tiReal) {
  for (const [i, t] of [
    { serial: "MOCK-TAX-0001", st: "issued" },
    { serial: "MOCK-TAX-0002", st: "cancelled" },
  ].entries()) {
    await ins("tb_forwarder_tax_invoice", tiReal, {
      serial_no: t.serial,
      userid: CODE,
      receipt_id: null,
      rid: null,
      buyer_name: "ปอน (บัญชีทดสอบ UI)",
      buyer_tax_id: "",
      buyer_address: "กรุงเทพมหานคร 10110",
      is_juristic: false,
      status: t.st,
      issued_at: dayAgo(5 - i),
      issued_by: "admin_pond",
      cancelled_at: t.st === "cancelled" ? dayAgo(1) : null,
      cancelled_by: t.st === "cancelled" ? "admin_pond" : null,
      cancel_reason: t.st === "cancelled" ? "ทดสอบ UI" : null,
      pdf_storage_path: null,
    });
  }
  note("tb_forwarder_tax_invoice", `2 ใบ — ออกแล้ว / ยกเลิก`);
}

// ── 12) ใบเสนอราคา — clone a REAL quotation payload ─────────────────────────
const { data: qReal } = await db
  .from("customer_quotations")
  .select("*")
  .neq("userid", CODE)
  .order("id", { ascending: false })
  .limit(3);
const { data: qMax } = await db
  .from("customer_quotations")
  .select("id")
  .order("id", { ascending: false })
  .limit(1)
  .maybeSingle();
let qNextId = Number(qMax?.id ?? 0) + 1000; // far above the real series
for (const [i, q] of (qReal ?? []).slice(0, 2).entries()) {
  if (!APPLY) continue;
  const { error } = await db.from("customer_quotations").insert({
    id: qNextId++,
    userid: CODE,
    ref_no: `QT-MOCK-${CODE}-${String(i + 1).padStart(2, "0")}`,
    payload: q.payload, // real quote content (rates/notes) — no customer PII
    created_by_admin: "admin_pond",
    created_at: dayAgo(9 - i * 3),
  });
  if (error) failures.push(["customer_quotations", error.message]);
}
note("customer_quotations", `2 ใบ — payload จริงจากใบเสนอราคาที่ออกจริง`);

// ── 13) บุ๊กกิ้ง ─────────────────────────────────────────────────────────────
// transport_mode is CHECK-constrained to sea_lcl|sea_fcl|truck|air|sourcing|customs|remit
const BOOK = [
  { slug: "import-china-sea", mode: "sea_lcl", st: "draft", n: "001" },
  { slug: "import-china-air", mode: "air", st: "contacted", n: "002" },
];
for (const [i, b] of BOOK.entries()) {
  if (!APPLY) continue;
  const { error } = await db.from("bookings").insert({
    booking_no: `BK-MOCK-${b.n}`,
    status: b.st,
    service_slug: b.slug,
    transport_mode: b.mode,
    profile_id: PROFILE_ID,
    contact_name: "ปอน (บัญชีทดสอบ UI)",
    contact_phone: "0999999006",
    customer_note: `ขอใบเสนอราคา ${b.mode.toUpperCase()}  ${TAG}`,
    source_channel: "web",
    submitted_at: dayAgo(11 - i * 4),
    contacted_at: b.st === "contacted" ? dayAgo(9) : null,
    created_at: dayAgo(11 - i * 4),
  });
  if (error) failures.push(["bookings", error.message]);
}
note("bookings", `2 รายการ — ร่าง / ติดต่อแล้ว`);

// ── 14) การแจ้งเตือน — clone REAL notification wording ──────────────────────
const { data: nReal } = await db
  .from("notifications")
  .select("category, severity, title, body, link_href, reference_type")
  .neq("profile_id", PROFILE_ID)
  .not("category", "eq", "observability") // skip internal system alerts
  .order("created_at", { ascending: false })
  .limit(30);
for (const [i, n] of (nReal ?? []).slice(0, 6).entries()) {
  if (!APPLY) continue;
  const { error } = await db.from("notifications").insert({
    profile_id: PROFILE_ID,
    category: n.category,
    severity: n.severity,
    title: n.title,
    body: n.body,
    link_href: n.link_href,
    reference_type: n.reference_type,
    created_at: dayAgo(8 - i),
  });
  if (error) failures.push(["notifications", error.message]);
}
note("notifications", `6 รายการ — ข้อความจริงจากระบบ (ตัด alert ภายในออก)`);

// ── 15) ขนส่งในไทย — รอบคนขับ + จุดส่งของ AD006 ─────────────────────────────
{
  const deliverable = fwdIds.filter((f) => ["6", "7"].includes(f.st));
  if (deliverable.length && APPLY) {
    const { data: batch, error: bErr } = await db
      .from("tb_forwarder_driver")
      .insert({
        fddate: dayAgo(2),
        fdname: `คนขับทดสอบ ${TRACK}`, // MOCK marker → --clean finds only this batch
        fdamount: deliverable.length,
        fdadminid: "admin_pond",
        fdadmincreator: "admin_pond",
        fdstatus: "2",
        endtime: dayAgo(1),
      })
      .select("id")
      .maybeSingle();
    if (bErr) failures.push(["tb_forwarder_driver", bErr.message]);
    else if (batch?.id) {
      for (const [i, f] of deliverable.entries()) {
        const { error } = await db.from("tb_forwarder_driver_item").insert({
          fdid: batch.id,
          fid: f.id,
          fdistatus: f.st === "7" ? "2" : "1", // ส่งแล้ว / ยังไม่ส่ง
          fdipictureon: "",
          fdipictureoff: "",
          fdicompletedat: f.st === "7" ? dayAgo(1) : null,
          fdinote: i === 0 ? TAG : "",
        });
        if (error) failures.push(["tb_forwarder_driver_item", error.message]);
      }
    }
  }
  note("tb_forwarder_driver", `1 รอบ + ${deliverable.length} จุดส่ง (ผูกกับฝากนำเข้า 6/7)`);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log("แผนการสร้างข้อมูล:");
for (const [t, m] of plan) console.log(`   ${t.padEnd(28)} ${m}`);

console.log(`\n   เลขเอกสารปลอมทั้งหมดขึ้นต้น ${MOCK_INV} / ${MOCK_RCP}`);
console.log(`   → ซีรีส์จริง (FRI2607-00092 · FRG2607-00037) ไม่ถูกแตะ ไม่ถูกกินเลข`);
console.log(`   เลขแทรคปลอมขึ้นต้น ${TRACK}`);

if (!APPLY) {
  console.log(`\n👀 DRY-RUN — ยังไม่ได้เขียนอะไรลง DB`);
  console.log(`   สั่งจริง : node --env-file=.env.local scripts/seed-mock-ad006.mjs --apply`);
  process.exit(0);
}

// verify what ACTUALLY landed — never trust the plan, count the rows.
console.log("\nนับแถวจริงใน DB (userid='" + CODE + "'):");
let short = 0;
for (const [tbl, col, want] of [
  ["tb_users", "userID", 1],
  ["tb_wallet", "userid", 1],
  ["tb_cash_back", "userid", 1],
  ["tb_forwarder", "userid", 7],
  ["tb_header_order", "userid", 7],
  ["tb_order", "userid", 14],
  ["tb_payment", "userid", 3],
  ["tb_wallet_hs", "userid", 5],
  ["tb_forwarder_invoice", "userid", 3],
  ["tb_receipt", "userid", 2],
  ["tb_address", "userid", 2],
  ["tb_forwarder_tax_invoice", "userid", 2],
  ["customer_quotations", "userid", 2],
  ["freight_shipments", "profile_id", 5],
  ["customs_declarations", "__fs", 2],
  ["bookings", "profile_id", 2],
  ["notifications", "profile_id", 6],
  ["tb_forwarder_driver_item", "__drv", 2],
]) {
  if (col === "__fs" || col === "__drv") {
    // link-keyed: count via the parent we own
    let got = 0;
    if (col === "__fs" && fsIds.length) {
      const { count } = await db
        .from("customs_declarations")
        .select("*", { count: "exact", head: true })
        .in("freight_shipment_id", fsIds);
      got = count ?? 0;
    } else if (col === "__drv") {
      const { data: b } = await db
        .from("tb_forwarder_driver")
        .select("id")
        .like("fdname", `%${TRACK}%`);
      if (b?.length) {
        const { count } = await db
          .from("tb_forwarder_driver_item")
          .select("*", { count: "exact", head: true })
          .in("fdid", b.map((x) => x.id));
        got = count ?? 0;
      }
    }
    const ok = got === want;
    if (!ok) short++;
    console.log(`   ${ok ? "✓" : "✗"} ${tbl.padEnd(26)} ${String(got).padStart(3)} / ${want}`);
    continue;
  }
  const { count, error } = await db
    .from(tbl)
    .select("*", { count: "exact", head: true })
    .eq(col, col === "profile_id" ? PROFILE_ID : CODE);
  const got = error ? "ERR" : (count ?? 0);
  const ok = got === want;
  if (!ok) short++;
  console.log(`   ${ok ? "✓" : "✗"} ${tbl.padEnd(24)} ${String(got).padStart(3)} / ${want}`);
}

if (failures.length || short) {
  console.log(`\n❌ ไม่สำเร็จทั้งหมด — ${failures.length} insert error · ${short} ตารางจำนวนไม่ครบ`);
  const seen = new Set();
  for (const [t, m] of failures) {
    const k = `${t}|${m}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`   ${t}: ${m}`);
  }
  console.log(`\n   แก้แล้วรันซ้ำได้เลย (สคริปต์ล้างของเก่าก่อนเสมอ = idempotent)`);
  process.exit(1);
}

console.log(`\n✅ สร้างข้อมูล mock ให้ ${CODE} ครบทุกตาราง`);
console.log(`   ลบทิ้ง  : node --env-file=.env.local scripts/seed-mock-ad006.mjs --clean --apply`);
process.exit(0);
