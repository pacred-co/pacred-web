import "server-only";

/**
 * MOMO Live DISCOVERY — server-only orchestration (owner/ภูม 2026-07-03).
 *
 * Scrapes the MOMO Live "coming-to-Thailand" board(s), LEFT-diffs every parcel against
 * tb_forwarder (base + exact tracking), and returns the parcels MOMO Live shows advanced
 * (has weight) but which have NO tb_forwarder row — the ones the partner API dropped so
 * they never reached the Review & Commit queue (and aren't in the แต้ม "ตกหล่น" page).
 *
 * READ-ONLY here (scrape + SELECT). The write path (materialize → reuse commitMomoRowCore)
 * lives in actions/admin/momo-live-discovery.ts, gated + money-reviewed.
 *
 * @see lib/admin/momo-live-discovery-plan.ts — the pure diff + payload builders
 * @see actions/admin/momo-live-discovery.ts   — the gated queue + commit actions
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMomoLiveListFresh } from "@/lib/integrations/momo-web/client";
import type { MomoLiveParcel } from "@/lib/integrations/momo-web/types";
import { baseTrackingOf } from "@/lib/integrations/momo-web/live-parcel-metrics";
import {
  classifyDiscovery,
  normalizeMemberCode,
  buildImportTrackRow,
  DISCOVERY_BOARDS,
  type DiscoveryCandidate,
} from "@/lib/admin/momo-live-discovery-plan";

/** A discovery candidate enriched with system context for the queue UI. */
export type DiscoveryRow = DiscoveryCandidate & {
  /** memberCode resolves to a real tb_users row → safe to commit. */
  userIdValid: boolean;
  /** linked ฝากสั่งซื้อ hno (this tracking is a tb_order line) or null. */
  linkedHno: string | null;
  /** the linked order's current hstatus (display: shows it's stuck) or null. */
  linkedHstatus: string | null;
};

export type MomoLiveDiscoveryResult = {
  rows: DiscoveryRow[];
  /** total distinct base trackings seen across the scanned boards. */
  baseTrackingsSeen: number;
  /** already had a tb_forwarder row → not surfaced (correct). */
  alreadyInSystem: number;
  /** skipped for weightKg <= 0 (money-safe · never commit un-weighed). */
  skippedNoWeight: number;
  /** which boards were scanned + how many parcels each returned. */
  boards: Array<{ board: string; parcels: number }>;
  /** a scrape failure (MOMO login / network) — the queue renders a banner, not an error. */
  scrapeError: string | null;
};

/** Chunked `.in()` helper (PostgREST caps the URL length). */
async function chunkedForwarderBaseSet(
  admin: SupabaseClient,
  lookupKeys: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < lookupKeys.length; i += CHUNK) {
    const slice = lookupKeys.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("ftrackingchn")
      .in("ftrackingchn", slice);
    if (error) {
      console.error("[momo-live-discovery] tb_forwarder lookup failed", {
        code: error.code,
        message: error.message,
      });
      // On a lookup error, FAIL CLOSED for these keys: treat them as "already in
      // system" by adding them to the set, so a transient read never causes a
      // false-surface (which could lead to a duplicate commit). The caller's
      // per-commit re-check is the final guard anyway.
      for (const k of slice) set.add(baseTrackingOf(k));
      continue;
    }
    for (const r of (data ?? []) as Array<{ ftrackingchn: string | null }>) {
      const t = (r.ftrackingchn ?? "").trim();
      if (t) set.add(baseTrackingOf(t));
    }
  }
  return set;
}

/**
 * Run the discovery scan. Best-effort per board (a failed board is recorded, not fatal);
 * if the MOMO login itself fails, `scrapeError` is set and `rows` is empty.
 */
/**
 * Scrape the discovery boards once (fresh MOMO login · single-session) → deduped
 * parcels + per-board counts + a scrape error (login/network) if any board failed.
 */
