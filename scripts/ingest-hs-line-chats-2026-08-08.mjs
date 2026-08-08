/**
 * ingest-hs-line-chats-2026-08-08.mjs — เอาพิกัด/ชื่อ/อากร จากแชท LINE เข้าคลัง HS
 *
 * owner 2026-08-08: *"อัพเดทแพทให้ทีครับ พิกัด … เอามาให้ครบทุกซอกมุมนะครับ
 * เพราะมันช่วยพนักงานทำงานได้ง่ายขึ้นอีกหลายชีวิตเลยครับ"*
 *
 * อินพุต = ผลจาก `parse-hs-line-chats-2026-08-08.mjs` (แกะแชท 2 กลุ่ม)
 *
 * ── กฎความปลอดภัย (พิกัด = เรื่องภาษี/กฎหมาย ผิดไม่ได้) ─────────────────────
 *  1. **ไม่ทับ `description` ที่มีอยู่** — ของเดิมมาจากพิกัดศุลกากรจริง ชนะแชทเสมอ
 *  2. **ไม่ทับ `default_duty_pct` ที่มีค่าแล้ว** — เติมเฉพาะแถวที่ยังว่าง ·
 *     ค่าจากแชทที่ต่างจากของเดิม → เก็บเป็น `decl_duty_pct` (ค่าที่ "เคยใช้จริง")
 *     + จดไว้ใน hs_note ให้คนตัดสิน ไม่เงียบ
 *  3. **ชื่อจากแชท = alias (ตัวช่วยค้นหา) เท่านั้น** — ไม่ใช่คำอธิบายทางการ
 *  4. ธงกฎหมาย (มอก./อย./ใบอนุญาต/เลี่ยงพิกัด/ทุ่มตลาด) ต่อท้าย hs_note ไม่ลบของเดิม
 *  5. dry-run เป็นค่าเริ่มต้น · --apply ถึงเขียน · idempotent (รันซ้ำ = 0 เปลี่ยน)
 *
 * RUN: PGPW='<prod>' node scripts/ingest-hs-line-chats-2026-08-08.mjs [--apply]
 */
import { execFileSync } from "node:child_process";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PW = process.env.PGPW;
if (!PW) { console.error("ต้องส่ง PGPW=<prod pw>"); process.exit(1); }

const parsed = JSON.parse(
  execFileSync("node", ["scripts/parse-hs-line-chats-2026-08-08.mjs"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  }),
);

/** พิกัดในคลังเก็บได้หลายรูป (8410, 8410.10, 84101000) → เทียบด้วยตัวเลขล้วน */
const digits = (s) => String(s ?? "").replace(/[^\d]/g, "");
/** คีย์ 8 หลัก (เติม 0 ท้าย) — ใช้จับคู่ข้ามรูปแบบเหมือน hs8_key ในตาราง */
const hs8 = (s) => digits(s).slice(0, 8).padEnd(8, "0");

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

