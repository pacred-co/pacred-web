/**
 * fix-container-per-row-2026-07-29.ts — ประทับเลขตู้ "รายแถว" ให้ตรงความจริง
 *
 * owner: "ตอนตรวจต้นทุน momo ขึ้นเลขตู้ไม่ตรงแปลกๆ สรุปมันอยู่ตู้ไหนกันแน่ ...
 *         ควรจะเชื่อมโยง ประมวลผลกัน และ map match กันได้และถูกต้องจริงๆไปเลย"
 *
 * ปัญหา: commit ประทับ fcabinetnumber **ค่าเดียวให้ทั้งครอบครัว** → ชิปเม้นที่ MOMO
 * แยกส่งหลายตู้ (prod 6 ชิปเม้น / 50 แถว) ติดตู้ผิด → ใบวางบิล MOMO ที่ระบุตู้จริง
 * ขัดกับระบบ (บล็อกบันทึกต้นทุน) + กำไรรายตู้เพี้ยน (ตู้หนึ่งบวมด้วยของอีกตู้).
 *
 * ตัวตัดสิน = lib/admin/momo-container-truth.ts (SOT · 16 เทส · เคสจริง prod)
 *   แพคกิ้งลิสต่อตู้ (เลขตู้จริง) × staging จัดกลุ่มตามรอบขนส่ง MOMO
 *   → จับคู่ด้วย (จำนวนแถว · Σ น้ำหนัก · Σ คิว) → จับได้ตัวเดียวเท่านั้นจึงเขียน
 *
 * GUARDS (เงินต้องพิสูจน์ได้ว่าไม่ขยับ):
 *  - **เรทต้องเท่ากันเป๊ะ** ระหว่างตู้เดิม↔ตู้ใหม่ (คิดจาก tb_cost_container ก่อน
 *    → tb_settings ตาม โกดัง×ขนส่ง(จากชื่อตู้)×ประเภท×เมือง) — ต่างแม้บาทเดียว = SKIP+flag
 *    (ไม่ใช่ "สมมติว่าเท่า" — คิดทั้ง 2 ฝั่งแล้วเทียบ)
 *  - ข้ามแถวที่ **อยู่บนใบวางบิลที่ยัง live** (ยกเลิกแล้วไม่นับ)
 *  - ข้ามแถว fcabinet_locked (owner ล็อกเลขตู้ไว้เอง)
 *  - ข้ามตู้ที่ **ตัดจ่ายค่าตู้แล้ว** (tb_cnt_item) ทั้งฝั่งเดิมและฝั่งใหม่
 *  - เขียนแค่ `fcabinetnumber` — ไม่แตะราคา/สถานะ/น้ำหนัก/คิว
 *  - dry-run เป็นค่าเริ่มต้น · --apply ถึงเขียน · backup JSON · txn เดียว ·
 *    UPDATE re-check ค่าเดิมใน WHERE (กัน race) · idempotent
 *
 * RUN:
 *   PGPW='<prod-pw>' npx tsx scripts/fix-container-per-row-2026-07-29.ts
 *   PGPW='<prod-pw>' npx tsx scripts/fix-container-per-row-2026-07-29.ts --apply
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import {
  baseOfTracking,
  buildPackingTruthMap,
  resolveContainerTruth,
  type StagingSubRow,
} from "../lib/admin/momo-container-truth";
import { resolveTransportMode } from "../lib/forwarder/cabinet-transport";
import { costColumn, type WarehouseDigit, type CostTransport } from "../lib/forwarder/resolve-cost";
import { rateForProductType, type ContainerRates } from "../lib/forwarder/container-cost-engine";

const APPLY = process.argv.includes("--apply");
if (!process.env.PGPW) { console.error("ต้องส่ง PGPW (chat-only)"); process.exit(1); }

const pool = new pg.Pool({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.PGPW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

async function main() {
  // ── 1) แพคกิ้งลิส: ไฟล์ล่าสุดต่อตู้ → แผนที่ base → บรรทัดต่อตู้ ──
  const { rows: files } = await pool.query<{ container_no: string; parsed_snapshot: { rows?: unknown[] } | null }>(`
    SELECT container_no, parsed_snapshot
    FROM momo_packing_upload
    WHERE COALESCE(container_no,'') <> ''
    ORDER BY uploaded_at DESC`);
  const packingMap = buildPackingTruthMap(
    files.map((f) => ({
      containerNo: f.container_no,
      rows: (f.parsed_snapshot?.rows ?? []) as Parameters<typeof buildPackingTruthMap>[0][number]["rows"],
    })),
  );
  const multiBases = [...packingMap.entries()].filter(([, lines]) => new Set(lines.map((l) => l.cabinet)).size > 1);
  console.log(`แพคกิ้งลิส: ${files.length} ไฟล์ · ${packingMap.size} base · **${multiBases.length} base อยู่หลายตู้**`);

  // ── 2) staging + ระบบ ของ base เหล่านั้น ──
  const bases = multiBases.map(([b]) => b);
  if (bases.length === 0) { console.log("ไม่มี base หลายตู้ ✓"); return; }

  const { rows: staging } = await pool.query<{
    momo_tracking_no: string; momo_container_no: string | null; container_batch_no: string | null;
    weight_kg: unknown; cbm: unknown; quantity: unknown; committed_forwarder_id: unknown;
  }>(`
    SELECT momo_tracking_no, momo_container_no, container_batch_no, weight_kg, cbm, quantity, committed_forwarder_id
    FROM momo_import_tracks
    WHERE regexp_replace(momo_tracking_no, '-[0-9]+(/[0-9]+)?$', '') = ANY($1)`, [bases]);

  const stagingByBase = new Map<string, StagingSubRow[]>();
  for (const s of staging) {
    const b = baseOfTracking(s.momo_tracking_no);
    const row: StagingSubRow = {
      momoTrackingNo: s.momo_tracking_no,
      momoContainerNo: s.momo_container_no,
      containerBatchNo: s.container_batch_no,
      weightKg: num(s.weight_kg), cbm: num(s.cbm), quantity: num(s.quantity),
      committedForwarderId: s.committed_forwarder_id ? Number(s.committed_forwarder_id) : null,
    };
    stagingByBase.set(b, [...(stagingByBase.get(b) ?? []), row]);
  }

  const { rows: fwd } = await pool.query<{
    id: number; ftrackingchn: string; userid: string; fstatus: string;
    fcabinetnumber: string; fcabinet_locked: boolean | null;
    fwarehousename: string | null; fwarehousechina: string | null; ftransporttype: string | null;
    fproductstype: string | null;
  }>(`
    SELECT id, ftrackingchn, userid, fstatus, fcabinetnumber, fcabinet_locked,
           fwarehousename, fwarehousechina, ftransporttype, fproductstype
    FROM tb_forwarder
    WHERE regexp_replace(ftrackingchn, '-[0-9]+(/[0-9]+)?$', '') = ANY($1) AND fstatus <> '99'`, [bases]);
  const fwdById = new Map(fwd.map((r) => [Number(r.id), r]));

  // ── 3) เรทต่อตู้ (override ก่อน → settings) ──
  const allCabs = [...new Set([
    ...fwd.map((r) => String(r.fcabinetnumber ?? "").trim()),
    ...multiBases.flatMap(([, l]) => l.map((x) => x.cabinet)),
  ])].filter(Boolean);
  const { rows: crRows } = await pool.query(`
    SELECT fcabinetnumber, fproductstype1, fproductstype2, fproductstype3, fproductstype4
    FROM tb_cost_container WHERE fcabinetnumber = ANY($1)`, [allCabs]);
  const overrideByCab = new Map<string, ContainerRates>();
  for (const c of crRows as Array<Record<string, unknown>>) {
    overrideByCab.set(String(c.fcabinetnumber), {
      p1: num(c.fproductstype1), p2: num(c.fproductstype2), p3: num(c.fproductstype3), p4: num(c.fproductstype4),
    });
  }
  const { rows: sRows } = await pool.query(`SELECT * FROM tb_settings WHERE id = 1`);
  const settings = (sRows[0] ?? null) as Record<string, unknown> | null;

  /** เรทของตู้ (สมองเดียวกับ container-cost-rollup/DETAIL). */
  const ratesFor = (cab: string, warehouse: string, chinaCity: string, storedTransport: string | null): ContainerRates => {
    const ov = overrideByCab.get(cab);
    if (ov) return ov;
    const transport: CostTransport = resolveTransportMode(cab, storedTransport) === "2" ? "2" : "1";
    const pick = (col: string | null) => (!col || !settings ? 0 : num(settings[col]));
    const cols = ([1, 2, 3, 4] as const).map((i) =>
      warehouse ? costColumn(warehouse as WarehouseDigit, i, transport, chinaCity) : null);
    return { p1: pick(cols[0]), p2: pick(cols[1]), p3: pick(cols[2]), p4: pick(cols[3]) };
  };

  // ── 4) ตู้ที่ตัดจ่ายแล้ว + แถวที่อยู่บนใบวางบิล live ──
  const { rows: paidRows } = await pool.query(
    `SELECT DISTINCT "fCabinetNumber" AS cab FROM tb_cnt_item WHERE "fCabinetNumber" = ANY($1)`, [allCabs]);
  const paidCabs = new Set(paidRows.map((r: { cab: string }) => r.cab));

  const { rows: onInv } = await pool.query(`
    SELECT DISTINCT it.forwarder_id AS fid, i.doc_no
    FROM tb_forwarder_invoice_item it
    JOIN tb_forwarder_invoice i ON i.id = it.invoice_id
    WHERE it.forwarder_id = ANY($1) AND COALESCE(i.status,'') <> 'cancelled'`,
    [fwd.map((r) => Number(r.id))]);
  const liveInvByFid = new Map<number, string>();
  for (const r of onInv as Array<{ fid: number; doc_no: string }>) liveInvByFid.set(Number(r.fid), r.doc_no);

  // ── 5) ตัดสินรายแถวผ่าน SOT ──
  type Plan = { fid: number; tracking: string; userid: string; from: string; to: string; how: string; fstatus: string };
  const plan: Plan[] = [];
  const skipped: Array<{ fid: number | string; tracking: string; why: string; detail?: string }> = [];
  const unresolved: Array<Record<string, unknown>> = [];

  for (const [base, packLines] of multiBases) {
    const st = stagingByBase.get(base) ?? [];
    if (st.length === 0) { skipped.push({ fid: "-", tracking: base, why: "ไม่มีข้อมูล staging" }); continue; }
    const truth = resolveContainerTruth(base, packLines, st);
    for (const g of truth.unresolvedGroups) {
      unresolved.push({ base, รอบMOMO: g.momoContainerNo, แถว: g.rows, น้ำหนัก: g.weightKg, คิว: g.cbm,
        ผล: g.outcome.kind, ตัวเลือก: g.outcome.kind === "ambiguous" ? g.outcome.candidates.join("/") : "" });
    }
    for (const [fid, toCab] of truth.assignments) {
      const row = fwdById.get(fid);
      if (!row) { skipped.push({ fid, tracking: base, why: "ไม่พบแถวในระบบ (fid ตาย)" }); continue; }
      const fromCab = String(row.fcabinetnumber ?? "").trim();
      if (fromCab === toCab) continue; // ตรงแล้ว
      if (row.fcabinet_locked) { skipped.push({ fid, tracking: row.ftrackingchn, why: "แถวล็อกเลขตู้ไว้" }); continue; }
      const inv = liveInvByFid.get(fid);
      if (inv) { skipped.push({ fid, tracking: row.ftrackingchn, why: "อยู่บนใบวางบิล live", detail: inv }); continue; }
      if (paidCabs.has(fromCab) || paidCabs.has(toCab)) {
        skipped.push({ fid, tracking: row.ftrackingchn, why: "ตู้ตัดจ่ายค่าตู้แล้ว", detail: `${fromCab}→${toCab}` });
        continue;
      }
      // 💰 เรทต้องเท่ากันเป๊ะ — คิดทั้ง 2 ฝั่ง
      const wh = String(row.fwarehousename ?? "").trim();
      const city = String(row.fwarehousechina ?? "").trim();
      const rFrom = rateForProductType(ratesFor(fromCab, wh, city, row.ftransporttype), row.fproductstype);
      const rTo = rateForProductType(ratesFor(toCab, wh, city, row.ftransporttype), row.fproductstype);
      if (rFrom !== rTo) {
        skipped.push({ fid, tracking: row.ftrackingchn, why: "เรทต้นทุนต่างกัน (เงินจะขยับ)", detail: `${fromCab}=${rFrom} vs ${toCab}=${rTo}` });
        continue;
      }
      plan.push({ fid, tracking: row.ftrackingchn, userid: row.userid, from: fromCab, to: toCab,
        how: `เรท ${rFrom}/คิว เท่ากัน`, fstatus: row.fstatus });
    }
  }

  console.log(`\n📋 แผนย้ายเลขตู้: ${plan.length} แถว`);
  console.table(plan.map((p) => ({ fid: p.fid, tracking: p.tracking, PR: p.userid, จาก: p.from, ไป: p.to, st: p.fstatus })));
  const byMove = new Map<string, number>();
  for (const p of plan) byMove.set(`${p.from} → ${p.to}`, (byMove.get(`${p.from} → ${p.to}`) ?? 0) + 1);
  console.log("\nสรุปการย้าย:"); for (const [k, v] of byMove) console.log(`  ${k}: ${v} แถว`);
  if (skipped.length) { console.log(`\n⏭ ข้าม ${skipped.length}:`); console.table(skipped.slice(0, 30)); }
  if (unresolved.length) { console.log(`\n⚠️ จับคู่ไม่ได้ (ต้องให้คนดู) ${unresolved.length}:`); console.table(unresolved); }

  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); return; }
  if (plan.length === 0) { console.log("ไม่มีแถวต้องย้าย ✓"); return; }

  const backupPath = `/tmp/backup-container-per-row-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ plan, skipped, unresolved }, null, 2));
  console.log(`\nbackup → ${backupPath}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let written = 0;
    for (const p of plan) {
      const res = await client.query(
        `UPDATE tb_forwarder SET fcabinetnumber = $1
         WHERE id = $2 AND fcabinetnumber = $3 AND COALESCE(fcabinet_locked,false) = false AND fstatus <> '99'`,
        [p.to, p.fid, p.from],
      );
      written += res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(`✅ ย้ายแล้ว ${written}/${plan.length} แถว (ไม่ตรง guard = มีคนแตะระหว่างรัน → ข้าม)`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
