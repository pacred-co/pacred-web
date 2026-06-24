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
import { baseTracking, filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";
import { computeBillWht } from "@/lib/billing/wht";
import {
  calcForwarderOutstanding,
  type ForwarderPriceFields,
} from "@/lib/forwarder/outstanding";
import { computeForwarderDebitBatch } from "@/lib/forwarder/forwarder-debit-total";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";
import {
  isBillableForwarder,
  type ForwarderBillingEligibilityFields,
} from "@/lib/forwarder/billing-eligibility";
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
  famount: number | null;
  fweight: number | null;
  fvolume: number | null;
  /** Legacy single column — kept for the row display compat (ค่าขนส่งหลัก). */
  ftotalprice: number;
  /**
   * BUG A fix (2026-06-14) — the FULL composite the customer actually owes,
   * via calcForwarderOutstanding (Σ 7 price columns − discount − 1% juristic).
   * This is what the subtotal + the line amount_thb must use. `ftotalprice`
   * alone silently under-charged (dropped freight/update/service/crate/
   * chn-th/other + discount).
   */
  outstanding_thb: number;
  /** เหมาๆ (PCSF flat ฿100) carried on this row (the shipment's anchor) else 0 —
   *  the create-bill preview adds Σ of the selected rows so it matches the saved bill. */
  mao_fee_thb: number;
  fstatus: string | null;
  fcredit: string | null;
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
  /** WHT 1% (หัก ณ ที่จ่าย) + ยอดชำระสุทธิ — juristic & total ≥ 1,000 only. */
  wht_amount: number;
  net_payable: number;
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
    /** WHT 1% — หัก ณ ที่จ่าย. Computed from is_juristic + total_thb. */
    wht_rate: number;
    wht_amount: number;
    /** ยอดชำระสุทธิ = total_thb − wht_amount (what the customer remits). */
    net_payable: number;
  };
  items: Array<{
    id: number;
    forwarder_id: number;
    amount_thb: number;
    /** Hydrated forwarder data — joined post-fetch (no embed FK). The cabinet /
     *  transport / rate_basis / rate mirror the ใบเสร็จ's 11-col cargo table
     *  (lib/receipt/load-receipt-document.ts) so the Peak ใบวางบิล renders the
     *  SAME columns. */
    forwarder: {
      ftrackingchn: string;
      famount: number | null;
      fweight: number | null;
      fvolume: number | null;
      fdate: string | null;
      fstatus: string | null;
      cabinet: string;
      /** "EK" (รถ) | "SEA" (เรือ) | "" */
      transport: string;
      /** "KG" | "CBM" | "" */
      rate_basis: string;
      rate: number;
    } | null;
  }>;
};

// ────────────────────────────────────────────────────────────────────────
// Shared SELECT columns + the composite-outstanding helper
// ────────────────────────────────────────────────────────────────────────
//
// BUG A (2026-06-14) — every eligibility query MUST pull the columns
// calcForwarderOutstanding() reads, or the bill silently under-charges. The
// canonical per-row outstanding = Σ 7 price columns − discount − 1% juristic
// allowance (lib/forwarder/outstanding.ts). fcredit/paydeposit are pulled for
// the BUG B credit-eligibility predicate (lib/forwarder/billing-eligibility.ts).
const FWD_BILLING_SELECT =
  "id, fshipby, ftrackingchn, fdate, famount, fweight, fvolume, fstatus, " +
  "fcredit, paydeposit, fusercompany, advance_bill_confirmed, " +
  "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, " +
  "ftransportpricechnthb, priceother, fdiscount";

