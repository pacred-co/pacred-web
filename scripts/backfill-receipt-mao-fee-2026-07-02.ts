#!/usr/bin/env node
/**
 * scripts/backfill-receipt-mao-fee-2026-07-02.ts
 *
 * ── WHAT THIS FIXES ───────────────────────────────────────────────────
 * Before the Lane C fix (commit 405ed2eb · actions/admin/forwarder-invoice.ts
 * :: adminIssueForwarderInvoice), the MANUAL "ออกใบเสร็จ" path computed the
 * receipt total from the base outstanding buckets ONLY (perRowRaw =
 * calcForwarderOutstanding) and INSERTed with `mao_fee_thb` OMITTED (→ 0). So
 * receipts issued that way are frozen ~฿100 SHORT of their matching ใบวางบิล
 * (tb_forwarder_invoice, which DOES carry mao_fee_thb · mig 0209) AND drop the
 * "ค่าส่งเหมาๆ" line on the receipt paper (it renders only when maoFee > 0 —
 * components/receipt/receipt-paper.tsx:504).
 *
 * Owner AUTHORIZED correcting the ISSUED receipts (customers need correct docs).
 * Confirmed case: invoice QT-12062026-005 · มอเตอร์ 187kg · เหมาๆ 100 · ยอดสุทธิ
 * 2,157 — but its receipt is short.
 *
 * ── HOW A RECEIPT LINKS TO ITS FORWARDERS + ITS INVOICE ───────────────
 *   tb_receipt.rid  (varchar)  ──1:N──▶  tb_receipt_item.rid  →  .fid  →  tb_forwarder.id
 *   tb_forwarder_invoice.id     ──1:N──▶  tb_forwarder_invoice_item.invoice_id → .forwarder_id → tb_forwarder.id
 *
 * There is NO direct FK between a receipt and an invoice. The link is the
 * SHARED FORWARDER-SET (the set of tb_forwarder.id a receipt covers vs the set
 * an invoice covers). We match a receipt to an invoice when the receipt's
 * fid-set ⊆ the invoice's forwarder_id-set for the SAME userid (the invoice can
 * consolidate more rows than one receipt covers; a receipt never covers a fid
 * the invoice doesn't). If exactly one invoice contains the whole fid-set → that
 * invoice's mao_fee_thb is the authoritative fee (it is already correct — the
 * owner's screenshot proves it).
 *
 * ── FEE SOURCE (priority) ─────────────────────────────────────────────
 *   (a) PREFERRED — the matching tb_forwarder_invoice.mao_fee_thb (already correct).
 *   (b) FALLBACK  — recompute maoFee via the REAL computeForwarderDebitBatch()
 *       over the receipt's covered forwarders (the same once-per-shipment anchor
 *       engine the fixed issuance + auto-issue use), when no matching invoice.
 *
 * ── CORRECTION MATH (EXACTLY like the fixed adminIssueForwarderInvoice) ──
 *   newMaoFee                 = fee from (a)/(b)
 *   newTotalBeforeWithholding = round2(oldTotalBeforeWithholding + newMaoFee)
 *   corporate                 = receipt.corporatetype === '1' && !!receipt.recompnumber
 *                               (the SAME signal issuance stores + the render reads
 *                                — load-receipt-document.ts:279 — NOT guessed from
 *                                the amount diff)
 *   applyJuristic1Pct         = corporate && newTotalBeforeWithholding >= 1000
 *   newRamount                = applyJuristic1Pct
 *                                 ? round2(newTotalBeforeWithholding * 0.99)
 *                                 : newTotalBeforeWithholding
 *   (⚠️ WHT is re-applied ONLY when the receipt is juristic. A personal receipt
 *    keeps ramount == totalbeforewithholding.)
 *
 * ── ACCEPTANCE CHECK ──────────────────────────────────────────────────
 * After correction, the receipt total (ramount) must reconcile to the matching
 * invoice's total_thb to the satang. A row that does NOT reconcile is SKIPPED
 * and reported for human review — never blindly written. (Fallback-priced rows
 * with no matching invoice have nothing to reconcile against → they are applied
 * only when the recomputed base + maoFee also matches the receipt's OLD total
 * within tolerance, else SKIPPED.)
 *
 * ── SAFETY (AGENTS §11) ───────────────────────────────────────────────
 *   • DRY-RUN by default. `--apply` performs the UPDATEs.
 *   • Writes a timestamped JSON backup of every touched row BEFORE any write.
 *   • Idempotent — only rows still at mao_fee_thb 0/NULL are candidates; a
 *     re-run finds none. Never touches a receipt already carrying mao_fee_thb>0.
 *   • Touches ONLY mao_fee_thb, totalbeforewithholding, ramount. Never DELETEs.
 *   • Refuses to run if SUPABASE_DB_PASSWORD is unset. Never prints the password.
 *
 * ── RUN ───────────────────────────────────────────────────────────────
 * This is a .ts entry (NOT .mjs) on purpose: it imports the REAL TS helper
 * computeForwarderDebitBatch, and tsx transforms the entry + its .ts imports
 * uniformly (a .mjs entry importing a .ts module fails to resolve the named
 * export under Node's ESM loader). Run via tsx:
 *   SUPABASE_DB_PASSWORD='<pw>' npx tsx --env-file=.env.local \
 *     scripts/backfill-receipt-mao-fee-2026-07-02.ts            # dry-run
 *   SUPABASE_DB_PASSWORD='<pw>' npx tsx --env-file=.env.local \
 *     scripts/backfill-receipt-mao-fee-2026-07-02.ts --apply    # write
 *   (optional) --limit=50   cap candidates processed (smoke)
 * (.env.local is only for a stored SUPABASE_DB_PASSWORD; the password may also
 *  be supplied inline as above. The password is NEVER printed or hardcoded.)
 */

