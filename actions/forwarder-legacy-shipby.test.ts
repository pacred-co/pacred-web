/**
 * ════════════════════════════════════════════════════════════════════════
 * P1-18 · ship-by carrier picker + free-area gate — DB-connected tsx test
 * (getShipByOptions + checkFreeArea in actions/forwarder-legacy.ts)
 * ════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS ASSERTS (the faithful port of getShipBy.php + checkFreeArea.php)
 * ------------------------------------------------------------------------
 *   getShipByOptions(addressID):
 *     (1) free-area ZIP  (10160 BKK) → SHORT list: exactly Flash(2) + J&T(24)
 *     (2) out-of-area ZIP (50000 CM) → FULL list (>2 couriers, incl. 2 + 24)
 *     (3) addressID="PCS"            → warehousePickup=true, options=[]
 *     (4) saved userShipBy / userPayMethod surfaced from tb_users
 *   checkFreeArea(addressID):
 *     (5) free-area ZIP (10160)      → inFreeArea=true
 *     (6) out-of-area ZIP (50000)    → inFreeArea=false
 *
 * WHY RE-IMPLEMENT THE ACTION BODY (not await the action)
 * -------------------------------------------------------
 * getShipByOptions / checkFreeArea call getCurrentUserWithProfile() which is
 * cookie-bound (Next.js request scope) — awaited from a plain tsx process it
 * throws. So, exactly like tests/qa-flows/wallet-delta.ts, this gate binds to
 * the actions TWO ways:
 *   1. COMPILE-TIME — `import type` the actions + pin their signatures via
 *      `satisfies` in __contract below; rename/param-drift breaks the build.
 *   2. RUN-TIME — perform the EXACT same tb_address ZIP read + isFreeShippingZip
 *      decision the action bodies perform, against a seeded sentinel user.
 *
 * SAFETY — operates only on sentinel userid 'QASHIPBYTEST' + addressids in a
 * reserved high range; seed at start, guarded teardown at end (refuses to
 * delete any row whose userid !== the sentinel).
 *
 * RUN:  pnpm tsx --env-file=.env.local actions/forwarder-legacy-shipby.test.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node <22 lacks native WebSocket — supabase-js realtime errors at
// new RealtimeClient() unless we polyfill globalThis.WebSocket first.
// (No-op on Node ≥22 / Bun / browsers.)
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

// Compile-time coupling — `import type` is erased at runtime (no "use server"
// / next/cache side effects pulled in) yet still breaks the build if a
// signature drifts. Their bodies are NEVER invoked from this process.
import type {
  getShipByOptions,
  checkFreeArea,
  GetShipByOptionsResult,
  CheckFreeAreaResult,
} from "./forwarder-legacy";
// `isFreeShippingZip` IS the SOT the actions use — re-use it so the test
// proves the same allowlist, not a hand-copied one.
import { isFreeShippingZip } from "@/lib/bkk-zip";

// Pin the action signatures (renamed/param-changed → this file stops compiling).
const __contract = {} as {
  getShipByOptions: typeof getShipByOptions;
  checkFreeArea: typeof checkFreeArea;
} satisfies Record<string, unknown>;
void __contract;

// ── env / client ─────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.log(
    "⏭  SKIP forwarder-legacy-shipby.test — NEXT_PUBLIC_SUPABASE_URL / " +
      "SUPABASE_SERVICE_ROLE_KEY not set (run with --env-file=.env.local).",
  );
  process.exit(0);
}

const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_USERID = "QASHIP9988"; // tb_users.userid is varchar(10) — keep ≤10
const ADDR_FREE = 998800001; // 10160 BKK — inside free-shipping allowlist
const ADDR_OUT = 998800002; // 50000 Chiang Mai — outside allowlist
const ZIP_FREE = "10160";
const ZIP_OUT = "50000";
const SAVED_SHIPBY = "24"; // pretend the customer last shipped via J&T
const SAVED_PAYMETHOD = "2"; // เก็บปลายทาง

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── re-implemented action bodies (verbatim logic from forwarder-legacy.ts) ──

const SHIP_BY_OUT_OF_AREA = [
  "2", "3", "21", "6", "7", "9", "10", "12", "13", "14", "15", "16", "17",
  "18", "19", "20", "22", "23", "24", "25", "26",
];
const SHIP_BY_IN_FREE_AREA = ["2", "24"];

async function runGetShipByOptions(
  addressID: string,
): Promise<GetShipByOptionsResult> {
  const aid = (addressID ?? "").trim();
  if (!aid) return { ok: false, error: "missing_address_id" };

  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select('"userShipBy", "userPayMethod"')
    .eq("userID", TEST_USERID)
    .maybeSingle<{ userShipBy: string | null; userPayMethod: string | null }>();
  if (userErr) return { ok: false, error: userErr.message };
  const userShipBy = userRow?.userShipBy ?? "";
  const userPayMethod = userRow?.userPayMethod ?? "";

  if (aid === "PCS") {
    return {
      ok: true,
      options: [],
      inFreeArea: false,
      warehousePickup: true,
      userShipBy,
      userPayMethod,
    };
  }

  const { data: addr, error: addrErr } = await admin
    .from("tb_address")
    .select("addresszipcode")
    .eq("addressid", aid)
    .eq("userid", TEST_USERID)
    .maybeSingle<{ addresszipcode: string | null }>();
  if (addrErr) return { ok: false, error: addrErr.message };
  if (!addr) {
    return {
      ok: true,
      options: [],
      inFreeArea: false,
      warehousePickup: false,
      userShipBy,
      userPayMethod,
    };
  }

  const inFreeArea = isFreeShippingZip(addr.addresszipcode);
  const options = (inFreeArea ? SHIP_BY_IN_FREE_AREA : SHIP_BY_OUT_OF_AREA).map(
    (id) => ({ id, name: id }),
  );
  return {
    ok: true,
    options,
    inFreeArea,
    warehousePickup: false,
    userShipBy,
    userPayMethod,
  };
}

async function runCheckFreeArea(
  addressID: string,
): Promise<CheckFreeAreaResult> {
  const aid = (addressID ?? "").trim();
  if (!aid) return { ok: false, error: "missing_address_id" };
  if (aid === "PCS") return { ok: true, inFreeArea: false, zip: "" };

  const { data: addr, error: addrErr } = await admin
    .from("tb_address")
    .select("addresszipcode")
    .eq("addressid", aid)
    .eq("userid", TEST_USERID)
    .maybeSingle<{ addresszipcode: string | null }>();
  if (addrErr) return { ok: false, error: addrErr.message };
  if (!addr) return { ok: true, inFreeArea: false, zip: "" };

  const zip = (addr.addresszipcode ?? "").trim();
  return { ok: true, inFreeArea: isFreeShippingZip(zip), zip };
}

// ── seed / teardown ──────────────────────────────────────────

async function seed() {
  // tb_users sentinel. PROD `tb_users` uses camelCase columns (the 2026-05-27
  // batch-1 rename) — probed live: ID,userID,userShipBy,userPayMethod,…. The
  // two columns the actions read MUST be meaningful; the rest satisfy NOT-NULL
  // with empty/zero defaults. Upsert on userID so a re-run is idempotent.
  const userRow: Record<string, unknown> = {
    userID: TEST_USERID,
    userShipBy: SAVED_SHIPBY,
    userPayMethod: SAVED_PAYMETHOD,
    // userTel has a UNIQUE index — use an improbable sentinel number so the
    // seed never collides with a real customer who has "" / a real phone.
    userTel: "0999000088",
  };
  // Only text/varchar columns get "" — date columns (userRegistered /
  // userBirthday / userLastLogin / userRecoverDate) reject "" so we omit them
  // (nullable on prod). userCreditDate is an int (set below).
  for (const col of [
    "userStatus", "userPass", "userName",
    "userLastName", "userEmail", "userLineID", "userFacebook",
    "userSex", "userRegisterWith", "userPicture", "userRecoverKey",
    "coID", "adminID", "adminIDSale", "userLineNotify", "userCompany",
    "shopUser", "channel", "userRecom", "userAddressID",
    "userTransportType", "userNote", "userActive", "userLineIDOA",
    "companyCustomer",
  ]) {
    userRow[col] = "";
  }
  userRow["pcs_logged"] = 0;
  userRow["userComparison"] = "";
  userRow["userComparisonValue"] = 0;
  userRow["userCredit"] = "0";
  userRow["userCreditValue"] = 0;
  userRow["userCreditDate"] = 0;
  const { error: uErr } = await admin
    .from("tb_users")
    .upsert(userRow, { onConflict: "userID" });
  if (uErr) {
    console.log(`⚠️  seed tb_users failed: ${uErr.message}`);
    console.log(
      "   (some NOT-NULL columns may differ; the test still proves the " +
        "free-area decision via the address rows if those seed.)",
    );
  }

  // Two address rows: one inside the free-shipping allowlist, one outside.
  const baseAddr = {
    addressstatus: "1",
    addressname: "QA",
    addresslastname: "ShipBy",
    addresstel: "0000000000",
    addressno: "1",
    addresssubdistrict: "x",
    addressdistrict: "x",
    addressprovince: "x",
    addressnote: "",
    userid: TEST_USERID,
    adminid: "",
    latitude: 0,
    longitude: 0,
  };
  const { error: aErr } = await admin.from("tb_address").upsert(
    [
      { ...baseAddr, addressid: ADDR_FREE, addresszipcode: ZIP_FREE },
      { ...baseAddr, addressid: ADDR_OUT, addresszipcode: ZIP_OUT },
    ],
    { onConflict: "addressid" },
  );
  if (aErr) throw new Error(`seed tb_address failed: ${aErr.message}`);
}

async function teardown() {
  // Guarded deletes — ONLY the sentinel userid's rows. Note casing differs
  // per table on prod: tb_address.userid (lowercase) vs tb_users.userID.
  await admin.from("tb_address").delete().eq("userid", TEST_USERID);
  await admin.from("tb_users").delete().eq("userID", TEST_USERID);
}

// ── run ──────────────────────────────────────────────────────

async function main() {
  // Sanity: the allowlist SOT must agree with our test fixtures.
  check(
    "fixture sanity — isFreeShippingZip(10160)=true, (50000)=false",
    isFreeShippingZip(ZIP_FREE) === true && isFreeShippingZip(ZIP_OUT) === false,
  );

  await teardown(); // clean any leftover from a crashed prior run
  await seed();

  try {
    // (1) free-area ZIP → SHORT list (Flash + J&T only)
    const free = await runGetShipByOptions(String(ADDR_FREE));
    check(
      "(1) free-area address → ok",
      free.ok === true,
      free.ok ? "" : free.error,
    );
    if (free.ok) {
      const ids = free.options.map((o) => o.id).sort();
      check(
        "(1) free-area → exactly Flash(2)+J&T(24)",
        free.inFreeArea === true &&
          ids.length === 2 &&
          ids.join(",") === "2,24",
        `inFreeArea=${free.inFreeArea} ids=[${ids.join(",")}]`,
      );
      check(
        "(4) saved userShipBy / userPayMethod surfaced",
        free.userShipBy === SAVED_SHIPBY &&
          free.userPayMethod === SAVED_PAYMETHOD,
        `shipBy=${free.userShipBy} payMethod=${free.userPayMethod}`,
      );
    }

    // (2) out-of-area ZIP → FULL list
    const out = await runGetShipByOptions(String(ADDR_OUT));
    check(
      "(2) out-of-area address → ok",
      out.ok === true,
      out.ok ? "" : out.error,
    );
    if (out.ok) {
      const ids = out.options.map((o) => o.id);
      check(
        "(2) out-of-area → full list (>2 couriers, incl. 2 & 24)",
        out.inFreeArea === false &&
          ids.length > 2 &&
          ids.includes("2") &&
          ids.includes("24"),
        `inFreeArea=${out.inFreeArea} count=${ids.length}`,
      );
    }

    // (3) "PCS" warehouse pickup → no options
    const pcs = await runGetShipByOptions("PCS");
    check(
      "(3) PCS pickup → warehousePickup=true, options=[]",
      pcs.ok === true &&
        pcs.warehousePickup === true &&
        pcs.options.length === 0,
      pcs.ok ? `warehousePickup=${pcs.warehousePickup}` : pcs.error,
    );

    // (5) + (6) checkFreeArea
    const cfaFree = await runCheckFreeArea(String(ADDR_FREE));
    check(
      "(5) checkFreeArea(10160) → inFreeArea=true",
      cfaFree.ok === true && cfaFree.inFreeArea === true,
      cfaFree.ok ? `zip=${cfaFree.zip}` : cfaFree.error,
    );
    const cfaOut = await runCheckFreeArea(String(ADDR_OUT));
    check(
      "(6) checkFreeArea(50000) → inFreeArea=false",
      cfaOut.ok === true && cfaOut.inFreeArea === false,
      cfaOut.ok ? `zip=${cfaOut.zip}` : cfaOut.error,
    );
  } finally {
    await teardown();
  }

  console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("💥 forwarder-legacy-shipby.test crashed:", e);
  process.exit(1);
});
