/* READ-ONLY probe — customer payment for MOMO-invoiced trackings. DELETE when done. */
import pg from "pg";

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.PGPW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const q = async (label, sql, params = []) => {
  try {
    const r = await c.query(sql, params);
    console.log(`\n=== ${label} (${r.rows.length}) ===`);
    console.dir(r.rows, { depth: null, maxArrayLength: 40 });
    return r.rows;
  } catch (e) {
    console.log(`\n=== ${label} — ERROR: ${e.message}`);
    return [];
  }
};

await q(
  "column types",
  `select table_name, column_name, data_type
     from information_schema.columns
    where (table_name='tb_wallet_hs' and column_name in ('reforder','reforder2','imagesslip','slip_paths','amount','date','status','type','typeservice','userid'))
       or (table_name='tb_receipt' and column_name in ('refwhid','rid','rstatus','id','ramount'))
       or (table_name='tb_receipt_item' and column_name in ('fid','rid'))
    order by table_name, column_name`,
);

await q(
  "wallet_hs settled shape",
  `select type, typeservice,
          count(*) n,
          count(*) filter (where reforder::text ~ '^[0-9]+$') numeric_ref,
          count(*) filter (where reforder2 is null) ref2_null,
          count(*) filter (where reforder2::text = '') ref2_empty,
          count(*) filter (where coalesce(imagesslip,'') <> '') has_slip
     from tb_wallet_hs
    where status = '2'
    group by 1,2 order by n desc limit 15`,
);

const trk = await q(
  "trackings from the screenshot",
  `select id, ftrackingchn, fcabinetnumber, userid, ftotalprice, fcosttotalprice, fstatus
     from tb_forwarder
    where ftrackingchn like '1783582423%' or ftrackingchn like '1783582289%'
       or ftrackingchn like '1783156487%'
    order by ftrackingchn limit 60`,
);

const fids = trk.map((r) => String(r.id));
if (fids.length) {
  await q(
    "settled payments for those fids",
    `select w.id, w.reforder, w.userid, w.date, w.amount, w.type, w.typeservice,
            w.reforder2, coalesce(w.imagesslip,'') imagesslip, w.slip_paths, w.status
       from tb_wallet_hs w
      where w.status = '2' and w.reforder::text = any($1::text[])
      order by w.id`,
    [fids],
  );
  await q(
    "receipts for those fids (via item)",
    `select ri.fid, r.id, r.rid, r.rstatus, r.refwhid
       from tb_receipt_item ri join tb_receipt r on r.rid = ri.rid
      where ri.fid::text = any($1::text[]) and r.rstatus <> '2'
      order by ri.fid`,
    [fids],
  );
}

await q(
  "shared-slip groups (same userid+imagesslip, type4/ts2, settled)",
  `select userid, imagesslip, count(*) n, array_agg(id order by id) ids,
          array_agg(reforder order by id) refs, sum(amount::numeric) total
     from tb_wallet_hs
    where status='2' and type='4' and typeservice='2'
      and coalesce(imagesslip,'') <> '' and reforder::text ~ '^[0-9]+$'
    group by 1,2 having count(*) > 1
    order by n desc limit 8`,
);

await q(
  "tb_receipt refwhid coverage",
  `select count(*) total, count(refwhid) with_refwhid,
          count(*) filter (where rstatus='2') voided from tb_receipt`,
);

await c.end();
