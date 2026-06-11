/**
 * Backfill orphan profiles → tb_users mirror rows.
 *
 * An "orphan" here = a CUSTOMER profile (PR member_code · NOT staff) that has
 * no matching tb_users row. The signup verify-and-rollback hardening
 * (2026-06-11 · actions/auth.ts + lib/auth/legacy-bridge-tb-users.ts) stops
 * NEW orphans being created; this script reconciles the ones already stranded.
 *
 * ⚠️ SAFETY — this script MINTS tb_users rows. Run by the integrator only,
 * dry-run FIRST, ideally with an --only allowlist. It is dry-run BY DEFAULT
 * (rolls back the whole transaction unless APPLY=true).
 *
 * 2026-06-11 hardening (the audit's 4 broken-link codes are the intended use):
 *   1. ORPHAN SCOPE — exclude staff (employee_code set) + non-PR codes from the
 *      WHERE clause. Before this, a run would have minted customer-shaped
 *      tb_users rows for staff profiles + any non-`PR<n>` code = new pollution.
 *   2. --only allowlist — `node scripts/backfill-orphan-tb-users.mjs --only PR10820,PR1282`
 *      restricts the run to a hand-checked set (the safe way to fix the 4
 *      broken-link codes without touching anything else).
 *   3. FULL-CITIZEN seed — a reconciled row also gets its tb_wallet +
 *      tb_cash_back money-plane rows AND a round-robin adminIDSale / adminIDCS
 *      owner (mirrors insertLegacyTbUserRow / adminCreateCustomer). Without
 *      these a backfilled customer is a functional orphan (no wallet ledger,
 *      rep-less).
 *   4. dry-run by default (unchanged).
 *
 * Usage:
 *   PG_PASSWORD=… node scripts/backfill-orphan-tb-users.mjs                      # dry-run, ALL orphans
 *   PG_PASSWORD=… node scripts/backfill-orphan-tb-users.mjs --only PR10820,PR1282  # dry-run, scoped
 *   PG_PASSWORD=… APPLY=true node scripts/backfill-orphan-tb-users.mjs --only PR10820  # APPLY, scoped
 */
import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const DRY = process.env.APPLY !== "true";

