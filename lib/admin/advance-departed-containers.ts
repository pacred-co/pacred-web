import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceLinkedShopOrder } from "@/lib/admin/advance-linked-shop-order";
import {
  ADVANCE_TO_FSTATUS,
  ADVANCEABLE_FROM_FSTATUS,
  isContainerDeparted,
  selectAdvanceableForwarders,
  todayYmd,
} from "@/lib/admin/departed-container-plan";

/**
 * AUTO-advance forwarders in a DEPARTED container to "กำลังส่งมาไทย" (fstatus '3').
 *
 * WHY (URGENT · owner/ภูม 2026-07-01):
 *   MOMO's import/track API only reports status up to "ออกจากโกดังจีน" and then DROPS
 *   the parcel once it advances → many tb_forwarder rows stay STUCK at fstatus '1'
 *   (รอเข้าโกดังจีน) or '2' (ถึงโกดังจีนแล้ว) even after the container has DEPARTED China
 *   and is on the water/road to Thailand. propagateMomoToForwarders can't fix this —
 *   MOMO simply stops feeding those parcels a status. So we bypass the broken API
 *   using the แต้ม (iTAM) container ETD we already store in taem_container_etd_eta
 *   (migration 0195): once the ETD is in the PAST, the container has left China, so
 *   every parcel still at '1'/'2' in it is really at least "กำลังส่งมาไทย".
 *
 * DEPARTED signal (money/status-SAFE):
 *   PRIMARY = แต้ม ETD strictly in the past (etd < today). Do NOT advance on a
 *   cabinet-assigned-alone signal — a container that merely has a code / is closed is
 *   not necessarily gone. A row must belong to a container whose ETD has passed.
 *
 * WHAT IT WRITES (STATUS-ONLY — never money):
 *   - fstatus       → '3' (กำลังส่งมาไทย)
 *   - fdatestatus3  → today, ONLY when currently empty (never overwrites a real stamp)
 *   - adminidupdate → 'system-auto' (audit marker; not a money column)
 *   It writes NOTHING else: no wallet, commission, cabinet, weight, price, dispatch.
 *
 * FORWARD-ONLY + IDEMPOTENT + TOCTOU-safe:
 *   The UPDATE WHERE carries `.in('fstatus', ADVANCEABLE_FROM_FSTATUS)` = ['1','2'],
 *   so it can NEVER demote a row already at 3/4/5/6/7, and a re-run advances 0 rows.
 *
 * LINKED ฝากสั่งซื้อ: after advancing a forwarder, best-effort re-derive the linked
 *   shop order (the same helper the propagate cron uses) so a linked order stays
 *   consistent. Best-effort — its failure NEVER rolls back the status write.
 *
 * @param admin a service-role Supabase client (bypasses RLS · server-only)
 * @param now   injected for deterministic behaviour (defaults to new Date())
 * @returns {scanned, advanced, containers} — scanned = departed forwarder rows found
 *          at '1'/'2'; advanced = rows actually flipped to '3'; containers = per-
 *          container breakdown (for logging + the dry-run script).
 */