try {
  const { rows: existing } = await c.query(
    `select code, description, description_en, default_duty_pct, form_e_duty_pct,
            hs_note, product_aliases, decl_duty_pct
       from hs_codes`,
  );
  // จับคู่ 2 ชั้น: ตรงเป๊ะ (ตัวเลขล้วน) ก่อน → ไม่เจอค่อยใช้คีย์ 8 หลัก
  const byExact = new Map(existing.map((r) => [digits(r.code), r]));
  const by8 = new Map();
  for (const r of existing) if (!by8.has(hs8(r.code))) by8.set(hs8(r.code), r);

  const plan = { newRows: [], addAlias: [], fillDuty: [], noteOnly: [], dutyConflict: [] };

  for (const g of parsed.codes) {
    const key = digits(g.code);
    const hit = byExact.get(key) ?? by8.get(hs8(key));
    // ชื่อที่จะใช้: เลือกตัวที่มีทั้งไทย+อังกฤษก่อน (เช่น "Steering Wheel/พวงมาลัยรถยนตร์")
    const names = g.names.filter((n) => n.length >= 2);
    const best = names.find((n) => /[฀-๿]/.test(n) && /[A-Za-z]{3}/.test(n)) ?? names[0];
    if (!best) continue;

    const flagNote = g.flags.length ? `⚠ ${g.flags.join(" · ")}` : "";
    const srcNote = `[LINE ${g.seen[0] ?? ""}]`.trim();

    if (!hit) {
      // ── สร้างพิกัดใหม่ = เข้มกว่าการเติม alias มาก (ของปลอมในคลัง = พนักงานเลิกเชื่อ) ──
      //  · ต้อง ≥6 หลัก (พิกัดจริงระดับที่ใช้ทำงาน · 4 หลัก = แค่ประเภท กว้างเกินจะสร้างใหม่)
      //  · ชื่อต้องไม่ใช่ชื่อไฟล์/รหัสงาน/วันที่
      const nameLooksJunk =
        /\.(pdf|xlsx?|docx?|jpe?g|png)\b/i.test(best) ||
        /^(PR|P)\s*\d|^[0-9a-f]{8}-[0-9a-f]{4}/i.test(best) ||
        /^(HS|hs)\s*(code)?\s*:?$/i.test(best) ||
        /^\d{6,}$/.test(best.replace(/\D/g, "")) ||
        best.replace(/[^ก-๙A-Za-z]/g, "").length < 3;
      if (key.length < 6 || nameLooksJunk) { plan.skipped ??= []; plan.skipped.push({ code: g.code, name: best.slice(0, 40) }); continue; }
      plan.newRows.push({
        code: g.code, description: best,
        duty: g.duty, formE: g.formE,
        aliases: names,
        note: [flagNote, g.duty == null ? "⚠ แชทไม่ได้ระบุอากร — ยังไม่ยืนยัน" : "", srcNote]
          .filter(Boolean).join(" · "),
      });
      continue;
    }

    const cur = new Set((hit.product_aliases ?? []).map((a) => String(a).trim()).filter(Boolean));
    const fresh = names.filter((n) => !cur.has(n));
    if (fresh.length) plan.addAlias.push({ code: hit.code, add: fresh, had: cur.size });

    const curDuty = hit.default_duty_pct == null ? null : Number(hit.default_duty_pct);
    if (g.duty != null) {
      if (curDuty == null) plan.fillDuty.push({ code: hit.code, duty: g.duty, formE: g.formE });
      else if (Math.abs(curDuty - g.duty) > 0.001) {
        // ❗ ไม่ทับ — จดไว้ให้คนตรวจ (แชทอาจเป็น "พิกัดเลี่ยง" คนละอัตรากับพิกัดตรง)
        plan.dutyConflict.push({ code: hit.code, inDb: curDuty, inChat: g.duty, names: names.slice(0, 2) });
      }
    }
    if (flagNote && !String(hit.hs_note ?? "").includes(g.flags[0])) {
      plan.noteOnly.push({ code: hit.code, note: flagNote });
    }
  }

  console.log(`\n━━ แผนอัพเดทคลัง HS จากแชท LINE 2 กลุ่ม ━━
  พิกัดที่แกะได้ทั้งหมด : ${parsed.distinctCodes} รหัส (${parsed.totalMentions} ครั้งที่พูดถึง)
  ① เพิ่มพิกัดใหม่       : ${plan.newRows.length}
  ② เติมชื่อค้นหา (alias) : ${plan.addAlias.length} พิกัด · รวม ${plan.addAlias.reduce((n, x) => n + x.add.length, 0)} ชื่อ
  ③ เติมอากรที่ยังว่าง    : ${plan.fillDuty.length}
  ④ ติดธงข้อควรระวัง     : ${plan.noteOnly.length}
  🟠 อากรไม่ตรงกับคลัง   : ${plan.dutyConflict.length} (ไม่ทับ — จดไว้ให้คนตรวจ)
  ⚪ ข้ามไม่สร้างใหม่      : ${(plan.skipped ?? []).length} (เลขสั้นเกิน/ชื่อเป็นไฟล์-รหัสงาน)`);

  if (plan.dutyConflict.length) {
    console.log("\n🟠 อากรในแชท ≠ ในคลัง (ไม่แตะ · อาจเป็นพิกัดเลี่ยงคนละอัตรา):");
    console.table(plan.dutyConflict.slice(0, 12));
  }
  console.log("\nตัวอย่างพิกัดใหม่ 8 รายการ:");
  console.table(plan.newRows.slice(0, 8).map((r) => ({
    code: r.code, ชื่อ: r.description.slice(0, 44), อากร: r.duty, fe: r.formE, ธง: r.note.slice(0, 24),
  })));

  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

  await c.query("begin");
  let wrote = 0;
  for (const r of plan.newRows) {
    await c.query(
      // ⚠️ default_duty_pct + form_e_duty_pct = NOT NULL → ส่ง null ไม่ได้.
      // แชทไม่ได้บอกอัตรา = ลง 0 **แล้วติดธงใน hs_note ว่ายังไม่ยืนยัน** (ดู note ล่าง)
      // — ห้ามปล่อยให้พนักงานเห็น 0 แล้วเข้าใจว่า "ไม่มีอากร" โดยไม่รู้ว่ายังไม่ยืนยัน
      `insert into hs_codes (code, description, default_duty_pct, form_e_duty_pct, hs_note,
                             product_aliases, source, provenance, is_active, updated_by, updated_at)
       values ($1,$2,coalesce($3, 0),coalesce($4, 0),$5,$6::jsonb,'LINE-chat','แชทกลุ่มถามพิกัด (Doc/AUDIT ตอบ)',true,'ingest-line-2026-08-08',now())
       on conflict (code) do nothing`,
      [r.code, r.description, r.duty, r.formE, r.note, JSON.stringify(r.aliases)],
    );
    wrote++;
  }
  for (const a of plan.addAlias) {
    await c.query(
      `update hs_codes
          set product_aliases = (
                select jsonb_agg(distinct x) from (
                  select jsonb_array_elements(coalesce(product_aliases,'[]'::jsonb)) x
                  union select jsonb_array_elements($2::jsonb) x) u),
              updated_by='ingest-line-2026-08-08', updated_at=now()
        where code=$1`,
      [a.code, JSON.stringify(a.add)],
    );
    wrote++;
  }
  for (const d of plan.fillDuty) {
    await c.query(
      `update hs_codes set default_duty_pct=$2,
              form_e_duty_pct=coalesce($3, form_e_duty_pct),
              updated_by='ingest-line-2026-08-08', updated_at=now()
        where code=$1 and default_duty_pct is null`,
      [d.code, d.duty, d.formE],
    );
    wrote++;
  }
  for (const n of plan.noteOnly) {
    await c.query(
      `update hs_codes
          set hs_note = case when coalesce(hs_note,'')='' then $2 else hs_note || ' · ' || $2 end,
              updated_by='ingest-line-2026-08-08', updated_at=now()
        where code=$1 and coalesce(hs_note,'') not like '%'||$2||'%'`,
      [n.code, n.note],
    );
    wrote++;
  }
  await c.query("commit");
  const { rows: after } = await c.query(
    `select count(*)::int rows,
            count(*) filter (where coalesce(product_aliases::text,'[]')<>'[]')::int with_alias,
            sum(coalesce(jsonb_array_length(product_aliases),0))::int alias_total
       from hs_codes`,
  );
  console.log(`\n✅ เขียนแล้ว ${wrote} คำสั่ง · คลังตอนนี้:`); console.table(after);
} catch (e) {
  try { await c.query("rollback"); } catch {}
  console.error("❌", e.message); process.exitCode = 1;
} finally { await c.end(); }
