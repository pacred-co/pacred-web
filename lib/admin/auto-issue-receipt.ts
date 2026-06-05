/**
 * lib/admin/auto-issue-receipt.ts
 *
 * Wave 29 P0 #206 (Part A) — server-side auto-receipt issuance hook.
 *
 * ── Legacy reference ──────────────────────────────────────────────
 *   pcs-admin/include/functions.php :: grenrateReceiptF($data)  (L400-608)
 *
 *   The legacy auto-INSERTs `tb_receipt` + `tb_receipt_item` SERVER-SIDE
 *   the moment a payment for a forwarder lands (a `tb_wallet_hs` row with
 *   `typeService='2'` whose `refOrder` joins to a `tb_forwarder.ID`). NO
 *   admin click is required — the receipt is the audit-of-record for the
 *   money already in the bank account.
 *
 *   Pacred was MISSING this hook. Wave 28 F3 only built a MANUAL issue
 *   path (`actions/admin/forwarder-invoice.ts:adminIssueForwarderInvoice`)
 *   — but the legacy never wired "ใบแจ้งหนี้" up. The real flow is the
 *   2-click receipt + receipt-VIEW route. See
 *   `docs/research/legacy-accounting-billing-workflow.md` §3.1 / §11.5
 *   for the model details.
 *
 * ── Behaviour ─────────────────────────────────────────────────────
 *   - Determines `corporate` (1=นิติบุคคล / 2=บุคคล) from tb_corporate
 *     existence (matches legacy L427-456).
 *   - Mints `rid` via `mintReceiptDocNo` — main thread provides this
 *     helper at `lib/admin/mint-receipt-doc-no.ts`. Format: `FRC2605-00219`
 *     or `FRG2605-00007` (per-corporate-type sequence per year-month).
 *   - INSERTs tb_receipt + N × tb_receipt_item (legacy L568-581).
 *   - WHT 1% deduction (`rAmount = pricePayAll * 0.99`) applies ONLY when
 *     `corporate=1` AND `pricePayAll ≥ 1000` (legacy L557-559).
 *   - Logs to `admin_audit_log` with `action='auto_receipt.created'` and
 *     `admin_id='system-auto'` so accountancy can audit.
 *   - Best-effort SMS notify to the customer with the receipt URL.
 *
 * ── Why a separate helper (not a server action) ──────────────────
 *   This is called FROM other server actions (the wallet_hs approve
 *   flows). It is not itself a top-level server action; it's a library
 *   function that the caller invokes after committing its own DB writes.
 *   That keeps the auto-receipt opt-in (not every approve must trigger
 *   one) and makes the call-site grep-able.
 *
 * ── Idempotency ───────────────────────────────────────────────────
 *   Before INSERTing, we check `tb_receipt_item` for ANY existing row
 *   with `fid IN <fids>`. If any of the input fids is already on a
 *   receipt, we abort with `already_issued`. The caller logs but does
 *   not throw — this is the "happy duplicate" case (admin re-approved a
 *   slip that was already invoiced).
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { ForwarderPriceFields } from "@/lib/forwarder/outstanding";
import { mintReceiptDocNo } from "@/lib/admin/mint-receipt-doc-no";
import { legacyReceiptAmount } from "@/lib/tax/wht";
import { issueForwarderTaxInvoice } from "@/lib/admin/forwarder-tax-invoice";
import { modeFromPref, type TaxDocMode } from "@/lib/tax/tax-doc-mode";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { sendNotification } from "@/lib/notifications";
import { sendSms } from "@/lib/sms/gateway";
import { logger, redactPhone } from "@/lib/logger";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface AutoIssueReceiptOpts {
  /**
   * The tb_users.userID of the customer the receipt is for.
   */
  userid: string;
  /**
   * The list of tb_forwarder.id rows that this single receipt covers.
   * Must be ≥ 1; all must share the same `userid` (caller's
   * responsibility — we re-verify in-flight as a safety net).
   */
  fids: number[];
  /**
   * The dateSlip (= moment the customer's payment landed in the bank).
   * Used for both the rid's yyMM partition AND the tb_receipt.issuedate
   * column. The legacy keys the per-month rid sequence off this exact
   * date — see `mintReceiptDocNo` for the partition rule.
   */
  dateSlip: Date;
  /**
   * Source = informational only. Recorded in the audit log so accounting
   * can tell whether the receipt fired from a slip-approve (`wallet_hs`)
   * or some other path. Defaults to `"wallet_hs.approve"`.
   */
  source?: string;
}