export async function advanceDepartedContainerForwarders(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<AdvanceDepartedResult> {
  const result: AdvanceDepartedResult = { scanned: 0, advanced: 0, containers: [], errors: [] };
  const today = todayYmd(now);

  // 1. Read the แต้ม per-container ETD/ETA store, keep only DEPARTED containers
  //    (ETD strictly in the past). Filtering `etd <= today` in SQL narrows the read;
  //    the pure isContainerDeparted re-checks strict `< today` + the 0000-00-00
  //    sentinel so today's ETD is excluded.
  const { data: taemRows, error: taemErr } = await admin
    .from("taem_container_etd_eta")
    .select("container_no, etd")
    .not("etd", "is", null)
    .lte("etd", today);
  if (taemErr) {
    console.error("[advanceDepartedContainerForwarders] taem read failed", {
      code: taemErr.code,
      message: taemErr.message,
    });
    result.errors.push({ container: "(taem)", message: `taem read failed: ${taemErr.code} ${taemErr.message}` });
    return result;
  }

  const departedContainers = Array.from(
    new Set(
      ((taemRows ?? []) as Array<{ container_no: string | null; etd: string | null }>)
        .filter((r) => isContainerDeparted(r.etd, now))
        .map((r) => (r.container_no ?? "").trim())
        .filter(Boolean),
    ),
  );
  if (departedContainers.length === 0) return result;

  // 2. Per departed container: read its ADVANCEABLE forwarder rows ('1'/'2'), advance
  //    them to '3' with the forward-only WHERE guard, then best-effort re-derive the
  //    linked shop order. Per-container so one container's failure doesn't abort the
  //    rest, and the dry-run script can print an identical per-container plan.
  for (const container of departedContainers) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fdatestatus3, reforder, ftrackingchn, fcabinetnumber")
      .eq("fcabinetnumber", container)
      .in("fstatus", [...ADVANCEABLE_FROM_FSTATUS]);
    if (fwdErr) {
      console.error("[advanceDepartedContainerForwarders] forwarder read failed", {
        container,
        code: fwdErr.code,
        message: fwdErr.message,
      });
      result.errors.push({ container, message: `forwarder read failed: ${fwdErr.code} ${fwdErr.message}` });
      continue;
    }

    type Hit = {
      id: number;
      fstatus: string | null;
      fdatestatus3: string | null;
      reforder: string | null;
      ftrackingchn: string | null;
      fcabinetnumber: string | null;
    };
    // The SELECT already filtered to '1'/'2'; selectAdvanceableForwarders is a
    // belt-and-braces re-filter of the pure rule (also what the test exercises).
    const candidates = selectAdvanceableForwarders((fwdRows ?? []) as Hit[]);
    if (candidates.length === 0) continue;
    result.scanned += candidates.length;

    let advancedInContainer = 0;
    for (const f of candidates) {
      // STATUS-ONLY write. fdatestatus3 only when empty (don't overwrite a real
      // in-transit stamp). adminidupdate = the audit marker. NOTHING else.
      const update: Record<string, unknown> = {
        fstatus: ADVANCE_TO_FSTATUS,
        adminidupdate: "system-auto",
      };
      const hasStamp = !!f.fdatestatus3 && f.fdatestatus3 !== "0000-00-00";
      if (!hasStamp) update.fdatestatus3 = today;

      // FORWARD-ONLY + TOCTOU-safe: `.in('fstatus', ['1','2'])` in the WHERE means a
      // row that raced to 3+ between read and write updates 0 rows (never demoted).
      const { data: updRows, error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .eq("id", f.id)
        .in("fstatus", [...ADVANCEABLE_FROM_FSTATUS])
        .select("id");
      if (updErr) {
        console.error("[advanceDepartedContainerForwarders] update failed", {
          container,
          forwarderId: f.id,
          code: updErr.code,
          message: updErr.message,
        });
        result.errors.push({ container, message: `forwarder #${f.id}: ${updErr.code} ${updErr.message}` });
        continue;
      }
      if (!updRows || updRows.length === 0) continue; // raced past '1'/'2' — skip
      advancedInContainer += 1;
      result.advanced += 1;

      // Best-effort: re-derive the linked ฝากสั่งซื้อ (reforder OR by China tracking).
      // Its failure must NEVER roll back the status write above.
      try {
        await advanceLinkedShopOrder(
          admin,
          {
            reforder: f.reforder,
            ftrackingchn: f.ftrackingchn,
            fcabinetnumber: f.fcabinetnumber,
            fstatus: ADVANCE_TO_FSTATUS,
          },
          today,
        );
      } catch (e) {
        console.error("[advanceDepartedContainerForwarders] advanceLinkedShopOrder threw", {
          container,
          forwarderId: f.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (advancedInContainer > 0) {
      result.containers.push({ container, advanced: advancedInContainer });
    }
  }

  return result;
}

export type AdvanceDepartedResult = {
  /** Departed-container forwarder rows found at fstatus '1'/'2' (eligible to advance). */
  scanned: number;
  /** Rows actually flipped '1'/'2' → '3'. */
  advanced: number;
  /** Per-container breakdown of what advanced (for logging + the dry-run script). */
  containers: Array<{ container: string; advanced: number }>;
  /** Per-item errors. Best-effort: an error doesn't abort the whole run. */
  errors: Array<{ container: string; message: string }>;
};
