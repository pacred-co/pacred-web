/**
 * ซ่อม "ต้นทุนขาด" ที่เกิดจากคิดฐานคิวผิด (กฎ famountcount).
 *
 * ── อาการ ────────────────────────────────────────────────────────────────
 * แถวที่ `famountcount <> '1'` แปลว่า `fvolume` คือคิว **ต่อกล่อง** → คิวจริงของแถว
 * = fvolume × famount (SOT: lib/forwarder/quantities.ts `totalCbmOf`).
 * แต่ต้นทุนถูกเขียนไว้เป็น `fvolume(ดิบ) × เรท` = ขาดไป famount เท่า.
 *
 * เจอตอนเทียบใบแจ้งหนี้ MOMO `INV-20260618-0003`: ระบบ 22,111.95 vs MOMO 23,097.30
 * = ต่าง ฿985.35 — ฿990 มาจากแถวเดียว (60527103087-2 เก็บ ฿90 ควรเป็น ฿1,080
 * และใบ MOMO ระบุ 1,080.00 เป๊ะ = หลักฐานยืนยันว่าคิวรวมถูก).
 *
 * ── ทำไมปลอดภัย ──────────────────────────────────────────────────────────
 * • แตะ `fcosttotalprice` คอลัมน์เดียว — ต้นทุนเป็นตัวเลขภายใน ไม่อยู่ในสูตรบิลลูกค้า
 *   (กฎยืน: cost แก้ได้ทุกสถานะ · sell ล็อก — memory `cost-editable-sell-locked`)
 * • ตรวจแล้วว่า **ฝั่งขายของทั้ง 4 แถวถูกต้อง** (3 แถวขายตามน้ำหนัก · 1 แถวขายตามคิวรวม)
 *   → ลูกค้าไม่ได้ถูกเก็บผิด ผลคือกำไรที่รายงานสูงเกินจริงเท่านั้น
 * • สูตรซ่อม = `ทุนใหม่ = ทุนเดิม × famount` — ได้จากพีชคณิตตรงๆ
 *   (เดิม = fvolume×เรท · ควรเป็น = fvolume×famount×เรท) → **ไม่ต้อง resolve เรทใหม่**
 *   จึงไม่มีทางเพี้ยนเพราะเรทการ์ดเปลี่ยนทีหลัง
 * • fail-CLOSED: ข้ามทุกแถวที่ทุนเดิมไม่ลงตัวกับ fvolume×{2500,4700} (แปลว่าคีย์มือ
 *   หรือมาจากใบ MOMO จริง — ห้ามเดา)
 *
 * ── โค้ดวันนี้ถูกแล้ว ─────────────────────────────────────────────────────
 * `lib/forwarder/resolve-cost.ts` ใช้ `totalCbmOf` ตั้งแต่ 2026-07-19 → แถวใหม่ไม่ผิดซ้ำ.
 * นี่คือการเก็บกวาดข้อมูลที่เขียนไว้ "ก่อน" วันนั้น.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=… node scripts/fix-cost-basis-per-box-2026-07-24.mjs          # dry-run
 *   SUPABASE_DB_PASSWORD=… node scripts/fix-cost-basis-per-box-2026-07-24.mjs --apply
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PGPW;
if (!PW) {
  console.error("ต้องมี SUPABASE_DB_PASSWORD");
  process.exit(1);
}

/** เรทต้นทุน MOMO ต่อคิว (mig 0194 · เรือ 2,500 · รถ 4,700). */
const RATE = { sea: 2500, road: 4700 };
/** GZE/EK/-NT = รถ · ที่เหลือ = เรือ (SOT: lib/forwarder/cabinet-transport.ts). */
const modeOf = (cab) => (/^GZE|^EK|-\d+T$/i.test(cab || "") ? "road" : "sea");
const near = (a, b) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.005);
const r2 = (n) => Math.round(n * 100) / 100;

const client = new Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.yzljakczhwrpbxflnmco",
  password: PW,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

