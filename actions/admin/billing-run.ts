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
// F3 — server-side capture rail (see actions/admin/wallet-hs.ts docblock). The
// throwing billing money actions (issue + pay) delegate to non-exported *Impl
// fns run through withObservability: transparent (same return on success ·
// re-throws the ORIGINAL error), files only UNEXPECTED throws.
import { withObservability } from "@/lib/observability/with-observability";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { mintForwarderInvoiceDocNo } from "@/lib/admin/mint-receipt-doc-no";
import { baseTracking, filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";
import { computeBillWht } from "@/lib/billing/wht";
import {
  loadBillingRunDocument,
  type BillingRunInvoiceDetail,
} from "@/lib/billing/load-billing-run-document";
import {
  calcForwarderGross,
  calcForwarderOutstanding,
  type ForwarderPriceFields,
} from "@/lib/forwarder/outstanding";
import { computeForwarderDebitBatch } from "@/lib/forwarder/forwarder-debit-total";
import { isThShippingCostMissing, codBaseTrackings } from "@/lib/forwarder/domestic-shipping";
import { getContainerCompletenessBatch } from "@/lib/warehouse/container-completeness";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";
import {
  isBillableForwarder,
  isBillingRunEligible,
  isCheckedArrivedForwarder,
  type ForwarderBillingEligibilityFields,
} from "@/lib/forwarder/billing-eligibility";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { appendStatusLog as appendForwarderStatusLog } from "@/lib/notifications/status-flip-helper";
import { sendNotification } from "@/lib/notifications";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { logger } from "@/lib/logger";
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
   * The FULL composite the customer owes, GROSS (Σ 7 price columns − discount,
   * NO juristic 1%) — via calcForwarderGross. This is the bill's per-line FACE
   * value; it drives the create-form subtotal + the saved line amount_thb. The
   * หัก ณ ที่จ่าย 1% is then deducted ONCE as a header line (computeBillWht).
   *   · BUG A fix (2026-06-14): use the composite, not `ftotalprice` alone
   *     (which dropped freight/update/service/crate/chn-th/other + discount).
   *   · WHT fix (2026-06-25): GROSS not NET (was calcForwarderOutstanding) — net
   *     storage made the bill withhold 1% twice (= gross×0.98) for juristic.
   */
  outstanding_thb: number;
  /** เหมาๆ (PCSF flat ฿100) carried on this row (the shipment's anchor) else 0 —
   *  the create-bill preview adds Σ of the selected rows so it matches the saved bill. */
  mao_fee_thb: number;
  fstatus: string | null;
  fcredit: string | null;
  already_billed: boolean;
  /** ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — a domestic delivery leg applies to
   *  this row (fshipby ≠ self-pickup) but the in-Thailand cost (ftransportprice)
   *  is still ฿0/empty → warehouse/CS forgot to fill it. The create-form badges
   *  it "ยังไม่กรอกค่าส่งไทย" + requires a confirm; the create action backstops. */
  th_ship_missing: boolean;
  /** The carrier code (fshipby) — surfaced so the UI can show what leg applies. */
  fshipby: string | null;
  /** The captured in-Thailand delivery cost (ftransportprice) — display + gate. */
  ftransportprice: number;
  /** G3/G4 (2026-07-08) — this row is on the ตรวจตู้ check-queue (tb_check_forwarder).
   *  The create-form PRE-TICKS these so the ตรวจตู้ selection carries into the bill.
   *  A check-queued row still at fstatus='4' is surfaced (G4) so the bill lifts it 4→5. */
  check_queued: boolean;
  /** G1 combo-flow (2026-07-08) — the container this row is packed into (fcabinetnumber),
   *  for the packing-reconcile badge. null when the row has no container yet. */
  fcabinetnumber: string | null;
  /** G1 combo-flow — this row's container has a packing-list reconcile stamp (mig 0245),
   *  OR the row has no container (exempt → true). false = ตู้ยังไม่อัพ packing → the
   *  create-form badges "ยังไม่อัพ packing" + requires the allowUnreconciledPacking confirm;
   *  the create action backstops with the server gate. */
  packing_reconciled: boolean;
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

// The public document shape now lives in lib/billing/load-billing-run-document.ts
// (shared by the admin action + the public /b/[token] page · imported at the top
// of this file for getInvoiceDetail's return type). It is NOT re-exported from
// here: this is a "use server" file, and the Next server-action bundler emits a
// value proxy for every export — a re-exported *type* alias resolves to nothing
// at runtime and breaks the build ("Export BillingRunInvoiceDetail doesn't exist").
// No consumer imports this type from the action anyway; the type's home is the lib.

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
  "id, fshipby, paymethod, ftrackingchn, fdate, famount, fweight, fvolume, fstatus, " +
  "fcredit, paydeposit, fusercompany, advance_bill_confirmed, fcabinetnumber, " +
  "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, " +
  "ftransportpricechnthb, priceother, fdiscount";

/** Raw row shape the eligibility queries return (all price cols + flags). */
type FwdBillingRaw = ForwarderPriceFields &
  ForwarderBillingEligibilityFields & {
    id: number;
    fshipby: string | null;        // for the เหมาๆ (PCSF) batch fee — computeForwarderDebitBatch
    paymethod: string | null;      // '1' ต้นทาง · '2' ปลายทาง/COD — COD → ค่าส่งไทย ฿0 legit (gate exempt)
    ftrackingchn: string | null;
    fdate: string | null;
    famount: number | string | null;
    fweight: number | string | null;
    fvolume: number | string | null;
    fcabinetnumber: string | null; // G1 combo-flow — the container, for the packing-reconcile gate
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
      //
      // Collect every BILLABLE row per user. The credit/นิติ narrowing (owner
      // 2026-07-07 — drop the cash cohort) is DEFERRED to the final map: juristic
      // is a per-customer fact that needs the tb_users/tb_corporate join below,
      // so we can't decide eligibility here yet.
      const rowsByUser = new Map<string, FwdBillingRaw[]>();
      for (const r of aggById.values()) {
        if (!r.userid) continue;
        if (!isBillableForwarder(r)) continue; // defensive — Set B narrows to 5/6
        const list = rowsByUser.get(r.userid) ?? [];
        list.push(r);
        rowsByUser.set(r.userid, list);
      }

      const userids = Array.from(rowsByUser.keys());
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
        .map((uid): EligibleCustomerRow | null => {
          const u = userByID.get(uid);
          const corp = corpByUser.get(uid);
          // Juristic flag = tb_users.userCompany === '1' (per legacy
          // hs-forwarder-invoice/add.php pattern). Fallback to existence of
          // tb_corporate.corporatenumber for safety (some legacy rows lost
          // userCompany during migration).
          const isJuristic = u?.userCompany === "1" || !!corp?.number;
          // BILLING-RUN narrowing (owner 2026-07-07) — a ใบวางบิล is issued ONLY
          // for CREDIT or นิติบุคคล. For a cash (personal, non-credit) customer
          // this drops their fstatus='5' rows → they collect by paying on the
          // portal (ตรวจสลิปที่ /admin/wallet), not via a billing-run. count/total
          // stay EXACT vs the narrowed picker (§0f) since both use this predicate.
          const eligibleRows = (rowsByUser.get(uid) ?? []).filter((r) =>
            isBillingRunEligible(r, isJuristic),
          );
          if (eligibleRows.length === 0) return null; // no billing-run rows → drop customer
          const display = isJuristic
            ? `${uid} (${corp?.name || u?.userName || ""} ${corp?.number ?? ""})`.trim()
            : `${uid} (${u?.userName ?? ""} ${u?.userLastName ?? ""})`.trim();
          // WHT-fix 2026-06-25 — GROSS composite (Σ 7 cols − discount, no 1%).
          // The ใบวางบิล stores gross + shows the หัก ณ ที่จ่าย 1% as its own line
          // (computeBillWht). This dropdown preview is the bill's gross total.
          const total = eligibleRows.reduce((s, r) => s + calcForwarderGross(r), 0);
          return {
            userid:             uid,
            display_name:       display,
            is_juristic:        isJuristic,
            tax_id:             corp?.number ?? "",
            eligible_count:     eligibleRows.length,
            eligible_total_thb: Math.round(total * 100) / 100,
          };
        })
        .filter((r): r is EligibleCustomerRow => r !== null)
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
      // G4 (2026-07-08) — the ตรวจตู้-done ARRIVAL pool (fstatus='4' · ถึงไทยแล้ว) not
      // yet lifted to รอชำระเงิน. These are surfaced ONLY when on the check-queue AND
      // the customer is juristic (filtered below); createBillingRunInvoice then lifts
      // its own picked rows 4→5 with the guarded flip. Kept a separate query so the two
      // existing cohorts are untouched.
      const qArrivedChecked = admin
        .from("tb_forwarder")
        .select(FWD_BILLING_SELECT)
        .eq("userid", userid)
        .eq("fstatus", "4")
        .order("id", { ascending: false })
        .limit(2000);

      const [
        { data: aRaw, error: aErr },
        { data: bRaw, error: bErr },
        { data: cRaw, error: cRawErr },
      ] = await Promise.all([qAwaiting, qCredit, qArrivedChecked]);
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
      if (cRawErr) {
        console.error("[listEligibleForwarders arrived-checked] failed", {
          code: cRawErr.code, message: cRawErr.message,
        });
        return { ok: false, error: cRawErr.message };
      }

      // Is this customer นิติบุคคล? Same signal listEligibleCustomers +
      // createBillingRunInvoice use: tb_users.userCompany==='1' OR a
      // tb_corporate.corporatenumber. Needed for the credit/นิติ narrowing below.
      const { data: uRow, error: uErr } = await admin
        .from("tb_users")
        .select("userCompany")
        .eq("userID", userid)
        .maybeSingle<{ userCompany: string | null }>();
      if (uErr) {
        console.error("[listEligibleForwarders tb_users] failed", {
          code: uErr.code, message: uErr.message,
        });
      }
      const { data: cRow, error: cErr } = await admin
        .from("tb_corporate")
        .select("corporatenumber")
        .eq("userid", userid)
        .maybeSingle<{ corporatenumber: string | null }>();
      if (cErr) {
        console.error("[listEligibleForwarders tb_corporate] failed", {
          code: cErr.code, message: cErr.message,
        });
      }
      const customerIsJuristic =
        uRow?.userCompany === "1" || (cRow?.corporatenumber ?? "").trim() !== "";

      // Union by id (a row can be in both sets) — keep the deterministic
      // newest-first order from Set A.
      const fwdById = new Map<number, FwdBillingRaw>();
      for (const r of ([...(aRaw ?? []), ...(bRaw ?? []), ...(cRaw ?? [])] as unknown as FwdBillingRaw[])) {
        fwdById.set(r.id, r);
      }

      // G3/G4 (2026-07-08) — read the ตรวจตู้ check-queue (tb_check_forwarder) for the
      // candidate pool. Used to (a) PRE-TICK the ตรวจตู้ selection in the create-form
      // (G3), and (b) admit a fresh-4 arrival row into the picker (G4). tb_check_forwarder
      // has no userid col → intersect by fID against this customer's candidate ids.
      const candidateIds = Array.from(fwdById.keys());
      const checkQueuedIds = new Set<number>();
      if (candidateIds.length > 0) {
        const { data: cq, error: cqErr } = await admin
          .from("tb_check_forwarder")
          .select("fID")
          .in("fID", candidateIds);
        if (cqErr) {
          console.error("[listEligibleForwarders check-queue] failed", {
            code: cqErr.code, message: cqErr.message,
          });
          // Non-fatal — no pre-tick / no G4 admission, but the existing cohorts still list.
        }
        for (const r of (cq ?? []) as Array<{ fID: number }>) checkQueuedIds.add(Number(r.fID));
      }

      // BILLING-RUN narrowing (owner 2026-07-07) — surface a row ONLY if this
      // customer is credit/นิติ (juristic → all billable; else credit/advance
      // only, dropping the cash fstatus='5' rows). A cash customer collects by
      // paying on the portal (ตรวจสลิปที่ /admin/wallet), not via a billing-run.
      // G4: additionally admit a fresh-4 ARRIVAL row ONLY when it is on the check-queue
      // AND the customer is juristic (the QA-checked pre-lift case the bill lifts 4→5).
      const fwd = Array.from(fwdById.values())
        .filter(
          (r) =>
            isBillingRunEligible(r, customerIsJuristic) ||
            (isCheckedArrivedForwarder(r) && customerIsJuristic && checkQueuedIds.has(r.id)),
        )
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

      // G1 combo-flow (2026-07-08) — which of these rows' containers have a packing
      // reconcile stamp (mig 0245). Drives the "📦 ยังไม่อัพ packing" badge + the create
      // form's pre-ack of allowUnreconciledPacking. A blank/'0' cabinet is exempt
      // (no container to reconcile). The server gate in createBillingRunInvoice is the
      // authoritative backstop.
      const cabs = Array.from(
        new Set(fwd.map((f) => (f.fcabinetnumber ?? "").trim()).filter((c) => c !== "" && c !== "0")),
      );
      const reconciledCabs = new Set<string>();
      if (cabs.length > 0) {
        const { data: recRows, error: recErr } = await admin
          .from("container_packing_reconcile")
          .select("container_no")
          .in("container_no", cabs);
        if (recErr) {
          console.error("[listEligibleForwarders packing-reconcile] failed", {
            code: recErr.code, message: recErr.message,
          });
          // Non-fatal — no badge / no pre-ack, but the rows still list (the server gate holds).
        }
        for (const r of (recRows ?? []) as Array<{ container_no: string }>) reconciledCabs.add(r.container_no);
      }

      // ค่าส่งไทย gate — SHIPMENT-level COD set (ภูม 2026-07-13): a row is COD-exempt if
      // ITS OWN paymethod is '2' OR any sibling of its base-tracking is COD (a box-split
      // sibling may have kept paymethod='1'). Keeps this list flag == the create gate.
      const codBases = codBaseTrackings(fwd);
      const rows: EligibleForwarderRow[] = fwd.map((f) => ({
        id:              f.id,
        ftrackingchn:    f.ftrackingchn ?? "",
        fdate:           f.fdate,
        famount:         f.famount != null ? Number(f.famount) : null,
        fweight:         f.fweight != null ? Number(f.fweight) : null,
        fvolume:         f.fvolume != null ? Number(f.fvolume) : null,
        ftotalprice:     Number(f.ftotalprice ?? 0),
        // WHT-fix 2026-06-25 — GROSS composite (Σ 7 cols − discount, NO 1%).
        // This is the per-row bill FACE value; it drives the create-form subtotal
        // + the saved line. The create-form's สรุปยอด then deducts the หัก ณ ที่จ่าย
        // 1% ONCE (totalAmount × 0.01) → net. Was calcForwarderOutstanding (NET) →
        // the form previewed net then withheld 1% again = double-deduct on juristic.
        outstanding_thb: calcForwarderGross(f),
        // เหมาๆ ฿100 on this row (the shipment's anchor) else 0 — preview adds Σ selected.
        mao_fee_thb:     maoFeeById.get(f.id) ?? 0,
        fstatus:         f.fstatus,
        fcredit:         f.fcredit,
        already_billed:  alreadyBilledIds.has(f.id),
        // ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — a domestic leg applies but the
        // TH cost is still ฿0. Self-pickup rows (fshipby='PCS') are exempt.
        th_ship_missing: isThShippingCostMissing({ fshipby: f.fshipby, ftransportprice: f.ftransportprice, payMethod: f.paymethod, shipmentIsCod: codBases.has(baseTracking(f.ftrackingchn ?? "") ?? "") }),
        fshipby:         f.fshipby,
        ftransportprice: Number(f.ftransportprice ?? 0),
        check_queued:    checkQueuedIds.has(f.id),
        fcabinetnumber:  (f.fcabinetnumber ?? "").trim() || null,
        // A row with no container is exempt (true = "nothing to reconcile"), else it's
        // reconciled iff its container has a stamp.
        packing_reconciled: (() => {
          const c = (f.fcabinetnumber ?? "").trim();
          return c === "" || c === "0" ? true : reconciledCabs.has(c);
        })(),
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

      // G4 (2026-07-08) — include the ตรวจตู้-done ARRIVAL rows (fstatus='4') alongside
      // รอชำระเงิน ('5') so the container 📄 ทำใบวางบิล shortcut lists fresh rows instead
      // of a BLANK form. FIX E (2026-07-13) — ALSO include เตรียมส่ง ('6') so a CREDIT
      // container (credit granted → fstatus='6') prefills instead of opening blank. This
      // is PREFILL-ONLY: the real eligibility gate is downstream — listEligibleForwarders
      // surfaces only billable rows (isBillingRunEligible: credit-unsettled 5/6 ·
      // check-queued-4 · juristic) and drops already-billed + non-credit cash-6 rows, and
      // createBillingRunInvoice re-guards (isBillableForwarder) + lifts 4→5. 7/99 excluded.
      const { data, error } = await admin
        .from("tb_forwarder")
        .select("id, userid")
        .in("fcabinetnumber", clean)
        .in("fstatus", ["4", "5", "6"])
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
  status?: "all" | "issued" | "paid" | "cancelled" | "overdue" | "slip_pending";
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
      // ภูม 2026-06-29 — "รอตรวจสลิป": issued bills whose slip is attached + pending
      // accounting verify (the slip-verify queue · linked from the dashboard).
      else if (filters.status === "slip_pending") {
        q = q.eq("status", "issued").eq("slip_status", "pending");
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
      // Data-load + WHT math live in the shared service-role loader
      // (lib/billing/load-billing-run-document.ts) so the admin print page and
      // the public /b/[token] page render a BYTE-IDENTICAL bill. This wrapper
      // only adds the admin auth gate (withAdmin) on top.
      const doc = await loadBillingRunDocument(invoiceId);
      if (!doc) return { ok: false, error: "not_found" };
      return { ok: true, data: doc };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 4a2. SET DELIVERY ADDRESS (DISPLAY-only ship-to on the ใบวางบิล · mig 0247)
// ────────────────────────────────────────────────────────────────────────

/**
 * Snapshot a chosen tb_address row (belonging to the invoice customer) into
 * tb_forwarder_invoice.delivery_address so <BillingRunPaper> renders a "ที่อยู่จัดส่ง"
 * line. DISPLAY-only — touches NOTHING else (no amount/subtotal/total/tax/status/
 * buyer_*). Distinct from buyer_address (the tax billing identity).
 *
 * Ownership: the chosen address MUST belong to the invoice's userid + be active.
 */
export async function adminSetBillingRunDeliveryAddress(
  invoiceId: number,
  addressId: number,
): Promise<AdminActionResult> {
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) return { ok: false, error: "invalid_invoice_id" };
  if (!Number.isInteger(addressId) || addressId <= 0) return { ok: false, error: "invalid_address_id" };

  return withAdmin(
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Read the invoice → userid (ownership scope).
      const { data: inv, error: invErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, userid")
        .eq("id", invoiceId)
        .maybeSingle<{ id: number; userid: string }>();
      if (invErr) {
        console.error(`[adminSetBillingRunDeliveryAddress invoice] failed`, { code: invErr.code, message: invErr.message, invoiceId });
        return { ok: false, error: `อ่านใบวางบิลไม่สำเร็จ: ${invErr.message}` };
      }
      if (!inv) return { ok: false, error: "ไม่พบใบวางบิล" };

      // 2. Read the chosen address — MUST belong to the invoice customer + be active.
      const { data: addr, error: addrErr } = await admin
        .from("tb_address")
        .select("addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
        .eq("addressid", addressId)
        .eq("userid", inv.userid)
        .eq("addressstatus", "1")
        .maybeSingle<{
          addressname: string | null; addresslastname: string | null;
          addresstel: string | null; addresstel2: string | null; addressno: string | null;
          addresssubdistrict: string | null; addressdistrict: string | null;
          addressprovince: string | null; addresszipcode: string | null;
        }>();
      if (addrErr) {
        console.error(`[adminSetBillingRunDeliveryAddress address] failed`, { code: addrErr.code, message: addrErr.message, addressId });
        return { ok: false, error: `อ่านที่อยู่ไม่สำเร็จ: ${addrErr.message}` };
      }
      if (!addr) return { ok: false, error: "ไม่พบที่อยู่ของลูกค้ารายนี้ (หรือถูกลบไปแล้ว)" };

      // 3. Compose the readable ship-to snapshot string.
      const name = `${addr.addressname ?? ""} ${addr.addresslastname ?? ""}`.trim();
      const line = [
        addr.addressno,
        addr.addresssubdistrict && `ตำบล/แขวง ${addr.addresssubdistrict}`,
        addr.addressdistrict && `อำเภอ/เขต ${addr.addressdistrict}`,
        addr.addressprovince && `จังหวัด ${addr.addressprovince}`,
        addr.addresszipcode,
      ].filter(Boolean).join(" ");
      const tel = (addr.addresstel ?? "").trim();
      const tel2 = (addr.addresstel2 ?? "").trim();
      const telLine = tel || tel2 ? `โทร. ${tel || "—"}${tel2 ? `, ${tel2}` : ""}` : "";
      const snapshot = [name, line, telLine].filter(Boolean).join("\n");

      // 4. UPDATE ONLY delivery_address — no amount/tax/status/buyer_* touched.
      const { error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({ delivery_address: snapshot })
        .eq("id", invoiceId);
      if (updErr) {
        console.error(`[adminSetBillingRunDeliveryAddress update] failed`, { code: updErr.code, message: updErr.message, invoiceId });
        return { ok: false, error: `บันทึกที่อยู่จัดส่งไม่สำเร็จ: ${updErr.message}` };
      }

      await logAdminAction(adminId, "tb_forwarder_invoice.set_delivery_address", "tb_forwarder_invoice", String(invoiceId), {
        addressId, userid: inv.userid, province: addr.addressprovince ?? "",
      });

      revalidatePath(`/admin/billing-run/${invoiceId}`);
      revalidatePath(`/admin/billing-run/${invoiceId}/print`);
      return { ok: true };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 4b. DUP-slip WARNING (READ-ONLY · display gate for the 3-step slip review)
// ────────────────────────────────────────────────────────────────────────

/**
 * Read-only "เวียนเทียน" (recycled slip) warning for the ใบวางบิล 3-step slip
 * review (step 3 · owner spec §2 "ตรวจสลิปซ้ำ"). Purely DISPLAY — it mutates
 * nothing and changes NO money/WHT logic; it just surfaces OTHER billing-run
 * invoices for the SAME customer + SAME face total that are already `paid`, so
 * accounting can eyeball a possible double-submitted slip before the final
 * ออกใบเสร็จ (markBillingRunPaid). Mirrors the legacy dup rule (same customer +
 * same amount + already-settled) but scoped to tb_forwarder_invoice (the wallet
 * findDuplicateSlips targets a different table). No new juristic threshold.
 *
 * The real settle guard is still markBillingRunPaid (gated super/accounting +
 * the round-1 latch); this is the on-screen check the human runs first.
 */
export async function getBillingRunDuplicateWarnings(
  invoiceId: number,
): Promise<
  AdminActionResult<{
    matches: Array<{ id: number; doc_no: string; total_thb: number; paid_at: string | null }>;
  }>
> {
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return { ok: false, error: "invalid_invoice_id" };
  }
  return withAdmin<{
    matches: Array<{ id: number; doc_no: string; total_thb: number; paid_at: string | null }>;
  }>(
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async () => {
      const admin = createAdminClient();

      // (a) resolve THIS invoice's customer + face total (never mutate).
      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, userid, total_thb")
        .eq("id", invoiceId)
        .maybeSingle<{ id: number; userid: string | null; total_thb: number | string }>();
      if (curErr) {
        console.error("[getBillingRunDuplicateWarnings current] failed", {
          code: curErr.code, message: curErr.message,
        });
        return { ok: false, error: curErr.message };
      }
      if (!cur) return { ok: false, error: "not_found" };
      // No customer or zero total → nothing to compare against.
      if (!cur.userid || Number(cur.total_thb) <= 0) {
        return { ok: true, data: { matches: [] } };
      }

      // (b) OTHER invoices, same customer + same face total, already settled.
      const { data: dupRaw, error: dupErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, total_thb, paid_at")
        .eq("userid", cur.userid)
        .eq("total_thb", cur.total_thb)
        .eq("status", "paid")
        .neq("id", invoiceId)
        .order("paid_at", { ascending: false })
        .limit(10);
      if (dupErr) {
        // Fail-VISIBLE: a check we can't complete surfaces as an error so the
        // human re-verifies, never silently returns "no dup".
        console.error("[getBillingRunDuplicateWarnings dup] failed", {
          code: dupErr.code, message: dupErr.message,
        });
        return { ok: false, error: dupErr.message };
      }

      const matches = ((dupRaw ?? []) as Array<{
        id: number; doc_no: string; total_thb: number | string; paid_at: string | null;
      }>).map((r) => ({
        id: r.id,
        doc_no: r.doc_no,
        total_thb: Number(r.total_thb),
        paid_at: r.paid_at,
      }));

      return { ok: true, data: { matches } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 5. CREATE invoice — mint doc-no + INSERT header + N items (race-safe retry)
// ────────────────────────────────────────────────────────────────────────

export async function createBillingRunInvoice(
  input: CreateBillingRunInvoiceInput,
): Promise<AdminActionResult<{ invoiceId: number; docNo: string }>> {
  // F3 — capture UNEXPECTED throws (auth-throw / DB driver) as a
  // platform_incident, then re-throw; handled `{ ok:false }` returns untouched.
  return withObservability("createBillingRunInvoice", createBillingRunInvoiceImpl)(input);
}

async function createBillingRunInvoiceImpl(
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
      // (a1) G4 (2026-07-08) — LIFT this bill's OWN ตรวจตู้-done arrival rows 4→5
      // before the billable guard, so issuing a ใบวางบิล no longer requires the
      // separate adminCallPriceUser hop (4→5 + SMS + empty-queue). Faithful to that
      // legacy lift: the SAME guarded `.eq('fstatus','4')` flip + fdatestatus5 +
      // status-log. SAFE — only rows on the ตรวจตู้ check-queue (tb_check_forwarder)
      // are liftable, so a crafted POST of a random fstatus='4' row can't be billed
      // (it stays 4 → rejected by the wrongStatus guard below). Never touches a
      // billed 5/6/7 row (the .eq guard no-ops). Role-gated by the 4→5 matrix.
      const arrivedIds = fwd
        .filter((f) => (f.fstatus ?? "").trim() === "4")
        .map((f) => f.id);
      if (arrivedIds.length > 0) {
        const { data: cqRows, error: cqErr } = await admin
          .from("tb_check_forwarder")
          .select("fID")
          .in("fID", arrivedIds);
        if (cqErr) {
          console.error("[createBillingRunInvoice check-queue] failed", {
            code: cqErr.code, message: cqErr.message,
          });
        }
        const liftable = new Set(
          ((cqRows ?? []) as Array<{ fID: number }>).map((r) => Number(r.fID)),
        );
        const toLift = arrivedIds.filter((id) => liftable.has(id));
        if (toLift.length > 0) {
          const callerRoles = (await getAdminRoles()) ?? [];
          if (!canAnyRoleFlipFstatus(callerRoles, "4", "5")) {
            return {
              ok: false,
              error: "บทบาทนี้ยืนยันสถานะ 4→5 (แจ้งชำระเงิน) ไม่ได้ — ให้บัญชี/แอดมินดำเนินการ",
            };
          }
          const nowIso = new Date().toISOString();
          const liftLegacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);
          for (const id of toLift) {
            const { error: liftErr } = await admin
              .from("tb_forwarder")
              .update({
                fstatus:          "5",
                fdatestatus5:     nowIso,
                fdateadminstatus: nowIso,
                adminidupdate:    liftLegacyAdminId,
              })
              .eq("id", id)
              .eq("fstatus", "4"); // same guarded flip as adminCallPriceUser
            if (liftErr) {
              console.error("[createBillingRunInvoice 4->5 lift] failed", {
                code: liftErr.code, message: liftErr.message, id,
              });
              continue; // stays 4 → the wrongStatus guard below rejects the whole bill
            }
            const f = fwd.find((x) => x.id === id);
            if (f) f.fstatus = "5";
            await appendForwarderStatusLog(admin, id, "4", "5", liftLegacyAdminId);
          }
        }
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

      // (a3) ค่าส่งไทย "ห้ามลืม" GATE (pop-spec #3 · owner 2026-07-06) — a SELECTED
      // row whose domestic delivery leg applies (fshipby ≠ self-pickup 'PCS') but
      // whose in-Thailand cost (ftransportprice) is still ฿0/empty = the warehouse
      // or CS forgot the ค่าส่งไทย. Refuse unless the admin explicitly acknowledged
      // (the form badges it "ยังไม่กรอกค่าส่งไทย" + a confirm that sets the ack).
      // Server-side backstop — a client can't skip the TH leg (recomputed here from
      // the DB rows). NOTE: pure validation — this changes NO pricing math; the bill
      // amount is computed exactly as before. Self-pickup rows are exempt.
      // SHIPMENT-level COD set (ภูม 2026-07-13) — exempt a row when any sibling of its
      // base tracking is COD (box-split siblings may keep paymethod='1'). Pure validation.
      const codBasesGate = codBaseTrackings(fwd);
      const missingThShip = fwd.filter((f) =>
        isThShippingCostMissing({ fshipby: f.fshipby, ftransportprice: f.ftransportprice, payMethod: f.paymethod, shipmentIsCod: codBasesGate.has(baseTracking(f.ftrackingchn ?? "") ?? "") }),
      );
      if (missingThShip.length > 0 && !v.allowMissingThShip) {
        return {
          ok: false,
          error:
            `มี ${missingThShip.length} รายการที่ยังไม่กรอกค่าส่งไทย (ค่าขนส่งในไทย ฿0 · ไม่ใช่รับเองที่โกดัง): ` +
            `${missingThShip.map((f) => `#${f.id}`).join(", ")} — กรุณาให้โกดัง/CS กรอกค่าส่งไทยก่อนวางบิล หรือยืนยันออกบิลทั้งที่ยังไม่มีค่าส่งไทย`,
        };
      }

      // (a4) G1 combo-flow PACKING-RECONCILE GATE (2026-07-08) — a SELECTED row whose
      // container has NOT been reconciled against the MOMO packing list yet (mig 0245)
      // may still carry its pre-packing กล่อง/น้ำหนัก basis (the CBM/weight that drives
      // the SELL price could be stale) → billing now risks an under/over-charge. Refuse
      // unless the admin acknowledged (allowUnreconciledPacking · the create-form warns +
      // confirms). Server-side backstop. NOTE: pure validation — changes NO pricing math.
      // Carve-outs (grandfather): (i) rows with a blank/'0' fcabinetnumber are exempt
      // (no container to reconcile); (ii) billed rows never reach here (already lifted /
      // rejected by (b) below); (iii) acknowledgeable → pre-feature containers with no
      // stamp are NOT hard-blocked (staff confirm once). Refuses the WHOLE bill (early
      // return before any INSERT · never partial).
      const cabsToCheck = Array.from(
        new Set(
          fwd
            .map((f) => (f.fcabinetnumber ?? "").trim())
            .filter((c) => c !== "" && c !== "0"),
        ),
      );
      if (cabsToCheck.length > 0 && !v.allowUnreconciledPacking) {
        const { data: reconciledRows, error: recErr } = await admin
          .from("container_packing_reconcile")
          .select("container_no")
          .in("container_no", cabsToCheck);
        if (recErr) {
          console.error("[createBillingRunInvoice packing-reconcile check] failed", {
            code: recErr.code, message: recErr.message,
          });
          // Non-fatal — don't block billing on a lookup error (fall through).
        } else {
          const reconciled = new Set(
            (reconciledRows ?? []).map((r) => (r as { container_no: string }).container_no),
          );
          const unreconciled = fwd.filter((f) => {
            const c = (f.fcabinetnumber ?? "").trim();
            return c !== "" && c !== "0" && !reconciled.has(c);
          });
          if (unreconciled.length > 0) {
            return {
              ok: false,
              error:
                `มี ${unreconciled.length} รายการที่ตู้ยังไม่อัพ packing list (ยังไม่ยืนยันยอดกล่อง/น้ำหนัก): ` +
                `${unreconciled.map((f) => `#${f.id}`).join(", ")} — กรุณาอัพ packing list ที่ /admin/api-forwarder-momo/packing-upload ก่อน หรือยืนยันออกบิลทั้งที่ยังไม่ reconcile`,
            };
          }
        }
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
      // G8 (2026-07-08) — resolve the buyer identity through the SHARED SOT
      // (resolveBillingIdentity · the same resolver step-1 forwarder-check uses)
      // so the bill header + the receipt header + the step-1 preview all derive
      // นิติ/บุคคล name·tax-id·address from ONE code path (was an inline re-impl →
      // could drift). Behaviour is byte-identical to the old inline block: juristic
      // name = corpName||person, tax-id = corp number, address = corp registered
      // address. The buyer_* columns below are the SNAPSHOT stamped onto the bill.
      const identity = resolveBillingIdentity({
        userCompany:  userRow.userCompany,
        userName:     userRow.userName,
        userLastName: userRow.userLastName,
        corp,
      });
      const corpNumber = identity.taxId;
      const isJuristic = identity.isJuristic;

      const buyerName = identity.name;
      let buyerAddress = "";
      const buyerBranch  = ""; // tb_corporate has no `corporatebranch` column

      if (isJuristic) {
        buyerAddress = identity.registeredAddress;
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
      // The per-line amount = calcForwarderGross (Σ 7 price columns − discount,
      // GROSS · NO juristic 1%), NOT ftotalprice alone. The 4 admin adjustment
      // fields (deliveryChn/Th/other/discount) are ADDITIONAL on top of the
      // composite subtotal — they are NOT inside the gross, so no double-count.
      //
      // WHT-fix 2026-06-25 — store GROSS (was calcForwarderOutstanding = NET).
      // The bill is a Thai tax document: subtotal/total are gross, and the หัก ณ
      // ที่จ่าย 1% is shown as ITS OWN line via computeBillWht(total_thb=gross) on
      // every display surface (getInvoiceList :705 · getInvoiceDetail :873 · print).
      // Storing NET here meant computeBillWht then withheld 1% a SECOND time →
      // displayed net ≈ gross×0.98 (the regression). Gross-stored ⇒ net_payable =
      // gross−1% reconciles to the satang with the auto-issued ใบเสร็จ (which
      // already sums the raw priceFull · auto-issue-receipt.ts `pricePayBase`).
      const outstandingByID = new Map<number, number>();
      for (const f of fwd) outstandingByID.set(f.id, calcForwarderGross(f));

      // เหมาๆ (PCSF flat ฿100) — the bill was MISSING it vs the detail page's
      // ยอดเก็บจริง (ภูม 2026-06-23: บิล 4,083.96 แต่ detail 4,183.96). Pull JUST the
      // maoFee per line from the batch engine — the SAME once-per-shipment anchor
      // logic the detail page uses (anchored to the base tracking · เดฟ "กันเก็บเบิ้ล").
      // We deliberately do NOT swap the whole engine (computeForwarderDebitBatch
      // applies its 1% at batch≥฿1000, calcForwarderOutstanding per-row) so juristic
      // <฿1000 bills don't shift — the ONLY money delta is the ฿100 เหมาๆ, stored as
      // its OWN summary line (mao_fee_thb · NOT folded into a row) so the customer
      // SEES it and the ใบเสร็จ reconciles to it (ภูม flag: แยกให้เห็น + ใบเสร็จต้องตรง).
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
      // sum keeps header + items identical to the satang. The เหมาๆ is NOT folded
      // into any row (it's a separate header line · maoFeeTotal below) so the rows
      // stay = base outstanding; an OVERRIDDEN row takes the admin's exact amount.
      const lineAmount = (id: number): number => {
        const ov = overrideAmt(id);
        if (ov != null) return Math.round(ov * 100) / 100;
        return Math.round((outstandingByID.get(id) ?? 0) * 100) / 100;
      };
      const overriddenIds = v.forwarderIds.filter((id) => overrideAmt(id) != null);
      const subtotal = v.forwarderIds.reduce((sum, id) => sum + lineAmount(id), 0);
      // เหมาๆ (PCSF ฿100) — a SEPARATE summary line, Σ the anchor fee over the
      // selected rows (once per shipment). Kept OFF subtotal so subtotal = Σ items
      // (mig 0138 invariant) holds — it rides total_thb only, stored in mao_fee_thb.
      const autoMaoFee = Math.round(
        v.forwarderIds.reduce((sum, id) => sum + (maoFeeByID.get(id) ?? 0), 0) * 100,
      ) / 100;
      // ภูม 2026-06-23 — the admin can EDIT the เหมาๆ on the create form (เซลเก็บรอบเดียว
      // แต่ลูกค้ามีหลายออเดอร์ → คิดเหมาๆครั้งเดียว ไม่ใช่ ฿100×N). Use the submitted value
      // when present (bounded by the schema's positiveMoney), else the auto Σ.
      const maoFeeTotal = v.maoFeeThb != null ? Math.round(v.maoFeeThb * 100) / 100 : autoMaoFee;
      const total = Math.max(
        0,
        subtotal + maoFeeTotal + v.deliveryChnThb + v.deliveryThThb + v.otherThb - v.discountThb,
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
            mao_fee_thb:       maoFeeTotal,
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
      // Line amount = the GROSS composite (Σ subtotal of these lines == the
      // header subtotal, both from calcForwarderGross · WHT-fix 2026-06-25).
      const itemsToInsert = v.forwarderIds.map((fid) => ({
        invoice_id:   invoiceId!,
        forwarder_id: fid,
        // D2 — the line bill amount: admin override if present, else the auto
        // GROSS composite. Same value the subtotal summed, so header + items
        // always reconcile to satang. The 1% WHT is a header-level display line.
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
        // ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — breadcrumb when billed despite a
        // still-฿0 domestic leg, so an under-billed TH-leg invoice can be told apart.
        ...(missingThShip.length > 0
          ? { missing_th_ship_override: true, missing_th_ship_ids: missingThShip.map((f) => f.id) }
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

      // ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — if the bill went out WITH rows still
      // missing a TH-shipping cost, PING CS + accounting so they chase/fix the
      // ค่าส่งไทย. Best-effort: a notify failure never fails the (already-committed)
      // invoice — the audit breadcrumb above is the durable record.
      if (missingThShip.length > 0) {
        const link = `/admin/billing-run/${invoiceId}`;
        const body =
          `ใบวางบิล ${docNo} ออกทั้งที่มี ${missingThShip.length} รายการยังไม่กรอกค่าส่งไทย ` +
          `(${missingThShip.map((f) => `#${f.id}`).join(", ")}) — กรุณาตรวจ/กรอกค่าส่งในไทย`;
        try {
          const { data: csAdmins, error: csErr } = await admin
            .from("admins")
            .select("profile_id")
            .in("role", ["sales", "sales_admin", "ops", "accounting", "super", "ultra"])
            .eq("is_active", true);
          if (csErr) logger.error("billing-run.th-ship-notify", "CS admins lookup failed", csErr, {});
          const seen = new Set<string>();
          for (const row of csAdmins ?? []) {
            const pid = (row as { profile_id: string }).profile_id;
            if (!pid || seen.has(pid)) continue;
            seen.add(pid);
            await sendNotification(pid, {
              category: "forwarder",
              severity: "warning",
              title: "ยังไม่กรอกค่าส่งไทยก่อนวางบิล",
              body,
              link_href: link,
              reference_type: "forwarder_invoice",
              reference_id: String(invoiceId),
            });
          }
        } catch (e) {
          logger.error("billing-run.th-ship-notify", "in-app notify fan-out failed", e, { invoiceId });
        }
        try {
          await notifyStaffGroup(`🚚 ${body}`, { url: link, urlLabel: "เปิดใบวางบิล", title: "ยังไม่กรอกค่าส่งไทย" });
        } catch {
          /* best-effort */
        }
      }

      return { ok: true, data: { invoiceId, docNo } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 6. MARK PAID — flip 'issued' → 'paid' with payment trail
// ────────────────────────────────────────────────────────────────────────

export async function markBillingRunPaid(
  input: MarkBillingRunPaidInput,
): Promise<AdminActionResult<{ invoiceId: number; receiptRid?: string; receiptWarning?: string }>> {
  // F3 — capture UNEXPECTED throws, then re-throw; handled returns untouched.
  return withObservability("markBillingRunPaid", markBillingRunPaidImpl)(input);
}

async function markBillingRunPaidImpl(
  input: MarkBillingRunPaidInput,
): Promise<AdminActionResult<{ invoiceId: number; receiptRid?: string; receiptWarning?: string }>> {
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
      // ภูม 2026-07-01 — บันทึกวันที่ + เวลารับชำระ (24 ชม) เหมือนหน้า wallet.
      // เวลาที่กรอก = เวลาไทย (UTC+7) → ต่อ offset +07:00 ให้ paid_at ตรงกับ
      // เวลานาฬิกาที่พนักงานคีย์จริง. ถ้าไม่มีเวลา → เที่ยงคืน (คงพฤติกรรมเดิม).
      const paidAtDate = v.paidAt ?? isoToday();
      const paidAtIso = v.paidAtTime
        ? `${paidAtDate}T${v.paidAtTime}:00+07:00`
        : `${paidAtDate}T00:00:00Z`;

      // Guard: only flip 'issued' → 'paid'
      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status, total_thb, is_juristic, userid, slip_status, slip_reviewed_at, mao_fee_thb, buyer_name, buyer_tax_id, buyer_address")
        .eq("id", v.invoiceId)
        .maybeSingle<{ id: number; doc_no: string; status: string; total_thb: number | string; is_juristic: boolean; userid: string | null; slip_status: string | null; slip_reviewed_at: string | null; mao_fee_thb: number | string | null; buyer_name: string | null; buyer_tax_id: string | null; buyer_address: string | null }>();
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
      // ภูม 2026-06-30 — ตรวจ 2 รอบ (เหมือนหน้า wallet): ถ้ามีสลิปรอตรวจ (pending)
      // ต้องกด "ตรวจสลิป รอบ 1" (slip_reviewed_at) ก่อน ถึงจะอนุมัติ+ตัดจ่าย (รอบ 2) ได้.
      if (cur.slip_status === "pending" && !cur.slip_reviewed_at) {
        return { ok: false, error: 'กรุณากด "ตรวจสลิป รอบ 1" ก่อนอนุมัติ + ตัดจ่าย (รอบ 2)' };
      }
      // G7 (2026-07-08) — a bill with NO reviewed slip (slip_status null/'rejected')
      // must not settle silently, skipping the "ยืนยันจบการ" step. Require an explicit
      // ชำระนอกระบบ acknowledgment (offlineConfirmed + reason from the UI); the
      // slip-bearing round-1 path above is untouched. This is a settle-GATE only — it
      // changes WHEN a no-slip bill may settle, never any amount.
      const isOfflineSettle = cur.slip_status !== "pending";
      if (isOfflineSettle && !v.offlineConfirmed) {
        return {
          ok: false,
          error: 'บิลนี้ไม่มีสลิป — ต้องยืนยัน "ชำระนอกระบบ (ยืนยันจบการ)" พร้อมเหตุผลก่อนตัดจ่าย',
        };
      }

      const offlineReason = (v.offlineReason ?? "").trim();
      const { error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({
          status:            "paid",
          paid_at:           paidAtIso,
          paid_by:           legacyAdminId,
          payment_method:    v.paymentMethod,
          // G7 — fold the offline-confirm reason into the reference so the paid doc
          // itself carries who/why for a no-slip settle.
          payment_reference: isOfflineSettle && offlineReason
            ? `${v.paymentReference ? v.paymentReference + " · " : ""}ชำระนอกระบบ: ${offlineReason}`
            : v.paymentReference,
          // ภูม 2026-06-29 — บัญชีตัดจ่าย = ยืนยันสลิปที่เซลแนบ. แนบ pending → verified.
          // ไม่มีสลิป (null) → คงไว้ null (จ่ายนอกระบบ/ไม่ผ่านสลิป).
          slip_status:       cur.slip_status === "pending" ? "verified" : cur.slip_status,
          // G7 — STAMP the "ยืนยันจบการ" audit on the offline path (reuse the 2-round
          // columns · mig 0231). The round-1 path already sets these; only stamp here
          // for a no-slip settle so the confirming admin + time are on-record.
          ...(isOfflineSettle
            ? { slip_reviewed_at: paidAtIso, slip_reviewed_by: legacyAdminId }
            : {}),
        })
        .eq("id", v.invoiceId)
        .eq("status", "issued"); // race guard: re-check we're flipping from issued
      if (updErr) {
        console.error("[markBillingRunPaid update] failed", {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: updErr.message };
      }

      // total_thb is the GROSS invoice face (WHT-fix 2026-06-25). The actual cash
      // a juristic buyer remits = net_payable (gross − หัก ณ ที่จ่าย 1%); the 1%
      // is withheld + paid to the revenue dept on our behalf (we reclaim it via
      // the 50-ทวิ cert). Log BOTH so the audit trail shows face vs cash collected.
      const paidWht = computeBillWht(cur.is_juristic, Number(cur.total_thb));
      await logAdminAction(adminId, "billing_run.mark_paid", "forwarder_invoice", String(v.invoiceId), {
        doc_no: cur.doc_no, payment_method: v.paymentMethod, reference: v.paymentReference,
        total_thb: Number(cur.total_thb), wht_amount: paidWht.wht_amount,
        net_payable: paidWht.net_payable, paid_at: paidAtIso,
        // G7 — record the no-slip "ยืนยันจบการ" (offline settle) confirm + reason.
        offline_confirmed: isOfflineSettle && v.offlineConfirmed,
        offline_reason: isOfflineSettle ? offlineReason : "",
      });

      // ภูม 2026-06-22 — sync the linked ใบเสร็จ to "ออกแล้ว/paid". A receipt issued
      // manually via adminIssueForwarderInvoice is created at rstatus='3' (รอชำระ);
      // when its bill is marked paid here it must flip to '1', else the receipt list
      // shows "รอชำระ" while the bill shows "รับชำระแล้ว" (ภูม flag · FRI2606-00011 paid
      // but FRG2606-00001 stuck). Link = tb_receipt_item (rid, fid) ↔ the invoice's
      // forwarders. Flips ONLY a receipt FULLY covered by this paid invoice. Best-effort
      // — never fails the invoice flip; only '3'→'1' (never touches cancelled/already-paid).
      // ภูม 2026-07-09 — SURFACE the auto-receipt outcome to the admin. The receipt
      // auto-issue below is BEST-EFFORT (a failure must never roll back the money-safe
      // paid flip), but the old code swallowed a failure into a console.error → staff saw
      // "✓ รับชำระแล้ว" while NO ใบเสร็จ was created + never knew (the exact PR086 /
      // FRI2607-00015 symptom). Track the result so the UI can warn + prompt a manual issue.
      let receiptRid: string | null = null;
      let receiptWarning: string | null = null;
      // Path A (below) may flip an EXISTING pending receipt '3'→'1' for a fully-covered rid.
      // Track it so the already_issued branch can tell "a valid receipt now exists" (findable)
      // apart from "an old receipt covers these fids but was NOT synced" (stuck '3'/'0' · invisible).
      let receiptSyncedRid: string | null = null;
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

          // FIX D (2026-07-13 · owner "เครดิต→ใบแจ้งหนี้ · เงินไม่ซิงค์/สถานะไม่เดิน") —
          // collecting a CREDIT customer's ใบแจ้งหนี้ here must ALSO SETTLE the credit,
          // else the order stays fcredit='1' forever: AR-aging keeps counting it + the
          // credit line never frees (billing-run is narrowed to the credit/นิติ cohort →
          // this is its primary case · high impact). Mirror the canonical credit-settle
          // (actions/credit.ts L381 · actions/admin/pay-user.ts path #2 · legacy
          // pay-users.php L469): for THIS invoice's forwarder rows still on credit
          // (fcredit='1'), clear fcredit ONLY — deliberately NO paydeposit='1': a
          // settled-credit row at fstatus '6' with paydeposit='1' is EXCLUDED from the
          // dispatch queue (lib/admin/pending-dispatch.ts · legacy forwarder-driver.php
          // paydeposit gate), so stamping it here would make a quickly-paid credit
          // order invisible to มอบงานคนขับ = a new stuck state. Re-collect is already
          // blocked by fcredit no longer being '1' (isCreditUnsettledEligible checks
          // fcredit='1' first). Amount via the SAME canonical calcForwarderOutstanding,
          // then reduce tb_credit.creditvalue by the amount actually settled.
          // TOCTOU-guarded .eq('fcredit','1'); best-effort — a failure NEVER rolls
          // back the money-safe paid flip (exactly like the receipt-sync).
          try {
            const { data: creditRows, error: creditRowsErr } = await admin
              .from("tb_forwarder")
              .select(
                "id, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
              )
              .in("id", Array.from(invFids))
              .eq("fcredit", "1");
            if (creditRowsErr) {
              console.error("[markBillingRunPaid credit-settle read]", { code: creditRowsErr.code, message: creditRowsErr.message, invoiceId: v.invoiceId });
            } else if ((creditRows ?? []).length > 0) {
              let settledSum = 0;
              const settledIds: number[] = [];
              for (const row of (creditRows ?? []) as Array<
                Parameters<typeof calcForwarderOutstanding>[0] & { id: number }
              >) {
                const due = calcForwarderOutstanding(row);
                // Clear fcredit — .eq('fcredit','1') guard makes it TOCTOU-safe
                // (a concurrent settle = 0 rows matched = harmless no-op). Mirrors
                // credit.ts exactly (fcredit + stamp only · no paydeposit ↑).
                const { data: flipped, error: flipErr } = await admin
                  .from("tb_forwarder")
                  .update({ fcredit: "", fdateadminstatus: paidAtIso })
                  .eq("id", row.id)
                  .eq("fcredit", "1")
                  .select("id");
                if (flipErr) {
                  console.error("[markBillingRunPaid credit-settle flip]", { code: flipErr.code, message: flipErr.message, fid: row.id });
                  continue;
                }
                if ((flipped ?? []).length === 0) continue; // already settled → don't double-decrement
                settledIds.push(row.id);
                settledSum = Math.round((settledSum + due) * 100) / 100;
              }
              // Reduce the customer's running credit balance by exactly what we settled
              // (clamp ≥0 · mirrors credit.ts L410). Only when a credit row actually flipped
              // and a tb_credit row exists (best-effort · never create/insert here).
              if (settledSum > 0 && cur.userid) {
                const { data: creditRow, error: creditReadErr } = await admin
                  .from("tb_credit")
                  .select("creditvalue")
                  .eq("userid", cur.userid)
                  .maybeSingle<{ creditvalue: number | string | null }>();
                if (creditReadErr) {
                  console.error("[markBillingRunPaid credit-decrement read]", { code: creditReadErr.code, message: creditReadErr.message, userid: cur.userid });
                } else if (creditRow) {
                  const current = Number(creditRow.creditvalue ?? 0) || 0;
                  const next = Math.max(0, Math.round((current - settledSum) * 100) / 100);
                  const { error: creditUpdErr } = await admin
                    .from("tb_credit")
                    .update({ creditvalue: next })
                    .eq("userid", cur.userid);
                  if (creditUpdErr) console.error("[markBillingRunPaid credit-decrement]", { code: creditUpdErr.code, message: creditUpdErr.message, userid: cur.userid });
                }
                await logAdminAction(adminId, "billing_run.credit_settled", "forwarder_invoice", String(v.invoiceId), {
                  doc_no: cur.doc_no, userid: cur.userid, settled_fids: settledIds, settled_amount: settledSum,
                });
              }
            }
          } catch (e) {
            console.error("[markBillingRunPaid credit-settle] unexpected", { message: String(e), invoiceId: v.invoiceId });
          }

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
              receiptSyncedRid = rid;
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
              // STEP-2: accounting-chosen ใบเสร็จ เลขที่ (dup-validated in the helper).
              overrideRid: v.overrideRid,
              // เหมาๆ mirrors the bill's OWN stored value (tb_forwarder_invoice.mao_fee_thb ·
              // mig 0209) so receipt total == bill total by construction. markBillingRunPaid
              // settles exactly ONE invoice → the receipt covers exactly its fids (invFids) →
              // no SUM needed. 0 stays 0, 100 stays 100.
              maoFeeOverride: Number(cur.mao_fee_thb ?? 0),
              // G1 (2026-07-08) — PIN the ใบเสร็จ total to THIS paid bill's frozen
              // numbers. total_thb = the GROSS face (incl เหมาๆ + extras); paidWht.net_payable
              // = the cash the customer actually remitted (gross − 1% WHT); is_juristic = the
              // WHT decision as billed. The receipt reconciles to these (not a live recompute
              // that drifts if a row was edited between issue↔pay) and logs any drift.
              totalOverride:      Number(cur.total_thb),
              netOverride:        paidWht.net_payable,
              isJuristicOverride: cur.is_juristic,
              // G8 (2026-07-08) — STAMP the receipt header from THIS bill's buyer
              // snapshot (resolved via resolveBillingIdentity at issue) so bill == receipt
              // header even if บุคคล↔นิติ or the address changed between issue↔pay. Nullish
              // (a pre-G8 bill missing the column) → the receipt re-resolves live, unchanged.
              recompNameOverride:    cur.buyer_name ?? undefined,
              recompNumberOverride:  cur.buyer_tax_id ?? undefined,
              recompAddressOverride: cur.buyer_address ?? undefined,
            });
            if (rcpt.ok) {
              receiptRid = rcpt.data.rid;
              await logAdminAction(adminId, "billing_run.receipt_auto_created", "tb_receipt", rcpt.data.rid, {
                invoice_id: v.invoiceId, doc_no: cur.doc_no, amount_thb: rcpt.data.rAmount,
              });
            } else if (!rcpt.alreadyIssued) {
              // Real failure (no_matching_forwarder_rows / mint_failed / insert error /
              // rid_duplicate). Money already moved → NEVER roll back the paid flip; instead
              // SURFACE the miss so accounting issues the receipt manually (the PR086 /
              // FRI2607-00015 case: bill = รับชำระแล้ว but no ใบเสร็จ, silently).
              receiptWarning =
                `ระบบออกใบเสร็จอัตโนมัติไม่สำเร็จ (${rcpt.error}) — กรุณากด "ออกใบเสร็จ" เอง หรือเช็ครายการใบเสร็จที่ค้าง`;
              console.error("[markBillingRunPaid auto-receipt] failed", { error: rcpt.error, invoiceId: v.invoiceId });
            } else if (receiptSyncedRid) {
              // alreadyIssued because Path A flipped a fully-covered '3'→'1' → a valid receipt
              // now exists + is findable ("ออกแล้ว") → surface it as success, no warning.
              receiptRid = receiptSyncedRid;
            } else {
              // alreadyIssued but Path A did NOT sync a covering receipt → an existing receipt
              // covers these fids yet is NOT "ออกแล้ว" (a partially-covered '3'/'0' the sync-guard
              // skipped, per the adversarial review 2026-07-09). It likely sits invisible on the
              // "ออกแล้ว" tab, or outside the receipt search's default current-month window →
              // tell staff WHERE to look instead of a silent "✓ รับชำระแล้ว" (the PR086 case).
              receiptWarning =
                'มีใบเสร็จเดิมของรายการนี้อยู่แล้ว แต่ยังไม่แสดงเป็น "ออกแล้ว" — ค้นหาใบเสร็จลูกค้ารายนี้แบบไม่กรองเดือน (แท็บ "ล่าสุด") หรือกดออก/sync ใบเสร็จ';
            }
          } else {
            receiptWarning =
              "ใบวางบิลนี้ไม่มีรหัสลูกค้า (userid) — ระบบออกใบเสร็จอัตโนมัติไม่ได้ · กรุณาออกใบเสร็จเอง";
          }
        } else {
          receiptWarning =
            "ไม่พบรายการนำเข้าที่ผูกกับใบวางบิลนี้ — ระบบออกใบเสร็จอัตโนมัติไม่ได้ · กรุณาตรวจสอบใบวางบิล";
        }
      } catch (e) {
        console.error("[markBillingRunPaid receipt-sync] unexpected", { message: String(e), invoiceId: v.invoiceId });
        receiptWarning =
          "เกิดข้อผิดพลาดระหว่างออกใบเสร็จอัตโนมัติ — บันทึกการรับชำระแล้ว · กรุณาตรวจสอบใบเสร็จ/ออกเอง";
      }

      revalidatePath("/[locale]/(admin)/admin/billing-run", "page");
      revalidatePath("/[locale]/(admin)/admin/billing-run/[id]", "page");
      revalidatePath("/[locale]/(admin)/admin/accounting/receipts", "page");
      revalidatePath("/[locale]/(admin)/admin/forwarders", "page");

      return {
        ok: true,
        data: {
          invoiceId: v.invoiceId,
          ...(receiptRid ? { receiptRid } : {}),
          ...(receiptWarning ? { receiptWarning } : {}),
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 6b. ENSURE RECEIPT — one-click "ออก/พิมพ์ใบเสร็จ" from the bill detail page
//     (ภูม 2026-07-10). Paid bills only. If a receipt already covers the bill's
//     forwarders → return it. Else issue it NOW from the bill's FROZEN totals +
//     buyer identity (the SAME overrides markBillingRunPaid's auto-issue uses) so
//     the receipt is always in-sync with the bill — one click, no navigating to
//     the receipt page. Directly fixes the PR086 บุคคล↔นิติ pain: the receipt
//     header/total follow the bill, and a bill whose auto-issue failed can be
//     issued on demand. Returns receiptId for the print route.
// ────────────────────────────────────────────────────────────────────────

/** Find an ACTIVE (non-cancelled) receipt covering ANY of these forwarder ids. */
async function findActiveReceiptForFids(
  admin: ReturnType<typeof createAdminClient>,
  fids: number[],
): Promise<{ receiptId: number; rid: string } | null> {
  if (fids.length === 0) return null;
  const { data: items, error: itemErr } = await admin
    .from("tb_receipt_item")
    .select("rid")
    .in("fid", fids);
  if (itemErr) {
    console.error("[findActiveReceiptForFids items]", { code: itemErr.code, message: itemErr.message });
    return null;
  }
  const rids = Array.from(
    new Set(((items ?? []) as Array<{ rid: string | null }>).map((r) => r.rid).filter((x): x is string => !!x)),
  );
  if (rids.length === 0) return null;
  const { data: receipts, error: rErr } = await admin
    .from("tb_receipt")
    .select("id, rid, rstatus")
    .in("rid", rids)
    .neq("rstatus", "2") // '2' = ยกเลิก — a cancelled receipt does not count
    .order("id", { ascending: false });
  if (rErr) {
    console.error("[findActiveReceiptForFids receipts]", { code: rErr.code, message: rErr.message });
    return null;
  }
  const first = ((receipts ?? []) as Array<{ id: number; rid: string }>)[0];
  return first ? { receiptId: first.id, rid: first.rid } : null;
}

export async function ensureBillingRunReceipt(
  input: { invoiceId: number },
): Promise<AdminActionResult<{ receiptId: number; rid: string; created: boolean }>> {
  const invoiceId = Number((input as { invoiceId?: unknown })?.invoiceId);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return { ok: false, error: "invalid_invoice_id" };
  }

  return withAdmin<{ receiptId: number; rid: string; created: boolean }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Load the invoice — the button is only ENABLED at status='paid' (slip
      //    verified + settled), but re-assert server-side (never trust the client).
      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status, userid, total_thb, is_juristic, mao_fee_thb, paid_at, buyer_name, buyer_tax_id, buyer_address")
        .eq("id", invoiceId)
        .maybeSingle<{
          id: number; doc_no: string; status: string; userid: string | null;
          total_thb: number | string; is_juristic: boolean; mao_fee_thb: number | string | null;
          paid_at: string | null; buyer_name: string | null; buyer_tax_id: string | null; buyer_address: string | null;
        }>();
      if (curErr) {
        console.error("[ensureBillingRunReceipt current] failed", { code: curErr.code, message: curErr.message });
        return { ok: false, error: curErr.message };
      }
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.status !== "paid") {
        return { ok: false, error: "ต้องรับชำระ (ตรวจสลิป + ยืนยันการชำระ) ก่อน ถึงจะออกใบเสร็จได้" };
      }
      if (!cur.userid) {
        return { ok: false, error: "ใบวางบิลนี้ไม่มีรหัสลูกค้า — ออกใบเสร็จไม่ได้" };
      }

      // 2. The forwarder rows this bill covers.
      const { data: invItems, error: invErr } = await admin
        .from("tb_forwarder_invoice_item")
        .select("forwarder_id")
        .eq("invoice_id", invoiceId);
      if (invErr) {
        console.error("[ensureBillingRunReceipt items] failed", { code: invErr.code, message: invErr.message });
        return { ok: false, error: invErr.message };
      }
      const fids = Array.from(new Set(((invItems ?? []) as Array<{ forwarder_id: number }>).map((r) => r.forwarder_id)));
      if (fids.length === 0) {
        return { ok: false, error: "ไม่พบรายการนำเข้าที่ผูกกับใบวางบิลนี้" };
      }

      // 3. Already have an active receipt → return it (open/print, don't re-create).
      const existing = await findActiveReceiptForFids(admin, fids);
      if (existing) {
        return { ok: true, data: { receiptId: existing.receiptId, rid: existing.rid, created: false } };
      }

      // 4. None yet → issue NOW, PINNED to the bill's frozen totals + buyer identity
      //    (identical overrides to markBillingRunPaid's auto-issue) → receipt == bill.
      const paidWht = computeBillWht(cur.is_juristic, Number(cur.total_thb));
      const dateSlip = cur.paid_at ? new Date(cur.paid_at) : new Date();
      const rcpt = await autoIssueReceiptOnPaymentLand(admin, {
        userid: cur.userid,
        fids,
        dateSlip,
        source: "billing_run.ensure_receipt",
        maoFeeOverride: Number(cur.mao_fee_thb ?? 0),
        totalOverride: Number(cur.total_thb),
        netOverride: paidWht.net_payable,
        isJuristicOverride: cur.is_juristic,
        recompNameOverride: cur.buyer_name ?? undefined,
        recompNumberOverride: cur.buyer_tax_id ?? undefined,
        recompAddressOverride: cur.buyer_address ?? undefined,
      });
      if (rcpt.ok) {
        await logAdminAction(adminId, "billing_run.receipt_issued_manual", "tb_receipt", rcpt.data.rid, {
          invoice_id: invoiceId, doc_no: cur.doc_no, amount_thb: rcpt.data.rAmount,
        });
        revalidatePath("/[locale]/(admin)/admin/billing-run/[id]", "page");
        revalidatePath("/[locale]/(admin)/admin/accounting/receipts", "page");
        return { ok: true, data: { receiptId: rcpt.data.receiptId, rid: rcpt.data.rid, created: true } };
      }
      // Race: a receipt got created between our check + issue → re-find + return it.
      if (rcpt.alreadyIssued) {
        const again = await findActiveReceiptForFids(admin, fids);
        if (again) return { ok: true, data: { receiptId: again.receiptId, rid: again.rid, created: false } };
      }
      return { ok: false, error: `ออกใบเสร็จไม่สำเร็จ: ${rcpt.error}` };
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
// 7b. VOID (soft-cancel · KEEP HISTORY) — tick-to-void from the บิลลิสต์
//     (task 4c · ภูม 2026-07-01)
// ────────────────────────────────────────────────────────────────────────
//
// Difference vs cancelBillingRunInvoice (§7):
//   - §7 cancel is for an issued (unpaid) bill that was output wrong — it
//     REFUSES a paid bill (a paid bill's rows must not silently re-open for
//     re-billing).
//   - This VOID additionally covers a bill that was already รับชำระแล้ว/paid
//     (owner: "even when status = รับชำระแล้ว, staff must be able to void") —
//     a document void that KEEPS the record. It flips status → 'cancelled'
//     (the existing voided state · badge "ยกเลิกแล้ว") and stamps the existing
//     cancelled_* / cancel_reason columns so no new migration is needed.
//
// MONEY-SAFETY (critical · money lane):
//   - SOFT only. Never DELETEs — the invoice header + its items stay for the
//     audit trail; voided rows remain visible (badged), never disappear.
//   - Moves NO money. A void does NOT touch tb_wallet / tb_payment, does NOT
//     reset/re-open the linked forwarder rows (paydeposit / fstatus), and does
//     NOT void the linked ใบเสร็จ (that has its own tick-to-void on the receipt
//     list). It writes ONLY tb_forwarder_invoice.status + the cancel stamps.
//   - Idempotent + race-guarded: `.neq("status","cancelled")` so an already-
//     voided invoice is skipped; re-running is a no-op.

export async function voidBillingRunInvoices(input: {
  invoiceIds: number[];
  reason: string;
}): Promise<AdminActionResult<{ voided: number; skipped: number }>> {
  const rawIds = Array.isArray(input?.invoiceIds) ? input.invoiceIds : [];
  const reason = String(input?.reason ?? "").trim();
  const invoiceIds = Array.from(
    new Set(rawIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)),
  );
  if (invoiceIds.length === 0) return { ok: false, error: "ไม่ได้เลือกใบวางบิล" };
  if (invoiceIds.length > 200) return { ok: false, error: "เลือกได้ครั้งละไม่เกิน 200 ใบ" };
  if (reason.length < 3) return { ok: false, error: "กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)" };

  return withAdmin<{ voided: number; skipped: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 50);

      // Flip every NOT-already-cancelled invoice → cancelled (covers issued AND
      // paid). Returns the rows it actually flipped so we report voided vs skipped.
      const { data: flipped, error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({
          status:        "cancelled",
          cancelled_at:  new Date().toISOString(),
          cancelled_by:  legacyAdminId,
          cancel_reason: reason,
        })
        .in("id", invoiceIds)
        .neq("status", "cancelled")
        .select("id, doc_no");
      if (updErr) {
        console.error("[voidBillingRunInvoices] failed", { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      const voidedRows = (flipped ?? []) as Array<{ id: number; doc_no: string }>;
      const voided = voidedRows.length;
      const skipped = invoiceIds.length - voided;

      for (const r of voidedRows) {
        await logAdminAction(adminId, "billing_run.void_invoice", "forwarder_invoice", String(r.id), {
          doc_no: r.doc_no, reason,
        });
      }

      revalidatePath("/[locale]/(admin)/admin/billing-run", "page");
      revalidatePath("/[locale]/(admin)/admin/billing-run/[id]", "page");

      return { ok: true, data: { voided, skipped } };
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
    // ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — the quick-bill button has no confirm
    // step, so it never overrides: a cabinet with a forgotten TH cost is REFUSED
    // with the clear error (surfaced on the button), the intended soft-gate.
    allowMissingThShip: false,
    // G1 combo-flow — same never-waive stance: an un-reconciled container is REFUSED
    // (this quick path has no confirm; อัพ packing list ก่อน หรือใช้หน้า /add).
    allowUnreconciledPacking: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// SLIP attach + verify queue (ภูม 2026-06-29) — เซลแนบสลิป → บัญชีตรวจ+ตัดจ่าย.
// uploadBillingRunSlip stores the slip path + flips slip_status='pending'; it does
// NOT settle (settle = markBillingRunPaid, gated super/accounting, flips pending→
// verified). listBillingRunPendingSlips powers the accounting slip-verify queue.
// Money-safety: writes ONLY the slip_* columns — never total/status/wallet.
// ─────────────────────────────────────────────────────────────────────────────
export async function uploadBillingRunSlip(input: {
  invoiceId: number;
  slipPath: string;
}): Promise<AdminActionResult<{ invoiceId: number }>> {
  const invoiceId = Number(input?.invoiceId);
  const slipPath = String(input?.slipPath ?? "").trim();
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return { ok: false, error: "invalid_invoice_id" };
  }
  if (!slipPath || slipPath.length > 500) {
    return { ok: false, error: "ไฟล์สลิปไม่ถูกต้อง" };
  }

  return withAdmin<{ invoiceId: number }>(
    // เซล/Doc/บัญชี แนบสลิปได้ — การยืนยัน+ตัดจ่าย (markBillingRunPaid) ยังเป็น
    // super/accounting เท่านั้น (เซลกดยืนยันไม่ได้).
    ["super", "accounting", "sales", "sales_admin", "ops", "freight_export_doc", "freight_import_doc"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const uploader = safeLegacyAdminId(await resolveLegacyAdminId(), 50);

      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status, slip_paths")
        .eq("id", invoiceId)
        .maybeSingle<{ id: number; doc_no: string; status: string; slip_paths: unknown }>();
      if (curErr) {
        console.error("[uploadBillingRunSlip current] failed", { code: curErr.code, message: curErr.message });
        return { ok: false, error: curErr.message };
      }
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.status !== "issued") {
        return { ok: false, error: `ใบวางบิล ${cur.doc_no} อยู่ในสถานะ ${cur.status} แล้ว — แนบสลิปไม่ได้` };
      }

      // ภูม 2026-06-30 — แนบได้หลายรูป: append เข้า slip_paths (เก็บล่าสุด 10).
      const prevPaths = Array.isArray(cur.slip_paths)
        ? cur.slip_paths.filter((p): p is string => typeof p === "string")
        : [];
      const nextPaths = [...prevPaths, slipPath].slice(-10);
      const { error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({
          slip_paths:       nextPaths,
          slip_path:        slipPath,        // ล่าสุด = รูปหลัก (thumb ในคิว)
          slip_uploaded_by: uploader,
          slip_uploaded_at: new Date().toISOString(),
          slip_status:      "pending",
          slip_reviewed_at: null,            // แนบรูปใหม่ → ล้างตรวจรอบ1 (บัญชีต้องตรวจใหม่)
        })
        .eq("id", invoiceId)
        .eq("status", "issued");
      if (updErr) {
        console.error("[uploadBillingRunSlip update] failed", { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "billing_run.slip_upload", "forwarder_invoice", String(invoiceId), {
        doc_no: cur.doc_no, slip_path: slipPath, uploaded_by: uploader,
      });
      revalidatePath(`/admin/billing-run/${invoiceId}`);
      return { ok: true, data: { invoiceId } };
    },
  );
}

/**
 * ภูม 2026-06-30 — ตรวจสลิป รอบ 1 (เหมือนหน้า wallet · A4 2-round). บัญชีกดตรวจ
 * สลิปที่เซลแนบ → stamp slip_reviewed_at. ตัดจ่าย (รอบ 2 · markBillingRunPaid)
 * ทำไม่ได้จนกว่ารอบ 1 ผ่าน. ไม่แตะเงิน/สถานะบิล — แค่ stamp การตรวจ.
 */
export async function reviewBillingRunSlipRound1(input: {
  invoiceId: number;
}): Promise<AdminActionResult<{ invoiceId: number }>> {
  const invoiceId = Number(input?.invoiceId);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return { ok: false, error: "invalid_invoice_id" };
  }
  return withAdmin<{ invoiceId: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const reviewer = safeLegacyAdminId(await resolveLegacyAdminId(), 50);

      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status, slip_status, slip_reviewed_at")
        .eq("id", invoiceId)
        .maybeSingle<{ id: number; doc_no: string; status: string; slip_status: string | null; slip_reviewed_at: string | null }>();
      if (curErr) {
        console.error("[reviewBillingRunSlipRound1 current] failed", { code: curErr.code, message: curErr.message });
        return { ok: false, error: curErr.message };
      }
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.status !== "issued") {
        return { ok: false, error: `ใบวางบิล ${cur.doc_no} อยู่ในสถานะ ${cur.status} แล้ว` };
      }
      if (cur.slip_status !== "pending") {
        return { ok: false, error: "ยังไม่มีสลิปรอตรวจ" };
      }
      if (cur.slip_reviewed_at) {
        return { ok: true, data: { invoiceId } }; // idempotent: ตรวจรอบ 1 แล้ว
      }

      const { error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({ slip_reviewed_at: new Date().toISOString(), slip_reviewed_by: reviewer })
        .eq("id", invoiceId)
        .eq("status", "issued")
        .eq("slip_status", "pending")
        .is("slip_reviewed_at", null); // race guard
      if (updErr) {
        console.error("[reviewBillingRunSlipRound1 update] failed", { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }
      await logAdminAction(adminId, "billing_run.slip_review_round1", "forwarder_invoice", String(invoiceId), {
        doc_no: cur.doc_no, reviewed_by: reviewer,
      });
      revalidatePath(`/admin/billing-run/${invoiceId}`);
      return { ok: true, data: { invoiceId } };
    },
  );
}

/**
 * ภูม 2026-06-30 — ปฏิเสธสลิป (เหมือนหน้า wallet "ปฏิเสธรายการ"). บัญชีตรวจแล้ว
 * สลิปไม่ถูกต้อง → slip_status='rejected' + ล้างตรวจรอบ 1 → ออกจากคิว "ชำระเงิน"
 * (คิวกรอง slip_status='pending'). บิลคงสถานะ issued (ยังไม่จ่าย) — เซลแนบสลิปใหม่ได้.
 * เก็บ slip_paths ไว้เป็นหลักฐาน. ไม่แตะเงิน.
 */
export async function rejectBillingRunSlip(input: {
  invoiceId: number;
  reason: string;
}): Promise<AdminActionResult<{ invoiceId: number }>> {
  const invoiceId = Number(input?.invoiceId);
  const reason = String(input?.reason ?? "").trim();
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return { ok: false, error: "invalid_invoice_id" };
  }
  if (reason.length < 3) {
    return { ok: false, error: "กรุณาระบุเหตุผลที่ปฏิเสธ" };
  }
  return withAdmin<{ invoiceId: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const reviewer = safeLegacyAdminId(await resolveLegacyAdminId(), 50);

      const { data: cur, error: curErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, status, slip_status")
        .eq("id", invoiceId)
        .maybeSingle<{ id: number; doc_no: string; status: string; slip_status: string | null }>();
      if (curErr) {
        console.error("[rejectBillingRunSlip current] failed", { code: curErr.code, message: curErr.message });
        return { ok: false, error: curErr.message };
      }
      if (!cur) return { ok: false, error: "not_found" };
      if (cur.slip_status !== "pending") {
        return { ok: false, error: "ไม่มีสลิปรอตรวจให้ปฏิเสธ" };
      }

      const { error: updErr } = await admin
        .from("tb_forwarder_invoice")
        .update({ slip_status: "rejected", slip_reviewed_at: null, slip_reviewed_by: reviewer })
        .eq("id", invoiceId)
        .eq("slip_status", "pending"); // race guard
      if (updErr) {
        console.error("[rejectBillingRunSlip update] failed", { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }
      await logAdminAction(adminId, "billing_run.slip_reject", "forwarder_invoice", String(invoiceId), {
        doc_no: cur.doc_no, reason, reviewed_by: reviewer,
      });
      revalidatePath(`/admin/billing-run/${invoiceId}`);
      return { ok: true, data: { invoiceId } };
    },
  );
}

export type BillingRunPendingSlipRow = {
  invoiceId: number;
  docNo: string;
  userid: string;
  buyerName: string;
  totalThb: number;
  uploadedBy: string | null;
  uploadedAt: string | null;
};

export async function listBillingRunPendingSlips(): Promise<
  AdminActionResult<{ rows: BillingRunPendingSlipRow[] }>
> {
  return withAdmin<{ rows: BillingRunPendingSlipRow[] }>(
    ["super", "accounting", "ops"],
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no, userid, buyer_name, total_thb, slip_uploaded_by, slip_uploaded_at")
        .eq("status", "issued")
        .eq("slip_status", "pending")
        .order("slip_uploaded_at", { ascending: true })
        .limit(200);
      if (error) {
        console.error("[listBillingRunPendingSlips] failed", { code: error.code, message: error.message });
        return { ok: false, error: error.message };
      }
      const rows: BillingRunPendingSlipRow[] = (
        (data ?? []) as Array<{
          id: number; doc_no: string; userid: string | null; buyer_name: string | null;
          total_thb: number | string | null; slip_uploaded_by: string | null; slip_uploaded_at: string | null;
        }>
      ).map((r) => ({
        invoiceId:  r.id,
        docNo:      r.doc_no,
        userid:     r.userid ?? "",
        buyerName:  r.buyer_name ?? "",
        totalThb:   Number(r.total_thb ?? 0),
        uploadedBy: r.slip_uploaded_by,
        uploadedAt: r.slip_uploaded_at,
      }));
      return { ok: true, data: { rows } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 9. CONSOLIDATION VIEW (pop-spec #3 · owner 2026-07-06)
// ────────────────────────────────────────────────────────────────────────
//
// The accounting "รวมวางบิล — ตู้ที่ตรวจแล้ว" screen. Two workflows on ONE page:
//   แบบ 1 (per-customer): combine ALL of a customer's ready containers into ONE
//          bill — done by the existing /add form (this page just links to it).
//   แบบ 2 (batch): tick MANY customers → issue one bill per ticked customer, all
//          at once, via createBatchBillingRunInvoices (which CALLS the money path
//          createBillingRunInvoice, never re-implements it).
//
// Owner rule (verbatim): "ต้องเป็นตู้ที่เราตรวจมาแล้วอย่างดีจนครบ และ ทุกตู้ด้วย" →
// a customer is auto-tickable ONLY when EVERY container of their ready rows is
// completeness=ครบ (getContainerCompletenessBatch · isComplete) AND no row has a
// ฿0 import transport (has_zero_transport) or a still-฿0 domestic leg
// (has_th_ship_missing). Customers with any ขาด/฿0/no-TH-cost are SHOWN but flagged
// "ตรวจก่อน — วางบิลเดี่ยว" and NOT auto-ticked (they must be billed via the /add
// form where the per-row overrides + confirms live).
//
// ZERO new money math — every ฿ comes from listEligibleForwarders (which already
// runs calcForwarderGross + computeForwarderDebitBatch). This helper only ROLLS UP
// those per-row numbers per customer + attaches the completeness signal.

export type ConsolidationCandidateRow = {
  userid: string;
  display_name: string;
  is_juristic: boolean;
  tax_id: string;
  /** # of billable (unbilled) ready forwarder rows for this customer. */
  ready_count: number;
  /** Σ (calcForwarderGross + เหมาๆ) of the billable rows — the bill's face total
   *  BEFORE the 4 admin adjustments (chn/th/other/discount), which the batch action
   *  passes as 0. Purely for the accounting preview + the batch confirm total. */
  ready_total_thb: number;
  /** Distinct cabinet numbers that are fully checked (ครบ) among this customer's ready rows. */
  complete_containers: number;
  /** Distinct cabinet numbers still incomplete (ขาด) among this customer's ready rows. */
  incomplete_containers: number;
  /** A billable row has ฿0 import transport SELL (ftotalprice<=0) → under-charge risk. */
  has_zero_transport: boolean;
  /** A billable row's domestic leg cost (ค่าส่งไทย) is still ฿0 while a leg applies. */
  has_th_ship_missing: boolean;
  /** TRUE ⇔ ready_count>0 AND every cabinet ครบ AND !zero-transport AND !th-ship-missing.
   *  Only these are auto-ticked by "เลือกทั้งหมด" + billable via the batch action. */
  is_fully_ready: boolean;
};

/**
 * Read-only rollup for the consolidation view. For EACH customer with billable
 * ready rows, reuses listEligibleForwarders() (the same eligibility + money engine
 * the single-customer form uses) then folds the rows into a per-customer summary +
 * the fully-checked (ครบ/ขาด) container signal from getContainerCompletenessBatch.
 *
 * No mutation. No new pricing math. Bounded — caps the customer fan-out to keep the
 * page snappy (accounting reviews the ready cohort, not the whole history).
 */
export async function listConsolidationCandidates(): Promise<
  AdminActionResult<{ rows: ConsolidationCandidateRow[] }>
> {
  return withAdmin<{ rows: ConsolidationCandidateRow[] }>(
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async () => {
      const admin = createAdminClient();

      // (1) Which customers have ready rows + their display info — reuse the
      // existing aggregate (same billable predicate the /add form uses).
      const custRes = await listEligibleCustomers();
      if (!custRes.ok) return { ok: false, error: custRes.error };
      const customers = custRes.data!.rows;
      if (customers.length === 0) return { ok: true, data: { rows: [] } };

      // (2) Per-customer: pull the billable forwarder rows via the SAME action the
      // single form calls (identical money numbers + the th_ship_missing flag).
      // Bounded fan-out — cap the number of customers rolled up so the page stays
      // responsive (the surface is a review queue, not a full report). Rows we cap
      // out still appear in the /add customer dropdown.
      const CAP = 300;
      const scoped = customers.slice(0, CAP);

      const perCustomer = await Promise.all(
        scoped.map((c) => listEligibleForwarders(c.userid)),
      );

      // Collect every billable forwarder id across all customers (unbilled only).
      const billableByUser = new Map<string, EligibleForwarderRow[]>();
      const allBillableIds: number[] = [];
      scoped.forEach((c, i) => {
        const res = perCustomer[i];
        if (!res.ok) return; // skip a customer whose rows failed to load
        const billable = res.data!.rows.filter((r) => !r.already_billed);
        if (billable.length === 0) return;
        billableByUser.set(c.userid, billable);
        for (const r of billable) allBillableIds.push(r.id);
      });

      if (allBillableIds.length === 0) return { ok: true, data: { rows: [] } };

      // (2b) forwarder id → cabinet (for the completeness grouping).
      type FwdCab = { id: number; fcabinetnumber: string | null };
      const cabById = new Map<number, string>();
      const cabsSet = new Set<string>();
      // Chunk the IN-list to stay under PostgREST URL limits on large cohorts.
      for (let i = 0; i < allBillableIds.length; i += 500) {
        const chunk = allBillableIds.slice(i, i + 500);
        const { data: fwdRaw, error: fwdErr } = await admin
          .from("tb_forwarder")
          .select("id, fcabinetnumber")
          .in("id", chunk);
        if (fwdErr) {
          console.error("[listConsolidationCandidates tb_forwarder cabinets] failed", {
            code: fwdErr.code, message: fwdErr.message,
          });
          return { ok: false, error: fwdErr.message };
        }
        for (const f of ((fwdRaw ?? []) as FwdCab[])) {
          const cab = (f.fcabinetnumber ?? "").trim();
          cabById.set(f.id, cab);
          if (cab && cab !== "0") cabsSet.add(cab);
        }
      }

      // (2c) completeness per cabinet (ONE batch round-trip · the SOT).
      const completeness = await getContainerCompletenessBatch(admin, Array.from(cabsSet));

      // (3) Fold each customer's billable rows into a summary row.
      const custByID = new Map(customers.map((c) => [c.userid, c]));
      const rows: ConsolidationCandidateRow[] = [];
      for (const [userid, billable] of billableByUser) {
        const c = custByID.get(userid);
        if (!c) continue;

        // Σ face total = Σ (per-row GROSS outstanding) + Σ (per-row เหมาๆ anchor fee).
        // These are the EXACT numbers listEligibleForwarders already computed — no
        // new math. The batch action passes chn/th/other/discount = 0, so this IS
        // the bill face (the WHT 1% + net are derived on the display/print surface).
        let faceTotal = 0;
        for (const r of billable) {
          faceTotal += Math.round(r.outstanding_thb * 100) / 100;
          faceTotal += Math.round((r.mao_fee_thb ?? 0) * 100) / 100;
        }

        // Per-cabinet completeness among THIS customer's ready rows.
        const custCabs = new Set<string>();
        for (const r of billable) {
          const cab = cabById.get(r.id);
          if (cab && cab !== "0") custCabs.add(cab);
        }
        let completeContainers = 0;
        let incompleteContainers = 0;
        for (const cab of custCabs) {
          const comp = completeness[cab];
          // No completeness entry (e.g. cabinet not scanned at all) → treat as
          // incomplete (conservative — never auto-tick something unverified).
          if (comp && comp.isComplete) completeContainers += 1;
          else incompleteContainers += 1;
        }

        const hasZeroTransport = billable.some((r) => (Number(r.ftotalprice) || 0) <= 0);
        const hasThShipMissing = billable.some((r) => r.th_ship_missing === true);

        // Fully-ready = every container ครบ AND no ฿0-transport AND no missing TH leg.
        const isFullyReady =
          billable.length > 0 &&
          incompleteContainers === 0 &&
          !hasZeroTransport &&
          !hasThShipMissing;

        rows.push({
          userid,
          display_name:          c.display_name,
          is_juristic:           c.is_juristic,
          tax_id:                c.tax_id,
          ready_count:           billable.length,
          ready_total_thb:       Math.round(faceTotal * 100) / 100,
          complete_containers:   completeContainers,
          incomplete_containers: incompleteContainers,
          has_zero_transport:    hasZeroTransport,
          has_th_ship_missing:   hasThShipMissing,
          is_fully_ready:        isFullyReady,
        });
      }

      rows.sort((a, b) => {
        // Fully-ready first (the ones the batch will bill), then by userid.
        if (a.is_fully_ready !== b.is_fully_ready) return a.is_fully_ready ? -1 : 1;
        return a.userid.localeCompare(b.userid);
      });

      return { ok: true, data: { rows } };
    },
  );
}

// ────────────────────────────────────────────────────────────────────────
// 10. BATCH billing (แบบ 2) — one bill per ticked customer, all at once
// ────────────────────────────────────────────────────────────────────────
//
// pop-spec #3 (owner 2026-07-06 · consolidation แบบ 2). For each ticked customer:
// resolve their billable (unbilled · non-฿0-transport · non-th-ship-missing)
// forwarder ids + the auto เหมาๆ Σ, then DELEGATE to createBillingRunInvoice with
// default dates (today / +7) and the 4 adjustment fields = 0. NEVER duplicates the
// money path — every ฿ + the WHT 1% + the doc-no mint + the audit trail come from
// createBillingRunInvoice unchanged.
//
// Money-safety: this action does NO direct DB write of its own — it only calls
// createBillingRunInvoice (the sole money writer) once per customer. It refuses a
// customer with 0 billable ids, and it never sets allowUnmeasured/allowMissingThShip
// (so a ฿0-transport or missing-TH-leg row is REJECTED by the guard, not silently
// billed). Such customers must be billed via the single /add form (with the
// per-row overrides + explicit confirms).

export type BatchBillingResult = {
  userid: string;
  ok: boolean;
  invoiceId?: number;
  docNo?: string;
  error?: string;
  /** # of billable forwarder rows this customer's bill covered (0 = skipped). */
  count: number;
};

export async function createBatchBillingRunInvoices(
  input: { userids: string[] },
): Promise<AdminActionResult<{ results: BatchBillingResult[]; created: number; failed: number }>> {
  return withAdmin<{ results: BatchBillingResult[]; created: number; failed: number }>(
    // Same role gate as createBillingRunInvoice (which each sub-call re-checks).
    ["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"],
    async () => {
      const raw = Array.isArray(input?.userids) ? input.userids : [];
      // Sanitize + dedupe + bound the batch size.
      const userids = Array.from(
        new Set(
          raw
            .map((u) => (typeof u === "string" ? u.trim() : ""))
            .filter((u) => u.length > 0 && u.length <= 20 && /^[A-Za-z0-9_-]+$/.test(u)),
        ),
      ).slice(0, 200);
      if (userids.length === 0) {
        return { ok: false, error: "กรุณาเลือกลูกค้าอย่างน้อย 1 ราย" };
      }

      const dateIssued = isoToday();
      const dateDue = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
      })();

      const results: BatchBillingResult[] = [];
      // Sequential — createBillingRunInvoice mints a doc-no (serial); running the
      // sub-calls in parallel would race the mint's 3-retry uniqueness loop.
      for (const userid of userids) {
        // Resolve this customer's billable ids via the SAME action the form uses.
        const fwdRes = await listEligibleForwarders(userid);
        if (!fwdRes.ok) {
          results.push({ userid, ok: false, error: fwdRes.error, count: 0 });
          continue;
        }
        const billable = fwdRes.data!.rows.filter((r) => !r.already_billed);
        if (billable.length === 0) {
          results.push({ userid, ok: false, error: "ไม่มีรายการที่ออกใบวางบิลได้", count: 0 });
          continue;
        }
        const forwarderIds = billable.map((r) => r.id);
        // Auto เหมาๆ Σ (once per shipment) — the SAME per-row anchor fee the form
        // previews; createBillingRunInvoice recomputes the same when maoFeeThb is
        // absent, but we pass it explicitly so the batch confirm total reconciles.
        const maoFeeThb =
          Math.round(
            billable.reduce((s, r) => s + (r.mao_fee_thb ?? 0), 0) * 100,
          ) / 100;

        // DELEGATE to the money path. allowUnmeasured/allowMissingThShip default
        // false → a ฿0-transport or missing-TH-leg row makes THIS customer's bill
        // fail (surfaced in results · they go via the single form instead).
        const created = await createBillingRunInvoice({
          userid,
          forwarderIds,
          dateIssued,
          dateDue,
          deliveryChnThb: 0,
          deliveryThThb: 0,
          otherThb: 0,
          discountThb: 0,
          maoFeeThb,
          noteForCustomer: "",
          // Money-safety — NEVER waive the guards in the batch path. A ฿0-transport
          // or missing-ค่าส่งไทย row REJECTS this customer's bill (surfaced in results
          // · they go via the single /add form with the per-row overrides + confirms).
          allowUnmeasured: false,
          allowMissingThShip: false,
          allowUnreconciledPacking: false,
          overrides: {},
        });
        if (created.ok) {
          results.push({
            userid,
            ok: true,
            invoiceId: created.data!.invoiceId,
            docNo: created.data!.docNo,
            count: forwarderIds.length,
          });
        } else {
          results.push({ userid, ok: false, error: created.error, count: 0 });
        }
      }

      const createdCount = results.filter((r) => r.ok).length;
      const failedCount = results.length - createdCount;

      revalidatePath("/[locale]/(admin)/admin/billing-run", "page");
      revalidatePath("/[locale]/(admin)/admin/billing-run/consolidate", "page");

      return {
        ok: true,
        data: { results, created: createdCount, failed: failedCount },
      };
    },
  );
}
