"use server";

/**
 * Faithful-port Server Actions for the legacy combine-bill flow
 * (`pcs-admin/forwarder-bill.php`, D1 / ADR-0017).
 *
 * The combine-bill tool lets warehouse + accounting + super staff
 * group several `tb_forwarder` rows (parcels for the SAME customer
 * arriving together) into ONE printed shipping bill. Data lives in:
 *   - `tb_bill`       — the bill header (one per combine)
 *   - `tb_bill_item`  — the fan-out (one row per forwarder ID in the bill)
 *
 * Surface area (this file):
 *   - adminCreateCombineBill — 1:1 port of forwarder-bill.php L6-45
 *     `?page=add` POST handler. INSERTs `tb_bill` + N `tb_bill_item`.
 *   - adminDeleteCombineBill — 1:1 port of
 *     `include/pages/forwarder-bill/deleteForwarder.php` (the AJAX delete
 *     called by deleteForwarder() at forwarder-bill.php L319-351).
 *     DELETEs `tb_bill_item` rows then the `tb_bill` row (hard delete —
 *     legacy has no soft-delete column on either table).
 *   - buildPrintHref           — stub URL builder for the @react-pdf
 *     follow-up. Returns the legacy-shape `id[]=…&id[]=…` query string
 *     so the list-page link survives the cutover.
 *
 * Auth: `withAdmin(["super", "ops", "warehouse", "accounting"])` to
 * mirror the legacy CEO / Manager / QAAndQC / Accounting / ITDT gate
 * (forwarder-bill.php L94) softened to the Pacred V3 role set used by
 * the read-only list page (see `combine-bill/page.tsx` §Auth comment).
 *
 * Audit: `logAdminAction()` is called after every mutation; payload
 * captures the legacy-equivalent fields so the audit row can be diffed
 * against the old admin log.
 *
 * Faithful-port gotcha (forwarder-bill.php L26-29): the legacy SELECT-
 * after-INSERT to recover the new `billID` is brittle (same-millisecond
 * inserts collide on `date + adminID`). PostgREST's `.insert().select()`
 * returns the new row natively — we use that instead. Same INSERTed
 * shape; same downstream `tb_bill_item` linkage; cleaner round-trip.
 *
 * adminID note: legacy `tb_bill.adminid` is a varchar(30) holding the
 * legacy `tb_admin.adminid` (username, e.g. "POPP"). Pacred admins sign
 * in via Supabase Auth (UUID). We resolve the legacy username via
 * `tb_admin.adminemail` → `adminid` lookup keyed off the current Supabase
 * user's email; if no match (e.g. a Pacred-native admin without a legacy
 * row yet) we fall back to a 30-char truncation of the email so the
 * insert never fails its NOT NULL.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createCombineBillSchema,
  deleteCombineBillSchema,
  type CreateCombineBillInput,
  type DeleteCombineBillInput,
} from "@/lib/validators/admin-combine-bill";

// ────────────────────────────────────────────────────────────
// Helper — resolve the current Supabase user's legacy `tb_admin.adminid`
// (the username string the legacy `tb_bill.adminid` column expects).
// ────────────────────────────────────────────────────────────
//
// Cached implicitly per Server Action call (single Supabase auth read +
// single tb_admin select). Returns the legacy username on hit, or a
// best-effort 30-char email truncation on miss. The NOT NULL on
// `tb_bill.adminid` is always satisfied.
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data } = await admin
    .from("tb_admin")
    .select("adminid")
    .eq("adminemail", email)
    .maybeSingle<{ adminid: string | null }>();
  if (data?.adminid) return data.adminid;

  // Fall back to a 30-char email slice so the NOT NULL never trips.
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// CREATE — forwarder-bill.php L6-45 add-form POST handler
// ────────────────────────────────────────────────────────────
//
//   $arrID = explode(",", $_POST['ID']);
//   SELECT billID, fID FROM tb_bill_item WHERE fID IN (…)
//     ↳ if any already-billed forwarders match → return 'EID' error
//   INSERT INTO tb_bill (date, printStatus, adminID) VALUES (NOW(), '', ?)
//   SELECT billID FROM tb_bill WHERE date=? AND adminID=?  ← recover billID
//   INSERT INTO tb_bill_item (billID, fID) VALUES (?, ?), (?, ?), …
//
// Returns the new billID + the list of fIDs actually combined. The
// caller (the add page) routes to the list view (or to the print stub)
// on success.

export async function adminCreateCombineBill(
  input: CreateCombineBillInput,
): Promise<
  AdminActionResult<{
    billId: number;
    forwarderIds: number[];
  }>
> {
  const parsed = createCombineBillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { forwarderIds } = parsed.data;

  return withAdmin<{ billId: number; forwarderIds: number[] }>(
    ["super", "ops", "warehouse", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── (a) Legacy collision check — forwarder-bill.php L10-19 ──
      //   SELECT billID, fID FROM tb_bill_item WHERE fID IN (…)
      // If any IDs are already on another bill, abort with the same
      // human error the legacy SweetAlert shows: 'EID' → list the
      // duplicate fIDs + the billID they collided with.
      const { data: existing, error: dupErr } = await admin
        .from("tb_bill_item")
        .select("billid, fid")
        .in("fid", forwarderIds);
      if (dupErr) return { ok: false, error: dupErr.message };
      if ((existing?.length ?? 0) > 0) {
        const dupFids = (existing ?? []).map((r) => r.fid).join(", ");
        const dupBillId = existing?.[0]?.billid ?? "?";
        return {
          ok: false,
          error: `มีเลขที่รายการไม่ถูกต้อง เลขที่รายการซ้ำ ${dupFids} รายการนี้อยู่ในบิลเลขที่ ${dupBillId}`,
        };
      }

      // ── (b) Validate every fID actually exists in tb_forwarder ─────
      // Legacy doesn't pre-check (the bulk INSERT just FK-fails) — we
      // pre-check so the caller gets a friendly per-ID error instead
      // of a 23503 from Postgres.
      const { data: knownForwarders, error: fErr } = await admin
        .from("tb_forwarder")
        .select("id")
        .in("id", forwarderIds);
      if (fErr) return { ok: false, error: fErr.message };
      const knownIds = new Set(
        (knownForwarders ?? []).map((r) => Number(r.id)),
      );
      const missing = forwarderIds.filter((id) => !knownIds.has(id));
      if (missing.length > 0) {
        return {
          ok: false,
          error: `ไม่พบเลขที่ออเดอร์: ${missing.join(", ")}`,
        };
      }

      // ── (c) INSERT tb_bill — forwarder-bill.php L24 ──
      //   INSERT INTO tb_bill(date, printStatus, adminID) VALUES (NOW(), '', ?)
      const legacyAdminId = await resolveLegacyAdminId();
      const nowIso = new Date().toISOString();
      const { data: billRow, error: billErr } = await admin
        .from("tb_bill")
        .insert({
          date: nowIso,
          printstatus: "",
          adminid: legacyAdminId,
        })
        .select("billid")
        .single<{ billid: number }>();
      if (billErr) return { ok: false, error: billErr.message };
      const billId = Number(billRow.billid);

      // ── (d) INSERT tb_bill_item × N — forwarder-bill.php L32-39 ──
      //   INSERT INTO tb_bill_item(billID, fID) VALUES (?, ?), …
      const itemRows = forwarderIds.map((fid) => ({
        billid: billId,
        fid,
      }));
      const { error: itemErr } = await admin
        .from("tb_bill_item")
        .insert(itemRows);
      if (itemErr) {
        // Best-effort cleanup — leave the orphan tb_bill row in place
        // (faithful: legacy doesn't compensate either) but surface the
        // partial-insert in the audit log so an admin can clean up.
        await logAdminAction(
          adminId,
          "combine_bill.create_partial",
          "tb_bill",
          String(billId),
          {
            legacy_admin_id: legacyAdminId,
            forwarder_ids: forwarderIds,
            error: itemErr.message,
          },
        );
        return { ok: false, error: itemErr.message };
      }

      await logAdminAction(
        adminId,
        "combine_bill.create",
        "tb_bill",
        String(billId),
        {
          legacy_admin_id: legacyAdminId,
          forwarder_ids: forwarderIds,
        },
      );

      revalidatePath("/admin/forwarders/combine-bill");
      return { ok: true, data: { billId, forwarderIds } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// DELETE — include/pages/forwarder-bill/deleteForwarder.php
// ────────────────────────────────────────────────────────────
//
//   SELECT billID FROM tb_bill WHERE billID = ?
//   DELETE FROM tb_bill_item WHERE billID = ?
//   DELETE FROM tb_bill      WHERE billID = ?
//
// Hard delete — neither legacy table has a soft-delete column. The
// audit log captures the deleted state so a re-create is possible from
// the snapshot if needed.

export async function adminDeleteCombineBill(
  input: DeleteCombineBillInput,
): Promise<AdminActionResult> {
  const parsed = deleteCombineBillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { billId } = parsed.data;

  return withAdmin(
    ["super", "ops", "warehouse", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── (a) SELECT to confirm the bill exists (legacy L4-6) ──
      //   SELECT billID FROM tb_bill WHERE billID = ?
      const { data: billRow, error: readErr } = await admin
        .from("tb_bill")
        .select("billid, date, adminid")
        .eq("billid", billId)
        .maybeSingle<{
          billid: number;
          date: string | null;
          adminid: string;
        }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!billRow) return { ok: false, error: "not_found" };

      // Snapshot the items for the audit log before the DELETE wipes them.
      const { data: items } = await admin
        .from("tb_bill_item")
        .select("id, fid")
        .eq("billid", billId);

      // ── (b) DELETE tb_bill_item (legacy L7-8) ──
      const { error: itemDelErr } = await admin
        .from("tb_bill_item")
        .delete()
        .eq("billid", billId);
      if (itemDelErr) return { ok: false, error: itemDelErr.message };

      // ── (c) DELETE tb_bill (legacy L9-10) ──
      const { error: billDelErr } = await admin
        .from("tb_bill")
        .delete()
        .eq("billid", billId);
      if (billDelErr) return { ok: false, error: billDelErr.message };

      await logAdminAction(
        adminId,
        "combine_bill.delete",
        "tb_bill",
        String(billId),
        {
          date: billRow.date,
          legacy_admin_id: billRow.adminid,
          forwarder_ids: (items ?? []).map((r) => r.fid),
        },
      );

      revalidatePath("/admin/forwarders/combine-bill");
      return { ok: true };
    },
  );
}

// ────────────────────────────────────────────────────────────
// PRINT — URL stub (the @react-pdf follow-up will own the real renderer)
// ────────────────────────────────────────────────────────────
// (URL builder for the print route moved to
//  `lib/admin/combine-bill-urls.ts` — a "use server" file may only
//  export ASYNC functions; the sync URL builder lives in `lib/` so this
//  module stays Server-Action-pure.)
