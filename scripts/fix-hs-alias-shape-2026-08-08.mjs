/**
 * fix-hs-alias-shape-2026-08-08.mjs — แปลง alias ที่เป็น string ล้วน → object ตาม schema
 *
 * บั๊กที่ผมทำเองตอน ingest แชท LINE (2026-08-08): `hs_codes.product_aliases` ใน
 * ระบบเป็น **array ของ object** `{th, en, note, src}` (ดู `HsProductAlias` ใน
 * actions/admin/hs-codes.ts) แต่สคริปต์ ingest เขียนเป็น **string ล้วน** ลงไป
 * → หน้าคลัง HS อ่าน `a.th`/`a.en` ไม่เจอ = ชื่อที่เพิ่งเติมเข้าไป **ไม่โผล่บนจอ**
 * (พนักงานค้นแล้วยังหาไม่เจอเหมือนเดิม = งานที่ทำสูญเปล่า)
 *
 * แปลง: "Steering Wheel/พวงมาลัยรถยนตร์" → { th: "พวงมาลัยรถยนตร์",
 *        en: "Steering Wheel", src: "line" }
 *   · มีทั้งไทย+อังกฤษคั่นด้วย / หรือ - → แยก 2 ช่อง
 *   · มีแต่ไทย → th · มีแต่อังกฤษ → en
 *   · กันซ้ำกับ alias เดิมที่เป็น object อยู่แล้ว (เทียบด้วย th+en หลัง trim)
 *
 * dry-run เป็นค่าเริ่มต้น · --apply ถึงเขียน · idempotent (รันซ้ำ = 0)
 * RUN: PGPW='<prod>' node scripts/fix-hs-alias-shape-2026-08-08.mjs [--apply]
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PW = process.env.PGPW;
if (!PW) { console.error("ต้องส่ง PGPW=<prod pw>"); process.exit(1); }

const hasThai = (s) => /[฀-๿]/.test(s);
const hasLatin = (s) => /[A-Za-z]{2,}/.test(s);

/** "EN / ไทย" หรือ "ไทย / EN" หรือ "EN-ไทย" → { th, en } */
function splitName(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  for (const sep of ["/", " - ", "-", "–"]) {
    const i = s.indexOf(sep);
    if (i <= 0) continue;
    const a = s.slice(0, i).trim(), b = s.slice(i + sep.length).trim();
    if (!a || !b) continue;
    if (hasLatin(a) && hasThai(b) && !hasThai(a)) return { en: a, th: b };
    if (hasThai(a) && hasLatin(b) && !hasThai(b)) return { th: a, en: b };
  }
  if (hasThai(s)) return { th: s, en: null };
  if (hasLatin(s)) return { th: null, en: s };
  return { th: s, en: null };
}

const key = (o) => `${(o.th ?? "").trim()}|${(o.en ?? "").trim()}`.toLowerCase();

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

try {
  const { rows } = await c.query(
    `select code, product_aliases from hs_codes
      where exists (select 1 from jsonb_array_elements(coalesce(product_aliases,'[]'::jsonb)) e
                    where jsonb_typeof(e)='string')`,
  );
  const plan = [];
  for (const r of rows) {
    const arr = Array.isArray(r.product_aliases) ? r.product_aliases : [];
    const objects = arr.filter((a) => a && typeof a === "object");
    const seen = new Set(objects.map((o) => key(o)));
    const converted = [];
    for (const a of arr) {
      if (typeof a !== "string") continue;
      const parts = splitName(a);
      if (!parts) continue;
      const o = { th: parts.th, en: parts.en, note: null, src: "line" };
      const k = key(o);
      if (seen.has(k)) continue;            // มีอยู่แล้วในรูป object = ไม่ซ้ำเข้าไปอีก
      seen.add(k);
      converted.push(o);
    }
    const next = [...objects, ...converted];
    if (JSON.stringify(next) !== JSON.stringify(arr)) {
      plan.push({ code: r.code, before: arr.length, after: next.length, next });
    }
  }

  console.log(`\n━━ แปลง alias string → object ━━
  แถวที่มี alias เป็น string : ${rows.length}
  แถวที่จะเขียน             : ${plan.length}
  ชื่อรวมหลังแปลง            : ${plan.reduce((n, p) => n + p.after, 0)}`);
  console.table(plan.slice(0, 6).map((p) => ({
    code: p.code, ก่อน: p.before, หลัง: p.after,
    ตัวอย่าง: JSON.stringify(p.next.find((o) => o.src === "line") ?? p.next[0]).slice(0, 60),
  })));

  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

  const stamp = Date.now();
  writeFileSync(`scripts/_backup-hs-alias-${stamp}.json`,
    JSON.stringify(rows.map((r) => ({ code: r.code, product_aliases: r.product_aliases })), null, 1));
  console.log(`  backup → scripts/_backup-hs-alias-${stamp}.json`);

  await c.query("begin");
  for (const p of plan) {
    await c.query(
      `update hs_codes set product_aliases=$2::jsonb, updated_at=now(),
              updated_by='fix-alias-shape-2026-08-08' where code=$1`,
      [p.code, JSON.stringify(p.next)],
    );
  }
  const { rows: after } = await c.query(
    `select count(*) filter (where exists (select 1 from jsonb_array_elements(coalesce(product_aliases,'[]'::jsonb)) e where jsonb_typeof(e)='string'))::int still_string,
            count(*) filter (where coalesce(product_aliases::text,'[]')<>'[]')::int with_alias
       from hs_codes`,
  );
  if (after[0].still_string !== 0) throw new Error(`ยังเหลือ string alias ${after[0].still_string} แถว — rollback`);
  await c.query("commit");
  console.log(`\n✅ แปลงแล้ว ${plan.length} แถว · เหลือ string alias 0 · แถวที่มีชื่อค้นหา ${after[0].with_alias}`);
} catch (e) {
  try { await c.query("rollback"); } catch {}
  console.error("❌", e.message); process.exitCode = 1;
} finally { await c.end(); }
