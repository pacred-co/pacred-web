#!/usr/bin/env node
/**
 * scripts/backfill-invoice-mao-fee-2026-07-07.ts
 *
 * The tb_forwarder_invoice (ใบวางบิล) MIRROR of the receipt backfill
 * (scripts/backfill-receipt-mao-fee-2026-07-02.ts). It corrects ใบวางบิล that
 * were issued BEFORE the เหมาๆ line was carried on the bill (mig 0209 · owner
 * 2026-07-07 named-fee split), so a bill's stored `mao_fee_thb` = 0/NULL even
 * though its covered forwarders are a เหมาๆ shipment (PRF/PCSF · ftransportprice=0).
 *
 * ── HOW A BILL LINKS TO ITS FORWARDERS + ITS RECEIPT ──────────────────
 *   tb_forwarder_invoice.id ──1:N──▶ tb_forwarder_invoice_item.invoice_id
 *                                    → .forwarder_id → tb_forwarder.id
 *   tb_receipt.rid          ──1:N──▶ tb_receipt_item.rid → .fid → tb_forwarder.id
 * There is NO FK between a bill and a receipt — the link is the SHARED
 * FORWARDER-SET. We reconcile a corrected bill against the receipt that covers
 * the SAME forwarder set (gross↔gross, to the satang).
 *
 * ── FEE SOURCE (ground truth) ─────────────────────────────────────────
 *   Recompute เหมาๆ via the REAL computeForwarderDebitBatch() over the bill's
 *   covered forwarders — the SAME once-per-shipment anchor engine issuance uses.
 *   Σ breakdown.maoFee. Skip when 0 (a genuine ฿0-เหมาๆ bill).
 *
 * ── TWO PRE-0209 STATES (distinguish by the stored subtotal · mig-0138-safe) ──
 *   engineGross = Σ calcForwarderGross(row) over covered rows (recomputed).
 *   (A) FOLDED  — subtotal_thb ≈ engineGross + เหมาๆ  → the ฿100 was folded into a
 *       row's amount_thb. DE-FOLD: subtract เหมาๆ from the ANCHOR row's amount_thb
 *       (the base-tracking PRF row computeForwarderDebitBatch marks isPcsfFirst),
 *       set mao_fee_thb = เหมาๆ, subtotal_thb = Σ amount_thb (−เหมาๆ). total_thb
 *       stays IDENTICAL (the ฿100 just moves column · never double-counted).
 *   (B) MISSING — subtotal_thb ≈ engineGross            → the ฿100 was nowhere.
 *       ADD: mao_fee_thb = เหมาๆ, subtotal unchanged, total_thb = subtotal +
 *       เหมาๆ + delivery_chn + delivery_th + other − discount (recompute).
 *   Otherwise (override / drift beyond tolerance) → SKIP does_not_reconcile.
 *
 * ── ACCEPTANCE CHECK ──────────────────────────────────────────────────
 *   The corrected bill total_thb (GROSS) must reconcile to the matching receipt's
 *   totalbeforewithholding (GROSS) to the satang. A bill with no matching receipt
 *   is accepted only when its internal state (A folded → total unchanged, or
 *   B missing → total + engine-เหมาๆ) is self-consistent; else SKIPPED + reported.
 *
 * ── SAFETY (AGENTS §11) ───────────────────────────────────────────────
 *   • DRY-RUN by default. `--apply` performs the UPDATEs.
 *   • Writes a timestamped JSON backup of every touched row + item BEFORE writes.
 *   • Idempotent — only bills at mao_fee_thb 0/NULL are candidates.
 *   • Touches ONLY tb_forwarder_invoice.{mao_fee_thb, subtotal_thb, total_thb}
 *     and (state A) the anchor tb_forwarder_invoice_item.amount_thb. Never DELETE.
 *   • Refuses to run if SUPABASE_DB_PASSWORD is unset. Never prints the password.
 *
 * ── RUN (a .ts entry so tsx transforms the real TS money helpers) ─────
 *   SUPABASE_DB_PASSWORD='<pw>' npx tsx --env-file=.env.local \
 *     scripts/backfill-invoice-mao-fee-2026-07-07.ts            # dry-run
 *   SUPABASE_DB_PASSWORD='<pw>' npx tsx --env-file=.env.local \
 *     scripts/backfill-invoice-mao-fee-2026-07-07.ts --apply    # write
 *   (optional) --limit=50   cap candidates processed (smoke)
 */

import pg from "pg";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeForwarderDebitBatch } from "../lib/forwarder/forwarder-debit-total";
import { calcForwarderGross } from "../lib/forwarder/outstanding";
import { computeBillWht } from "../lib/billing/wht";
import { MAO_FLAT_FEE } from "../lib/forwarder/mao-fee";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 0; // 0 = no cap

