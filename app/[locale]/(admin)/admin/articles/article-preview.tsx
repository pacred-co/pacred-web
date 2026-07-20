"use client";

/**
 * Live "ตัวอย่างหน้าเว็บจริง" — renders the article EXACTLY as the public detail
 * page shows it, switched by category (owner 2026-06-29 "อยากให้ Preview แสดงผล
 * เหมือนในเว็บจริงๆ คนทำจะได้เข้าใจง่าย"):
 *   knowledge → mirrors /knowledge/[slug] (badge · portrait cover · ArticleContent)
 *   news      → mirrors /news/[slug]      (badge · landscape cover · ArticleContent)
 *   our_work  → mirrors /our-work/[id]    (gallery · video · ⭐rating · ราคา · ข้อมูลเคส)
 *
 * Reuses the SAME <ArticleContent> renderer + badge colours + class patterns as the
 * real pages so the writer sees the true result. Social widgets the writer doesn't
 * control (stats · share · comments · related) are intentionally omitted — this pane
 * is about how the CONTENT looks. Wrapped in a faux-browser frame for clarity.
 */

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Star, Calendar, ArrowRight, Monitor, Smartphone } from "lucide-react";
import { ArticleContent } from "@/components/knowledge/article-content";
import type { CmsCategory } from "@/lib/validators/cms-article";
import { CaseArticleBody } from "@/components/our-work/case-article-body";

const MOBILE_W = 390; // iPhone-ish — the Pacred mobile-first reference viewport

const BADGE: Record<string, string> = {
  // knowledge
  นำเข้า: "bg-primary-50 text-primary-700 border-primary-200",
  เคลียร์: "bg-blue-50 text-blue-700 border-blue-200",
  ส่งออก: "bg-orange-50 text-orange-700 border-orange-200",
  // news
  ข่าวด่วน: "bg-primary-50 text-primary-700 border-primary-200",
  อัปเดตบริการ: "bg-blue-50 text-blue-700 border-blue-200",
  กิจกรรม: "bg-orange-50 text-orange-700 border-orange-200",
};

function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.replace(/<[^>]+>/g, "").length / 600));
}

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export type ArticlePreviewProps = {
  category: CmsCategory;
  title: string;
  excerpt: string;
  coverUrl: string;
  body: string;
  subCategory: string;
  videoUrl: string;
  galleryImages: string[];
  tags: string[];
  casePrice: string;
  caseRating: number | null;
  caseRoute: string;
  caseFacts: { label: string; value: string }[];
};

export function ArticlePreview(props: ArticlePreviewProps) {
  const { category } = props;
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const pathLabel =
    category === "our_work" ? "pacred.co/our-work/…"
    : category === "news" ? "pacred.co/news/…"
    : "pacred.co/knowledge/…";

  // Render the device viewport at its TRUE width inside an iframe, then scale to
  // fit the (narrow) editor pane — so md:/sm: breakpoints resolve per-device and
  // the writer sees the real desktop AND mobile layout, not a squished guess.
  const deviceWidth = mode === "mobile" ? MOBILE_W : 1280;

  const content = (
    <div className="p-4">
      {category === "our_work" ? <OurWorkPreview {...props} /> : <ArticlePagePreview {...props} />}
    </div>
  );

  const tabBtn = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${active ? "bg-primary-600 text-white" : "text-muted hover:bg-surface-alt"}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
      {/* faux-browser frame + device toggle */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-alt/60 px-3 py-2">
        <span className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </span>
        <span className="ml-1 min-w-[80px] flex-1 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-muted dark:bg-background">
          {pathLabel}
        </span>
        {/* คอม / มือถือ */}
        <div className="flex items-center rounded-lg border border-border bg-white p-0.5 dark:bg-background">
          <button type="button" onClick={() => setMode("desktop")} className={tabBtn(mode === "desktop")} title="ดูบนคอมพิวเตอร์">
            <Monitor className="h-3.5 w-3.5" /> คอม
          </button>
          <button type="button" onClick={() => setMode("mobile")} className={tabBtn(mode === "mobile")} title="ดูบนมือถือ">
            <Smartphone className="h-3.5 w-3.5" /> มือถือ
          </button>
        </div>
        <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">ตัวอย่างหน้าเว็บจริง</span>
      </div>

      <div className="bg-surface-alt/30 p-3">
        <div className={mode === "mobile" ? "mx-auto w-full max-w-[420px]" : "w-full"}>
          <ResponsiveFrame deviceWidth={deviceWidth} viewportHeight={mode === "mobile" ? 740 : 820}>
            {content}
          </ResponsiveFrame>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">
          {mode === "mobile" ? "📱 มุมมองมือถือ (กว้าง 390px จริง)" : "🖥 มุมมองคอมพิวเตอร์ (กว้าง 1280px · ย่อให้พอดีช่อง)"}
        </p>
      </div>
    </div>
  );
}

/**
 * Renders children inside a same-origin iframe at a TRUE device width, scaled to
 * fit the available pane. Because the iframe has its own viewport, Tailwind's
 * `md:`/`sm:` (viewport) breakpoints resolve per-device → a real responsive
 * preview. Parent stylesheets + html/body classes (Tailwind + the Prompt font
 * var + theme) are cloned in so it looks identical to the live site.
 */
