/* READ-ONLY probe #3b — billing-run channel detail. DELETE when done. */
import pg from "pg";
const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.PGPW,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const q = async (label, sql, params = []) => {
  try { const r = await c.query(sql, params);
    console.log(`\n=== ${label} (${r.rows.length}) ===`);
    console.dir(r.rows, { depth: null, maxArrayLength: 30 }); return r.rows;
  } catch (e) { console.log(`\n=== ${label} — ERROR: ${e.message}`); return []; }
};

await q("tb_forwarder_invoice remaining cols",
  `select column_name, data_type from information_schema.columns
    where table_name='tb_forwarder_invoice'
      and column_name in ('doc_no','slip_path','slip_paths','slip_status','slip_uploaded_at','receipt_id')
    order by 1`);

await q("invoice status values",
  `select status, count(*) n, count(paid_at) with_paid_at from tb_forwarder_invoice group by 1 order by n desc`);

await q("DISTINCT fids per channel (fstatus 6/7)",
  `select
     count(distinct f.id) filter (where w.id is not null) wallet_paid,
     count(distinct f.id) filter (where w.id is null and i.status='paid') billing_only,
     count(distinct f.id) filter (where w.id is null and (i.id is null or i.status<>'paid')) neither
   from tb_forwarder f
   left join tb_wallet_hs w on w.reforder = f.id::text and w.status='2'
   left join tb_forwarder_invoice_item ii on ii.forwarder_id = f.id
   left join tb_forwarder_invoice i on i.id = ii.invoice_id
   where f.fstatus in ('6','7')`);

await q("sample billing-only rows",
  `select f.id, f.userid, f.fstatus, f.ftotalprice, f.fcabinetnumber,
          i.id inv_id, i.doc_no, i.status, i.paid_at, coalesce(i.slip_path,'') slip_path
     from tb_forwarder f
     join tb_forwarder_invoice_item ii on ii.forwarder_id = f.id
     join tb_forwarder_invoice i on i.id = ii.invoice_id and i.status='paid'
    where f.fstatus in ('6','7')
      and not exists (select 1 from tb_wallet_hs w where w.reforder=f.id::text and w.status='2')
    order by f.id desc limit 10`);

await q("receipt reachable for billing-only rows?",
  `select count(distinct f.id) billing_only_fids,
          count(distinct f.id) filter (where r.rid is not null) with_receipt
     from tb_forwarder f
     join tb_forwarder_invoice_item ii on ii.forwarder_id = f.id
     join tb_forwarder_invoice i on i.id = ii.invoice_id and i.status='paid'
     left join tb_receipt_item ri on ri.fid = f.id
     left join tb_receipt r on r.rid = ri.rid and r.rstatus <> '2'
    where f.fstatus in ('6','7')
      and not exists (select 1 from tb_wallet_hs w where w.reforder=f.id::text and w.status='2')`);

await c.end();
