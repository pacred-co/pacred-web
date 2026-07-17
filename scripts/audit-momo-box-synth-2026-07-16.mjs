import pg from "pg";

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const bases = ["1783582989", "519218029029"];

await c.connect();

for (const base of bases) {
  console.log(`\n===== BASE ${base} — tb_forwarder rows =====`);
  const f = await c.query(
    `select id, ftrackingchn, famount, famountcount, fweight, fvolume, ftotalprice, fstatus, fcabinetnumber, userid, fwidth, flength, fheight
     from tb_forwarder
     where ftrackingchn = $1 or ftrackingchn like $1 || '-%'
     order by ftrackingchn`,
    [base],
  );
  for (const r of f.rows) {
    console.log(
      `  id=${r.id} trk=${r.ftrackingchn} fa=${r.famount} fac=${r.famountcount} w=${r.fweight} vol=${r.fvolume} ftp=${r.ftotalprice} fs=${r.fstatus} cab=${r.fcabinetnumber} pr=${r.userid} dims=${r.fwidth}x${r.flength}x${r.fheight}`,
    );
  }
  console.log(`  --- momo_box_detail (truth) ---`);
  const b = await c.query(
    `select box_tracking, member_code, width, length, height, weight_kg, cbm, quantity, container_name
     from momo_box_detail
     where base_tracking = $1
     order by box_tracking`,
    [base],
  );
  for (const r of b.rows) {
    console.log(
      `    box=${r.box_tracking} pr=${r.member_code} dims=${r.width}x${r.length}x${r.height} w=${r.weight_kg} cbm=${r.cbm} qty=${r.quantity} cont=${r.container_name}`,
    );
  }
}

// Blast radius: platform-wide, which bare-with-box-sibling rows have money 0 (newly dropped)
console.log(`\n===== BLAST RADIUS: bare rows with a box sibling, money(ftotalprice)=0 =====`);
const blast = await c.query(`
  with rows as (
    select id, ftrackingchn, userid, famount, fweight, fvolume, coalesce(ftotalprice,0) ftp, fstatus,
           regexp_replace(ftrackingchn, '-\\d+(/\\d+)?$', '') as base,
           case when ftrackingchn ~ '-\\d+(/\\d+)?$' then 1 else 0 end as is_box
    from tb_forwarder
    where ftrackingchn is not null and ftrackingchn <> '' and ftrackingchn <> '-'
  ),
  groups as (
    select base, userid from rows where is_box = 1 group by base, userid
  )
  select r.id, r.ftrackingchn, r.userid, r.famount, r.fweight, r.ftp, r.fstatus
  from rows r
  join groups g on g.base = r.base and coalesce(g.userid,'') = coalesce(r.userid,'')
  where r.is_box = 0 and r.ftp = 0
  order by r.fstatus desc, r.id`);
console.log(`  bare+box-sibling + money0 (NEWLY DROPPED by money-aware callers): ${blast.rows.length}`);
for (const r of blast.rows) {
  console.log(`   id=${r.id} trk=${r.ftrackingchn} pr=${r.userid} fa=${r.famount} w=${r.fweight} ftp=${r.ftp} fs=${r.fstatus}`);
}

// Money-safety: bare+box-sibling with money>0 (KEPT) count by billed
const kept = await c.query(`
  with rows as (
    select id, coalesce(ftotalprice,0) ftp, fstatus,
           regexp_replace(ftrackingchn, '-\\d+(/\\d+)?$', '') as base, userid,
           case when ftrackingchn ~ '-\\d+(/\\d+)?$' then 1 else 0 end as is_box
    from tb_forwarder where ftrackingchn is not null and ftrackingchn <> '' and ftrackingchn <> '-'
  ),
  groups as (select base, userid from rows where is_box=1 group by base, userid)
  select count(*) filter (where r.fstatus in ('6','7')) billed, count(*) total
  from rows r join groups g on g.base=r.base and coalesce(g.userid,'')=coalesce(r.userid,'')
  where r.is_box=0 and r.ftp>0`);
console.log(`\n  bare+box-sibling money>0 (KEPT · never dropped): total=${kept.rows[0].total} billed=${kept.rows[0].billed}`);

await c.end();
