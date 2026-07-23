/**
 * backfill-scan-shortfall-2026-07-22.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * owner/ภูม 2026-07-22: 5 ตู้บนแท็บ "สำเร็จ" (report-cnt?page=succeed) แดง =
 * "ยิงรับเข้าโกดังไทยไม่ครบ" (Σ tb_forwarder_import2.fi2amount < tb_forwarder.famount)
 * ทั้งที่งานจบไปแล้ว (fstatus 6/7). เหตุ: พนักงานโกดังข้ามขั้นยิงรับ.
 * → เติม fi2amount ให้ = famount ต่อแถว countable-short ที่ "เป็นของจริงยิงตกหล่น"
 *   ให้ตู้ขึ้นครบ/ขาว + คอลัมน์ลัง 1/2 → 2/2.
 *
 * SAFE / ขอบเขต:
 *   • เขียนเฉพาะ tb_forwarder_import2 (INSERT/UPDATE) — ไม่แตะ tb_forwarder เลย
 *     → trigger เดียวบน tb_forwarder (trg_advance_shop_on_forwarder_arrival)
 *     ไม่ยิง · ไม่มี fstatus/shop cascade · ไม่แตะเงิน.
 *   • ตั้ง Σ fi2amount ต่อ fid = famount เท่านั้น (ไม่ over-scan) · idempotent
 *     (delta<=0 = ข้าม) · GUARD fstatus in (4,5,6,7) = ของถึงไทยแล้ว.
 *   • dry-run เป็นค่าเริ่มต้น · backup ก่อน --apply · txn + re-verify ทุกตู้.
 *
 * 🚩 EXCLUDE #52038 (GZS260606-1 · 1780555730 · PR017) — ไม่แตะ:
 *   = หัวบิลรวม (aggregate) ของกล่อง PR107 6 ใบ (1780555730-1/6..-6/6) ที่ยิงครบแล้ว
 *   · cost 1125.30 = 187.55×6 · ฿1305.35 = 217.56×6 · wt 104 = Σ · ยืนยัน double-bill
 *   (invoice #24 paid + receipt FRG2606-00009 vs กล่องบน invoice #13 issued) — การยิง
 *   ให้ = 6 จะสร้างการรับกล่องผีอีก 6 (รวมเป็น 12) = ทำงานบัค. → ส่ง ภูม/บัญชี ตัดสิน
 *   (void ใบซ้ำ / re-key userid) ก่อน. ตู้ GZS260606-1 จึงยังแดงจนกว่าจะเคลียร์เคสนี้.
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("ต้องส่ง SUPABASE_DB_PASSWORD"); process.exit(1); }

const CABS = ["GZS260606-1", "GZS260528-1", "GZS260525-2", "GZS260618-1", "GZS260617-1"];
// 2026-07-22 (รอบ 2 · ภูม อนุมัติ): "งานจบครบไปแล้ว ยิงให้ครบไปเลย" → #52038 ยิงด้วย.
//   ⚠️ double-bill ยังค้าง (invoice #13 กล่อง PR107 ยังไม่ void vs #24 paid ของ #52038) —
//   การยิงรับไม่แตะเงิน · เรื่อง void ใบซ้ำยังเป็นงานบัญชีแยกต่างหาก.
const EXCLUDE = new Map();
const STAMP = "scanfix"; // adminid = varchar(10)

const suffixRe = /-(\d+)(?:\/\d+)?$/;
const baseOf = (t) => (t ?? "").replace(suffixRe, "");
const suffixOf = (t) => { const m = (t ?? "").match(suffixRe); return m ? Number(m[1]) : 0; };

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// ── build the target plan live (same countable/header logic as the completeness page) ──
const targets = [];   // { fid, cab, famount, cur, delta, existingRowId }
const flagged = [];   // { fid, cab, reason }

for (const cab of CABS) {
  const { rows: fwds } = await c.query(
    `select id, ftrackingchn, coalesce(famount,0)::int famount, coalesce(fweight,0)::float fweight,
            coalesce(ftotalprice,0)::float ftotalprice, userid, fstatus
     from tb_forwarder where fcabinetnumber = $1 order by ftrackingchn, id`, [cab]);
  const ids = fwds.map((f) => Number(f.id));
  const scans = ids.length
    ? (await c.query(`select fid, coalesce(fi2amount,0)::int fi2amount, id from tb_forwarder_import2 where fid = any($1) order by fid, id`, [ids])).rows
    : [];
  const scanSum = new Map(), scanRows = new Map();
  for (const s of scans) {
    const fid = Number(s.fid);
    scanSum.set(fid, (scanSum.get(fid) ?? 0) + Math.max(0, Number(s.fi2amount)));
    if (!scanRows.has(fid)) scanRows.set(fid, []);
    scanRows.get(fid).push(s);
  }
  const groupHasBox = new Set();
  for (const f of fwds) if (suffixOf(f.ftrackingchn) > 0) groupHasBox.add(`${baseOf(f.ftrackingchn)}::${f.userid ?? ""}`);
  const isHeader = (f) => suffixOf(f.ftrackingchn) === 0
    && groupHasBox.has(`${baseOf(f.ftrackingchn)}::${f.userid ?? ""}`)
    && Number(f.ftotalprice) <= 0;

  for (const f of fwds) {
    const fid = Number(f.id);
    if (isHeader(f)) continue;                 // หัวบิล — ไม่นับ
    const got = scanSum.get(fid) ?? 0;
    if (got >= f.famount) continue;            // ครบแล้ว
    if (!["4", "5", "6", "7"].includes(String(f.fstatus))) { flagged.push({ fid, cab, reason: `fstatus=${f.fstatus} ยังไม่ถึงไทย — ไม่ยิง` }); continue; }
    if (EXCLUDE.has(fid)) { flagged.push({ fid, cab, reason: EXCLUDE.get(fid) }); continue; }
    const delta = f.famount - got;
    const rows = scanRows.get(fid) ?? [];
    targets.push({ fid, cab, tracking: f.ftrackingchn ?? "", famount: f.famount, cur: got, delta, existingRowId: rows[0]?.id ?? null });
  }
}

console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — ยิงรับตกหล่น: เป้า ${targets.length} แถว · flag ${flagged.length} แถว`);
let addTotal = 0;
for (const t of targets) {
  addTotal += t.delta;
  const act = t.existingRowId == null ? `INSERT ${t.delta}` : `UPDATE import2#${t.existingRowId} +${t.delta}`;
  console.log(`  ✎ #${t.fid} ${t.cab} fam=${t.famount} cur=${t.cur} → ${t.famount}  (${act})`);
}
console.log(`  รวมกล่องที่เติม = ${addTotal}`);
for (const fl of flagged) console.log(`  🚩 #${fl.fid} ${fl.cab} — ${fl.reason}`);

if (APPLY && targets.length > 0) {
  const stamp = Date.now();
  const backupIds = targets.map((t) => t.fid);
  const before = (await c.query(`select id, fid, fi2amount, fi2date, adminid from tb_forwarder_import2 where fid = any($1) order by fid, id`, [backupIds])).rows;
  fs.writeFileSync(`scripts/_backup-scan-shortfall-${stamp}.json`, JSON.stringify({ targets, flagged, before }, null, 1), "utf8");

  await c.query("begin");
  try {
    let ins = 0, upd = 0;
    for (const t of targets) {
      if (t.existingRowId == null) {
        // mirror upsertScanRow insert branch: keysearch = tracking · fipallet NOT NULL(5)
        await c.query(
          `insert into tb_forwarder_import2 (fid, fi2amount, fi2date, adminid, keysearch, fipallet)
           values ($1, $2, now(), $3, $4, $5)`,
          [t.fid, t.delta, STAMP, (t.tracking || String(t.fid)).slice(0, 80), "A1"]);
        ins++;
      } else {
        // mirror upsertScanRow update branch: bump fi2amount · adminid last-writer · refresh date
        const res = await c.query(
          `update tb_forwarder_import2 set fi2amount = fi2amount + $2, adminid = $3, fi2date = now() where id = $1`,
          [t.existingRowId, t.delta, STAMP]);
        upd += res.rowCount ?? 0;
      }
    }
    await c.query("commit");
    console.log(`APPLIED — INSERT ${ins} · UPDATE ${upd}`);
  } catch (e) { await c.query("rollback"); console.error("ROLLED BACK:", e.message); process.exitCode = 1; }
}

// ── re-verify all 5 cabinets (countable expected vs scanned + isComplete) ──
console.log("\n=== RE-VERIFY (countable) ===");
for (const cab of CABS) {
  const { rows: fwds } = await c.query(
    `select id, ftrackingchn, coalesce(famount,0)::int famount, coalesce(ftotalprice,0)::float ftotalprice, userid
     from tb_forwarder where fcabinetnumber = $1`, [cab]);
  const ids = fwds.map((f) => Number(f.id));
  const scans = ids.length ? (await c.query(`select fid, coalesce(fi2amount,0)::int fi2amount from tb_forwarder_import2 where fid = any($1)`, [ids])).rows : [];
  const scanSum = new Map();
  for (const s of scans) scanSum.set(Number(s.fid), (scanSum.get(Number(s.fid)) ?? 0) + Math.max(0, Number(s.fi2amount)));
  const groupHasBox = new Set();
  for (const f of fwds) if (suffixOf(f.ftrackingchn) > 0) groupHasBox.add(`${baseOf(f.ftrackingchn)}::${f.userid ?? ""}`);
  const isHeader = (f) => suffixOf(f.ftrackingchn) === 0 && groupHasBox.has(`${baseOf(f.ftrackingchn)}::${f.userid ?? ""}`) && Number(f.ftotalprice) <= 0;
  let expected = 0, scanned = 0, complete = 0, total = 0;
  for (const f of fwds) {
    if (isHeader(f)) continue;
    total++;
    const got = scanSum.get(Number(f.id)) ?? 0;
    expected += f.famount; scanned += got;
    if (got >= f.famount) complete++;
  }
  const ok = complete === total;
  console.log(`  ${cab}: expected=${expected} scanned=${scanned} · ${complete}/${total} rows · ${ok ? "✅ ครบ/ขาว" : `🔴 ขาด ${expected - scanned}`}`);
}
await c.end();
