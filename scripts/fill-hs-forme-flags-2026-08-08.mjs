/**
 * fill-hs-forme-flags-2026-08-08.mjs — เติม "สิทธิประโยชน์ (Form-E)" + ธงข้อควรระวัง
 *
 * owner 2026-08-08: *"มันมีเรทอากรสำหรับขอสิทธิประโยชน์ด้วยนี่ครับ อย่างเช่น
 * FORM E 0% / 5% อะไรแบบนั้น … บางอันมีติดไม่ติด ต้องเลี่ยงอะไร ในแชทพอมีบอกบ้างไหม"*
 *
 * แชทมีครบ (จาก 212 พิกัด): ระบุ Form-E **120 พิกัด** (0%=114 · 5%=5 · 30%=1)
 * และธงข้อควรระวัง **51 พิกัด** — เลี่ยงพิกัด 36 · มอก. 17 · ใบอนุญาต 11 ·
 * ไม่ติดใบอนุญาต 6 · ตอบโต้ทุ่มตลาด 2 · อย. 2 · ฟอร์มอีจีนไม่รองรับ 1
 *
 * ── กฎ (เหมือนเรื่องอากร: ของจริงชนะ · ไม่ทับสิ่งที่ยืนยันแล้ว) ────────────────
 *  A. Form-E จาก **ใบขนจริง** (`decl_form_e_pct` · ใบขนนิ่ง) ชนะทุกอย่าง → ยึดเลย
 *  B. Form-E จาก **แชท** เขียนเฉพาะเมื่อ (ก) แชทบอกค่า **ไม่ใช่ 0** และ
 *     (ข) คลังยังเป็น 0 (= ค่า default ของคอลัมน์ แยกไม่ออกว่า "0 จริง" หรือ "ยังไม่กรอก")
 *     และ (ค) ยังไม่มีใบขนยืนยัน ⇒ ไม่ไปทับเคสที่ Form-E เป็น 0 จริงๆ
 *     · แชทบอก 0 + คลังเป็น 0 = ไม่ต้องเขียน (เท่ากันอยู่แล้ว) แต่ **ติดธงว่ายืนยันจากแชท**
 *  C. ธงข้อควรระวัง → ต่อท้าย `hs_note` (ไม่ลบของเดิม · ไม่ซ้ำ)
 *
 * dry-run เป็นค่าเริ่มต้น · --apply ถึงเขียน · backup + txn · idempotent
 * RUN: PGPW='<prod>' node scripts/fill-hs-forme-flags-2026-08-08.mjs [--apply]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PW = process.env.PGPW;
if (!PW) { console.error("ต้องส่ง PGPW=<prod pw>"); process.exit(1); }

const parsed = JSON.parse(execFileSync("node", ["scripts/parse-hs-line-chats-2026-08-08.mjs"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

const digits = (s) => String(s ?? "").replace(/[^\d]/g, "");
const hs8 = (s) => digits(s).slice(0, 8).padEnd(8, "0");

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

try {
  const { rows: existing } = await c.query(
    `select code, description, form_e_duty_pct, decl_form_e_pct, decl_count,
            decl_duty_stable, hs_note, duty_confirmed
       from hs_codes`);
  const byExact = new Map(existing.map((r) => [digits(r.code), r]));
  const by8 = new Map();
  for (const r of existing) if (!by8.has(hs8(r.code))) by8.set(hs8(r.code), r);

  // ── A. Form-E จากใบขนจริง (ยึดเลย ตามที่ owner สั่งเรื่องอากร) ──
  const fromDecl = existing.filter((r) =>
    r.decl_count > 0 && r.decl_form_e_pct != null && r.decl_duty_stable &&
    Math.abs(Number(r.form_e_duty_pct ?? 0) - Number(r.decl_form_e_pct)) > 0.001);

  // ── B/C. จากแชท ──
  const feFromChat = [], flagRows = [];
  for (const g of parsed.codes) {
    const hit = byExact.get(digits(g.code)) ?? by8.get(hs8(digits(g.code)));
    if (!hit) continue;
    const cur = Number(hit.form_e_duty_pct ?? 0);
    if (g.formE != null && g.formE > 0 && Math.abs(cur) < 0.001 && !(hit.decl_count > 0)) {
      feFromChat.push({ code: hit.code, from: cur, to: g.formE, name: (hit.description ?? "").slice(0, 30) });
    }
    if (g.flags.length) {
      const note = `⚠ ${g.flags.join(" · ")}`;
      if (!String(hit.hs_note ?? "").includes(g.flags[0])) {
        flagRows.push({ code: hit.code, note, flags: g.flags });
      }
    }
  }

  console.log(`\n━━ สิทธิประโยชน์ (Form-E) + ธงข้อควรระวัง ━━
  แชทระบุ Form-E        : ${parsed.codes.filter((x) => x.formE != null).length} พิกัด
  A. ยึดจากใบขนจริง      : ${fromDecl.length}
  B. เติมจากแชท (ไม่ใช่ 0) : ${feFromChat.length}
  C. ติดธงข้อควรระวัง     : ${flagRows.length}`);
  if (fromDecl.length) {
    console.log("\nA. Form-E ตามใบขนจริง:");
    console.table(fromDecl.slice(0, 10).map((r) => ({
      code: r.code, ชื่อ: String(r.description ?? "").slice(0, 28),
      เดิม: Number(r.form_e_duty_pct ?? 0), "→ ใบขน": Number(r.decl_form_e_pct), ใบ: r.decl_count })));
  }
  if (feFromChat.length) { console.log("\nB. Form-E จากแชท:"); console.table(feFromChat.slice(0, 10)); }
  if (flagRows.length) {
    console.log("\nC. ธง (ตัวอย่าง):");
    console.table(flagRows.slice(0, 10).map((r) => ({ code: r.code, ธง: r.flags.join(" · ") })));
  }

  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

  const stamp = Date.now();
  writeFileSync(`scripts/_backup-hs-forme-${stamp}.json`,
    JSON.stringify({ fromDecl, feFromChat, flagRows }, null, 1));
  console.log(`  backup → scripts/_backup-hs-forme-${stamp}.json`);

  await c.query("begin");
  for (const r of fromDecl) {
    const note = `Form-E เดิมในคลัง ${Number(r.form_e_duty_pct ?? 0)}% → ยึดตามใบขนจริง ${Number(r.decl_form_e_pct)}% (${r.decl_count} ใบ · 2026-08-08)`;
    await c.query(
      `update hs_codes set form_e_duty_pct=$2,
              hs_note = case when coalesce(hs_note,'')='' then $3 else hs_note || ' · ' || $3 end,
              updated_by='fill-forme-2026-08-08', updated_at=now()
        where code=$1`, [r.code, r.decl_form_e_pct, note]);
  }
  for (const r of feFromChat) {
    await c.query(
      `update hs_codes set form_e_duty_pct=$2,
              hs_note = case when coalesce(hs_note,'')='' then $3 else hs_note || ' · ' || $3 end,
              updated_by='fill-forme-2026-08-08', updated_at=now()
        where code=$1 and coalesce(form_e_duty_pct,0)=0 and coalesce(decl_count,0)=0`,
      [r.code, r.to, `Form-E ${r.to}% (จากแชท Doc/AUDIT 2026-08-08 · ยังไม่ผ่านใบขน)`]);
  }
  for (const r of flagRows) {
    await c.query(
      `update hs_codes
          set hs_note = case when coalesce(hs_note,'')='' then $2 else hs_note || ' · ' || $2 end,
              updated_by='fill-forme-2026-08-08', updated_at=now()
        where code=$1 and coalesce(hs_note,'') not like '%'||$3||'%'`,
      [r.code, r.note, r.flags[0]]);
  }
  await c.query("commit");
  const { rows: after } = await c.query(
    `select count(*) filter (where coalesce(form_e_duty_pct,0)>0)::int มีสิทธิพิเศษ,
            count(*) filter (where hs_note ilike '%⚠%')::int ติดธง,
            count(*) filter (where hs_note ilike '%เลี่ยงพิกัด%')::int ต้องเลี่ยง
       from hs_codes`);
  console.log(`\n✅ เขียนแล้ว · คลังตอนนี้:`); console.table(after);
} catch (e) {
  try { await c.query("rollback"); } catch {}
  console.error("❌", e.message); process.exitCode = 1;
} finally { await c.end(); }
