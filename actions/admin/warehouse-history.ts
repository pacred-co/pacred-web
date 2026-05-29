"use server";

/**
 * Faithful-port Server Actions for the legacy warehouse scan-event log
 * (`pcs-admin/forwarder-import-warehouse.php`, D1 / ADR-0017).
 *
 * The warehouse-history page is the barcode-scan event log: every parcel
 * scanned into the Thailand warehouse creates a `tb_forwarder_import2`
 * row keyed off the scanner's tracking string. Two sub-flows live there:
 *   1. ORPHAN scans — `fid IS NULL`; warehouse staff manually link to a
 *      `tb_forwarder` row via the "ค้นหาและเชื่อมรายการ" modal.
 *   2. MATCHED scans — already linked; staff can delete a wrong scan
 *      via the "ลบยิงเข้า" button.
 *
 * Surface area (this file):
 *   - adminRelinkScan        — 1:1 port of forwarder-import-warehouse.php
 *     L3-37 `updateIm` POST handler. Sets `tb_forwarder_import2.fid` and
 *     bumps the parent `tb_forwarder` to fStatus=4 (สินค้าถึงไทยแล้ว).
 *   - adminDeleteScan        — 1:1 port of
 *     `include/pages/forwarder/deleteForwarderImport.php` (the AJAX behind
 *     `deleteForwarderIM()` at L513-543). Hard DELETE — no soft-delete.
 *   - adminSearchForwarderForScan — 1:1 port of
 *     `include/pages/forwarder/getListForwarderIm.php` (the modal AJAX
 *     behind `searchForwarderIm()` at L545-554). Returns the matching
 *     `tb_forwarder` rows for the relink modal's table.
 *
 * Auth: `withAdmin(["super", "ops", "warehouse"])` — same union the read-
 * only page uses (see warehouse-history/page.tsx §Auth comment).
 *
 * Audit: `logAdminAction()` after every mutation; payload captures the
 * legacy-equivalent fields so the audit row diffs against the old log.
 *
 * adminID note (same as combine-bill.ts): legacy
 * `tb_forwarder.adminidupdate` is a varchar holding the legacy
 * `tb_admin.adminID` username. We resolve the current Supabase user's
 * legacy username via `tb_admin.adminEmail` (fall back to a 30-char
 * email truncation if not yet linked).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import {
  relinkScanSchema,
  deleteScanSchema,
  searchForwarderSchema,
  type RelinkScanInput,
  type DeleteScanInput,
  type SearchForwarderInput,
} from "@/lib/validators/admin-warehouse-history";

// ────────────────────────────────────────────────────────────
// Helper — current Supabase user's legacy adminid (varchar 30 username).
// Mirror of `resolveLegacyAdminId` in actions/admin/combine-bill.ts;
// duplicated here (not extracted) because the two callers are the only
// two faithful-port mutate-flows that need it — extract on the third
// caller per the runbook's "lift on the third repeat" rule.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
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
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// RELINK — forwarder-import-warehouse.php L3-37 updateIm
// ────────────────────────────────────────────────────────────
//
// Legacy flow (paraphrased):
//   1. SELECT fAmount FROM tb_forwarder WHERE id = $fID AND fStatus < 5
//      (the parent forwarder must exist AND not be locked at status ≥ 5)
//   2. SELECT fiPallet FROM tb_forwarder_import2 WHERE id = $scanID
//      (read the pallet # the scanner captured)
//   3. SELECT fID, fi2Amount FROM tb_forwarder_import2 WHERE fID = $fID
//      ↳ if non-empty → return 'eRe' (this forwarder ALREADY has scans →
//        the link would dupe the parcel onto two scan events).
//   4. UPDATE tb_forwarder_import2 SET fID = $fID WHERE id = $scanID
//   5. UPDATE tb_forwarder SET fStatus = 4, fDateStatus4 = NOW(),
//                              adminIDUpdate = $adminID, fPallet = $fiPallet
//                          WHERE id = $fID

export async function adminRelinkScan(
  input: RelinkScanInput,
): Promise<AdminActionResult<{ scanId: number; fid: number }>> {
  const parsed = relinkScanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { scanId, fid } = parsed.data;

  return withAdmin<{ scanId: number; fid: number }>(
    ["super", "ops", "warehouse"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── (a) Confirm the target forwarder exists + is not locked.
      // Legacy: WHERE ID=? AND fStatus<5  (statuses 5/6/7 = paid/ready/
      // delivered — relinking after that breaks the money trail).
      const { data: f, error: fErr } = await admin
        .from("tb_forwarder")
        .select("id, fstatus")
        .eq("id", fid)
        .maybeSingle<{ id: number; fstatus: string }>();
      if (fErr) return { ok: false, error: fErr.message };
      if (!f) return { ok: false, error: `ไม่พบเลขที่ออเดอร์ #${fid}` };
      const statusNum = Number(f.fstatus);
      if (Number.isFinite(statusNum) && statusNum >= 5) {
        return {
          ok: false,
          error: `เลขที่ออเดอร์ #${fid} อยู่ในสถานะที่ล็อกแล้ว (fStatus=${f.fstatus})`,
        };
      }

      // Wave 26 G5 (2026-05-28 ดึก) — status-transition role gate.
      // Matrix: *→4 = warehouse (with super / manager override). The page-
      // level union ["super","ops","warehouse"] also lets `ops` through;
      // helper denies non-warehouse `ops` callers unless they ALSO hold
      // super/manager. Skip the gate when the row is already at 4 (no-op
      // re-link doesn't actually flip status).
      if (f.fstatus !== "4") {
        const callerRoles = (await getAdminRoles()) ?? [];
        if (!canAnyRoleFlipFstatus(callerRoles, f.fstatus, "4")) {
          return { ok: false, error: "forbidden_transition" };
        }
      }

      // ── (b) Read the scan row — fipallet flows to tb_forwarder.fpallet
      const { data: scan, error: scanErr } = await admin
        .from("tb_forwarder_import2")
        .select("id, fid, fipallet")
        .eq("id", scanId)
        .maybeSingle<{
          id: number;
          fid: number | null;
          fipallet: string | null;
        }>();
      if (scanErr) return { ok: false, error: scanErr.message };
      if (!scan) return { ok: false, error: `ไม่พบรายการสแกน #${scanId}` };

      // ── (c) Dupe-link guard — forwarder-import-warehouse.php L23-25.
      // If THIS forwarder already has a different scan row attached
      // we'd be linking the parcel twice (which the legacy refuses
      // with 'eRe' / "รายการนี้เชื่อมข้อมูลแล้ว").
      const { data: existingLinks, error: linkErr } = await admin
        .from("tb_forwarder_import2")
        .select("id")
        .eq("fid", fid);
      if (linkErr) return { ok: false, error: linkErr.message };
      if ((existingLinks?.length ?? 0) > 0) {
        // Allow re-pointing the same scan to the same fid (idempotent),
        // forbid a different scan already owning that fid.
        const conflict = (existingLinks ?? []).some((r) => r.id !== scanId);
        if (conflict) {
          return {
            ok: false,
            error: "รายการนี้เชื่อมข้อมูลแล้ว",
          };
        }
        // Same scan already linked → treat as success (no DB write needed)
        if (scan.fid === fid) {
          return { ok: true, data: { scanId, fid } };
        }
      }

      // ── (d) UPDATE tb_forwarder_import2.fid (legacy L26-27)
      const { error: updateScanErr } = await admin
        .from("tb_forwarder_import2")
        .update({ fid })
        .eq("id", scanId);
      if (updateScanErr) return { ok: false, error: updateScanErr.message };

      // ── (e) UPDATE tb_forwarder status + admin-trail (legacy L29-30)
      const legacyAdminId = await resolveLegacyAdminId();
      const nowIso = new Date().toISOString();
      const oldStatus = f.fstatus;
      const { error: updateFwdErr } = await admin
        .from("tb_forwarder")
        .update({
          fstatus: "4",
          fdatestatus4: nowIso,
          adminidupdate: legacyAdminId,
          fpallet: scan.fipallet ?? "",
        })
        .eq("id", fid);
      if (updateFwdErr) {
        // Faithful: legacy doesn't compensate either. Log + bubble.
        await logAdminAction(
          adminId,
          "warehouse_history.relink_partial",
          "tb_forwarder_import2",
          String(scanId),
          {
            fid,
            previous_fid: scan.fid,
            forwarder_update_error: updateFwdErr.message,
          },
        );
        return { ok: false, error: updateFwdErr.message };
      }

      // G8 (2026-05-28 ดึก): write the legacy audit-log row for this
      // status flip. Legacy forwarder-import-warehouse.php was a missing
      // call-site per §7 of the state-machine audit. No customer
      // notification here — relink → status 4 is internal warehouse work
      // (matrix is log-only for *→4 transitions).
      if (oldStatus !== "4") {
        await appendStatusLog(admin, fid, oldStatus, "4", legacyAdminId);
      }

      await logAdminAction(
        adminId,
        "warehouse_history.relink",
        "tb_forwarder_import2",
        String(scanId),
        {
          fid,
          previous_fid: scan.fid,
          legacy_admin_id: legacyAdminId,
          fpallet: scan.fipallet ?? null,
          new_forwarder_status: "4",
        },
      );

      revalidatePath("/admin/forwarders/warehouse-history");
      return { ok: true, data: { scanId, fid } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// DELETE — include/pages/forwarder/deleteForwarderImport.php
// ────────────────────────────────────────────────────────────
//
//   SELECT ID FROM tb_forwarder_import2 WHERE ID = $ID
//   DELETE FROM tb_forwarder_import2 WHERE ID = $ID
//
// Hard delete. The parent `tb_forwarder.fstatus` is NOT rolled back
// (faithful: legacy doesn't either — the scan row is the audit trail,
// the forwarder status reflects the warehouse situation, those are
// orthogonal in the legacy model).

export async function adminDeleteScan(
  input: DeleteScanInput,
): Promise<AdminActionResult> {
  const parsed = deleteScanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { scanId } = parsed.data;

  return withAdmin(
    ["super", "ops", "warehouse"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      const { data: scan, error: readErr } = await admin
        .from("tb_forwarder_import2")
        .select("id, fid, keysearch, fi2amount, fi2date, adminid")
        .eq("id", scanId)
        .maybeSingle<{
          id: number;
          fid: number | null;
          keysearch: string;
          fi2amount: number;
          fi2date: string | null;
          adminid: string;
        }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!scan) return { ok: false, error: "not_found" };

      const { error: delErr } = await admin
        .from("tb_forwarder_import2")
        .delete()
        .eq("id", scanId);
      if (delErr) return { ok: false, error: delErr.message };

      await logAdminAction(
        adminId,
        "warehouse_history.delete_scan",
        "tb_forwarder_import2",
        String(scanId),
        {
          fid: scan.fid,
          keysearch: scan.keysearch,
          fi2amount: scan.fi2amount,
          fi2date: scan.fi2date,
          original_admin_id: scan.adminid,
        },
      );

      revalidatePath("/admin/forwarders/warehouse-history");
      return { ok: true };
    },
  );
}

// ────────────────────────────────────────────────────────────
// SEARCH — include/pages/forwarder/getListForwarderIm.php
// ────────────────────────────────────────────────────────────
//
//   SELECT … FROM tb_forwarder f LEFT JOIN tb_users u ON u.userID = f.userID
//   WHERE fIDorCO LIKE '%query%' OR fTrackingCHN LIKE '%query%'
//
// Returns up to `limit` rows for the relink modal's search table. The
// rendered columns mirror the legacy modal (date · customer · detail ·
// price · ID-CO · tracking · status · admin · action), but for the JSON
// API we return only the fields the client actually renders — the rest
// are looked up on-relink by the relink action itself.

export type ForwarderSearchRow = {
  id: number;
  fdate: string | null;
  fstatus: string;
  fcabinetnumber: string;
  fidorco: string | null;
  ftrackingchn: string;
  famount: number;
  userid: string;
  adminidupdate: string | null;
  fdetail: string;
};

export async function adminSearchForwarderForScan(
  input: SearchForwarderInput,
): Promise<AdminActionResult<{ rows: ForwarderSearchRow[] }>> {
  const parsed = searchForwarderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { query, limit } = parsed.data;

  return withAdmin<{ rows: ForwarderSearchRow[] }>(
    ["super", "ops", "warehouse"],
    async () => {
      const admin = createAdminClient();

      // Legacy strips everything after the first "-" so order-style IDs
      // ("12345-A") still match. Mirror that behaviour.
      const dashIdx = query.indexOf("-");
      const cleanQuery = dashIdx >= 0 ? query.slice(0, dashIdx) : query;
      const esc = cleanQuery.replace(/[%_]/g, (m) => `\\${m}`);

      // PostgREST `.or()` clauses need percent-escaped wildcards.
      const { data, error } = await admin
        .from("tb_forwarder")
        .select(
          "id, fdate, fstatus, fcabinetnumber, fidorco, ftrackingchn, " +
            "famount, userid, adminidupdate, fdetail",
        )
        .or(`fidorco.ilike.%${esc}%,ftrackingchn.ilike.%${esc}%`)
        .order("id", { ascending: false })
        .limit(limit);
      if (error) return { ok: false, error: error.message };

      // PostgREST's `.or()` filter combined with a multi-column SELECT
      // inflates the generated row type past the TS-inference depth
      // ceiling — the result widens to `GenericStringError`. The query
      // is well-formed; we cast to the shape we know it returns.
      type RawRow = {
        id: number;
        fdate: string | null;
        fstatus: string | null;
        fcabinetnumber: string | null;
        fidorco: string | null;
        ftrackingchn: string | null;
        famount: number | null;
        userid: string | null;
        adminidupdate: string | null;
        fdetail: string | null;
      };
      const raw = (data ?? []) as unknown as RawRow[];
      const rows: ForwarderSearchRow[] = raw.map((r) => ({
        id: Number(r.id),
        fdate: r.fdate,
        fstatus: String(r.fstatus ?? ""),
        fcabinetnumber: String(r.fcabinetnumber ?? ""),
        fidorco: r.fidorco,
        ftrackingchn: String(r.ftrackingchn ?? ""),
        famount: Number(r.famount ?? 0),
        userid: String(r.userid ?? ""),
        adminidupdate: r.adminidupdate,
        fdetail: String(r.fdetail ?? ""),
      }));

      return { ok: true, data: { rows } };
    },
  );
}
