/**
 * actions/commissions-tb.test.ts — P0-23 customer-commission contract gate.
 *
 * Two layers (run: `pnpm tsx --env-file=.env.local actions/commissions-tb.test.ts`):
 *
 *  A. PURE MATH (no DB) — `lib/sales-commission/calc.ts`: the 1% commission,
 *     the 3% WHT, the min-฿1,000 net gate, and the Σ(fTotalPrice − fDiscount)
 *     accumulator. This is the load-bearing money logic; it must be exact.
 *
 *  B. DB CONTRACT (sentinel-scoped) — seeds a throwaway sales team
 *     (tb_users.coid = SENTINEL_COID), a forwarder per earned row, and the
 *     tb_user_sales earn-rows, then asserts:
 *       1. the SUMMARY read (earned-minus-withdrawn) sums the unpaid rows
 *          (usstatus='1') × 1% − 3% to the expected net,
 *       2. simulating a WITHDRAWAL — the exact writes submitSalesWithdrawal
 *          does (INSERT tb_user_sales_admin_pay + tb_user_sales_pay + flip
 *          tb_user_sales.usstatus='2') — makes the claimed rows drop out of
 *          the "earned-minus-withdrawn" figure (so a re-summary returns less),
 *       3. the stored tb_user_sales_admin_pay.amount equals the net.
 *
 * Why not invoke submitSalesWithdrawal directly? It is a "use server" action
 * that calls getCurrentUserWithProfile() (cookie-bound) + resolveSalesAgent()
 * (whitelist of the 4 REAL teams) — neither runs under tsx. So, exactly like
 * tests/qa-flows/wallet-delta.ts, we exercise the CONTRACT against the tables
 * with the service-role client + assert the real row deltas. The pure-math
 * import (A) pins the exact commission arithmetic the action uses.
 *
 * Everything operates on ONE sentinel coid (SENTINEL_COID) + sentinel member
 * codes — teardown refuses to touch anything else.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node <22 lacks native WebSocket — supabase-js realtime constructor errors at
// new RealtimeClient() unless we polyfill globalThis.WebSocket before createClient.
// (No-op on Node ≥22 / Bun / browsers.)
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

import {
  computeCommission,
  sumGross,
  SALES_MIN_WITHDRAWAL_THB,
  SALES_WHT_RATE,
} from "@/lib/sales-commission/calc";

// ────────────────────────────────────────────────────────────────────────
// Tiny assert harness (same shape as wallet-delta.ts)
// ────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function approxEq(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) < eps;
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ════════════════════════════════════════════════════════════════════════
// A. PURE MATH
// ════════════════════════════════════════════════════════════════════════

function testPureMath() {
  section("🧮 A. pure commission math (lib/sales-commission/calc.ts)");

  // The legacy `percen` for every VIP team is 0.01 (1%).
  const PERCEN = 0.01;

  // ── sumGross — Σ(fTotalPrice − fDiscount) ──
  const grossRows = [
    { ftotalprice: 100_000, fdiscount: 0 },
    { ftotalprice: 50_000, fdiscount: 5_000 }, // net 45,000
    { ftotalprice: "10000.50", fdiscount: "0.50" }, // string columns → 10,000
  ];
  const gross = sumGross(grossRows);
  check(
    "sumGross sums (fTotalPrice − fDiscount) across rows incl. string cols",
    approxEq(gross, 155_000),
    `got ${gross}, expected 155000`,
  );

  // ── computeCommission — 1% then −3% WHT ──
  // gross 155,000 → commission 1,550 → wht 46.50 → net 1,503.50
  const b1 = computeCommission(155_000, PERCEN);
  check("commission = gross × 1%", approxEq(b1.commission, 1_550), `got ${b1.commission}`);
  check(
    `wht = commission × ${SALES_WHT_RATE} (3%)`,
    approxEq(b1.wht, 46.5),
    `got ${b1.wht}`,
  );
  check("net = commission − wht", approxEq(b1.net, 1_503.5), `got ${b1.net}`);
  check("eligible when net ≥ 1,000", b1.eligible === true);

  // ── min-1,000 gate: just BELOW ──
  // We want net just under 1,000. net = gross*0.01*0.97. For net=999.99 →
  // gross = 999.99 / 0.0097 ≈ 103,091.75. Use a gross that yields net < 1000.
  const belowGross = 100_000; // commission 1,000 → wht 30 → net 970 (< 1,000)
  const bBelow = computeCommission(belowGross, PERCEN);
  check(
    "net below 1,000 → NOT eligible (gross 100,000 → net 970)",
    bBelow.eligible === false && approxEq(bBelow.net, 970),
    `net=${bBelow.net} eligible=${bBelow.eligible}`,
  );

  // ── min-1,000 gate: EXACTLY at the boundary ──
  // net = 1,000 exactly. gross*0.01*0.97 = 1000 → gross = 1000/0.0097 =
  // 103,092.7835… Use gross that makes net land exactly 1,000 after 2dp round.
  // commission = gross*0.01; net = round2(commission - round2(commission*0.03)).
  // Solve: pick commission = 1030.93 → wht round2(30.9279)=30.93 → net 1000.00.
  // commission 1030.93 ⇒ gross 103,093.
  const boundaryGross = 103_093;
  const bBoundary = computeCommission(boundaryGross, PERCEN);
  check(
    "net == exactly 1,000 → eligible (boundary inclusive ≥)",
    bBoundary.eligible === true && bBoundary.net >= SALES_MIN_WITHDRAWAL_THB,
    `net=${bBoundary.net} eligible=${bBoundary.eligible}`,
  );

  // ── zero / empty ──
  const bZero = computeCommission(0, PERCEN);
  check(
    "zero gross → zeroed breakdown + not eligible",
    bZero.gross === 0 && bZero.commission === 0 && bZero.net === 0 && bZero.eligible === false,
  );

  // ── float-dust guard: a gross that would float-drift stays exact at 2dp ──
  const bDust = computeCommission(105_010.1, PERCEN); // commission 1050.101 → 1050.10
  check(
    "2dp rounding keeps commission/net clean (no float dust)",
    approxEq(bDust.commission, 1_050.1) && Number.isFinite(bDust.net),
    `commission=${bDust.commission}`,
  );
}

// ════════════════════════════════════════════════════════════════════════
// B. DB CONTRACT (sentinel-scoped)
// ════════════════════════════════════════════════════════════════════════

// Sentinels: tb_users.userID + tb_users.coID + tb_user_sales*.useridmain are
// all varchar(10) → every code here MUST be ≤10 chars.
const SENTINEL_COID = "QAFLWSALES"; // (10) the throwaway "team" — never a real coid
const SENTINEL_AGENT = "QAFLWAGENT"; // (10) the throwaway team-leader member code
const SENTINEL_MEMBERS = ["QAFLWM1", "QAFLWM2"]; // throwaway team members
const PERCEN = 0.01;

/** Forwarder rows to seed — id, owner (team member), ftotalprice, fdiscount. */
const FORWARDERS = [
  { id: 990_001_001, userid: "QAFLWM1", ftotalprice: 60_000, fdiscount: 0 }, // gross 60,000
  { id: 990_001_002, userid: "QAFLWM2", ftotalprice: 45_000, fdiscount: 5_000 }, // gross 40,000
];
// total team gross = 100,000 → commission 1,000 → wht 30 → net 970 (BELOW gate)
// We add a third forwarder to push it over the gate.
const FORWARDER_BIG = { id: 990_001_003, userid: "QAFLWM1", ftotalprice: 100_000, fdiscount: 0 };
// with the big one: gross 200,000 → commission 2,000 → wht 60 → net 1,940 (eligible)

