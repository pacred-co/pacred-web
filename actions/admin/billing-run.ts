"use server";

/**
 * Server Actions for the ใบวางบิล / billing-run R-2 port.
 *
 * Spec: docs/audit/billing-run-port-2026-06-03.md
 * Tables: tb_forwarder_invoice + tb_forwarder_invoice_item (migration 0138)
 * Doc-no minter: lib/admin/mint-receipt-doc-no.ts → mintForwarderInvoiceDocNo
 *
 * Surface area:
 *   - listEligibleCustomers   → customers with ≥1 fStatus=5 forwarder
 *   - listEligibleForwarders  → fStatus=5 forwarders for one customer NOT already
 *                                on a non-cancelled invoice
 *   - getInvoiceList          → paginated list with filters (status/date)
 *   - getInvoiceDetail        → header + items + buyer info
 *   - createBillingRunInvoice → mint doc-no + INSERT header + N items
 *   - markBillingRunPaid      → flip status='paid' + payment trail
 *   - cancelBillingRunInvoice → flip status='cancelled' + reason
 *
 * Auth: super + accounting + ops. The legacy admin gate (hs-forwarder-invoice
 *       was super-only) is softened slightly so the same finance staff who run
 *       /admin/forwarders/combine-bill can run this too.
 *
 * Mirrors §0c discipline: every Supabase query destructures `error`.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { mintForwarderInvoiceDocNo } from "@/lib/admin/mint-receipt-doc-no";
import { sendNotification } from "@/lib/notifications";
import {
  createBillingRunInvoiceSchema,
  markBillingRunPaidSchema,
  cancelBillingRunInvoiceSchema,
  sendBillingRunNotificationSchema,
  type CreateBillingRunInvoiceInput,
  type MarkBillingRunPaidInput,
  type CancelBillingRunInvoiceInput,
  type SendBillingRunNotificationInput,
} from "@/lib/validators/admin-billing-run";

// ────────────────────────────────────────────────────────────────────────
// Public read shapes
// ────────────────────────────────────────────────────────────────────────

export type EligibleCustomerRow = {
  userid: string;
  display_name: string;
  is_juristic: boolean;
  tax_id: string;
  eligible_count: number;
  eligible_total_thb: number;
};

export type EligibleForwarderRow = {
  id: number;
  ftrackingchn: string;
  fdate: string | null;
  fbox: number | null;
  fweight: number | null;
  fcbm: number | null;
  ftotalprice: number;
  fstatus: string | null;
  already_billed: boolean;
};

export type BillingRunInvoiceRow = {
  id: number;
  doc_no: string;
  userid: string;
  buyer_name: string;
  is_juristic: boolean;
  date_issued: string;
  date_due: string;
  total_thb: number;
  status: "issued" | "paid" | "cancelled";
  paid_at: string | null;
  item_count: number;
  /** Computed: status='issued' AND date_due < today. */
  is_overdue: boolean;
};

export type BillingRunInvoiceDetail = {
  header: {
    id: number;
    doc_no: string;
    userid: string;
    buyer_name: string;
    buyer_tax_id: string;
    buyer_address: string;
    buyer_branch: string;
    is_juristic: boolean;
    date_issued: string;
    date_due: string;
    subtotal_thb: number;
    delivery_chn_thb: number;
    delivery_th_thb: number;
    other_thb: number;
    discount_thb: number;
    total_thb: number;
    status: "issued" | "paid" | "cancelled";
    note_for_customer: string;
    paid_at: string | null;
    paid_by: string | null;
    payment_method: string | null;
    payment_reference: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;
    cancel_reason: string | null;
    issued_at: string;
    issued_by: string;
    created_at: string;
    updated_at: string;
    is_overdue: boolean;
  };
  items: Array<{
    id: number;
    forwarder_id: number;
    amount_thb: number;
    /** Hydrated forwarder data — joined post-fetch (no embed FK). */
    forwarder: {
      ftrackingchn: string;
      fbox: number | null;
      fweight: number | null;
      fcbm: number | null;
      fdate: string | null;
      fstatus: string | null;
    } | null;
  }>;
};

// ────────────────────────────────────────────────────────────────────────
// Helper — resolve legacy admin username (same shape as combine-bill.ts)
// ────────────────────────────────────────────────────────────────────────

