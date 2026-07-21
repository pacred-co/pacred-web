import pg from "pg";
const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.PGPW,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const q = await c.query(`select id, ftrackingchn, userid, fstatus, famount, fweight, fvolume, ftotalprice, adminid from tb_forwarder where ftrackingchn like '908007350691%' and fstatus not in ('','0','99') order by ftrackingchn`);
if (q.rows.some(r => r.ftrackingchn === '908007350691')) {
  const sum = q.rows.reduce((a, r) => ({ q: a.q + Number(r.famount), w: a.w + Number(r.fweight) }), { q: 0, w: 0 });
  console.log(`COMMITTED: ${q.rows.map(r => `#${r.id} ${r.ftrackingchn} ${r.userid} qty${r.famount} ${r.fweight}kg ฿${r.ftotalprice} by=${r.adminid}`).join(" | ")} → familyΣ ${sum.q} กล่อง ${sum.w}kg`);
} else {
  console.log("PENDING");
}
await c.end();
