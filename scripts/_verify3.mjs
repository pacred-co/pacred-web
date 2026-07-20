import pg from "pg";
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.DBPW, database: "postgres",
  ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (l, sql, p=[]) => { const r = await c.query(sql, p);
  console.log(`\n== ${l} (${r.rowCount})`); for (const x of r.rows) console.log("  " + JSON.stringify(x)); };

await q("1784432869 per-row: staging vs live (หา 51.6kg ที่เหลือ)",
  `SELECT s.momo_tracking_no st, s.quantity sq, s.weight_kg sw, s.cbm sc,
          f.id fid, f.ftrackingchn ft, f.famount fa, f.fweight fw, f.fvolume fv, f.ftotalprice tp
   FROM momo_import_tracks s
   LEFT JOIN tb_forwarder f ON f.id = s.committed_forwarder_id
   WHERE s.momo_tracking_no LIKE '1784432869%' ORDER BY s.momo_tracking_no`);
await q("52751 (202111486075) rate cols",
  `SELECT id, frefrate, frefprice, ftotalprice, fvolume, fweight, famount, famountcount, fstatus FROM tb_forwarder WHERE id=52751`);
await q("template sibling ต่อ family (ดู field ที่ต้อง clone)",
  `SELECT id, ftrackingchn, userid, fstatus, fshipby, paymethod, fcabinetnumber, fwarehousename, fwarehousechina,
          ftransporttype, fproductstype, fcredit, fdatestatus2, fdatestatus3, fdatecontainerclose, adminidupdate, commit_userid
   FROM tb_forwarder WHERE id IN (52852, 52885, 52867, 52751, 52813, 52741, 52896)`);
await q("box_detail dims ของกล่องที่จะสร้าง",
  `SELECT base_tracking, box_tracking, quantity, weight_kg, cbm, width, length, height FROM momo_box_detail
   WHERE box_tracking IN ('1784190161','1784366971','1784432869','202111486075-2','302197036845-2','76023796235','908007156796')
   ORDER BY base_tracking`);
await c.end();
