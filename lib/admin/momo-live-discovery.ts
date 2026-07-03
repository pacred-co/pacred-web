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
import { fetchMomoLiveAllInOneFresh } from "@/lib/integrations/momo-web/client";
import type { MomoLiveParcel } from "@/lib/integrations/momo-web/types";
import { baseTrackingOf } from "@/lib/integrations/momo-web/live-parcel-metrics";
import {
  classifyDiscovery,
  normalizeMemberCode,
  buildImportTrackRow,
  pickSuggestedCarrier,
  payMethodForCarrier,
  type DiscoveryCandidate,
  type DiscoveryDelivery,
  type DeliveryAddressOption,
} from "@/lib/admin/momo-live-discovery-plan";
import { getShipByOptionsForAddress } from "@/lib/cart/ship-by-eligibility";

/** A discovery candidate enriched with system context for the queue UI. */
export type DiscoveryRow = DiscoveryCandidate &
  DiscoveryDelivery & {
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
 * Add every tracking present in momo_import_tracks (the partner Review queue) to the
 * suppress set — so a parcel the partner feed still holds is never re-surfaced by the
 * all-boards discovery scan (nor overwritten by a materialize). Fail-open per chunk on a
 * read error (the per-commit re-check + materialize upsert-on-conflict remain the guards).
 */
async function addPartnerFeedTrackings(
  admin: SupabaseClient,
  lookupKeys: string[],
  set: Set<string>,
): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < lookupKeys.length; i += CHUNK) {
    const slice = lookupKeys.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("momo_import_tracks")
      .select("momo_tracking_no")
      .in("momo_tracking_no", slice);
    if (error) {
      console.error("[momo-live-discovery] momo_import_tracks lookup failed", { code: error.code });
      continue; // fail-open: the materialize upsert + commit claim still prevent a dup
    }
    for (const r of (data ?? []) as Array<{ momo_tracking_no: string | null }>) {
      const t = (r.momo_tracking_no ?? "").trim();
      if (t) set.add(baseTrackingOf(t));
    }
  }
}

/**
 * Scrape EVERY MOMO Live parcel in ONE call (fresh login · `status=all`) — the complete
 * mirror across all statuses. This replaces the old per-board loop (ภูม 2026-07-03:
 * "เอาของทุกสถานะมาเลย"); the per-board params were partly wrong (done/sending/wait_pay
 * returned 0) so `all` is the only way to see every board. Deduped by tracking.
 */
