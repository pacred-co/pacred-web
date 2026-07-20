"use client";

import type { ReactNode } from "react";
import {
  Star, BadgeCheck, ArrowRight, Navigation, Truck, MapPin, Clock, Package, Users,
  FileText, Hash, Boxes, Route, Plane, Ship, Zap, FileCheck, Sparkles, Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CaseGallery } from "@/app/[locale]/(public)/our-work/[id]/case-gallery";
import { ArticleContent } from "@/components/knowledge/article-content";

/**
 * The ONE rendering of a CMS "ผลงานของเรา" case body — shared by the live page
 * (`/our-work/[id]`) and the admin editor's live preview.
 *
 * Owner 2026-07-20: "preview หรือ ที่ทำจริงจะต้องหน้าตาแบบในเว็ป". Before this,
 * `article-preview.tsx` carried a 337-line hand-written LOOKALIKE of the case
 * page ("mirrors /our-work/[id]") — two implementations of the same design that
 * had to be edited in lockstep. They had already drifted: the live page moved to
 * the hotel-style CaseGallery mosaic and grew a route chip, the preview kept its
 * own older gallery. One component means the preview can never lie again.
 *
 * Page-only chrome (breadcrumb · comments · related cases · JSON-LD · NavBar)
 * deliberately stays on the page — the preview has nothing to show for it.
 *
 * `stats`       live page passes <ArticleStats>; preview passes nothing (a view
 *               counter needs a saved slug + a DB row, which a draft has neither).
 * `interactive` false in the preview → tag chips + the LINE button render as
 *               plain chips, so a click inside the iframe can't navigate it away.
 */

const H3 = "text-[16px] md:text-[18px] font-black tracking-[-0.02em] text-[#111827] dark:text-white";

/** Trip-style icon per shipment-detail label (keyword match · safe fallback). */
export function factIcon(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (l.includes("สาย") || l.includes("การบิน") || l.includes("airline") || l.includes("flight")) return Plane;
  if (l.includes("บริการ") || l.includes("ช่องทาง") || l.includes("service") || l.includes("mode")) return Route;
  if (l.includes("term")) return FileText;
  if (l.includes("port") || l.includes("เส้นทาง") || l.includes("route")) return Navigation;
  if (l.includes("เขต") || l.includes("จัดส่ง") || l.includes("zone") || l.includes("delivery")) return MapPin;
  if (l.includes("รถ") || l.includes("ขนส่ง") || l.includes("truck") || l.includes("carrier")) return Truck;
  if (l.includes("แรงงาน") || l.includes("labor") || l.includes("labour")) return Users;
  if (l.includes("คลัง") || l.includes("โกดัง") || l.includes("warehouse")) return Warehouse;
  if (l.includes("สินค้า") || l.includes("product") || l.includes("goods")) return Package;
  if (l.includes("เวลา") || l.includes("ระยะ") || l.includes("duration") || l.includes("lead") || l.includes("time")) return Clock;
  if (l.includes("hs")) return Hash;
  return Boxes;
}

export function tagIcon(tag: string): LucideIcon {
  const l = tag.toLowerCase();
  if (l.includes("แอร์") || l.includes("air") || l.includes("อากาศ")) return Plane;
  if (l.includes("เรือ") || l.includes("sea") || l.includes("lcl") || l.includes("fcl")) return Ship;
  if (l.includes("รถ") || l.includes("road") || l.includes("truck")) return Truck;
  if (l.includes("ด่วน") || l.includes("express") || l.includes("fast")) return Zap;
  if (l.includes("ddp") || l.includes("cif") || l.includes("fob") || l.includes("dap")) return FileCheck;
  return Sparkles;
}

// Split flat facts into Trip-style labelled groups by matching each label.
// Unmatched facts fall into a "more details" group — which is why the editor
// offers CASE_FACT_LABELS as presets (an off-pattern label lands here).
const FACT_GROUPS: { key: string; th: string; en: string; test: RegExp }[] = [
  { key: "route", th: "เส้นทาง & การขนส่ง", en: "Route & transport", test: /บริการ|ช่องทาง|service|mode|port|เส้นทาง|route|รถ|ขนส่ง|truck|carrier|เวลา|ระยะ|duration|lead|time|สาย|การบิน|airline|เรือ|vessel|liner|แอร์|คลัง|โกดัง|warehouse/ },
  { key: "goods", th: "สินค้า & การจัดส่ง", en: "Goods & delivery", test: /สินค้า|product|goods|ประเภท|term|เทอม|hs|พิกัด|อากร|duty|vat|ภาษี|tariff|เขต|จัดส่ง|zone|delivery|แรงงาน|labou?r|ปลายทาง/ },
];

