"use server";

/**
 * Live YouTube stats for the Marketing Content Planner (ปอน 2026-07-02).
 * Fetches view/like/comment counts from the YouTube Data API v3 for a pasted
 * YouTube link. On-demand (button-triggered) — the API has a daily quota, so we
 * pull the current numbers when asked rather than polling continuously.
 *
 * Needs env YOUTUBE_API_KEY (a free Google Cloud "YouTube Data API v3" key).
 * Without it, returns a clear error instead of throwing. FB/TikTok/IG have no
 * practical public stats API → those stay on the manual "วัดผล" flow.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import type { YouTubeStats } from "@/lib/marketing-planner/link-preview";

const ROLES = ["super", "ultra", "manager", "sales_admin", "sales", "ops"] as const;

export type YouTubeStatsResult = { ok: true; stats: YouTubeStats } | { ok: false; error: string };

export async function fetchYouTubeStats(videoId: string): Promise<YouTubeStatsResult> {
  await requireAdmin([...ROLES]);

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, error: "ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY (ขอฟรีจาก Google Cloud → ใส่ใน .env.local แล้ว restart)" };

  const id = (videoId ?? "").trim();
  if (!/^[\w-]{11}$/.test(id)) return { ok: false, error: "รหัสวิดีโอ YouTube ไม่ถูกต้อง" };

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${id}&key=${key}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message ?? `YouTube API error ${res.status}`;
      console.error("[youtube-stats] api error", { status: res.status, msg });
      return { ok: false, error: msg };
    }
    const item = json?.items?.[0];
    if (!item) return { ok: false, error: "ไม่พบวิดีโอ (อาจเป็นส่วนตัว/ถูกลบ)" };
    const s = item.statistics ?? {};
    return {
      ok: true,
      stats: {
        views: Number(s.viewCount ?? 0),
        likes: Number(s.likeCount ?? 0), // absent when the uploader hides likes
        comments: Number(s.commentCount ?? 0),
        title: item.snippet?.title,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    console.error("[youtube-stats] fetch failed", e);
    return { ok: false, error: "เชื่อมต่อ YouTube ไม่ได้ ลองใหม่อีกครั้ง" };
  }
}
