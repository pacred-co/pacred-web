"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";

/**
 * U2-5: bulk multi-line tracking search.
 *
 * Per chat audit W-9 + Part U U2-5 — port of legacy
 * `forwarder-search-muti.php?fTracking=xxxx%0D%0Ayyyy`. Staff paste a
 * batch of tracking numbers (one per line) from suppliers / carriers
 * / WeChat batch ingest and want to know which Pacred forwarder each
 * belongs to.
 *
 * Search surfaces (all admin-readable via admin client):
 *   - forwarders.tracking_chn       (set by admin per forwarder)
 *   - forwarders.tracking_th        (TH last-mile tracking)
 *   - forwarder_items.product_tracking (per-item tracking)
 *
 * Returns one row per input tracking + found-context. Multiple matches
 * for one tracking number → multiple result rows (rare; usually 1:1).
 *
 * Limit: up to 200 tracking numbers per request to avoid abuse + DB
 * round-trip explosion. Staff bulk-paste rarely exceeds 50.
 */

const searchSchema = z.object({
  // Newline-separated tracking numbers; whitespace tolerated.
  raw_input: z.string().trim().min(1).max(20_000),
});
export type BulkTrackingSearchInput = z.infer<typeof searchSchema>;

export type TrackingMatch = {
  tracking:        string;
  found_in:        "tracking_chn" | "tracking_th" | "item_tracking";
  forwarder_id:    string;
  f_no:            string;
  status:          string;
  total_price:     number;
  customer_name:   string;
  customer_phone:  string | null;
  customer_member: string | null;
  /** When matched on item, the item product_name for context. */
  item_name:       string | null;
};

export type BulkSearchResult = {
  /** One per input tracking number — preserves entry order. */
  rows: Array<{
    tracking: string;
    matches:  TrackingMatch[];
  }>;
  /** Tracking numbers with zero matches — surfaced separately for action. */
  unmatched: string[];
  /** Total unique tracking numbers searched (after dedup + clean). */
  searched: number;
};

const MAX_TRACKING = 200;

export async function adminBulkTrackingSearch(
  input: BulkTrackingSearchInput,
): Promise<AdminActionResult<BulkSearchResult>> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  // Parse + clean: split on any whitespace/newline/comma; strip empties +
  // dedup while preserving first-seen order.
  const tokens = parsed.data.raw_input
    .split(/[\r\n,;\t ]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { ok: false, error: "no_tracking_numbers" };

  const seen = new Set<string>();
  const trackings: string[] = [];
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    trackings.push(t);
    if (trackings.length >= MAX_TRACKING) break;
  }

  return withAdmin(["super", "ops", "accounting"], async () => {
    const admin = createAdminClient();

    // Three queries in parallel — each returns matching rows with the
    // tracking number string preserved so we can join client-side.
    const [{ data: chnHits }, { data: thHits }, { data: itemHits }] = await Promise.all([
      admin
        .from("forwarders")
        .select(`
          id, f_no, status, tracking_chn, total_price,
          ship_first_name, ship_last_name, ship_phone,
          profile:profiles!profile_id ( member_code )
        `)
        .in("tracking_chn", trackings),
      admin
        .from("forwarders")
        .select(`
          id, f_no, status, tracking_th, total_price,
          ship_first_name, ship_last_name, ship_phone,
          profile:profiles!profile_id ( member_code )
        `)
        .in("tracking_th", trackings),
      admin
        .from("forwarder_items")
        .select(`
          id, product_name, product_tracking,
          forwarder:forwarders!forwarder_id (
            id, f_no, status, total_price,
            ship_first_name, ship_last_name, ship_phone,
            profile:profiles!profile_id ( member_code )
          )
        `)
        .in("product_tracking", trackings),
    ]);

    type ProfileShape = { member_code: string | null };
    type FwdShape = {
      id: string; f_no: string; status: string;
      total_price: number;
      tracking_chn?: string | null;
      tracking_th?:  string | null;
      ship_first_name: string | null;
      ship_last_name:  string | null;
      ship_phone:      string | null;
      profile: ProfileShape | ProfileShape[] | null;
    };

    const matchesByTracking = new Map<string, TrackingMatch[]>();
    function add(t: string, m: TrackingMatch): void {
      const key = t.toLowerCase();
      const arr = matchesByTracking.get(key) ?? [];
      arr.push(m);
      matchesByTracking.set(key, arr);
    }

    for (const r of (chnHits ?? []) as FwdShape[]) {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      add(r.tracking_chn ?? "", {
        tracking:        r.tracking_chn ?? "",
        found_in:        "tracking_chn",
        forwarder_id:    r.id,
        f_no:            r.f_no,
        status:          r.status,
        total_price:     Number(r.total_price),
        customer_name:   `${r.ship_first_name ?? ""} ${r.ship_last_name ?? ""}`.trim() || "—",
        customer_phone:  r.ship_phone,
        customer_member: p?.member_code ?? null,
        item_name:       null,
      });
    }
    for (const r of (thHits ?? []) as FwdShape[]) {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      add(r.tracking_th ?? "", {
        tracking:        r.tracking_th ?? "",
        found_in:        "tracking_th",
        forwarder_id:    r.id,
        f_no:            r.f_no,
        status:          r.status,
        total_price:     Number(r.total_price),
        customer_name:   `${r.ship_first_name ?? ""} ${r.ship_last_name ?? ""}`.trim() || "—",
        customer_phone:  r.ship_phone,
        customer_member: p?.member_code ?? null,
        item_name:       null,
      });
    }
    type ItemShape = {
      id: string;
      product_name: string;
      product_tracking: string;
      forwarder: FwdShape | FwdShape[] | null;
    };
    for (const it of (itemHits ?? []) as ItemShape[]) {
      const fwd = Array.isArray(it.forwarder) ? it.forwarder[0] : it.forwarder;
      if (!fwd) continue;
      const p = Array.isArray(fwd.profile) ? fwd.profile[0] : fwd.profile;
      add(it.product_tracking, {
        tracking:        it.product_tracking,
        found_in:        "item_tracking",
        forwarder_id:    fwd.id,
        f_no:            fwd.f_no,
        status:          fwd.status,
        total_price:     Number(fwd.total_price),
        customer_name:   `${fwd.ship_first_name ?? ""} ${fwd.ship_last_name ?? ""}`.trim() || "—",
        customer_phone:  fwd.ship_phone,
        customer_member: p?.member_code ?? null,
        item_name:       it.product_name,
      });
    }

    const rows = trackings.map((t) => ({
      tracking: t,
      matches:  matchesByTracking.get(t.toLowerCase()) ?? [],
    }));
    const unmatched = rows.filter((r) => r.matches.length === 0).map((r) => r.tracking);

    return {
      ok: true,
      data: {
        rows,
        unmatched,
        searched: trackings.length,
      },
    };
  });
}