async function seedSalesTeam(admin: SupabaseClient) {
  await teardownSalesTeam(admin, { quiet: true });

  const nowIso = new Date().toISOString();

  // tb_users — the team members (coID = SENTINEL_COID). Many NOT NULL cols.
  // tb_users was camelCase-renamed in batch 1 → keys must be camelCase
  // (verified vs the live schema: userID / coID / userTel / …). The
  // tb_user_sales family is still lowercase (NOT renamed).
  const baseUser = {
    // userTel has a UNIQUE index → distinct per member (set in the loop).
    userStatus: "1",
    userPass: "qa-gate-no-login",
    userName: "QA",
    userLastName: "SalesFlow",
    userPicture: "user.jpg",
    coID: SENTINEL_COID,
    userLineNotify: "",
    userCompany: "0",
    userComparison: "0",
    userComparisonValue: 0,
    userCredit: "0",
    userCreditValue: 0,
    userCreditDate: 0,
    shopUser: "0",
    channel: "0", // lowercase — NOT in the camelCase batch-1 rename
    userRecom: "",
    userAddressID: "",
    userTransportType: "1",
    userShipBy: "",
    userPayMethod: "1",
    userNote: "qa-flow commission gate (throwaway)",
    userActive: "1",
    userLineIDOA: "",
    companyCustomer: "0",
    userRegistered: nowIso,
  };
  for (let i = 0; i < SENTINEL_MEMBERS.length; i++) {
    const m = SENTINEL_MEMBERS[i];
    // Distinct sentinel phone (unique index) — 09990000NN, NN = member index.
    const userTel = `099900000${i}`;
    const { error } = await admin
      .from("tb_users")
      .insert({ ...baseUser, userID: m, userTel });
    if (error) throw new Error(`seed tb_users ${m} failed: ${error.message}`);
  }

  // tb_forwarder — one per earned row. Many NOT NULL numeric cols → fill 0.
  const allForwarders = [...FORWARDERS, FORWARDER_BIG];
  for (const f of allForwarders) {
    const { error } = await admin.from("tb_forwarder").insert(
      buildForwarderRow(f.id, f.userid, f.ftotalprice, f.fdiscount, nowIso),
    );
    if (error) throw new Error(`seed tb_forwarder ${f.id} failed: ${error.message}`);
  }

  // tb_user_sales — the earned rows (usstatus='1' unpaid), one per forwarder.
  for (const f of allForwarders) {
    const { error } = await admin.from("tb_user_sales").insert({
      useridmain: SENTINEL_COID,
      userid: f.userid,
      idf: f.id,
      date: nowIso,
      usstatus: "1",
    });
    if (error) throw new Error(`seed tb_user_sales idf=${f.id} failed: ${error.message}`);
  }

  console.log(`  ✓ seeded sentinel team ${SENTINEL_COID}: ${SENTINEL_MEMBERS.length} members, ${allForwarders.length} earned rows`);
}

