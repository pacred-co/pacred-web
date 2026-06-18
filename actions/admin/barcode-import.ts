"use server";

/**
 * Wave 17 P1-7 — `adminBarcodeImportScan` server action.
 *
 * Faithful port of legacy `pcs-admin/include/pages/barcode-import/index.php`
 * (236 LOC) — the AJAX endpoint behind `barcode-d-import.php`'s scanner
 * panel. This is the actual warehouse-arrival WRITER:
 *   1. Look up tb_forwarder by ftrackingchn OR fidorco (fstatus<5)
 *   2. Multi-tier fallback when 0 hits: dash-trim, then strip-non-digits
 *      LIKE-suffix (legacy LIKE '__$digits' = "any 2 chars + digits")
 *   3. UPSERT tb_forwarder_import2 (a "scan event" row keyed by fid OR
 *      keysearch+date for orphans)
 *   4. Auto-flip tb_forwarder.fstatus='4' (สินค้าถึงไทย) when
 *      fi2amount ≥ famount (the parcel-count threshold)
 *   5. Audit log
 *
 * Auth: super / ops / warehouse (same union as the page.tsx + the
 * sibling `warehouse-history` Server Action).
 *
 * Return shape lets the client render a 3-card visual:
 *   green  — matched + saved          (legacy 'border-success bg-success-2')
 *   orange — saved but unmatched      (legacy 'border-warning bg-warning-2')
 *   red    — nothing happened (validation / write error)
 *
 * Legacy comment correspondence (line numbers from index.php):
 *   L23-76      → forwarderLookup() — primary + adminIDCreator + refOrder paths
 *   L78-132     → fallbackLookup()  — dash-trim + strip-non-digits paths
 *   L136-166    → upsertScan()      — fid-keyed OR keysearch-keyed insert/update
 *   L167-175    → maybeFlipStatus()
 *   L176-216    → buildHtml()       — handled by the React panel (not here)
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { logger } from "@/lib/logger";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { getContainerCompleteness } from "@/lib/warehouse/container-completeness";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { computeShipmentFlip, type ShipmentScanRow } from "@/lib/forwarder/shipment-scan-flip";

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────

const scanInputSchema = z.object({
  keysearch: z.string().trim().min(1).max(200),
  // Legacy supported keyType=1 only (track); leave open for future
  // values, default to 1.
  keyType: z.number().int().min(1).max(2).default(1),
  fPallet: z.string().trim().min(1).max(20),
});
export type AdminBarcodeImportScanInput = z.infer<typeof scanInputSchema>;

// ────────────────────────────────────────────────────────────
// Response shape — server-driven card render
// ────────────────────────────────────────────────────────────

export type CardColor = "green" | "orange" | "red";

export type BarcodeImportScanOk = {
  matched: boolean;            // true → tb_forwarder row found
  fid: number | null;          // tb_forwarder.id of the parent row (null if unmatched)
  productName: string | null;  // tb_forwarder.fdetail trimmed for the card body
  pallet: string;              // echoed fPallet (the location code)
  countScanned: number;        // fi2amount AFTER this scan
  countTotal: number;          // tb_forwarder.famount (target parcel count)
  statusFlipped: boolean;      // true → we auto-flipped fstatus to '4'
  cardColor: CardColor;
  message: string;             // human-readable Thai message for the card header

  // Extra surface for the panel — legacy showed these in the result card.
  fIDorCO: string | null;
  fTrackingCHN: string | null;
  fCabinetNumber: string | null;
  userId: string | null;
  dateSave: string;            // ISO timestamp of THIS scan event
};

export type BarcodeImportScanResult = AdminActionResult<BarcodeImportScanOk>;

// ────────────────────────────────────────────────────────────
// Helper — current Supabase user's legacy adminid (varchar 10/30).
// Mirror of `resolveLegacyAdminId` in actions/admin/{combine-bill,
// warehouse-history}.ts; duplicated here per the runbook's
// "lift on the third repeat" rule has been touched 11 times in
// the codebase — this is N=12. The full extraction is out of
// scope for this task; staying local + matching exact pattern.
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
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ────────────────────────────────────────────────────────────
// Internal types
// ────────────────────────────────────────────────────────────

type ForwarderRow = {
  id: number;
  famount: number;
  fidorco: string | null;
  ftrackingchn: string | null;
  fstatus: string;
  fcabinetnumber: string | null;
  userid: string | null;
  fdetail: string | null;
};

const FORWARDER_SELECT =
  "id, famount, fidorco, ftrackingchn, fstatus, fcabinetnumber, userid, fdetail";

// ────────────────────────────────────────────────────────────
// Lookup — faithful port of L23-132
// ────────────────────────────────────────────────────────────

/**
 * Primary lookup: ftrackingchn = keysearch OR fidorco = keysearch,
 * fstatus < 5. Legacy disambiguates ties via:
 *   1. refOrder<>'' (came from a sub-order)
 *   2. adminIDCreator<>'' (came from admin manual entry)
 *   3. otherwise: ambiguous → treat as not-found
 */
