"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requestTaxInvoiceSchema,
  type RequestTaxInvoiceInput,
} from "@/lib/validators/tax-invoice";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { issueForwarderTaxInvoice } from "@/lib/admin/forwarder-tax-invoice";
import { issueShopTaxInvoice } from "@/lib/admin/shop-tax-invoice";
import { issueYuanTaxInvoice } from "@/lib/admin/yuan-tax-invoice";
import { isShopYuanTaxInvoiceEnabled } from "@/lib/tax/shop-yuan-flag";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";

/**
 * Customer-side tax invoice actions.
 *
 * ── 2026-06-02 — World-B repoint (ADR-0027) ───────────────────────────
 * The forwarder branch now reads the LIVE `tb_forwarder` lane and issues the
 * ใบกำกับภาษี through ภูม's World-B engine (`issueForwarderTaxInvoice` →
 * `tb_forwarder_tax_invoice`). The old World-A path read the rebuilt 0-row
 * `forwarders` table → it failed for every real (legacy `tb_forwarder`)
 * customer. World-B keys off `tb_users.userID` (= `profiles.member_code`)
 * and `tb_forwarder.id` (the numeric [fNo] in the URL) — see migration 0129.
 *
 * Shop (`tb_header_order`) + yuan (`tb_payment`) customer-request are DEFERRED
 * behind a friendly banner: World-B has no cross-type tax-invoice table yet
 * (only forwarder). We do NOT keep reading the dead rebuilt twins (they fail) —
 * we return `not_yet_supported` so the panel renders "กำลังพัฒนา".
 *
 * ── Forwarder eligibility + idempotency ───────────────────────────────
 *   - Ownership: `tb_forwarder.userid` must equal the caller's member_code.
 *   - Billable: the order must be paid (fstatus past '5'=รอชำระเงิน → '6'/'7').
 *   - `issueForwarderTaxInvoice` is idempotent on the forwarder id (one invoice
 *     line per fid) → re-request returns the existing invoice (already_exists).
 *     This also converges safely with the auto-receipt hook
 *     (lib/admin/auto-issue-receipt.ts) which issues the same invoice at
 *     payment-land when tax_doc_pref='tax_invoice'.
 */

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type RequestResult = { id: string; status: string; already_exists: boolean };

// ────────────────────────────────────────────────────────────
// member_code resolver (auth uuid → tb_users.userID = profiles.member_code)
// ────────────────────────────────────────────────────────────
async function resolveMemberCode(authUserId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", authUserId)
    .maybeSingle<{ member_code: string | null }>();
  if (error) {
    console.error(`[tax-invoice: profiles member_code lookup] failed`, {
      code: error.code, message: error.message, profile_id: authUserId,
    });
    return null;
  }
  return data?.member_code ?? null;
}

// ────────────────────────────────────────────────────────────
// REQUEST tax invoice (customer)
// ────────────────────────────────────────────────────────────

