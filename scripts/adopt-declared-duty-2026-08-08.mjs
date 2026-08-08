/**
 * adopt-declared-duty-2026-08-08.mjs — อากรที่ไม่ตรงกับใบขน → **ยึดใบขน**
 *
 * owner 2026-08-08: *"ตรงอากรไม่ตรงใบขน ให้ยึดใบขนไปเลยครับ เพราะยิงใบขนผ่านจริงแล้วครับ"*
 *
 * `default_duty_pct` = อัตราที่คลังเก็บไว้ (มาจากไฟล์/บอท/แชท — ยังไม่ผ่านของจริง)
 * `decl_duty_pct`    = อัตราที่ **ใช้จริงบนใบขนที่ยิงผ่านกรมศุลฯ แล้ว** (`decl_count` ใบ)
 * ⇒ ของจริงชนะ. คลังจะได้ตรงกับสิ่งที่พนักงานเจอหน้างาน ไม่ใช่เลขที่ "ควรจะเป็น".
 *
 * GUARDS:
 *  · เฉพาะแถวที่มีใบขนจริง (`decl_count > 0`) และมี `decl_duty_pct`
 *  · เก็บค่าเดิมไว้ใน `hs_note` ("อากรเดิมในคลัง X% → ยึดใบขน Y% (N ใบ)") — ตรวจย้อนได้
 *  · ติดธง `duty_confirmed = true` (ยืนยันด้วยของจริงแล้ว)
 *  · ⚠️ แถวที่ใบขน**ไม่นิ่ง** (`decl_duty_stable = false` = แต่ละใบใช้ไม่เท่ากัน) →
 *    **ไม่เขียน** แค่ติดธงเตือนให้คนตรวจ (ยึดของที่ยังขัดกันเอง = ผิดซ้ำ)
 *  · dry-run เป็นค่าเริ่มต้น · --apply ถึงเขียน · backup + txn · idempotent
 *
 * RUN: PGPW='<prod>' node scripts/adopt-declared-duty-2026-08-08.mjs [--apply]
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PW = process.env.PGPW;
if (!PW) { console.error("ต้องส่ง PGPW=<prod pw>"); process.exit(1); }

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

try {
  const { rows } = await c.query(`
    select code, description, default_duty_pct, decl_duty_pct, decl_form_e_pct,
           form_e_duty_pct, decl_count, decl_duty_stable, hs_note, duty_confirmed
      from hs_codes
     where decl_count > 0 and decl_duty_pct is not null
       and abs(coalesce(default_duty_pct, -1) - decl_duty_pct) > 0.001
     order by decl_count desc`);

  const adopt = rows.filter((r) => r.decl_duty_stable);
  const review = rows.filter((r) => !r.decl_duty_stable);

  console.log(`\n━━ ยึดอากรตามใบขน (owner 2026-08-08) ━━
  แถวที่อากรไม่ตรงใบขน : ${rows.length}
  ✅ ใบขนนิ่ง → ยึดเลย  : ${adopt.length}
  🟠 ใบขนไม่นิ่ง → ไม่แตะ : ${review.length} (แต่ละใบใช้ไม่เท่ากัน — ติดธงให้คนตรวจ)`);
  console.table(adopt.map((r) => ({
    code: r.code, ชื่อ: String(r.description ?? "").slice(0, 30),
    เดิม: Number(r.default_duty_pct), "→ ใบขน": Number(r.decl_duty_pct), ใบ: r.decl_count,
  })));
  if (review.length) {
    console.log("🟠 ใบขนไม่นิ่ง (ไม่เขียน):");
    console.table(review.map((r) => ({
      code: r.code, ชื่อ: String(r.description ?? "").slice(0, 30),
      เดิม: Number(r.default_duty_pct), ใบขน: Number(r.decl_duty_pct), ใบ: r.decl_count,
    })));
  }

  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }
  if (adopt.length === 0 && review.length === 0) { console.log("ไม่มีอะไรต้องแก้"); process.exit(0); }

  const stamp = Date.now();
  writeFileSync(`scripts/_backup-hs-duty-${stamp}.json`, JSON.stringify(rows, null, 1));
  console.log(`  backup → scripts/_backup-hs-duty-${stamp}.json`);

  await c.query("begin");
  for (const r of adopt) {
    const note = `อากรเดิมในคลัง ${Number(r.default_duty_pct)}% → ยึดตามใบขนจริง ${Number(r.decl_duty_pct)}% (${r.decl_count} ใบ · 2026-08-08)`;
    const res = await c.query(
      `update hs_codes
          set default_duty_pct = $2,
              form_e_duty_pct  = coalesce($3, form_e_duty_pct),
              duty_confirmed   = true,
              hs_note = case when coalesce(hs_note,'')='' then $4 else hs_note || ' · ' || $4 end,
              updated_by='adopt-declared-duty-2026-08-08', updated_at=now()
        where code = $1 and abs(coalesce(default_duty_pct,-1) - $2) > 0.001`,
      [r.code, r.decl_duty_pct, r.decl_form_e_pct, note],
    );
    if (res.rowCount !== 1) throw new Error(`${r.code}: เขียน ${res.rowCount} แถว (คาด 1) — rollback`);
  }
  for (const r of review) {
    const note = `⚠ อากรบนใบขนไม่นิ่ง (${r.decl_count} ใบ ใช้ไม่เท่ากัน · คลังเก็บ ${Number(r.default_duty_pct)}% · ใบขนล่าสุด ${Number(r.decl_duty_pct)}%) — รอคนตรวจ`;
    await c.query(
      `update hs_codes
          set hs_note = case when coalesce(hs_note,'')='' then $2 else hs_note || ' · ' || $2 end,
              updated_by='adopt-declared-duty-2026-08-08', updated_at=now()
        where code=$1 and coalesce(hs_note,'') not like '%อากรบนใบขนไม่นิ่ง%'`,
      [r.code, note],
    );
  }
  const { rows: after } = await c.query(
    `select count(*)::int ยังไม่ตรง from hs_codes
      where decl_count>0 and decl_duty_pct is not null and decl_duty_stable
        and abs(coalesce(default_duty_pct,-1)-decl_duty_pct)>0.001`);
  if (after[0]["ยังไม่ตรง"] !== 0) throw new Error(`ยังเหลือไม่ตรง ${after[0]["ยังไม่ตรง"]} — rollback`);
  await c.query("commit");
  console.log(`\n✅ ยึดใบขนแล้ว ${adopt.length} พิกัด · ติดธงรอตรวจ ${review.length} · เหลือไม่ตรง (ใบขนนิ่ง) = 0`);
} catch (e) {
  try { await c.query("rollback"); } catch {}
  console.error("❌", e.message); process.exitCode = 1;
} finally { await c.end(); }
