/**
 * COORDINATED correction: PR002 / GZS260618-1 was charged the STALE general
 * ฿3,700/CBM; its SVIP card is ฿3,300 (added after pricing). The 14 forwarders are
 * already billed into invoice 54 (FRI2607-00019) which is STILL UNPAID (slip_status
 * null · status issued) → safe to correct BEFORE collection (not a re-collection).
 *
 * Moves forwarder + bill-item + bill-header together to stay consistent:
 *   - tb_forwarder      frefrate 3700→3300 · ftotalprice = round2(fvolume×3300)
 *   - tb_forwarder_invoice_item.amount_thb = the same round2(fvolume×3300)
 *   - tb_forwarder_invoice(54) subtotal_thb = Σ(all 15 items' new amounts) ·
 *     total_thb = subtotal + delivery_th_thb + mao_fee_thb
 * Only the 14 GZS260618-1 items are re-priced; item 52079 (other container, ฿300)
 * is left unchanged. GUARD: aborts unless invoice 54 is issued+unpaid.
 *
 *   node --env-file=.env.local scripts/reprice-pr002-gzs260618-2026-07-07.mjs         # dry-run + backup
 *   node --env-file=.env.local scripts/reprice-pr002-gzs260618-2026-07-07.mjs --apply  # write
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const INVOICE_ID = 54;
const CABINET = "GZS260618-1";
const NEW_RATE = 3300;
const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const { data: inv } = await sb.from("tb_forwarder_invoice")
    .select("id,doc_no,status,subtotal_thb,total_thb,delivery_th_thb,mao_fee_thb,slip_status,cancelled_at,userid")
    .eq("id", INVOICE_ID).maybeSingle();
  if (!inv) { console.error("invoice 54 not found"); process.exit(1); }
  if (inv.status !== "issued" || inv.slip_status || inv.cancelled_at) {
    console.error(`ABORT: invoice ${INVOICE_ID} is not issued+unpaid (status=${inv.status} slip=${inv.slip_status} cancelled=${inv.cancelled_at}) — do NOT auto-correct a paid/cancelled bill.`);
    process.exit(1);
  }

  const { data: items } = await sb.from("tb_forwarder_invoice_item")
    .select("id,forwarder_id,amount_thb").eq("invoice_id", INVOICE_ID);
  const { data: fwds } = await sb.from("tb_forwarder")
    .select("id,userid,frefrate,frefprice,fvolume,ftotalprice,ftransporttype,fproductstype,fwarehousechina,customrate,fstatus,fcabinetnumber")
    .in("id", (items ?? []).map((i) => i.forwarder_id));
  const fMap = new Map((fwds ?? []).map((f) => [f.id, f]));

  const bk = process.env.TEMP ? `${process.env.TEMP}/reprice-pr002-backup-2026-07-07.json` : "/tmp/reprice-pr002-backup.json";
  writeFileSync(bk, JSON.stringify({ inv, items, fwds }, null, 2));
  console.log(`backup: ${bk}`);

  // Plan: only the CABINET's forwarders on the stale 3700/CBM/sea/ทั่วไป/กวางโจว tuple.
  const fwdUpdates = [], itemUpdates = [];
  let newSubtotal = 0;
  console.log("\n=== PLAN ===");
  for (const it of items ?? []) {
    const f = fMap.get(it.forwarder_id);
    const eligible = f && String(f.fcabinetnumber) === CABINET && Number(f.frefrate) === 3700
      && String(f.frefprice) === "2" && String(f.ftransporttype) === "2"
      && String(f.fproductstype) === "1" && String(f.fwarehousechina) === "1"
      && String(f.customrate) !== "1";
    if (eligible) {
      const newAmt = round2(Number(f.fvolume) * NEW_RATE);
      newSubtotal = round2(newSubtotal + newAmt);
      fwdUpdates.push({ id: f.id, newTotal: newAmt });
      itemUpdates.push({ id: it.id, newAmt });
      console.log(`  fwd ${f.id} / item ${it.id}: ${it.amount_thb} → ${newAmt}  (vol ${f.fvolume} × ${NEW_RATE})`);
    } else {
      newSubtotal = round2(newSubtotal + Number(it.amount_thb));
      console.log(`  fwd ${it.forwarder_id} / item ${it.id}: ${it.amount_thb} (unchanged${f ? "" : " · no fwd"})`);
    }
  }
  const newTotal = round2(newSubtotal + Number(inv.delivery_th_thb ?? 0) + Number(inv.mao_fee_thb ?? 0));
  console.log(`\n  invoice 54 subtotal ${inv.subtotal_thb} → ${newSubtotal}`);
  console.log(`  invoice 54 total    ${inv.total_thb} → ${newTotal}  (+delivery ${inv.delivery_th_thb} +mao ${inv.mao_fee_thb})`);
  console.log(`  re-price ${fwdUpdates.length} forwarders + ${itemUpdates.length} items`);

  if (!APPLY) { console.log("\nDRY-RUN — pass --apply to write."); return; }

  console.log("\n=== APPLYING ===");
  for (const u of fwdUpdates) {
    const { error } = await sb.from("tb_forwarder")
      .update({ frefrate: NEW_RATE, ftotalprice: u.newTotal })
      .eq("id", u.id).eq("frefrate", 3700).neq("customrate", "1");
    console.log(`  fwd ${u.id}: ${error ? "ERR " + error.message : "ok " + u.newTotal}`);
  }
  for (const u of itemUpdates) {
    const { error } = await sb.from("tb_forwarder_invoice_item")
      .update({ amount_thb: u.newAmt }).eq("id", u.id);
    console.log(`  item ${u.id}: ${error ? "ERR " + error.message : "ok " + u.newAmt}`);
  }
  const { error: hErr } = await sb.from("tb_forwarder_invoice")
    .update({ subtotal_thb: newSubtotal, total_thb: newTotal })
    .eq("id", INVOICE_ID).eq("status", "issued").is("slip_status", null);
  console.log(`  invoice 54 header: ${hErr ? "ERR " + hErr.message : "ok subtotal=" + newSubtotal + " total=" + newTotal}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
