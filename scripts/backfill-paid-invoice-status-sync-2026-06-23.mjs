/**
 * One-time backfill: sync ใบเสร็จ + forwarder status for invoices ALREADY marked
 * paid BEFORE the markBillingRunPaid 3-link sync fix shipped (80ce9a1e / 359ae574).
 *
 * The forward-fix only fires on the issued→paid transition, so invoices paid before
 * it deployed left their receipt at rstatus='3' (รอชำระ) and their forwarder at
 * fstatus='5' (รอชำระเงิน) even though the bill says รับชำระแล้ว. This clears that
 * backlog once.
 *
 * SAFE: status-only (no money moves). Forwarder flips ONLY 5→6 (guard .eq('5')) for
 * forwarders that sit on a PAID invoice. Receipt flips ONLY 3→1 for receipts whose
 * forwarders are FULLY covered by paid invoices. DRY-RUN by default.
 *
 *   node --env-file=.env.local scripts/backfill-paid-invoice-status-sync-2026-06-23.mjs           # DRY-RUN (DEV)
 *   node --env-file=.env.local scripts/backfill-paid-invoice-status-sync-2026-06-23.mjs --apply    # WRITE
 *   (เดฟ: same with the PROD env-file)
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const isDev = url.includes("lozntlidl");
console.log(`DB: ${isDev ? "DEV" : url} · mode: ${APPLY ? "🔴 APPLY (writes)" : "DRY-RUN (read-only)"}`);

// 1. every PAID invoice → the set of forwarder ids it covers
const { data: paidInv, error: e1 } = await sb.from("tb_forwarder_invoice").select("id, doc_no").eq("status", "paid");
if (e1) { console.error("paid-invoice read err:", e1.message); process.exit(1); }
const paidInvIds = (paidInv ?? []).map((r) => r.id);
console.log(`\npaid invoices: ${paidInvIds.length}`);

const invFidSet = new Set();
for (let i = 0; i < paidInvIds.length; i += 200) {
  const { data: items, error } = await sb
    .from("tb_forwarder_invoice_item").select("forwarder_id").in("invoice_id", paidInvIds.slice(i, i + 200));
  if (error) { console.error("invoice_item read err:", error.message); process.exit(1); }
  for (const it of items ?? []) invFidSet.add(it.forwarder_id);
}
const invFids = [...invFidSet];
console.log(`forwarders on paid invoices: ${invFids.length}`);

// 2. forwarders stuck at fstatus='5' though their bill is paid → flip 6
const stuckFwd = [];
for (let i = 0; i < invFids.length; i += 200) {
  const { data, error } = await sb.from("tb_forwarder").select("id").in("id", invFids.slice(i, i + 200)).eq("fstatus", "5");
  if (error) { console.error("forwarder read err:", error.message); process.exit(1); }
  for (const f of data ?? []) stuckFwd.push(f.id);
}
console.log(`\n🚚 forwarders stuck at 5 (bill paid) → will flip to 6: ${stuckFwd.length}`);
if (stuckFwd.length) console.log("   " + stuckFwd.slice(0, 40).join(", ") + (stuckFwd.length > 40 ? " …" : ""));

// 3. receipts stuck at rstatus='3' whose forwarders are FULLY on paid invoices → flip 1
const { data: pendRcpt, error: e3 } = await sb.from("tb_receipt").select("rid").eq("rstatus", "3");
if (e3) { console.error("receipt read err:", e3.message); process.exit(1); }
const stuckRids = [];
for (const r of pendRcpt ?? []) {
  const { data: ritems, error } = await sb.from("tb_receipt_item").select("fid").eq("rid", r.rid);
  if (error) { console.error("receipt_item read err:", error.message); continue; }
  const fids = (ritems ?? []).map((x) => x.fid);
  if (fids.length > 0 && fids.every((f) => invFidSet.has(f))) stuckRids.push(r.rid);
}
console.log(`\n🧾 receipts stuck at 3 (fully on paid bills) → will flip to 1: ${stuckRids.length}`);
if (stuckRids.length) console.log("   " + stuckRids.slice(0, 40).join(", ") + (stuckRids.length > 40 ? " …" : ""));

if (!APPLY) {
  console.log("\n✅ DRY-RUN — nothing written. Re-run with --apply to flip the rows above.");
  process.exit(0);
}

// ── APPLY ──
const nowIso = new Date().toISOString();
let fwdOk = 0;
for (let i = 0; i < stuckFwd.length; i += 200) {
  const chunk = stuckFwd.slice(i, i + 200);
  const { error } = await sb.from("tb_forwarder")
    .update({ fstatus: "6", fdatestatus6: nowIso, fdateadminstatus: nowIso }).in("id", chunk).eq("fstatus", "5");
  if (error) console.error("fwd update err:", error.message); else fwdOk += chunk.length;
}
let rcptOk = 0;
for (const rid of stuckRids) {
  const { error } = await sb.from("tb_receipt").update({ rstatus: "1" }).eq("rid", rid).eq("rstatus", "3");
  if (error) console.error("rcpt update err:", rid, error.message); else rcptOk++;
}
console.log(`\n🔴 APPLIED — forwarders 5→6: ${fwdOk} · receipts 3→1: ${rcptOk}`);