export function groupCaseFacts<T extends { label: string }>(facts: T[]): { key: string; th: string; en: string; items: T[] }[] {
  const buckets = FACT_GROUPS.map((g) => ({ key: g.key, th: g.th, en: g.en, items: [] as T[] }));
  const other: T[] = [];
  for (const f of facts) {
    const idx = FACT_GROUPS.findIndex((g) => g.test.test(f.label.toLowerCase()));
    if (idx >= 0) buckets[idx].items.push(f);
    else other.push(f);
  }
  const out = buckets.filter((b) => b.items.length > 0);
  if (other.length) out.push({ key: "other", th: "รายละเอียดเพิ่มเติม", en: "More details", items: other });
  return out;
}

export type CaseArticleBodyProps = {
  title: string;
  excerpt: string;
  body: string;
  /** cover first, then the gallery — the order the mosaic lays out. */
  galleryImages: string[];
  videoUrl?: string | null;
  tags: string[];
  caseRoute: string;
  caseFacts: { label: string; value: string }[];
  casePrice: string;
  rating: number;
  ratedCount: number;
  locale: "th" | "en";
  stats?: ReactNode;
  interactive?: boolean;
};

export function CaseArticleBody({
  title, excerpt, body, galleryImages, videoUrl, tags, caseRoute, caseFacts,
  casePrice, rating, ratedCount, locale, stats = null, interactive = true,
}: CaseArticleBodyProps) {
  const en = locale === "en";
  const ratingWord = en
    ? rating >= 4.5 ? "Excellent" : rating >= 3.5 ? "Very good" : "Good"
    : rating >= 4.5 ? "ยอดเยี่ยม" : rating >= 3.5 ? "ดีมาก" : "ดี";
  const ui = en
    ? { quoteFree: "Get a free quote", priceLead: "Quote based on the job", fastReply: "Free consult · fast reply", verified: "Real Pacred case", startPrice: "Starting price" }
    : { quoteFree: "ขอใบเสนอราคาฟรี", priceLead: "ราคาประเมินตามงาน", fastReply: "ปรึกษาฟรี · ทีมงานตอบกลับเร็ว", verified: "ผลงานจริงของ Pacred", startPrice: "ราคาเริ่มต้น" };

  const chipCls =
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-3 py-1.5 text-[12.5px] font-bold text-foreground dark:bg-surface";

  return (
    <>
      {/* ── HEADER (Trip-style · title + stats above the gallery) ── */}
      <header className="mb-3 md:mb-4 md:flex md:items-start md:justify-between md:gap-4">
        <h1 className="text-[22px] font-black leading-[1.2] tracking-[-0.03em] text-[#111827] dark:text-white md:text-[30px]">
          {title || (en ? "Untitled case" : "ยังไม่ได้ตั้งหัวข้อ")}
        </h1>
        {/* md:pr-20 = เว้นทางให้แถบเมนูลอยขวา (fixed right-0 · 64px, xl 72px · z-50)
            ไม่ทับปุ่มจนกดไม่ได้ — max-w-1140 ชนแถบนี้ทุกจอที่แคบกว่า ~1290px. */}
        {stats ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] font-bold text-muted md:mt-2 md:shrink-0 md:pr-20 min-[1290px]:pr-0">
            {stats}
          </div>
        ) : null}
      </header>

      {/* ── GALLERY (hotel-style mosaic · frameless) ── */}
      {galleryImages.length > 0 || videoUrl ? (
        <CaseGallery images={galleryImages} alt={title} videoUrl={videoUrl} />
      ) : null}

      {/* ── 2-COLUMN · content left (chips + score + facts) · sticky booking right ── */}
      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_minmax(0,340px)] md:gap-8">
        <div className="min-w-0">
          {/* HIGHLIGHT chips (tags · มือถือแถวเดียวเลื่อน) */}
          {tags.length > 0 ? (
            <div className="mb-4 flex gap-2 overflow-x-auto flex-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
              {tags.map((tg) => {
                const Ic = tagIcon(tg);
                const inner = <><Ic className="h-4 w-4 text-primary-600" strokeWidth={2.2} /> {tg}</>;
                return interactive ? (
                  <Link key={tg} href={`/our-work?tag=${encodeURIComponent(tg)}`} className={`${chipCls} transition hover:border-primary-300 hover:text-primary-700`}>
                    {inner}
                  </Link>
                ) : (
                  <span key={tg} className={chipCls}>{inner}</span>
                );
              })}
            </div>
          ) : null}

          {/* Route chip */}
          {caseRoute ? (
            <div className={`mb-4 ${chipCls}`}>
              <Navigation className="h-4 w-4 text-primary-600" strokeWidth={2.2} /> {caseRoute}
            </div>
          ) : null}

          {/* Score block (Trip's 9.3 · highlight snippet beside · ไม่โล่ง) */}
          <section className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-4">
              <div className="flex shrink-0 flex-col items-center rounded-xl bg-primary-700 px-4 py-2.5 text-white">
                <span className="text-[28px] font-black leading-none tabular-nums">{rating.toFixed(1)}</span>
                <span className="mt-0.5 text-[11px] font-bold text-white/75">/ 5</span>
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-black text-primary-700 dark:text-primary-300">{ratingWord}</p>
                <div className="mt-1 flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={["h-4 w-4", i < Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-300 dark:fill-surface dark:text-surface-alt"].join(" ")} strokeWidth={1.8} />
                  ))}
                </div>
                <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.6} />
                  {ratedCount > 0 ? `${ratedCount} ${en ? "reviews" : "รีวิว"}` : ui.verified}
                </p>
              </div>
            </div>
            {excerpt ? (
              <p className="text-[13.5px] font-medium leading-relaxed text-foreground/80 sm:flex-1 sm:border-l sm:border-border sm:pl-4 sm:line-clamp-3">
                {excerpt}
              </p>
            ) : null}
          </section>

          {/* ข้อมูลขนส่ง — Trip-style · split into labelled groups */}
          {groupCaseFacts(caseFacts).map((g) => (
            <section key={g.key} className="border-t border-border py-4">
              <h2 className={H3}>{en ? g.en : g.th}</h2>
              <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
                {g.items.map((f, i) => {
                  const Ic = factIcon(f.label);
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/25 dark:text-primary-300">
                        <Ic className="h-4 w-4" strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{f.label}</p>
                        <p className="text-[14px] font-black text-foreground">{f.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Body content */}
          {body.trim() ? (
            <section className="border-t border-border py-5">
              <ArticleContent text={body} title={title} />
            </section>
          ) : null}
        </div>

        {/* Sticky booking card */}
        <aside className="self-start md:sticky md:top-24">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-[0_12px_32px_-14px_rgba(15,23,42,0.22)] dark:bg-surface">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{casePrice ? ui.startPrice : ui.priceLead}</p>
            <p className="mt-0.5 text-[26px] font-black leading-tight tracking-[-0.02em] text-primary-600">{casePrice || ui.quoteFree}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              {en
                ? "Pacred team offers free consultation for China import, customs clearance and last-mile delivery"
                : "ทีมงาน Pacred พร้อมให้คำปรึกษาฟรี ตั้งแต่นำเข้าจีน เคลียร์ศุลกากร ถึงปลายทาง"}
            </p>
            {interactive ? (
              <Link href="/line" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-[14px] font-black text-white shadow-[0_8px_18px_rgba(179,0,0,0.28)] transition-all duration-300 hover:scale-[1.02] hover:bg-primary-700 active:scale-95">
                ทักไลน์ Pacred <ArrowRight className="h-4 w-4" strokeWidth={3} />
              </Link>
            ) : (
              <span className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-[14px] font-black text-white shadow-[0_8px_18px_rgba(179,0,0,0.28)]">
                ทักไลน์ Pacred <ArrowRight className="h-4 w-4" strokeWidth={3} />
              </span>
            )}
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.8} />
              {ui.fastReply}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
