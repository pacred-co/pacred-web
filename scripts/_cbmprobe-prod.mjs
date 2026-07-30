/* TEMP PROBE — READ-ONLY. delete when done. */
import pg from "pg";

const c = new pg.Client({
  host: process.env.PGHOST,
  port: 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const up = await c.query(`
  select id, invoice_no, line_count, sub_total, lines_total, reconciles, cbm_basis,
         matched_count, unmatched_count, conflict_count, status, uploaded_at,
         jsonb_typeof(parsed_snapshot) as snap_type,
         (select string_agg(k, ',') from jsonb_object_keys(parsed_snapshot) k) as snap_keys
    from momo_invoice_upload
   order by uploaded_at desc limit 40`);
console.log(`momo_invoice_upload rows: ${up.rowCount}`);
for (const r of up.rows) {
  console.log(
    `  #${r.id} ${r.invoice_no} lines=${r.line_count} sub=${r.sub_total} Σ=${r.lines_total} rec=${r.reconciles} basis=${r.cbm_basis} m/u/c=${r.matched_count}/${r.unmatched_count}/${r.conflict_count} ${r.status} ${r.uploaded_at?.toISOString?.() ?? r.uploaded_at} keys=[${r.snap_keys}]`,
  );
}

const ln = await c.query(`select count(*)::int n from momo_invoice_line`);
console.log(`\nmomo_invoice_line rows: ${ln.rows[0].n}`);

await c.end();
