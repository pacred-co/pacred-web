"use client";

import { useEffect, useState } from "react";
import { Eye, ThumbsUp } from "lucide-react";

export function ArticleStats({ articleId }: { articleId: number }) {
  // Base counts deterministic by id (เห็นเลขสม่ำเสมอ ไม่ใช่ random ทุก reload)
  const baseViews = 247 + articleId * 113;
  const baseLikes = 18 + articleId * 7;

  const [views, setViews] = useState<number>(baseViews);
  const [likes, setLikes] = useState<number>(baseLikes);
  const [liked, setLiked] = useState(false);
  const [mounted, setMounted] = useState(false);

  // sync state from localStorage on mount — เป็น external state จึงต้อง setState ใน effect
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const sessionKey = `vk-${articleId}`;
    const likedKey = `lk-${articleId}`;
    const viewCntKey = `vc-${articleId}`;
    const likeCntKey = `lc-${articleId}`;

    const wasLiked = localStorage.getItem(likedKey) === "1";
    const savedViews = parseInt(localStorage.getItem(viewCntKey) || "0", 10);
    const savedLikes = parseInt(localStorage.getItem(likeCntKey) || "0", 10);

    let newViews = savedViews;
    if (!sessionStorage.getItem(sessionKey)) {
      newViews = savedViews + 1;
      localStorage.setItem(viewCntKey, String(newViews));
      sessionStorage.setItem(sessionKey, "1");
    }

    setMounted(true);
    setLiked(wasLiked);
    setViews(baseViews + newViews);
    setLikes(baseLikes + savedLikes);
  }, [articleId, baseViews, baseLikes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleLike = () => {
    const likedKey = `lk-${articleId}`;
    const likeCntKey = `lc-${articleId}`;
    const stored = parseInt(localStorage.getItem(likeCntKey) || "0", 10);

    if (!liked) {
      // like
      localStorage.setItem(likedKey, "1");
      localStorage.setItem(likeCntKey, String(stored + 1));
      setLiked(true);
      setLikes((l) => l + 1);
    } else {
      // unlike
      localStorage.removeItem(likedKey);
      localStorage.setItem(likeCntKey, String(Math.max(0, stored - 1)));
      setLiked(false);
      setLikes((l) => Math.max(0, l - 1));
    }
  };

  return (
    <>
      {/* View count */}
      <span className="inline-flex items-center gap-1" suppressHydrationWarning>
        <Eye className="w-3.5 h-3.5" strokeWidth={2.5} />
        {mounted ? views.toLocaleString() : baseViews.toLocaleString()} วิว
      </span>
      <span className="text-muted/50">·</span>

      {/* Like button */}
      <button
        type="button"
        onClick={toggleLike}
        suppressHydrationWarning
        aria-label={liked ? "Unlike" : "Like"}
        className={[
          "inline-flex items-center gap-1 px-2 py-1 -mx-2 rounded-md transition-all cursor-pointer",
          liked
            ? "text-primary-600 dark:text-primary-400"
            : "hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700",
        ].join(" ")}
      >
        <ThumbsUp
          className={[
            "w-3.5 h-3.5 transition-all duration-300",
            liked ? "fill-primary-600 scale-110" : "",
          ].join(" ")}
          strokeWidth={2.5}
        />
        <span suppressHydrationWarning>
          {mounted ? likes.toLocaleString() : baseLikes.toLocaleString()}
        </span>
      </button>
    </>
  );
}