/**
 * A tb_forwarder row with every NOT-NULL column filled — modelled on a real
 * delivered (fstatus='7') row (tb_forwarder is all-lowercase · NOT renamed).
 * String cols → "" / numeric → 0 by default; we override only the fields the
 * commission math reads (ftotalprice / fdiscount) + the identity keys.
 */
function buildForwarderRow(
  id: number,
  userid: string,
  ftotalprice: number,
  fdiscount: number,
  nowIso: string,
): Record<string, unknown> {
  const STR0 = "";
  const dateOnly = nowIso.slice(0, 10);
  return {
    id,
    userid,
    fdate: nowIso,
    fstatus: "7", // delivered — the earn-trigger condition
    fdatestatus3: nowIso,
    fdatestatus4: nowIso,
    fdatestatus5: nowIso,
    fdatestatus7: nowIso, // the delivery completion timestamp
    fstatuscaradminon: STR0,
    fstatuscaroff: STR0,
    fstatuscaradminoff: STR0,
    printstatus1: "0",
    printstatus2: "0",
    printstatus3: "0",
    printstatus4: STR0,
    fdateadminstatus: nowIso,
    fwarehousechina: "1",
    fwarehousename: STR0,
    ftransporttype: "1",
    fcabinetnumber: STR0,
    ftrackingchn: `QAFTRK${id}`,
    fdatetothai: dateOnly,
    fshipby: "11",
    ffreeshipping: STR0,
    ftrackingth: "-",
    famount: 1,
    fdetail: "qa-flow commission gate (throwaway)",
    fnoteuser: STR0,
    fnoteuserread: STR0,
    fcover: STR0,
    fphotoend: STR0,
    fproductstype: "2",
    fweight: 0,
    fwidth: 0,
    flength: 0,
    fheight: 0,
    fvolume: 0,
    customratekg: 0,
    customratecbm: 0,
    customrate: "0",
    frefprice: "1",
    frefrate: 0,
    fcostrefrate: 0,
    ftransportprice: 0,
    fpriceupdate: 0,
    fdiscount,
    fshippingservice: 0,
    ftotalprice,
    fcosttotalprice: 0,
    fcosttotalpricesheet: 0,
    fprofittransportchn: 0,
    fprofitpriceupdate: 0,
    fprofittotal: 0,
    faddressname: "QA",
    faddresslastname: "FlowSales",
    faddressno: "-",
    faddresssubdistrict: "-",
    faddressdistrict: "-",
    faddressprovince: "-",
    faddresszipcode: "10000",
    faddressnote: STR0,
    faddresstel: "0000000000",
    faddresstel2: STR0,
    faddresslatitude: 0,
    faddresslongitude: 0,
    adminid: "qa",
    adminidcreator: "qa",
    adminidkey: STR0,
    flockdate: nowIso,
    adminidupdate: "qa",
    session: STR0,
    reforder: STR0,
    fcredit: STR0,
    fusercompany: STR0,
    fsendsms1day: STR0,
    fsendsms3day: STR0,
    fsendsms3eday: STR0,
    paymethod: STR0,
    crate: STR0,
    pricecrate: 0,
    fqc: STR0,
    fqcprice: 0,
    ftransportpricechnthb: 0,
    pricemore: STR0,
    priceother: 0,
    linkapiorder: STR0,
    subuserid: STR0,
  };
}

