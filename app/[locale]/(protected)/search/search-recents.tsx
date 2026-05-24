"use client";

/**
 * Recent-searches strip — Sprint-3 P2.1.
 *
 * Renders a thin chip row above the search results showing the
 * customer's last N unique queries (newest first). Click → re-runs
 * the search by navigating to /search?url=<query>; the trash icon
 * clears the entire history via clearMySearchHistory.
 *
 * Reads via getMyRecentSearches (G8) — owner-only RLS on
 * tb_search_history (migration 0102). Self-hides when the list is
 * empty so a brand-new customer doesn't see a useless empty bar.
 *
 * The companion <SearchHistoryLogger /> fires the saveSearchQuery
 * write on mount of the search RESULT page; together they close the
 * legacy `tb_history_key` loop deliberately deferred from the
 * faithful Server-Component port.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearMySearchHistory,
  getMyRecentSearches,
  type RecentSearch,
} from "@/actions/search";

type Props = {
  /** Max chips to show. Defaults to 8 — fits one row on a phone. */
  limit?: number;
};

export function SearchRecents({ limit = 8 }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<RecentSearch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getMyRecentSearches(limit);
      if (!alive) return;
      if (res.ok && res.data) setItems(res.data);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [limit]);

  // Don't render anything while loading or when empty — keeps the
  // visual chrome unchanged for new customers.
  if (!loaded || items.length === 0) return null;

  function rerun(q: string) {
    router.push(`/search?url=${encodeURIComponent(q)}`);
  }

  function clear() {
    if (!window.confirm("ล้างประวัติการค้นหาทั้งหมด?")) return;
    startTransition(async () => {
      const res = await clearMySearchHistory();
      if (res.ok) setItems([]);
    });
  }

  return (
    <div
      style={{
        padding:    "6px 10px",
        background: "#fafafa",
        borderTop: "1px solid #eee",
        borderBottom: "1px solid #eee",
        display:    "flex",
        alignItems: "center",
        gap:        6,
        overflowX:  "auto",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          fontSize:   12,
          color:      "#6b7280",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        ค้นหาล่าสุด:
      </span>
      {items.map((row) => (
        <button
          key={`${row.query}-${row.created_at}`}
          type="button"
          onClick={() => rerun(row.query)}
          title={`ค้นหา "${row.query}" อีกครั้ง`}
          style={{
            background:   "#fff",
            border:       "1px solid #d1d5db",
            color:        "#374151",
            borderRadius: 12,
            padding:      "3px 10px",
            fontSize:     12,
            cursor:       "pointer",
            flexShrink:   0,
            maxWidth:     160,
            overflow:     "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.query}
        </button>
      ))}
      <button
        type="button"
        onClick={clear}
        disabled={pending}
        title="ล้างประวัติ"
        aria-label="ล้างประวัติการค้นหา"
        style={{
          background: "transparent",
          border:     "none",
          color:      "#dc3545",
          fontSize:   13,
          cursor:     pending ? "wait" : "pointer",
          padding:    "3px 6px",
          marginLeft: "auto",
          flexShrink: 0,
        }}
      >
        🗑
      </button>
    </div>
  );
}