export type AutoIssueReceiptResult =
  | {
      ok: true;
      data: {
        /** tb_receipt.id (numeric pk) */
        receiptId: number;
        /** tb_receipt.rid (e.g. `FRC2605-00219`) */
        rid: string;
        /** Sum of pre-WHT line totals — what goes on totalbeforewithholding */
        totalBeforeWithholding: number;
        /** What customer actually pays — pre-WHT minus juristic 1% (if applicable) */
        rAmount: number;
      };
    }
  | {
      ok: false;
      error: string;
      /** Marker for the happy-duplicate case so callers can downgrade to a warn */
      alreadyIssued?: boolean;
    };

// ────────────────────────────────────────────────────────────
// Compose SMS body for the customer
// ────────────────────────────────────────────────────────────

function composeReceiptSms(opts: {
  userId: string;
  rid: string;
  fid: number;        // representative fid (first of the batch) for the URL
  amountThb: number;
}): string {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co"}/service-import/${opts.fid}/invoice`;
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  return `Pacred: ${opts.userId} ใบเสร็จ ${opts.rid} ยอด ฿${amount} ดูที่ ${url}`;
}

function composeReceiptBody(opts: {
  userId: string;
  rid: string;
  fids: number[];
  amountThb: number;
}): string {
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const orderList = opts.fids.length === 1
    ? `บริการนำเข้า #${opts.fids[0]}`
    : `บริการนำเข้า ${opts.fids.length} รายการ (#${opts.fids.slice(0, 3).join(", #")}${opts.fids.length > 3 ? "..." : ""})`;
  return (
    `เรียนคุณ ${opts.userId}\n` +
    `ใบเสร็จรับเงิน ${opts.rid}\n` +
    `${orderList}\n` +
    `ยอดที่ชำระ: ฿${amount}\n` +
    `สามารถดาวน์โหลดใบเสร็จได้จากระบบ`
  );
}

// ────────────────────────────────────────────────────────────
// Pick the batch's tax-document mode from the covered forwarder rows.
// All rows in one payment batch share a customer + payment event, so a mixed
// batch is not expected; if rows DO disagree, prefer the first non-'none' mode
// (a customer who asked for any VAT doc should get one). Returns 'none' only
// when EVERY row is receipt/NULL.
// ────────────────────────────────────────────────────────────
function pickForwarderTaxDocMode(prefs: Array<string | null>): TaxDocMode {
  for (const p of prefs) {
    const m = modeFromPref(p);
    if (m !== "none") return m;
  }
  return "none";
}

// ────────────────────────────────────────────────────────────
// autoIssueReceiptOnPaymentLand
// ────────────────────────────────────────────────────────────

/**
 * Issue a receipt for one customer's batch of just-paid forwarder rows.
 *
 * Call this AFTER the underlying tb_wallet_hs row(s) have flipped to
 * status='2' (approved) and the corresponding tb_forwarder rows are
 * fstatus='5' (รอชำระเงิน — billing already raised by forwarder-check).
 *
 * The fids must all belong to the same userid + must NOT already be on
 * a receipt. Returns `alreadyIssued: true` on a duplicate (idempotent
 * happy path) — caller should downgrade to a warn rather than fail.
 *
 * @param admin  admin client (caller passes through · we do not create one)
 * @param opts   userid · fids[] · dateSlip · source
 */