async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[billing-run resolveLegacyAdminId supabase.auth] failed`, {
      code: dataErr.code, message: dataErr.message,
    });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[billing-run resolveLegacyAdminId tb_admin] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email.slice(0, 30);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(dateDue: string, status: string): boolean {
  if (status !== "issued") return false;
  return dateDue < isoToday();
}

// ────────────────────────────────────────────────────────────────────────
// 1. LIST eligible customers — for the add-form dropdown
// ────────────────────────────────────────────────────────────────────────
//
// Mirrors legacy hs-forwarder-invoice/add.php L97-114:
//   SELECT u.userID, userName, userLastName, corporateNumber, corporateName
//   FROM tb_forwarder f
//   LEFT JOIN tb_users u ON f.userID=u.userID
//   LEFT JOIN tb_corporate c ON c.userID=u.userID
//   WHERE f.fStatus=5  GROUP BY f.userID  ORDER BY f.userID
//
// We do it in two steps because PostgREST embeds don't aggregate cleanly:
//   (a) SELECT DISTINCT userid + count() + sum(ftotalprice) FROM tb_forwarder WHERE fstatus='5'
//   (b) JOIN tb_users + tb_corporate by userid

export async function listEligibleCustomers(): Promise<
  AdminActionResult<{ rows: EligibleCustomerRow[] }>
> {
  return withAdmin<{ rows: EligibleCustomerRow[] }>(
    ["super", "accounting", "ops"],
    async () => {
      const admin = createAdminClient();

      // (a) aggregate per userid from tb_forwarder
      type AggRow = { userid: string; ftotalprice: number | string | null };
      const { data: aggRaw, error: aggErr } = await admin
        .from("tb_forwarder")
        .select("userid, ftotalprice")
        .eq("fstatus", "5")
        .limit(50_000); // generous cap — should not approach
      if (aggErr) {
        console.error("[listEligibleCustomers tb_forwarder] failed", {
          code: aggErr.code, message: aggErr.message,
        });
        return { ok: false, error: aggErr.message };
      }

      const aggByUser = new Map<string, { count: number; total: number }>();
      for (const r of ((aggRaw ?? []) as AggRow[])) {
        if (!r.userid) continue;
        const cur = aggByUser.get(r.userid) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(r.ftotalprice ?? 0);
        aggByUser.set(r.userid, cur);
      }

      const userids = Array.from(aggByUser.keys());
      if (userids.length === 0) {
        return { ok: true, data: { rows: [] } };
      }

      // (b) tb_users join — camelCase per migration 0113
      type UserRow = {
        userID: string;
        userName: string | null;
        userLastName: string | null;
        corporateNumber: string | null;
      };
      const { data: userRows, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, corporateNumber")
        .in("userID", userids);
      if (userErr) {
        console.error("[listEligibleCustomers tb_users] failed", {
          code: userErr.code, message: userErr.message,
        });
        return { ok: false, error: userErr.message };
      }
      const userByID = new Map<string, UserRow>();
      for (const u of ((userRows ?? []) as UserRow[])) {
        userByID.set(u.userID, u);
      }

      // (c) tb_corporate join (for juristic display name)
      type CorpRow = { userid: string; corporatename: string | null };
      const { data: corpRows, error: corpErr } = await admin
        .from("tb_corporate")
        .select("userid, corporatename")
        .in("userid", userids);
      if (corpErr) {
        console.error("[listEligibleCustomers tb_corporate] failed", {
          code: corpErr.code, message: corpErr.message,
        });
        // non-fatal — fall through with empty corp map
      }
      const corpByUser = new Map<string, string>();
      for (const c of ((corpRows ?? []) as CorpRow[])) {
        if (c.corporatename) corpByUser.set(c.userid, c.corporatename);
      }

      const rows: EligibleCustomerRow[] = userids
        .map((uid) => {
          const u = userByID.get(uid);
          const corpName = corpByUser.get(uid);
          const isJuristic = !!u?.corporateNumber?.trim();
          const display = isJuristic
            ? `${uid} (${corpName ?? u?.userName ?? ""} ${u?.corporateNumber ?? ""})`.trim()
            : `${uid} (${u?.userName ?? ""} ${u?.userLastName ?? ""})`.trim();
          const agg = aggByUser.get(uid)!;
          return {
            userid:             uid,
            display_name:       display,
            is_juristic:        isJuristic,
            tax_id:             u?.corporateNumber?.trim() ?? "",
            eligible_count:     agg.count,
            eligible_total_thb: Math.round(agg.total * 100) / 100,
          };
        })
        .sort((a, b) => a.userid.localeCompare(b.userid));

      return { ok: true, data: { rows } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 2. LIST eligible forwarders for one customer (the picker table)
// ────────────────────────────────────────────────────────────────────────
//
// Mirrors legacy hs-forwarder-invoice/forwarder-invoice/listForwarderItem.php:
//   SELECT id, fTrackingCHN, fDate, fbox, fweight, fcbm, ftotalprice, fStatus
//   FROM tb_forwarder WHERE userID=? AND fStatus=5
//
// Plus a Pacred guard: exclude forwarders ALREADY on a non-cancelled invoice
// (so staff doesn't accidentally bill the same parcel twice).

export async function listEligibleForwarders(
  userid: string,
): Promise<AdminActionResult<{ rows: EligibleForwarderRow[] }>> {
  if (!userid || typeof userid !== "string") {
    return { ok: false, error: "invalid_userid" };
  }
  return withAdmin<{ rows: EligibleForwarderRow[] }>(
    ["super", "accounting", "ops"],
    async () => {
      const admin = createAdminClient();

      // (a) tb_forwarder for this customer
      type FwdRow = {
        id: number;
        ftrackingchn: string | null;
        fdate: string | null;
        fbox: number | string | null;
        fweight: number | string | null;
        fcbm: number | string | null;
        ftotalprice: number | string | null;
        fstatus: string | null;
      };
      const { data: fwdRaw, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("id, ftrackingchn, fdate, fbox, fweight, fcbm, ftotalprice, fstatus")
        .eq("userid", userid)
        .eq("fstatus", "5")
        .order("id", { ascending: false })
        .limit(2000);
      if (fwdErr) {
        console.error("[listEligibleForwarders tb_forwarder] failed", {
          code: fwdErr.code, message: fwdErr.message,
        });
        return { ok: false, error: fwdErr.message };
      }
      const fwd = (fwdRaw ?? []) as FwdRow[];
      if (fwd.length === 0) {
        return { ok: true, data: { rows: [] } };
      }

      // (b) already-billed-on-issued-invoice check
      type ItemRow = { forwarder_id: number; invoice_id: number };
      const fids = fwd.map((f) => f.id);
      const { data: billed, error: billedErr } = await admin
        .from("tb_forwarder_invoice_item")
        .select("forwarder_id, invoice_id, tb_forwarder_invoice!inner(status)")
        .in("forwarder_id", fids);
      if (billedErr) {
        // Embed may fail if tb_forwarder_invoice not yet apply'd — fall through
        // to non-fatal "billed=false for all" behavior.
        console.error("[listEligibleForwarders billed-check] failed", {
          code: billedErr.code, message: billedErr.message,
        });
      }
      // Note: PostgREST embed returns nested status — accept any !cancelled
      // as "already on an active invoice". After tsc inference, the embed
      // type is opaque, so we type-narrow by checking the joined object's
      // `status` literal.
      const alreadyBilledIds = new Set<number>();
      for (const row of (billed ?? []) as unknown as Array<{
        forwarder_id: number;
        tb_forwarder_invoice?: { status?: string } | { status?: string }[] | null;
      }>) {
        const inv = Array.isArray(row.tb_forwarder_invoice)
          ? row.tb_forwarder_invoice[0]
          : row.tb_forwarder_invoice;
        if (inv && inv.status !== "cancelled") {
          alreadyBilledIds.add(row.forwarder_id);
        }
      }

      const rows: EligibleForwarderRow[] = fwd.map((f) => ({
        id:            f.id,
        ftrackingchn:  f.ftrackingchn ?? "",
        fdate:         f.fdate,
        fbox:          f.fbox != null ? Number(f.fbox) : null,
        fweight:       f.fweight != null ? Number(f.fweight) : null,
        fcbm:          f.fcbm != null ? Number(f.fcbm) : null,
        ftotalprice:     Number(f.ftotalprice ?? 0),
        fstatus:       f.fstatus,
        already_billed: alreadyBilledIds.has(f.id),
      }));

      return { ok: true, data: { rows } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 3. LIST invoices — admin list page (with filters)
// ────────────────────────────────────────────────────────────────────────

export type BillingRunListFilters = {
  dateFrom?: string;
  dateTo?: string;
  status?: "all" | "issued" | "paid" | "cancelled" | "overdue";
  userid?: string;
  limit?: number;
};

export async function getInvoiceList(
  filters: BillingRunListFilters = {},
): Promise<AdminActionResult<{ rows: BillingRunInvoiceRow[]; totalCount: number }>> {
  return withAdmin<{ rows: BillingRunInvoiceRow[]; totalCount: number }>(
    ["super", "accounting", "ops"],
    async () => {
      const admin = createAdminClient();
      const limit = Math.min(filters.limit ?? 500, 2000);

      type Raw = {
        id: number;
        doc_no: string;
        userid: string;
        buyer_name: string;
        is_juristic: boolean;
        date_issued: string;
        date_due: string;
        total_thb: number | string;
        status: "issued" | "paid" | "cancelled";
        paid_at: string | null;
      };
      let q = admin
        .from("tb_forwarder_invoice")
        .select(
          "id, doc_no, userid, buyer_name, is_juristic, date_issued, date_due, " +
          "total_thb, status, paid_at",
          { count: "exact" },
        )
        .order("date_issued", { ascending: false })
        .limit(limit);

      if (filters.dateFrom) q = q.gte("date_issued", filters.dateFrom);
      if (filters.dateTo)   q = q.lte("date_issued", filters.dateTo);
      if (filters.userid)   q = q.eq("userid", filters.userid);

      const today = isoToday();
      if (filters.status === "issued") q = q.eq("status", "issued");
      else if (filters.status === "paid") q = q.eq("status", "paid");
      else if (filters.status === "cancelled") q = q.eq("status", "cancelled");
      else if (filters.status === "overdue") {
        q = q.eq("status", "issued").lt("date_due", today);
      }

      const { data, error, count } = await q;
      if (error) {
        console.error("[getInvoiceList tb_forwarder_invoice] failed", {
          code: error.code, message: error.message,
        });
        return { ok: false, error: error.message };
      }

      const raw = ((data ?? []) as unknown as Raw[]);

      // Item-count rollup — second query against tb_forwarder_invoice_item.
      const invoiceIds = raw.map((r) => r.id);
      const countsByInvoice = new Map<number, number>();
      if (invoiceIds.length > 0) {
        type ItemRow = { invoice_id: number };
        const { data: itemRows, error: itemErr } = await admin
          .from("tb_forwarder_invoice_item")
          .select("invoice_id")
          .in("invoice_id", invoiceIds);
        if (itemErr) {
          console.error("[getInvoiceList tb_forwarder_invoice_item] failed", {
            code: itemErr.code, message: itemErr.message,
          });
        }
        for (const r of ((itemRows ?? []) as ItemRow[])) {
          countsByInvoice.set(r.invoice_id, (countsByInvoice.get(r.invoice_id) ?? 0) + 1);
        }
      }

      const rows: BillingRunInvoiceRow[] = raw.map((r) => ({
        id:           r.id,
        doc_no:       r.doc_no,
        userid:       r.userid,
        buyer_name:   r.buyer_name,
        is_juristic:  r.is_juristic,
        date_issued:  r.date_issued,
        date_due:     r.date_due,
        total_thb:    Number(r.total_thb),
        status:       r.status,
        paid_at:      r.paid_at,
        item_count:   countsByInvoice.get(r.id) ?? 0,
        is_overdue:   isOverdue(r.date_due, r.status),
      }));

      return { ok: true, data: { rows, totalCount: count ?? rows.length } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 4. GET one invoice with line items + forwarder hydration
// ────────────────────────────────────────────────────────────────────────

export async function getInvoiceDetail(
  invoiceId: number,
): Promise<AdminActionResult<BillingRunInvoiceDetail>> {
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return { ok: false, error: "invalid_invoice_id" };
  }
  return withAdmin<BillingRunInvoiceDetail>(
    ["super", "accounting", "ops"],
    async () => {
      const admin = createAdminClient();

      type HeaderRaw = {
        id: number;
        doc_no: string;
        userid: string;
        buyer_name: string;
        buyer_tax_id: string;
        buyer_address: string;
        buyer_branch: string;
        is_juristic: boolean;
        date_issued: string;
        date_due: string;
        subtotal_thb: number | string;
        delivery_chn_thb: number | string;
        delivery_th_thb: number | string;
        other_thb: number | string;
        discount_thb: number | string;
        total_thb: number | string;
        status: "issued" | "paid" | "cancelled";
        note_for_customer: string;
        paid_at: string | null;
        paid_by: string | null;
        payment_method: string | null;
        payment_reference: string | null;
        cancelled_at: string | null;
        cancelled_by: string | null;
        cancel_reason: string | null;
        issued_at: string;
        issued_by: string;
        created_at: string;
        updated_at: string;
      };
      const { data: hdrRaw, error: hdrErr } = await admin
        .from("tb_forwarder_invoice")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle<HeaderRaw>();
      if (hdrErr) {
        console.error("[getInvoiceDetail tb_forwarder_invoice header] failed", {
          code: hdrErr.code, message: hdrErr.message,
        });
        return { ok: false, error: hdrErr.message };
      }
      if (!hdrRaw) {
        return { ok: false, error: "not_found" };
      }

      type ItemRaw = { id: number; forwarder_id: number; amount_thb: number | string };
      const { data: itemRaw, error: itemErr } = await admin
        .from("tb_forwarder_invoice_item")
        .select("id, forwarder_id, amount_thb")
        .eq("invoice_id", invoiceId)
        .order("id", { ascending: true });
      if (itemErr) {
        console.error("[getInvoiceDetail tb_forwarder_invoice_item] failed", {
          code: itemErr.code, message: itemErr.message,
        });
        return { ok: false, error: itemErr.message };
      }
      const items = ((itemRaw ?? []) as ItemRaw[]);

      // Hydrate forwarder fields per line item
      const fids = items.map((i) => i.forwarder_id);
      type FwdHydRow = {
        id: number;
        ftrackingchn: string | null;
        fbox: number | string | null;
        fweight: number | string | null;
        fcbm: number | string | null;
        fdate: string | null;
        fstatus: string | null;
      };
      const fwdByID = new Map<number, FwdHydRow>();
      if (fids.length > 0) {
        const { data: fwdRaw, error: fwdErr } = await admin
          .from("tb_forwarder")
          .select("id, ftrackingchn, fbox, fweight, fcbm, fdate, fstatus")
          .in("id", fids);
        if (fwdErr) {
          console.error("[getInvoiceDetail tb_forwarder hydrate] failed", {
            code: fwdErr.code, message: fwdErr.message,
          });
        }
        for (const f of ((fwdRaw ?? []) as FwdHydRow[])) {
          fwdByID.set(f.id, f);
        }
      }

      return {
        ok: true,
        data: {
          header: {
            id:                 hdrRaw.id,
            doc_no:             hdrRaw.doc_no,
            userid:             hdrRaw.userid,
            buyer_name:         hdrRaw.buyer_name,
            buyer_tax_id:       hdrRaw.buyer_tax_id,
            buyer_address:      hdrRaw.buyer_address,
            buyer_branch:       hdrRaw.buyer_branch,
            is_juristic:        hdrRaw.is_juristic,
            date_issued:        hdrRaw.date_issued,
            date_due:           hdrRaw.date_due,
            subtotal_thb:       Number(hdrRaw.subtotal_thb),
            delivery_chn_thb:   Number(hdrRaw.delivery_chn_thb),
            delivery_th_thb:    Number(hdrRaw.delivery_th_thb),
            other_thb:          Number(hdrRaw.other_thb),
            discount_thb:       Number(hdrRaw.discount_thb),
            total_thb:          Number(hdrRaw.total_thb),
            status:             hdrRaw.status,
            note_for_customer:  hdrRaw.note_for_customer,
            paid_at:            hdrRaw.paid_at,
            paid_by:            hdrRaw.paid_by,
            payment_method:     hdrRaw.payment_method,
            payment_reference:  hdrRaw.payment_reference,
            cancelled_at:       hdrRaw.cancelled_at,
            cancelled_by:       hdrRaw.cancelled_by,
            cancel_reason:      hdrRaw.cancel_reason,
            issued_at:          hdrRaw.issued_at,
            issued_by:          hdrRaw.issued_by,
            created_at:         hdrRaw.created_at,
            updated_at:         hdrRaw.updated_at,
            is_overdue:         isOverdue(hdrRaw.date_due, hdrRaw.status),
          },
          items: items.map((i) => {
            const f = fwdByID.get(i.forwarder_id) ?? null;
            return {
              id:           i.id,
              forwarder_id: i.forwarder_id,
              amount_thb:   Number(i.amount_thb),
              forwarder:    f
                ? {
                    ftrackingchn: f.ftrackingchn ?? "",
                    fbox:         f.fbox != null ? Number(f.fbox) : null,
                    fweight:      f.fweight != null ? Number(f.fweight) : null,
                    fcbm:         f.fcbm != null ? Number(f.fcbm) : null,
                    fdate:        f.fdate,
                    fstatus:      f.fstatus,
                  }
                : null,
            };
          }),
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 5. CREATE invoice — mint doc-no + INSERT header + N items (race-safe retry)
// ────────────────────────────────────────────────────────────────────────

export async function createBillingRunInvoice(
  input: CreateBillingRunInvoiceInput,
): Promise<AdminActionResult<{ invoiceId: number; docNo: string }>> {
  const parsed = createBillingRunInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const v = parsed.data;

  return withAdmin<{ invoiceId: number; docNo: string }>(
    ["super", "accounting", "ops"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // (a) Verify all forwarders exist + belong to userid + fstatus=5
      type FwdCheck = {
        id: number;
        userid: string | null;
        fstatus: string | null;
        ftotalprice: number | string | null;
      };
      const { data: fwdRaw, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("id, userid, fstatus, ftotalprice")
        .in("id", v.forwarderIds);
      if (fwdErr) {
        console.error("[createBillingRunInvoice tb_forwarder check] failed", {
          code: fwdErr.code, message: fwdErr.message,
        });
        return { ok: false, error: fwdErr.message };
      }
      const fwd = (fwdRaw ?? []) as FwdCheck[];
      const knownIds = new Set(fwd.map((f) => f.id));
      const missing = v.forwarderIds.filter((id) => !knownIds.has(id));
      if (missing.length > 0) {
        return { ok: false, error: `ไม่พบเลขที่ออเดอร์: ${missing.join(", ")}` };
      }
      const wrongUser = fwd.filter((f) => f.userid !== v.userid);
      if (wrongUser.length > 0) {
        return {
          ok: false,
          error: `รายการเหล่านี้ไม่ใช่ของลูกค้านี้: ${wrongUser.map((f) => f.id).join(", ")}`,
        };
      }
      const wrongStatus = fwd.filter((f) => f.fstatus !== "5");
      if (wrongStatus.length > 0) {
        return {
          ok: false,
          error: `รายการเหล่านี้ไม่ได้อยู่ในสถานะรอชำระเงิน: ${wrongStatus.map((f) => f.id).join(", ")}`,
        };
      }

      // (b) Already-billed-on-non-cancelled-invoice guard
      const { data: billed, error: billedErr } = await admin
        .from("tb_forwarder_invoice_item")
        .select("forwarder_id, invoice_id, tb_forwarder_invoice!inner(status, doc_no)")
        .in("forwarder_id", v.forwarderIds);
      if (billedErr) {
        console.error("[createBillingRunInvoice already-billed check] failed", {
          code: billedErr.code, message: billedErr.message,
        });
        // non-fatal: fall through (race rare; downstream uniqueness covers)
      }
      const collisions: Array<{ forwarder_id: number; doc_no: string }> = [];
      for (const row of (billed ?? []) as unknown as Array<{
        forwarder_id: number;
        tb_forwarder_invoice?: { status?: string; doc_no?: string } | Array<{ status?: string; doc_no?: string }> | null;
      }>) {
        const inv = Array.isArray(row.tb_forwarder_invoice)
          ? row.tb_forwarder_invoice[0]
          : row.tb_forwarder_invoice;
        if (inv && inv.status !== "cancelled") {
          collisions.push({ forwarder_id: row.forwarder_id, doc_no: inv.doc_no ?? "?" });
        }
      }
      if (collisions.length > 0) {
        return {
          ok: false,
          error: `รายการเหล่านี้อยู่ในใบวางบิลอื่นแล้ว: ${collisions.map((c) => `#${c.forwarder_id}→${c.doc_no}`).join(", ")}`,
        };
      }

      // (c) Buyer info from tb_users + tb_corporate
      type UserBuyer = {
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userAddress: string | null;
        userTel: string | null;
        corporateNumber: string | null;
      };
      const { data: userRow, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userAddress, userTel, corporateNumber")
        .eq("userID", v.userid)
        .maybeSingle<UserBuyer>();
      if (userErr) {
        console.error("[createBillingRunInvoice tb_users] failed", {
          code: userErr.code, message: userErr.message,
        });
        return { ok: false, error: userErr.message };
      }
      if (!userRow) {
        return { ok: false, error: `ไม่พบลูกค้า ${v.userid}` };
      }

      const isJuristic = !!userRow.corporateNumber?.trim();
      let buyerName = `${userRow.userName ?? ""} ${userRow.userLastName ?? ""}`.trim();
      let buyerAddress = userRow.userAddress ?? "";
      let buyerBranch  = "";

      if (isJuristic) {
        type CorpBuyer = {
          userid: string;
          corporatename: string | null;
          corporateaddress: string | null;
          corporatebranch: string | null;
        };
        const { data: corp, error: corpErr } = await admin
          .from("tb_corporate")
          .select("userid, corporatename, corporateaddress, corporatebranch")
          .eq("userid", v.userid)
          .maybeSingle<CorpBuyer>();
        if (corpErr) {
          console.error("[createBillingRunInvoice tb_corporate] failed", {
            code: corpErr.code, message: corpErr.message,
          });
        }
        if (corp?.corporatename) buyerName = corp.corporatename;
        if (corp?.corporateaddress) buyerAddress = corp.corporateaddress;
        if (corp?.corporatebranch) buyerBranch = corp.corporatebranch;
      }

      // (d) Compute subtotal + final total
      const ftotalpriceByID = new Map<number, number>();
      for (const f of fwd) ftotalpriceByID.set(f.id, Number(f.ftotalprice ?? 0));
      const subtotal = v.forwarderIds.reduce(
        (sum, id) => sum + (ftotalpriceByID.get(id) ?? 0),
        0,
      );
      const total = Math.max(
        0,
        subtotal + v.deliveryChnThb + v.deliveryThThb + v.otherThb - v.discountThb,
      );

      // (e) Mint doc-no + INSERT header (3-retry on unique collision)
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 50);
      const issueDate = new Date(v.dateIssued);

      let docNo: string | null = null;
      let invoiceId: number | null = null;
      let lastErr = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        const minted = await mintForwarderInvoiceDocNo(admin, { issueDate });
        const { data: inserted, error: insErr } = await admin
          .from("tb_forwarder_invoice")
          .insert({
            doc_no:            minted,
            userid:            v.userid,
            buyer_name:        buyerName,
            buyer_tax_id:      userRow.corporateNumber?.trim() ?? "",
            buyer_address:     buyerAddress,
            buyer_branch:      buyerBranch,
            is_juristic:       isJuristic,
            date_issued:       v.dateIssued,
            date_due:          v.dateDue,
            subtotal_thb:      Math.round(subtotal * 100) / 100,
            delivery_chn_thb:  v.deliveryChnThb,
            delivery_th_thb:   v.deliveryThThb,
            other_thb:         v.otherThb,
            discount_thb:      v.discountThb,
            total_thb:         Math.round(total * 100) / 100,
            status:            "issued",
            note_for_customer: v.noteForCustomer,
            issued_by:         legacyAdminId,
          })
          .select("id, doc_no")
          .single<{ id: number; doc_no: string }>();
        if (!insErr) {
          docNo = inserted.doc_no;
          invoiceId = inserted.id;
          break;
        }
        if (insErr.code === "23505") {
          // unique-violation on doc_no — retry with re-mint
          lastErr = insErr.message;
          continue;
        }
        console.error("[createBillingRunInvoice tb_forwarder_invoice insert] failed", {
          code: insErr.code, message: insErr.message,
        });
        return { ok: false, error: insErr.message };
      }
      if (!docNo || !invoiceId) {
        return { ok: false, error: `mint-doc-no collision (3 retries): ${lastErr}` };
      }

      // (f) INSERT items (bulk · ON DELETE CASCADE protects rollback semantics)
      const itemsToInsert = v.forwarderIds.map((fid) => ({
        invoice_id:   invoiceId!,
        forwarder_id: fid,
        amount_thb:   ftotalpriceByID.get(fid) ?? 0,
      }));
      const { error: itemErr } = await admin
        .from("tb_forwarder_invoice_item")
        .insert(itemsToInsert);
      if (itemErr) {
        // Best-effort cleanup: delete the orphaned header so the doc_no
        // sequence doesn't leave a phantom.
        console.error("[createBillingRunInvoice tb_forwarder_invoice_item insert] failed", {
          code: itemErr.code, message: itemErr.message,
        });
        const { error: cleanupErr } = await admin
          .from("tb_forwarder_invoice")
          .delete()
          .eq("id", invoiceId);
        if (cleanupErr) {
          console.error("[createBillingRunInvoice cleanup] failed", {
            code: cleanupErr.code, message: cleanupErr.message,
          });
        }
        return { ok: false, error: itemErr.message };
      }

      await logAdminAction(adminId, "billing_run.create_invoice", "forwarder_invoice", String(invoiceId), {
        doc_no: docNo, userid: v.userid, forwarder_count: v.forwarderIds.length,
        total_thb: total, date_due: v.dateDue,
      });

      revalidatePath("/[locale]/(admin)/admin/billing-run", "page");
      revalidatePath("/[locale]/(admin)/admin/billing-run/[id]", "page");

      return { ok: true, data: { invoiceId, docNo } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 6. MARK PAID — flip 'issued' → 'paid' with payment trail
// ────────────────────────────────────────────────────────────────────────

export async function markBillingRunPaid(
  input: MarkBillingRunPaidInput,
): Promise<AdminActionResult<{ invoiceId: number }>> {
  const parsed = markBillingRunPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const v = parsed.data;

  return withAdmin<{ invoiceId: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 50);
      const paidAtIso = (v.paidAt ?? isoToday()) + "T00:00:00Z";

      // Guard: only flip 'issued' → 'paid'
      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status, total_thb")
        .eq("id", v.invoiceId)
        .maybeSingle<{ id: number; doc_no: string; status: string; total_thb: number | string }>();
      if (curErr) {
        console.error("[markBillingRunPaid current] failed", {
          code: curErr.code, message: curErr.message,
        });
        return { ok: false, error: curErr.message };
      }
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.status !== "issued") {
        return { ok: false, error: `ใบวางบิล ${cur.doc_no} อยู่ในสถานะ ${cur.status} แล้ว` };
      }

      const { error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({
          status:            "paid",
          paid_at:           paidAtIso,
          paid_by:           legacyAdminId,
          payment_method:    v.paymentMethod,
          payment_reference: v.paymentReference,
        })
        .eq("id", v.invoiceId)
        .eq("status", "issued"); // race guard: re-check we're flipping from issued
      if (updErr) {
        console.error("[markBillingRunPaid update] failed", {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "billing_run.mark_paid", "forwarder_invoice", String(v.invoiceId), {
        doc_no: cur.doc_no, payment_method: v.paymentMethod, reference: v.paymentReference,
        total_thb: Number(cur.total_thb), paid_at: paidAtIso,
      });

      revalidatePath("/[locale]/(admin)/admin/billing-run", "page");
      revalidatePath("/[locale]/(admin)/admin/billing-run/[id]", "page");

      return { ok: true, data: { invoiceId: v.invoiceId } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 7. CANCEL — soft-cancel with reason
// ────────────────────────────────────────────────────────────────────────

export async function cancelBillingRunInvoice(
  input: CancelBillingRunInvoiceInput,
): Promise<AdminActionResult<{ invoiceId: number }>> {
  const parsed = cancelBillingRunInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const v = parsed.data;

  return withAdmin<{ invoiceId: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 50);

      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status")
        .eq("id", v.invoiceId)
        .maybeSingle<{ id: number; doc_no: string; status: string }>();
      if (curErr) {
        console.error("[cancelBillingRunInvoice current] failed", {
          code: curErr.code, message: curErr.message,
        });
        return { ok: false, error: curErr.message };
      }
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.status === "cancelled") {
        return { ok: false, error: `ใบวางบิล ${cur.doc_no} ถูกยกเลิกอยู่แล้ว` };
      }
      if (cur.status === "paid") {
        return { ok: false, error: `ใบวางบิล ${cur.doc_no} ชำระแล้ว ไม่สามารถยกเลิกได้` };
      }

      const { error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({
          status:        "cancelled",
          cancelled_at:  new Date().toISOString(),
          cancelled_by:  legacyAdminId,
          cancel_reason: v.cancelReason,
        })
        .eq("id", v.invoiceId)
        .neq("status", "cancelled");
      if (updErr) {
        console.error("[cancelBillingRunInvoice update] failed", {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "billing_run.cancel_invoice", "forwarder_invoice", String(v.invoiceId), {
        doc_no: cur.doc_no, reason: v.cancelReason,
      });

      revalidatePath("/[locale]/(admin)/admin/billing-run", "page");
      revalidatePath("/[locale]/(admin)/admin/billing-run/[id]", "page");

      return { ok: true, data: { invoiceId: v.invoiceId } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 8. SEND NOTIFICATION — staff-triggered LINE/email push to customer
// ────────────────────────────────────────────────────────────────────────
//
// Resolves the invoice's userid → profiles.id (via tb_users.profile_id
// OR profiles.member_code = userid · whichever finds first) → calls the
// unified `sendNotification` channel (handles LINE+email preference logic
// + delivery logging in lib/notifications/index.ts).
//
// Logs the trigger to admin_audit_log so we can see who sent which
// reminder when — useful when a customer claims "didn't get the bill".

export async function sendBillingRunNotification(
  input: SendBillingRunNotificationInput,
): Promise<AdminActionResult<{ invoiceId: number; sent: boolean; channel: string }>> {
  const parsed = sendBillingRunNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const v = parsed.data;

  return withAdmin<{ invoiceId: number; sent: boolean; channel: string }>(
    ["super", "accounting", "ops"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // (a) Load invoice header
      type InvRow = {
        id: number;
        doc_no: string;
        userid: string;
        buyer_name: string;
        date_due: string;
        total_thb: number | string;
        status: string;
      };
      const { data: inv, error: invErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, userid, buyer_name, date_due, total_thb, status")
        .eq("id", v.invoiceId)
        .maybeSingle<InvRow>();
      if (invErr) {
        console.error("[sendBillingRunNotification invoice] failed", {
          code: invErr.code, message: invErr.message,
        });
        return { ok: false, error: invErr.message };
      }
      if (!inv) return { ok: false, error: "not_found" };
      if (inv.status !== "issued") {
        return { ok: false, error: `ใบวางบิล ${inv.doc_no} อยู่ในสถานะ ${inv.status} — ส่งเตือนได้เฉพาะ issued` };
      }

      // (b) Resolve userid → profile.id
      // Pattern A: tb_users has a profile_id uuid column linking to profiles
      // Pattern B: profiles.member_code = userid (fallback)
      let profileId: string | null = null;

      const { data: userRow, error: userErr } = await admin
        .from("tb_users")
        .select("profile_id")
        .eq("userID", inv.userid)
        .maybeSingle<{ profile_id: string | null }>();
      if (userErr) {
        console.error("[sendBillingRunNotification tb_users] failed", {
          code: userErr.code, message: userErr.message,
        });
      }
      if (userRow?.profile_id) {
        profileId = userRow.profile_id;
      } else {
        // Fallback: profiles.member_code = userid
        const { data: profileRow, error: profileErr } = await admin
          .from("profiles")
          .select("id")
          .eq("member_code", inv.userid)
          .maybeSingle<{ id: string }>();
        if (profileErr) {
          console.error("[sendBillingRunNotification profiles fallback] failed", {
            code: profileErr.code, message: profileErr.message,
          });
        }
        if (profileRow?.id) profileId = profileRow.id;
      }

      if (!profileId) {
        return {
          ok: false,
          error: `ไม่พบ profile สำหรับลูกค้า ${inv.userid} — แจ้งทาง LINE/email ไม่ได้ (อาจต้อง provision profile uuid ก่อน · ดู Wave 16 follow-up A)`,
        };
      }

      // (c) Build payload + send via unified channel
      const totalThb = Number(inv.total_thb);
      const today = new Date().toISOString().slice(0, 10);
      const isOverdueAtSend = inv.date_due < today;

      const result = await sendNotification(profileId, {
        category:       "payment",
        severity:       isOverdueAtSend ? "warning" : "info",
        title:          isOverdueAtSend
          ? `⚠️ ใบวางบิล ${inv.doc_no} เลยกำหนดชำระแล้ว`
          : `📄 ใบวางบิล ${inv.doc_no} รอชำระ`,
        body:           isOverdueAtSend
          ? `เลยกำหนดชำระตั้งแต่ ${inv.date_due} · ยอดค้าง ฿${totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · กรุณาชำระโดยเร็วเพื่อหลีกเลี่ยงการระงับบริการ`
          : `ครบกำหนดชำระ ${inv.date_due} · ยอด ฿${totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
        link_href:      `/billing-run/${inv.id}`,
        reference_type: "forwarder_invoice",
        reference_id:   String(inv.id),
      });

      const sentVia = result.deliveredLine
        ? "LINE"
        : result.deliveredEmail
          ? "email"
          : "บันทึกแล้ว (ยังไม่มี LINE/email channel)";

      await logAdminAction(adminId, "billing_run.send_notification", "forwarder_invoice", String(v.invoiceId), {
        doc_no:           inv.doc_no,
        channel_request:  v.channel,
        delivered_line:   result.deliveredLine,
        delivered_email:  result.deliveredEmail,
        notification_id:  result.id,
      });

      return {
        ok: true,
        data: {
          invoiceId: v.invoiceId,
          sent:      result.deliveredLine || result.deliveredEmail,
          channel:   sentVia,
        },
      };
    },
  );
}