/**
 * The SUMMARY read, replicated 1:1 from getSalesWithdrawalSummary: sum
 * Σ(fTotalPrice − fDiscount) over the team's UNPAID (usstatus='1') earned
 * rows, then 1% − 3% WHT.
 */
async function readEarnedMinusWithdrawn(admin: SupabaseClient) {
  // team members (tb_users is camelCase: userID / coID)
  const { data: team } = await admin
    .from("tb_users")
    .select("userID")
    .eq("coID", SENTINEL_COID);
  const teamIds = new Set(((team ?? []) as { userID: string }[]).map((u) => u.userID));

  // unpaid earned rows
  const { data: us } = await admin
    .from("tb_user_sales")
    .select("id, idf")
    .eq("useridmain", SENTINEL_COID)
    .eq("usstatus", "1");
  const usRows = (us ?? []) as { id: number; idf: number }[];

  // forwarders for those rows
  const fwdIds = [...new Set(usRows.map((r) => r.idf))];
  let grossRows: { ftotalprice: number | string | null; fdiscount: number | string | null }[] = [];
  if (fwdIds.length > 0) {
    const { data: fwd } = await admin
      .from("tb_forwarder")
      .select("id, userid, ftotalprice, fdiscount")
      .in("id", fwdIds);
    grossRows = ((fwd ?? []) as {
      userid: string | null;
      ftotalprice: number | string | null;
      fdiscount: number | string | null;
    }[]).filter((f) => f.userid != null && teamIds.has(f.userid));
  }
  const gross = sumGross(grossRows);
  return { breakdown: computeCommission(gross, PERCEN), unpaidIds: usRows.map((r) => r.id) };
}

/**
 * Simulate a WITHDRAWAL — the exact writes submitSalesWithdrawal performs:
 * INSERT tb_user_sales_admin_pay (status='2', amount=net) → INSERT
 * tb_user_sales_pay links → flip tb_user_sales.usstatus='2'.
 */