export async function requestTaxInvoice(
  input: RequestTaxInvoiceInput,
): Promise<ActionResult<RequestResult>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = requestTaxInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase getUser] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // ── Shop + yuan (migration 0152) — LIVE only when the flag is ON. ──
  //    🔴 Flag tax_invoice.shop_yuan_enabled (default OFF) gates the whole shop/
  //    yuan customer-request path. When OFF we keep the legacy "coming soon"
  //    behaviour (not_yet_supported → panel renders the deferred banner) so
  //    deploying changes nothing. Forwarder is always live (its own store · 0129).
  if (d.order_type === "service_order") {
    if (!(await isShopYuanTaxInvoiceEnabled())) {
      return { ok: false, error: "not_yet_supported" };
    }
    return requestShopTaxInvoice(user.id, d.order_id);
  }
  if (d.order_type === "yuan_payment") {
    if (!(await isShopYuanTaxInvoiceEnabled())) {
      return { ok: false, error: "not_yet_supported" };
    }
    return requestYuanTaxInvoice(user.id, d.order_id);
  }

  // ── FORWARDER → World-B (tb_forwarder + issueForwarderTaxInvoice) ──
  const memberCode = await resolveMemberCode(user.id);
  if (!memberCode) return { ok: false, error: "no_member_code" };

  // The URL [fNo] segment IS the numeric tb_forwarder.id (mirror the invoice
  // page + actions/forwarder.ts — sanitise then Number()).
  const idClean = d.order_id.replace(/[^a-z\d]/gi, "");
  const fid = Number(idClean);
  if (!Number.isFinite(fid) || fid <= 0) return { ok: false, error: "order_not_found" };

  const admin = createAdminClient();

  // 1. Read the forwarder row + ownership gate (tb_forwarder.userid == member_code).
  //    Also read tax_doc_pref so we issue the RIGHT document mode (ใบกำกับ vs
  //    ใบขน) — the customer chose this at order time (migration 0127).
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fstatus, tax_doc_pref")
    .eq("id", fid)
    .maybeSingle<{ id: number; userid: string | null; fstatus: string | null; tax_doc_pref: string | null }>();
  if (fwdErr) {
    console.error(`[tax-invoice: tb_forwarder lookup] failed`, {
      code: fwdErr.code, message: fwdErr.message, fid, memberCode,
    });
    return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
  }
  if (!fwd)                               return { ok: false, error: "order_not_found" };
  if ((fwd.userid ?? "") !== memberCode)  return { ok: false, error: "not_your_order" };

  // 2. Billable gate — must be paid (legacy fstatus: 5=รอชำระเงิน · 6=เตรียมส่ง ·
  //    7=ส่งแล้ว). Cancelled forwarders never get an invoice. A tax invoice is
  //    only issuable once the order is paid (past '5').
  const fStatus = (fwd.fstatus ?? "").trim();
  if (fStatus === "" || fStatus === "0") return { ok: false, error: "order_not_found" };
  if (!(fStatus === "6" || fStatus === "7")) {
    return { ok: false, error: "order_not_paid_yet" };
  }

  // 3. Idempotency — already on a World-B tax invoice? Return it.
  const existing = await readForwarderInvoiceByFid(admin, fid, memberCode);
  if (existing) {
    return {
      ok: true,
      data: { id: String(existing.id), status: existing.status, already_exists: true },
    };
  }

  // 4. Issue via ภูม's engine (idempotent on fid; computes per-line tax +
  //    buyer snapshot from tb_corporate/tb_users itself). issuedBy marks the
  //    customer-request origin in the audit log. The mode comes from the
  //    order's tax_doc_pref (ใบกำกับ vs ใบขน); if the order was 'receipt'/NULL
  //    (ไม่รับเอกสาร) but the customer is now actively REQUESTING a tax doc,
  //    issue the standard ใบกำกับภาษี.
  const storedMode = modeFromPref(fwd.tax_doc_pref);
  const issueMode = storedMode === "none" ? "tax_invoice" : storedMode;
  const issued = await issueForwarderTaxInvoice(admin, {
    userid:   memberCode,
    fids:     [fid],
    issuedBy: "customer-request",
    mode:     issueMode,
  });

  if (!issued.ok) {
    // Engine reports an already-issued race → re-read + return idempotently.
    if (issued.alreadyIssued) {
      const raced = await readForwarderInvoiceByFid(admin, fid, memberCode);
      if (raced) {
        return {
          ok: true,
          data: { id: String(raced.id), status: raced.status, already_exists: true },
        };
      }
    }
    return { ok: false, error: issued.error };
  }

  // Customer views the bill at the live invoice page (forwarder …/receipt is a
  // redirect → …/invoice).
  revalidatePath(`/service-import/${fid}/invoice`);

  return {
    ok: true,
    data: { id: String(issued.data.invoiceId), status: "issued", already_exists: false },
  };
}

