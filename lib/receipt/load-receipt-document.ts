import "server-only";

/**
 * Receipt document loader (FAITHFUL PORT) — the SINGLE source of the receipt's
 * data-load + money math. Used by BOTH:
 *   - admin   `/admin/accounting/forwarder-invoice/[id]`  (gated · staff reprint)
 *   - public  `/r/[token]`                                 (login-free · QR opens)
 *
 * 2026-06-10 ภูม flag round 8 (point 4): this logic was inlined in the admin
 * page. It is MOVED here verbatim — every total / WHT / preTax / grandTotal /
 * itemsMissing figure is byte-identical to the admin page's prior computation.
 * The render lives in `components/receipt/receipt-paper.tsx`; this file does NO
 * auth (the CALLER gates) and returns `null` when the receipt id isn't found.
 *
 * Uses `createAdminClient()` (service role; bypasses RLS) — so the public page
 * can render a customer's own receipt without a session. The unguessable
 * `/r/{token}` capability link (see `lib/receipt/receipt-token.ts`) is the gate.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { resolveReceiptFrozenTotals } from "@/lib/receipt/receipt-frozen-totals";
import { DOC_ROWS_PER_PAGE } from "@/lib/receipt/rows-per-page";
import { ADDRESSES } from "@/components/seo/site";
import type {
  ReceiptCommonProps,
  ReceiptPageRow,
} from "@/components/receipt/receipt-paper";

// ── Raw DB types ─────────────────────────────────────────────

type RawReceipt = {
  id:                     number;
  rid:                    string;
  refid:                  string | null;
  rdate:                  string | null;
  rdatecreate:            string | null;
  issuedate:              string | null;
  ramount:                number | string | null;
  totalbeforewithholding: number | string | null;
  mao_fee_thb:            number | string | null;
  rstatus:                string;
  userid:                 string;
  adminid:                string | null;
  statusprint:            string | null;
  rdateprint:             string | null;
  adminidprint:           string | null;
  corporatetype:          string | null;
  recompnumber:           string | null;
  recompname:             string | null;
  recompaddress:          string | null;
  documentissuer:         string | null;
  documentapprover:       string | null;
  // 50-ทวิ print gate (migration 0173 · ภูม 2026-06-10)
  wht_cert_status:        string | null;
  wht_cert_path:          string | null;
  wht_cert_no:            string | null;
  wht_cert_uploaded_at:   string | null;
};

type RawReceiptItem = {
  id:  number;
  rid: string;
  fid: number;
};

type RawForwarder = {
  id:                    number;
  userid:                string;
  ftrackingchn:          string | null;
  fcabinetnumber:        string | null;
  fid:                   string | null;
  famount:               number | null;
  fweight:               number | string | null;
  fvolume:               number | string | null;
  fdate:                 string | null;
  ftotalprice:           number | string | null;
  ftransportprice:       number | string | null;
  fpriceupdate:          number | string | null;
  fshippingservice:      number | string | null;
  pricecrate:            number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother:            number | string | null;
  fdiscount:             number | string | null;
  ftransporttype:        string | null;   // '1'=รถ(EK) · '2'=เรือ(SEA)
  frefprice:             string | null;   // '1'=คิดตาม KG · '2'=คิดตาม CBM
  frefrate:              number | string | null;  // เรทนำเข้า ฿/หน่วย
};

type RawUser = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  userTel:      string | null;
  userEmail:    string | null;
};

type RawAddressJoin = {
  addressno:          string | null;
  addresssubdistrict: string | null;
  addressdistrict:    string | null;
  addressprovince:    string | null;
  addresszipcode:     string | null;
  addresstel:         string | null;
};

// ── Number / format helpers (load-time) ──────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Format `dd/MM/yyyy` (legacy mPDF format — "%d/%m/%Y"). */
export function fmtDateLegacy(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/**
 * Build customer address from tb_address + tb_address_main main row.
 * Legacy: `<addressno> ตำบล/แขวง <subdistrict> อำเภอ/เขต <district>
 *          จังหวัด <province> <zipcode> โทร. <tel>`
 */
function composeMainAddress(row: RawAddressJoin | null | undefined): string {
  if (!row) return "";
  const parts: string[] = [];
  if (row.addressno) parts.push(row.addressno);
  if (row.addresssubdistrict) parts.push(`ตำบล/แขวง ${row.addresssubdistrict}`);
  if (row.addressdistrict) parts.push(`อำเภอ/เขต ${row.addressdistrict}`);
  if (row.addressprovince) parts.push(`จังหวัด ${row.addressprovince}`);
  if (row.addresszipcode) parts.push(row.addresszipcode);
  if (row.addresstel) parts.push(`โทร. ${row.addresstel}`);
  return parts.join(" ");
}

// ── Return shape ─────────────────────────────────────────────

export type ReceiptPageData = {
  pageNumber: number;
  rows:       ReceiptPageRow[];
};

export type ReceiptDocument = {
  receipt: {
    id:           number;
    rid:          string;
    statusprint:  string | null;
    rdateprint:   string | null;
    adminidprint: string | null;
  };
  /** The SAME object the admin page passes today — minus `qrDataUrl`. */
  commonProps: ReceiptCommonProps;
  pages:       ReceiptPageData[];
  itemsMissing: boolean;
  /** 50-ทวิ print gate (migration 0173 · ภูม 2026-06-10). `locked` = the customer
   *  cannot print/download on /r/<token> until the cert is approved/waived. */
  whtCert: {
    status:     "none" | "pending" | "approved" | "waived";
    locked:     boolean;
    certNo:     string | null;
    path:       string | null;
    uploadedAt: string | null;
  };
};

/**
 * Load + compute everything needed to render a receipt. Takes a numeric
 * `receiptId`; does NO auth (caller gates). Returns `null` when not found.
 */
export async function loadReceiptDocument(
  receiptId: number,
): Promise<ReceiptDocument | null> {
  const admin = createAdminClient();

  // ── 1. Receipt header ────────────────────────────────────
  const { data: receiptData, error: rErr } = await admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, rdatecreate, issuedate, ramount, totalbeforewithholding, mao_fee_thb, " +
        "rstatus, userid, adminid, statusprint, adminidprint, rdateprint, corporatetype, " +
        "recompnumber, recompname, recompaddress, documentissuer, documentapprover, " +
        "wht_cert_status, wht_cert_path, wht_cert_no, wht_cert_uploaded_at",
    )
    .eq("id", receiptId)
    .maybeSingle<RawReceipt>();
  if (rErr) {
    console.error(`[tb_receipt read] failed`, { code: rErr.code, message: rErr.message });
    throw new Error(`Failed to load receipt: ${rErr.message}`);
  }
  if (!receiptData) return null;
  const receipt = receiptData;

  // ── 2. Receipt items ─────────────────────────────────────
  const { data: itemRows, error: itemsErr } = await admin
    .from("tb_receipt_item")
    .select("id, rid, fid")
    .eq("rid", receipt.rid);
  if (itemsErr) {
    console.error(`[tb_receipt_item list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const receiptItems = (itemRows ?? []) as unknown as RawReceiptItem[];

  // ── 3. Forwarder rows (line items) ───────────────────────
  const fids = receiptItems.map((it) => it.fid);
  let forwarders: RawForwarder[] = [];
  if (fids.length > 0) {
    // 2026-06-03 ภูม flag — `fid` was in the select but doesn't exist on
    // tb_forwarder (only `id`; verified via information_schema). PostgREST
    // returned `code 42703 · column tb_forwarder.fid does not exist`, the
    // page swallowed the error (logged but not surfaced), the forwarders
    // array stayed empty, computedItems filtered everything out, and
    // staff saw "ไม่พบรายการ" even though tb_receipt_item DID have rows.
    // Removed `fid` from the select; the downstream `f.fid ?? String(f.id)`
    // fallback already used `String(f.id)` so the display is unchanged.
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, userid, ftrackingchn, fcabinetnumber, famount, fweight, fvolume, fdate, " +
          "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
          "pricecrate, ftransportpricechnthb, priceother, fdiscount, " +
          // ภูม flag round 8 — extra cols the /service-import table already shows:
          //   ftransporttype  '1'=รถ(EK) '2'=เรือ(SEA)
          //   frefprice       '1'=คิดตามน้ำหนัก(KG) '2'=คิดตามปริมาตร(CBM)
          //   frefrate        เรทนำเข้า ฿ ต่อหน่วย
          "ftransporttype, frefprice, frefrate",
      )
      .in("id", fids);
    if (fwdErr) {
      console.error(`[tb_forwarder list] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    forwarders = (fwdRows ?? []) as unknown as RawForwarder[];
  }
  const forwardersById = new Map(forwarders.map((f) => [f.id, f]));

  // ── 4. Customer info ─────────────────────────────────────
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail")
    .eq("userID", receipt.userid)
    .maybeSingle<RawUser>();
  if (userErr) {
    console.error(`[tb_users read] failed`, { code: userErr.code, message: userErr.message });
  }

  // ── 5. Main address fallback (only used when no corporate address) ──
  //    Legacy: SELECT CONCAT(...) FROM tb_address_main am LEFT JOIN
  //            tb_address a ON am.addressID=a.addressID WHERE userID=?
  let mainAddressRow: RawAddressJoin | null = null;
  if (!receipt.recompaddress) {
    const { data: addrMain, error: addrErr } = await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", receipt.userid)
      .maybeSingle<{ addressid: number | null }>();
    if (addrErr) {
      console.error(`[tb_address_main read] failed`, { code: addrErr.code, message: addrErr.message });
    }
    if (addrMain?.addressid) {
      const { data: addr, error: addrFullErr } = await admin
        .from("tb_address")
        .select("addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel")
        .eq("addressid", addrMain.addressid)
        .maybeSingle<RawAddressJoin>();
      if (addrFullErr) {
        console.error(`[tb_address read] failed`, { code: addrFullErr.code, message: addrFullErr.message });
      }
      mainAddressRow = addr ?? null;
    }
  }

  // ── 6. Customer name / tax-id / address resolution (legacy logic) ──
  const isCorporate = receipt.corporatetype === "1" && !!receipt.recompnumber;

  const fallbackPersonalName = userRow
    ? [userRow.userName, userRow.userLastName].filter(Boolean).join(" ").trim()
    : "";

  // Name: prefer recompname (legacy reCompName), then PCS<id>+corporate, then
  // PCS<id>+personal name, then bare userid.
  const customerName = (() => {
    if (receipt.recompname && receipt.recompname.trim()) {
      return `${receipt.userid} ${receipt.recompname.trim()}`;
    }
    if (fallbackPersonalName) {
      return `${receipt.userid} ${fallbackPersonalName}`;
    }
    return receipt.userid;
  })();

  const customerTaxId = receipt.recompnumber || "-";

  const customerAddress =
    (receipt.recompaddress && receipt.recompaddress.trim())
      ? receipt.recompaddress.trim()
      : composeMainAddress(mainAddressRow);

  // ── 7. Compute totals + WHT 1% (legacy printReceipt.php:357-399) ──
  const computedItems = receiptItems
    .map((it, idx) => {
      const f = forwardersById.get(it.fid);
      if (!f) {
        return null;
      }
      const fTotalPrice           = toNumber(f.ftotalprice);
      const fTransportPrice       = toNumber(f.ftransportprice);
      const fPriceUpdate          = toNumber(f.fpriceupdate);
      const fShippingService      = toNumber(f.fshippingservice);
      const fTransportPriceCHNTHB = toNumber(f.ftransportpricechnthb);
      const priceCrate            = toNumber(f.pricecrate);
      const priceOther            = toNumber(f.priceother);
      const fDiscount             = toNumber(f.fdiscount);

      // Line total (legacy: sum of all 7 components - discount)
      const totalPrice =
        fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
        fTransportPriceCHNTHB + priceCrate + priceOther - fDiscount;

      const row: ReceiptPageRow = {
        no:           idx + 1,
        fid:          f.fid ?? String(f.id),
        tracking:     f.ftrackingchn ?? "",
        cabinet:      f.fcabinetnumber ?? "",
        // ขนส่ง: '1'=EK(รถ) · '2'=SEA(เรือ) — short code for the column
        transport:    f.ftransporttype === "2" ? "SEA" : f.ftransporttype === "1" ? "EK" : "",
        // คิดราคาตาม: '1'=KG · '2'=CBM
        rateBasis:    f.frefprice === "2" ? "CBM" : f.frefprice === "1" ? "KG" : "",
        rate:         toNumber(f.frefrate),
        famount:      toNumber(f.famount),
        fweight:      toNumber(f.fweight),
        fvolume:      toNumber(f.fvolume),
        ftotalprice:  fTotalPrice,
      };

      return {
        idx,
        row,
        // running totals contribution
        _line: {
          fTotalPrice,
          fTransport:       fTransportPrice,
          fTransportCHNTHB: fTransportPriceCHNTHB,
          priceOther:       fPriceUpdate + fShippingService + priceCrate + priceOther,
          fDiscount,
          lineTotal:        totalPrice,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const totals = computedItems.reduce(
    (acc, row) => ({
      fTotal:           acc.fTotal           + row._line.fTotalPrice,
      fTransport:       acc.fTransport       + row._line.fTransport,
      fTransportCHNTHB: acc.fTransportCHNTHB + row._line.fTransportCHNTHB,
      priceOther:       acc.priceOther       + row._line.priceOther,
      fDiscount:        acc.fDiscount        + row._line.fDiscount,
      totalLineSum:     acc.totalLineSum     + row._line.lineTotal,
    }),
    {
      fTotal:           0,
      fTransport:       0,
      fTransportCHNTHB: 0,
      priceOther:       0,
      fDiscount:        0,
      totalLineSum:     0,
    },
  );

  // ── DATA-SYNC FALLBACK (2026-05-31 sitting-H-fix · ภูม flag #4) ──
  // ภูม screenshot of FRG2605-00219 showed "ไม่พบรายการ" + Total = 0.00 even
  // though the receipt header had a real ramount. Root cause: tb_receipt_item
  // rows are missing for that receipt (likely Wave 28 PR-format pollution OR
  // a legacy migration where items were stored differently). Without items,
  // the per-line `computedItems` reduce sums to 0, and the legacy receipt
  // chrome prints blank totals — useless to staff.
  //
  // Graceful degradation: when itemCount=0 BUT the receipt header itself
  // carries a non-zero amount (the source-of-record for the money), surface
  // the header amount on the totals row + flag the data gap with an
  // amber banner (only visible on screen, not in print — staff who reprint
  // see the warning; the customer copy stays clean).
  //
  // Sources of truth for the fallback:
  //   - tb_receipt.totalbeforewithholding = pre-WHT raw sum (preferred)
  //   - tb_receipt.ramount               = post-WHT net (what customer paid)
  // Both columns are populated by auto-issue-receipt.ts at insert time, so
  // when items go missing the header still has the answer.
  const headerTotalBefore  = toNumber(receipt.totalbeforewithholding);
  const headerRamount      = toNumber(receipt.ramount);
  const itemsMissing       = computedItems.length === 0 && (headerTotalBefore > 0 || headerRamount > 0);

  // เหมาๆ (PCSF flat ฿100/shipment · ภูม 2026-06-23) — a header-level charge that is
  // NOT in the per-item sum (items carry only the base). Fold it into the displayed
  // total so the receipt reconciles to the ใบวางบิล, and surface it as its own line.
  const maoFee = toNumber(receipt.mao_fee_thb);
  const lineSumWithMao = totals.totalLineSum + maoFee;

  // WHT 1% — legacy: only for corporate AND totalbeforewithholding ≥ 1000
  const totalBeforeWithholding = headerTotalBefore || lineSumWithMao;
  const showWht = isCorporate && totalBeforeWithholding >= 1000;

  // ── FROZEN document-of-record (ภูม flag 2026-07-01 · บิล ≠ ใบเสร็จ) ──
  // A receipt is a snapshot: its printed total MUST equal what was written at
  // issuance (tb_receipt.ramount / .totalbeforewithholding, incl เหมาๆ) — the
  // same number on its ใบวางบิล. Re-summing the forwarder rows LIVE (the old
  // path) drifted whenever a price was edited AFTER the receipt was issued
  // (e.g. บิล 2,135.43 vs ใบเสร็จ 2,057). resolveReceiptFrozenTotals renders the
  // stored frozen figures verbatim when the header carries them, and only falls
  // back to the live per-line sum for legacy receipts whose header was never
  // populated. The per-line rows below stay for detail only (no longer the total).
  const { preTaxTotal, whtAmount, grandTotal } = resolveReceiptFrozenTotals({
    headerTotalBefore,
    headerRamount,
    lineSumWithMao,
    showWht,
    itemsMissing,
  });

  const grandTotalThaiWord = readThaiBaht(grandTotal);

  // When items are missing, also patch the totals BREAKDOWN to put the
  // header total under "Total" (the most-prominent row) — the per-leg
  // breakdown (CHN/TH/Other/Discount) stays zero because we have no way to
  // reconstruct it without the items. Staff will see "Total = ฿N" and "all
  // other rows = ฿0" — clear signal that this receipt has missing details.
  const totalsForRender = itemsMissing
    ? {
        fTotal:           headerTotalBefore,
        fTransport:       0,
        fTransportCHNTHB: 0,
        priceOther:       0,
        fDiscount:        0,
      }
    : {
        fTotal:           totals.fTotal,
        fTransport:       totals.fTransport,
        fTransportCHNTHB: totals.fTransportCHNTHB,
        priceOther:       totals.priceOther,
        fDiscount:        totals.fDiscount,
      };

  // ── 8. Issuer address (2026-06-01 brand swap · owner GO) ──
  // Legacy printReceipt.php:293-297 had a 2025-03-20 cutover between two PCS
  // Cargo addresses; under Pacred there is one office address (the SOT in
  // components/seo/site.ts ADDRESSES.office). The cutover is retired.
  const issuerAddress = ADDRESSES.office.full;

  // ── 9. Pagination — shared with the ใบวางบิล so an order breaks pages
  // identically on both docs (legacy `$rowsPerPage = 13`; see rows-per-page.ts). ──
  const ROWS_PER_PAGE = DOC_ROWS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(computedItems.length / ROWS_PER_PAGE));
  const pages: ReceiptPageData[] = [];
  for (let p = 0; p < pageCount; p++) {
    pages.push({
      pageNumber: p + 1,
      rows: computedItems
        .slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE)
        .map((it) => it.row),
    });
  }

  const issueDate     = fmtDateLegacy(receipt.issuedate ?? receipt.rdatecreate);
  const rDateCreate   = fmtDateLegacy(receipt.rdatecreate);
  const documentIssuer   = receipt.documentissuer  || receipt.adminid || "-";
  const documentApprover = receipt.documentapprover || "";

  // ── อ้างอิง (meta-box) = the forwarder order-no(s) this receipt covers ──
  // The receipt's `refid` column is the หมายเหตุ/notes field (set only on the
  // manual path), NOT an order reference — so it can't drive อ้างอิง. The real
  // order-no is the per-line forwarder id (the "ออเดอร์ #N" column). Dedup the
  // line fids; cap at 3 + "(+N)" so the meta-box never overflows. Empty (e.g.
  // itemsMissing) → "" → the render falls back to the receipt no.
  const orderNos = Array.from(new Set(computedItems.map((it) => it.row.fid))).filter(Boolean);
  const referenceOrder =
    orderNos.length === 0
      ? ""
      : orderNos.length <= 3
        ? orderNos.map((n) => `#${n}`).join(", ")
        : `${orderNos.slice(0, 3).map((n) => `#${n}`).join(", ")} (+${orderNos.length - 3})`;

  const commonProps: ReceiptCommonProps = {
    rid:                 receipt.rid,
    issuerAddress,
    issueDate,
    rDateCreate,
    customerName,
    customerTaxId,
    customerAddress,
    totals:              totalsForRender,
    maoFee,
    showWht:             showWht || (itemsMissing && whtAmount > 0),
    whtAmount,
    grandTotal,
    preTaxTotal,
    grandTotalThaiWord,
    documentIssuer,
    documentApprover,
    pageCount,
    referenceOrder,
  };

  // ── 10. 50-ทวิ print gate (migration 0173 · ภูม 2026-06-10) ──
  // A corporate receipt that withholds WHT cannot be printed/downloaded by the
  // CUSTOMER (on /r/<token>) until the 50-ทวิ cert is uploaded AND admin-approved
  // (or admin-waived). Admin reprint is never gated. `receiptShowsWht` already
  // implies corporate (showWht = isCorporate && total ≥ 1000).
  const whtCertStatus = (receipt.wht_cert_status ?? "none") as
    "none" | "pending" | "approved" | "waived";
  const receiptShowsWht = showWht || (itemsMissing && whtAmount > 0);
  const printLocked =
    receiptShowsWht && whtCertStatus !== "approved" && whtCertStatus !== "waived";

  return {
    receipt: {
      id:           receipt.id,
      rid:          receipt.rid,
      statusprint:  receipt.statusprint,
      rdateprint:   receipt.rdateprint,
      adminidprint: receipt.adminidprint,
    },
    commonProps,
    pages,
    itemsMissing,
    whtCert: {
      status:     whtCertStatus,
      locked:     printLocked,
      certNo:     receipt.wht_cert_no ?? null,
      path:       receipt.wht_cert_path ?? null,
      uploadedAt: receipt.wht_cert_uploaded_at ?? null,
    },
  };
}