const RUN_STAMP = "2026-07-07";
const BACKUP_PATH = resolve(process.cwd(), `scripts/backfill-invoice-mao-fee-${RUN_STAMP}-backup.json`);
const RECONCILE_TOLERANCE = 0.01; // satang

// ── connect (house-standard prod pooler fallback chain) ─────────────
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
const ATTEMPTS: [string, string][] = [
  ...POOLER_HOSTS.flatMap((h): [string, string][] => [
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
    } catch (e: any) {
      console.log(`  ✗ ${label}: ${e.code ?? "err"} ${e.message}`);
    }
  }
  throw new Error("could not connect to prod via any path");
}

// ── helpers ─────────────────────────────────────────────────────────
function toNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
const round2 = (x: number) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

async function main() {
  console.log(`\n=== ใบวางบิล เหมาๆ backfill · ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"} ===\n`);
  const c = await connect();

  try {
    // 1. CANDIDATE BILLS — mao_fee_thb 0/NULL, not cancelled.
    const { rows: bills } = await c.query(
      `SELECT id, doc_no, userid, is_juristic, status,
              subtotal_thb, delivery_chn_thb, delivery_th_thb, other_thb, discount_thb,
              mao_fee_thb, total_thb
         FROM tb_forwarder_invoice
        WHERE (mao_fee_thb IS NULL OR mao_fee_thb = 0)
          AND status <> 'cancelled'
        ORDER BY id`,
    );
    console.log(`candidate bills (mao_fee 0/NULL · not cancelled): ${bills.length}`);
    if (bills.length === 0) { console.log("\nNothing to do.\n"); return; }

    // 2. Bill items (invoice_id → forwarder_id + amount_thb).
    const billIds = bills.map((b) => Number(b.id));
    const { rows: itemRows } = await c.query(
      `SELECT id, invoice_id, forwarder_id, amount_thb
         FROM tb_forwarder_invoice_item WHERE invoice_id = ANY($1)`,
      [billIds],
    );
    const itemsByBill = new Map<number, { id: number; forwarder_id: number; amount_thb: number }[]>();
    for (const it of itemRows) {
      const k = Number(it.invoice_id);
      if (!itemsByBill.has(k)) itemsByBill.set(k, []);
      itemsByBill.get(k)!.push({ id: Number(it.id), forwarder_id: Number(it.forwarder_id), amount_thb: round2(toNumber(it.amount_thb)) });
    }

    // 3. Pricing inputs for every covered forwarder.
    const allFids = Array.from(new Set(itemRows.map((it) => Number(it.forwarder_id)).filter(Number.isFinite)));
    const fwById = new Map<number, any>();
    if (allFids.length > 0) {
      const { rows: fwRows } = await c.query(
        `SELECT id, userid, fshipby, ftrackingchn,
                ftotalprice, ftransportprice, fpriceupdate, fshippingservice,
                pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany
           FROM tb_forwarder WHERE id = ANY($1)`,
        [allFids],
      );
      for (const r of fwRows) fwById.set(Number(r.id), r);
    }

    // 4. Matching receipts (shared forwarder-set · gross↔gross reconcile).
    const userids = Array.from(new Set(bills.map((b) => b.userid)));
    const { rows: rcpRows } = await c.query(
      `SELECT rid, userid, totalbeforewithholding, ramount
         FROM tb_receipt WHERE userid = ANY($1) AND rstatus <> '2'`,
      [userids],
    );
    const rcpByRid = new Map(rcpRows.map((r) => [r.rid, r]));
    const { rows: rcpItemRows } = rcpRows.length
      ? await c.query(`SELECT rid, fid FROM tb_receipt_item WHERE rid = ANY($1)`, [rcpRows.map((r) => r.rid)])
      : { rows: [] as any[] };
    const rcpFidSet = new Map<string, Set<number>>();
    for (const it of rcpItemRows) {
      if (!rcpFidSet.has(it.rid)) rcpFidSet.set(it.rid, new Set());
      rcpFidSet.get(it.rid)!.add(Number(it.fid));
    }
    const rcpByUser = new Map<string, string[]>();
    for (const r of rcpRows) {
      if (!rcpByUser.has(r.userid)) rcpByUser.set(r.userid, []);
      rcpByUser.get(r.userid)!.push(r.rid);
    }
    // Find the receipt whose fid-set EQUALS the bill's fid-set (tightest shared set).
    function matchReceipt(userid: string, fidSet: number[]): string | null {
      const want = new Set(fidSet);
      for (const rid of (rcpByUser.get(userid) ?? [])) {
        const set = rcpFidSet.get(rid);
        if (!set || set.size !== want.size) continue;
        if ([...want].every((f) => set.has(f))) return rid;
      }
      return null;
    }

    // ── 5. build the plan ──
    const planned: any[] = [];
    const skipped: { doc_no: string; reason: string; detail: string }[] = [];
    let processed = 0;

    for (const b of bills) {
      if (LIMIT && processed >= LIMIT) break;
      processed++;

      const billId = Number(b.id);
      const items = itemsByBill.get(billId) ?? [];
      if (items.length === 0) {
        skipped.push({ doc_no: b.doc_no, reason: "no_bill_items", detail: "bill covers no forwarder items" });
        continue;
      }
      const fids = items.map((i) => i.forwarder_id);
      const rowsForCalc = fids.map((f) => fwById.get(f)).filter(Boolean);
      if (rowsForCalc.length !== fids.length) {
        skipped.push({ doc_no: b.doc_no, reason: "forwarder_rows_missing", detail: `${rowsForCalc.length}/${fids.length} covered forwarders exist` });
        continue;
      }
      const corporate = !!b.is_juristic;

      // ── เหมาๆ ground truth via the real engine ──
      const batch = computeForwarderDebitBatch(
        rowsForCalc.map((fw) => ({
          id: fw.id, fshipby: fw.fshipby, ftrackingchn: fw.ftrackingchn,
          ftotalprice: fw.ftotalprice, ftransportprice: fw.ftransportprice,
          fpriceupdate: fw.fpriceupdate, fshippingservice: fw.fshippingservice,
          pricecrate: fw.pricecrate, ftransportpricechnthb: fw.ftransportpricechnthb,
          priceother: fw.priceother, fdiscount: fw.fdiscount,
        })),
        { userId: b.userid, isCorporate: corporate },
      );
      const newMaoFee = round2(batch.lines.reduce((s, l) => s + l.breakdown.maoFee, 0));
      if (newMaoFee <= 0) {
        skipped.push({ doc_no: b.doc_no, reason: "no_mao_fee", detail: `computed เหมาๆ = ${newMaoFee}` });
        continue;
      }
      // The anchor forwarder id (the base-tracking PRF row that carries the ฿100).
      const anchorFid = batch.pcsfTransportFixId ? Number(batch.pcsfTransportFixId) : null;

      const subtotal = round2(toNumber(b.subtotal_thb));
      const deliveryChn = round2(toNumber(b.delivery_chn_thb));
      const deliveryTh = round2(toNumber(b.delivery_th_thb));
      const other = round2(toNumber(b.other_thb));
      const discount = round2(toNumber(b.discount_thb));
      const oldTotal = round2(toNumber(b.total_thb));

      const engineGross = round2(rowsForCalc.reduce((s, fw) => s + calcForwarderGross(fw), 0));

      // ── distinguish FOLDED (A) vs MISSING (B) ──
      let state: "folded" | "missing" | null = null;
      if (Math.abs(subtotal - (engineGross + newMaoFee)) <= RECONCILE_TOLERANCE) state = "folded";
      else if (Math.abs(subtotal - engineGross) <= RECONCILE_TOLERANCE) state = "missing";

      if (state === null) {
        skipped.push({
          doc_no: b.doc_no, reason: "subtotal_drift",
          detail: `subtotal ${subtotal} vs engineGross ${engineGross} (±${newMaoFee}) — override/drift, human review`,
        });
        continue;
      }

      let newSubtotal = subtotal;
      let newTotal = oldTotal;
      let defoldItemId: number | null = null;
      let defoldItemNewAmount: number | null = null;

      if (state === "folded") {
        // The ฿100 is inside a row's amount_thb → move it to mao_fee_thb.
        // Find the anchor bill item (the base-tracking PRF row) to de-fold.
        const anchorItem = anchorFid != null
          ? items.find((i) => i.forwarder_id === anchorFid)
          : undefined;
        if (!anchorItem) {
          skipped.push({ doc_no: b.doc_no, reason: "no_anchor_item", detail: "folded state but no anchor PRF item to de-fold" });
          continue;
        }
        defoldItemId = anchorItem.id;
        defoldItemNewAmount = round2(anchorItem.amount_thb - newMaoFee);
        if (defoldItemNewAmount < 0) {
          skipped.push({ doc_no: b.doc_no, reason: "defold_negative", detail: `anchor amount ${anchorItem.amount_thb} < เหมาๆ ${newMaoFee}` });
          continue;
        }
        newSubtotal = round2(subtotal - newMaoFee);   // subtotal = Σ amount_thb, one row −100
        newTotal = oldTotal;                           // total IDENTICAL (money just moves column)
      } else {
        // MISSING — add the fee on top (subtotal unchanged).
        newSubtotal = subtotal;
        newTotal = round2(subtotal + newMaoFee + deliveryChn + deliveryTh + other - discount);
      }

      const { net_payable, wht_amount } = computeBillWht(corporate, newTotal);

      // ── acceptance: reconcile to the matching receipt (gross↔gross) ──
      const rid = matchReceipt(b.userid, fids);
      let reconciles = false;
      let note = "";
      if (rid) {
        const rcpGross = round2(toNumber(rcpByRid.get(rid)!.totalbeforewithholding));
        reconciles = Math.abs(newTotal - rcpGross) <= RECONCILE_TOLERANCE;
        note = `newTotal(gross) ${newTotal} vs receipt ${rid} totalbeforewithholding ${rcpGross}`;
      } else {
        // No receipt to reconcile against → accept when internally consistent:
        //   folded  → total unchanged (already correct), only the column moves.
        //   missing → newTotal = subtotal + engine-เหมาๆ + adjustments (fee = ground truth).
        reconciles = true;
        note = `no matching receipt · internal ${state} correction (self-consistent)`;
      }

      const rowPlan = {
        doc_no: b.doc_no, invoiceId: billId, userid: b.userid, corporate, state,
        oldMaoFee: b.mao_fee_thb === null ? null : round2(toNumber(b.mao_fee_thb)),
        newMaoFee, oldSubtotal: subtotal, newSubtotal, oldTotal, newTotal,
        net_payable, wht_amount, defoldItemId, defoldItemNewAmount, reconciles, note,
      };

      if (!reconciles) { skipped.push({ doc_no: b.doc_no, reason: "does_not_reconcile", detail: note }); continue; }
      planned.push(rowPlan);
    }

    // ── 6. report ──
    const sumFee = round2(planned.reduce((s, p) => s + p.newMaoFee, 0));
    console.log(`\n── PLAN ──`);
    console.log(`  processed:  ${processed}`);
    console.log(`  to correct: ${planned.length}  (Σ เหมาๆ ฿${sumFee.toFixed(2)})`);
    console.log(`  folded=${planned.filter((p) => p.state === "folded").length} · missing=${planned.filter((p) => p.state === "missing").length}`);
    console.log(`  skipped:    ${skipped.length}`);
    for (const p of planned) {
      console.log(
        `  ${String(p.doc_no).padEnd(16)} [${p.state}] subtotal ${p.oldSubtotal.toFixed(2)}→${p.newSubtotal.toFixed(2)} · ` +
          `total ${p.oldTotal.toFixed(2)}→${p.newTotal.toFixed(2)} · +เหมาๆ ฿${p.newMaoFee.toFixed(2)}` +
          (p.defoldItemId ? ` · de-fold item#${p.defoldItemId}→${p.defoldItemNewAmount!.toFixed(2)}` : "") +
          ` · reconciles=${p.reconciles ? "yes" : "NO"}`,
      );
    }
    if (skipped.length > 0) {
      const byReason: Record<string, number> = {};
      for (const s of skipped) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1;
      console.log(`\n── SKIPPED (${skipped.length}) ──`, byReason);
      for (const s of skipped.slice(0, 40)) console.log(`  ${String(s.doc_no).padEnd(16)} [${s.reason}] ${s.detail}`);
    }

    if (!APPLY) { console.log(`\n(dry-run — nothing written. Re-run with --apply.)\n`); return; }
    if (planned.length === 0) { console.log(`\n(--apply but 0 rows to write.)\n`); return; }

    // ── 7. backup BEFORE any write ──
    writeFileSync(BACKUP_PATH, JSON.stringify({ stamp: RUN_STAMP, count: planned.length, rows: planned }, null, 2), "utf-8");
    console.log(`\n✓ backup written: ${BACKUP_PATH} (${planned.length} rows)`);

    // ── 8. APPLY — de-fold item (state A) then header, per row, guarded ──
    let written = 0;
    for (const p of planned) {
      if (p.state === "folded" && p.defoldItemId != null) {
        await c.query(
          `UPDATE tb_forwarder_invoice_item SET amount_thb = $2 WHERE id = $1`,
          [p.defoldItemId, p.defoldItemNewAmount],
        );
      }
      const res = await c.query(
        `UPDATE tb_forwarder_invoice
            SET mao_fee_thb = $2, subtotal_thb = $3, total_thb = $4
          WHERE id = $1
            AND (mao_fee_thb IS NULL OR mao_fee_thb = 0)
            AND status <> 'cancelled'`,
        [p.invoiceId, p.newMaoFee, p.newSubtotal, p.newTotal],
      );
      if (res.rowCount === 1) written++;
      else console.log(`  ⚠ ${p.doc_no}: 0 rows (already corrected/cancelled) — left untouched`);
    }
    console.log(`\n✓ applied: ${written}/${planned.length} bill(s) corrected. Backup at ${BACKUP_PATH}\n`);
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error("\nFATAL:", e); process.exit(1); });
