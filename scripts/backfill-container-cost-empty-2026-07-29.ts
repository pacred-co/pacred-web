/**
 * backfill-container-cost-empty-2026-07-29.ts
 *
 * owner: "เช็คเรื่องต้นทุนตู้ ... คือทำตู้ให้ข้อมูลตรงและถูก" —
 * audit เจอแถวใน tb_forwarder ที่อยู่ตู้จริง มีปริมาตร/น้ำหนัก แต่ `fcosttotalprice = 0`
 * (23 ตู้ / ~348 แถว · ส่วนใหญ่ fstatus=3 กำลังส่งมาไทย). จอ report-cnt คิดต้นทุนสด
 * อยู่แล้ว (container-cost-engine) เลยโชว์ถูก แต่ "ค่าที่เก็บ" = 0 → CSV/export +
 * ตัวอ่าน raw ทุกตัวผิด และถ้าตู้ถูกตัดจ่าย (tb_cnt_item) เมื่อไหร่ rollup จะสลับไป
 * ใช้ค่าที่เก็บ = ต้นทุนหาย.
 *
 * FIX: เติม fcosttotalprice = ค่าที่ "เครื่องเดียวกับหน้าจอ" คิด (resolveRowContainerCost
 * — เรท tb_cost_container ต่อตู้ ชนะ tb_settings · basis ตามโกดัง · transport จากชื่อตู้)
 * → จอกับค่าที่เก็บพูดเลขเดียวกัน.
 *
 * GUARDS:
 *  - เฉพาะแถว fcosttotalprice = 0/null · มีปริมาณจริง (fvolume>0 หรือ fweight>0)
 *  - เฉพาะ fstatus 1-5 (แถวบิลแล้ว 6/7 = รายงานอย่างเดียว ไม่แตะ — เงิน frozen)
 *  - ข้ามตู้ที่ "จ่ายค่าตู้แล้ว" (tb_cnt_item) — ค่าเก็บของตู้จ่ายแล้วคือบันทึกบัญชี
 *  - เขียนเฉพาะเมื่อ engine ได้ liveCost > 0 (ไม่มีเรท = ข้าม · ห้ามกุเลข)
 *  - sanity ต่อแถว ≤ 200,000 บาท (เกิน = abort ให้คนดู)
 *  - dry-run เป็นค่าเริ่มต้น · --apply ถึงเขียน · backup JSON ก่อนเขียน · txn เดียว
 *  - idempotent: รันซ้ำ = 0 (แถวถูกเติมแล้วไม่เข้าเงื่อนไข)
 *
 * RUN:
 *   PGPW='<prod-pw>' npx tsx scripts/backfill-container-cost-empty-2026-07-29.ts
 *   PGPW='<prod-pw>' npx tsx scripts/backfill-container-cost-empty-2026-07-29.ts --apply
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import { resolveTransportMode } from "../lib/forwarder/cabinet-transport";
import { costColumn, type WarehouseDigit, type CostTransport } from "../lib/forwarder/resolve-cost";
import {
  resolveContainerWarehouse,
  resolveRowContainerCost,
  type ContainerRates,
  type CostEngineRow,
} from "../lib/forwarder/container-cost-engine";

const APPLY = process.argv.includes("--apply");
const PW = process.env.PGPW;
if (!PW) {
  console.error("ต้องส่งรหัส prod ผ่าน env PGPW (chat-only — ห้าม hardcode)");
  process.exit(1);
}

const pool = new pg.Pool({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: PW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 3,
});

type Row = CostEngineRow & {
  id: number;
  fcabinetnumber: string;
  fwarehousename: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
  fstatus: string | null;
  userid: string | null;
  ftrackingchn: string | null;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  // ── 1) แถวเป้าหมาย: ตู้จริง · cost=0 · มีปริมาณ · ยังไม่บิล ──
  const { rows } = await pool.query<Row>(`
    SELECT id, fcabinetnumber, fwarehousename, fwarehousechina, ftransporttype,
           fstatus, userid, ftrackingchn,
           fvolume, famount, famountcount, fweight, fproductstype, fcosttotalprice
    FROM tb_forwarder
    WHERE COALESCE(fcabinetnumber,'') NOT IN ('', '0')
      AND COALESCE(fcosttotalprice, 0) = 0
      AND (COALESCE(fvolume,0) > 0 OR COALESCE(fweight,0) > 0)
      AND fstatus IN ('1','2','3','4','5')
    ORDER BY fcabinetnumber, id
  `);
  console.log(`เป้าหมาย (cost=0 · มีปริมาณ · fstatus 1-5): ${rows.length} แถว`);
  if (rows.length === 0) { console.log("ไม่มีอะไรต้องเติม ✓"); return; }

  const byCab = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byCab.get(r.fcabinetnumber);
    if (arr) arr.push(r);
    else byCab.set(r.fcabinetnumber, [r]);
  }
  const cabs = Array.from(byCab.keys());

  // ── 2) ตู้ที่จ่ายค่าตู้แล้ว = ข้าม (ค่าเก็บคือบันทึกบัญชี) ──
  const { rows: paidRows } = await pool.query<{ cab: string }>(
    `SELECT DISTINCT "fCabinetNumber" AS cab FROM tb_cnt_item WHERE "fCabinetNumber" = ANY($1)`,
    [cabs],
  );
  const paid = new Set(paidRows.map((r) => r.cab));

  // ── 3) เรทต่อตู้ (tb_cost_container ชนะ · fallback tb_settings) — สมองเดียวกับจอ ──
  const { rows: crRows } = await pool.query<{
    fcabinetnumber: string;
    fproductstype1: unknown; fproductstype2: unknown; fproductstype3: unknown; fproductstype4: unknown;
  }>(`SELECT fcabinetnumber, fproductstype1, fproductstype2, fproductstype3, fproductstype4
      FROM tb_cost_container WHERE fcabinetnumber = ANY($1)`, [cabs]);
  const rateByCab = new Map<string, ContainerRates>();
  for (const c of crRows) {
    rateByCab.set(c.fcabinetnumber, {
      p1: num(c.fproductstype1), p2: num(c.fproductstype2),
      p3: num(c.fproductstype3), p4: num(c.fproductstype4),
    });
  }
  const { rows: sRows } = await pool.query(`SELECT * FROM tb_settings WHERE id = 1`);
  const settings = (sRows[0] ?? null) as Record<string, unknown> | null;

  // แถว "ทั้งตู้" (รวมที่มี cost แล้ว) เพื่อ resolve โกดังของตู้ให้ถูก — โกดังอ่านจาก
  // แถวแรกที่มีค่า อาจไม่อยู่ในชุดเป้าหมาย
  const { rows: whRows } = await pool.query<{ fcabinetnumber: string; fwarehousename: string | null }>(
    `SELECT fcabinetnumber, fwarehousename FROM tb_forwarder
     WHERE fcabinetnumber = ANY($1) AND COALESCE(fwarehousename,'') <> ''`,
    [cabs],
  );
  const whByCab = new Map<string, string>();
  for (const w of whRows) {
    if (!whByCab.has(w.fcabinetnumber)) whByCab.set(w.fcabinetnumber, String(w.fwarehousename));
  }

  // ── 4) คิดต่อแถวด้วย engine จริง ──
  type Plan = { id: number; cab: string; tracking: string; userid: string; cost: number };
  const plan: Plan[] = [];
  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };

  for (const [cab, cabRows] of byCab) {
    if (/MOCK/i.test(cab)) { cabRows.forEach(() => skip("ตู้ MOCK (ข้อมูลทดสอบของปอน — ไม่แตะ)")); continue; }
    if (paid.has(cab)) { cabRows.forEach(() => skip("ตู้จ่ายค่าตู้แล้ว")); continue; }
    const containerWarehouse = whByCab.get(cab) ?? resolveContainerWarehouse(cabRows);
    let rates = rateByCab.get(cab);
    if (!rates) {
      const firstChina = cabRows.find((r) => String(r.fwarehousechina ?? "").trim())?.fwarehousechina ?? "";
      const storedTransport = cabRows.find((r) => String(r.ftransporttype ?? "").trim())?.ftransporttype ?? null;
      const mode = resolveTransportMode(cab, storedTransport);
      const transport: CostTransport = mode === "2" ? "2" : "1";
      const pick = (col: string | null): number => (!col || !settings ? 0 : num(settings[col]));
      const cols = ([1, 2, 3, 4] as const).map((i) =>
        containerWarehouse ? costColumn(containerWarehouse as WarehouseDigit, i, transport, String(firstChina)) : null,
      );
      rates = { p1: pick(cols[0]), p2: pick(cols[1]), p3: pick(cols[2]), p4: pick(cols[3]) };
    }
    for (const r of cabRows) {
      const res = resolveRowContainerCost(r, { rates, containerWarehouse, cabinetIsPaid: false });
      if (!res.isLive || res.liveCost <= 0) { skip("ไม่มีเรท/คิดไม่ได้ (ห้ามกุ)"); continue; }
      const cost = round2(res.liveCost);
      if (cost > 200_000) {
        console.error(`🛑 sanity: แถว ${r.id} (${cab}) cost=${cost} เกิน 200k — หยุดให้คนดู`);
        process.exit(2);
      }
      plan.push({ id: r.id, cab, tracking: String(r.ftrackingchn ?? ""), userid: String(r.userid ?? ""), cost });
    }
  }

  // ── 5) รายงานแผน ──
  const byCabSum = new Map<string, { n: number; sum: number }>();
  for (const p of plan) {
    const e = byCabSum.get(p.cab) ?? { n: 0, sum: 0 };
    e.n += 1; e.sum = round2(e.sum + p.cost);
    byCabSum.set(p.cab, e);
  }
  console.log(`\nแผนเติม: ${plan.length} แถว / ${byCabSum.size} ตู้`);
  for (const [cab, e] of Array.from(byCabSum.entries()).sort()) {
    console.log(`  ${cab}: ${e.n} แถว · Σ ${e.sum.toLocaleString("th-TH")} บาท`);
  }
  const totalSum = round2(plan.reduce((s, p) => s + p.cost, 0));
  console.log(`  Σ ทั้งหมด = ${totalSum.toLocaleString("th-TH")} บาท`);
  if (Object.keys(skipped).length) {
    console.log(`\nข้าม:`); for (const [k, v] of Object.entries(skipped)) console.log(`  ${k}: ${v} แถว`);
  }

  if (!APPLY) { console.log(`\n(dry-run — ใส่ --apply เพื่อเขียนจริง)`); return; }
  if (plan.length === 0) { console.log("ไม่มีแถวที่เติมได้"); return; }

  // ── 6) backup + เขียนใน txn เดียว (guard cost ยัง 0 กัน race) ──
  const backupPath = `/tmp/backup-container-cost-empty-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ before: rows, plan }, null, 2));
  console.log(`\nbackup → ${backupPath}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let written = 0;
    for (const p of plan) {
      const res = await client.query(
        `UPDATE tb_forwarder SET fcosttotalprice = $1
         WHERE id = $2 AND COALESCE(fcosttotalprice,0) = 0 AND fstatus IN ('1','2','3','4','5')`,
        [p.cost, p.id],
      );
      written += res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(`✅ เขียนแล้ว ${written}/${plan.length} แถว (แถวที่ไม่ตรง guard = มีคนแตะระหว่างรัน → ข้าม)`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
