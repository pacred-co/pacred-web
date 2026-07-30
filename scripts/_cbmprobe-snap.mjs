/* TEMP PROBE — READ-ONLY. delete when done. */
import pg from "pg";

const c = new pg.Client({
  host: process.env.PGHOST, port: 5432, user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = (await c.query(`select parsed_snapshot s from momo_invoice_upload where id=1`)).rows[0].s;
console.log("cbmBasis:", r.cbmBasis, "| reason:", r.cbmBasisReason);
console.log("summary:", JSON.stringify(r.summary));
console.log("reconcile:", JSON.stringify(r.reconcile));
console.log("\nrows[0] shape:", JSON.stringify(r.rows?.[0], null, 1));
console.log(`\n${r.rows?.length} rows:`);
for (const x of r.rows ?? []) {
  const line = x.line ?? x;
  const cbm = Number(line.cbm), qty = Number(line.qty), rate = Number(line.unitPrice), tot = Number(line.lineTotal);
  const lt = +(rate * cbm).toFixed(2), pb = +(rate * cbm * qty).toFixed(2);
  console.log(
    `  ${String(line.tracking).padEnd(22)} cbm=${String(cbm).padStart(8)} qty=${String(qty).padStart(3)} rate=${String(rate).padStart(7)} tot=${String(tot).padStart(9)}` +
    ` | LT=${String(lt).padStart(9)} d=${(lt - tot).toFixed(2).padStart(8)} | PB=${String(pb).padStart(10)} d=${(pb - tot).toFixed(2).padStart(9)}` +
    ` | ourCbm=${x.ourCbm ?? "-"} invCbm=${x.invoiceCbm ?? "-"} match=${x.matched ?? "-"}`,
  );
}
await c.end();