/** Raw row shape the eligibility queries return (all price cols + flags). */
type FwdBillingRaw = ForwarderPriceFields &
  ForwarderBillingEligibilityFields & {
    id: number;
    fshipby: string | null;        // for the เหมาๆ (PCSF) batch fee — computeForwarderDebitBatch
    ftrackingchn: string | null;
    fdate: string | null;
    famount: number | string | null;
    fweight: number | string | null;
    fvolume: number | string | null;
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
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(dateDue: string, status: string): boolean {
  if (status !== "issued") return false;
  return dateDue < isoToday();
}

// WHT 1% (หัก ณ ที่จ่าย) — rule lives in lib/billing/wht.ts (a plain module, so
// it can be shared with the customer-side billing-run pages + the print route;
// a "use server" file may only export async functions). Mirrors the ใบเสร็จ.

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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles browse eligible
    // customers to create billing-run docs (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async () => {
      const admin = createAdminClient();

      // (a) aggregate per userid from tb_forwarder.
      // BUG A — sum the FULL composite (calcForwarderOutstanding), not just
      // ftotalprice. BUG B — include the credit cohort (fstatus='5' OR a
      // credit-unsettled row at fstatus 5/6), union by id like reports-ar.ts.
      type AggRow = FwdBillingRaw & { userid: string | null };

      // Set A — awaiting-payment (fstatus='5').
      const qAwaiting = admin
        .from("tb_forwarder")
        .select("userid, " + FWD_BILLING_SELECT)
        .eq("fstatus", "5")
        .limit(50_000); // generous cap — should not approach
      // Set B — credit, unsettled (matches reports-ar.ts:~121, narrowed to the
      // billable stages 5/6 by the in-memory isBillableForwarder predicate).
      const qCredit = admin
        .from("tb_forwarder")
        .select("userid, " + FWD_BILLING_SELECT)
        .in("fstatus", ["5", "6"])
        .eq("fcredit", "1")
        .neq("paydeposit", "1")
        .neq("fstatus", "99")
        .limit(50_000);

      const [
        { data: aRaw, error: aErr },
        { data: bRaw, error: bErr },
      ] = await Promise.all([qAwaiting, qCredit]);
      if (aErr) {
        console.error("[listEligibleCustomers awaiting] failed", {
          code: aErr.code, message: aErr.message,
        });
        return { ok: false, error: aErr.message };
      }
      if (bErr) {
        console.error("[listEligibleCustomers credit] failed", {
          code: bErr.code, message: bErr.message,
        });
        return { ok: false, error: bErr.message };
      }

      // Union by id (a row can satisfy both sets — fstatus=5 AND on credit).
      const aggById = new Map<number, AggRow>();
      for (const r of ([...(aRaw ?? []), ...(bRaw ?? [])] as unknown as AggRow[])) {
        aggById.set(r.id, r);
      }

      // NOTE: count INCLUDES rows already on an invoice — the picker now SHOWS
      // already-billed rows (badged · ติ๊กได้เพื่อออกใบใหม่ · ภูม 2026-06-22 "เผื่อวางบิล
      // ผิดต้องวางใหม่"), so the dropdown count must include them too or the two
      // disagree again. The picker badges + warns on a re-bill; it no longer hides.
      const aggByUser = new Map<string, { count: number; total: number }>();
      for (const r of aggById.values()) {
        if (!r.userid) continue;
        if (!isBillableForwarder(r)) continue; // defensive — Set B narrows to 5/6
        const cur = aggByUser.get(r.userid) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += calcForwarderOutstanding(r); // BUG A — full composite
        aggByUser.set(r.userid, cur);
      }

      const userids = Array.from(aggByUser.keys());
      if (userids.length === 0) {
        return { ok: true, data: { rows: [] } };
      }

      // (b) tb_users join — camelCase per migration 0113
      // 2026-06-03 (ภูม flag) — corporateNumber NOT on tb_users (verified via
      // information_schema). The juristic flag = userCompany ('1' = juristic,
      // '0' or '' = personal). The tax-ID + corp-name live on tb_corporate
      // (separate table, joined by userid). Earlier draft assumed
      // tb_users.corporateNumber existed → "column does not exist" 500.
      type UserRow = {
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userCompany: string | null;
      };
      const { data: userRows, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userCompany")
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

      // (c) tb_corporate join — provides corporatename + corporatenumber (tax-ID)
      // for juristic customers. Lowercased columns (NOT renamed in migration
      // 0113 batch 1 — only tb_users/tb_admin/tb_co got camelCase).
      type CorpRow = {
        userid: string;
        corporatename: string | null;
        corporatenumber: string | null;
      };
      const { data: corpRows, error: corpErr } = await admin
        .from("tb_corporate")
        .select("userid, corporatename, corporatenumber")
        .in("userid", userids);
      if (corpErr) {
        console.error("[listEligibleCustomers tb_corporate] failed", {
          code: corpErr.code, message: corpErr.message,
        });
        // non-fatal — fall through with empty corp map
      }
      const corpByUser = new Map<string, { name: string; number: string }>();
      for (const c of ((corpRows ?? []) as CorpRow[])) {
        corpByUser.set(c.userid, {
          name:   (c.corporatename ?? "").trim(),
          number: (c.corporatenumber ?? "").trim(),
        });
      }

      const rows: EligibleCustomerRow[] = userids
        .map((uid) => {
          const u = userByID.get(uid);
          const corp = corpByUser.get(uid);
          // Juristic flag = tb_users.userCompany === '1' (per legacy
          // hs-forwarder-invoice/add.php pattern). Fallback to existence of
          // tb_corporate.corporatenumber for safety (some legacy rows lost
          // userCompany during migration).
          const isJuristic = u?.userCompany === "1" || !!corp?.number;
          const display = isJuristic
            ? `${uid} (${corp?.name || u?.userName || ""} ${corp?.number ?? ""})`.trim()
            : `${uid} (${u?.userName ?? ""} ${u?.userLastName ?? ""})`.trim();
          const agg = aggByUser.get(uid)!;
          return {
            userid:             uid,
            display_name:       display,
            is_juristic:        isJuristic,
            tax_id:             corp?.number ?? "",
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
//   SELECT id, fTrackingCHN, fDate, famount, fweight, fvolume, ftotalprice, fStatus
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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles browse eligible
    // forwarder rows to add to a billing-run doc.
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async () => {
      const admin = createAdminClient();

      // (a) tb_forwarder for this customer.
      // BUG A — pull the composite columns. BUG B — union the awaiting-payment
      // (fstatus='5') and credit-unsettled (fstatus 5/6 · fcredit='1' ·
      // paydeposit<>'1') cohorts so credit orders are pickable.
      const qAwaiting = admin
        .from("tb_forwarder")
        .select(FWD_BILLING_SELECT)
        .eq("userid", userid)
        .eq("fstatus", "5")
        .order("id", { ascending: false })
        .limit(2000);
      const qCredit = admin
        .from("tb_forwarder")
        .select(FWD_BILLING_SELECT)
        .eq("userid", userid)
        .in("fstatus", ["5", "6"])
        .eq("fcredit", "1")
        .neq("paydeposit", "1")
        .neq("fstatus", "99")
        .order("id", { ascending: false })
        .limit(2000);

      const [
        { data: aRaw, error: aErr },
        { data: bRaw, error: bErr },
      ] = await Promise.all([qAwaiting, qCredit]);
      if (aErr) {
        console.error("[listEligibleForwarders awaiting] failed", {
          code: aErr.code, message: aErr.message,
        });
        return { ok: false, error: aErr.message };
      }
      if (bErr) {
        console.error("[listEligibleForwarders credit] failed", {
          code: bErr.code, message: bErr.message,
        });
        return { ok: false, error: bErr.message };
      }

      // Union by id (a row can be in both sets) — keep the deterministic
      // newest-first order from Set A.
      const fwdById = new Map<number, FwdBillingRaw>();
      for (const r of ([...(aRaw ?? []), ...(bRaw ?? [])] as unknown as FwdBillingRaw[])) {
        fwdById.set(r.id, r);
      }
      const fwd = Array.from(fwdById.values())
        .filter((r) => isBillableForwarder(r)) // defensive — narrow Set B to 5/6
        .sort((a, b) => b.id - a.id);
      if (fwd.length === 0) {
        return { ok: true, data: { rows: [] } };
      }

      // (b) already-billed-on-issued-invoice check
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

      // เหมาๆ (PCSF flat ฿100 · ภูม 2026-06-23) — surface the per-row เหมาๆ so the
      // create-bill preview shows + adds it (was missing → preview ฿4,083.96 vs the
      // created bill ฿4,183.96). SAME engine as createBillingRunInvoice (anchored to
      // each shipment's base tracking · once per shipment). isCorporate affects only
      // the 1%, not the fee — false is fine here.
      const maoBatch = computeForwarderDebitBatch(fwd, { userId: userid, isCorporate: false });
      const maoFeeById = new Map<number, number>();
      for (const ln of maoBatch.lines) maoFeeById.set(Number(ln.id), ln.breakdown.maoFee);

      const rows: EligibleForwarderRow[] = fwd.map((f) => ({
        id:              f.id,
        ftrackingchn:    f.ftrackingchn ?? "",
        fdate:           f.fdate,
        famount:         f.famount != null ? Number(f.famount) : null,
        fweight:         f.fweight != null ? Number(f.fweight) : null,
        fvolume:         f.fvolume != null ? Number(f.fvolume) : null,
        ftotalprice:     Number(f.ftotalprice ?? 0),
        // BUG A — the FULL composite the customer owes (drives subtotal + bill).
        outstanding_thb: calcForwarderOutstanding(f),
        // เหมาๆ ฿100 on this row (the shipment's anchor) else 0 — preview adds Σ selected.
        mao_fee_thb:     maoFeeById.get(f.id) ?? 0,
        fstatus:         f.fstatus,
        fcredit:         f.fcredit,
        already_billed:  alreadyBilledIds.has(f.id),
      }));

      return { ok: true, data: { rows } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 2b. RESOLVE a container → its billing target (ภูม flag 2026-06-10)
// ────────────────────────────────────────────────────────────────────────
//
// The "ตู้พร้อมวางบิล" list + the ทำใบวางบิล button pass the ticked cabinet(s)
// here so /admin/billing-run/add can PRE-FILL instead of opening a blank form.
// Returns the single customer (+ their fStatus=5 forwarder ids in those cabinets)
// when the container is single-customer; else userid=null + customerCount so the
// form falls back to manual pick.

export async function resolveCabinetBillingTarget(
  cabinets: string[],
): Promise<AdminActionResult<{ userid: string | null; forwarderIds: number[]; customerCount: number }>> {
  return withAdmin<{ userid: string | null; forwarderIds: number[]; customerCount: number }>(
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async () => {
      const admin = createAdminClient();
      const clean = Array.from(
        new Set(cabinets.map((c) => c.trim()).filter((c) => c && c !== "0")),
      ).slice(0, 50);
      if (clean.length === 0) {
        return { ok: true, data: { userid: null, forwarderIds: [], customerCount: 0 } };
      }

      const { data, error } = await admin
        .from("tb_forwarder")
        .select("id, userid")
        .in("fcabinetnumber", clean)
        .eq("fstatus", "5")
        .limit(2000);
      if (error) {
        console.error("[resolveCabinetBillingTarget tb_forwarder] failed", {
          code: error.code, message: error.message,
        });
        return { ok: false, error: error.message };
      }

      const rows = (data ?? []) as Array<{ id: number; userid: string | null }>;
      const byUser = new Map<string, number[]>();
      for (const r of rows) {
        if (!r.userid) continue;
        const arr = byUser.get(r.userid) ?? [];
        arr.push(r.id);
        byUser.set(r.userid, arr);
      }

      if (byUser.size === 1) {
        const [userid, ids] = Array.from(byUser.entries())[0];
        return { ok: true, data: { userid, forwarderIds: ids, customerCount: 1 } };
      }
      // 0 customers (no fStatus=5 in the cabinet) or many → no single preselect.
      return {
        ok: true,
        data: { userid: null, forwarderIds: rows.map((r) => r.id), customerCount: byUser.size },
      };
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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles browse the
    // billing-run list.
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
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

      const rows: BillingRunInvoiceRow[] = raw.map((r) => {
        const total = Number(r.total_thb);
        const wht = computeBillWht(r.is_juristic, total);
        return {
          id:           r.id,
          doc_no:       r.doc_no,
          userid:       r.userid,
          buyer_name:   r.buyer_name,
          is_juristic:  r.is_juristic,
          date_issued:  r.date_issued,
          date_due:     r.date_due,
          total_thb:    total,
          status:       r.status,
          paid_at:      r.paid_at,
          item_count:   countsByInvoice.get(r.id) ?? 0,
          is_overdue:   isOverdue(r.date_due, r.status),
          wht_amount:   wht.wht_amount,
          net_payable:  wht.net_payable,
        };
      });

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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles read the
    // billing-run detail to print/verify.
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
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
        famount: number | string | null;
        fweight: number | string | null;
        fvolume: number | string | null;
        fdate: string | null;
        fstatus: string | null;
        fcabinetnumber: string | null;
        ftransporttype: string | null;
        frefprice: string | null;
        frefrate: number | string | null;
      };
      const fwdByID = new Map<number, FwdHydRow>();
      if (fids.length > 0) {
        const { data: fwdRaw, error: fwdErr } = await admin
          .from("tb_forwarder")
          .select("id, ftrackingchn, famount, fweight, fvolume, fdate, fstatus, fcabinetnumber, ftransporttype, frefprice, frefrate")
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
            ...computeBillWht(hdrRaw.is_juristic, Number(hdrRaw.total_thb)),
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
                    famount:         f.famount != null ? Number(f.famount) : null,
                    fweight:      f.fweight != null ? Number(f.fweight) : null,
                    fvolume:         f.fvolume != null ? Number(f.fvolume) : null,
                    fdate:        f.fdate,
                    fstatus:      f.fstatus,
                    cabinet:      f.fcabinetnumber ?? "",
                    // ขนส่ง: '1'=EK(รถ) · '2'=SEA(เรือ) — mirrors load-receipt-document.ts
                    transport:    f.ftransporttype === "2" ? "SEA" : f.ftransporttype === "1" ? "EK" : "",
                    // คิดราคาตาม: '1'=KG · '2'=CBM
                    rate_basis:   f.frefprice === "2" ? "CBM" : f.frefprice === "1" ? "KG" : "",
                    rate:         f.frefrate != null ? Number(f.frefrate) : 0,
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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles create the
    // billing-run doc (mark-paid + cancel stay accounting-only).
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // (a) Verify all forwarders exist + belong to userid + are BILLABLE.
      // BUG A — pull the full composite columns so the line amount = what the
      // customer owes. BUG B — eligibility = isBillableForwarder (awaiting OR
      // credit-unsettled), NOT fstatus='5' only.
      type FwdCheck = FwdBillingRaw & { userid: string | null };
      const { data: fwdRaw, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("userid, " + FWD_BILLING_SELECT)
        .in("id", v.forwarderIds);
      if (fwdErr) {
        console.error("[createBillingRunInvoice tb_forwarder check] failed", {
          code: fwdErr.code, message: fwdErr.message,
        });
        return { ok: false, error: fwdErr.message };
      }
      const fwd = (fwdRaw ?? []) as unknown as FwdCheck[];
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
      const wrongStatus = fwd.filter((f) => !isBillableForwarder(f));
      if (wrongStatus.length > 0) {
        return {
          ok: false,
          error: `รายการเหล่านี้ยังออกใบวางบิลไม่ได้ (ต้องอยู่สถานะรอชำระเงิน หรือเป็นออเดอร์เครดิตที่ยังไม่ชำระ): ${wrongStatus.map((f) => f.id).join(", ")}`,
        };
      }

      // (a2) Build A 2026-06-19 (money-review hardened) — ZERO-TRANSPORT GUARD
      // (kills the silent under-charge). A row whose import transport SELL
      // (ค่านำเข้า · ftotalprice) is ฿0 was either never measured (fweight+fvolume
      // empty → the auto-pricer wrote nothing), OR measured WEIGHT-ONLY under
      // comparison pricing so the CBM leg priced to 0 (the residual leak a raw
      // dimension check missed). ftotalprice<=0 is the DIRECT money signal —
      // calcForwarderOutstanding then bills 0 transport → silent under-charge.
      // Refuse unless the admin explicitly acknowledged (the form shows a ⚠️ badge
      // + a confirm that sets allowUnmeasured). Server-side backstop — a client
      // can't bypass it (the count is recomputed here from the DB rows).
      // D2 reconcile — a ฿0-transport row that the admin POSITIVELY OVERRODE
      // (typed a correct amount) is handled → not an under-charge risk.
      const zeroTransport = fwd.filter((f) => {
        const ov = v.overrides?.[String(f.id)];
        const positiveOverride = typeof ov === "number" && ov > 0;
        return (Number(f.ftotalprice) || 0) <= 0 && !positiveOverride;
      });
      if (zeroTransport.length > 0 && !v.allowUnmeasured) {
        return {
          ok: false,
          error:
            `มี ${zeroTransport.length} รายการค่าขนส่ง ฿0 (ยังไม่ได้วัด/ยังไม่ตั้งราคา · อาจเก็บเงินขาด): ` +
            `${zeroTransport.map((f) => `#${f.id}`).join(", ")} — กรุณาตรวจสอบ/วัดที่โกดังก่อน หรือยืนยันออกบิลทั้งที่ค่าขนส่งเป็น ฿0`,
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

      // (c) Buyer info from tb_users + tb_corporate (+ tb_address for personal)
      // 2026-06-03 (ภูม flag) — tb_users does NOT have corporateNumber OR
      // userAddress columns. Verified columns: userID/userName/userLastName/
      // userCompany/userAddressID/userTel/userEmail. Address text lives in
      // tb_address (joined via userAddressID), corp info in tb_corporate.
      type UserBuyer = {
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userAddressID: string | null;
        userTel: string | null;
        userCompany: string | null;
      };
      const { data: userRow, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userAddressID, userTel, userCompany")
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

      // Pull tb_corporate first so we know if the customer is juristic by
      // EITHER signal (userCompany='1' OR corp row exists with tax-ID).
      // tb_corporate is the source of truth for tax-ID + corp name + address.
      type CorpBuyer = {
        userid: string;
        corporatename: string | null;
        corporatenumber: string | null;
        corporateaddress: string | null;
      };
      const { data: corp, error: corpErr } = await admin
        .from("tb_corporate")
        .select("userid, corporatename, corporatenumber, corporateaddress")
        .eq("userid", v.userid)
        .maybeSingle<CorpBuyer>();
      if (corpErr) {
        console.error("[createBillingRunInvoice tb_corporate] failed", {
          code: corpErr.code, message: corpErr.message,
        });
      }
      const corpNumber = (corp?.corporatenumber ?? "").trim();
      const isJuristic = userRow.userCompany === "1" || corpNumber !== "";

      let buyerName = `${userRow.userName ?? ""} ${userRow.userLastName ?? ""}`.trim();
      let buyerAddress = "";
      const buyerBranch  = ""; // tb_corporate has no `corporatebranch` column

      if (isJuristic) {
        if (corp?.corporatename) buyerName = corp.corporatename;
        if (corp?.corporateaddress) buyerAddress = corp.corporateaddress;
      } else if (userRow.userAddressID) {
        // Personal customer — resolve address via tb_address.
        type AddrRow = {
          addressno: string | null;
          addresssubdistrict: string | null;
          addressdistrict: string | null;
          addressprovince: string | null;
          addresszipcode: string | null;
        };
        const { data: addr, error: addrErr } = await admin
          .from("tb_address")
          .select("addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
          .eq("addressid", userRow.userAddressID)
          .maybeSingle<AddrRow>();
        if (addrErr) {
          console.error("[createBillingRunInvoice tb_address] failed", {
            code: addrErr.code, message: addrErr.message,
          });
        }
        if (addr) {
          buyerAddress = [
            addr.addressno, addr.addresssubdistrict, addr.addressdistrict,
            addr.addressprovince, addr.addresszipcode,
          ].filter(Boolean).join(" ").trim();
        }
      }

      // (d) Compute subtotal + final total.
      // BUG A — the per-line amount = calcForwarderOutstanding (Σ 7 price
      // columns − discount − 1% juristic), the canonical per-row outstanding,
      // NOT ftotalprice alone. The 4 admin adjustment fields (deliveryChn/Th/
      // other/discount) are ADDITIONAL on top of the composite subtotal — they
      // are NOT inside calcForwarderOutstanding, so no double-count.
      const outstandingByID = new Map<number, number>();
      for (const f of fwd) outstandingByID.set(f.id, calcForwarderOutstanding(f));

      // เหมาๆ (PCSF flat ฿100) — the bill was MISSING it vs the detail page's
      // ยอดเก็บจริง (ภูม 2026-06-23: บิล 4,083.96 แต่ detail 4,183.96). Pull JUST the
      // maoFee per line from the batch engine — the SAME once-per-shipment anchor
      // logic the detail page uses (anchored to the base tracking · เดฟ "กันเก็บเบิ้ล")
      // — and ADD it on top of the per-row outstanding. We deliberately do NOT swap
      // the whole engine (computeForwarderDebitBatch applies its 1% at batch≥฿1000,
      // calcForwarderOutstanding per-row) so juristic <฿1000 bills don't shift — the
      // ONLY money delta introduced here is the ฿100 เหมาๆ.
      const maoBatch = computeForwarderDebitBatch(fwd, {
        userId: v.userid,
        isCorporate: isJuristic,
      });
      const maoFeeByID = new Map<number, number>();
      for (const ln of maoBatch.lines) maoFeeByID.set(Number(ln.id), ln.breakdown.maoFee);

      // Build A D2 — per-line override: an admin-typed amount wins over the auto
      // calcForwarderOutstanding for THAT row. Only ids being billed are read;
      // stray override keys are ignored. The override is bounded by the Zod schema
      // (positiveMoney) + audit-logged below so a manual amount is deliberate +
      // traceable. Un-overridden rows keep the canonical composite outstanding.
      const overrideAmt = (id: number): number | null => {
        const raw = v.overrides?.[String(id)];
        return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      };
      // money-review fix — quantize EACH line to satang BEFORE summing, so the
      // header subtotal_thb == Σ item amount_thb exactly (the mig 0138 invariant).
      // An override can carry >2dp (z.number isn't 2dp-quantized); round-each-then-
      // sum keeps header + items identical to the satang. The ฿100 เหมาๆ rides the
      // anchor row (added to its outstanding); an OVERRIDDEN row takes the admin's
      // exact amount as-is (no auto เหมาๆ on top — the admin set the figure).
      const lineAmount = (id: number): number => {
        const ov = overrideAmt(id);
        if (ov != null) return Math.round(ov * 100) / 100;
        return Math.round(((outstandingByID.get(id) ?? 0) + (maoFeeByID.get(id) ?? 0)) * 100) / 100;
      };
      const overriddenIds = v.forwarderIds.filter((id) => overrideAmt(id) != null);
      const subtotal = v.forwarderIds.reduce((sum, id) => sum + lineAmount(id), 0);
      const total = Math.max(
        0,
        subtotal + v.deliveryChnThb + v.deliveryThThb + v.otherThb - v.discountThb,
      );
      // money-review fix — per-line override is capped (positiveMoney ≤9,999,999,999.99)
      // but the AGGREGATE subtotal/total over up to 500 rows can exceed the
      // NUMERIC(12,2) header ceiling. Reject with a Thai message instead of letting
      // Postgres raise a raw 22003 overflow.
      if (subtotal > 9_999_999_999.99 || total > 9_999_999_999.99) {
        return {
          ok: false,
          error: "ยอดรวมทั้งใบเกินขีดจำกัด (สูงสุด 9,999,999,999.99 บาท) — กรุณาตรวจสอบยอดที่แก้ไข หรือแยกออกเป็นหลายใบ",
        };
      }

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
            buyer_tax_id:      corpNumber,
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

      // (f) INSERT items (bulk · ON DELETE CASCADE protects rollback semantics).
      // BUG A — line amount = the composite outstanding (Σ subtotal of these
      // lines == the header subtotal, both from calcForwarderOutstanding).
      const itemsToInsert = v.forwarderIds.map((fid) => ({
        invoice_id:   invoiceId!,
        forwarder_id: fid,
        // D2 — the line bill amount: admin override if present, else the auto
        // composite outstanding. Same value the subtotal summed, so header +
        // items always reconcile to satang.
        amount_thb:   Math.round(lineAmount(fid) * 100) / 100,
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
        // Build A money-review — leave a forensic breadcrumb when the admin
        // OVERRODE the zero-transport guard, so an under-billed invoice can later
        // be told apart from a correctly-billed one.
        ...(zeroTransport.length > 0
          ? { zero_transport_override: true, zero_transport_ids: zeroTransport.map((f) => f.id) }
          : {}),
        // D2 — record any per-line bill-amount overrides (the manual figure that
        // replaced the auto outstanding) for the same forensic reason.
        ...(overriddenIds.length > 0
          ? {
              line_amount_overrides: overriddenIds.map((id) => ({
                forwarder_id: id,
                auto_thb: Math.round((outstandingByID.get(id) ?? 0) * 100) / 100,
                billed_thb: Math.round(lineAmount(id) * 100) / 100,
              })),
            }
          : {}),
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
        .select("id, doc_no, status, total_thb, userid")
        .eq("id", v.invoiceId)
        .maybeSingle<{ id: number; doc_no: string; status: string; total_thb: number | string; userid: string | null }>();
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

      // ภูม 2026-06-22 — sync the linked ใบเสร็จ to "ออกแล้ว/paid". A receipt issued
      // manually via adminIssueForwarderInvoice is created at rstatus='3' (รอชำระ);
      // when its bill is marked paid here it must flip to '1', else the receipt list
      // shows "รอชำระ" while the bill shows "รับชำระแล้ว" (ภูม flag · FRI2606-00011 paid
      // but FRG2606-00001 stuck). Link = tb_receipt_item (rid, fid) ↔ the invoice's
      // forwarders. Flips ONLY a receipt FULLY covered by this paid invoice. Best-effort
      // — never fails the invoice flip; only '3'→'1' (never touches cancelled/already-paid).
      try {
        const { data: invItems, error: invErr } = await admin
          .from("tb_forwarder_invoice_item")
          .select("forwarder_id")
          .eq("invoice_id", v.invoiceId);
        if (invErr) console.error("[markBillingRunPaid receipt-sync invItems]", { code: invErr.code, message: invErr.message });
        const invFids = new Set(
          ((invItems ?? []) as Array<{ forwarder_id: number }>).map((r) => r.forwarder_id),
        );
        if (invFids.size > 0) {
          // ภูม 2026-06-22 — advance the import order's OWN status too: a paid bill
          // means the forwarder (รายการนำเข้า) should move รอชำระเงิน (fstatus '5') →
          // เตรียมส่ง ('6'), else the import list still shows "รอชำระเงิน" while the bill
          // says paid ("ต้อง link ถึงกันหมด"). Guard .eq('5') → only advances rows still
          // at 5 (never touches a credit-6 or already-shipped row). Best-effort.
          const { error: advErr } = await admin
            .from("tb_forwarder")
            .update({ fstatus: "6", fdatestatus6: paidAtIso, fdateadminstatus: paidAtIso })
            .in("id", Array.from(invFids))
            .eq("fstatus", "5");
          if (advErr) console.error("[markBillingRunPaid forwarder-advance]", { code: advErr.code, message: advErr.message });

          // ADVANCE bill (owner 2026-06-23 · วางบิลล่วงหน้าตอน MOMO ยิง): a paid advance
          // bill marks its forwarder rows SETTLED (paydeposit='1') but does NOT force
          // fstatus 6 — the goods are still in China (fstatus 2/3/4). The settled marker
          // blocks any re-collect; the morning arrival scan flips a settled advance row →
          // 6 (เตรียมส่ง · skip รอชำระ) so it dispatches without re-charging. Guard: only
          // advance-confirmed rows still at the physical stages.
          const { error: advPaidErr } = await admin
            .from("tb_forwarder")
            .update({ paydeposit: "1", fdateadminstatus: paidAtIso })
            .in("id", Array.from(invFids))
            .eq("advance_bill_confirmed", "1")
            .neq("paydeposit", "1")
            .in("fstatus", ["2", "3", "4"]);
          if (advPaidErr) console.error("[markBillingRunPaid advance-paid]", { code: advPaidErr.code, message: advPaidErr.message });

          const { data: touch, error: touchErr } = await admin
            .from("tb_receipt_item")
            .select("rid")
            .in("fid", Array.from(invFids));
          if (touchErr) console.error("[markBillingRunPaid receipt-sync touch]", { code: touchErr.code, message: touchErr.message });
          const candidateRids = Array.from(
            new Set(
              ((touch ?? []) as Array<{ rid: string | null }>)
                .map((r) => r.rid)
                .filter((x): x is string => !!x),
            ),
          );
          for (const rid of candidateRids) {
            const { data: allItems, error: allErr } = await admin
              .from("tb_receipt_item")
              .select("fid")
              .eq("rid", rid);
            if (allErr) console.error("[markBillingRunPaid receipt-sync allItems]", { code: allErr.code, message: allErr.message, rid });
            const fids = ((allItems ?? []) as Array<{ fid: number }>).map((r) => r.fid);
            if (fids.length === 0 || !fids.every((f) => invFids.has(f))) continue; // not fully covered → skip
            const { error: rcptErr } = await admin
              .from("tb_receipt")
              .update({ rstatus: "1" })
              .eq("rid", rid)
              .eq("rstatus", "3"); // pending → paid only
            if (rcptErr) {
              console.error("[markBillingRunPaid receipt-sync]", { code: rcptErr.code, message: rcptErr.message, rid });
            } else {
              await logAdminAction(adminId, "billing_run.receipt_synced_paid", "tb_receipt", rid, {
                invoice_id: v.invoiceId, doc_no: cur.doc_no,
              });
            }
          }

          // #3 (ภูม 2026-06-23) — CLOSE THE LOOP: auto-create the ใบเสร็จ now if none
          // exists yet for this paid bill (กดรับชำระ → ใบเสร็จออกเอง ตรงวางบิล · ไม่ต้องกดมือ).
          // Mints tb_receipt at rstatus='1' (paid) from the SAME forwarder rows, so the
          // receipt mirrors the วางบิล (incl เหมาๆ from #2). autoIssueReceiptOnPaymentLand
          // has its OWN idempotency guard (alreadyIssued → no-op when a receipt already
          // covers these fids) so the flip loop above + this never double-issue.
          // Best-effort — never fails the paid flip.
          if (cur.userid) {
            const rcpt = await autoIssueReceiptOnPaymentLand(admin, {
              userid:   cur.userid,
              fids:     Array.from(invFids),
              dateSlip: new Date(paidAtIso),
              source:   "billing_run.mark_paid",
            });
            if (rcpt.ok) {
              await logAdminAction(adminId, "billing_run.receipt_auto_created", "tb_receipt", rcpt.data.rid, {
                invoice_id: v.invoiceId, doc_no: cur.doc_no, amount_thb: rcpt.data.rAmount,
              });
            } else if (!rcpt.alreadyIssued) {
              console.error("[markBillingRunPaid auto-receipt] failed", { error: rcpt.error, invoiceId: v.invoiceId });
            }
          }
        }
      } catch (e) {
        console.error("[markBillingRunPaid receipt-sync] unexpected", { message: String(e), invoiceId: v.invoiceId });
      }

      revalidatePath("/[locale]/(admin)/admin/billing-run", "page");
      revalidatePath("/[locale]/(admin)/admin/billing-run/[id]", "page");
      revalidatePath("/[locale]/(admin)/admin/accounting/receipts", "page");
      revalidatePath("/[locale]/(admin)/admin/forwarders", "page");

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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles send the
    // billing-run reminder to the customer.
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
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

// ─────────────────────────────────────────────────────────────────────────────
// createForwarderOrderBill — mint a บิลวางบิล for ONE order's tracking group from
// the forwarder detail page (owner 2026-06-22: "ทำปุ่มสร้างใบวางบิลตรงนั้นเลย").
// Thin wrapper over createBillingRunInvoice (which gates RBAC, validates every id
// belongs to the same customer + is billable [fstatus 5 / credit], computes the
// amount via calcForwarderOutstanding, mints the FRI doc-no, inserts the invoice
// + items, all atomic). Dates default to today / today+7. Deliveries/discount 0
// (those are billing-run-level adders, not per-order). Returns the doc-no.
// ─────────────────────────────────────────────────────────────────────────────
export async function createForwarderOrderBill(
  fId: number,
  opts?: { noteForCustomer?: string },
): Promise<
  | { ok: true; data?: { invoiceId: number; docNo: string } }
  | { ok: false; error: string; billedInvoices?: Array<{ forwarderId: number; docNo: string; invoiceId: number }> }
> {
  const id = Number(fId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

  const admin = createAdminClient();
  const { data: head, error: headErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, ftrackingchn, fweight")
    .eq("id", id)
    .maybeSingle<{ id: number; userid: string | null; ftrackingchn: string | null; fweight: number | string | null }>();
  if (headErr) {
    console.error("[createForwarderOrderBill head read]", { code: headErr.code, message: headErr.message, fid: id });
    return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${headErr.message}` };
  }
  if (!head) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
  const userid = (head.userid ?? "").trim();
  if (!userid) return { ok: false, error: "ไม่พบรหัสลูกค้าของรายการนี้" };

  // Derive the whole tracking GROUP server-side (same model as the per-tracking
  // editor: rows sharing (baseTracking, userid), MOMO หัวบิล dropped) so the bill
  // covers every แทค of this split parcel — not just the viewed row. Falls back to
  // the single id. createBillingRunInvoice re-validates each id (same customer +
  // billable), so a stray sibling is rejected, not mis-billed.
  let ids = [id];
  const base = baseTracking(head.ftrackingchn);
  if (base) {
    const { data: sib, error: sibErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fweight, userid")
      .eq("userid", userid)
      .ilike("ftrackingchn", `${base}%`)
      .limit(200);
    if (sibErr) {
      console.error("[createForwarderOrderBill siblings]", { code: sibErr.code, message: sibErr.message, base });
    } else {
      const exact = ((sib ?? []) as Array<{ id: number; ftrackingchn: string | null; fweight: number | string | null; userid: string | null }>)
        .filter((r) => baseTracking(r.ftrackingchn) === base);
      const countable = filterCountableForwarderRows(exact, {
        tracking: (r) => r.ftrackingchn,
        weight: (r) => Number(r.fweight) || 0,
        userid: (r) => r.userid ?? "",
      });
      const gids = countable.map((r) => r.id).filter((n): n is number => Number.isInteger(n) && n > 0);
      if (gids.length > 0) ids = Array.from(new Set(gids.includes(id) ? gids : [...gids, id]));
    }
  }

  const today = new Date();
  const due = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const res = await createBillingRunInvoice({
    userid,
    forwarderIds: ids,
    dateIssued: iso(today),
    dateDue: iso(due),
    deliveryChnThb: 0,
    deliveryThThb: 0,
    otherThb: 0,
    discountThb: 0,
    noteForCustomer: opts?.noteForCustomer ?? "",
    allowUnmeasured: false,
    overrides: {},
  });

  // ภูม 2026-06-22 — when these rows are already on another (non-cancelled) invoice,
  // resolve the invoice ids so the button can render a clickable link straight to that
  // bill instead of a dead "#…→DOC" string. Runs ONLY on the collision case.
  if (!res.ok && (res.error ?? "").includes("ใบวางบิลอื่น")) {
    const billedInvoices: Array<{ forwarderId: number; docNo: string; invoiceId: number }> = [];
    const { data: billed, error: billedErr } = await admin
      .from("tb_forwarder_invoice_item")
      .select("forwarder_id, invoice_id, tb_forwarder_invoice!inner(status, doc_no)")
      .in("forwarder_id", ids);
    if (billedErr) {
      console.error("[createForwarderOrderBill billed-link]", { code: billedErr.code, message: billedErr.message });
    }
    for (const row of (billed ?? []) as unknown as Array<{
      forwarder_id: number;
      invoice_id: number;
      tb_forwarder_invoice?: { status?: string; doc_no?: string } | Array<{ status?: string; doc_no?: string }> | null;
    }>) {
      const inv = Array.isArray(row.tb_forwarder_invoice) ? row.tb_forwarder_invoice[0] : row.tb_forwarder_invoice;
      if (inv && inv.status !== "cancelled") {
        billedInvoices.push({ forwarderId: row.forwarder_id, docNo: inv.doc_no ?? "?", invoiceId: row.invoice_id });
      }
    }
    return { ok: false, error: res.error, billedInvoices };
  }

  return res;
}