import pg from "pg";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
// The REAL once-per-shipment anchor engine (pure · no server-only) — same helper
// the fixed adminIssueForwarderInvoice + autoIssueReceiptOnPaymentLand use, so
// the fallback fee math can NEVER drift from issuance.
import { computeForwarderDebitBatch } from "../lib/forwarder/forwarder-debit-total";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 0; // 0 = no cap

// --reissue=RID (owner-authorized · 2026-07-02): for a specific base-DRIFTED receipt
// whose base changed after issuance (so "old total + fee" would NOT match the current
// invoice), RE-ISSUE it to the CURRENT engine recompute (recomputed base + เหมาๆ) so the
// receipt matches its current invoice exactly — instead of skipping it as does_not_reconcile.
// Owner chose this for FRC2606-00002 (มอเตอร์ · invoice base 2057 + เหมาๆ 100 = 2157).
const REISSUE_ARG = process.argv.find((a) => a.startsWith("--reissue="));
const REISSUE_RID = REISSUE_ARG ? REISSUE_ARG.split("=")[1] : null;

// A CONSTANT timestamp string for the backup filename (NOT Date.now()) — per the
// script spec: the backup name is stable across the dry-run → --apply pair.
const RUN_STAMP = "2026-07-02";
const BACKUP_PATH = resolve(process.cwd(), `scripts/backfill-receipt-mao-fee-${RUN_STAMP}-backup.json`);

const RECONCILE_TOLERANCE = 0.01; // satang

