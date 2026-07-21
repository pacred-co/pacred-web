import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("customer-address-continuity-contract");

const migration = read("supabase/migrations/0270_customer_address_main_guard.sql");
const forwarderEdit = read("actions/admin/forwarders-field-edits.ts");
const momoCommit = read("lib/admin/commit-momo-row-core.ts");
const manualImport = read("actions/admin/api-forwarder-manual.ts");
const memberAddress = read("app/[locale]/(protected)/addresses/add-address-action.ts");
const dataHealth = read("lib/admin/data-health/checks.ts");

test("database enforces one active owned default per customer", () => {
  assert.match(migration, /chk_tb_address_active_delivery_usable/);
  assert.match(migration, /is_customer_delivery_address_usable/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_address_main_userid/);
  assert.match(migration, /CREATE TRIGGER trg_guard_customer_main_address/);
  assert.match(migration, /a\.addressstatus = '1'/);
  assert.match(migration, /a\.userid = NEW\.userid/);
});

test("first address and deliberate default changes persist for next checkout", () => {
  assert.match(migration, /CREATE TRIGGER trg_ensure_first_customer_address_is_main/);
  assert.match(migration, /CREATE TRIGGER trg_sync_customer_main_to_last_used/);
  // ⚠️ The identifier MUST stay quoted camelCase — `tb_users."userAddressID"` is a
  // real quoted column, so an unquoted `useraddressid` gets folded to lower-case by
  // Postgres and the statement errors (see the 0270 header comment). This assertion
  // was left on the pre-fix lower-case spelling and so went red the moment the bug
  // was fixed; keep it matching the quoted form.
  assert.match(migration, /SET "userAddressID" = NEW\.addressid::text/);
});

test("forwarder free-text correction saves and defaults the reusable address first", () => {
  const persistAt = forwarderEdit.indexOf("const saved = await saveCustomerAddress");
  const snapshotAt = forwarderEdit.indexOf('.from("tb_forwarder")', persistAt);
  assert.ok(persistAt >= 0 && snapshotAt > persistAt);
  assert.match(forwarderEdit, /forceDefault: true/);
});

test("MOMO and manual import fail closed instead of creating an address-less job", () => {
  assert.doesNotMatch(momoCommit, /EMPTY_ADDRESS/);
  assert.match(momoCommit, /ลูกค้ายังไม่มีที่อยู่หลัก — บันทึกที่อยู่ก่อนสร้างงานนำเข้า/);
  assert.match(manualImport, /ลูกค้ายังไม่มีที่อยู่หลัก — บันทึกที่อยู่ก่อนสร้างงานนำเข้า/);
});

test("member add no longer selects the latest row after a separate insert", () => {
  assert.match(memberAddress, /saveCustomerAddress\(admin/);
  assert.doesNotMatch(memberAddress, /order\("addressid", \{ ascending: false \}\)/);
});

test("hourly data-health catches pointer drift and incomplete live jobs", () => {
  assert.match(dataHealth, /id: "customer_main_address_invalid"/);
  assert.match(dataHealth, /id: "live_forwarder_missing_delivery"/);
  assert.match(dataHealth, /severity: "red"/);
});

console.log(`\n${passed} pass · 0 fail`);
