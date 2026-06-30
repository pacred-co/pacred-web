/**
 * Pure URL → preview detection (no network). Decides how a link can be shown
 * inline: an embeddable iframe/video, an image, a pdf, or a fallback card.
 * Never throws — an unparseable URL degrades to a "website"/"unknown" card
 * (owner brief §5 "ห้ามให้ระบบพังถ้า preview ไม่ได้").
 */

export type PreviewType =
  | "youtube"
  | "vimeo"
  | "video"
  | "image"
  | "pdf"
  | "tiktok"
  | "facebook"
  | "instagram"
  | "drive"
  | "dropbox"
  | "website"
  | "unknown";

export type LinkInfo = {
  raw: string;
  provider: string; // human label e.g. "YouTube"
  previewType: PreviewType;
  embedUrl?: string; // iframe/video src when embeddable
  canEmbed: boolean; // true → render iframe/video/img; false → fallback card
  isVideo: boolean; // play affordance
  thumbnail?: string;
  domain?: string;
};

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;

function safeUrl(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  try {
    return new URL(s);
  } catch {
    try {
      return new URL(`https://${s}`);
    } catch {
      return null;
    }
  }
}

function ytId(u: URL): string | null {
  if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
  if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
  if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
  return u.searchParams.get("v");
}

function igCode(u: URL): { type: string; code: string } | null {
  const m = u.pathname.match(/\/(p|reel|tv)\/([^/]+)/);
  return m ? { type: m[1], code: m[2] } : null;
}

/** Detect a link's preview strategy. Pure + total. */
export function detectLink(input: string): LinkInfo {
  const raw = (input ?? "").trim();
  const base: LinkInfo = { raw, provider: "ลิงก์", previewType: "unknown", canEmbed: false, isVideo: false };
  if (!raw) return base;

  const u = safeUrl(raw);
  if (!u) return { ...base, provider: "ลิงก์", previewType: "unknown" };
  const host = u.hostname.replace(/^www\./, "");
  const domain = host;

  // Direct media by extension (works for any host)
  if (VIDEO_EXT.test(u.pathname)) return { ...base, provider: "วิดีโอ", previewType: "video", embedUrl: raw, canEmbed: true, isVideo: true, domain };
  if (IMAGE_EXT.test(u.pathname)) return { ...base, provider: "รูปภาพ", previewType: "image", embedUrl: raw, canEmbed: true, domain };
  if (PDF_EXT.test(u.pathname)) return { ...base, provider: "PDF", previewType: "pdf", embedUrl: raw, canEmbed: true, domain };

  // YouTube
  if (host.includes("youtube.com") || host.includes("youtu.be")) {
    const id = ytId(u);
    return {
      ...base, provider: "YouTube", previewType: "youtube", isVideo: true, domain,
      canEmbed: !!id,
      embedUrl: id ? `https://www.youtube.com/embed/${id}` : undefined,
      thumbnail: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined,
    };
  }

  // Vimeo
  if (host.includes("vimeo.com")) {
    const id = u.pathname.split("/").filter(Boolean)[0];
    const numeric = id && /^\d+$/.test(id) ? id : null;
    return { ...base, provider: "Vimeo", previewType: "vimeo", isVideo: true, domain, canEmbed: !!numeric, embedUrl: numeric ? `https://player.vimeo.com/video/${numeric}` : undefined };
  }

  // Google Drive
  if (host.includes("drive.google.com")) {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    const id = m?.[1] ?? u.searchParams.get("id");
    return { ...base, provider: "Google Drive", previewType: "drive", isVideo: true, domain, canEmbed: !!id, embedUrl: id ? `https://drive.google.com/file/d/${id}/preview` : undefined };
  }

  // Dropbox — raw stream if it points at a media file
  if (host.includes("dropbox.com")) {
    const isVid = VIDEO_EXT.test(u.pathname);
    const rawUrl = raw.replace(/[?&]dl=0/, "").replace(/[?&]dl=1/, "") + (raw.includes("?") ? "&raw=1" : "?raw=1");
    return { ...base, provider: "Dropbox", previewType: "dropbox", isVideo: isVid, domain, canEmbed: isVid, embedUrl: isVid ? rawUrl : undefined };
  }

  // TikTok
  if (host.includes("tiktok.com")) {
    const m = u.pathname.match(/\/video\/(\d+)/);
    const id = m?.[1];
    return { ...base, provider: "TikTok", previewType: "tiktok", isVideo: true, domain, canEmbed: !!id, embedUrl: id ? `https://www.tiktok.com/embed/v2/${id}` : undefined };
  }

  // Instagram
  if (host.includes("instagram.com")) {
    const ig = igCode(u);
    return { ...base, provider: "Instagram", previewType: "instagram", isVideo: ig?.type !== "p", domain, canEmbed: !!ig, embedUrl: ig ? `https://www.instagram.com/${ig.type}/${ig.code}/embed` : undefined };
  }

  // Facebook video plugin
  if (host.includes("facebook.com") || host.includes("fb.watch")) {
    const looksVideo = /\/(videos|watch|reel)\b/.test(u.pathname) || host.includes("fb.watch") || u.searchParams.has("v");
    return {
      ...base, provider: "Facebook", previewType: "facebook", isVideo: looksVideo, domain,
      canEmbed: looksVideo,
      embedUrl: looksVideo ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false` : undefined,
    };
  }

  // Generic website — no inline embed, show a card
  return { ...base, provider: domain, previewType: "website", canEmbed: false, domain };
}

/** Whether a detected link renders via <iframe> (vs <video>/<img>). */
export function usesIframe(info: LinkInfo): boolean {
  return ["youtube", "vimeo", "drive", "tiktok", "facebook", "instagram", "pdf"].includes(info.previewType);
}