// ────────────────────────────────────────────────────────────
// Connect — house-standard prod pooler fallback chain (aws-1 first,
// aws-0 fallback, direct last · see scripts/apply-migration-generic.mjs).
// ────────────────────────────────────────────────────────────
const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set — refusing to run.");
  process.exit(1);
}
const POOLER_HOSTS = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const enc = encodeURIComponent(PASSWORD);
const ATTEMPTS = [
  ...POOLER_HOSTS.flatMap((h) => [
    [`session-pooler ${h}:5432`, `postgresql://${POOLER_USER}:${enc}@${h}:5432/postgres`],
    [`txn-pooler ${h}:6543`, `postgresql://${POOLER_USER}:${enc}@${h}:6543/postgres`],
  ]),
  [`direct 5432`, `postgresql://postgres:${enc}@${DIRECT_HOST}:5432/postgres`],
];
async function connect() {
  for (const [label, conn] of ATTEMPTS) {
    try {
      const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
      await c.connect();
      console.log(`✓ connected (${label})`);
      return c;
    } catch (e) {
      console.log(`  ✗ ${label}: ${e.code ?? "err"} ${e.message}`);
    }
  }
  throw new Error("could not connect to prod via any path");
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function toNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== receipt เหมาๆ backfill · ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"} ===\n`);
  const c = await connect();

  try {
    // 1. CANDIDATE RECEIPTS — mao_fee_thb IS NULL OR = 0, AND not cancelled.
    //    (rstatus '2' = cancelled — never touch a cancelled document.)
    const { rows: receipts } = await c.query(
      `SELECT id, rid, userid, corporatetype, recompnumber, rstatus,
              totalbeforewithholding, ramount, mao_fee_thb
         FROM tb_receipt
        WHERE (mao_fee_thb IS NULL OR mao_fee_thb = 0)
          AND rstatus <> '2'
        ORDER BY id`,
    );
    console.log(`candidate receipts (mao_fee 0/NULL · not cancelled): ${receipts.length}`);

    if (receipts.length === 0) {
      console.log("\nNothing to do — no receipts with a zero/NULL เหมาๆ fee.\n");
      return;
    }

    // 2. Pull the fid-set covered by each candidate receipt (tb_receipt_item.rid → .fid).
    const rids = receipts.map((r) => r.rid);
    const { rows: itemRows } = await c.query(
      `SELECT rid, fid FROM tb_receipt_item WHERE rid = ANY($1)`,
      [rids],
    );
    const fidsByRid = new Map(); // rid → number[]
    for (const it of itemRows) {
      if (!fidsByRid.has(it.rid)) fidsByRid.set(it.rid, []);
      fidsByRid.get(it.rid).push(Number(it.fid));
    }

    // 3. Pull the pricing inputs for every covered forwarder (for the FALLBACK
    //    fee recompute + the fallback acceptance check).
    const allFids = Array.from(new Set(itemRows.map((it) => Number(it.fid)).filter((n) => Number.isFinite(n))));
    const fwById = new Map(); // fid → row
    if (allFids.length > 0) {
      const { rows: fwRows } = await c.query(
        `SELECT id, userid, fshipby, ftrackingchn,
                ftotalprice, ftransportprice, fpriceupdate, fshippingservice,
                pricecrate, ftransportpricechnthb, priceother, fdiscount
           FROM tb_forwarder WHERE id = ANY($1)`,
        [allFids],
      );
      for (const r of fwRows) fwById.set(Number(r.id), r);
    }

    // 4. Pull ALL non-cancelled invoices for the involved customers + their
    //    forwarder-id sets, so we can match a receipt's fid-set to ONE invoice.
    const userids = Array.from(new Set(receipts.map((r) => r.userid)));
    const { rows: invRows } = await c.query(
      `SELECT id, userid, total_thb, mao_fee_thb, doc_no, status
         FROM tb_forwarder_invoice
        WHERE userid = ANY($1)
          AND status <> 'cancelled'`,
      [userids],
    );
    const invById = new Map(invRows.map((i) => [Number(i.id), i]));
    const { rows: invItemRows } = invRows.length
      ? await c.query(
          `SELECT invoice_id, forwarder_id FROM tb_forwarder_invoice_item
            WHERE invoice_id = ANY($1)`,
          [invRows.map((i) => Number(i.id))],
        )
      : { rows: [] };
    const invFidSet = new Map(); // invoice_id → Set<fid>
    for (const it of invItemRows) {
      const k = Number(it.invoice_id);
      if (!invFidSet.has(k)) invFidSet.set(k, new Set());
      invFidSet.get(k).add(Number(it.forwarder_id));
    }
    // index invoices by userid for the containment scan
    const invByUser = new Map();
    for (const i of invRows) {
      const k = i.userid;
      if (!invByUser.has(k)) invByUser.set(k, []);
      invByUser.get(k).push(Number(i.id));
    }

    // ── find the ONE invoice whose forwarder-set ⊇ this receipt's fid-set ──
    function matchInvoice(userid, fidSet) {
      const cand = invByUser.get(userid) ?? [];
      const hits = [];
      for (const invId of cand) {
        const set = invFidSet.get(invId);
        if (!set || set.size === 0) continue;
        const subset = fidSet.every((f) => set.has(f));
        if (subset) hits.push(invId);
      }
      // Prefer the tightest match (smallest superset) if several qualify.
      if (hits.length === 0) return null;
      if (hits.length === 1) return hits[0];
      hits.sort((a, b) => (invFidSet.get(a).size - invFidSet.get(b).size));
      // If the two tightest are the same size → genuinely ambiguous.
      if (invFidSet.get(hits[0]).size === invFidSet.get(hits[1]).size) return { ambiguous: hits };
      return hits[0];
    }

    // ────────────────────────────────────────────────────────────
    // 5. Build the correction plan.
    // ────────────────────────────────────────────────────────────
    const planned = [];   // rows we WILL write
    const skipped = [];    // {rid, reason, detail}
    let processed = 0;

    for (const r of receipts) {
      if (LIMIT && processed >= LIMIT) break;
      processed++;

      const fids = fidsByRid.get(r.rid) ?? [];
      if (fids.length === 0) {
        skipped.push({ rid: r.rid, reason: "no_receipt_items", detail: "receipt covers no fids — cannot determine เหมาๆ (run adminBackfillReceiptItems first)" });
        continue;
      }

      const oldTotalBefore = round2(toNumber(r.totalbeforewithholding));
      const oldRamount = round2(toNumber(r.ramount));
      const corporate = r.corporatetype === "1" && !!(r.recompnumber && String(r.recompnumber).trim());

      // ── fee source (a): matching invoice's mao_fee_thb ──
      const match = matchInvoice(r.userid, fids);
      let feeSource = null;
      let newMaoFee = null;
      let matchedInvoiceId = null;
      let matchedDocNo = null;
      let matchedInvoiceTotal = null;

      if (match && typeof match === "object" && match.ambiguous) {
        skipped.push({
          rid: r.rid,
          reason: "ambiguous_invoice_match",
          detail: `receipt fid-set ⊆ ${match.ambiguous.length} equally-tight invoices (${match.ambiguous.map((id) => invById.get(id)?.doc_no ?? id).join(", ")}) — human review`,
        });
        continue;
      }
      // (a) matched invoice with a STORED เหมาๆ > 0 = authoritative (already-correct doc).
      if (typeof match === "number") {
        const inv = invById.get(match);
        const invMao = round2(toNumber(inv.mao_fee_thb));
        matchedInvoiceId = match;
        matchedDocNo = inv.doc_no;
        matchedInvoiceTotal = round2(toNumber(inv.total_thb));
        if (invMao > 0) {
          newMaoFee = invMao;
          feeSource = "invoice";
        }
        // else: the matched invoice is ITSELF old-short (mao=0, pre-ภูม billing fix) —
        // do NOT trust its 0. Fall through to the fshipby-based engine (ground truth).
      }
      // (b) no invoice matched, OR the invoice was itself short → recompute the เหมาๆ
      //     from the covered forwarders' fshipby (PRF/PCSF ⇒ ฿100/shipment) via the REAL
      //     engine. This is the actual ground truth for whether a shipment incurs เหมาๆ.
      if (feeSource === null) {
        const rowsForCalc = fids
          .map((f) => fwById.get(f))
          .filter(Boolean)
          .map((fw) => ({
            id: fw.id, fshipby: fw.fshipby, ftrackingchn: fw.ftrackingchn,
            ftotalprice: fw.ftotalprice, ftransportprice: fw.ftransportprice,
            fpriceupdate: fw.fpriceupdate, fshippingservice: fw.fshippingservice,
            pricecrate: fw.pricecrate, ftransportpricechnthb: fw.ftransportpricechnthb,
            priceother: fw.priceother, fdiscount: fw.fdiscount,
          }));
        if (rowsForCalc.length !== fids.length) {
          skipped.push({ rid: r.rid, reason: "forwarder_rows_missing", detail: `${rowsForCalc.length}/${fids.length} covered forwarders still exist — cannot recompute` });
          continue;
        }
        const batch = computeForwarderDebitBatch(rowsForCalc, { userId: r.userid, isCorporate: corporate });
        newMaoFee = round2(batch.lines.reduce((s, l) => s + l.breakdown.maoFee, 0));
        feeSource = "recompute";
      }

      // Nothing to add? (a genuine ฿0 เหมาๆ order) → not a correction candidate.
      if (!newMaoFee || newMaoFee <= 0) {
        skipped.push({ rid: r.rid, reason: "no_mao_fee", detail: `computed เหมาๆ = ${newMaoFee ?? 0} (${feeSource}) — no correction needed` });
        continue;
      }

      // ── correction math — EXACTLY like the fixed adminIssueForwarderInvoice ──
      let newTotalBefore = round2(oldTotalBefore + newMaoFee);
      let applyJuristic1Pct = corporate && newTotalBefore >= 1000;
      let newRamount = applyJuristic1Pct
        ? round2(newTotalBefore * 0.99)
        : newTotalBefore;

      // ── ACCEPTANCE CHECK ──
      let reconciles = false;
      let acceptanceNote = "";
      if (feeSource === "invoice") {
        // invoice.total_thb is GROSS (pre-WHT); the receipt's GROSS is newTotalBefore.
        // Compare LIKE-FOR-LIKE gross↔gross — do NOT compare the receipt's NET ramount
        // (juristic = gross×0.99) to the gross invoice, or every juristic receipt ≥฿1000
        // wrongly fails to reconcile → gets skipped (the very class that needs the fix).
        // The written ramount stays NET for juristic (correct); only the CHECK is gross↔gross.
        // Because newTotalBefore == oldTotalBefore + newMaoFee, this IS also the "old base
        // + fee ≈ invoice" pairing guard (catches a coincidental fid-subset with a wrong fee).
        reconciles = Math.abs(newTotalBefore - matchedInvoiceTotal) <= RECONCILE_TOLERANCE;
        acceptanceNote = `newTotalBefore(gross) ${newTotalBefore} vs invoice ${matchedDocNo} total_thb(gross) ${matchedInvoiceTotal}`
          + (applyJuristic1Pct ? ` · receipt ramount(net) ${newRamount}` : "");
      } else {
        // No invoice to reconcile against → require the OLD stored base to match a
        // fresh recompute of the base (so we know the receipt hasn't drifted since
        // issuance), THEN the correction is oldBase + fee.
        const rowsForCalc = fids.map((f) => fwById.get(f)).filter(Boolean).map((fw) => ({
          id: fw.id, fshipby: fw.fshipby, ftrackingchn: fw.ftrackingchn,
          ftotalprice: fw.ftotalprice, ftransportprice: fw.ftransportprice,
          fpriceupdate: fw.fpriceupdate, fshippingservice: fw.fshippingservice,
          pricecrate: fw.pricecrate, ftransportpricechnthb: fw.ftransportpricechnthb,
          priceother: fw.priceother, fdiscount: fw.fdiscount,
        }));
        const batch = computeForwarderDebitBatch(rowsForCalc, { userId: r.userid, isCorporate: corporate });
        // batch.total_thb = base (incl per-row WHT for juristic) + maoFee, per the
        // engine. The receipt's OLD total_before was base-only, pre-WHT. Reconstruct
        // the expected OLD pre-WHT base and compare to the stored old total.
        const baseNoMao = round2(batch.lines.reduce((s, l) => {
          // undo the WHT the engine subtracts to get the pre-WHT base (matches how
          // the OLD issuance stored totalbeforewithholding = pre-WHT base sum)
          return s + (l.breakdown.freight + l.breakdown.otherCharges + l.breakdown.maoFee - l.breakdown.discount);
        }, 0)) - newMaoFee;
        reconciles = Math.abs(round2(baseNoMao) - oldTotalBefore) <= 1.0; // ±1 baht (base may have shifted slightly)
        acceptanceNote = `no invoice · recomputed base ${round2(baseNoMao)} vs stored old total ${oldTotalBefore}`;

        // ── owner-authorized RE-ISSUE (--reissue=RID) ──
        // For a base-DRIFTED receipt the owner chose to re-issue to match its current
        // invoice: use the CURRENT recomputed base (baseNoMao) + เหมาๆ as the new total
        // (NOT the stale stored total), and force-accept. This is a deliberate re-price
        // of ONE named receipt (FRC2606-00002 · มอเตอร์ · invoice 2057+100=2157), not the
        // blind +fee the base-drift guard correctly refuses for everyone else.
        if (REISSUE_RID && r.rid === REISSUE_RID) {
          const reissueTotal = round2(round2(baseNoMao) + newMaoFee);
          applyJuristic1Pct = corporate && reissueTotal >= 1000;
          newTotalBefore = reissueTotal;
          newRamount = applyJuristic1Pct ? round2(reissueTotal * 0.99) : reissueTotal;
          reconciles = true;
          acceptanceNote =
            `RE-ISSUE (owner) · base ${round2(baseNoMao)} + เหมาๆ ${newMaoFee} = gross ${reissueTotal}` +
            (applyJuristic1Pct ? ` · net ${newRamount} (นิติ −1%)` : "");
        }
      }

      const row = {
        rid: r.rid,
        receiptId: r.id,
        userid: r.userid,
        corporate,
        applyJuristic1Pct,
        feeSource,
        matchedDocNo,
        fids,
        oldMaoFee: r.mao_fee_thb === null ? null : round2(toNumber(r.mao_fee_thb)),
        oldTotalBefore,
        oldRamount,
        newMaoFee,
        newTotalBefore,
        newRamount,
        reconciles,
        acceptanceNote,
      };

      if (!reconciles) {
        skipped.push({ rid: r.rid, reason: "does_not_reconcile", detail: acceptanceNote });
        continue;
      }
      planned.push(row);
    }

    // ────────────────────────────────────────────────────────────
    // 6. Report.
    // ────────────────────────────────────────────────────────────
    const sumFee = round2(planned.reduce((s, p) => s + p.newMaoFee, 0));
    console.log(`\n── PLAN ──`);
    console.log(`  processed:   ${processed}`);
    console.log(`  to correct:  ${planned.length}   (Σ เหมาๆ added ฿${sumFee.toLocaleString("th-TH", { minimumFractionDigits: 2 })})`);
    console.log(`  skipped:     ${skipped.length}`);
    console.log(`  fee source:  invoice=${planned.filter((p) => p.feeSource === "invoice").length} · recompute=${planned.filter((p) => p.feeSource === "recompute").length}`);

    console.log(`\n── per-row corrections (${planned.length}) ──`);
    for (const p of planned) {
      console.log(
        `  ${p.rid.padEnd(16)} ${p.feeSource === "invoice" ? `↔${p.matchedDocNo}` : "(recompute)"} ` +
          `total ${p.oldTotalBefore.toFixed(2)}→${p.newTotalBefore.toFixed(2)} · ` +
          `ramount ${p.oldRamount.toFixed(2)}→${p.newRamount.toFixed(2)} · ` +
          `+เหมาๆ ฿${p.newMaoFee.toFixed(2)}${p.applyJuristic1Pct ? " · นิติ −1%" : ""} · reconciles=${p.reconciles ? "yes" : "NO"}`,
      );
    }

    if (skipped.length > 0) {
      console.log(`\n── SKIPPED (human review · ${skipped.length}) ──`);
      const byReason = {};
      for (const s of skipped) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1;
      console.log("  by reason:", byReason);
      for (const s of skipped.slice(0, 40)) {
        console.log(`  ${s.rid.padEnd(16)} [${s.reason}] ${s.detail}`);
      }
      if (skipped.length > 40) console.log(`  … +${skipped.length - 40} more`);
    }

    if (!APPLY) {
      console.log(`\n(dry-run — nothing written. Re-run with --apply to correct the ${planned.length} reconciling receipts.)\n`);
      return;
    }

    if (planned.length === 0) {
      console.log(`\n(--apply given but 0 reconciling rows — nothing to write.)\n`);
      return;
    }

    // ────────────────────────────────────────────────────────────
    // 7. Backup BEFORE any write.
    // ────────────────────────────────────────────────────────────
    const backup = planned.map((p) => ({
      rid: p.rid,
      receiptId: p.receiptId,
      old: { mao_fee_thb: p.oldMaoFee, totalbeforewithholding: p.oldTotalBefore, ramount: p.oldRamount },
      new: { mao_fee_thb: p.newMaoFee, totalbeforewithholding: p.newTotalBefore, ramount: p.newRamount },
      feeSource: p.feeSource,
      matchedDocNo: p.matchedDocNo,
      corporate: p.corporate,
      applyJuristic1Pct: p.applyJuristic1Pct,
    }));
    writeFileSync(BACKUP_PATH, JSON.stringify({ stamp: RUN_STAMP, count: backup.length, rows: backup }, null, 2), "utf-8");
    console.log(`\n✓ backup written: ${BACKUP_PATH} (${backup.length} rows)`);

    // ────────────────────────────────────────────────────────────
    // 8. APPLY — one guarded UPDATE per row.
    //    WHERE also re-asserts the row is still at mao_fee 0/NULL (idempotent +
    //    TOCTOU-safe: a concurrent fix skips this write, never double-adds).
    // ────────────────────────────────────────────────────────────
    let written = 0;
    for (const p of planned) {
      const res = await c.query(
        `UPDATE tb_receipt
            SET mao_fee_thb = $2,
                totalbeforewithholding = $3,
                ramount = $4
          WHERE id = $1
            AND (mao_fee_thb IS NULL OR mao_fee_thb = 0)
            AND rstatus <> '2'`,
        [p.receiptId, p.newMaoFee, p.newTotalBefore, p.newRamount],
      );
      if (res.rowCount === 1) {
        written++;
      } else {
        console.log(`  ⚠ ${p.rid}: 0 rows updated (already corrected or cancelled since dry-run) — left untouched`);
      }
      process.stdout.write(`\r  corrected ${written}/${planned.length}`);
    }
    console.log(`\n\n✓ applied: ${written} receipt(s) corrected. Backup at ${BACKUP_PATH}\n`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
