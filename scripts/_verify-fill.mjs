import pg from "pg";
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.DBPW, database: "postgres",
  ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (l, sql, p=[]) => { const r = await c.query(sql, p);
  console.log(`\n== ${l} (${r.rowCount})`); for (const x of r.rows) console.log("  " + JSON.stringify(x)); };

// ── A) the 9 short-a-box families: rows Σ vs staging Σ vs box_detail Σ ──
const BASES = ['1784190161','1784366971','1784432869','202111486075','76023796235','519218029036','908007156796','302197036845','800020986676'];
await q("A1 · family Σ (tb_forwarder live)",
  `SELECT regexp_replace(btrim(ftrackingchn),'-\\d+(/\\d+)?$','') base, COUNT(*)::int rows,
          SUM(famount)::int boxes, ROUND(SUM(fweight)::numeric,2) wt,
          ROUND(SUM(CASE WHEN famountcount='1' THEN fvolume ELSE fvolume*GREATEST(famount,1) END)::numeric,6) cbm,
          ROUND(SUM(ftotalprice)::numeric,2) sell, MIN(fstatus) minst, MAX(fstatus) maxst, MIN(userid) userid
   FROM tb_forwarder WHERE COALESCE(fstatus,'') NOT IN ('','0','99')
     AND regexp_replace(btrim(ftrackingchn),'-\\d+(/\\d+)?$','') = ANY($1)
   GROUP BY 1 ORDER BY 1`, [BASES]);
await q("A2 · staging Σ per base",
  `SELECT regexp_replace(btrim(momo_tracking_no),'-\\d+(/\\d+)?$','') base, COUNT(*)::int rows,
          SUM(quantity)::int qty, ROUND(SUM(weight_kg)::numeric,2) wt, ROUND(SUM(cbm)::numeric,6) cbm
   FROM momo_import_tracks WHERE regexp_replace(btrim(momo_tracking_no),'-\\d+(/\\d+)?$','') = ANY($1)
   GROUP BY 1 ORDER BY 1`, [BASES]);
await q("A3 · staging rows ที่ยังไม่ถูกแทนด้วยแถวจริง (ชี้ id ที่มีเจ้าของอื่น)",
  `SELECT s.momo_tracking_no, s.quantity, s.weight_kg, s.cbm, s.committed_forwarder_id, s.committed_at, s.committed_by,
          f.ftrackingchn AS row_tracking, f.famount row_amt, f.fweight row_wt
   FROM momo_import_tracks s LEFT JOIN tb_forwarder f ON f.id = s.committed_forwarder_id
   WHERE regexp_replace(btrim(s.momo_tracking_no),'-\\d+(/\\d+)?$','') = ANY($1)
     AND btrim(s.momo_tracking_no) <> btrim(COALESCE(f.ftrackingchn,''))
   ORDER BY s.momo_tracking_no`, [BASES]);

// ── B) the 3 cost rows: sell basis + invoice linkage + rates ──
await q("B1 · 3 แถว basis + rate columns",
  `SELECT id, ftrackingchn, userid, fcabinetnumber, fstatus, famount, famountcount, fweight, fvolume,
          frefrate, frefprice, ftotalprice, fcosttotalprice, fwarehousename, ftransporttype, fproductstype
   FROM tb_forwarder WHERE id IN (52154, 52422, 52184)`);
await q("B2 · container rates ของ 3 ตู้",
  `SELECT fcabinetnumber, fproductstype1, fproductstype2 FROM tb_cost_container
   WHERE fcabinetnumber IN ('GZS260628-1','GZE260709-1','GZE260701-1')`);
await q("B3 · staging ของ 3 แถว (cbm มาจากไหน)",
  `SELECT momo_tracking_no, quantity, weight_kg, cbm FROM momo_import_tracks
   WHERE momo_tracking_no IN ('983824005','1783586200','500255762943')`);
await q("B4 · invoice linkage (ยอดบิล frozen)",
  `SELECT ii.forwarder_id, i.doc_no, i.status, ii.amount_thb FROM tb_forwarder_invoice_item ii
   JOIN tb_forwarder_invoice i ON i.id=ii.invoice_id WHERE ii.forwarder_id IN (52154,52422,52184)`);
await c.end();