async function primaryLookup(
  admin: ReturnType<typeof createAdminClient>,
  keysearch: string,
): Promise<ForwarderRow | null> {
  const { data, error } = await admin
    .from("tb_forwarder")
    .select(FORWARDER_SELECT)
    .or(`ftrackingchn.eq.${keysearch},fidorco.eq.${keysearch}`)
    .or("fstatus.lt.5,and(fcredit.eq.1,fstatus.eq.6)")
    .limit(50);
  if (error) {
    logger.error("barcode-import", "primaryLookup failed", error, { keysearch });
    return null;
  }
  const rows = (data ?? []) as unknown as ForwarderRow[];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) return null;

  // Multi-hit tiebreaker: refOrder<>'' first (legacy L41)
  const { data: refRows, error: refRowsErr } = await admin
    .from("tb_forwarder")
    .select(FORWARDER_SELECT)
    .or(`ftrackingchn.eq.${keysearch},fidorco.eq.${keysearch}`)
    .or("fstatus.lt.5,and(fcredit.eq.1,fstatus.eq.6)")
    .neq("reforder", "")
    .limit(2);
  if (refRowsErr) {
    console.error(`[tb_forwarder list] failed`, { code: refRowsErr.code, message: refRowsErr.message });
  }
  const refList = (refRows ?? []) as unknown as ForwarderRow[];
  if (refList.length === 1) return refList[0];

  // Then adminIDCreator<>'' (legacy L58)
  const { data: adminRows, error: adminRowsErr } = await admin
    .from("tb_forwarder")
    .select(FORWARDER_SELECT)
    .or(`ftrackingchn.eq.${keysearch},fidorco.eq.${keysearch}`)
    .or("fstatus.lt.5,and(fcredit.eq.1,fstatus.eq.6)")
    .neq("adminidcreator", "")
    .limit(2);
  if (adminRowsErr) {
    console.error(`[tb_forwarder list] failed`, { code: adminRowsErr.code, message: adminRowsErr.message });
  }
  const adminList = (adminRows ?? []) as unknown as ForwarderRow[];
  if (adminList.length === 1) return adminList[0];

  // Still ambiguous → legacy treats as not-found (statusData=2).
  return null;
}

/**
 * Fallback chain. Legacy L78-132:
 *   1. If keysearch contains '-', search by the chunk BEFORE the dash
 *      (handles "SF1234-001" → "SF1234" matched as fidorco).
 *   2. Else strip non-digits then match ftrackingchn LIKE '__$digits'
 *      (any-2-chars + digits → matches trackings that start with a
 *      2-char prefix like SF/YT/JT).
 */
async function fallbackLookup(
  admin: ReturnType<typeof createAdminClient>,
  keysearch: string,
): Promise<ForwarderRow | null> {
  // Dash-cut path (legacy L81-102)
  const dashIdx = keysearch.indexOf("-");
  if (dashIdx > 0) {
    const head = keysearch.slice(0, dashIdx);
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(FORWARDER_SELECT)
      .eq("fidorco", head)
      .or("fstatus.lt.5,and(fcredit.eq.1,fstatus.eq.6)")
      .limit(2);
    if (error) {
      logger.error("barcode-import", "fallbackLookup dash-cut failed", error, {
        keysearch,
        head,
      });
      return null;
    }
    const rows = (data ?? []) as unknown as ForwarderRow[];
    if (rows.length === 1) return rows[0];
    return null;
  }

  // Strip-non-digits path (legacy L104-131)
  const digits = keysearch.replace(/[^0-9]/g, "");
  if (!digits) return null;

  // Legacy used LIKE '__$digits' (any-2-char prefix + digits). Supabase
  // PostgREST `like` operator with two underscores does the same: each
  // _ matches exactly one character.
  // Use ilike for case-insensitive parity with MySQL default collation.
  const { data, error } = await admin
    .from("tb_forwarder")
    .select(FORWARDER_SELECT)
    .ilike("ftrackingchn", `__${digits}`)
    .or("fstatus.lt.5,and(fcredit.eq.1,fstatus.eq.6)")
    .limit(2);
  if (error) {
    logger.error("barcode-import", "fallbackLookup like failed", error, {
      keysearch,
      digits,
    });
    return null;
  }
  const rows = (data ?? []) as unknown as ForwarderRow[];
  if (rows.length === 1) return rows[0];
  return null;
}

