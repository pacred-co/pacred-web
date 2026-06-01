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

  // ── Shop + yuan: DEFERRED (ADR-0027). World-B has no cross-type table yet;
  //    the rebuilt twins are dead for real customers → don't read them, just
  //    surface a friendly "coming soon" the panel renders as a banner. ──
  if (d.order_type !== "forwarder") {
    return { ok: false, error: "not_yet_supported" };
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
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fstatus")
    .eq("id", fid)
    .maybeSingle<{ id: number; userid: string | null; fstatus: string | null }>();
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
  //    customer-request origin in the audit log.
  const issued = await issueForwarderTaxInvoice(admin, {
    userid:   memberCode,
    fids:     [fid],
    issuedBy: "customer-request",
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

  // Shop + yuan: no World-B store yet (ADR-0027) → nothing to show.
  if (orderType !== "forwarder") return { ok: true, data: null };

  const memberCode = await resolveMemberCode(user.id);
  if (!memberCode) return { ok: true, data: null };

  const idClean = orderId.replace(/[^a-z\d]/gi, "");
  const fid = Number(idClean);
  if (!Number.isFinite(fid) || fid <= 0) return { ok: true, data: null };

  const admin = createAdminClient();
  const inv = await readForwarderInvoiceByFid(admin, fid, memberCode);
  if (!inv) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      id:               String(inv.id),
      status:           inv.status,
      serial_no:        inv.serial_no,
      issued_at:        inv.issued_at,
      total_thb:        Number(inv.net_payable ?? 0),
      buyer_name:       inv.buyer_name ?? "",
      buyer_tax_id:     inv.buyer_tax_id ?? "",
      pdf_storage_path: inv.pdf_storage_path,
      created_at:       inv.created_at,
    },
  };
}
