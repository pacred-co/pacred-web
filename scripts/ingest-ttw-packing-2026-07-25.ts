/**
 * ingest-ttw-packing-2026-07-25.ts — stage 4 ตู้อี้อู YWS ใหม่ (owner 2026-07-25)
 * เข้า ttw_packing_line + จับคู่ PR ให้แน่นกว่ารอบแรก.
 *
 * owner: "ดูไฟล์ packinglist ของทางอี้อูเพิ่มเติมครับ มันมี PR ในระบบแล้วนะครับ
 *         จับคู่ อัพเดทให้หน่อยครับ"
 *
 * ต่างจากรอบ 2026-07-18 (สคริปต์เดิม hardcode 8 ตู้เก่า):
 *   1. PR จากมาร์ค (PR###) ถูก **verify กับ tb_users จริง** ก่อนเขียน — ไม่เจอ = ไม่ใส่
 *      (ลอง normalize: PR26 → PR026 ตามกติกา member_code ขั้นต่ำ 3 หลัก)
 *   2. มาร์คที่ไม่ใช่ PR ตรงๆ → **reuse การจับคู่ที่ CS เคยทำแล้ว** ใน ttw_packing_line
 *      (มาร์คเดียวกัน = ลูกค้าเดียวกัน — แนวเดียวกับ mark-family propagation ของหน้า TTW)
 *   3. รายงานว่าแทรคกิ้งไหน **มีใน tb_forwarder แล้ว** (CS คีย์จากใบส่งของ) — พวกนั้น
 *      DOC กดปุ่ม "เอาเข้าระบบ" บนหน้า staging = ระบบ **เชื่อมของเดิม** ไม่สร้างซ้ำ (ภูม 2026-07-25)
 *
 * SAFETY เหมือนเดิม: ttw_packing_line = STAGING (ไม่ใช่ billable · ไม่มีเงิน) ·
 * upsert idempotent · ไม่ทับ member_code ที่ CS ใส่แล้ว · ไม่แตะแถว committed ·
 * dry-run ก่อน --apply เสมอ + backup.
 *
 * RUN: SUPABASE_DB_PASSWORD='…' ./node_modules/.bin/tsx scripts/ingest-ttw-packing-2026-07-25.ts [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { parseYiwuPackingXlsx } from "../lib/admin/yiwu-packing-xlsx-parser";
import { transportModeFromCabinetName } from "../lib/forwarder/cabinet-transport";

const APPLY = process.argv.includes("--apply");
const DIR = "/Users/dev/Downloads";
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

// 4 ตู้ใหม่ที่ owner ส่ง (ชื่อไฟล์ = เลขตู้ = fcabinetnumber ในอนาคต · YWS = อี้อู เรือ)
const FILES = ["YWS260720-9T", "YWS260722-10T", "YWS260723-1T", "YWS260724-2T"];

const round = (n: number, dp: number) => { const f = 10 ** dp; return Math.round(n * f) / f; };

/**
 * มาร์คที่เป็นโค้ดลูกค้าเราตรงๆ → เลขดิบ ยังไม่ verify.
 * รับทั้ง "PR032/SEA" และ **"PCS10830/SEA"** — โค้ด PCS เก่าถูก rename เป็น PR
 * ตอน migration (PCS<n> → PR<n> เลขเดิม) · ลูกค้าเก่ายังเขียนมาร์คด้วยโค้ดเดิมได้.
 */
function prFromMark(mark: string | null | undefined): string | null {
  const up = (mark ?? "").toUpperCase();
  const pr = up.match(/PR(\d{2,})/);
  if (pr) return `PR${pr[1]}`;
  const pcs = up.match(/PCS(\d{2,})/);
  if (pcs) return `PR${pcs[1]}`;
  return null;
}

/** ตัวเลือกที่เป็นไปได้ของ PR ในระบบ: ดิบ + zero-pad 3 หลัก (PR26 → PR026). */
function prCandidates(raw: string): string[] {
  const digits = raw.slice(2);
  const out = new Set<string>([raw]);
  out.add(`PR${digits.padStart(3, "0")}`);
  // เผื่อกรณีมาร์คเขียน PR026 แต่ระบบเก็บ PR26 (ไม่น่ามีแต่กันไว้ · lookup ถูกๆ)
  out.add(`PR${String(Number(digits))}`);
  return [...out];
}

type PlanRow = {
  container_no: string; base_tracking: string; shipping_mark: string | null;
  member_code: string | null; pr_source: string | null; warehouse: string; origin: string;
  transport_mode: string; boxes: number | null; weight_kg: number | null; cbm: number | null;
  product_name: string | null; item_type: string | null; sm_date: string | null; source_file: string;
  in_system: boolean; // มี tb_forwarder แล้ว (base หรือ -N)
};