async function main() {
  await client.connect();

  const { rows } = await client.query(`
    select id, userid, ftrackingchn, fcabinetnumber, fstatus,
           fvolume::numeric   as fvol,
           famount::numeric   as famt,
           famountcount,
           fcosttotalprice::numeric as cost,
           ftotalprice::numeric     as sell
    from tb_forwarder
    where coalesce(famountcount,'') <> '1'
      and coalesce(famount,'0')::numeric  > 1
      and coalesce(fvolume,'0')::numeric  > 0
      and coalesce(fcosttotalprice,'0')::numeric > 0
    order by id
  `);

  const fix = [];
  const skip = [];
  for (const row of rows) {
    const fvol = Number(row.fvol);
    const famt = Number(row.famt);
    const cost = Number(row.cost);
    const rate = RATE[modeOf(row.fcabinetnumber)];
    const totalCbm = fvol * famt;

    // fail-CLOSED — ทุนเดิมต้อง "ลงตัว" กับ fvolume ดิบ × เรทมาตรฐาน เท่านั้น
    if (!near(cost, fvol * rate)) {
      skip.push({ id: row.id, tracking: row.ftrackingchn, cost, เหตุผล: `ไม่ตรง fvolume×${rate} (คีย์มือ/ใบ MOMO)` });
      continue;
    }
    // ถ้าคิวรวม == fvolume ดิบ ก็ไม่มีอะไรต้องซ่อม
    if (near(fvol * rate, totalCbm * rate)) continue;

    const newCost = r2(cost * famt);
    fix.push({
      id: row.id,
      userid: row.userid,
      tracking: row.ftrackingchn,
      cabinet: row.fcabinetnumber,
      fstatus: row.fstatus,
      fvolume: fvol,
      famount: famt,
      totalCbm: Number(totalCbm.toFixed(6)),
      rate,
      costBefore: cost,
      costAfter: newCost,
      gap: r2(newCost - cost),
      sell: Number(row.sell),
      profitBefore: r2(Number(row.sell) - cost),
      profitAfter: r2(Number(row.sell) - newCost),
    });
  }

  console.log(`\nแถวที่เข้าข่ายตรวจ (ต่อกล่อง · หลายกล่อง · มีทุน) = ${rows.length}`);
  console.log(`🔴 ต้องซ่อม = ${fix.length} แถว · ทุนที่ขาดรวม ฿${r2(fix.reduce((s, x) => s + x.gap, 0))}`);
  console.log(`⚪ ข้าม (fail-closed) = ${skip.length} แถว\n`);

  console.table(
    fix.map((f) => ({
      fid: f.id,
      tracking: f.tracking,
      ตู้: f.cabinet,
      st: f.fstatus,
      "คิว/กล่อง": f.fvolume,
      กล่อง: f.famount,
      คิวรวม: f.totalCbm,
      เรท: f.rate,
      ทุนเดิม: f.costBefore,
      ทุนใหม่: f.costAfter,
      ขาด: f.gap,
      ขาย: f.sell,
      "กำไร ก่อน→หลัง": `${f.profitBefore} → ${f.profitAfter}`,
    })),
  );

  if (skip.length) {
    console.log("\n⚪ ข้ามไว้ (ต้องดูด้วยตา ห้ามเดา):");
    console.table(skip);
  }

  if (!APPLY) {
    console.log("\n🟡 DRY-RUN — ยังไม่เขียนอะไร. ใส่ --apply เพื่อบันทึกจริง");
    await client.end();
    return;
  }

  const stamp = Date.now();
  const backupPath = `scripts/_backup-cost-basis-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify({ at: new Date(stamp).toISOString(), fix, skip }, null, 2));
  console.log(`\n💾 backup → ${backupPath}`);

  await client.query("BEGIN");
  let n = 0;
  try {
    for (const f of fix) {
      // guard ซ้ำในระดับ SQL — ถ้าใครแก้ทุนไปแล้วระหว่างนี้ จะไม่ทับ
      const res = await client.query(
        `update tb_forwarder set fcosttotalprice = $1
          where id = $2 and fcosttotalprice::numeric = $3`,
        [f.costAfter, f.id, f.costBefore],
      );
      n += res.rowCount ?? 0;
    }
    if (n !== fix.length) throw new Error(`เขียนได้ ${n}/${fix.length} แถว — rollback`);
    await client.query("COMMIT");
    console.log(`✅ APPLIED — อัปเดตต้นทุน ${n} แถว · ทุนเพิ่มรวม ฿${r2(fix.reduce((s, x) => s + x.gap, 0))}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ ROLLBACK:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