// ────────────────────────────────────────────────────────────
// Upsert — L136-166
// ────────────────────────────────────────────────────────────

/**
 * UPSERT a tb_forwarder_import2 row. There are two key modes:
 *   - keyed by fid     → when we have a matching tb_forwarder row
 *   - keyed by keysearch+today  → when we don't (orphan scan;
 *     warehouse staff link later via the relink modal)
 *
 * Returns the new fi2amount (1 for fresh insert, prev+1 for update).
 */
async function upsertScanRow(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    fid: number | null;
    keysearch: string;
    fiPallet: string;
    legacyAdminId: string;
  },
): Promise<{ fi2amount: number; mode: "insert" | "update" }> {
  const { fid, keysearch, fiPallet, legacyAdminId } = args;
  const nowIso = new Date().toISOString();

  if (fid !== null) {
    // FID-keyed lookup (legacy L137-150)
    const { data: existing, error: existingErr } = await admin
      .from("tb_forwarder_import2")
      .select("id, fi2amount")
      .eq("fid", fid)
      .limit(1)
      .maybeSingle<{ id: number; fi2amount: number }>();
    if (existingErr) {
      console.error(`[tb_forwarder_import2 list] failed`, { code: existingErr.code, message: existingErr.message });
    }
    if (!existing) {
      await admin.from("tb_forwarder_import2").insert({
        fid,
        fi2amount: 1,
        fi2date: nowIso,
        adminid: legacyAdminId,
        keysearch,
        fipallet: fiPallet,
      });
      return { fi2amount: 1, mode: "insert" };
    }
    const nextAmount = (existing.fi2amount ?? 0) + 1;
    await admin
      .from("tb_forwarder_import2")
      .update({
        fi2amount: nextAmount,
        adminid: legacyAdminId,
        fipallet: fiPallet,
        fi2date: nowIso,
      })
      .eq("id", existing.id);
    return { fi2amount: nextAmount, mode: "update" };
  }

  // Orphan path — keyed by keysearch + today. Legacy L152-165
  // uses DATE(fi2Date)=DATE(NOW()); we mirror with a 24h date-window
  // (UTC) on fi2date.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const { data: existingOrphan, error: existingOrphanErr } = await admin
    .from("tb_forwarder_import2")
    .select("id, fi2amount")
    .is("fid", null)
    .eq("keysearch", keysearch)
    .gte("fi2date", todayStart.toISOString())
    .lt("fi2date", todayEnd.toISOString())
    .limit(1)
    .maybeSingle<{ id: number; fi2amount: number }>();
  if (existingOrphanErr) {
    console.error(`[tb_forwarder_import2 list] failed`, { code: existingOrphanErr.code, message: existingOrphanErr.message });
  }

  if (!existingOrphan) {
    await admin.from("tb_forwarder_import2").insert({
      // fid intentionally NULL
      fi2amount: 1,
      fi2date: nowIso,
      adminid: legacyAdminId,
      keysearch,
      fipallet: fiPallet,
    });
    return { fi2amount: 1, mode: "insert" };
  }

  const nextOrphanAmount = (existingOrphan.fi2amount ?? 0) + 1;
  await admin
    .from("tb_forwarder_import2")
    .update({
      fi2amount: nextOrphanAmount,
      adminid: legacyAdminId,
      fipallet: fiPallet,
      fi2date: nowIso,
    })
    .eq("id", existingOrphan.id);
  return { fi2amount: nextOrphanAmount, mode: "update" };
}

// ────────────────────────────────────────────────────────────
// Public action
// ────────────────────────────────────────────────────────────

