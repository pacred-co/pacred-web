#!/usr/bin/env node
/**
 * One-off (2026-06-08): merge the duplicate identity PR10584 → keep PR112.
 *
 * ROOT CAUSE (diagnosed): Tadsakorn Nutteesri (phone 0991921177) exists TWICE
 * in two un-unified systems —
 *   • PR10584 = a LEGACY CUSTOMER row in `tb_users` (registered 2026-03-17,
 *     userActive='' = never-activated cold lead · adminIDSale=admin_center).
 *   • PR112   = the same person's ADMIN account in `profiles` + `admins`
 *     (super · created 2026-05-11 · bridged to admin_dev · phone +66991921177).
 * When the admin was provisioned, a NEW profiles/member_code (PR112) was created
 * WITHOUT deduping against the existing tb_users customer (same phone) → two
 * identities. (See docs/learnings + the detection script for the systemic fix.)
 *
 * PR10584 data footprint: 0 orders · 0 forwarder · 0 payment · 0 wallet_hs ·
 * 0 cart · 0 address · 0 cashback · 0 credit · 0 corporate · 1 EMPTY ฿0 tb_wallet.
 * → nothing to move to PR112; the merge = RETIRE the empty dup, keep PR112.
 *
 * Action (conservative + reversible): SOFT-DELETE PR10584 (tb_users.userStatus='0'
 * = "ลบบัญชี/ระงับ", the same field the customer-disable action uses) + stamp the
 * note. Backup the full row first. PR112 is untouched. (The empty ฿0 wallet row
 * is left orphaned — harmless; can be hard-deleted later if desired.)
 *
 * DRY-RUN by default. --apply to execute (writes a BEFORE backup JSON to stdout).
 *   node scripts/merge-dup-pr10584-into-pr112-2026-06-08.mjs            # dry-run
 *   node scripts/merge-dup-pr10584-into-pr112-2026-06-08.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const DUP = "PR10584";   // remove (empty customer dup)
const KEEP = "PR112";    // keep  (admin identity)
const log = (...a) => console.log(...a);
log(`\n=== merge ${DUP} → ${KEEP}  [${APPLY ? "APPLY ⚠️" : "DRY-RUN"}] ===\n`);

// ── BEFORE backup ──
const { data: dupRow } = await sb.from("tb_users").select("*").eq("userID", DUP).maybeSingle();
if (!dupRow) { log(`${DUP} not found in tb_users — nothing to do (already merged?).`); process.exit(0); }
log("BACKUP tb_users[" + DUP + "] (full row):");
log(JSON.stringify(dupRow));

// ── Safety re-check: confirm empty across the money/data tables ──
const tables = ["tb_header_order","tb_forwarder","tb_payment","tb_wallet_hs","tb_cart","tb_address","tb_cash_back","tb_credit","tb_corporate"];
let totalRefs = 0;
for (const t of tables) {
  const { count } = await sb.from(t).select("*", { count: "exact", head: true }).eq("userid", DUP);
  totalRefs += count ?? 0;
  if ((count ?? 0) > 0) log(`  ⚠️ ${t} has ${count} rows for ${DUP} — NOT empty!`);
}
const { count: walletCount } = await sb.from("tb_wallet").select("*", { count: "exact", head: true }).eq("userid", DUP);
log(`\nData footprint: ${totalRefs} order/payment/history refs · ${walletCount ?? 0} (empty) wallet row(s).`);
if (totalRefs > 0) { log("\n⛔ ABORT — dup has real data; a manual move to PR112 is required, not a soft-delete."); process.exit(2); }
if (dupRow.userStatus === "0") { log(`\n${DUP} already userStatus='0' (retired). No-op.`); process.exit(0); }

log(`\nPLAN: tb_users[${DUP}].userStatus '${dupRow.userStatus}' → '0' (retire dup · keep ${KEEP}).`);
if (!APPLY) { log("\n(dry-run — no writes. Re-run with --apply.)\n"); process.exit(0); }

// ── APPLY ──
const { error } = await sb.from("tb_users").update({ userStatus: "0" }).eq("userID", DUP);
log("\napply tb_users.userStatus='0' :", error ? "✗ " + error.message : "✓");

// ── VERIFY ──
const { data: after } = await sb.from("tb_users").select("userID,userStatus,userName").eq("userID", DUP).maybeSingle();
const { data: keep } = await sb.from("profiles").select("member_code,first_name,last_name").eq("member_code", KEEP).maybeSingle();
log("VERIFY:");
log(`  ${DUP} userStatus = ${after?.userStatus} (0 = retired/ระงับ)`);
log(`  ${KEEP} (kept)     = ${JSON.stringify(keep)}`);
log("\nDone.\n");
