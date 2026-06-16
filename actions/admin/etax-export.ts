"use server";

/**
 * actions/admin/etax-export.ts — e-Tax (RD Code 86) export from the live-lane
 * `tb_forwarder_tax_invoice*` family (migration 0129).
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §3.4 — Pacred has the per-class
 * WHT engine (`lib/tax/wht.ts`) + an RD-86-shaped invoice table; staff need
 * to be able to (a) bulk-list issued tax-invoices for accounting period
 * reconciliation, (b) download XML per Code 86 schema for RD e-Tax
 * submission, (c) download CSV for offline review.
 *
 * MVP scope (this sitting):
 *   - List issued tb_forwarder_tax_invoice rows in a date range
 *   - Per-row XML stub (Code 86 outline + headline financial figures)
 *   - CSV bundle (all rows · matching the XML's flattened columns)
 *   - Per-row PDF link — re-renders via the existing
 *     /admin/tax-invoices/[id] hook when applicable
 *
 * DEFERRED next sitting:
 *   - Full RD Code 86 XML schema with digital-signature block
 *     (XAdES-BES) + xs:schema validation
 *   - Submit-to-RD via e-Tax-by-Email or API (needs RD API creds)
 *   - 50-ทวิ certificate chasing UI (cert_status='pending' rows)
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getBusinessConfig } from "@/lib/business-config";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type EtaxRange = {
  dateFrom: string;
  dateTo:   string;
};

export type EtaxInvoiceRow = {
  id:                  number;
  serial_no:           string | null;
  userid:              string;
  buyer_name:          string;
  buyer_tax_id:        string;
  buyer_address:       string;
  buyer_branch:        string;
  is_juristic:         boolean;
  base_transport:      number;
  base_transport_intl: number;
  base_service:        number;
  base_rental:         number;
  base_goods:          number;
  base_total:          number;
  vatable_base:        number;
  vat_amount:          number;
  wht_total:           number;
  gross_before_wht:    number;
  net_payable:         number;
  vat_pct:             number;
  status:              "issued" | "cancelled";
  issued_at:           string;
  issued_by:           string;
  rid:                 string | null;
  receipt_id:          number | null;
};

export type EtaxBundle = {
  rows:       EtaxInvoiceRow[];
  totalCount: number;
  totalIssued:{ count: number; vat: number; wht: number; net: number };
};

// ── W9 (tax-invoice P4) — shop/yuan tax-invoice store READ ───────────────
// The tb_shop_tax_invoice store (mig 0152) is built DORMANT behind the
// business_config flag `tax_invoice.shop_yuan_enabled` (= OFF). Issuance is
// owner-gated; this is a READ-ONLY admin view so accounting can see the store
// + verify it's empty (or, once the owner flips the flag, monitor issuance).
export type ShopEtaxRow = {
  id:           number;
  service_type: "shop" | "yuan";
  serial_no:    string | null;
  userid:       string;
  buyer_name:   string;
  buyer_tax_id: string;
  is_juristic:  boolean;
  doc_mode:     "tax_invoice" | "customs";
  base_total:   number;
  vat_amount:   number;
  wht_total:    number;
  net_payable:  number;
  status:       "issued" | "cancelled";
  issued_at:    string;
  issued_by:    string;
  hno:          string | null;
  payment_id:   number | null;
};

export type ShopEtaxBundle = {
  rows:    ShopEtaxRow[];
  enabled: boolean;   // the live-gate flag state (false = store dormant)
  total:   { count: number; vat: number; net: number };
};

// ────────────────────────────────────────────────────────────────────────
// 1. LIST
// ────────────────────────────────────────────────────────────────────────

export async function getEtaxBundle(range: EtaxRange): Promise<EtaxBundle> {
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);
  const admin = createAdminClient();
  const gte = `${range.dateFrom}T00:00:00`;
  const lte = `${range.dateTo}T23:59:59`;

  type Raw = {
    id: number;
    serial_no: string | null;
    userid: string;
    buyer_name: string;
    buyer_tax_id: string;
    buyer_address: string;
    buyer_branch: string;
    is_juristic: boolean;
    base_transport: number | string | null;
    base_transport_intl: number | string | null;
    base_service: number | string | null;
    base_rental: number | string | null;
    base_goods: number | string | null;
    base_total: number | string | null;
    vatable_base: number | string | null;
    vat_amount: number | string | null;
    wht_total: number | string | null;
    gross_before_wht: number | string | null;
    net_payable: number | string | null;
    vat_pct: number | string | null;
    status: "issued" | "cancelled";
    issued_at: string;
    issued_by: string;
    rid: string | null;
    receipt_id: number | null;
  };
  const { data: rawRows, error } = await admin
    .from("tb_forwarder_tax_invoice")
    .select(
      "id, serial_no, userid, buyer_name, buyer_tax_id, buyer_address, buyer_branch, is_juristic, " +
      "base_transport, base_transport_intl, base_service, base_rental, base_goods, base_total, " +
      "vatable_base, vat_amount, wht_total, gross_before_wht, net_payable, vat_pct, status, " +
      "issued_at, issued_by, rid, receipt_id",
    )
    .gte("issued_at", gte)
    .lte("issued_at", lte)
    .order("issued_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[etax-export tb_forwarder_tax_invoice] failed", { code: error.code, message: error.message });
  }
  // Cast via `unknown` first — Supabase types haven't been regenerated after
  // migration 0129 added tb_forwarder_tax_invoice, so the inferred row type
  // is `{ error: true } & String` (unknown-table marker). Direct `as Raw[]`
  // fails TypeScript. `as unknown as Raw[]` is the canonical workaround.
  // 2026-06-02 ภูม session-start fix.
  const rows: EtaxInvoiceRow[] = ((rawRows ?? []) as unknown as Raw[]).map((r) => ({
    id:                  r.id,
    serial_no:           r.serial_no,
    userid:              r.userid,
    buyer_name:          r.buyer_name,
    buyer_tax_id:        r.buyer_tax_id,
    buyer_address:       r.buyer_address,
    buyer_branch:        r.buyer_branch,
    is_juristic:         r.is_juristic,
    base_transport:      Number(r.base_transport      ?? 0),
    base_transport_intl: Number(r.base_transport_intl ?? 0),
    base_service:        Number(r.base_service        ?? 0),
    base_rental:         Number(r.base_rental         ?? 0),
    base_goods:          Number(r.base_goods          ?? 0),
    base_total:          Number(r.base_total          ?? 0),
    vatable_base:        Number(r.vatable_base        ?? 0),
    vat_amount:          Number(r.vat_amount          ?? 0),
    wht_total:           Number(r.wht_total           ?? 0),
    gross_before_wht:    Number(r.gross_before_wht    ?? 0),
    net_payable:         Number(r.net_payable         ?? 0),
    vat_pct:             Number(r.vat_pct             ?? 7),
    status:              r.status,
    issued_at:           r.issued_at,
    issued_by:           r.issued_by,
    rid:                 r.rid,
    receipt_id:          r.receipt_id,
  }));

  const { count: totalCount, error: countErr } = await admin
    .from("tb_forwarder_tax_invoice")
    .select("id", { count: "exact", head: true });
  if (countErr) {
    console.error("[etax-export count] failed", { code: countErr.code, message: countErr.message });
  }

  const issued = rows.filter((r) => r.status === "issued");
  const totalIssued = {
    count: issued.length,
    vat:   issued.reduce((s, r) => s + r.vat_amount, 0),
    wht:   issued.reduce((s, r) => s + r.wht_total, 0),
    net:   issued.reduce((s, r) => s + r.net_payable, 0),
  };

  return { rows, totalCount: totalCount ?? rows.length, totalIssued };
}

// ────────────────────────────────────────────────────────────────────────
// 2. XML — pure builder lives in lib/etax/build-xml.ts
// ────────────────────────────────────────────────────────────────────────
//
// Note: cannot export a non-async `buildEtaxXml` from this file (Next 16
// rejects non-async-function value exports from a "use server" file at
// module-evaluation — same trap that bit ar-aging via AGING_BUCKETS).
// The pure XML builder lives at `lib/etax/build-xml.ts` for that reason;
// the page Server Component imports it directly.

// ────────────────────────────────────────────────────────────────────────
// 3. W9 — shop/yuan tax-invoice store READ (the dormant tb_shop_tax_invoice).
// ────────────────────────────────────────────────────────────────────────

export async function getShopEtaxBundle(range: EtaxRange): Promise<ShopEtaxBundle> {
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);
  const admin = createAdminClient();
  const gte = `${range.dateFrom}T00:00:00`;
  const lte = `${range.dateTo}T23:59:59`;

  // The live-gate flag — false = the shop/yuan issuance path is OFF (store stays
  // empty in prod). We surface its state so accounting knows why rows are empty.
  const flag = await getBusinessConfig<{ enabled: boolean }>("tax_invoice.shop_yuan_enabled", { enabled: false });

  type Raw = {
    id: number; service_type: "shop" | "yuan"; serial_no: string | null;
    userid: string; buyer_name: string; buyer_tax_id: string; is_juristic: boolean;
    doc_mode: "tax_invoice" | "customs";
    base_total: number | string | null; vat_amount: number | string | null;
    wht_total: number | string | null; net_payable: number | string | null;
    status: "issued" | "cancelled"; issued_at: string; issued_by: string;
    hno: string | null; payment_id: number | null;
  };
  const { data: raw, error } = await admin
    .from("tb_shop_tax_invoice")
    .select(
      "id, service_type, serial_no, userid, buyer_name, buyer_tax_id, is_juristic, doc_mode, " +
      "base_total, vat_amount, wht_total, net_payable, status, issued_at, issued_by, hno, payment_id",
    )
    .gte("issued_at", gte)
    .lte("issued_at", lte)
    .order("issued_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[etax-export tb_shop_tax_invoice] failed", { code: error.code, message: error.message });
  }
  const rows: ShopEtaxRow[] = ((raw ?? []) as unknown as Raw[]).map((r) => ({
    id:           r.id,
    service_type: r.service_type,
    serial_no:    r.serial_no,
    userid:       r.userid,
    buyer_name:   r.buyer_name,
    buyer_tax_id: r.buyer_tax_id,
    is_juristic:  r.is_juristic,
    doc_mode:     r.doc_mode,
    base_total:   Number(r.base_total  ?? 0),
    vat_amount:   Number(r.vat_amount  ?? 0),
    wht_total:    Number(r.wht_total   ?? 0),
    net_payable:  Number(r.net_payable ?? 0),
    status:       r.status,
    issued_at:    r.issued_at,
    issued_by:    r.issued_by,
    hno:          r.hno,
    payment_id:   r.payment_id,
  }));

  const issued = rows.filter((r) => r.status === "issued");
  return {
    rows,
    enabled: flag.enabled === true,
    total: {
      count: issued.length,
      vat:   issued.reduce((s, r) => s + r.vat_amount, 0),
      net:   issued.reduce((s, r) => s + r.net_payable, 0),
    },
  };
}
