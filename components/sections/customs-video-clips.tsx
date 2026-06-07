"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Play, ArrowRight } from "lucide-react";

type Video = {
  id: string;
  title: string;
  sub: string;
  badge?: string;
};

const YOUTUBE_CHANNEL = "https://www.youtube.com/@PacredShipping";

const BIG_VIDEO: Video = {
  id: "0kK32T-6wHw",
  title: "Pacred Shipping — เคลียร์สินค้าติดด่าน",
  sub: "ดูทีมงาน Pacred ทำงานจริง — เคลียร์ของจริง",
  badge: "แนะนำ",
};

const SIDE_VIDEOS: Video[] = [
  {
    id: "oTVkgUuAzsk",
    title: "ทีม Pacred Shipping — ลุยทุกด่าน",
    sub: "Shorts",
    badge: "ใหม่",
  },
  {
    id: "Qi7yFVGakGM",
    title: 'นำเข้าผิดชีวิต "เสี่ยง" — อยากนำเข้าของเล่นและเครื่องใช้ไฟฟ้า',
    sub: "เตือนภัยนำเข้าผิด",
    badge: "ต้องรู้",
  },
  {
    id: "xSxUksThsh8",
    title: 'พาบุกโรงงาน "Manas Automation" — ที่ต่างชาติยังต้องจ้างผลิต',
    sub: "ลุยโรงงานเครื่องจักร",
    badge: "พาชม",
  },
  {
    id: "z6rcn18Wb-w",
    title: "เคล็ดลับนำเข้าสินค้าจีน — ครบจบในที่เดียว Pacred Shipping",
    sub: "เคล็ดลับนำเข้า",
    badge: "เคล็ดลับ",
  },
];

const thumbHd = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
const thumbFallback = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
const embed = (id: string) =>
  `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;

function onThumbError(e: React.SyntheticEvent<HTMLImageElement>, id: string) {
  const img = e.currentTarget;
  if (img.src.endsWith("maxresdefault.jpg")) {
    img.src = thumbFallback(id);
  }
}

export function CustomsVideoClips() {
  const [active, setActive] = useState<string | null>(null);
  const t = useTranslations("customsVideoClips");

  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5 flex flex-col gap-4">
        {/* Heading + ดูทั้งหมด button */}
        <div className="mx-auto w-full max-w-[1120px] flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              {t("eyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[30px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
              {t("title")}{" "}
              <span className="text-primary-600">Pacred Shipping</span>
            </h2>
          </div>
          <a
            href={YOUTUBE_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex shrink-0 items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full bg-white text-[#111827] border border-border text-[12px] md:text-[13px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
          >
            {t("viewAll")}
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
          </a>
        </div>

        {/* Video grid — 1 big + 4 stacked */}
        <div className="mx-auto w-full max-w-[1120px] flex flex-col md:flex-row gap-3 md:gap-4">
          <VideoCardBig
            video={BIG_VIDEO}
            isActive={active === BIG_VIDEO.id}
            onPlay={() => setActive(BIG_VIDEO.id)}
          />

          <div className="md:w-[30%] grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-2.5">
            {SIDE_VIDEOS.map((v) => (
              <VideoCardSide
                key={v.id}
                video={v}
                isActive={active === v.id}
                onPlay={() => setActive(v.id)}
              />
            ))}
          </div>
        </div>

        {/* Mobile ดูทั้งหมด */}
        <a
          href={YOUTUBE_CHANNEL}
          target="_blank"
          rel="noopener noreferrer"
          className="sm:hidden mx-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white text-[#111827] border border-border text-[12px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
        >
          {t("viewAll")}
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
        </a>
      </div>
    </section>
  );
}

function VideoCardBig({ video, isActive, onPlay }: { video: Video; isActive: boolean; onPlay: () => void }) {
  const t = useTranslations("customsVideoClips");
  const title = t(`${video.id}.title`);
  if (isActive) {
    return (
      <div className="relative md:w-[70%] aspect-video md:aspect-auto md:min-h-[420px] rounded-xl overflow-hidden bg-black shadow-[0_14px_32px_rgba(15,23,42,0.18)]">
        <iframe
          src={embed(video.id)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPlay}
      suppressHydrationWarning
      className="group relative md:w-[70%] aspect-video md:aspect-auto md:min-h-[420px] rounded-xl overflow-hidden bg-primary-600 shadow-[0_10px_24px_rgba(15,23,42,0.10)] hover:shadow-[0_18px_36px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-1 text-left cursor-pointer"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbHd(video.id)}
        onError={(e) => onThumbError(e, video.id)}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-70"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbHd(video.id)}
        onError={(e) => onThumbError(e, video.id)}
        alt={title}
        className="relative h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="w-[72px] h-[72px] md:w-[88px] md:h-[88px] rounded-full bg-primary-600/95 backdrop-blur flex items-center justify-center shadow-[0_10px_28px_rgba(0,0,0,0.4)] border-[3px] md:border-4 border-white transition-transform duration-300 group-hover:scale-110">
          <Play className="w-7 h-7 md:w-9 md:h-9 text-white fill-white translate-x-[2px]" strokeWidth={0} />
        </span>
      </div>

      {video.badge && (
        <div className="absolute top-4 left-4 inline-flex items-center px-3 py-1 rounded-md bg-primary-600 text-white text-[11px] md:text-[12px] font-black tracking-wide shadow-[0_4px_10px_rgba(0,0,0,0.25)]">
          {t(`${video.id}.badge`)}
        </div>
      )}

      <div className="absolute left-4 right-4 bottom-4 z-10">
        <h3 className="text-white text-[18px] md:text-[24px] font-black leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {title}
        </h3>
        <p className="mt-1 text-white/90 text-[12px] md:text-[14px] font-bold drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
          {t(`${video.id}.sub`)}
        </p>
      </div>
    </button>
  );
}

function VideoCardSide({ video, isActive, onPlay }: { video: Video; isActive: boolean; onPlay: () => void }) {
  const t = useTranslations("customsVideoClips");
  const title = t(`${video.id}.title`);
  if (isActive) {
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black shadow-[0_8px_20px_rgba(15,23,42,0.12)]">
        <iframe
          src={embed(video.id)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPlay}
      suppressHydrationWarning
      className="group relative aspect-video rounded-xl overflow-hidden bg-primary-600 shadow-[0_8px_20px_rgba(15,23,42,0.10)] hover:shadow-[0_14px_28px_rgba(15,23,42,0.16)] hover:-translate-y-1 transition-all duration-300 text-left cursor-pointer"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbHd(video.id)}
        onError={(e) => onThumbError(e, video.id)}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <span className="w-10 h-10 rounded-full bg-primary-600/95 backdrop-blur flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.4)] border-2 border-white">
          <Play className="w-4 h-4 text-white fill-white translate-x-[1px]" strokeWidth={0} />
        </span>
      </div>

      {video.badge && (
        <div className="absolute top-2 left-2 inline-flex items-center px-2 py-0.5 rounded-md bg-primary-600 text-white text-[9.5px] md:text-[10px] font-black tracking-wide shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
          {t(`${video.id}.badge`)}
        </div>
      )}

      <div className="absolute left-2.5 right-2.5 bottom-2 z-10">
        <h3 className="text-white text-[11px] md:text-[12px] font-black leading-[1.25] line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
          {title}
        </h3>
      </div>
    </button>
  );
}
