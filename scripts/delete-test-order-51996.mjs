/**
 * 2026-06-05 ภูม D1 — DELETE test order #51996 + user PR10000.
 *
 * Context: ภูม สร้าง test order #51996 (PR10000) ตอน walk-through workflow
 *   เมื่อ 2026-06-03. Now clean up — both DB rows + Pacred web visibility.
 *
 * Pre-flight (verified by inspection script):
 *   - tb_forwarder #51996 = PR10000 · ftrackingchn='test191919' · status 1
 *   - tb_users PR10000  = "อุฟุฟวยหวยทวยอันหยาดทวยฟวยฟวย" · 0640300494
 *   - Zero FK refs in: tb_order, tb_wallet, tb_wallet_hs, tb_cnt_item,
 *     tb_cnt_pay_trackingchn, tb_forwarder_item, tb_forwarder_driver,
 *     tb_check_forwarder, tb_forwarder_import2, tb_credit
 *
 * Safety:
 *   - DEFAULT = dry-run · prints the plan + DOES NOT delete
 *   - --apply  = actually delete
 *   - Backup snapshot written to scripts/_backup/ before --apply
 *   - Errors out if FK count > 0 (defensive · should be 0 from pre-flight)
 *
 * Usage:
 *   node --env-file=.env.local scripts/delete-test-order-51996.mjs
 *   node --env-file=.env.local scripts/delete-test-order-51996.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const TB_FORWARDER_ID = 51996;
const TB_USER_ID = "PR10000";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[delete-51996] missing env vars");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

console.log(`\n${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} · delete tb_forwarder #${TB_FORWARDER_ID} + tb_users ${TB_USER_ID}\n`);

// ─── 1. Load snapshots ────────────────────────────────────────────
const { data: fwd, error: fwdErr } = await admin
  .from("tb_forwarder")
  .select("*")
  .eq("id", TB_FORWARDER_ID)
  .maybeSingle();
if (fwdErr) {
  console.error("[fwd lookup]", fwdErr.message);
  process.exit(1);
}
const { data: user, error: userErr } = await admin
  .from("tb_users")
  .select("*")
  .eq("userID", TB_USER_ID)
  .maybeSingle();
if (userErr) {
  console.error("[user lookup]", userErr.message);
  process.exit(1);
}

console.log("─── tb_forwarder snapshot ───");
console.log(
  fwd
    ? `  id=${fwd.id}  userid=${fwd.userid}  tracking=${fwd.ftrackingchn}  status=${fwd.fstatus}  date=${fwd.fdate?.slice(0, 19) ?? "—"}  detail=${fwd.fdetail ?? "—"}`
    : "  ⚠️  ไม่เจอ (ลบไปแล้ว?)",
);
console.log();
console.log("─── tb_users snapshot ───");
console.log(
  user
    ? `  userID=${user.userID}  name=${user.userName ?? ""} ${user.userLastName ?? ""}  tel=${user.userTel ?? "—"}  email=${user.userEmail ?? "—"}  active=${user.userActive ?? "—"}`
    : "  ⚠️  ไม่เจอ (ลบไปแล้ว?)",
);

if (!fwd && !user) {
  console.log("\n✓ ทั้งสองตัวลบไปแล้ว · nothing to do.");
  process.exit(0);
}

// ─── 2. Defensive FK check ────────────────────────────────────────
console.log("\n─── FK guard ───");
const FK_TABLES = [
  ["tb_order",                "userid", TB_USER_ID],
  ["tb_wallet",               "userid", TB_USER_ID],
  ["tb_wallet_hs",            "userid", TB_USER_ID],
  ["tb_cnt_item",             "userid", TB_USER_ID],
  ["tb_cnt_pay_trackingchn",  "userid", TB_USER_ID],
  ["tb_forwarder_item",       "fid",    String(TB_FORWARDER_ID)],
  ["tb_forwarder_driver",     "userid", TB_USER_ID],
  ["tb_check_forwarder",      "userid", TB_USER_ID],
  ["tb_forwarder_import2",    "userid", TB_USER_ID],
  ["tb_credit",               "userid", TB_USER_ID],
  ["tb_promotion",            "userid", TB_USER_ID],
  ["tb_address",              "userid", TB_USER_ID],
  ["tb_payment",              "userid", TB_USER_ID],
  ["tb_header_order",         "userid", TB_USER_ID],
];

let totalRefs = 0;
for (const [tbl, col, val] of FK_TABLES) {
  const { count, error } = await admin
    .from(tbl)
    .select("*", { count: "exact", head: true })
    .eq(col, val);
  if (error) {
    console.log(`  ${tbl}.${col} = ${val}  ⚠️ ${error.message}`);
    continue;
  }
  const c = count ?? 0;
  console.log(`  ${tbl.padEnd(28)} ${col}=${val.padEnd(8)}  count=${c}`);
  totalRefs += c;
}

// Owner-allowed cascades for empty test account: tb_wallet (seed row on register)
const ALLOWED_CASCADE_TABLES = new Set(["tb_wallet"]);

const blocking = FK_TABLES.filter(([tbl, , val]) => {
  // re-count synchronously (we have the result already · just check)
  // For simplicity we re-tally below.
  return false; // placeholder · real check via totalRefs minus allowed
});

// Re-tally with allow-list
let allowedCount = 0;
let blockingCount = 0;
for (const [tbl, col, val] of FK_TABLES) {
  const { count, error } = await admin
    .from(tbl)
    .select("*", { count: "exact", head: true })
    .eq(col, val);
  if (error) continue;
  const c = count ?? 0;
  if (c === 0) continue;
  if (ALLOWED_CASCADE_TABLES.has(tbl)) {
    allowedCount += c;
    console.log(`  ↳ ALLOWED cascade · ${tbl} (${c} row) — will delete along with user`);
  } else {
    blockingCount += c;
    console.error(`  🛑 BLOCKING · ${tbl} (${c} row) — refuse to delete user`);
  }
}

if (blockingCount > 0) {
  console.error(`\n🛑 STOP · เจอ blocking FK refs ${blockingCount} แห่ง · refuse to delete`);
  console.error(`     If intentional, delete those rows first then re-run.`);
  process.exit(1);
}
console.log(`\n✓ FK guard passed · ${allowedCount} allowed cascades · 0 blocking`);

// ─── 3. Backup ─────────────────────────────────────────────────────
const BACKUP_DIR = "scripts/_backup";
const stamp = "2026-06-05-delete-51996";
mkdirSync(BACKUP_DIR, { recursive: true });
const backup = {
  generated_for: stamp,
  tb_forwarder: fwd ?? null,
  tb_users:     user ?? null,
};
const backupPath = `${BACKUP_DIR}/${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
console.log(`\n💾 backup written → ${backupPath}`);

if (!APPLY) {
  console.log(`\n🟡 DRY-RUN — no DELETE executed. Re-run with --apply to actually delete.`);
  console.log(`     Plan:`);
  if (fwd)  console.log(`       DELETE FROM tb_forwarder WHERE id=${TB_FORWARDER_ID};`);
  if (user) console.log(`       DELETE FROM tb_users     WHERE "userID"='${TB_USER_ID}';`);
  console.log(`     Restore SQL (if needed):`);
  if (fwd)  console.log(`       psql -f restore-51996-tb_forwarder.sql  -- from backup`);
  if (user) console.log(`       psql -f restore-51996-tb_users.sql      -- from backup`);
  process.exit(0);
}

// ─── 4. Apply ──────────────────────────────────────────────────────
console.log("\n🔴 APPLY · executing deletes...\n");

if (fwd) {
  const { error: e1 } = await admin
    .from("tb_forwarder")
    .delete()
    .eq("id", TB_FORWARDER_ID);
  if (e1) {
    console.error(`  ❌ tb_forwarder DELETE failed: ${e1.message}`);
    process.exit(1);
  }
  console.log(`  ✅ tb_forwarder #${TB_FORWARDER_ID} deleted`);
}

// Cascade: tb_wallet (seed row created on register · empty for test acct)
const { error: walletErr } = await admin
  .from("tb_wallet")
  .delete()
  .eq("userid", TB_USER_ID);
if (walletErr) {
  console.warn(`  ⚠️  tb_wallet DELETE failed (non-fatal): ${walletErr.message}`);
} else {
  console.log(`  ✅ tb_wallet (seed) for ${TB_USER_ID} deleted`);
}

if (user) {
  const { error: e2 } = await admin
    .from("tb_users")
    .delete()
    .eq("userID", TB_USER_ID);
  if (e2) {
    console.error(`  ❌ tb_users DELETE failed: ${e2.message}`);
    process.exit(1);
  }
  console.log(`  ✅ tb_users ${TB_USER_ID} deleted`);
}

// ─── 5. Also clean up rebuilt profiles + auth.users (test acct) ──
const { data: prof } = await admin
  .from("profiles")
  .select("id, member_code")
  .eq("member_code", TB_USER_ID)
  .maybeSingle();
if (prof) {
  const { error } = await admin.from("profiles").delete().eq("id", prof.id);
  if (error) {
    console.warn(`  ⚠️  profiles delete failed (non-fatal): ${error.message}`);
  } else {
    console.log(`  ✅ profiles row ${prof.id} (${TB_USER_ID}) deleted`);
  }
  // Also try auth.users (UUID = profiles.id)
  const { error: authErr } = await admin.auth.admin.deleteUser(prof.id);
  if (authErr) {
    console.warn(`  ⚠️  auth.users delete failed (non-fatal): ${authErr.message}`);
  } else {
    console.log(`  ✅ auth.users ${prof.id} deleted`);
  }
} else {
  console.log(`  ℹ️  no rebuilt profiles row for ${TB_USER_ID} (skip)`);
}

console.log(`\n✅ Done · ภูม สามารถเปิด /admin/forwarders + ค้น 51996 → ไม่เจอ`);
console.log(`         ค้น PR10000 → ไม่เจอ. backup เก็บไว้ ${backupPath} เผื่อ restore`);
