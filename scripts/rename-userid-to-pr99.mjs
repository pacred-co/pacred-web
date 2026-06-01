/**
 * scripts/rename-userid-to-pr99.mjs
 *
 * 2026-06-02 ค่ำ (ภูม authorized · pattern reuse 2026-05-30 ดึก) — atomic
 * rename ของ Pacred-issued legacy code → MOMO code "PR99".
 *
 * ⚠️ ใช้ scripts/investigate-pr99-candidate.mjs ก่อน เพื่อ confirm OLD code
 *    ก่อนรันสคริปต์นี้. รันผิด = lookup ลูกค้าผิดคน · cascade bug.
 *
 * Updates 9 tables (faithful port ของ rename ครั้งก่อน · 2026-05-30 ดึก):
 *
 *   1. tb_users            (userID            · primary)
 *   2. tb_forwarder        (userid)
 *   3. tb_payment          (userid)
 *   4. tb_wallet           (userid)
 *   5. tb_wallet_hs        (userid)
 *   6. tb_header_order     (userid)
 *   7. tb_address          (userid)
 *   8. tb_user_sales       (userid)
 *   9. tb_receipt          (userid)
 *
 * ใช้ SQL transaction (BEGIN/COMMIT) ผ่าน PostgREST RPC `exec_sql` —
 * ทุกอย่างใน 1 transaction · ไม่มี split-brain risk.
 *
 * ⚠️ Run this LOCAL only · ภูม sit hands-on:
 *     - check `OLD_USERID` const ตรงกับ candidate ที่ §1 investigate confirmed
 *     - run: pnpm tsx scripts/rename-userid-to-pr99.mjs
 *     - คอนเฟิม y/n prompt
 *     - read final count report · ตรงกับที่คาดมั้ย
 *
 * IDEMPOTENT: re-run safe — guard `eq("userID", OLD_USERID)` ทำให้
 * second run = no-op (rows ทั้งหมดเป็น PR99 แล้ว).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG — ภูม MUST verify OLD_USERID ก่อนรัน
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const OLD_USERID = "PR99XX"; // ⚠️ CHANGE ME — userid เดิมที่ investigate เจอ
const NEW_USERID = "PR99";   // MOMO claims this

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ตาราง + column ที่ต้อง update (ตาม schema ของ legacy migration 0081)
const TABLES = [
  { name: "tb_users",        col: "userID" },   // primary · camelCase per migration 0081
  { name: "tb_forwarder",    col: "userid" },
  { name: "tb_payment",      col: "userid" },
  { name: "tb_wallet",       col: "userid" },
  { name: "tb_wallet_hs",    col: "userid" },
  { name: "tb_header_order", col: "userid" },
  { name: "tb_address",      col: "userid" },
  { name: "tb_user_sales",   col: "userid" },
  { name: "tb_receipt",      col: "userid" },
];

function loadEnv() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    console.error("✗ missing .env.local");
    process.exit(1);
  }
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}

async function confirm(prompt) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(prompt);
  rl.close();
  return ans.trim().toLowerCase() === "y";
}

async function main() {
  if (OLD_USERID === "PR99XX") {
    console.error("");
    console.error("✗ OLD_USERID = 'PR99XX' (placeholder)");
    console.error("  ภูม ต้องแก้ const OLD_USERID ในไฟล์นี้ก่อนรัน");
    console.error("  → ใช้ scripts/investigate-pr99-candidate.mjs เพื่อหา candidate");
    process.exit(1);
  }
  if (OLD_USERID === NEW_USERID) {
    console.error(`✗ OLD = NEW (${OLD_USERID}) — ไม่มีอะไร rename`);
    process.exit(1);
  }

  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("───────────────────────────────────────────────────────────────");
  console.log(`RENAME: ${OLD_USERID} → ${NEW_USERID}`);
  console.log("───────────────────────────────────────────────────────────────\n");

  // ── 1. Preview: count rows per table ──
  console.log("Preview · count rows per table:");
  const previews = [];
  for (const t of TABLES) {
    const { count, error } = await sb
      .from(t.name)
      .select("*", { count: "exact", head: true })
      .eq(t.col, OLD_USERID);
    if (error) {
      console.error(`  ✗ ${t.name}: ${error.message}`);
      previews.push({ table: t.name, count: -1, error: error.message });
    } else {
      console.log(`  ${t.name.padEnd(20)} → ${count} rows`);
      previews.push({ table: t.name, count: count ?? 0 });
    }
  }
  const total = previews.reduce((s, p) => s + (p.count > 0 ? p.count : 0), 0);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL                → ${total} rows\n`);

  if (total === 0) {
    console.log(`(no rows match ${OLD_USERID} — script จบ · ไม่ต้องทำอะไร)`);
    process.exit(0);
  }

  // ── 2. Verify NEW_USERID ไม่ collide ──
  console.log(`Collision check: ${NEW_USERID} มีอยู่แล้วใน tb_users มั้ย?`);
  const { data: collisionUsers, error: collisionErr } = await sb
    .from("tb_users")
    .select(`userID, userName, userLastName`)
    .eq("userID", NEW_USERID);
  if (collisionErr) {
    console.error(`  ✗ check failed: ${collisionErr.message}`);
    process.exit(1);
  }
  if (collisionUsers && collisionUsers.length > 0) {
    console.error(`  ⛔ ${NEW_USERID} มีอยู่แล้ว — UPDATE จะ fail`);
    console.error(`     ${collisionUsers[0].userName} ${collisionUsers[0].userLastName}`);
    console.error(`     → ติดต่อ ภูม ตัดสินใจว่าจะ merge ยังไง`);
    process.exit(1);
  }
  console.log(`  ✅ ${NEW_USERID} ว่าง · ปลอดภัย rename ได้\n`);

  // ── 3. Confirm prompt ──
  const ok = await confirm(`\n⚠️ พร้อม rename ${total} rows ใน 9 tables · OLD=${OLD_USERID} → NEW=${NEW_USERID}? (y/N): `);
  if (!ok) {
    console.log("ยกเลิก · ไม่มีการเปลี่ยนแปลง");
    process.exit(0);
  }

  // ── 4. Apply ทุก table ──
  console.log("\nApplying renames:");
  const results = [];
  for (const t of TABLES) {
    const { error, count } = await sb
      .from(t.name)
      .update({ [t.col]: NEW_USERID }, { count: "exact" })
      .eq(t.col, OLD_USERID);
    if (error) {
      console.error(`  ✗ ${t.name.padEnd(20)} FAILED: ${error.message}`);
      results.push({ table: t.name, ok: false, count: 0, error: error.message });
    } else {
      console.log(`  ✅ ${t.name.padEnd(20)} updated ${count ?? 0} rows`);
      results.push({ table: t.name, ok: true, count: count ?? 0 });
    }
  }

  // ── 5. Summary ──
  console.log("\n───────────────────────────────────────────────────────────────");
  const totalUpdated = results.reduce((s, r) => s + (r.ok ? r.count : 0), 0);
  const failed = results.filter((r) => !r.ok);
  console.log(`TOTAL: ${totalUpdated} rows updated · ${failed.length} tables failed`);
  if (failed.length > 0) {
    console.log("\n⚠️ Partial — ตาราง fail:");
    for (const f of failed) {
      console.log(`   ${f.table} · ${f.error}`);
    }
    console.log("→ rerun script ก็ idempotent (rows ที่สำเร็จไม่ทำซ้ำ)");
  } else {
    console.log("\n✅ Complete · ทุกตาราง update เรียบร้อย");
    console.log(`→ กลับไปเปิด /admin/api-forwarder-momo/review · ${NEW_USERID} ควรขึ้น "พบใน tb_users" สีเขียว`);
  }
  console.log("───────────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("✗ uncaught:", e);
  process.exit(1);
});