function ResponsiveFrame({
  deviceWidth,
  viewportHeight,
  children,
}: {
  deviceWidth: number;
  viewportHeight: number;
  children: React.ReactNode;
}) {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);

  // Init the iframe document the instant it attaches. A ref callback runs AFTER
  // the node exists (not during render/effect) so the cross-document DOM sync +
  // the setState here are both fine — we mirror the parent's html/body classes
  // (Prompt font var + theme) + every stylesheet (Tailwind + @font-face) so the
  // article looks identical to the live site.
  const attachIframe = useCallback((el: HTMLIFrameElement | null) => {
    if (!el) {
      setBody(null);
      return;
    }
    const doc = el.contentDocument;
    if (!doc) return;
    doc.documentElement.className = document.documentElement.className;
    doc.body.className = document.body.className;
    doc.body.style.margin = "0";
    doc.body.style.background = "transparent";
    doc.head.querySelectorAll("[data-preview-css]").forEach((n) => n.remove());
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.setAttribute("data-preview-css", "");
      doc.head.appendChild(clone);
    });
    setBody(doc.body);
  }, []);

  // Measure the pane + track resize → scale the device viewport to fit (≤ 1:1).
  // Ref callback returns its cleanup (React 19) to disconnect the observer.
  const attachContainer = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const compute = () => setScale(Math.min(1, el.clientWidth / deviceWidth));
      compute();
      const ro = new ResizeObserver(compute);
      ro.observe(el);
      return () => ro.disconnect();
    },
    [deviceWidth],
  );

  return (
    <div ref={attachContainer} className="w-full overflow-hidden" style={{ height: viewportHeight * scale }}>
      <iframe
        ref={attachIframe}
        title="ตัวอย่างการแสดงผล"
        className="border-0 bg-white dark:bg-surface"
        style={{
          width: deviceWidth,
          height: viewportHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
      {body ? createPortal(children, body) : null}
    </div>
  );
}

/** knowledge + news — the public article detail look. */
function ArticlePagePreview({ category, title, excerpt, coverUrl, body, subCategory }: ArticlePreviewProps) {
  const badge = subCategory || (category === "news" ? "ข่าวด่วน" : "นำเข้า");
  return (
    <article>
      <span className={["inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-black tracking-wider", BADGE[badge] ?? BADGE["นำเข้า"]].join(" ")}>
        {badge}
      </span>
      <h1 className="mt-3 text-[22px] md:text-[28px] font-black leading-[1.2] tracking-[-0.03em] text-[#111827] dark:text-white">
        {title || "หัวข้อบทความ"}
      </h1>
      {excerpt ? <p className="mt-2.5 text-[14px] leading-[1.6] text-muted">{excerpt}</p> : null}

      {/* Meta row — matches the public page */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] font-bold text-muted">
        <span className="inline-flex items-center gap-1.5">
          {category === "news"
            ? <Calendar className="h-3.5 w-3.5 text-primary-600" strokeWidth={2.6} />
            : <span className="h-1.5 w-1.5 rounded-full bg-primary-600" />}
          Pacred Shipping
        </span>
        <span className="text-muted/50">·</span>
        <span>อ่าน {readingMinutes(body)} นาที</span>
      </div>

      {/* Hero cover — portrait 3:4 for knowledge, landscape for news (same as the live pages) */}
      {coverUrl ? (
        <div className={category === "news" ? "mt-5" : "mx-auto mt-5 max-w-[320px]"}>
          <div className={["relative overflow-hidden rounded-2xl border border-border bg-surface-alt", category === "news" ? "aspect-[1280/580]" : "aspect-[3/4]"].join(" ")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
          </div>
        </div>
      ) : null}

      {/* Body — rendered by the SAME component the public page uses */}
      <div className="mt-5">
        {body.trim() ? <ArticleContent text={body} title={title} /> : <p className="text-sm text-muted">— ยังไม่มีเนื้อหา (พิมพ์ในช่อง “เนื้อหา”) —</p>}
      </div>
    </article>
  );
}

/**
 * our_work — renders the REAL case body (components/our-work/case-article-body),
 * the same component /our-work/[id] ships. Not a lookalike: if the live page's
 * gallery/chips/facts change, this changes with it. `interactive={false}` keeps
 * tag + CTA links from navigating the preview iframe away.
 *
 * Wrapped in the live page's own container (max-w-1140 · px-4) so the column
 * widths — and therefore the gallery mosaic — break at the same points.
 */
function OurWorkPreview({
  title, excerpt, coverUrl, body, videoUrl, galleryImages, tags, casePrice, caseRating, caseRoute, caseFacts,
}: ArticlePreviewProps) {
  return (
    <article className="relative pb-8 pt-4">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-6">
        <CaseArticleBody
          title={title}
          excerpt={excerpt}
          body={body}
          galleryImages={[...(coverUrl ? [coverUrl] : []), ...galleryImages]}
          videoUrl={videoUrl}
          tags={tags}
          caseRoute={caseRoute}
          caseFacts={caseFacts}
          casePrice={casePrice}
          rating={caseRating ?? 5}
          ratedCount={0}
          locale="th"
          interactive={false}
        />
      </div>
    </article>
  );
}
