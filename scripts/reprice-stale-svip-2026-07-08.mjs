/**
 * SYSTEMIC stale-rate backfill (owner 2026-07-08 "เป็นบัคเหมือน PR002 · ทำยังไม่หายอีก").
 * A customer's SVIP card (tb_rate_custom_kg/cbm) added AFTER their forwarders were
 * priced leaves the forwarders on the stale GENERAL rate (e.g. PR130 #52117 road
 * 5700 vs SVIP 5300 · PR002 3700 vs 3300). re-price-on-card-save fixes FUTURE saves;
 * this one-time pass fixes the EXISTING un-collected population.
 *
 * For each UN-COLLECTED forwarder (fstatus IN 4/5 · paydeposit<>1 · customrate<>1)
 * whose customer has an SVIP card for its (transport × warehouse × product) tuple,
 * if the stored frefrate != the SVIP rate → re-price to the SVIP rate:
 *   frefrate = svipRate · ftotalprice = max(round2(measure × svipRate), 50)  [฿50 floor]
 *     measure = fvolume (CBM · frefprice='2')  or  fweight (KG · frefprice='1')
 * Then recompute every UNPAID bill (tb_forwarder_invoice status='issued', slip_status
 * null) that references a re-priced forwarder: item.amount_thb = the new ftotalprice,
 * header subtotal/total re-summed (delivery + mao preserved).
 *
 * DRY-RUN by default (prints scope + every change + flags any INCREASE). --apply writes.
 * Backs up all affected forwarders + bills first. Guarded WHERE + idempotent.
 *
 *   node --env-file=.env.local scripts/reprice-stale-svip-2026-07-08.mjs           # dry-run + backup + scope
 *   node --env-file=.env.local scripts/reprice-stale-svip-2026-07-08.mjs --apply    # write
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const FLOOR = 50;
const round2 = (n) => Math.round(n * 100) / 100;

async function pageAll(table, cols, applyFilter) {
  const out = []; let from = 0; const size = 1000;
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + size - 1);
    q = applyFilter(q);
    const { data, error } = await q;
    if (error) { console.error(`read ${table} failed`, error.message); process.exit(1); }
    out.push(...(data || []));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

async function main() {
  // 1. un-collected forwarders (fstatus 4/5 · not paid · not manual)
  const fwds = await pageAll("tb_forwarder",
    "id,userid,frefrate,frefprice,ftransporttype,fproductstype,fwarehousechina,customrate,fstatus,paydeposit,fvolume,fweight,ftotalprice,fcabinetnumber",
    (q) => q.in("fstatus", ["4", "5"]).neq("customrate", "1"));
  const openFwds = fwds.filter((f) => String(f.paydeposit) !== "1");
  console.log(`un-collected forwarders (fstatus 4/5 · not paid · not manual): ${openFwds.length}`);

  // 2. SVIP cards for the involved customers
  const userids = Array.from(new Set(openFwds.map((f) => f.userid).filter(Boolean)));
  const svipCbm = new Map(), svipKg = new Map();
  for (let i = 0; i < userids.length; i += 200) {
    const chunk = userids.slice(i, i + 200);
    const c = await sb.from("tb_rate_custom_cbm").select("userid,rtransporttype,sourcewarehouse,rproductstype,rcbm").in("userid", chunk);
    for (const r of c.data || []) svipCbm.set(`${r.userid}|${r.rtransporttype}|${r.sourcewarehouse}|${r.rproductstype}`, Number(r.rcbm));
    const k = await sb.from("tb_rate_custom_kg").select("userid,rtransporttype,sourcewarehouse,rproductstype,rkg").in("userid", chunk);
    for (const r of k.data || []) svipKg.set(`${r.userid}|${r.rtransporttype}|${r.sourcewarehouse}|${r.rproductstype}`, Number(r.rkg));
  }

  // 3. find stale
  const stale = []; let increases = 0;
  for (const f of openFwds) {
    const kgBasis = String(f.frefprice) === "1";
    const map = kgBasis ? svipKg : svipCbm;
    const svip = map.get(`${f.userid}|${f.ftransporttype}|${f.fwarehousechina}|${f.fproductstype}`);
    if (svip == null || svip <= 0) continue;               // no SVIP card for tuple
    if (Number(f.frefrate) === svip) continue;              // already correct
    const measure = kgBasis ? Number(f.fweight) : Number(f.fvolume);
    const newTotal = Math.max(round2(measure * svip), FLOOR);
    if (svip > Number(f.frefrate)) increases++;
    stale.push({ id: f.id, userid: f.userid, oldRate: Number(f.frefrate), newRate: svip, basis: f.frefprice, oldTotal: Number(f.ftotalprice), newTotal, up: svip > Number(f.frefrate) });
  }
  console.log(`STALE (SVIP != stored): ${stale.length}  (of which rate INCREASES: ${increases})`);
  for (const s of stale.slice(0, 40)) console.log(`  #${s.id} ${s.userid}: ${s.oldRate}→${s.newRate} ${s.up ? "⬆" : "⬇"} · total ${s.oldTotal}→${s.newTotal}`);
  if (stale.length > 40) console.log(`  … +${stale.length - 40} more`);

  // 4. which unpaid bills are affected
  const staleIds = new Set(stale.map((s) => s.id));
  const items = await pageAll("tb_forwarder_invoice_item", "id,invoice_id,forwarder_id,amount_thb",
    (q) => q.in("forwarder_id", Array.from(staleIds).slice(0, 1000)));
  const affectedInvIds = Array.from(new Set(items.filter((it) => staleIds.has(it.forwarder_id)).map((it) => it.invoice_id)));
  const invs = affectedInvIds.length ? (await sb.from("tb_forwarder_invoice").select("id,doc_no,status,subtotal_thb,total_thb,delivery_th_thb,mao_fee_thb,slip_status,cancelled_at").in("id", affectedInvIds)).data || [] : [];
  const unpaidInvs = invs.filter((v) => v.status === "issued" && !v.slip_status && !v.cancelled_at);
  console.log(`affected bills: ${invs.length} · UNPAID (correctable): ${unpaidInvs.length}  [${unpaidInvs.map((v) => v.doc_no).join(", ")}]`);
  const paidLocked = invs.filter((v) => !(v.status === "issued" && !v.slip_status && !v.cancelled_at));
  if (paidLocked.length) console.log(`  ⚠️ ${paidLocked.length} affected bills are PAID/cancelled → their forwarders will re-price but the bill is FROZEN (owner: these are "จบไปแล้ว")`);

  writeFileSync((process.env.TEMP || "/tmp") + "/reprice-stale-svip-backup-2026-07-08.json", JSON.stringify({ stale, invs, items }, null, 2));

  if (!APPLY) { console.log("\nDRY-RUN — pass --apply to write. Review scope + increases above first."); return; }

  console.log("\n=== APPLYING forwarder re-price ===");
  let ok = 0;
  for (const s of stale) {
    const { error } = await sb.from("tb_forwarder").update({ frefrate: s.newRate, ftotalprice: s.newTotal }).eq("id", s.id).eq("frefrate", s.oldRate).neq("customrate", "1");
    if (error) console.error(`  #${s.id} ERR ${error.message}`); else ok++;
  }
  console.log(`forwarders re-priced: ${ok}/${stale.length}`);

  console.log("=== recompute UNPAID bills ===");
  for (const v of unpaidInvs) {
    const its = items.filter((it) => it.invoice_id === v.id);
    let sub = 0;
    for (const it of its) {
      const s = stale.find((x) => x.id === it.forwarder_id);
      const amt = s ? s.newTotal : Number(it.amount_thb);
      sub = round2(sub + amt);
      if (s) await sb.from("tb_forwarder_invoice_item").update({ amount_thb: s.newTotal }).eq("id", it.id);
    }
    const tot = round2(sub + Number(v.delivery_th_thb ?? 0) + Number(v.mao_fee_thb ?? 0));
    await sb.from("tb_forwarder_invoice").update({ subtotal_thb: sub, total_thb: tot }).eq("id", v.id).eq("status", "issued").is("slip_status", null);
    console.log(`  ${v.doc_no}: subtotal ${v.subtotal_thb}→${sub} · total ${v.total_thb}→${tot}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
