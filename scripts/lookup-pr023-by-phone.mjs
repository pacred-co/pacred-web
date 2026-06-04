/**
 * 2026-06-04 ภูม flag — หา PR023 (legacy code 023) ว่าตรงกับใครใน Pacred
 * โดย match จากเบอร์โทรศัพท์.
 *
 * Steps:
 *   1. ดู MOMO row ที่ใช้ legacy code 023 (tracking 300649279386) เพื่อ
 *      หาเบอร์โทรลูกค้า (จาก raw payload).
 *   2. SELECT * FROM tb_users WHERE userid='PR023' → ถ้ามี = สำเร็จ
 *   3. ถ้าไม่มี → ใช้เบอร์ search tb_users.usertel เพื่อหา candidate
 *      ที่น่าจะใช่ใน Pacred.
 *   4. แสดงผลให้ ภูม decide manual rename.
 *
 * Usage:  node --env-file=.env.local scripts/lookup-pr023-by-phone.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[lookup-pr023] missing SUPABASE env vars");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

// ─── 1. หา MOMO row ตัวที่มี userID = 023 (หรือ tracking 300649279386) ─
console.log("\n─── STEP 1: MOMO rows w/ legacy userID '023' (or tracking 300649279386) ───\n");

const { data: momoRows, error: momoErr } = await admin
  .from("momo_import_tracks")
  .select("id, momo_tracking_no, momo_user_code, momo_container_no, raw, last_synced_at")
  .or("momo_user_code.eq.023,momo_tracking_no.eq.300649279386")
  .limit(20);

if (momoErr) {
  console.error("[momo lookup]", momoErr);
  process.exit(1);
}
if (!momoRows?.length) {
  console.log("  ⚠️  ไม่เจอ MOMO row · ลอง broaden query...");
} else {
  for (const r of momoRows) {
    const raw = r.raw ?? {};
    const phone = raw.tel ?? raw.phone ?? raw.userTel ?? raw.user_tel ?? raw.mobile ?? raw.contact ?? null;
    const name  = raw.name ?? raw.fullname ?? raw.userName ?? raw.user_name ?? null;
    const company = raw.company ?? raw.userCompany ?? raw.user_company ?? null;
    console.log(
      `  #${r.id}  tracking=${r.momo_tracking_no}  userID=${r.momo_user_code}  ` +
      `container=${r.momo_container_no ?? "—"}  synced=${r.last_synced_at?.slice(0, 19) ?? "—"}`,
    );
    console.log(
      `     ↳ name=${name ?? "—"} · phone=${phone ?? "—"} · company=${company ?? "—"}`,
    );
    console.log(`     ↳ FULL raw payload:`);
    console.log("       " + JSON.stringify(raw, null, 2).split("\n").join("\n       "));
  }
}

// ─── 2. เช็คว่า PR023 มีใน tb_users ตอนนี้รึยัง ─────────────────────
console.log("\n─── STEP 2: ดู tb_users.userid='PR023' ───\n");
const { data: pr023Row, error: pr023Err } = await admin
  .from("tb_users")
  .select("userID, userName, userLastName, userTel, userEmail, userCompany, userActive, adminIDSale")
  .eq("userID", "PR023")
  .maybeSingle();
if (pr023Err) {
  console.error("[pr023 lookup]", pr023Err);
} else if (pr023Row) {
  console.log(
    `  ✅ มีอยู่จริง · ${pr023Row.userName ?? ""} ${pr023Row.userLastName ?? ""}` +
    ` · เบอร์ ${pr023Row.userTel ?? "—"} · email ${pr023Row.userEmail ?? "—"}` +
    ` · company "${pr023Row.userCompany ?? ""}" · active=${pr023Row.userActive ?? "—"}`,
  );
  console.log("  → MOMO row น่าจะ commit ได้เลย · ลอง retry ใน review-grid");
} else {
  console.log("  ❌ PR023 ไม่อยู่ใน tb_users (ตามที่ MOMO review บ่น)");
}

// ─── 3. ถ้า MOMO ส่งเบอร์มา → search tb_users.usertel ───────────────
const allPhones = new Set();
for (const r of momoRows ?? []) {
  const raw = r.raw ?? {};
  for (const k of ["tel", "phone", "userTel", "user_tel"]) {
    if (raw[k]) allPhones.add(String(raw[k]).trim());
  }
}

if (allPhones.size > 0) {
  console.log(`\n─── STEP 3: ค้นหา tb_users by phone (${allPhones.size} เบอร์) ───\n`);
  for (const phone of allPhones) {
    // normalize ลบเครื่องหมาย/space/+66 prefix
    const norm = phone.replace(/[\s\-+]/g, "").replace(/^66/, "0");
    const candidates = [phone, norm];
    // also try last 9 digits
    const last9 = norm.replace(/^0/, "");
    candidates.push(`%${last9}`);

    for (const q of candidates) {
      const { data, error } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userTel, userCompany, userActive")
        .ilike("userTel", q)
        .limit(5);
      if (error) {
        console.error(`[phone search "${q}"]`, error.message);
        continue;
      }
      if (data?.length) {
        console.log(`  🔍 query "${q}" → ${data.length} hit:`);
        for (const u of data) {
          console.log(
            `     ${u.userID}  ${u.userName ?? ""} ${u.userLastName ?? ""}` +
            ` · เบอร์ ${u.userTel ?? "—"} · company "${u.userCompany ?? ""}" · active=${u.userActive ?? "—"}`,
          );
        }
      }
    }
  }
} else {
  console.log("\n─── STEP 3: skipped — MOMO raw ไม่มีเบอร์ ───");
  console.log("  → ภูม manual check legacy PCS DB (pcsc_main.tb_users WHERE userID='PCS023')");
}

// ─── 4. หาใน tb_users ทุก row ที่มีรหัสไม่ใช่ PR* (legacy หลงเหลือ) ─
console.log("\n─── STEP 4: tb_users ที่ userID ยังไม่ขึ้นต้น PR (ตกค้าง · ถ้ามี) ───\n");
const { data: stragglers, error: strErr } = await admin
  .from("tb_users")
  .select("userID, userName, userLastName, userTel")
  .not("userID", "ilike", "PR%")
  .limit(20);
if (strErr) {
  console.error("[stragglers]", strErr.message);
} else if (!stragglers?.length) {
  console.log("  ✓ ไม่มี · userID ทุก row ขึ้นต้น PR แล้ว");
} else {
  for (const u of stragglers) {
    console.log(
      `  ${u.userID}  ${u.userName ?? ""} ${u.userLastName ?? ""} · เบอร์ ${u.userTel ?? "—"}`,
    );
  }
}

// ─── 5. ดูทุก user_code ที่ MOMO ส่งมา + match กับ tb_users ─────────
console.log("\n─── STEP 5: ดูทุก MOMO user_code · match กับ tb_users ───\n");
const { data: allMomo, error: allMomoErr } = await admin
  .from("momo_import_tracks")
  .select("momo_user_code")
  .not("momo_user_code", "is", null)
  .limit(1000);
if (allMomoErr) {
  console.error("[all momo user_codes]", allMomoErr);
} else {
  const counts = new Map();
  for (const r of allMomo ?? []) {
    const k = r.momo_user_code;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  console.log(`  พบ ${counts.size} unique user_code ใน momo_import_tracks · ${(allMomo ?? []).length} rows`);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // Check which PR-codes are NOT in tb_users
  const allPRcodes = sorted.map(([code]) => `PR${code}`);
  const { data: existRows } = await admin
    .from("tb_users")
    .select("userID")
    .in("userID", allPRcodes)
    .limit(allPRcodes.length);
  const exists = new Set((existRows ?? []).map((r) => r.userID));

  console.log("\n  user_code   PRxxx       hits   tb_users?");
  console.log("  ────────────────────────────────────────────");
  for (const [code, n] of sorted.slice(0, 30)) {
    const pr = `PR${code}`;
    const has = exists.has(pr) ? "✅" : "❌ MISSING";
    console.log(`  ${code.padEnd(11)} ${pr.padEnd(11)} ${String(n).padEnd(6)} ${has}`);
  }
  const missing = sorted.filter(([code]) => !exists.has(`PR${code}`));
  console.log(`\n  → ${missing.length} user_code ใน MOMO ที่ Pacred ยังไม่มี:`);
  for (const [code, n] of missing) console.log(`     PR${code} (${n} rows)`);
}

console.log("\n✓ done · ใช้ scripts/rename-userid-to-pr99.mjs ถ้าตัดสินใจ rename");