async function scrapeDiscoveryBoards(
  sizePerBoard: number,
): Promise<{ parcels: MomoLiveParcel[]; boards: Array<{ board: string; parcels: number }>; scrapeError: string | null }> {
  const byTracking = new Map<string, MomoLiveParcel>();
  const boards: Array<{ board: string; parcels: number }> = [];
  let scrapeError: string | null = null;
  for (const board of DISCOVERY_BOARDS) {
    try {
      const parcels = await fetchMomoLiveListFresh(board, sizePerBoard);
      boards.push({ board, parcels: parcels.length });
      for (const p of parcels) {
        const t = (p.tracking ?? "").trim();
        if (t && !byTracking.has(t)) byTracking.set(t, p);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "scrape failed";
      console.error("[momo-live-discovery] board scrape failed", { board, msg });
      // first failure = likely a login failure → surface it (the whole scan is degraded)
      scrapeError = scrapeError ?? msg;
      boards.push({ board, parcels: 0 });
    }
  }
  return { parcels: Array.from(byTracking.values()), boards, scrapeError };
}

export async function runMomoLiveDiscovery(
  admin: SupabaseClient,
  sizePerBoard = 500,
): Promise<MomoLiveDiscoveryResult> {
  // ── 1. Scrape the discovery boards (dedup by exact tracking) ──
  const { parcels, boards, scrapeError } = await scrapeDiscoveryBoards(sizePerBoard);
  if (parcels.length === 0) {
    return {
      rows: [],
      baseTrackingsSeen: 0,
      alreadyInSystem: 0,
      skippedNoWeight: 0,
      boards,
      scrapeError,
    };
  }

  // ── 2. Build the existing-in-tb_forwarder base set (base + exact keys) ──
  const lookupKeys = new Set<string>();
  for (const p of parcels) {
    const t = (p.tracking ?? "").trim();
    if (!t) continue;
    lookupKeys.add(t);
    lookupKeys.add(baseTrackingOf(t));
  }
  const existingBaseTrackings = await chunkedForwarderBaseSet(admin, Array.from(lookupKeys));

  // ── 3. Pure diff → commit-eligible candidates ──
  const { candidates, alreadyInSystem, skippedNoWeight, baseTrackingsSeen } = classifyDiscovery(
    parcels,
    existingBaseTrackings,
  );
  if (candidates.length === 0) {
    return { rows: [], baseTrackingsSeen, alreadyInSystem, skippedNoWeight, boards, scrapeError };
  }

  // ── 4. Enrich: member validity (tb_users) + linked shop order (tb_order) ──
  const memberCodes = Array.from(
    new Set(candidates.map((c) => normalizeMemberCode(c.memberCode)).filter(Boolean)),
  );
  const validMembers = new Set<string>();
  for (let i = 0; i < memberCodes.length; i += 200) {
    const slice = memberCodes.slice(i, i + 200);
    const { data, error } = await admin.from("tb_users").select("userID").in("userID", slice);
    if (error) {
      console.error("[momo-live-discovery] tb_users probe failed", { code: error.code });
      continue; // leave those as invalid → the UI shows a warning chip (fail-safe)
    }
    for (const r of (data ?? []) as Array<{ userID: string }>) {
      if (r.userID) validMembers.add(r.userID.toUpperCase());
    }
  }

  const baseTrackings = candidates.map((c) => c.baseTracking);
  const trackingToHno = new Map<string, string>();
  for (let i = 0; i < baseTrackings.length; i += 200) {
    const slice = baseTrackings.slice(i, i + 200);
    const { data, error } = await admin
      .from("tb_order")
      .select("ctrackingnumber, hno")
      .in("ctrackingnumber", slice);
    if (error) {
      console.error("[momo-live-discovery] tb_order probe failed", { code: error.code });
      continue;
    }
    for (const r of (data ?? []) as Array<{ ctrackingnumber: string | null; hno: string | null }>) {
      const t = (r.ctrackingnumber ?? "").trim();
      const h = (r.hno ?? "").trim();
      if (t && h && !trackingToHno.has(t)) trackingToHno.set(t, h);
    }
  }
  const hnos = Array.from(new Set(Array.from(trackingToHno.values())));
  const hnoToStatus = new Map<string, string>();
  for (let i = 0; i < hnos.length; i += 200) {
    const slice = hnos.slice(i, i + 200);
    const { data, error } = await admin
      .from("tb_header_order")
      .select("hno, hstatus")
      .in("hno", slice);
    if (error) {
      console.error("[momo-live-discovery] tb_header_order probe failed", { code: error.code });
      continue;
    }
    for (const r of (data ?? []) as Array<{ hno: string | null; hstatus: string | null }>) {
      const h = (r.hno ?? "").trim();
      if (h) hnoToStatus.set(h, (r.hstatus ?? "").trim());
    }
  }

  const rows: DiscoveryRow[] = candidates.map((c) => {
    const linkedHno = trackingToHno.get(c.baseTracking) ?? null;
    return {
      ...c,
      userIdValid: validMembers.has(normalizeMemberCode(c.memberCode)),
      linkedHno,
      linkedHstatus: linkedHno ? hnoToStatus.get(linkedHno) ?? null : null,
    };
  });

  return { rows, baseTrackingsSeen, alreadyInSystem, skippedNoWeight, boards, scrapeError };
}

// ════════════════════════════════════════════════════════════
// COMMIT-side helpers (the write path lives in actions/admin/momo-live-discovery.ts).
// ════════════════════════════════════════════════════════════

/**
 * Fresh-scrape the discovery boards + return the commit-eligible candidates keyed by
 * BASE tracking (server-AUTHORITATIVE metrics — the client never supplies weight/คิว, so
 * it can't tamper the SELL price). classify against an EMPTY existing-set so ALL weighted
 * parcels map through (existence is enforced per-commit by existingForwarderForBase).
 */
export async function scrapeLiveCandidatesByBase(
  sizePerBoard = 500,
): Promise<{ byBase: Map<string, DiscoveryCandidate>; scrapeError: string | null }> {
  const { parcels, scrapeError } = await scrapeDiscoveryBoards(sizePerBoard);
  const byBase = new Map<string, DiscoveryCandidate>();
  if (parcels.length > 0) {
    for (const c of classifyDiscovery(parcels, new Set()).candidates) {
      byBase.set(c.baseTracking, c);
    }
  }
  return { byBase, scrapeError };
}

/**
 * Re-check tb_forwarder for a base tracking RIGHT BEFORE a discovery-commit — closes the
 * race where the NORMAL commit path lands a row between the queue load and this click
 * (there is no UNIQUE on tb_forwarder.ftrackingchn). FAILS CLOSED: a DB read error →
 * exists:true so we never risk a duplicate billable row. Matches base + any "-i/n" suffix.
 */
export async function existingForwarderForBase(
  admin: SupabaseClient,
  base: string,
): Promise<{ exists: boolean; id: number | null }> {
  // exact base row (the common, non-split case — e.g. YT2590231382196)
  const { data: exact, error: e1 } = await admin
    .from("tb_forwarder")
    .select("id")
    .eq("ftrackingchn", base)
    .limit(1);
  if (e1) {
    console.error("[momo-live-discovery] existence check (exact) failed", { code: e1.code });
    return { exists: true, id: null }; // fail-closed
  }
  if (exact && exact.length > 0) return { exists: true, id: (exact[0] as { id: number }).id };

  // any split-suffix row whose base rolls up to this tracking
  const { data: suffixed, error: e2 } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn")
    .like("ftrackingchn", `${base}-%`)
    .limit(20);
  if (e2) {
    console.error("[momo-live-discovery] existence check (suffix) failed", { code: e2.code });
    return { exists: true, id: null }; // fail-closed
  }
  const hit = (suffixed ?? []).find(
    (r) => baseTrackingOf(((r as { ftrackingchn: string | null }).ftrackingchn ?? "").trim()) === base,
  );
  if (hit) return { exists: true, id: (hit as { id: number }).id };
  return { exists: false, id: null };
}

/**
 * Materialize a discovered Live parcel into momo_import_tracks (idempotent upsert keyed on
 * the partial-UNIQUE momo_tracking_no) so the REUSED commitMomoRowCore can load it. The
 * synthetic raw carries the AGGREGATE TOTAL metrics + the REAL cabinet. Returns the row id.
 * committed_at stays NULL so the core's step-4b claim remains the double-commit guard.
 */
export async function materializeDiscoveredParcel(
  admin: SupabaseClient,
  candidate: DiscoveryCandidate,
): Promise<{ rowId: string } | { error: string }> {
  const row = buildImportTrackRow(candidate);
  const { data, error } = await admin
    .from("momo_import_tracks")
    .upsert(row, { onConflict: "momo_tracking_no" })
    .select("id, committed_at")
    .single<{ id: string; committed_at: string | null }>();
  if (error || !data) {
    console.error("[momo-live-discovery] materialize failed", { code: error?.code, message: error?.message });
    return { error: error?.message ?? "materialize failed" };
  }
  if (data.committed_at) {
    // an existing staging row for this tracking was already committed → don't re-commit.
    return { error: "พัสดุนี้ถูก commit ไปแล้ว" };
  }
  return { rowId: data.id };
}