async function simulateWithdraw(
  admin: SupabaseClient,
  usIds: number[],
  net: number,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: header, error: hErr } = await admin
    .from("tb_user_sales_admin_pay")
    .insert({
      useridmain: SENTINEL_COID,
      amount: net,
      imagesslip: "",
      file: `${SENTINEL_AGENT}/sales_withdraw/qa.pdf`,
      dateslip: nowIso,
      date: nowIso,
      status: "2",
      admincreate: SENTINEL_AGENT,
      name_blank: "ไทยพาณิชย์",
      no_blank: "0000000000",
      name_account: "QA FlowSales",
    })
    .select("id")
    .single<{ id: number }>();
  if (hErr || !header) throw new Error(`withdraw header insert failed: ${hErr?.message}`);
  const idusap = header.id;

  const links = usIds.map((idus) => ({ idus, idusap }));
  const { error: lErr } = await admin.from("tb_user_sales_pay").insert(links);
  if (lErr) throw new Error(`withdraw links insert failed: ${lErr.message}`);

  const { error: fErr } = await admin
    .from("tb_user_sales")
    .update({ usstatus: "2" })
    .in("id", usIds);
  if (fErr) throw new Error(`withdraw flip failed: ${fErr.message}`);

  return idusap;
}

async function testDbContract(admin: SupabaseClient) {
  section("🗄  B. DB contract (sentinel team — earned → withdraw → re-summary)");

  await seedSalesTeam(admin);

  // ── 1. Summary BEFORE withdraw — earned-minus-withdrawn over 3 forwarders.
  //    gross = 60,000 + 40,000 + 100,000 = 200,000 → commission 2,000 →
  //    wht 60 → net 1,940 (eligible).
  const before = await readEarnedMinusWithdrawn(admin);
  check(
    "summary gross sums team's unpaid earned rows (200,000)",
    approxEq(before.breakdown.gross, 200_000),
    `got ${before.breakdown.gross}`,
  );
  check(
    "summary commission = 2,000 (1%)",
    approxEq(before.breakdown.commission, 2_000),
    `got ${before.breakdown.commission}`,
  );
  check(
    "summary wht = 60 (3%)",
    approxEq(before.breakdown.wht, 60),
    `got ${before.breakdown.wht}`,
  );
  check(
    "summary net = 1,940 + eligible (≥ 1,000)",
    approxEq(before.breakdown.net, 1_940) && before.breakdown.eligible === true,
    `net=${before.breakdown.net} eligible=${before.breakdown.eligible}`,
  );
  check("summary surfaces 3 unpaid rows to claim", before.unpaidIds.length === 3);

  // ── 2. The two SMALLER forwarders alone (60,000 + 40,000 = gross 100,000
  //    → net 970) are BELOW the 1,000 gate, so the real action would REJECT
  //    that partial selection — assert the gate computation fires. ──
  const smallGross = sumGross([
    { ftotalprice: FORWARDERS[0].ftotalprice, fdiscount: FORWARDERS[0].fdiscount },
    { ftotalprice: FORWARDERS[1].ftotalprice, fdiscount: FORWARDERS[1].fdiscount },
  ]);
  const smallBreakdown = computeCommission(smallGross, PERCEN);
  check(
    "selecting only the two small forwarders → net 970, gate would REJECT",
    approxEq(smallBreakdown.net, 970) && smallBreakdown.eligible === false,
    `net=${smallBreakdown.net} eligible=${smallBreakdown.eligible}`,
  );

  // ── 3. Withdraw ALL three (net 1,940, eligible) — the real success path. ──
  const idusap = await simulateWithdraw(admin, before.unpaidIds, before.breakdown.net);
  check("withdraw created a tb_user_sales_admin_pay header", idusap > 0);

  // assert stored amount == net
  const { data: hdr } = await admin
    .from("tb_user_sales_admin_pay")
    .select("amount, status, useridmain")
    .eq("id", idusap)
    .single<{ amount: number | string; status: string; useridmain: string }>();
  check(
    "stored amount == net (1,940) and status == '2' (รอดำเนินการ)",
    hdr != null && approxEq(Number(hdr.amount), 1_940) && hdr.status === "2",
    `amount=${hdr?.amount} status=${hdr?.status}`,
  );

  // assert the link rows exist
  const { data: links } = await admin
    .from("tb_user_sales_pay")
    .select("idus")
    .eq("idusap", idusap);
  check(
    "withdraw linked all 3 earned rows (tb_user_sales_pay)",
    ((links ?? []) as unknown[]).length === 3,
  );

  // ── 4. Summary AFTER withdraw — the claimed rows flipped to usstatus='2',
  //    so earned-minus-withdrawn must now be ZERO. ──
  const after = await readEarnedMinusWithdrawn(admin);
  check(
    "earned-minus-withdrawn drops to 0 after withdraw (rows now usstatus='2')",
    after.breakdown.gross === 0 && after.breakdown.net === 0 && after.unpaidIds.length === 0,
    `gross=${after.breakdown.gross} net=${after.breakdown.net} unpaid=${after.unpaidIds.length}`,
  );

  // ── 5. Dedup guard — the claimed rows now have tb_user_sales_pay rows, so a
  //    second withdraw of the same ids must be refused. ──
  const { data: dup } = await admin
    .from("tb_user_sales_pay")
    .select("id")
    .in("idus", before.unpaidIds);
  check(
    "dedup: all 3 earned rows now linked (a re-withdraw would be refused)",
    ((dup ?? []) as unknown[]).length === 3,
  );
}