// ────────────────────────────────────────────────────────────
// SHOP (ฝากสั่งซื้อ · tb_header_order) customer request → migration 0152.
// (Not exported — internal helper called by requestTaxInvoice when the flag is
//  ON. A "use server" file may only EXPORT async fns; non-exported is fine.)
// ────────────────────────────────────────────────────────────
async function requestShopTaxInvoice(
  authUserId: string,
  orderId: string,
): Promise<ActionResult<RequestResult>> {
  const memberCode = await resolveMemberCode(authUserId);
  if (!memberCode) return { ok: false, error: "no_member_code" };

  // The hno is a text key (e.g. ONS260601-0001). Trust it as-is (ownership
  // gate below) but reject empties.
  const hno = orderId.trim();
  if (!hno) return { ok: false, error: "order_not_found" };

  const admin = createAdminClient();

  // 1. Read the shop order + ownership gate + paid gate + tax-doc mode.
  const { data: ho, error: hoErr } = await admin
    .from("tb_header_order")
    .select("hno, userid, hstatus, tax_doc_pref")
    .eq("hno", hno)
    .maybeSingle<{ hno: string; userid: string | null; hstatus: string | null; tax_doc_pref: string | null }>();
  if (hoErr && hoErr.code !== "PGRST116") {
    console.error(`[tax-invoice: tb_header_order lookup] failed`, {
      code: hoErr.code, message: hoErr.message, hno, memberCode,
    });
    return { ok: false, error: `db_error:${hoErr.code ?? "unknown"}` };
  }
  if (!ho)                              return { ok: false, error: "order_not_found" };
  if ((ho.userid ?? "") !== memberCode) return { ok: false, error: "not_your_order" };

  // Billable gate — shop hstatus: 1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า
  // 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิก. A tax doc needs the order paid (past '2').
  const hStatus = (ho.hstatus ?? "").trim();
  if (hStatus === "6" || hStatus === "")    return { ok: false, error: "order_not_found" };
  if (hStatus === "1" || hStatus === "2")   return { ok: false, error: "order_not_paid_yet" };

  // 2. Idempotency.
  const existing = await readShopInvoiceByHno(admin, hno, memberCode);
  if (existing) {
    return { ok: true, data: { id: String(existing.id), status: existing.status, already_exists: true } };
  }

  // 3. Issue. Mode from the order's stored choice; if it was 'receipt'/NULL but
  //    the customer now actively requests a doc → standard ใบกำกับภาษี.
  const storedMode = modeFromPref(ho.tax_doc_pref);
  const issueMode = storedMode === "none" ? "tax_invoice" : storedMode;
  const issued = await issueShopTaxInvoice(admin, {
    userid:   memberCode,
    hno,
    issuedBy: "customer-request",
    mode:     issueMode,
  });
  if (!issued.ok) {
    if (issued.alreadyIssued) {
      const raced = await readShopInvoiceByHno(admin, hno, memberCode);
      if (raced) return { ok: true, data: { id: String(raced.id), status: raced.status, already_exists: true } };
    }
    return { ok: false, error: issued.error };
  }

  revalidatePath(`/service-order/${hno}/receipt`);
  return { ok: true, data: { id: String(issued.data.invoiceId), status: "issued", already_exists: false } };
}

