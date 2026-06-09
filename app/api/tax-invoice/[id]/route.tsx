/**
 * GET /api/tax-invoice/[id]?store=forwarder|shop
 *
 * Streams the issued tax-invoice PDF for download. Used by:
 *   • Customer download button on /service-(import|order|payment)/.../invoice
 *     (components/tax-invoice-request-panel.tsx — knows its store from orderType)
 *   • Admin "ดู PDF" link on /admin/tax-invoices/[id]
 *
 * ── 2026-06-09 — repoint to the LIVE tb_* stores ──
 *   This route USED to read the World-A `tax_invoices` table (migration 0034) —
 *   the rebuilt/profiles-based twin that is 0-row on prod (no real invoice ever
 *   lands there). Every real ใบกำกับภาษี is issued into the tb_*-native stores:
 *     - forwarder lane → tb_forwarder_tax_invoice (+ _item + tb_forwarder_wht_entry)  [mig 0129]
 *     - shop + yuan    → tb_shop_tax_invoice      (+ _item + tb_shop_wht_entry)        [mig 0152]
 *   so the download was a guaranteed 404 for every real invoice. We now read the
 *   tb_* store, discriminated by the `?store=` query param:
 *     - store=forwarder (DEFAULT, back-compat) → tb_forwarder_tax_invoice (id = fwd-inv id)
 *     - store=shop                             → tb_shop_tax_invoice      (id = shop-inv id · covers shop AND yuan)
 *   The store param resolves the id-collision (forwarder invoice id 1 ≠ shop
 *   invoice id 1 — they are separate bigserial sequences).
 *
 * Auth & visibility:
 *   - We auth the SESSION (createClient().auth.getUser()) — must be signed in.
 *   - The tb_* stores are RLS service-role-only (tb_* convention), so visibility
 *     is enforced in code: the invoice row's `userid` (= tb_users.userID =
 *     profiles.member_code) must match the caller's member_code, OR the caller
 *     is an admin (getAdminRoles() non-null → can read any row, mirroring the
 *     admin /admin/tax-invoices list gate). If neither → 404.
 *   - We use the admin client for the row + line + WHT reads (tb_* default-deny);
 *     the ownership/admin check above is the access decision.
 *
 * Status handling:
 *   - status='issued' + pdf_storage_path set → stream file from Storage
 *   - status='issued' + no pdf yet           → render on the fly (defensive)
 *   - status='cancelled'                      → re-render with CANCELLED watermark
 *
 * Cache-Control: private, no-store — never cache (admin edits + cancellation
 * could change the response).
 *
 * NOTE: the admin /admin/tax-invoices/[id] page still READS the World-A
 *   `tax_invoices` table (the dead store) — its `id` is a tax_invoices.id, which
 *   won't resolve in the tb_* stores, so its PDF links (passing the default
 *   store=forwarder) cleanly 404 rather than crash. Repointing that admin LIST
 *   page to the tb_* stores is out of scope for this money-doc route fix.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { TaxInvoice, type TaxInvoiceData } from "@/components/pdf/tax-invoice";

export const runtime = "nodejs";          // @react-pdf/renderer needs node fs (font load)
export const dynamic = "force-dynamic";

type Store = "forwarder" | "shop";

/** Shared header shape across the two tb_* stores (the columns we map). */
type InvoiceHeader = {
  id:               number;
  userid:           string | null;
  serial_no:        string | null;
  status:           "issued" | "cancelled";
  issued_at:        string | null;
  created_at:       string;
  pdf_storage_path: string | null;
  buyer_name:       string | null;
  buyer_address:    string | null;
  buyer_tax_id:     string | null;
  buyer_branch:     string | null;
  base_total:       number | string | null;   // post-discount, pre-VAT subtotal
  vatable_base:     number | string | null;
  vat_amount:       number | string | null;
  vat_pct:          number | string | null;
  wht_total:        number | string | null;
  gross_before_wht: number | string | null;   // = base_total + vat
  net_payable:      number | string | null;    // = gross − wht
  // shop-store-only discriminator + source pointers (null on forwarder).
  service_type?:    "shop" | "yuan" | null;
  hno?:             string | null;
};

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── 0. Resolve the store from the query param (default forwarder · back-compat). ──
  const storeParam = new URL(req.url).searchParams.get("store");
  const store: Store = storeParam === "shop" ? "shop" : "forwarder";
  const invoiceId = Number(String(id).replace(/[^\d]/g, ""));
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ── 1. Auth — must be signed in. ──
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[tax-invoice route: getUser] failed`, { code: authErr.code, message: authErr.message });
  }
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── 2. Read the header from the resolved tb_* store. ──
  const headerTable = store === "shop" ? "tb_shop_tax_invoice" : "tb_forwarder_tax_invoice";
  const headerCols =
    "id, userid, serial_no, status, issued_at, created_at, pdf_storage_path, " +
    "buyer_name, buyer_address, buyer_tax_id, buyer_branch, " +
    "base_total, vatable_base, vat_amount, vat_pct, wht_total, gross_before_wht, net_payable" +
    (store === "shop" ? ", service_type, hno" : "");

  const { data: header, error: headerErr } = await admin
    .from(headerTable)
    .select(headerCols)
    .eq("id", invoiceId)
    .maybeSingle<InvoiceHeader>();
  if (headerErr) {
    console.error(`[${headerTable} lookup] failed`, { code: headerErr.code, message: headerErr.message });
  }
  if (!header) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ── 3. Visibility — owner OR admin. ──
  const memberCode = await resolveMemberCode(admin, user.id);
  const isOwner = !!memberCode && (header.userid ?? "") === memberCode;
  if (!isOwner) {
    const roles = await getAdminRoles();   // any admin role can view any tax invoice
    if (!roles) {
      return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
    }
  }

  registerPdfFonts();
  const filename = `pacred-${header.serial_no ?? `${store}-${invoiceId}`}.pdf`;

  // ── 4A. Issued — stream the stored PDF when present. ──
  if (header.status === "issued" && header.pdf_storage_path) {
    const { data: blob, error: dlErr } = await admin.storage
      .from("tax-invoices")
      .download(header.pdf_storage_path);
    if (!dlErr && blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      return pdfResponse(buf, filename);
    }
    // Storage object missing → fall through to on-the-fly render.
  }

  // ── 4B. Issued-without-pdf OR cancelled → render on the fly. ──
  const data = await buildTaxInvoiceData(admin, store, header);
  const buffer = await renderToBuffer(<TaxInvoice data={data} />);
  return pdfResponse(buffer, filename);
}

// ── helpers ──────────────────────────────────────────────────────────

function pdfResponse(buf: Buffer, filename: string): NextResponse {
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}

/** auth uuid → profiles.member_code (= tb_users.userID). */
async function resolveMemberCode(
  admin: ReturnType<typeof createAdminClient>,
  authUserId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", authUserId)
    .maybeSingle<{ member_code: string | null }>();
  if (error) {
    console.error(`[tax-invoice route: profiles member_code] failed`, { code: error.code, message: error.message });
    return null;
  }
  return data?.member_code ?? null;
}

/**
 * Map a tb_* invoice (header + line items + per-class WHT entries) → the
 * existing TaxInvoiceData shape consumed by the <TaxInvoice> PDF renderer.
 *
 * - Subtotal = base_total (post-discount, pre-VAT) · VAT = vat_amount ·
 *   total = gross_before_wht (= subtotal + VAT). VAT is always exclusive in the
 *   tb_* stores (the engine adds 7% on top of the vatable base).
 * - Lines: one summary row per source order (forwarder fid / shop hno) built
 *   from the item buckets — amount = the row's pre-VAT value.
 * - WHT: the stores keep PER-CLASS rows (transport/service/rental/goods). The
 *   renderer prints ONE combined WHT block, so we aggregate amount + base and
 *   pick a representative rate. We render it only when wht_total > 0.
 */
async function buildTaxInvoiceData(
  admin: ReturnType<typeof createAdminClient>,
  store: Store,
  h: InvoiceHeader,
): Promise<TaxInvoiceData> {
  const subtotal = num(h.base_total);
  const vat      = num(h.vat_amount);
  const total    = num(h.gross_before_wht) || (subtotal + vat);
  const whtTotal = num(h.wht_total);
  const netThb   = num(h.net_payable) || (total - whtTotal);

  // ── Line items ──
  const lines = store === "shop"
    ? await buildShopLines(admin, h.id)
    : await buildForwarderLines(admin, h.id);

  // ── WHT (aggregate per-class rows → one block) ──
  const whtTable = store === "shop" ? "tb_shop_wht_entry" : "tb_forwarder_wht_entry";
  const { data: whtRows, error: whtErr } = await admin
    .from(whtTable)
    .select("wht_class, wht_base_thb, wht_rate_pct, wht_amount_thb, cert_status, cert_number")
    .eq("invoice_id", h.id);
  if (whtErr) {
    console.error(`[${whtTable} list] failed`, { code: whtErr.code, message: whtErr.message });
  }
  type WhtRow = {
    wht_class:      string;
    wht_base_thb:   number | string | null;
    wht_rate_pct:   number | string | null;
    wht_amount_thb: number | string | null;
    cert_status:    "pending" | "received" | "waived" | null;
    cert_number:    string | null;
  };
  const rows = (whtRows ?? []) as WhtRow[];
  const aggBase = rows.reduce((s, r) => s + num(r.wht_base_thb), 0);
  const aggAmt  = rows.reduce((s, r) => s + num(r.wht_amount_thb), 0);
  // Single rate when all classes share it (the common 1%/3% case); else derive
  // the effective rate from the aggregate (base · amount).
  const distinctRates = Array.from(new Set(rows.map((r) => num(r.wht_rate_pct)).filter((x) => x > 0)));
  const aggRate = distinctRates.length === 1
    ? distinctRates[0]
    : (aggBase > 0 ? Math.round((aggAmt / aggBase) * 10000) / 100 : 0);
  const certNumber = rows.find((r) => r.cert_number)?.cert_number ?? null;
  // The renderer's cert_status type is "received" | "waived" (no "pending").
  // The WHT block is informational (the grand total stays gross per RD Code 86);
  // surface "waived" unless every class cert is already received.
  const allReceived = rows.length > 0 && rows.every((r) => r.cert_status === "received");

  const wht = whtTotal > 0
    ? {
        base_thb:    aggBase,
        rate_pct:    aggRate,
        amount_thb:  aggAmt || whtTotal,
        net_thb:     netThb,
        cert_status: (allReceived ? "received" : "waived") as "received" | "waived",
        cert_number: certNumber,
      }
    : null;

  return {
    serial_no:      h.serial_no,
    status:         h.status,
    issued_at:      h.issued_at,
    created_at:     h.created_at,
    buyer_name:     h.buyer_name ?? "",
    buyer_address:  h.buyer_address ?? "",
    buyer_tax_id:   h.buyer_tax_id ?? "",
    buyer_branch:   h.buyer_branch ?? "สำนักงานใหญ่",
    subtotal_thb:   subtotal,
    vat_thb:        vat,
    total_thb:      total,
    vat_mode:       "exclusive",
    payment_method: "โอนผ่านธนาคาร",
    lines,
    // Ref label on the invoice — forwarder shows the fNo, shop shows the hno.
    order_h_no:     store === "shop" ? (h.hno ?? null) : null,
    forwarder_f_no: store === "forwarder" ? (String(lines[0]?.position ?? "") || null) : null,
    wht,
  };
}

/** Forwarder line items — one row per covered tb_forwarder row (fid). */
async function buildForwarderLines(
  admin: ReturnType<typeof createAdminClient>,
  invoiceId: number,
): Promise<TaxInvoiceData["lines"]> {
  const { data: items, error } = await admin
    .from("tb_forwarder_tax_invoice_item")
    .select("fid, ftotalprice, ftransportprice, ftransportpricechnthb, fshippingservice, pricecrate, priceother, fpriceupdate, fdiscount")
    .eq("invoice_id", invoiceId)
    .order("fid", { ascending: true });
  if (error) {
    console.error(`[tb_forwarder_tax_invoice_item list] failed`, { code: error.code, message: error.message });
  }
  type Item = {
    fid: number;
    ftotalprice: number | string | null;
    ftransportprice: number | string | null;
    ftransportpricechnthb: number | string | null;
    fshippingservice: number | string | null;
    pricecrate: number | string | null;
    priceother: number | string | null;
    fpriceupdate: number | string | null;
    fdiscount: number | string | null;
  };
  const rows = (items ?? []) as Item[];
  return rows.map((r, i) => {
    const amount =
      num(r.ftotalprice) + num(r.ftransportprice) + num(r.ftransportpricechnthb) +
      num(r.fshippingservice) + num(r.pricecrate) + num(r.priceother) + num(r.fpriceupdate) -
      num(r.fdiscount);
    return {
      position:       Number(r.fid) || i + 1,
      description:    `บริการนำเข้า (ฝากนำเข้า) เลขที่ ${r.fid}`,
      qty:            1,
      unit_price_thb: amount,
      amount_thb:     amount,
      vat_thb:        0,
    };
  });
}

/** Shop/yuan line items — one row per source order (hno / payment_id). */
async function buildShopLines(
  admin: ReturnType<typeof createAdminClient>,
  invoiceId: number,
): Promise<TaxInvoiceData["lines"]> {
  const { data: items, error } = await admin
    .from("tb_shop_tax_invoice_item")
    .select("hno, payment_id, goods_thb, service_thb, transport_thb, transport_intl_thb, discount_thb")
    .eq("invoice_id", invoiceId)
    .order("id", { ascending: true });
  if (error) {
    console.error(`[tb_shop_tax_invoice_item list] failed`, { code: error.code, message: error.message });
  }
  type Item = {
    hno: string | null;
    payment_id: number | null;
    goods_thb: number | string | null;
    service_thb: number | string | null;
    transport_thb: number | string | null;
    transport_intl_thb: number | string | null;
    discount_thb: number | string | null;
  };
  const rows = (items ?? []) as Item[];
  return rows.map((r, i) => {
    const amount =
      num(r.goods_thb) + num(r.service_thb) + num(r.transport_thb) +
      num(r.transport_intl_thb) - num(r.discount_thb);
    const ref = r.hno ?? (r.payment_id != null ? `#${r.payment_id}` : "");
    return {
      position:       i + 1,
      description:    ref ? `บริการ Pacred — ออเดอร์ ${ref}` : "บริการ Pacred",
      qty:            1,
      unit_price_thb: amount,
      amount_thb:     amount,
      vat_thb:        0,
    };
  });
}
