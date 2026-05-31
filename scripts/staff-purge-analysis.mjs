#!/usr/bin/env node
/**
 * staff-purge-analysis.mjs — READ-ONLY FK-landscape probe for the staff purge
 * + re-register plan (ADR-0022 · owner directive 2026-05-31).
 *
 * ⚠️ READ-ONLY. This script issues ONLY GET/count requests against the Supabase
 *    REST API. It NEVER issues DELETE / PATCH / POST / UPSERT. It is safe to run
 *    against production. Its sole job is to print the FK landscape + the
 *    old↔new admin-code mismatch so the owner can fill in the remap map in
 *    docs/runbook/staff-purge-fk-remap-2026-05-31.md.
 *
 * It does NOT execute any part of the purge. The purge itself is hand-run SQL
 * by the owner AFTER review (see the runbook).
 *
 * Usage:
 *   node --env-file=.env.local scripts/staff-purge-analysis.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with:  node --env-file=.env.local scripts/staff-purge-analysis.mjs",
  );
  process.exit(1);
}

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

/** Hard guard: forbid this process from ever building a mutating request. */
function assertReadOnly(method) {
  if (method && method.toUpperCase() !== "GET") {
    throw new Error(`staff-purge-analysis is READ-ONLY — refusing ${method}`);
  }
}

/** Exact row count via Prefer: count=exact + a 0-length range. */
async function count(pathAndQuery) {
  assertReadOnly("GET");
  const res = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
    method: "GET",
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = res.headers.get("content-range") || "";
  const total = cr.includes("/") ? cr.split("/").pop() : "?";
  return total;
}

/** Fetch up to the PostgREST page cap (1000) of rows. */
async function rows(pathAndQuery) {
  assertReadOnly("GET");
  const res = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
    method: "GET",
    headers: H,
  });
  if (!res.ok) return [];
  return res.json();
}

