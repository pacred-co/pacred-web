/**
 * แปลง body ของบทความ "สาระน่ารู้ (knowledge)" + "ข่าวสาร (news)" จาก text ดิบ
 * ที่พึ่งการ์ดอัตโนมัติ → HTML ที่คนเขียนคุมเองได้ (ปอน 2026-08-01)
 *
 * ⚠️ ผลงานของเรา (our_work) ไม่แตะ — owner สั่งให้คงการ์ดเดิมไว้ทั้งหมด
 *
 * ปลอดภัยแบบเดียวกับสคริปต์แก้ข้อมูล prod ตัวอื่น:
 *   • dry-run เป็นค่าเริ่มต้น — ต้องใส่ --apply ถึงจะเขียนจริง
 *   • เขียน backup ทุก body เดิมลงไฟล์ก่อนแตะ DB (กู้คืนได้)
 *   • idempotent — body ที่เป็น HTML อยู่แล้วจะถูกข้าม รันซ้ำได้ไม่พัง
 *   • แตะแค่คอลัมน์ body / body_en ไม่ยุ่งกับสถานะ/สลัก/SEO/วันเผยแพร่
 *
 *   node --env-file=.env.local scripts/convert-article-body-to-html-2026-08-01.ts
 *   node --env-file=.env.local scripts/convert-article-body-to-html-2026-08-01.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { legacyBodyToHtml, isHtmlBody } from "@/lib/cms/legacy-body-to-html";

const APPLY = process.argv.includes("--apply");
const CATEGORIES = ["knowledge", "news"];

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: rows, error } = await db
    .from("cms_articles")
    .select("id, slug, title, category, status, body, body_en")
    .in("category", CATEGORIES)
    .order("id");
  if (error) throw new Error(`read failed: ${error.message}`);

  console.log(`พบบทความในสโคป (knowledge + news) = ${rows.length} รายการ\n`);

  type Row = { id: number; slug: string; title: string; category: string; status: string; body: string | null; body_en: string | null };
  const plan: Array<{ row: Row; patch: Record<string, string> }> = [];
  for (const r of rows) {
    const th = r.body ?? "";
    const en = r.body_en ?? "";
    const thNeeds = th.trim() !== "" && !isHtmlBody(th);
    const enNeeds = en.trim() !== "" && !isHtmlBody(en);
    if (!thNeeds && !enNeeds) {
      console.log(`  ข้าม  id=${r.id} [${r.category}/${r.status}] ${r.slug} — เป็น HTML อยู่แล้ว/ว่าง`);
      continue;
    }
    const patch: Record<string, string> = {};
    if (thNeeds) patch.body = legacyBodyToHtml(th, r.title);
    if (enNeeds) patch.body_en = legacyBodyToHtml(en, r.title);
    plan.push({ row: r, patch });
    const parts = [thNeeds ? `TH ${th.length}→${patch.body.length}` : null,
                   enNeeds ? `EN ${en.length}→${patch.body_en.length}` : null].filter(Boolean);
    console.log(`  แปลง id=${r.id} [${r.category}/${r.status}] ${r.slug}  (${parts.join(" · ")})`);
  }

  console.log(`\nสรุป: จะแปลง ${plan.length} รายการ · ข้าม ${rows.length - plan.length}`);

  // ตรวจว่าไม่มีเนื้อหาหาย — ตัวอักษรไทย/อังกฤษต้องอยู่ครบหลังถอด tag ออก
  let lost = 0;
  for (const { row, patch } of plan) {
    if (!patch.body) continue;
    const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, "");
    const before = strip(row.body ?? "");
    const after = strip(patch.body);
    // ตัวแปลงตัดหัวเรื่องซ้ำ/ตัวคั่นบางตัวทิ้งตามตัวเรนเดอร์เดิม → ยอมให้หายได้ ≤12%
    const keep = after.length / Math.max(before.length, 1);
    if (keep < 0.88) {
      lost++;
      console.log(`  🔴 id=${row.id} ${row.slug} — เนื้อหาเหลือ ${(keep * 100).toFixed(1)}% ตรวจก่อน!`);
    }
  }
  if (lost) console.log(`\n⚠️  มี ${lost} รายการที่เนื้อหาหายเกินเกณฑ์ — ตรวจก่อน apply`);

  if (!APPLY) {
    console.log("\n[DRY-RUN] ยังไม่เขียนอะไรลง DB — ใส่ --apply เมื่อพร้อม");
    return;
  }

  const backup = `scripts/_backup-article-body-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(
    plan.map(({ row }) => ({ id: row.id, slug: row.slug, body: row.body, body_en: row.body_en })),
    null, 2,
  ), "utf8");
  console.log(`\nbackup → ${backup}`);

  let ok = 0;
  for (const { row, patch } of plan) {
    const { error: upErr } = await db.from("cms_articles").update(patch).eq("id", row.id);
    if (upErr) { console.log(`  ❌ id=${row.id} ${upErr.message}`); continue; }
    ok++;
  }
  console.log(`\n✅ เขียนแล้ว ${ok}/${plan.length} รายการ`);
}

main().catch((e) => { console.error(e); process.exit(1); });
