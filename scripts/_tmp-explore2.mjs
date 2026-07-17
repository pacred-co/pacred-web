import pg from "pg";
const c = new pg.Client({ host:"aws-1-ap-southeast-1.pooler.supabase.com", port:5432,
  user:"postgres.yzljakczhwrpbxflnmco", password:"DqOzfEZVXfMHIryz", database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();
const q = async (label, sql, p=[]) => { const {rows}=await c.query(sql,p); console.log(`\n### ${label}`); console.table(rows.slice(0,30)); if(rows.length>30) console.log(`… +${rows.length-30}`); return rows; };

// any cnt-ish tables?
await q("cnt tables", `select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I', table_name), false,true,'')))[1]::text::int n
  from information_schema.tables where table_schema='public' and table_name like 'tb_cnt%'`);

// zero-cost by cabinet
await q("ตู้ที่มีแถวต้นทุน=0", `
 select fcabinetnumber cab, count(*) rows_total,
   count(*) filter (where coalesce(fcosttotalprice,0)=0) rows_nocost,
   sum(ftotalprice) filter (where coalesce(fcosttotalprice,0)=0) sell_nocost,
   min(fstatus) minst, max(fstatus) maxst
 from tb_forwarder where coalesce(fcabinetnumber,'')<>'' and fstatus<>'99'
 group by 1 having count(*) filter (where coalesce(fcosttotalprice,0)=0) > 0
 order by 4 desc nulls last`);
await c.end();