// ════════════════════════════════════════════════════════════════════════
// Teardown — strictly scoped to the sentinel
// ════════════════════════════════════════════════════════════════════════

async function teardownSalesTeam(admin: SupabaseClient, opts?: { quiet?: boolean }) {
  if (SENTINEL_COID !== "QAFLWSALES") {
    throw new Error("teardown refused — SENTINEL_COID is not the sentinel 'QAFLWSALES'");
  }
  if (!opts?.quiet) console.log("\n🧹 teardown (sentinel only)");
  try {
    // payouts for the sentinel team (+ their pay links)
    const { data: pays } = await admin
      .from("tb_user_sales_admin_pay")
      .select("id")
      .eq("useridmain", SENTINEL_COID);
    const payIds = ((pays ?? []) as { id: number }[]).map((p) => p.id);
    if (payIds.length > 0) {
      await admin.from("tb_user_sales_pay").delete().in("idusap", payIds);
      await admin.from("tb_user_sales_admin_pay").delete().in("id", payIds);
    }
    await admin.from("tb_user_sales").delete().eq("useridmain", SENTINEL_COID);
    // forwarders + members
    const fwdIds = [...FORWARDERS.map((f) => f.id), FORWARDER_BIG.id];
    await admin.from("tb_forwarder").delete().in("id", fwdIds);
    await admin.from("tb_users").delete().in("userID", SENTINEL_MEMBERS);
    if (!opts?.quiet) console.log(`  ✓ removed all sentinel ${SENTINEL_COID} rows`);
  } catch (e) {
    if (!opts?.quiet) console.error("  ✗ teardown error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== P0-23 GATE — customer-commission tb_user_sales contract (ADR-0020) ===");

  // A. pure math — always runs (no DB).
  testPureMath();

  // B. DB contract — requires a live DB.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "\n✗ SUPABASE env unset — the DB-contract half (B) REQUIRES a live DB.\n" +
        "  Run it as:  pnpm tsx --env-file=.env.local actions/commissions-tb.test.ts",
    );
    // Pure math still asserted; fail loud so "skipped" isn't mistaken for green.
    process.exit(failed > 0 ? 1 : 1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await testDbContract(admin);
  } finally {
    await teardownSalesTeam(admin);
  }

  console.log(`\n=== RESULT: ${passed} passed / ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\n✗ FATAL:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