export async function autoIssueReceiptOnPaymentLand(
  admin: ReturnType<typeof createAdminClient>,
  opts: AutoIssueReceiptOpts,
): Promise<AutoIssueReceiptResult> {
  if (!opts.userid || opts.fids.length === 0) {
    return { ok: false, error: "missing_userid_or_fids" };
  }

  const userid = opts.userid;
  const fids = Array.from(new Set(opts.fids)); // dedup
  const dateSlip = opts.dateSlip;
  const source = opts.source ?? "wallet_hs.approve";

  // 1. Idempotency guard — any of these fids already on a tb_receipt?
  const { data: existing, error: existingErr } = await admin
    .from("tb_receipt_item")
    .select("fid, rid")
    .in("fid", fids);
  if (existingErr) {
    console.error(`[auto-receipt: tb_receipt_item check] failed`, {
      code: existingErr.code, message: existingErr.message, userid, fids,
    });
    return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
  }
  if ((existing ?? []).length > 0) {
    const ridList = Array.from(new Set(((existing ?? []) as Array<{ rid: string }>).map((r) => r.rid)));
    logger.warn("auto-receipt", "skip — at least one fid already on a receipt", {
      userid, fids, alreadyOnRids: ridList, source,
    });
    return { ok: false, error: "already_issued", alreadyIssued: true };
  }

  // 2. Read the forwarder rows to compute totals (re-fetch — never trust
  //    cached row data from the caller's snapshot).
  type FwRow = ForwarderPriceFields & { id: number; userid: string; tax_doc_pref: string | null };
  const { data: fwRows, error: fwErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
      "pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany, tax_doc_pref",
    )
    .in("id", fids)
    .eq("userid", userid);
  if (fwErr) {
    console.error(`[auto-receipt: tb_forwarder read] failed`, {
      code: fwErr.code, message: fwErr.message, userid, fids,
    });
    return { ok: false, error: `db_error:${fwErr.code ?? "unknown"}` };
  }
  const rows = ((fwRows ?? []) as unknown as FwRow[]);
  if (rows.length === 0) {
    return { ok: false, error: "no_matching_forwarder_rows" };
  }
  if (rows.length !== fids.length) {
    logger.warn("auto-receipt", "fid count mismatch — some fids missing or not owned by userid", {
      userid, requested: fids, found: rows.map((r) => r.id),
    });
    // Don't fail — we still issue a receipt for the rows we did find,
    // matching the legacy permissive behaviour (loops over what it gets).
  }

  // 3. Determine corporate flag — legacy L427-456.
  type CorpRow = { corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null };
  const { data: corpRow, error: corpErr } = await admin
    .from("tb_corporate")
    .select("corporatenumber, corporatename, corporateaddress")
    .eq("userid", userid)
    .maybeSingle<CorpRow>();
  if (corpErr && corpErr.code !== "PGRST116") {
    // PGRST116 = no rows; legitimate for non-juristic customers.
    console.error(`[auto-receipt: tb_corporate read] failed`, {
      code: corpErr.code, message: corpErr.message, userid,
    });
  }
  const corporate: 1 | 2 = corpRow?.corporatenumber ? 1 : 2;

  // 4. Per-row line totals (legacy L548) — sum the same buckets the
  //    legacy used. We compute BOTH the raw sum (totalbeforewithholding)
  //    AND the post-juristic-1% amount (rAmount).
  //
  //    `calcForwarderOutstanding` already applies the 1% allowance →
  //    we need the raw priceFull, so we re-implement the bucket sum
  //    here without the allowance step.
  const num = (v: number | string | null | undefined): number => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const perRowRaw = (r: FwRow): number =>
    num(r.ftotalprice) +
    num(r.ftransportprice) +
    num(r.fpriceupdate) +
    num(r.fshippingservice) +
    num(r.pricecrate) +
    num(r.ftransportpricechnthb) +
    num(r.priceother) -
    num(r.fdiscount);

  const pricePayAll = rows.reduce((s, r) => s + perRowRaw(r), 0);

  // Legacy L557-559: 1% WHT applies only to juristic AND total ≥ 1000.
  // Shared, unit-tested rule (lib/tax/wht.ts:legacyReceiptAmount) so the
  // grenrateReceiptF juristic-1% behaviour can't silently drift untested.
  const { totalBeforeWithholding, rAmount, applied: applyJuristic1Pct } =
    legacyReceiptAmount(pricePayAll, corporate === 1);

  // 5. Customer header info — name/address for the printable receipt.
  type UserRow = { userID: string; userName: string | null; userLastName: string | null; userTel: string | null; userEmail: string | null };
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail")
    .eq("userID", userid)
    .maybeSingle<UserRow>();
  if (userErr) {
    console.error(`[auto-receipt: tb_users read] failed`, {
      code: userErr.code, message: userErr.message, userid,
    });
  }

  // Best-effort fullAddress for non-juristic — pull main address row.
  let fallbackAddress = "";
  if (corporate === 2) {
    const { data: addrRow, error: addrErr } = await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", userid)
      .maybeSingle<{ addressid: number | null }>();
    if (addrErr && addrErr.code !== "PGRST116") {
      console.error(`[auto-receipt: tb_address_main read] failed`, {
        code: addrErr.code, message: addrErr.message, userid,
      });
    }
    if (addrRow?.addressid) {
      const { data: addr, error: addrFullErr } = await admin
        .from("tb_address")
        .select("addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
        .eq("addressid", addrRow.addressid)
        .maybeSingle<{
          addressno: string | null;
          addresssubdistrict: string | null;
          addressdistrict: string | null;
          addressprovince: string | null;
          addresszipcode: string | null;
        }>();
      if (addrFullErr && addrFullErr.code !== "PGRST116") {
        console.error(`[auto-receipt: tb_address read] failed`, {
          code: addrFullErr.code, message: addrFullErr.message, userid,
        });
      }
      if (addr) {
        fallbackAddress = [
          addr.addressno ?? "",
          addr.addresssubdistrict ? `ตำบล/แขวง ${addr.addresssubdistrict}` : "",
          addr.addressdistrict ? `อำเภอ/เขต ${addr.addressdistrict}` : "",
          addr.addressprovince ? `จังหวัด ${addr.addressprovince}` : "",
          addr.addresszipcode ?? "",
        ].filter(Boolean).join(" ").trim();
      }
    }
  }

  const recompNumber = corpRow?.corporatenumber ?? "";
  const recompName = corpRow?.corporatename
    ?? `${userRow?.userName ?? ""} ${userRow?.userLastName ?? ""}`.trim()
    ?? "";
  const recompAddress = corpRow?.corporateaddress ?? fallbackAddress;

  // 6. Mint the rid via the new minter (FRC/FRG + yyMM + 5-digit seq).
  let rid: string;
  try {
    rid = await mintReceiptDocNo(admin, { corporate, dateSlip });
  } catch (e) {
    console.error(`[auto-receipt: mintReceiptDocNo] threw`, {
      error: e instanceof Error ? e.message : String(e),
      userid, corporate,
    });
    return { ok: false, error: `mint_failed: ${e instanceof Error ? e.message : "unknown"}` };
  }

  // 7. INSERT tb_receipt — legacy L574-575 column list.
  const nowIso = new Date().toISOString();
  const dateSlipIso = dateSlip.toISOString();

  const insertReceipt = {
    rstatus:                "1",                          // legacy default after grenrateReceiptF success — paid
    rid,
    refid:                  "",                           // unused by auto path (notes column · only manual override fills)
    rdate:                  dateSlipIso,                  // legacy `$date` = the dateSlip
    rdatecreate:            nowIso,
    issuedate:              dateSlipIso,                  // legacy keys the rid sequence to this
    ramount:                rAmount,                      // post-juristic-1% (what customer pays)
    totalbeforewithholding: totalBeforeWithholding,       // pre-WHT raw sum
    adminid:                "system-auto",                // legacy `$adminID` — we mark as system
    userid,
    statusprint:            "0",
    adminidprint:           "",
    statusprintcopy:        "0",
    adminidprintcopy:       "",
    recompnumber:           recompNumber,
    recompname:             recompName,
    recompaddress:          recompAddress,
    rpopup:                 "0",
    corporatetype:          String(corporate),            // '1' or '2'
    documentissuer:         "ระบบอัตโนมัติ",
    documentapprover:       "",
    refwhid:                null,
  };

  const { data: receiptRow, error: insertErr } = await admin
    .from("tb_receipt")
    .insert(insertReceipt)
    .select("id, rid")
    .single<{ id: number; rid: string }>();
  if (insertErr) {
    console.error(`[auto-receipt: tb_receipt insert] failed`, {
      code: insertErr.code, message: insertErr.message, userid, rid,
    });
    return { ok: false, error: `receipt_insert: ${insertErr.message}` };
  }

  // 8. INSERT tb_receipt_item — one row per fid (legacy L568-569 batch INSERT).
  const itemRows = rows.map((r) => ({
    rid: receiptRow.rid,
    fid: r.id,
  }));
  const { error: itemErr } = await admin
    .from("tb_receipt_item")
    .insert(itemRows);
  if (itemErr) {
    // Best-effort cleanup — undo orphan receipt to keep tb_receipt clean.
    console.error(`[auto-receipt: tb_receipt_item insert] failed`, {
      code: itemErr.code, message: itemErr.message, rid: receiptRow.rid,
    });
    await admin.from("tb_receipt").delete().eq("id", receiptRow.id);
    return { ok: false, error: `receipt_items_insert: ${itemErr.message}` };
  }

  // 8b. TAX-DOCUMENT BRIDGE (P2 · 3-mode 2026-06-04). If ANY covered forwarder
  //     row opted into a VAT document — ใบกำกับ (tax_doc_pref='tax_invoice') or
  //     ใบขน (tax_doc_pref='customs') · migration 0127 — issue one via the
  //     mode-aware tax engine (computeTaxForMode) into the tb_*-native store
  //     (migration 0129). The default 'receipt'/NULL (ไม่รับเอกสาร) keeps the
  //     receipt-only behaviour. We use the FIRST VAT-mode row's mode for the
  //     batch (mixed modes on one payment batch are not expected — all rows
  //     share a customer + a payment event). BEST-EFFORT — a tax-doc failure
  //     never undoes the receipt (the money already moved; the receipt is the
  //     document of record · the tax document is a follow-on).
  const docMode = pickForwarderTaxDocMode(rows.map((r) => r.tax_doc_pref));
  if (docMode !== "none") {
    const taxRes = await issueForwarderTaxInvoice(admin, {
      userid,
      fids: rows.map((r) => r.id),
      receiptId: receiptRow.id,
      rid: receiptRow.rid,
      issuedBy: "system-auto",
      mode: docMode,
    });
    if (!taxRes.ok && !taxRes.alreadyIssued) {
      logger.warn("auto-receipt", "tax-doc bridge failed (non-fatal · receipt stands)", {
        rid: receiptRow.rid, userid, mode: docMode, fids: rows.map((r) => r.id), error: taxRes.error,
      });
    }
  }

  // 9. Audit log (best-effort — don't block on failure).
  try {
    await admin.from("admin_audit_log").insert({
      admin_id:    "system-auto",
      action:      "auto_receipt.created",
      target_type: "tb_receipt",
      target_id:   String(receiptRow.id),
      payload:     {
        rid:                       receiptRow.rid,
        userid,
        fids:                      rows.map((r) => r.id),
        total_before_withholding:  totalBeforeWithholding,
        r_amount:                  rAmount,
        applied_juristic_1pct:     applyJuristic1Pct,
        corporate,
        source,
        date_slip:                 dateSlipIso,
      },
    });
  } catch (e) {
    logger.warn("auto-receipt", "audit log insert failed (non-fatal)", {
      error: e instanceof Error ? e.message : String(e),
      rid: receiptRow.rid,
    });
  }

  // 10. Best-effort SMS + LINE/email notify.
  //     SMS first (cheap, broadly supported).
  if (userRow?.userTel) {
    const sms = await sendSms(
      userRow.userTel,
      composeReceiptSms({
        userId:    userid,
        rid:       receiptRow.rid,
        fid:       rows[0]!.id,
        amountThb: rAmount,
      }),
    );
    if (!sms.ok) {
      logger.warn("auto-receipt", "SMS failed", {
        rid:    receiptRow.rid,
        userid,
        phone:  redactPhone(userRow.userTel),
        error:  sms.error,
      });
    }
  }

  // LINE + email — only if customer has a provisioned profile.
  try {
    const profileMap = await resolveProfileIdsForLegacyUserids([userid]);
    const profileId = profileMap.get(userid);
    if (profileId) {
      await sendNotification(profileId, {
        category:       "forwarder",
        severity:       "success",
        title:          `ใบเสร็จรับเงิน ${receiptRow.rid}`,
        body:           composeReceiptBody({
          userId:    userid,
          rid:       receiptRow.rid,
          fids:      rows.map((r) => r.id),
          amountThb: rAmount,
        }),
        link_href:      `/service-import/${rows[0]!.id}/invoice`,
        reference_type: "forwarder",
        reference_id:   String(rows[0]!.id),
      });
    }
  } catch (e) {
    logger.warn("auto-receipt", "notification spine threw (non-fatal)", {
      error: e instanceof Error ? e.message : String(e),
      rid:   receiptRow.rid,
      userid,
    });
  }

  return {
    ok:   true,
    data: {
      receiptId:               receiptRow.id,
      rid:                     receiptRow.rid,
      totalBeforeWithholding,
      rAmount,
    },
  };
}
