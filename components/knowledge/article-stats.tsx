"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, ThumbsUp } from "lucide-react";
import { getArticleStats, registerArticleView, likeArticle } from "@/actions/article-stats";

/**
 * Real, shared view + like counter (owner 2026-06-29). Backed by `article_stats`
 * via server actions — NOT localStorage, so the number is the same for everyone
 * and climbs forever.
 *
 *   statKey   "<category>:<slug>" — same key on the listing card + detail page.
 *   countView pass on a DETAIL page → +1 view on open. Omit on listing cards
 *             (they only DISPLAY the count, so the list never inflates views).
 *
 * Like is anonymous (no login). localStorage remembers THIS browser's like so the
 * heart stays filled + the same browser can't inflate the count; the total itself
 * lives in the DB and persists.
 */
export function ArticleStats({ statKey, countView = false }: { statKey: string; countView?: boolean }) {
  const [views, setViews] = useState(0);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);
  const likedKey = `lk:${statKey}`;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ran.current) return; // once per mount (also guards React strict double-invoke)
    ran.current = true;
    try {
      setLiked(localStorage.getItem(likedKey) === "1");
    } catch {
      /* private mode */
    }
    (countView ? registerArticleView(statKey) : getArticleStats(statKey)).then((s) => {
      setViews(s.views);
      setLikes(s.likes);
    });
  }, [statKey, countView, likedKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function toggleLike() {
    if (busy) return;
    const delta: 1 | -1 = liked ? -1 : 1;
    // optimistic — feels instant ("กดแล้วขึ้นเลย")
    setLiked(!liked);
    setLikes((l) => Math.max(0, l + delta));
    try {
      localStorage.setItem(likedKey, delta === 1 ? "1" : "0");
    } catch {
      /* private mode */
    }
    setBusy(true);
    const s = await likeArticle(statKey, delta);
    setBusy(false);
    if (s.views || s.likes) setLikes(s.likes); // reconcile with the true server total
  }

  return (
    <>
      {/* View count */}
      <span className="inline-flex items-center gap-1">
        <Eye className="w-3.5 h-3.5" strokeWidth={2.5} />
        {views.toLocaleString()} วิว
      </span>
      <span className="text-muted/50">·</span>

      {/* Like button */}
      <button
        type="button"
        onClick={toggleLike}
        aria-label={`${liked ? "เลิกถูกใจ" : "ถูกใจ"} ${likes.toLocaleString()}`}
        className={[
          "inline-flex items-center gap-1 px-2 py-1 -mx-2 rounded-md transition-all cursor-pointer",
          liked
            ? "text-primary-600 dark:text-primary-400"
            : "hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700",
        ].join(" ")}
      >
        <ThumbsUp
          className={["w-3.5 h-3.5 transition-all duration-300", liked ? "fill-primary-600 scale-110" : ""].join(" ")}
          strokeWidth={2.5}
        />
        <span>{likes.toLocaleString()}</span>
      </button>
    </>
  );
}
