/* TEMP PROBE — READ-ONLY. delete when done. */
import pg from "pg";
const c = new pg.Client({
  host: process.env.PGHOST, port: 5432, user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const s = (await c.query(`select parsed_snapshot s, file_path, file_name from momo_invoice_upload where id=1`)).rows[0];
console.log("file:", s.file_name, "|", s.file_path);
console.log("\ntracking                 qty   ourCbm   printedCbm  ratio | invCost  curCost  rate(vs ourCbm)  rate(vs printed) | printed==ourCbm*qty?");
let nRatio = 0;
for (const x of s.s.rows ?? []) {
  const qty = Number(x.qty), our = Number(x.ourCbm), pr = Number(x.invoiceCbm);
  const ic = Number(x.invoiceCost), cc = Number(x.currentCost);
  const ratio = our > 0 ? pr / our : NaN;
  const rOur = our > 0 ? ic / our : NaN;
  const rPr = pr > 0 ? ic / pr : NaN;
  const inflated = Math.abs(pr - our * qty) <= 0.0006 && qty > 1;
  if (inflated) nRatio++;
  console.log(
    `${String(x.tracking).padEnd(22)} ${String(qty).padStart(3)} ${our.toFixed(6).padStart(9)} ${pr.toFixed(4).padStart(11)} ${ratio.toFixed(3).padStart(7)} | ` +
    `${ic.toFixed(2).padStart(8)} ${cc.toFixed(2).padStart(8)} ${rOur.toFixed(2).padStart(9)} ${rPr.toFixed(2).padStart(11)} | ${inflated ? "YES  <<<" : ""}`,
  );
}
console.log(`\ninflated-CBM lines (printed == ourCbm × qty, qty>1): ${nRatio}`);
console.log("recorded totalMismatches:", s.s.summary?.totalMismatches);
await c.end();
