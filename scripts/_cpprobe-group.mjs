/* READ-ONLY probe #2 — cascade grouping (reforder2) + slip location. DELETE when done. */
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
    console.dir(r.rows, { depth: null, maxArrayLength: 40 }); return r.rows;
  } catch (e) { console.log(`\n=== ${label} — ERROR: ${e.message}`); return []; }
};

await q("the topup rows behind 106368/106369/106428",
  `select id, type, typeservice, userid, reforder, reforder2, amount, status,
          coalesce(imagesslip,'') imagesslip, slip_paths, date
     from tb_wallet_hs where id in (106367,106427,106368,106369,106428) order by id`);

await q("does reforder2 always point at a real wallet_hs row? (settled type4/ts2)",
  `select count(*) children, count(w.reforder2) with_ref2,
          count(p.id) ref2_resolves,
          count(*) filter (where p.type='1') parent_is_topup,
          count(*) filter (where coalesce(p.imagesslip,'')<>'') parent_has_slip
     from tb_wallet_hs w left join tb_wallet_hs p on p.id = w.reforder2
    where w.status='2' and w.type='4' and w.typeservice='2'`);

await q("cascade groups covering >1 fid (settled)",
  `select w.reforder2 topup_id, count(*) n, array_agg(w.reforder order by w.id) fids,
          sum(w.amount::numeric) child_sum, max(p.amount::numeric) topup_amount,
          max(p.userid) userid, max(coalesce(p.imagesslip,'')) slip
     from tb_wallet_hs w join tb_wallet_hs p on p.id = w.reforder2
    where w.status='2' and w.type='4' and w.typeservice='2' and w.reforder2 is not null
    group by 1 having count(*) > 1 order by n desc limit 10`);

await q("paydeposit populated for those topups?",
  `select whid, array_agg(hno) hnos from tb_wallet_paydeposit
    where whid in (106367,106427) group by 1`);

// full coverage over the two invoices' tracking families
const fam = `(ftrackingchn = '1783582423' or ftrackingchn like '1783582423-%'
           or ftrackingchn = '1783582289' or ftrackingchn like '1783582289-%'
           or ftrackingchn = '1783156487' or ftrackingchn like '1783156487-%')`;
await q("paid coverage over the screenshot families",
  `with f as (select id, ftrackingchn, userid from tb_forwarder where ${fam})
   select count(*) fids,
          count(w.id) settled_payments,
          count(distinct f.id) filter (where w.id is not null) fids_paid,
          count(distinct ri.rid) receipts
     from f
     left join tb_wallet_hs w on w.reforder = f.id::text and w.status='2'
     left join tb_receipt_item ri on ri.fid = f.id
     left join tb_receipt r on r.rid = ri.rid and r.rstatus <> '2'`);

await q("per-fid paid/receipt for the screenshot families",
  `with f as (select id, ftrackingchn, userid, ftotalprice from tb_forwarder where ${fam})
   select f.id, f.ftrackingchn, f.userid,
          w.id wallet_id, w.date paid_at, w.amount, w.reforder2,
          r.rid, r.id receipt_id
     from f
     left join tb_wallet_hs w on w.reforder = f.id::text and w.status='2'
     left join tb_receipt_item ri on ri.fid = f.id
     left join tb_receipt r on r.rid = ri.rid and r.rstatus <> '2'
    order by f.ftrackingchn limit 40`);

// credit customers: billed on credit, never through wallet_hs?
await q("settled-but-no-wallet: fstatus>=6 with no settled wallet row",
  `select count(*) n,
          count(*) filter (where coalesce(fcredit,'') <> '' and fcredit <> '0') on_credit
     from tb_forwarder f
    where f.fstatus in ('6','7')
      and not exists (select 1 from tb_wallet_hs w where w.reforder = f.id::text and w.status='2')`);

await c.end();
