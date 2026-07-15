"use server";

/**
 * Juristic doc re-stamp — self-service (owner 2026-07-15).
 *
 * When a customer is upgraded บุคคล → นิติบุคคล AFTER documents were already issued,
 * every ใบวางบิล / ใบเสร็จ is frozen with the old individual snapshot. The owner wants
 * STAFF to fix this themselves at upgrade time: see the related already-issued docs,
 * tick the ones to change (+ เลือกทั้งหมด), and Apply — no engineer, no script.
 *
 * `listCustomerJuristicDocs` → the customer's issuable documents + which still carry the
 * OLD (non-juristic / stale-name) identity. `adminRestampCustomerDocs` → re-stamp the
 * SELECTED docs to the customer's CURRENT registered identity (resolveBillingIdentity),
 * mirroring adminSetBillingRunBuyerIdentity: the invoice snapshot + the linked receipt.
 *
 * 💰 MONEY-SAFETY: identity is DISPLAY-only. total_thb / ramount / collected wallet+payment
 * records = UNTOUCHED. is_juristic drives ONLY the display WHT (the invoice recomputes it
 * live; the receipt pins to its frozen totals → a settled receipt whose pre-WHT == net shows
 * WHT ฿0 and the SAME paid amount even after flipping to นิติ). Never a re-charge.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";

const JURISTIC_ROLES = ["super", "manager", "ops", "accounting", "qa", "sales_admin", "sales"] as const;

export type RestampInvoiceRow = {
  id: number;
  docNo: string;
  status: string;
  currentName: string;
  isJuristic: boolean;
  /** true = already matches the current registered identity → nothing to change. */
  matches: boolean;
};
export type RestampReceiptRow = {
  rid: string;
  currentName: string;
  isJuristic: boolean;
  matches: boolean;
};
export type CustomerJuristicDocs = {
  identity: { isJuristic: boolean; name: string; taxId: string; registeredAddress: string };
  invoices: RestampInvoiceRow[];
  receipts: RestampReceiptRow[];
};

/** Resolve the customer's CURRENT registered identity (the target for a re-stamp). */
async function resolveCurrentIdentity(admin: ReturnType<typeof createAdminClient>, userid: string) {
  const [{ data: u }, { data: corp }] = await Promise.all([
    admin.from("tb_users").select("\"userCompany\", \"userName\", \"userLastName\"").eq("userID", userid)
      .maybeSingle<{ userCompany: string | null; userName: string | null; userLastName: string | null }>(),
    admin.from("tb_corporate").select("corporatename, corporatenumber, corporateaddress").eq("userid", userid)
      .maybeSingle<{ corporatename: string | null; corporatenumber: string | null; corporateaddress: string | null }>(),
  ]);
  return resolveBillingIdentity({
    userCompany: u?.userCompany, userName: u?.userName, userLastName: u?.userLastName, corp: corp ?? null,
  });
}

/**
 * List a customer's already-issued documents + whether each still carries the OLD
 * (non-current) identity. Non-cancelled invoices + active receipts only. Read-only.
 */
export async function listCustomerJuristicDocs(userid: string): Promise<AdminActionResult<CustomerJuristicDocs>> {
  const uid = (userid ?? "").trim().toUpperCase();
  if (!uid) return { ok: false, error: "invalid_userid" };
  return withAdmin<CustomerJuristicDocs>([...JURISTIC_ROLES], async () => {
    const admin = createAdminClient();
    const identity = await resolveCurrentIdentity(admin, uid);
    const targetName = identity.name.trim();
    const targetTax = identity.taxId.trim();

    const { data: invData, error: invErr } = await admin
      .from("tb_forwarder_invoice")
      .select("id, doc_no, status, is_juristic, buyer_name, buyer_tax_id")
      .eq("userid", uid)
      .neq("status", "cancelled")
      .order("date_issued", { ascending: true });
    if (invErr) {
      console.error("[listCustomerJuristicDocs invoices]", { uid, code: invErr.code, message: invErr.message });
      return { ok: false, error: invErr.message };
    }
    const invoices: RestampInvoiceRow[] = ((invData ?? []) as Array<{
      id: number; doc_no: string | null; status: string | null; is_juristic: boolean | null;
      buyer_name: string | null; buyer_tax_id: string | null;
    }>).map((r) => {
      const nm = (r.buyer_name ?? "").trim();
      const matches = identity.isJuristic
        ? !!r.is_juristic && nm === targetName && (r.buyer_tax_id ?? "").trim() === targetTax
        : !r.is_juristic && nm === targetName;
      return { id: r.id, docNo: (r.doc_no ?? `#${r.id}`).trim(), status: (r.status ?? "").trim(), currentName: nm, isJuristic: !!r.is_juristic, matches };
    });

    const { data: rcData, error: rcErr } = await admin
      .from("tb_receipt")
      .select("rid, corporatetype, recompname, recompnumber, rstatus")
      .eq("userid", uid)
      .neq("rstatus", "2")
      .order("rdatecreate", { ascending: true });
    if (rcErr) {
      console.error("[listCustomerJuristicDocs receipts]", { uid, code: rcErr.code, message: rcErr.message });
      return { ok: false, error: rcErr.message };
    }
    const receipts: RestampReceiptRow[] = ((rcData ?? []) as Array<{
      rid: string | null; corporatetype: string | null; recompname: string | null; recompnumber: string | null;
    }>).filter((r) => !!r.rid).map((r) => {
      const isJ = (r.corporatetype ?? "").trim() === "1";
      const nm = (r.recompname ?? "").trim();
      const matches = identity.isJuristic
        ? isJ && nm === targetName && (r.recompnumber ?? "").trim() === targetTax
        : !isJ && nm === targetName;
      return { rid: r.rid as string, currentName: nm, isJuristic: isJ, matches };
    });

    return {
      ok: true,
      data: {
        identity: { isJuristic: identity.isJuristic, name: identity.name, taxId: identity.taxId, registeredAddress: identity.registeredAddress },
        invoices, receipts,
      },
    };
  });
}