async function main() {
  // pooler aws-1 เท่านั้น — direct host db.<ref>:5432 ตายบนเครื่องนี้ (IPv6-only · 2026-07-19)
  const c = new pg.Client({
    connectionString: `postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(PW!)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();

  // ── ตัวช่วยจับคู่ 2 ชั้น (อ่านอย่างเดียว · ใช้ทั้ง dry-run และ apply) ──
  // ชั้น 1: มาร์ค → PR ที่ CS เคยผูกไว้แล้วใน staging (มาร์คเดียวกัน = ลูกค้าเดียวกัน)
  const { rows: markRows } = await c.query(
    `SELECT DISTINCT upper(trim(shipping_mark)) AS mark, member_code
       FROM ttw_packing_line
      WHERE member_code IS NOT NULL AND coalesce(trim(shipping_mark),'') <> ''`,
  );
  const markToPr = new Map<string, string>();
  const markConflict = new Set<string>();
  for (const r of markRows as { mark: string; member_code: string }[]) {
    const prev = markToPr.get(r.mark);
    if (prev && prev !== r.member_code) markConflict.add(r.mark); // มาร์คเดียว 2 PR = ห้ามเดา
    else markToPr.set(r.mark, r.member_code);
  }
  for (const m of markConflict) markToPr.delete(m);

  // ชั้น 2: verify PR มีจริงใน tb_users
  const prExists = new Map<string, boolean>();
  async function verifyPr(code: string): Promise<string | null> {
    for (const cand of prCandidates(code)) {
      if (!prExists.has(cand)) {
        const { rows } = await c.query(`SELECT 1 FROM tb_users WHERE "userID" = $1 LIMIT 1`, [cand]);
        prExists.set(cand, rows.length > 0);
      }
      if (prExists.get(cand)) return cand;
    }
    return null;
  }

  const plan: PlanRow[] = [];
  const perContainer: Array<{
    ตู้: string; แทรค: number; กล่อง: number; kg: number; คิว: number;
    "PR-มาร์ค": number; "PR-เดิมCS": number; "PRไม่พบในระบบ": number; "มีในระบบแล้ว": number;
  }> = [];
  const unverified: Array<{ ตู้: string; แทรค: string; มาร์ค: string | null; PRบนมาร์ค: string }> = [];
  const prMismatch: Array<{ ตู้: string; แทรค: string; มาร์คว่า: string; แถวจริงว่า: string }> = [];

  for (const name of FILES) {
    const buf = readFileSync(`${DIR}/${name}.xlsx`);
    const parsed = parseYiwuPackingXlsx(buf);
    const transport = transportModeFromCabinetName(name) ?? "2"; // YWS = เรือ
    let boxes = 0, wt = 0, cbm = 0, prMark = 0, prReuse = 0, prMiss = 0, inSys = 0;

    for (const a of parsed.aggregated) {
      const track = (a.baseTracking ?? "").trim();
      if (!track) continue;
      const mark = (a.code ?? "").trim() || null;

      // ── จับคู่ PR ──
      let member: string | null = null;
      let source: string | null = null;
      const rawPr = prFromMark(mark);
      if (rawPr) {
        member = await verifyPr(rawPr);
        if (member) { source = "mark"; prMark++; }
        else { prMiss++; unverified.push({ ตู้: name, แทรค: track, มาร์ค: mark, PRบนมาร์ค: rawPr }); }
      }
      if (!member && mark) {
        const reused = markToPr.get(mark.toUpperCase()) ?? null;
        if (reused) { member = reused; source = "mark_history"; prReuse++; }
      }

      // ── มีใน tb_forwarder แล้วไหม (base หรือ box-split -N) ──
      // ถ้ามี = CS คีย์จากใบส่งของแล้ว → **userid บนแถวจริงคือการจับคู่ที่แรงสุด**
      // (ชนะมาร์ค — มาจากมือ CS ที่เห็นใบส่งของจริง)
      const { rows: fw } = await c.query(
        `SELECT userid FROM tb_forwarder WHERE ftrackingchn = $1 OR ftrackingchn LIKE $2
          ORDER BY id LIMIT 1`,
        [track, `${track.replace(/[%_]/g, "\\$&")}-%`],
      );
      const exists = fw.length > 0;
      if (exists) {
        inSys++;
        const uid = ((fw[0] as { userid: string | null }).userid ?? "").trim();
        if (uid) {
          if (member && member !== uid)
            prMismatch.push({ ตู้: name, แทรค: track, มาร์คว่า: member, แถวจริงว่า: uid });
          member = uid; source = "forwarder_row";
        }
      }

      const b = a.parcelCount == null ? null : Math.round(a.parcelCount);
      const w = a.totalWeight == null ? null : round(a.totalWeight, 3);
      const cb = a.totalCbm == null ? null : round(a.totalCbm, 6);
      boxes += b ?? 0; wt += w ?? 0; cbm += cb ?? 0;
      plan.push({
        container_no: name, base_tracking: track, shipping_mark: mark,
        member_code: member, pr_source: source, warehouse: "TTW", origin: "อี้อู",
        transport_mode: transport, boxes: b, weight_kg: w, cbm: cb,
        product_name: (a.product ?? "").trim() || null, item_type: (a.productType ?? "").trim() || null,
        sm_date: (a.smDate ?? "").trim() || null, source_file: `${name}.xlsx`, in_system: exists,
      });
    }
    perContainer.push({
      ตู้: name, แทรค: parsed.aggregated.length, กล่อง: boxes, kg: round(wt, 2), คิว: round(cbm, 4),
      "PR-มาร์ค": prMark, "PR-เดิมCS": prReuse, "PRไม่พบในระบบ": prMiss, "มีในระบบแล้ว": inSys,
    });
    if (parsed.warnings.length) console.log(`  ⚠ ${name}: ${parsed.warnings.join("; ")}`);
  }

  console.log(`\n━━ อี้อู/TTW INGEST PLAN — 4 ตู้ใหม่ (${plan.length} แทรค) ━━`);
  console.table(perContainer);
  const matched = plan.filter((p) => p.member_code).length;
  const matchedRows = plan.filter((p) => p.member_code).map((p) => ({
    ตู้: p.container_no, แทรค: p.base_tracking, มาร์ค: p.shipping_mark, PR: p.member_code,
    จาก: p.pr_source, กล่อง: p.boxes, kg: p.weight_kg, มีในระบบ: p.in_system ? '✓' : '',
  }));
  if (matchedRows.length) { console.log('\nรายการที่จับคู่ PR ได้:'); console.table(matchedRows); }
  console.log(`Σ แทรค=${plan.length} · จับคู่ PR ได้=${matched} · เหลือให้ CS=${plan.length - matched}`);
  if (unverified.length) {
    console.log(`\n⚠ PR บนมาร์คที่ไม่พบใน tb_users (ไม่ใส่ให้ · CS ตรวจ):`);
    console.table(unverified);
  }
  if (prMismatch.length) {
    console.log(`\n🔴 มาร์คกับแถวจริงใน tb_forwarder ชี้คนละ PR (ยึดแถวจริง · CS ตรวจ):`);
    console.table(prMismatch);
  }

  if (!APPLY) { console.log("\n(dry-run — pass --apply · backup ก่อนเขียนเสมอ)"); await c.end(); return; }

  const { rows: before } = await c.query(
    `SELECT * FROM ttw_packing_line WHERE container_no = ANY($1) ORDER BY container_no, base_tracking`,
    [FILES],
  );
  writeFileSync(`/tmp/backup-ttw-packing-2026-07-25.json`, JSON.stringify(before, null, 2));
  console.log(`\n📦 backup (${before.length} แถวเดิมของ 4 ตู้นี้) → /tmp/backup-ttw-packing-2026-07-25.json`);

  await c.query("BEGIN");
  let n = 0;
  for (const p of plan) {
    const res = await c.query(
      `INSERT INTO ttw_packing_line
         (container_no, base_tracking, shipping_mark, member_code, pr_source, warehouse, origin,
          transport_mode, boxes, weight_kg, cbm, product_name, item_type, sm_date, source_file, ingested_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())
       ON CONFLICT (container_no, base_tracking) DO UPDATE SET
         shipping_mark  = EXCLUDED.shipping_mark,
         member_code    = COALESCE(ttw_packing_line.member_code, EXCLUDED.member_code),
         pr_source      = CASE WHEN ttw_packing_line.member_code IS NOT NULL THEN ttw_packing_line.pr_source ELSE EXCLUDED.pr_source END,
         transport_mode = EXCLUDED.transport_mode,
         boxes          = EXCLUDED.boxes,
         weight_kg      = EXCLUDED.weight_kg,
         cbm            = EXCLUDED.cbm,
         product_name   = EXCLUDED.product_name,
         item_type      = EXCLUDED.item_type,
         sm_date        = EXCLUDED.sm_date,
         source_file    = EXCLUDED.source_file,
         updated_at     = now()
       WHERE ttw_packing_line.committed_forwarder_id IS NULL`,
      [p.container_no, p.base_tracking, p.shipping_mark, p.member_code, p.pr_source, p.warehouse, p.origin,
       p.transport_mode, p.boxes, p.weight_kg, p.cbm, p.product_name, p.item_type, p.sm_date, p.source_file],
    );
    n += res.rowCount ?? 0;
  }
  await c.query("COMMIT");
  const { rows: [{ total }] } = await c.query(
    `SELECT count(*)::int total FROM ttw_packing_line WHERE container_no = ANY($1)`, [FILES]);
  console.log(`\n✅ applied — upsert ${n} แถว · ttw_packing_line ตอนนี้มี ${total} แถวของ 4 ตู้นี้`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
