/**
 * scripts/investigate-pr99-candidate.mjs
 *
 * 2026-06-02 ค่ำ (ภูม flag) — MOMO ส่ง userid "PR99" มาที่ /admin/api-
 * forwarder-momo/review แต่ระบบขึ้น "ไม่มี PR99 ในระบบ" สีแดง.
 *
 * ตาม pattern 2026-05-30 ดึก (PR9370→PR005 · PR1282→PR032 · PR1321→PR116)
 * MOMO ส่ง "user_code" เป็น legacy code ที่ Pacred reissue เป็น userID
 * ใหม่ตอน migration. ทีนี้ MOMO ส่ง "99" ที่ Pacred ยังไม่มี — ต้อง
 * investigate ว่าเดิมเป็น PRxxxx ตัวไหน.
 *
 * Script นี้ probe tb_users + tb_forwarder + tb_payment เพื่อ list
 * candidate ที่เป็นไปได้สำหรับ "99":
 *   1. exact match PR99 (ถ้ามีอยู่แล้วก็จบ — บอก investigation ไม่มีผล)
 *   2. PR contains "99" pattern (PR99 + 1-4 digits)
 *   3. legacy userID = 99 (raw integer/varchar without PR prefix)
 *   4. cross-ref MOMO momo_import_tracks raw data:
 *        - หา user_code = "99" + user_group = "PR"
 *        - log จำนวน + tracking_no ที่ MOMO ส่งมาในช่วงไม่นานนี้
 *   5. ดู rows ใน tb_forwarder ที่มี userid = ตัวอย่าง candidate
 *      → จะเห็น activity timeline + ช่วยตัดสินใจว่าใช่ลูกค้านี้ไหม
 *
 * USAGE (ภูม รันที่บ้าน/ที่ทำงาน):
 *   cd C:/Users/Admin/pacred-web/pacred-web
 *   pnpm tsx scripts/investigate-pr99-candidate.mjs
 *
 * Read-only — ไม่ mutate อะไรเลย. ปลอดภัย รันบน prod ได้.
 *
 * Output: ตาราง candidates เรียงโดย "ความเป็นไปได้" + คำแนะนำ next step.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("───────────────────────────────────────────────────────────────");
  console.log("PR99 candidate investigation · MOMO claims user_code=99");
  console.log("───────────────────────────────────────────────────────────────\n");

  // ── 1. Exact PR99 probe ──
  console.log("1) exact match `PR99` in tb_users:");
  const { data: exact, error: exactErr } = await sb
    .from("tb_users")
    .select(`userID, userName, userLastName, userTel, userEmail, userDate`)
    .eq("userID", "PR99");
  if (exactErr) {
    console.error("   ✗ query failed:", exactErr.message);
  } else if (exact && exact.length > 0) {
    console.log(`   ✅ EXISTS — ${exact.length} row:`);
    for (const u of exact) {
      console.log(`      ${u.userID} · ${u.userName ?? ""} ${u.userLastName ?? ""} · ☎${u.userTel ?? "—"} · ${u.userDate ?? "—"}`);
    }
    console.log("   → ไม่ต้อง rename — แค่ refresh review หน้านี้ก็พอ\n");
  } else {
    console.log("   ❌ NOT FOUND — ต้อง rename จาก legacy code\n");
  }

  // ── 2. PR99* pattern (PR99 + suffix digits) ──
  console.log("2) PR99* pattern (userID ที่ขึ้นต้นด้วย PR99):");
  const { data: prefix, error: prefixErr } = await sb
    .from("tb_users")
    .select(`userID, userName, userLastName, userTel, userEmail, userDate`)
    .like("userID", "PR99%")
    .order("userID", { ascending: true })
    .limit(50);
  if (prefixErr) {
    console.error("   ✗ query failed:", prefixErr.message);
  } else if (prefix && prefix.length > 0) {
    console.log(`   พบ ${prefix.length} ราย:`);
    for (const u of prefix) {
      console.log(`      ${u.userID} · ${u.userName ?? ""} ${u.userLastName ?? ""} · ☎${u.userTel ?? "—"} · ${u.userDate ?? "—"}`);
    }
  } else {
    console.log("   (ว่าง · ไม่มีลูกค้าที่ userID ขึ้นต้นด้วย PR99)");
  }
  console.log("");

  // ── 3. tb_forwarder activity ของ candidates ──
  console.log("3) tb_forwarder rows ที่ userid contain '99' (recent 30 days):");
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: forwarders, error: fErr } = await sb
    .from("tb_forwarder")
    .select(`id, userid, fdate, fstatus, ftrackingchn, fcabinetnumber`)
    .like("userid", "PR99%")
    .gte("fdate", cutoff)
    .order("fdate", { ascending: false })
    .limit(20);
  if (fErr) {
    console.error("   ✗ query failed:", fErr.message);
  } else if (forwarders && forwarders.length > 0) {
    console.log(`   พบ ${forwarders.length} forwarder rows (recent activity):`);
    for (const f of forwarders) {
      console.log(`      #${f.id} · ${f.userid} · fstatus=${f.fstatus} · tracking=${f.ftrackingchn ?? "—"} · cabinet=${f.fcabinetnumber ?? "—"} · ${f.fdate}`);
    }
  } else {
    console.log("   (ว่าง · ไม่มี forwarder activity ของ PR99* ใน 30 วัน)");
  }
  console.log("");

  // ── 4. MOMO raw data ที่อ้างถึง user_code=99 ──
  console.log("4) MOMO raw data ที่ user_code='99' หรือ user_group+user_code='PR99':");
  const { data: momoRows, error: momoErr } = await sb
    .from("momo_import_tracks")
    .select(`momo_tracking_no, momo_container_no, container_batch_no, last_synced_at, raw`)
    .order("last_synced_at", { ascending: false })
    .limit(200); // small page; we'll JS-filter the raw blob
  if (momoErr) {
    console.error("   ✗ query failed:", momoErr.message);
  } else if (momoRows) {
    const matches = momoRows.filter((row) => {
      const raw = row.raw;
      if (!raw || typeof raw !== "object") return false;
      const uc = raw.user_code;
      const ug = raw.user_group;
      return uc === "99" || uc === 99 || (ug === "PR" && (uc === "99" || uc === 99));
    });
    if (matches.length > 0) {
      console.log(`   พบ ${matches.length} MOMO tracking ที่อ้างถึง user_code=99:`);
      for (const m of matches.slice(0, 20)) {
        const r = m.raw || {};
        console.log(`      tracking=${m.momo_tracking_no} · container=${m.container_batch_no ?? m.momo_container_no ?? "—"} · qty=${r.quantity ?? "?"} · synced=${m.last_synced_at}`);
      }
      if (matches.length > 20) {
        console.log(`      …และอีก ${matches.length - 20} รายการ`);
      }
    } else {
      console.log(`   ไม่พบ MOMO row ที่ raw.user_code='99' ใน 200 ล่าสุด (อาจต้องเปิด window กว้างขึ้น)`);
    }
  }
  console.log("");

  // ── 5. Recommendation ──
  console.log("───────────────────────────────────────────────────────────────");
  console.log("📋 NEXT STEPS:");
  console.log("───────────────────────────────────────────────────────────────");
  console.log("");
  console.log("  ถ้า §1 ขึ้น ✅ EXISTS → ภูม กด รีเฟรช หน้า /admin/api-forwarder-momo/review");
  console.log("    (อาจเป็น cache · validation probe ดึงค่าใหม่จะ green)");
  console.log("");
  console.log("  ถ้า §1 NOT FOUND + §2 มี candidate ที่ดูคุ้น →");
  console.log("    → ดูใน §3 ว่ามี forwarder activity ในช่วงเดียวกับ MOMO มั้ย");
  console.log("    → ถ้าใช่ คือ candidate ตัวนั้น → ใช้ scripts/rename-userid-to-pr99.mjs");
  console.log("    → rename atomic ทั้งหมด ~9 tables (template ของ PR9370→005)");
  console.log("");
  console.log("  ถ้า §1 NOT FOUND + §2 ว่าง →");
  console.log("    → ลูกค้าใหม่ที่ MOMO รู้จักก่อน Pacred · ภูม เลือก:");
  console.log("      A) สร้าง user PR99 ใหม่ใน /admin/customers/new + phone match กับ MOMO");
  console.log("      B) ติดต่อ MOMO ขอ user_code ที่ถูกต้อง");
  console.log("      C) แก้ไข userid ในช่อง input ของ /review ตอน commit");
  console.log("");
}

main().catch((e) => {
  console.error("✗ uncaught:", e);
  process.exit(1);
});
