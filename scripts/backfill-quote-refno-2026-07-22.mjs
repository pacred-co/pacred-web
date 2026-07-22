/**
 * Backfill customer_quotations.ref_no → QT-{userid}-{YYYYMMDD}-{NN} (owner 2026-07-22).
 *
 * The old refs (`QT-PR2000-20260722` · `QT2607-00001` · …) had NO running counter →
 * same customer + same day collided. This renumbers EVERY existing quotation to the
 * new running pattern, ordered by id (=chronological) within each (customer, date)
 * group: …-01, …-02, …. Updates BOTH `ref_no` AND `payload.refNo` so the stored doc
 * (public /q/[token]) shows the same number. /q links are keyed by id (HMAC token),
 * so they keep working — only the displayed number changes.
 *
 * Date per row = the 8-digit date embedded in the old ref if present, else the
 * Bangkok (UTC+7) date of created_at.
 *
 * DRY-RUN by default. Run `--apply` to write (backs up id/oldRef/payload first).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
console.log("target:", url, "· mode:", APPLY ? "APPLY" : "DRY-RUN", "\n");

const { data: rows, error } = await admin
  .from("customer_quotations")
  .select("id, userid, ref_no, payload, created_at")
  .order("id", { ascending: true })
  .limit(5000);
if (error) { console.log("READ ERR:", error.message); process.exit(1); }

function bkkYmd(iso) {
  const b = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  return `${b.getUTCFullYear()}${String(b.getUTCMonth() + 1).padStart(2, "0")}${String(b.getUTCDate()).padStart(2, "0")}`;
}
function refDate(ref, createdAt) {
  const m = /^QT-[^-]+-(\d{8})(?:-|$)/.exec(String(ref || ""));
  return m ? m[1] : bkkYmd(createdAt);
}

const seqByGroup = new Map();
const plan = [];
for (const r of rows) {
  const uid = String(r.userid || "").toUpperCase();
  const ymd = refDate(r.ref_no, r.created_at);
  const gkey = `${uid}|${ymd}`;
  const n = (seqByGroup.get(gkey) ?? 0) + 1;
  seqByGroup.set(gkey, n);
  plan.push({ id: r.id, uid, oldRef: r.ref_no, newRef: `QT-${uid}-${ymd}-${String(n).padStart(2, "0")}`, payload: r.payload });
}

console.log("total rows:", plan.length);
const seen = new Set(); let dup = 0;
for (const p of plan) { if (seen.has(p.newRef)) { dup++; console.log("  ⚠ COLLISION:", p.newRef); } seen.add(p.newRef); }
console.log("new-ref collisions:", dup, "(must be 0)");
const maxSeq = Math.max(...[...seqByGroup.values()]);
console.log("max quotes in one (customer,day):", maxSeq);

console.log("\nsample old → new (first 6):");
plan.slice(0, 6).forEach((p) => console.log(`  #${p.id}  ${p.oldRef}  →  ${p.newRef}`));
console.log("PR2000:");
plan.filter((p) => p.uid === "PR2000").forEach((p) => console.log(`  #${p.id}  ${p.oldRef}  →  ${p.newRef}`));
console.log("PR137 (had 5 same-day):");
plan.filter((p) => p.uid === "PR137").forEach((p) => console.log(`  #${p.id}  ${p.oldRef}  →  ${p.newRef}`));

if (dup > 0) { console.log("\nABORT — collisions present."); process.exit(1); }
if (!APPLY) { console.log("\nDRY-RUN done. add --apply to write."); process.exit(0); }

const backup = `scripts/_backup-quote-refno-${Date.now()}.json`;
writeFileSync(backup, JSON.stringify(plan.map((p) => ({ id: p.id, oldRef: p.oldRef, payload: p.payload })), null, 2));
console.log("\nbackup written:", backup);

let done = 0, fail = 0;
for (const p of plan) {
  const upd = { ref_no: p.newRef };
  if (p.payload && typeof p.payload === "object") upd.payload = { ...p.payload, refNo: p.newRef };
  const { error: e } = await admin.from("customer_quotations").update(upd).eq("id", p.id);
  if (e) { fail++; console.log(`  FAIL #${p.id}: ${e.message}`); } else done++;
}
console.log(`\napplied: ${done}/${plan.length} · failed: ${fail}`);