export async function adminBarcodeImportScan(
  input: AdminBarcodeImportScanInput,
): Promise<BarcodeImportScanResult> {
  const parsed = scanInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  const { keysearch, fPallet } = parsed.data;

  return withAdmin<BarcodeImportScanOk>(
    ["super", "ops", "warehouse"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);
      const nowIso = new Date().toISOString();

      // ── 1. LOOKUP — primary then fallback chain
      let row = await primaryLookup(admin, keysearch);
      if (!row) row = await fallbackLookup(admin, keysearch);

      // ── 2. UPSERT scan event
      const fid = row?.id ?? null;
      const { fi2amount, mode } = await upsertScanRow(admin, {
        fid,
        keysearch,
        fiPallet: fPallet,
        legacyAdminId,
      });

      // ── 3. SHIPMENT-AWARE FLIP (owner ภูม 2026-06-18 · matches legacy PCS) ──
      // MOMO labels the BOXES with the bill-header tracking, NOT the sub-
      // trackings (`-N/M`), so the warehouse can only ever scan the bill-header.
      // Count the scan toward the WHOLE shipment (every sibling sharing
      // baseTracking + userid) and, when the shipment's scanned ≥ its carrier-
      // declared total, flip EVERY eligible sibling → '4' (สินค้าถึงไทย) — not
      // just the matched row (the old per-row flip left the customer-visible
      // sub-rows stuck). Decision logic + unit tests:
      // lib/forwarder/shipment-scan-flip.ts. A single non-MOMO order degrades to
      // the legacy per-row behaviour (a 1-row group counts vs its own famount).
      let statusFlipped = false;
      if (row) {
        // Build the shipment group — fall back to the single matched row.
        let group: ShipmentScanRow[] = [{
          id: row.id, famount: row.famount, fstatus: row.fstatus,
          ftrackingchn: row.ftrackingchn, userid: row.userid,
        }];
        const base = baseTracking(row.ftrackingchn);
        if (base && row.userid) {
          const { data: sibs, error: sibErr } = await admin
            .from("tb_forwarder")
            .select("id, famount, fstatus, fcredit, ftrackingchn, fweight, userid")
            .eq("userid", row.userid)
            .ilike("ftrackingchn", `${base}%`)
            .limit(200);
          if (sibErr) {
            console.error(`[barcode-import shipment siblings]`, { code: sibErr.code, message: sibErr.message, base });
          } else {
            const exact = ((sibs ?? []) as unknown as ShipmentScanRow[])
              .filter((s) => baseTracking(s.ftrackingchn) === base);
            if (exact.length > 0) group = exact;
          }
        }

        // Σ scanned across the whole group (bill-header + every sub).
        const groupIds = group.map((g) => g.id);
        const { data: scanRows, error: scanErr } = await admin
          .from("tb_forwarder_import2")
          .select("fid, fi2amount")
          .in("fid", groupIds);
        if (scanErr) {
          console.error(`[barcode-import shipment scans]`, { code: scanErr.code, message: scanErr.message });
        }
        const scannedByFid = new Map<number, number>();
        for (const sr of (scanRows ?? []) as { fid: number | null; fi2amount: number | string | null }[]) {
          if (sr.fid != null) scannedByFid.set(sr.fid, Number(sr.fi2amount ?? 0) || 0);
        }

        const flip = computeShipmentFlip(group, scannedByFid);

        if (flip.shouldFlip) {
          // Wave 26 G5 status-transition role gate (*→4 = warehouse · super /
          // manager override). Gate on the SCANNED row's status; skip when it is
          // already '4' (idempotent re-scan after the shipment completed).
          let allowFlip = row.fstatus === "4";
          if (!allowFlip) {
            const callerRoles = (await getAdminRoles()) ?? [];
            allowFlip = canAnyRoleFlipFstatus(callerRoles, row.fstatus, "4");
          }
          if (!allowFlip) {
            logger.warn(
              "barcode_import.scan",
              "shipment fstatus auto-flip blocked by G5 transition gate",
              { fid: row.id, from: row.fstatus, base },
            );
          } else {
            // Flip every eligible sibling → '4'. The WHERE re-asserts the
            // physical-axis / credit-6 guard so a row that raced to paid (5-7)
            // is never pulled back (TOCTOU-safe · mirrors primaryLookup).
            const { error: flipErr } = await admin
              .from("tb_forwarder")
              .update({ fstatus: "4", fdatestatus4: nowIso, adminidupdate: legacyAdminId, fpallet: fPallet })
              .in("id", flip.eligibleIds)
              .or("fstatus.lt.5,and(fcredit.eq.1,fstatus.eq.6)");
            if (!flipErr) {
              statusFlipped = true;
              // G8 — audit each flipped row (best-effort · 3→4 is an internal
              // warehouse confirmation, no customer notify).
              for (const g of group) {
                if (flip.eligibleIds.includes(g.id)) {
                  await appendStatusLog(admin, g.id, g.fstatus, "4", legacyAdminId);
                }
              }
            }
          }
        } else {
          // Shipment not complete yet — touch the matched row only
          // (adminidupdate + fpallet · legacy L171-175).
          await admin
            .from("tb_forwarder")
            .update({ adminidupdate: legacyAdminId, fpallet: fPallet })
            .eq("id", row.id);
        }
      }

      // ── 3b. Phase 3 (ops-workflow audit §30) — staff-notify on the
      // container-completeness EDGE: if this scan completed the LAST
      // missing row in the cabinet, fire a LINE staff-group push. Only
      // fires on the edge transition (statusFlipped is true here AND the
      // post-flip rollup is now complete), so no spam on subsequent scans
      // within an already-complete container.
      if (row && row.fcabinetnumber && statusFlipped) {
        try {
          const rollup = await getContainerCompleteness(admin, row.fcabinetnumber);
          if (rollup.isComplete && rollup.forwardersTotal > 0) {
            // Best-effort — staff notify never blocks the warehouse UX.
            await notifyStaffGroup(
              `🎉 ตู้ ${row.fcabinetnumber} ยิงเข้าโกดังครบทุกรายการแล้ว · ${rollup.pct}% (${rollup.scanned.toLocaleString()}/${rollup.expected.toLocaleString()} กล่อง · ${rollup.forwardersComplete}/${rollup.forwardersTotal} รายการ)`,
              {
                title: `ตู้ ${row.fcabinetnumber} ยิงครบแล้ว`,
                url: `/admin/report-cnt/${encodeURIComponent(row.fcabinetnumber)}`,
                urlLabel: "ดูรายละเอียดตู้",
              },
            );
          }
        } catch (e) {
          // Never throw — a failed notify must not fail the scan.
          logger.warn(
            "barcode_import.scan",
            "container-completeness edge notify failed",
            { fid: row.id, fcabinetnumber: row.fcabinetnumber, error: String(e) },
          );
        }
      }

      // ── 4. Build response card
      const matched = row !== null;
      let cardColor: CardColor = "green";
      let message = "";
      if (matched) {
        // Green = saved + matched (legacy 'border-success bg-success-2')
        // Even at over-count (fi2amount > famount) legacy keeps the green
        // border because the upsert + the flip-once happened — but the
        // count badge goes red (`bg-danger`). We surface that via the
        // `countScanned > countTotal` flag the client renders separately.
        cardColor = "green";
        message = "บันทึกสำเร็จ พบข้อมูลถูกต้อง";
      } else {
        // Orange = saved but unmatched (legacy 'border-warning bg-warning-2')
        // The orphan row is in tb_forwarder_import2; warehouse staff will
        // link it later via the warehouse-history page.
        cardColor = "orange";
        message = "บันทึกสำเร็จ ไม่พบข้อมูลเชื่อมภายหลัง";
      }

      // ── 5. Audit log
      await logAdminAction(
        adminId,
        "barcode_import.scan",
        "tb_forwarder_import2",
        row ? String(row.id) : `orphan:${keysearch}`,
        {
          keysearch,
          fPallet,
          fid,
          fi2amount,
          famount: row?.famount ?? null,
          mode,
          statusFlipped,
          legacy_admin_id: legacyAdminId,
        },
      );

      revalidatePath("/admin/barcode/driver/import");
      revalidatePath("/admin/barcode/cargo/import");
      revalidatePath("/admin/forwarders/warehouse-history");
      // Wave 28 (2026-05-29 · audit fix): also revalidate cnt-list-table so the
      // Wave 27 fstatus row-tint refreshes after a scan-driven 3→4 flip. Legacy
      // PCS didn't auto-sync this either, but Pacred CAN — staff sees row color
      // change to amber (ถึงไทย) when they navigate back without manual reload.
      revalidatePath("/admin/report-cnt");
      if (row) {
        revalidatePath(`/admin/forwarders/${row.id}`);
        if (row.fcabinetnumber) revalidatePath(`/admin/report-cnt/${row.fcabinetnumber}`);
      }

      return {
        ok: true,
        data: {
          matched,
          fid,
          productName: row?.fdetail ?? null,
          pallet: fPallet,
          countScanned: fi2amount,
          countTotal: row?.famount ?? 0,
          statusFlipped,
          cardColor,
          message,
          fIDorCO: row?.fidorco ?? null,
          fTrackingCHN: row?.ftrackingchn ?? null,
          fCabinetNumber: row?.fcabinetnumber ?? null,
          userId: row?.userid ?? null,
          dateSave: nowIso,
        },
      };
    },
  );
}