/**
 * Re-stamp the SELECTED documents to the customer's CURRENT registered identity.
 * Scoped to `userid` on every write (a doc that isn't the customer's is never touched).
 * Identity-only — no amount/status/collected-money change.
 */
export async function adminRestampCustomerDocs(
  userid: string,
  sel: { invoiceIds: number[]; receiptRids: string[] },
): Promise<AdminActionResult<{ invoices: number; receipts: number }>> {
  const uid = (userid ?? "").trim().toUpperCase();
  if (!uid) return { ok: false, error: "invalid_userid" };
  const invoiceIds = Array.from(new Set((sel.invoiceIds ?? []).filter((n) => Number.isInteger(n) && n > 0)));
  const receiptRids = Array.from(new Set((sel.receiptRids ?? []).map((s) => String(s).trim()).filter(Boolean)));
  if (invoiceIds.length === 0 && receiptRids.length === 0) return { ok: false, error: "ยังไม่ได้เลือกเอกสาร" };

  return withAdmin<{ invoices: number; receipts: number }>([...JURISTIC_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const identity = await resolveCurrentIdentity(admin, uid);
    if (identity.isJuristic && !/^\d{13}$/.test(identity.taxId)) {
      return { ok: false, error: "ลูกค้ายังไม่มีเลขผู้เสียภาษี 13 หลัก (อัพเกรดนิติให้ครบก่อน)" };
    }
    const isJ = identity.isJuristic;
    const name = identity.name;
    const taxId = isJ ? identity.taxId : "";
    const address = identity.registeredAddress;

    let invCount = 0;
    if (invoiceIds.length > 0) {
      const { data, error } = await admin
        .from("tb_forwarder_invoice")
        .update({ is_juristic: isJ, buyer_name: name, buyer_tax_id: taxId, buyer_address: address })
        .in("id", invoiceIds)
        .eq("userid", uid)                 // ownership scope
        .neq("status", "cancelled")
        .select("id");
      if (error) {
        console.error("[adminRestampCustomerDocs invoices]", { uid, code: error.code, message: error.message });
        return { ok: false, error: `อัพเดทใบวางบิลไม่สำเร็จ: ${error.message}` };
      }
      invCount = (data ?? []).length;
    }

    let rcCount = 0;
    if (receiptRids.length > 0) {
      const { data, error } = await admin
        .from("tb_receipt")
        .update({ corporatetype: isJ ? "1" : "2", recompname: name, recompnumber: taxId, recompaddress: address })
        .in("rid", receiptRids)
        .eq("userid", uid)                 // ownership scope
        .neq("rstatus", "2")
        .select("rid");
      if (error) {
        console.error("[adminRestampCustomerDocs receipts]", { uid, code: error.code, message: error.message });
        return { ok: false, error: `อัพเดทใบเสร็จไม่สำเร็จ: ${error.message}` };
      }
      rcCount = (data ?? []).length;
    }

    await logAdminAction(adminId, "customer.restamp_juristic_docs", "tb_users", uid, {
      isJuristic: isJ, name, taxId, invoices: invCount, receipts: rcCount, invoiceIds, receiptRids,
    });

    return { ok: true, data: { invoices: invCount, receipts: rcCount } };
  });
}