function tally(list, key) {
  const m = new Map();
  for (const r of list) {
    const v = r[key];
    if (v === null || v === undefined || v === "") continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  console.log("=".repeat(72));
  console.log("STAFF-PURGE FK-LANDSCAPE ANALYSIS (read-only)  ·", new Date().toISOString());
  console.log("Target:", URL);
  console.log("=".repeat(72));

  // ---- 1. Admin identity tables -----------------------------------------
  console.log("\n## 1. Admin identity tables");
  console.log("tb_admin  rows =", await count("tb_admin?select=ID&limit=1"));
  console.log("admins    rows =", await count("admins?select=profile_id&limit=1"));
  console.log(
    "admin_contact_extras rows =",
    await count("admin_contact_extras?select=profile_id&limit=1"),
    "  (holds legacy_admin_id — the bridge value tb_users.adminIDSale stores)",
  );

  const tbAdminRows = await rows(
    "tb_admin?select=adminID,adminNickname,adminStatusA,adminDel&limit=1000",
  );
  const tbAdminCodes = new Set(tbAdminRows.map((r) => r.adminID));
  console.log("\ntb_admin.adminID roster (the codes a remap would target as NEW owners):");
  for (const r of tbAdminRows) {
    console.log(
      `  ${String(r.adminID).padEnd(20)} ${r.adminNickname || ""}` +
        ` (statusA=${r.adminStatusA}, del=${JSON.stringify(r.adminDel)})`,
    );
  }

  // ---- 2. FK columns that reference an admin code -----------------------
  console.log("\n## 2. FK columns referencing an admin code (non-empty row counts)");
  // [table, column, note] — count rows where the column itself is non-empty.
  // We select the column being counted (not a generic `id`) because PK names
  // vary (tb_users PK = userID) and selecting a missing column 400s.
  const fk = [
    ["tb_users", "adminIDSale", "customer's sales rep — BLANK REP if orphaned"],
    ["tb_sales_report", "sradminidsale", "monthly rep snapshot — report shows no name if orphaned"],
    ["tb_forwarder", "adminid", "who handled the forwarder (audit/who-did-it)"],
    ["tb_forwarder", "adminidcreator", "forwarder creator stamp"],
    ["tb_forwarder", "adminidupdate", "forwarder last-updater stamp"],
    ["tb_header_order", "adminid", "shop-order handler stamp"],
    ["tb_header_order", "adminidcreate", "shop-order creator stamp"],
    ["tb_header_order", "adminidupdate", "shop-order last-updater stamp"],
    ["tb_payment", "adminid", "yuan-payment handler stamp"],
    ["tb_payment", "payadminidcreator", "yuan-payment creator stamp"],
    ["tb_payment", "adminidupdate", "yuan-payment last-updater stamp"],
    ["tb_wallet_hs", "adminid", "wallet ledger entry handler stamp"],
    ["tb_wallet_hs", "admincreate", "wallet ledger creator stamp"],
    ["tb_wallet_hs", "adminidupdate", "wallet ledger updater stamp"],
    ["tb_receipt", "adminid", "receipt issuer stamp"],
    ["tb_receipt", "adminidprint", "receipt original-print stamp"],
    ["tb_receipt", "adminidprintcopy", "receipt copy-print stamp"],
    ["tb_cnt", "adminIDCreate", "container-payment creator stamp (camelCase!)"],
    ["tb_cnt", "adminIDUpdate", "container-payment updater stamp (camelCase!)"],
    ["tb_user_sales_admin_pay", "admincreate", "agent-commission payout creator stamp"],
  ];
  for (const [t, c, note] of fk) {
    // Select the column itself + filter non-empty; PostgREST needs the column
    // quoted for camelCase identifiers — pass it raw, it tolerates both here.
    const total = await count(`${t}?select=${c}&${c}=neq.&limit=1`).catch(() => "?");
    console.log(`  ${`${t}.${c}`.padEnd(36)} non-empty=${String(total).padStart(7)}  · ${note}`);
  }

  // ---- 3. The mismatch — distinct codes in DATA vs tb_admin -------------
  console.log("\n## 3. Old↔new mismatch (the core problem the re-register must fix)");

  const custRepRows = await rows("tb_users?select=adminIDSale&adminIDSale=neq.&limit=1000");
  const custTally = tally(custRepRows, "adminIDSale");
  console.log(`\n  tb_users.adminIDSale — ${custTally.length} distinct codes (sample of <=1000 rows):`);
  for (const [k, v] of custTally) {
    console.log(`    ${k.padEnd(20)} ${v}  ${tbAdminCodes.has(k) ? "OK in tb_admin" : "** NOT in tb_admin **"}`);
  }

  const repRows = await rows("tb_sales_report?select=sradminidsale&limit=1000");
  const repTally = tally(repRows, "sradminidsale");
  console.log(`\n  tb_sales_report.sradminidsale — ${repTally.length} distinct codes (sample of <=1000):`);
  for (const [k, v] of repTally) {
    console.log(`    ${k.padEnd(20)} ${v}  ${tbAdminCodes.has(k) ? "OK in tb_admin" : "** NOT in tb_admin **"}`);
  }

  const fwdRows = await rows("tb_forwarder?select=adminid&adminid=neq.&limit=1000");
  const fwdTally = tally(fwdRows, "adminid");
  const fwdOrphan = fwdTally.filter(([k]) => !tbAdminCodes.has(k));
  console.log(
    `\n  tb_forwarder.adminid — ${fwdTally.length} distinct codes in <=1000-row sample;` +
      ` ${fwdOrphan.length} NOT in tb_admin (historical staff long gone)`,
  );

  console.log("\n" + "=".repeat(72));
  console.log("DONE. NOTHING WAS MUTATED. Use these numbers + the orphan code lists");
  console.log("to fill the OLD->NEW remap map in the runbook before the owner runs any SQL.");
  console.log("=".repeat(72));
}

main().catch((e) => {
  console.error("analysis failed:", e.message);
  process.exit(1);
});