// ────────────────────────────────────────────────────────────
// YUAN (ฝากโอน · tb_payment) customer request → migration 0152.
// ────────────────────────────────────────────────────────────
async function requestYuanTaxInvoice(
  authUserId: string,
  orderId: string,
): Promise<ActionResult<RequestResult>> {
  const memberCode = await resolveMemberCode(authUserId);
  if (!memberCode) return { ok: false, error: "no_member_code" };

  const idClean = orderId.replace(/[^\d]/g, "");
  const paymentId = Number(idClean);
  if (!Number.isFinite(paymentId) || paymentId <= 0) return { ok: false, error: "order_not_found" };

  const admin = createAdminClient();

  // 1. Read the payment + ownership + completed gate + tax-doc mode.
  const { data: pay, error: payErr } = await admin
    .from("tb_payment")
    .select("id, userid, paystatus, tax_doc_pref")
    .eq("id", paymentId)
    .maybeSingle<{ id: number; userid: string | null; paystatus: string | null; tax_doc_pref: string | null }>();
  if (payErr && payErr.code !== "PGRST116") {
    console.error(`[tax-invoice: tb_payment lookup] failed`, {
      code: payErr.code, message: payErr.message, paymentId, memberCode,
    });
    return { ok: false, error: `db_error:${payErr.code ?? "unknown"}` };
  }
  if (!pay)                              return { ok: false, error: "order_not_found" };
  if ((pay.userid ?? "") !== memberCode) return { ok: false, error: "not_your_order" };
  // "ฝากโอนกับเราเท่านั้น" — only a COMPLETED (paystatus='2') transfer qualifies.
  if ((pay.paystatus ?? "").trim() !== "2") return { ok: false, error: "order_not_paid_yet" };

  // 2. Idempotency.
  const existing = await readYuanInvoiceByPaymentId(admin, paymentId, memberCode);
  if (existing) {
    return { ok: true, data: { id: String(existing.id), status: existing.status, already_exists: true } };
  }

  // 3. Issue.
  const storedMode = modeFromPref(pay.tax_doc_pref);
  const issueMode = storedMode === "none" ? "tax_invoice" : storedMode;
  const issued = await issueYuanTaxInvoice(admin, {
    userid:    memberCode,
    paymentId,
    issuedBy:  "customer-request",
    mode:      issueMode,
  });
  if (!issued.ok) {
    if (issued.alreadyIssued) {
      const raced = await readYuanInvoiceByPaymentId(admin, paymentId, memberCode);
      if (raced) return { ok: true, data: { id: String(raced.id), status: raced.status, already_exists: true } };
    }
    return { ok: false, error: issued.error };
  }

  revalidatePath(`/service-payment/${paymentId}`);
  return { ok: true, data: { id: String(issued.data.invoiceId), status: "issued", already_exists: false } };
}

// ────────────────────────────────────────────────────────────
// READ — customer fetches their existing invoice (for showing
// "already requested — status: issued" on the invoice page)
// ────────────────────────────────────────────────────────────

export type CustomerTaxInvoiceSummary = {
  id:           string;
  status:       "pending" | "issued" | "cancelled";
  serial_no:    string | null;
  issued_at:    string | null;
  total_thb:    number;
  buyer_name:   string;
  buyer_tax_id: string;
  pdf_storage_path: string | null;
  created_at:   string;
};

type ForwarderInvoiceRow = {
  id:               number;
  serial_no:        string | null;
  status:           "issued" | "cancelled";
  issued_at:        string | null;
  net_payable:      number | string | null;
  buyer_name:       string | null;
  buyer_tax_id:     string | null;
  pdf_storage_path: string | null;
  created_at:       string;
};

// Read the World-B forwarder tax invoice covering `fid` (owned by member_code).
// tb_forwarder_tax_invoice_item.fid → invoice_id → tb_forwarder_tax_invoice.
async function readForwarderInvoiceByFid(
  admin: ReturnType<typeof createAdminClient>,
  fid: number,
  memberCode: string,
): Promise<ForwarderInvoiceRow | null> {
  const { data: link, error: linkErr } = await admin
    .from("tb_forwarder_tax_invoice_item")
    .select("invoice_id, fid")
    .eq("fid", fid)
    .maybeSingle<{ invoice_id: number; fid: number }>();
  if (linkErr) {
    console.error(`[tax-invoice: tb_forwarder_tax_invoice_item lookup] failed`, {
      code: linkErr.code, message: linkErr.message, fid,
    });
    return null;
  }
  if (!link?.invoice_id) return null;

  const { data: inv, error: invErr } = await admin
    .from("tb_forwarder_tax_invoice")
    .select("id, serial_no, status, issued_at, net_payable, buyer_name, buyer_tax_id, pdf_storage_path, created_at, userid")
    .eq("id", link.invoice_id)
    .maybeSingle<ForwarderInvoiceRow & { userid: string | null }>();
  if (invErr) {
    console.error(`[tax-invoice: tb_forwarder_tax_invoice lookup] failed`, {
      code: invErr.code, message: invErr.message, invoice_id: link.invoice_id,
    });
    return null;
  }
  if (!inv) return null;
  // Ownership double-gate — the invoice userid must match the caller.
  if ((inv.userid ?? "") !== memberCode) return null;
  return inv;
}

// Shop + yuan store (migration 0152) — same row shape as forwarder.
type ShopInvoiceRow = ForwarderInvoiceRow;