async function scrapeDiscoveryBoards(
  size: number,
): Promise<{ parcels: MomoLiveParcel[]; boards: Array<{ board: string; parcels: number }>; scrapeError: string | null }> {
  try {
    const parcels = await fetchMomoLiveAllInOneFresh(size);
    const byTracking = new Map<string, MomoLiveParcel>();
    for (const p of parcels) {
      const t = (p.tracking ?? "").trim();
      if (t && !byTracking.has(t)) byTracking.set(t, p);
    }
    return {
      parcels: Array.from(byTracking.values()),
      boards: [{ board: "all", parcels: byTracking.size }],
      scrapeError: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "scrape failed";
    console.error("[momo-live-discovery] all-status scrape failed", { msg });
    return { parcels: [], boards: [{ board: "all", parcels: 0 }], scrapeError: msg };
  }
}

// ════════════════════════════════════════════════════════════
// Delivery resolution (owner/ภูม 2026-07-03 · reuse the auto-commit SOT)
//
// For each customer surface: their saved delivery addresses (a picker the admin
// can view/edit) + a suggested {address, carrier, payMethod} pre-resolved the same
// way resolveAutoCommitDelivery does (saved carrier ∘ default-address ∘ province
// eligibility ∘ derivePayMethod). fail-soft: no saved address → empty list + blank
// suggestion → the commit core writes EMPTY_ADDRESS; the admin fills it later.
// ════════════════════════════════════════════════════════════

const BLANK_DELIVERY: DiscoveryDelivery = {
  addresses: [],
  suggestedAddressId: null,
  suggestedFShipBy: "",
  suggestedPayMethod: "2",
};

type AddressRow = {
  addressid: number;
  addressname: string | null;
  addressprovince: string | null;
  addressdistrict: string | null;
  addresszipcode: string | null;
};

/**
 * Resolve delivery context for a set of customers in a few batched round-trips:
 *   1. tb_address_main → each customer's DEFAULT address id.
 *   2. tb_address (addressstatus="1") → all their active saved addresses.
 *   3. tb_users.userShipBy → the saved carrier (to seed the suggestion).
 * Then, per customer, PRE-COMPUTE the eligible carriers for each address
 * (getShipByOptionsForAddress — the reused legacy rule) and the suggested
 * {address, carrier, payMethod}. All reads fail-soft: a probe error → that
 * customer gets BLANK_DELIVERY (the admin fills it at commit).
 */
async function resolveDeliveryByUser(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, DiscoveryDelivery>> {
  const out = new Map<string, DiscoveryDelivery>();
  if (userIds.length === 0) return out;

  // 1. Default address id per user (tb_address_main).
  const defaultByUser = new Map<string, number>();
  for (let i = 0; i < userIds.length; i += 200) {
    const slice = userIds.slice(i, i + 200);
    const { data, error } = await admin
      .from("tb_address_main")
      .select("userid, addressid")
      .in("userid", slice);
    if (error) {
      console.error("[momo-live-discovery] tb_address_main probe failed", { code: error.code });
      continue; // fail-soft
    }
    for (const r of (data ?? []) as Array<{ userid: string | null; addressid: number | null }>) {
      const u = (r.userid ?? "").trim().toUpperCase();
      if (u && r.addressid && !defaultByUser.has(u)) defaultByUser.set(u, r.addressid);
    }
  }

  // 2. All active saved addresses per user (tb_address, addressstatus="1").
  const addressesByUser = new Map<string, AddressRow[]>();
  for (let i = 0; i < userIds.length; i += 200) {
    const slice = userIds.slice(i, i + 200);
    const { data, error } = await admin
      .from("tb_address")
      .select("userid, addressid, addressname, addressprovince, addressdistrict, addresszipcode")
      .in("userid", slice)
      .eq("addressstatus", "1");
    if (error) {
      console.error("[momo-live-discovery] tb_address probe failed", { code: error.code });
      continue; // fail-soft
    }
    for (const r of (data ?? []) as Array<AddressRow & { userid: string | null }>) {
      const u = (r.userid ?? "").trim().toUpperCase();
      if (!u || !r.addressid) continue;
      const list = addressesByUser.get(u) ?? [];
      list.push({
        addressid: r.addressid,
        addressname: r.addressname,
        addressprovince: r.addressprovince,
        addressdistrict: r.addressdistrict,
        addresszipcode: r.addresszipcode,
      });
      addressesByUser.set(u, list);
    }
  }

  // 3. Saved carrier per user (tb_users.userShipBy — camelCase on prod).
  const carrierByUser = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 200) {
    const slice = userIds.slice(i, i + 200);
    const { data, error } = await admin
      .from("tb_users")
      .select('userID, "userShipBy"')
      .in("userID", slice);
    if (error) {
      console.error("[momo-live-discovery] tb_users userShipBy probe failed", { code: error.code });
      continue; // fail-soft
    }
    for (const r of (data ?? []) as Array<{ userID: string | null; userShipBy: string | null }>) {
      const u = (r.userID ?? "").trim().toUpperCase();
      const c = (r.userShipBy ?? "").trim();
      // only a plausible carrier (≤10 chars = the fShipBy cap) seeds the suggestion.
      if (u && c && c.length <= 10) carrierByUser.set(u, c);
    }
  }

  // 4. Per user — build the address options (with eligible carriers) + the suggestion.
  for (const userID of new Set(userIds)) {
    const addrRows = addressesByUser.get(userID) ?? [];
    if (addrRows.length === 0) {
      out.set(userID, { ...BLANK_DELIVERY });
      continue;
    }
    const savedCarrier = carrierByUser.get(userID) ?? "";
    const defaultId = defaultByUser.get(userID) ?? null;

    const options: DeliveryAddressOption[] = addrRows.map((a) => {
      const province = (a.addressprovince ?? "").trim();
      const zip = (a.addresszipcode ?? "").trim();
      const carriers = getShipByOptionsForAddress({
        zip,
        province,
        amphoe: a.addressdistrict,
        userID,
      });
      const labelParts = [
        (a.addressname ?? "").trim() || "(ไม่มีชื่อ)",
        province || "—",
        zip || "",
      ].filter(Boolean);
      return {
        addressID: a.addressid,
        label: labelParts.join(" · "),
        province,
        zip,
        carriers: carriers.map((c) => ({ id: c.id, name: c.name })),
      };
    });

    // seed the address: the default (when it's among the active rows) else the first.
    const seededAddress =
      (defaultId != null && options.find((o) => o.addressID === defaultId)) || options[0];
    const seededCarrier = pickSuggestedCarrier(savedCarrier, seededAddress.carriers);

    out.set(userID, {
      addresses: options,
      suggestedAddressId: seededAddress.addressID,
      suggestedFShipBy: seededCarrier,
      suggestedPayMethod: payMethodForCarrier(seededCarrier),
    });
  }

  return out;
}

export async function runMomoLiveDiscovery(
  admin: SupabaseClient,
  sizePerBoard = 1000,
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

  // ── 2b. ALSO exclude anything already in the partner Review queue (momo_import_tracks).
  //    Scanning all boards means we'd otherwise re-surface parcels the partner feed still
  //    has (waiting/arrival_kodang) — those belong to the normal Review & Commit flow, and
  //    materializing over them would clobber the partner row. Suppress every tracking present
  //    in momo_import_tracks (committed → already has a tb_forwarder row anyway; uncommitted →
  //    the Review queue owns it). So discovery = the GENUINELY orphaned parcels only. ──
  await addPartnerFeedTrackings(admin, Array.from(lookupKeys), existingBaseTrackings);

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

  // ── 4b. Resolve delivery (saved addresses + suggested carrier/COD) per customer.
  //    Only for VALID members (an unknown userID has no addresses anyway) — batched.
  const deliveryByUser = await resolveDeliveryByUser(
    admin,
    memberCodes.filter((m) => validMembers.has(m)),
  );

  const rows: DiscoveryRow[] = candidates.map((c) => {
    const linkedHno = trackingToHno.get(c.baseTracking) ?? null;
    const delivery = deliveryByUser.get(normalizeMemberCode(c.memberCode)) ?? BLANK_DELIVERY;
    return {
      ...c,
      ...delivery,
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
  sizePerBoard = 1000,
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
