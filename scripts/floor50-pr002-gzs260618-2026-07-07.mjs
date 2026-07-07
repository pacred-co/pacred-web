/**
 * Apply the ฿50/tracking minimum (FORWARDER_IMPORT_MIN_THB · ภูม 2026-07-01) to the
 * PR002 / GZS260618-1 forwarders + invoice 54. These were priced 2026-06-14→16 (BEFORE
 * the floor existed) and my direct 3300 re-price also bypassed it → 5 rows sit under
 * ฿50. Owner 2026-07-07: charge min ฿50/tracking on any order NOT yet collected + future
 * (future already floored by the engine). Invoice 54 is issued+UNPAID → safe pre-collection.
 *
 * Floors ftotalprice = max(ftotalprice, 50) on the forwarder + its invoice-54 item, then
 * recomputes the invoice header subtotal/total. GUARD: aborts unless invoice 54 is
 * issued+unpaid. Idempotent (rows already ≥50 unchanged). Backup + dry-run.
 *
 *   node --env-file=.env.local scripts/floor50-pr002-gzs260618-2026-07-07.mjs         # dry-run
 *   node --env-file=.env.local scripts/floor50-pr002-gzs260618-2026-07-07.mjs --apply  # write
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const INVOICE_ID = 54, CABINET = "GZS260618-1", FLOOR = 50;
const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const { data: inv } = await sb.from("tb_forwarder_invoice")
    .select("id,doc_no,status,subtotal_thb,total_thb,delivery_th_thb,mao_fee_thb,slip_status,cancelled_at,userid")
    .eq("id", INVOICE_ID).maybeSingle();
  if (!inv) { console.error("invoice 54 not found"); process.exit(1); }
  if (inv.status !== "issued" || inv.slip_status || inv.cancelled_at) {
    console.error(`ABORT: invoice ${INVOICE_ID} not issued+unpaid (status=${inv.status} slip=${inv.slip_status})`); process.exit(1);
  }

  const { data: items } = await sb.from("tb_forwarder_invoice_item").select("id,forwarder_id,amount_thb").eq("invoice_id", INVOICE_ID);
  const { data: fwds } = await sb.from("tb_forwarder")
    .select("id,userid,ftotalprice,fcabinetnumber,customrate")
    .in("id", (items ?? []).map((i) => i.forwarder_id));
  const fMap = new Map((fwds ?? []).map((f) => [f.id, f]));

  const bk = process.env.TEMP ? `${process.env.TEMP}/floor50-pr002-backup-2026-07-07.json` : "/tmp/floor50-pr002-backup.json";
  writeFileSync(bk, JSON.stringify({ inv, items, fwds }, null, 2));
  console.log(`backup: ${bk}`);

  const fwdUpdates = [], itemUpdates = [];
  let newSubtotal = 0;
  console.log("\n=== PLAN (floor ฿50/tracking · only GZS260618-1 rows) ===");
  for (const it of items ?? []) {
    const f = fMap.get(it.forwarder_id);
    const inCab = f && String(f.fcabinetnumber) === CABINET;
    const cur = Number(it.amount_thb);
    if (inCab && cur < FLOOR) {
      newSubtotal = round2(newSubtotal + FLOOR);
      fwdUpdates.push({ id: f.id });
      itemUpdates.push({ id: it.id });
      console.log(`  fwd ${it.forwarder_id} / item ${it.id}: ${cur} → ${FLOOR}  (floored +${round2(FLOOR - cur)})`);
    } else {
      newSubtotal = round2(newSubtotal + cur);
      console.log(`  fwd ${it.forwarder_id} / item ${it.id}: ${cur} (≥50 or other cab · unchanged)`);
    }
  }
  const newTotal = round2(newSubtotal + Number(inv.delivery_th_thb ?? 0) + Number(inv.mao_fee_thb ?? 0));
  console.log(`\n  invoice 54 subtotal ${inv.subtotal_thb} → ${newSubtotal}`);
  console.log(`  invoice 54 total    ${inv.total_thb} → ${newTotal}`);
  console.log(`  floored ${itemUpdates.length} rows`);

  if (!APPLY) { console.log("\nDRY-RUN — pass --apply."); return; }
  console.log("\n=== APPLYING ===");
  for (const u of fwdUpdates) {
    const { error } = await sb.from("tb_forwarder").update({ ftotalprice: FLOOR }).eq("id", u.id).lt("ftotalprice", FLOOR);
    console.log(`  fwd ${u.id}: ${error ? "ERR " + error.message : "ok " + FLOOR}`);
  }
  for (const u of itemUpdates) {
    const { error } = await sb.from("tb_forwarder_invoice_item").update({ amount_thb: FLOOR }).eq("id", u.id).lt("amount_thb", FLOOR);
    console.log(`  item ${u.id}: ${error ? "ERR " + error.message : "ok " + FLOOR}`);
  }
  const { error: hErr } = await sb.from("tb_forwarder_invoice")
    .update({ subtotal_thb: newSubtotal, total_thb: newTotal }).eq("id", INVOICE_ID).eq("status", "issued").is("slip_status", null);
  console.log(`  invoice 54 header: ${hErr ? "ERR " + hErr.message : "ok subtotal=" + newSubtotal + " total=" + newTotal}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
