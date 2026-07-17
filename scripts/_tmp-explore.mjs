import pg from "pg";
const c = new pg.Client({ host:"aws-1-ap-southeast-1.pooler.supabase.com", port:5432,
  user:"postgres.yzljakczhwrpbxflnmco", password:"DqOzfEZVXfMHIryz", database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();
const q = async (label, sql, p=[]) => { const {rows}=await c.query(sql,p); console.log(`\n### ${label}`); console.table(rows.slice(0,25)); if(rows.length>25) console.log(`… +${rows.length-25} more`); return rows; };

await q("fwd totals by fstatus", `select fstatus, count(*) n, sum(ftotalprice)::numeric(14,2) sell, sum(fcosttotalprice)::numeric(14,2) cost from tb_forwarder group by 1 order by 1`);
await q("cabinets total", `select count(distinct fcabinetnumber) cabs, count(*) rows from tb_forwarder where coalesce(fcabinetnumber,'')<>''`);
await q("tb_cnt / cnt_item", `select (select count(*) from tb_cnt) cnt, (select count(*) from tb_cnt_item) items, (select count(distinct "fCabinetNumber") from tb_cnt_item) paid_cabs`);
await q("check queue", `select f.fstatus, count(*) n from tb_check_forwarder ch join tb_forwarder f on f.id=ch."fID" group by 1 order by 1`);
await q("momo_box_detail", `select count(*) rows, count(distinct base_tracking) bases, count(distinct container_name) cabs from momo_box_detail`);
await c.end();
