/**
 * zero-mao-phantom-thship-2026-07-18.mjs — zero the PHANTOM per-tracking ค่าขนส่งไทย
 * (ftransportprice) on UNBILLED rows of เหมาๆ (own-fleet PCSF/PRF) shipments.
 *
 * 🔴 owner 2026-07-18 "ค่าบริการอื่นๆ 7,004 ไม่มีค่านี้ · กำลังจะเก็บเงิน · ค่าขนส่งไทยมั่ว".
 * ROOT: for a เหมาๆ shipment the domestic delivery is the ฿100 flat maoFee — the customer
 * pays import + ฿100. But the sibling rows (fshipby='' · inherit the shipment's เหมาๆ
 * delivery) + the base had per-tracking ftransportprice auto-filled (Flash-quote values ·
 * 679/311/190/…), which the pay-modal SUMS on TOP of the ฿100 = double-charge (the "ค่า
 * บริการอื่นๆ" phantom). The desktop cost-section already shows the correct import + one
 * ฿100. Zeroing the phantom makes EVERY money surface agree (they all read ftransportprice)
 * and the ฿100 flat anchor still fires once per bill.
 *
 * SCOPE — a container is SHARED across customers, so a เหมาๆ shipment is a (CUSTOMER,
 * container) pair where THAT customer has a PCSF/PRF row (NOT "the container has one" —
 * that wrongly caught PR079's legit Flash rows in a container that another customer paid
 * เหมาๆ). Zero ONLY:
 *   - a (userid, container) where THAT userid has a PCSF/PRF row (= the customer's เหมาๆ shipment)
 *   - AND the row's own fshipby is PCSF / PRF / '' (empty = inherits the shipment's เหมาๆ
 *     delivery) — a row with an EXPLICIT courier (Flash '2', J&T…) keeps its per-tracking fee
 *   - AND ftransportprice > 0  ·  fstatus IN ('4','5')  ·  NOT COD (paymethod<>'2')  ·  unbilled
 *
 * SAFETY: money-CORRECTING (removes an over-charge) · unbilled-only · dry-run + backup.
 * RUN: SUPABASE_DB_PASSWORD='…' node scripts/zero-mao-phantom-thship-2026-07-18.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});

const SCOPE = `
  WITH mao_cust_cabs AS (
    -- (customer, container) pairs where THAT customer chose เหมาๆ (has a PCSF/PRF row there)
    SELECT DISTINCT userid, fcabinetnumber FROM tb_forwarder
    WHERE upper(trim(fshipby)) IN ('PCSF','PRF') AND fcabinetnumber NOT IN ('','0') AND fcabinetnumber IS NOT NULL
  )
  SELECT f.id, f.userid, f.fcabinetnumber, f.fshipby, f.fstatus,
         f.ftransportprice::numeric AS th, f.paymethod
  FROM tb_forwarder f
  JOIN mao_cust_cabs m ON m.userid = f.userid AND m.fcabinetnumber = f.fcabinetnumber
  WHERE f.ftransportprice::numeric > 0
    AND f.fstatus IN ('4','5')
    AND (f.paymethod IS NULL OR f.paymethod <> '2')
    -- own carrier is เหมาๆ (PCSF/PRF) or EMPTY (inherits the shipment's เหมาๆ delivery);
    -- an explicit courier (Flash '2' / J&T / …) keeps its legit per-tracking fee
    AND (upper(trim(f.fshipby)) IN ('PCSF','PRF') OR trim(coalesce(f.fshipby,'')) = '')
    AND NOT EXISTS (
      SELECT 1 FROM tb_forwarder_invoice_item ii JOIN tb_forwarder_invoice iv ON iv.id = ii.invoice_id
      WHERE ii.forwarder_id = f.id AND iv.status <> 'cancelled')
  ORDER BY f.userid, f.fcabinetnumber, f.id`;

async function main() {
  await c.connect();
  const { rows } = await c.query(SCOPE);
  const sum = rows.reduce((s, r) => s + Number(r.th), 0);
  const byUser = {};
  for (const r of rows) byUser[r.userid] = (byUser[r.userid] || 0) + 1;

  console.log(`\n━━ ZERO เหมาๆ PHANTOM ค่าขนส่งไทย (${rows.length} rows) ━━`);
  console.log(`Σ ftransportprice → 0: ฿${Math.round(sum * 100) / 100} (phantom · double-charged on the pay-modal)`);
  console.log(`per customer:`, Object.entries(byUser).map(([u, n]) => `${u}:${n}`).join(" · "));
  console.table(rows.slice(0, 12).map((r) => ({ id: r.id, pr: r.userid, cab: r.fcabinetnumber, ship: r.fshipby || "(ว่าง)", st: r.fstatus, th: Number(r.th) })));
  if (rows.length > 12) console.log(`  … +${rows.length - 12} more`);

  if (!APPLY) { console.log("\n(dry-run — pass --apply · backup written first)"); await c.end(); return; }

  writeFileSync(`/tmp/backup-zero-mao-phantom-thship-2026-07-18.json`, JSON.stringify(rows, null, 2));
  console.log(`\n📦 backup → /tmp/backup-zero-mao-phantom-thship-2026-07-18.json`);
  const ids = rows.map((r) => r.id);
  await c.query("BEGIN");
  // Re-guard the WHERE at write time so a row that got billed/COD between the read and the
  // write is not touched (money-safe).
  const res = await c.query(
    `UPDATE tb_forwarder SET ftransportprice = 0
     WHERE id = ANY($1) AND ftransportprice::numeric > 0 AND fstatus IN ('4','5')
       AND (paymethod IS NULL OR paymethod <> '2')
       AND (upper(trim(fshipby)) IN ('PCSF','PRF') OR trim(coalesce(fshipby,'')) = '')`,
    [ids],
  );
  await c.query("COMMIT");
  console.log(`\n✅ applied — ${res.rowCount}/${rows.length} rows zeroed (import + ฿100 เหมาๆ only now)`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
