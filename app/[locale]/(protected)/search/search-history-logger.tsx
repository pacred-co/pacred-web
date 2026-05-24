"use client";

/**
 * Fire-and-forget search-query logger — Sprint-3 P2.1.
 *
 * Calls `saveSearchQuery` ONCE on mount of the search result page,
 * binding the typed query + the result-count hint. Replaces the
 * legacy `tb_history_key` INSERT side-effect that `search.php`
 * (L370-372) used to do at render time — a Next.js Server Component
 * render must stay a pure read, so the write lives here client-side.
 *
 * Render output is null — this component is purely a side-effect
 * carrier. Idempotent re-renders are deduped via a useRef guard so a
 * fast back-button navigation doesn't double-log.
 */

import { useEffect, useRef } from "react";
import { saveSearchQuery } from "@/actions/search";

type Props = {
  /** The typed query (e.g. the value of `?url=` on /search). Must
   *  be non-empty for the logger to fire. */
  query: string;
  /** Where on the search surface this came from. Examples:
   *    "china-search.keyword"
   *    "china-search.url"
   *    "china-search.url-detail"
   *  Maps to tb_search_history.source — keeps the legacy
   *  tb_history_key.type column's information density. */
  source: string;
  /** Best-effort hit count — null when the caller doesn't know. */
  resultCount?: number | null;
};

export function SearchHistoryLogger({ query, source, resultCount }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!query || !query.trim()) return;
    fired.current = true;

    // Fire-and-forget — saveSearchQuery never throws (best-effort
    // logging by design); ignore the response so a network hiccup
    // doesn't surface in the console.
    void saveSearchQuery({
      query:       query.trim(),
      source,
      resultCount: resultCount ?? undefined,
    });
  }, [query, source, resultCount]);

  return null;
}
