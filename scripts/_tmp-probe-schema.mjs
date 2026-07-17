import pg from "pg";
const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();
for (const t of ["tb_forwarder","tb_cnt","tb_cnt_item","momo_box_detail","tb_check_forwarder","tb_forwarder_invoice","tb_receipt","tb_header_order"]) {
  const { rows } = await client.query(
    `select column_name, data_type from information_schema.columns where table_name=$1 order by ordinal_position`, [t]);
  console.log(`\n=== ${t} (${rows.length}) ===`);
  console.log(rows.map(r=>`${r.column_name}:${r.data_type}`).join(" | "));
}
await client.end();