// ── --only PRxxx,PRyyy allowlist ─────────────────────────────────────────
function parseOnly(argv) {
  const i = argv.indexOf("--only");
  if (i === -1) return null;
  // Support both `--only PR1,PR2` and `--only=PR1,PR2`.
  const raw = argv[i].includes("=") ? argv[i].split("=")[1] : argv[i + 1];
  if (!raw) return null;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return set.size ? set : null;
}
// Also accept the `--only=…` joined form even if it's the bare token.
function parseOnlyJoined(argv) {
  const tok = argv.find((a) => a.startsWith("--only="));
  if (!tok) return null;
  const set = new Set(
    tok
      .slice("--only=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return set.size ? set : null;
}
const ONLY = parseOnlyJoined(process.argv) ?? parseOnly(process.argv);

// Central fallbacks — keep in sync with lib/admin/sales-rep-central.ts +
// lib/admin/cs-rep-central.ts (a reconciled lead must NEVER be rep-less).
const CENTRAL_SALES = "admin_center";
const CENTRAL_CS = "admin_ploy";

const c = new Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

function e164ToLegacy(s) {
  s = (s || "").trim();
  if (!s) return "";
  if (s.startsWith("+66")) return "0" + s.slice(3);
  return s.slice(0, 13);
}

// ── Round-robin pools (fewest-owned wins · central fallback) ─────────────
// Mirrors lib/admin/assign-sales-rep.ts + assign-cs-rep.ts. We seed the load
// counts from the CURRENT tb_users ownership, then increment locally as we
// insert so a batch run still distributes evenly.
async function buildPool(roleFlag, centralId) {
  const reps = await c.query(
    `select "adminID" from tb_admin where "adminStatusA"='1' and ${roleFlag}='1'`,
  );
  const ids = reps.rows.map((r) => (r.adminID || "").trim()).filter(Boolean);
  const counts = new Map();
  if (ids.length === 0) {
    return { ids: [centralId], counts: new Map([[centralId, 0]]), central: centralId };
  }
  for (const id of ids) counts.set(id, 0);
  const colForFlag = roleFlag === '"adminStatusSale"' ? '"adminIDSale"' : '"adminIDCS"';
  const owned = await c.query(
    `select ${colForFlag} as owner, count(*)::int n from tb_users
       where ${colForFlag} = any($1) and "userActive"='1' and "userStatus"='1'
       group by ${colForFlag}`,
    [ids],
  );
  for (const r of owned.rows) {
    if (r.owner && counts.has(r.owner)) counts.set(r.owner, r.n);
  }
  return { ids, counts, central: centralId };
}
function pickLeastLoaded(pool) {
  let winner = pool.ids[0];
  let best = Number.POSITIVE_INFINITY;
  for (const id of pool.ids) {
    const n = pool.counts.get(id) ?? 0;
    if (n < best) {
      best = n;
      winner = id;
    }
  }
  pool.counts.set(winner, (pool.counts.get(winner) ?? 0) + 1); // local increment
  return winner;
}

const salesPool = await buildPool('"adminStatusSale"', CENTRAL_SALES);
const csPool = await buildPool('"adminStatusCS"', CENTRAL_CS);

// ── Enumerate orphans — CUSTOMER profiles only ───────────────────────────
// Exclude staff (employee_code set) + any non-`PR<n>` code so we never mint a
// customer-shaped tb_users row for a staff/admin profile.
const orphans = await c.query(`
  select p.member_code, p.account_type, p.phone, p.email, p.first_name, p.last_name, p.created_at
  from profiles p
  where not exists (select 1 from tb_users u where u."userID"=p.member_code)
    and (p.employee_code is null or p.employee_code = '')
    and p.member_code ~ '^PR[0-9]+$'
  order by p.created_at asc
`);

let rows = orphans.rows;
if (ONLY) {
  const before = rows.length;
  rows = rows.filter((p) => ONLY.has(p.member_code));
  console.log(`--only filter active: ${ONLY.size} code(s) requested → ${rows.length} of ${before} orphans match.`);
  const missing = [...ONLY].filter((code) => !rows.some((p) => p.member_code === code));
  if (missing.length) {
    console.log(`   ⚠️  requested codes NOT found as customer orphans (already mirrored / staff / non-PR / absent): ${missing.join(", ")}`);
  }
}
console.log(`Found ${rows.length} orphan customer profile(s) to reconcile.\n`);

await c.query("BEGIN");
let ok = 0,
  phoneClash = [],
  fail = [],
  walletSeeded = 0,
  cbSeeded = 0;
for (const p of rows) {
  const code = p.member_code;
  if (!code || code.length > 10) {
    fail.push(`${code} (bad len)`);
    continue;
  }
  const legacyTel = e164ToLegacy(p.phone);
  const isJur = p.account_type === "juristic";

  // Phone-collision pre-check (the bridge's guard) — skip a LIVE owner, but a
  // soft-deleted (userStatus='0') owner must NOT block the backfill (aligns
  // with findLegacyUserIdByPhone + the bridge's pre-check fix).
  const clash = await c.query(
    `select "userID" from tb_users where "userTel"=$1 and "userStatus" <> '0' limit 1`,
    [legacyTel],
  );
  if (clash.rowCount) {
    phoneClash.push(`${code} → phone ${legacyTel} already on ${clash.rows[0].userID}`);
    continue;
  }

  const assignedSale = pickLeastLoaded(salesPool);
  const assignedCs = pickLeastLoaded(csPool);

  await c.query("SAVEPOINT sp");
  try {
    // 1. tb_users mirror — incl. adminIDSale/adminIDCS owners.
    const ins = await c.query(
      `
      INSERT INTO tb_users ("userID","userTel","userStatus","userActive","userPass","userName","userLastName","userEmail","userRegistered","userPicture","coID","userLineNotify","userCompany","userComparison","userComparisonValue","userCredit","userCreditValue","userCreditDate","shopUser","channel","userRecom","userAddressID","userTransportType","userShipBy","userPayMethod","userNote","userLineIDOA","companyCustomer","adminIDSale","adminIDCS")
      VALUES ($1,$2,'1','0','',$3,$4,$5,$6,'user.jpg','PR','',$7,'0','0',0,0,0,'1','','','','','','','','','0',$8,$9)
      ON CONFLICT ("userID") DO NOTHING
    `,
      [
        code,
        legacyTel,
        p.first_name ?? "",
        p.last_name ?? "",
        p.email ?? null,
        p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
        isJur ? "1" : "0",
        assignedSale,
        assignedCs,
      ],
    );
    if (ins.rowCount === 0) {
      // ON CONFLICT DO NOTHING fired — a row already exists under this code
      // (raced / already mirrored). Don't count it + undo the local rep tally.
      salesPool.counts.set(assignedSale, (salesPool.counts.get(assignedSale) ?? 1) - 1);
      csPool.counts.set(assignedCs, (csPool.counts.get(assignedCs) ?? 1) - 1);
      await c.query("RELEASE SAVEPOINT sp");
      continue;
    }
    ok++;

    // 2. tb_wallet money-plane row (wallettotal rides DEFAULT 0.00).
    const w = await c.query(
      `INSERT INTO tb_wallet (userid) VALUES ($1) ON CONFLICT (userid) DO NOTHING`,
      [code],
    );
    if (w.rowCount > 0) walletSeeded++;

    // 3. tb_cash_back row (cbtotal is NOT NULL with no default → set 0).
    const cb = await c.query(
      `INSERT INTO tb_cash_back (userid, cbtotal) VALUES ($1, 0) ON CONFLICT (userid) DO NOTHING`,
      [code],
    );
    if (cb.rowCount > 0) cbSeeded++;
  } catch (e) {
    await c.query("ROLLBACK TO sp");
    salesPool.counts.set(assignedSale, (salesPool.counts.get(assignedSale) ?? 1) - 1);
    csPool.counts.set(assignedCs, (csPool.counts.get(assignedCs) ?? 1) - 1);
    fail.push(`${code}: ${e.code} ${e.message}`);
  }
}
console.log(`✅ tb_users inserted: ${ok}`);
console.log(`   ↳ tb_wallet seeded:    ${walletSeeded}`);
console.log(`   ↳ tb_cash_back seeded: ${cbSeeded}`);
console.log(`⚠️  phone-collision (skipped — phone already live on another code): ${phoneClash.length}`);
phoneClash.forEach((x) => console.log(`     ${x}`));
console.log(`❌ failed: ${fail.length}`);
fail.forEach((x) => console.log(`     ${x}`));

if (DRY) {
  await c.query("ROLLBACK");
  console.log("\n🔸 DRY RUN — rolled back. Re-run with APPLY=true (ideally with --only) to commit.");
} else {
  await c.query("COMMIT");
  const v = await c.query(`select count(*)::int n from tb_users where "coID"='PR' and "userActive"='0'`);
  console.log(`\n✅ COMMITTED. tb_users bridge rows (coID=PR, pending): ${v.rows[0].n}`);
}
await c.end();