// Read the shop ใบกำกับ covering `hno` (owned by member_code) from tb_shop_tax_invoice.
async function readShopInvoiceByHno(
  admin: ReturnType<typeof createAdminClient>,
  hno: string,
  memberCode: string,
): Promise<ShopInvoiceRow | null> {
  const { data: inv, error: invErr } = await admin
    .from("tb_shop_tax_invoice")
    .select("id, serial_no, status, issued_at, net_payable, buyer_name, buyer_tax_id, pdf_storage_path, created_at, userid")
    .eq("service_type", "shop")
    .eq("hno", hno)
    .maybeSingle<ShopInvoiceRow & { userid: string | null }>();
  if (invErr && invErr.code !== "PGRST116") {
    console.error(`[tax-invoice: tb_shop_tax_invoice (shop) lookup] failed`, {
      code: invErr.code, message: invErr.message, hno,
    });
    return null;
  }
  if (!inv) return null;
  if ((inv.userid ?? "") !== memberCode) return null;
  return inv;
}

// Read the yuan ใบกำกับ covering `payment_id` (owned by member_code).
async function readYuanInvoiceByPaymentId(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: number,
  memberCode: string,
): Promise<ShopInvoiceRow | null> {
  const { data: inv, error: invErr } = await admin
    .from("tb_shop_tax_invoice")
    .select("id, serial_no, status, issued_at, net_payable, buyer_name, buyer_tax_id, pdf_storage_path, created_at, userid")
    .eq("service_type", "yuan")
    .eq("payment_id", paymentId)
    .maybeSingle<ShopInvoiceRow & { userid: string | null }>();
  if (invErr && invErr.code !== "PGRST116") {
    console.error(`[tax-invoice: tb_shop_tax_invoice (yuan) lookup] failed`, {
      code: invErr.code, message: invErr.message, paymentId,
    });
    return null;
  }
  if (!inv) return null;
  if ((inv.userid ?? "") !== memberCode) return null;
  return inv;
}

function toSummary(inv: ForwarderInvoiceRow): CustomerTaxInvoiceSummary {
  return {
    id:               String(inv.id),
    status:           inv.status,
    serial_no:        inv.serial_no,
    issued_at:        inv.issued_at,
    total_thb:        Number(inv.net_payable ?? 0),
    buyer_name:       inv.buyer_name ?? "",
    buyer_tax_id:     inv.buyer_tax_id ?? "",
    pdf_storage_path: inv.pdf_storage_path,
    created_at:       inv.created_at,
  };
}

export async function getMyTaxInvoiceForOrder(
  orderType: "forwarder" | "service_order" | "yuan_payment",
  orderId:   string,
): Promise<ActionResult<CustomerTaxInvoiceSummary | null>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase getUser] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const memberCode = await resolveMemberCode(user.id);
  if (!memberCode) return { ok: true, data: null };

  const admin = createAdminClient();

  if (orderType === "forwarder") {
    const idClean = orderId.replace(/[^a-z\d]/gi, "");
    const fid = Number(idClean);
    if (!Number.isFinite(fid) || fid <= 0) return { ok: true, data: null };
    const inv = await readForwarderInvoiceByFid(admin, fid, memberCode);
    return { ok: true, data: inv ? toSummary(inv) : null };
  }

  // Shop + yuan (migration 0152) — only surface when the flag is ON. When OFF
  // we return null so the panel renders the deferred banner (no behaviour
  // change on a dormant deploy).
  if (!(await isShopYuanTaxInvoiceEnabled())) return { ok: true, data: null };

  if (orderType === "service_order") {
    const hno = orderId.trim();
    if (!hno) return { ok: true, data: null };
    const inv = await readShopInvoiceByHno(admin, hno, memberCode);
    return { ok: true, data: inv ? toSummary(inv) : null };
  }

  // yuan_payment
  const idClean = orderId.replace(/[^\d]/g, "");
  const paymentId = Number(idClean);
  if (!Number.isFinite(paymentId) || paymentId <= 0) return { ok: true, data: null };
  const inv = await readYuanInvoiceByPaymentId(admin, paymentId, memberCode);
  return { ok: true, data: inv ? toSummary(inv) : null };
}
