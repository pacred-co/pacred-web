"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, ThumbsUp, Share2, Check } from "lucide-react";
import { getArticleStats, registerArticleView, likeArticle, shareArticle } from "@/actions/article-stats";

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
 *
 * Share (owner 2026-07-20) uses the NATIVE share sheet where the browser has one
 * (phones → LINE/FB/IG in one tap) and falls back to copy-link on desktop. The
 * counter only moves on a CONFIRMED share — cancelling the sheet counts nothing.
 * Unlike `likes` it is cumulative: sharing to LINE then to FB = 2.
 *
 * ⚠️ The share button renders on DETAIL pages only (i.e. where `countView` is on).
 * It shares `location.href`, which is the article itself only on its own page — on
 * a listing card that URL is the LIST, so every card would share the same wrong
 * link. Views/likes still show on cards; only the share affordance is withheld.
 */
export function ArticleStats({ statKey, countView = false }: { statKey: string; countView?: boolean }) {
  const [views, setViews] = useState(0);
  const [likes, setLikes] = useState(0);
  const [shares, setShares] = useState(0);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
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
      setShares(s.shares);
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

  async function doShare() {
    if (sharing) return; // also stops a double-click from counting twice
    setSharing(true);
    const url = window.location.href;
    let shared = false;
    try {
      if (navigator.share) {
        // phones: native sheet → LINE / FB / IG in one tap
        await navigator.share({ title: document.title, url });
        shared = true;
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        shared = true;
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // cancelled the sheet (AbortError) / clipboard blocked → count NOTHING,
      // otherwise the number inflates on every dismissed dialog.
      shared = false;
    }
    if (shared) {
      setShares((n) => n + 1); // optimistic — feels instant
      const s = await shareArticle(statKey);
      if (s.shares) setShares(s.shares); // reconcile with the true server total
    }
    setSharing(false);
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

      {/* Share button — native sheet on phones · copy-link on desktop.
          Detail pages only: on a listing card location.href is the LIST, not this
          article, so sharing from there would hand out the wrong link. */}
      {countView ? (
        <>
      <span className="text-muted/50">·</span>
      <button
        type="button"
        onClick={doShare}
        disabled={sharing}
        aria-label={`แชร์ ${shares.toLocaleString()}`}
        className={[
          "inline-flex items-center gap-1 px-2 py-1 -mx-2 rounded-md transition-all cursor-pointer disabled:cursor-wait",
          copied
            ? "text-emerald-600 dark:text-emerald-400"
            : "hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700",
        ].join(" ")}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 transition-all duration-300" strokeWidth={2.5} />
        ) : (
          <Share2 className="w-3.5 h-3.5 transition-all duration-300" strokeWidth={2.5} />
        )}
        <span>{copied ? "คัดลอกลิงก์แล้ว" : shares.toLocaleString()}</span>
      </button>
        </>
      ) : null}
    </>
  );
}
