/**
 * DRY-RUN-ONLY freight service/incoterm re-tag (task #13 · owner 2026-07-01 "งาน CIF").
 *
 * THE GAP (verified against prod 2026-07-01):
 *   The June freight import (scripts/import-freight-shipments-2026-07-01.mjs) wrote the
 *   incoterm value (CIF/FOB/EXW/DDP) into freight_shipments.payment_term — the WRONG column.
 *   freight_shipments.incoterm is 100% EMPTY (139/139), so:
 *     · the shipment detail page shows the value under "Payment:" instead of "Incoterm:"
 *       (app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx L544-545), and
 *     · the rate engine (lib/freight/rate-model.ts INCOTERM_SCOPE · incursChinaFreightCost)
 *       reads `incoterm`, so a CIF/FOB job's scope can't be derived.
 *   payment_term's real meaning is the PAYMENT METHOD (free text, placeholder "T/T" in the
 *   manual create form L125) — a DIFFERENT field. Incoterm has its own enum dropdown.
 *
 * THE FIX (clean + safe · this script ONLY proposes it):
 *   For rows where incoterm is empty AND payment_term holds a VALID INCOTERM token
 *   (allowlist = the 11 INCOTERMS enum values), move payment_term → incoterm and clear
 *   payment_term. Rows whose payment_term is a genuine payment method (e.g. "T/T") are
 *   left untouched (not in the allowlist).
 *
 *   DRY-RUN: node --env-file=.env.local scripts/fix-freight-service-mapping-2026-07-01.mjs
 *   APPLY:   node ... --apply   ← do NOT run without owner/lead review (this edits prod data)
 *
 * ⚠️ MONEY-ADJACENT only in that incoterm drives the rate engine's SCOPE — but this script
 *    writes NO money column (no selling/cost/declared). It only relabels the incoterm field.
 */
import pg from "pg";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const P = process.env.SUPABASE_DB_PASSWORD, REF = "yzljakczhwrpbxflnmco";

// the 11 INCOTERMS (mirror lib/validators/freight-shipment.ts INCOTERMS) — the ONLY
// payment_term values we treat as a misplaced incoterm. Anything else (T/T, free text) stays.
const INCOTERMS = new Set(["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"]);

async function connect() {
  for (const h of ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"]) {
    try {
      const c = new Client({
        connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(P)}@${h}:5432/postgres`,
        ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
      });
      await c.connect();
      return c;
    } catch { /* try next host */ }
  }
  return null;
}

async function main() {
  const c = await connect();
  if (!c) { console.error("no DB"); process.exit(1); }

  // candidates: incoterm empty + payment_term is a known INCOTERM token (case-insensitive).
  const { rows } = await c.query(
    `select id, job_no, transport_mode, service_key, direction,
            nullif(trim(incoterm),'')     as incoterm,
            nullif(trim(payment_term),'') as payment_term
       from freight_shipments
      where nullif(trim(incoterm),'') is null
        and nullif(trim(payment_term),'') is not null`
  );

  const plan = [], skip = [];
  for (const r of rows) {
    const token = (r.payment_term || "").toUpperCase();
    if (INCOTERMS.has(token)) plan.push({ id: r.id, job_no: r.job_no, from: r.payment_term, to: token });
    else skip.push({ id: r.id, job_no: r.job_no, payment_term: r.payment_term, why: "ไม่ใช่ incoterm (ปล่อยไว้)" });
  }

  console.log(`\n=== FREIGHT incoterm RE-TAG (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`  candidate rows (incoterm empty · payment_term set): ${rows.length}`);
  console.log(`  PLAN move payment_term→incoterm: ${plan.length}`);
  const dist = {}; for (const p of plan) dist[p.to] = (dist[p.to] || 0) + 1;
  console.log(`  by incoterm: ${JSON.stringify(dist)}`);
  console.log(`  SKIP (genuine payment_term · left as-is): ${skip.length}`);
  if (skip.length) skip.slice(0, 10).forEach(s => console.log(`    · ${s.job_no} payment_term="${s.payment_term}"`));

  if (!APPLY) { console.log("\n(DRY-RUN · nothing written)"); await c.end(); return; }

  let upd = 0;
  for (const p of plan) {
    // move into incoterm, clear payment_term (it held the incoterm, not a payment method).
    const { error } = await c.query(
      `update freight_shipments set incoterm=$1, payment_term=null where id=$2 and nullif(trim(incoterm),'') is null`,
      [p.to, p.id]
    );
    if (error) { console.log(`  ✗ ${p.job_no}: ${error.message.slice(0, 60)}`); continue; }
    upd++;
  }
  console.log(`\nAPPLIED: updated ${upd}`);
  await c.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
