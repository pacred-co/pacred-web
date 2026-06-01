/**
 * lib/etax/build-xml.ts — pure RD Code 86 XML builder.
 *
 * Lifted out of `actions/admin/etax-export.ts` because Next 16 'use server'
 * files reject ALL non-async function exports at module-evaluation (the same
 * trap that bit ar-aging via 0026-AGING_BUCKETS · ดู
 * docs/learnings/nextjs-16-quirks.md).
 *
 * Pure: no IO, no Supabase, no Next imports — safe to import from both the
 * server action (`actions/admin/etax-export.ts`) and the page Server
 * Component (`app/(admin)/admin/accounting/etax/page.tsx`).
 */

import type { EtaxInvoiceRow } from "@/actions/admin/etax-export";

function escapeXml(s: string): string {
  return s
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&apos;");
}

function fmtMoney(n: number): string {
  return n.toFixed(2);
}

/**
 * Build a Code 86 OUTLINE XML for one tax-invoice. MVP shape — real RD
 * e-Tax XML requires the full xs:schema + XAdES-BES digital signature
 * (deferred). This structure follows common Code 86 conventions so it
 * serves both as a preview of the data we'll need to populate AND as a
 * usable export for offline reconciliation.
 */
export function buildEtaxXml(row: EtaxInvoiceRow): string {
  const serialNo = row.serial_no ?? `TI-${row.id}`;
  const issueIso = row.issued_at.slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<TaxInvoice xmlns="urn:rd:etax:taxinvoice:v0.1-pacred-mvp" code="86">
  <DocumentCode>86</DocumentCode>
  <SerialNo>${escapeXml(serialNo)}</SerialNo>
  <IssueDate>${escapeXml(issueIso)}</IssueDate>
  <Status>${escapeXml(row.status)}</Status>

  <Seller>
    <Name>บริษัท แพคเรด (ประเทศไทย) จำกัด</Name>
    <NameEn>Pacred (Thailand) Co., Ltd.</NameEn>
    <TaxID>0105564077716</TaxID>
    <Branch>สำนักงานใหญ่</Branch>
  </Seller>

  <Buyer>
    <Name>${escapeXml(row.buyer_name)}</Name>
    <TaxID>${escapeXml(row.buyer_tax_id)}</TaxID>
    <Branch>${escapeXml(row.buyer_branch)}</Branch>
    <Address>${escapeXml(row.buyer_address)}</Address>
    <IsJuristic>${row.is_juristic ? "true" : "false"}</IsJuristic>
  </Buyer>

  <BaseAmounts currency="THB">
    <Transport>${fmtMoney(row.base_transport)}</Transport>
    <TransportIntl note="zero-rated VAT 0%">${fmtMoney(row.base_transport_intl)}</TransportIntl>
    <Service>${fmtMoney(row.base_service)}</Service>
    <Rental>${fmtMoney(row.base_rental)}</Rental>
    <Goods>${fmtMoney(row.base_goods)}</Goods>
    <Total>${fmtMoney(row.base_total)}</Total>
    <VatableBase>${fmtMoney(row.vatable_base)}</VatableBase>
  </BaseAmounts>

  <Vat pct="${row.vat_pct.toFixed(2)}">${fmtMoney(row.vat_amount)}</Vat>
  <WhtTotal>${fmtMoney(row.wht_total)}</WhtTotal>

  <Totals currency="THB">
    <GrossBeforeWht>${fmtMoney(row.gross_before_wht)}</GrossBeforeWht>
    <NetPayable>${fmtMoney(row.net_payable)}</NetPayable>
  </Totals>

  <PaymentRef>
    <UserId>${escapeXml(row.userid)}</UserId>
    <ReceiptRid>${escapeXml(row.rid ?? "")}</ReceiptRid>
    <ReceiptId>${row.receipt_id ?? ""}</ReceiptId>
  </PaymentRef>

  <Signature>
    <!-- DEFERRED: XAdES-BES signed envelope. Generated this MVP shape
         server-side without sealing for offline preview only. -->
    <Status>unsigned-preview</Status>
    <IssuedBy>${escapeXml(row.issued_by)}</IssuedBy>
  </Signature>
</TaxInvoice>
`;
}
