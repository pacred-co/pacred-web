"use client";

/**
 * Central link/video preview (owner brief §5). Tries to embed a video/iframe/
 * image/pdf inline; if the provider can't embed, falls back to a card with the
 * link + open/copy buttons. NEVER throws — used in form, calendar, library,
 * result. Heavy embeds (iframe/video) load only after the user clicks Play.
 */
import { useState } from "react";
import { Check, Copy, ExternalLink, Film, FileText, Globe, Image as ImageIcon, Play } from "lucide-react";
import { detectLink, usesIframe, type LinkInfo, type PreviewType } from "@/lib/marketing-planner/link-preview";
import { cx, iconBtn } from "./ui";

function TypeIcon({ type, className }: { type: PreviewType; className?: string }) {
  switch (type) {
    case "image": return <ImageIcon className={className} />;
    case "pdf": return <FileText className={className} />;
    case "website":
    case "unknown": return <Globe className={className} />;
    default: return <Film className={className} />;
  }
}

function openUrl(url: string) {
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

/** Reusable open + copy buttons for any link (used in list rows). */
export function LinkActions({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — open is still available */
    }
  };
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)}>
      <button type="button" className={iconBtn} title="เปิดลิงก์" onClick={() => openUrl(url)}>
        <ExternalLink className="h-4 w-4" />
      </button>
      <button type="button" className={iconBtn} title={copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"} onClick={copy}>
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </span>
  );
}

function EmbedSurface({ info, title }: { info: LinkInfo; title?: string }) {
  if (info.previewType === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={info.embedUrl || info.raw} alt={title || "preview"} className="max-h-[420px] w-full rounded-lg object-contain" />;
  }
  if ((info.previewType === "video" || info.previewType === "dropbox") && info.embedUrl) {
    return <video src={info.embedUrl} controls autoPlay className="aspect-video w-full rounded-lg bg-black" />;
  }
  if (usesIframe(info) && info.embedUrl) {
    return (
      <iframe
        src={info.embedUrl}
        title={title || info.provider}
        className="aspect-video w-full rounded-lg border-0 bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }
  return null;
}

/**
 * @param compact  list-row mode: a slim card, preview opens on demand.
 */
export function LinkPreview({ url, title, compact = false, autoActivate = false }: { url: string; title?: string; compact?: boolean; autoActivate?: boolean }) {
  const info = detectLink(url);
  const [active, setActive] = useState(autoActivate);

  if (!url.trim()) return null;

  // Images embed directly — no Play step.
  const directImage = info.previewType === "image" && info.canEmbed;
  const showEmbed = (active && info.canEmbed) || directImage;

  if (showEmbed) {
    return (
      <div className="space-y-1.5">
        <EmbedSurface info={info} title={title} />
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <TypeIcon type={info.previewType} className="h-3.5 w-3.5" /> {info.provider}
          </span>
          <LinkActions url={url} />
        </div>
      </div>
    );
  }

  // Facade: thumbnail (if any) or a card; Play loads the embed.
  return (
    <div className={cx("overflow-hidden rounded-lg border border-border bg-white dark:bg-surface", compact ? "" : "")}>
      <div className={cx("flex items-stretch", compact ? "gap-2" : "gap-3")}>
        <button
          type="button"
          onClick={() => (info.canEmbed ? setActive(true) : openUrl(url))}
          className={cx(
            "relative flex shrink-0 items-center justify-center bg-primary-50 text-primary-600 dark:bg-primary-900/30",
            compact ? "h-14 w-20" : "h-24 w-40",
          )}
          title={info.canEmbed ? "เล่น / แสดงตัวอย่าง" : "เปิดลิงก์"}
          style={info.thumbnail ? { backgroundImage: `url(${info.thumbnail})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {info.isVideo || info.canEmbed ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow">
              <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
            </span>
          ) : (
            <TypeIcon type={info.previewType} className={compact ? "h-5 w-5" : "h-7 w-7"} />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5 pr-2">
          <p className="truncate text-[12px] font-semibold text-foreground">{title || info.provider}</p>
          <p className="truncate text-[11px] text-muted">{info.provider}{info.domain ? ` · ${info.domain}` : ""}</p>
          {!info.canEmbed && <p className="text-[10px] text-muted">เล่นในระบบไม่ได้ — เปิดดูจากลิงก์ได้</p>}
          <div className="mt-0.5 flex items-center gap-1">
            {info.canEmbed && (
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-50" onClick={() => setActive(true)}>
                <Play className="h-3 w-3" /> แสดงตัวอย่าง
              </button>
            )}
            <LinkActions url={url} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Alias — same component handles video (owner brief names both). */
export const VideoPreview = LinkPreview;
