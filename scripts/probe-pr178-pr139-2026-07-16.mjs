// READ-ONLY probe — PR178 (52133/52134 · re-collect blocked) + PR139 (can't collect).
//   node scripts/probe-pr178-pr139-2026-07-16.mjs
import pg from "pg";
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

const dump = async (title, sql, params = []) => {
  const { rows } = await c.query(sql, params);
  console.log(`\n── ${title} (${rows.length}) ──`);
  rows.forEach((r) => console.log("  " + JSON.stringify(r)));
};

console.log("════════════ PR178 · fwd 52133 / 52134 ════════════");
await dump("tb_forwarder 52133/52134", `
  SELECT id, ftrackingchn, fstatus, fcredit, ftransportprice, ftotalprice, fshipby, paymethod, fusercompany, famount
    FROM tb_forwarder WHERE id IN (52133,52134) ORDER BY id`);

await dump("tb_wallet_hs · reforder 52133/52134 (per-order pay rows)", `
  SELECT id, amount, type, typenew, typeservice, status, paydeposit, reforder, reforder2, depositnamebank, imagesslip, note, date
    FROM tb_wallet_hs WHERE reforder IN ('52133','52134') ORDER BY id`);

await dump("tb_wallet_hs · PR178 topup/other rows (userid, recent)", `
  SELECT id, amount, type, typenew, typeservice, status, paydeposit, reforder, reforder2, imagesslip, session, note, date
    FROM tb_wallet_hs WHERE userid='PR178' AND date > '2026-07-10' ORDER BY id DESC LIMIT 20`);

await dump("tb_wallet_paydeposit · PR178 bridges (recent)", `
  SELECT * FROM tb_wallet_paydeposit WHERE userid='PR178' ORDER BY id DESC LIMIT 10`);

await dump("receipts covering 52133/52134", `
  SELECT r.rid, r.rstatus, r.recompname, r.corporatetype, ri.fid
    FROM tb_receipt r JOIN tb_receipt_item ri ON ri.rid=r.rid
   WHERE ri.fid IN (52133,52134) ORDER BY r.rid`);

await dump("invoices covering 52133/52134", `
  SELECT i.id, i.doc_no, i.status, ii.forwarder_id
    FROM tb_forwarder_invoice i JOIN tb_forwarder_invoice_item ii ON ii.invoice_id=i.id
   WHERE ii.forwarder_id IN (52133,52134) ORDER BY i.id`);

console.log("\n\n════════════ PR139 · fwd rows (can't collect) ════════════");
await dump("tb_forwarder PR139 · fstatus 4/5/6 (payable)", `
  SELECT id, ftrackingchn, fstatus, fcredit, ftransportprice, ftotalprice, fshipby, paymethod, fusercompany, fcabinetnumber, famount, fweight, fvolume
    FROM tb_forwarder WHERE userid='PR139' AND fstatus IN ('4','5','6') ORDER BY id`);

await dump("tb_wallet_hs · PR139 recent", `
  SELECT id, amount, type, typenew, typeservice, status, paydeposit, reforder, reforder2, imagesslip, note, date
    FROM tb_wallet_hs WHERE userid='PR139' ORDER BY id DESC LIMIT 15`);

await dump("PR139 user + corporate", `
  SELECT u."userID", u."userName", u."userTel", u."userCompany",
         (SELECT count(*) FROM tb_corporate WHERE userid='PR139') AS corp_rows
    FROM tb_users u WHERE u."userID"='PR139'`);

await c.end();
