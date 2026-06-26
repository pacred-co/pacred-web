import type { Metadata } from "next";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { ArticleListTabs } from "@/components/sections/article-list-tabs";
import { VideoGallery, type GalleryVideo } from "@/components/sections/video-gallery";
import { getPublishedVideoArticles } from "@/lib/cms/articles";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { SITE_URL, SOCIAL } from "@/components/seo/site";
import { setRequestLocale } from "next-intl/server";
import { Play } from "lucide-react";

// Reads cookies (NavBar) + the CMS, so render per-request (mirrors /our-work).
export const dynamic = "force-dynamic";

const PATH = "/videos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isTh = locale !== "en";
  const path = isTh ? PATH : `/en${PATH}`;
  const title = isTh
    ? "วิดีโอ Pacred Shipping — นำเข้า ส่งออก เคลียร์ศุลกากร"
    : "Pacred Shipping Videos — import, export, customs clearance";
  const description = isTh
    ? "รวมวิดีโอจากทีม Pacred Shipping — งานจริง เคลียร์สินค้าติดด่าน นำเข้า-ส่งออก พาชมโรงงาน และเคล็ดลับนำเข้าสินค้าจีน"
    : "Videos from the Pacred Shipping team — real customs clearance, import-export, factory tours, and China-import tips.";
  return {
    title,
    description,
    alternates: { canonical: path, languages: { "th-TH": PATH, "en-US": `/en${PATH}`, "x-default": PATH } },
    openGraph: { title, description, url: `${SITE_URL}${path}`, type: "website" },
  };
}

// Curated Pacred videos (the real channel uploads already featured on the home
// clips section) — guarantees the page has content; CMS video articles append.
const CURATED_VIDEOS: GalleryVideo[] = [
  { kind: "youtube", id: "0kK32T-6wHw", title: "Pacred Shipping — เคลียร์สินค้าติดด่าน (ดูทีมงานทำงานจริง)", badge: "แนะนำ" },
  { kind: "youtube", id: "oTVkgUuAzsk", title: "ทีม Pacred Shipping — ลุยทุกด่าน", badge: "ใหม่" },
  { kind: "youtube", id: "Qi7yFVGakGM", title: 'นำเข้าผิดชีวิต "เสี่ยง" — ของเล่นและเครื่องใช้ไฟฟ้า', badge: "ต้องรู้" },
  { kind: "youtube", id: "xSxUksThsh8", title: 'พาบุกโรงงาน "Manas Automation" — ที่ต่างชาติยังต้องจ้างผลิต', badge: "พาชม" },
  { kind: "youtube", id: "z6rcn18Wb-w", title: "เคล็ดลับนำเข้าสินค้าจีน — ครบจบในที่เดียว Pacred Shipping", badge: "เคล็ดลับ" },
];

/** Pull an 11-char YouTube id from a raw id or any YouTube URL form. */
function youtubeId(input: string): string | null {
  const s = (input ?? "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

export default async function VideosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Establish the request locale so the layout's NextIntlClientProvider resolves
  // for client components (NavBar) — matches the getTranslations() the sibling
  // listing pages call. Without it, NavBar's useTranslations has no context.
  setRequestLocale(locale);
  const isTh = locale !== "en";

  // CMS video articles (any category that carries a videoUrl) → gallery items,
  // de-duped against the curated list by YouTube id. Fail-soft to [].
  const dbArticles = await getPublishedVideoArticles();
  const curatedIds = new Set(CURATED_VIDEOS.flatMap((v) => (v.kind === "youtube" ? [v.id] : [])));
  const cmsVideos: GalleryVideo[] = dbArticles.flatMap((a): GalleryVideo[] => {
    if (!a.videoUrl) return [];
    const id = youtubeId(a.videoUrl);
    if (id) {
      if (curatedIds.has(id)) return []; // dedupe vs curated
      curatedIds.add(id);
      return [{ kind: "youtube", id, title: a.title, badge: a.subCategory || undefined }];
    }
    // uploaded clip (non-YouTube URL) → <video> player, cover as poster
    return [{ kind: "file", src: a.videoUrl, poster: a.coverUrl || undefined, title: a.title, badge: a.subCategory || undefined }];
  });
  const videos = [...cmsVideos, ...CURATED_VIDEOS];

  const ui = isTh
    ? {
        eyebrow: "VIDEO",
        heading: "วิดีโอ Pacred",
        subheading:
          "ดูทีมงาน Pacred ทำงานจริง — เคลียร์สินค้าติดด่าน นำเข้า-ส่งออก พาชมโรงงาน และเคล็ดลับนำเข้าสินค้าจีน",
        channel: "ดูทั้งหมดที่ช่อง YouTube",
        count: (n: number) => `${n} วิดีโอ`,
        emptyTitle: "ยังไม่มีวิดีโอในระบบ",
        emptyBody: "ติดตามวิดีโอใหม่ๆ ได้ที่ช่อง YouTube ของ Pacred Shipping",
        home: "หน้าหลัก",
        crumb: "วิดีโอ",
      }
    : {
        eyebrow: "VIDEO",
        heading: "Pacred Videos",
        subheading:
          "Watch the Pacred team at work — real customs clearance, import-export, factory tours, and China-import tips.",
        channel: "Watch all on YouTube",
        count: (n: number) => `${n} videos`,
        emptyTitle: "No videos yet",
        emptyBody: "Follow our YouTube channel for new Pacred Shipping videos.",
        home: "Home",
        crumb: "Videos",
      };

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema(
            [
              { name: ui.home, path: "/" },
              { name: ui.crumb, path: PATH },
            ],
            isTh ? "th" : "en",
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative pb-10 pt-6 md:pb-16 md:pt-10">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">
            {/* Header */}
            <div className="mx-auto w-full max-w-[1120px] text-center md:text-left">
              <div className="mb-2 inline-flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.08em] text-primary-600">
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary-600" />
                {ui.eyebrow}
              </div>
              <h1 className="text-[28px] font-black leading-[1.15] tracking-[-0.04em] text-[#111827] md:text-[42px] dark:text-white">
                {ui.heading}
              </h1>
              <p className="mx-auto mt-3 max-w-[760px] text-[14px] leading-[1.6] text-muted md:mx-0 md:text-[16px]">
                {ui.subheading}
              </p>

              {/* Tab switcher */}
              <div className="mt-5 flex justify-center md:mt-6 md:justify-start">
                <ArticleListTabs active="videos" />
              </div>

              {/* Count + YouTube channel CTA */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:mt-6 md:justify-start">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-[12px] font-black text-[#111827] md:h-9 md:px-3.5 md:text-[13px] dark:bg-surface dark:text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-600" />
                  {ui.count(videos.length)}
                </span>
                <a
                  href={SOCIAL.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FF0000] px-3.5 text-[12px] font-black text-white shadow-[0_4px_12px_rgba(255,0,0,0.25)] transition-all duration-300 hover:scale-[1.03] md:h-9 md:px-4 md:text-[13px]"
                >
                  <Play className="h-4 w-4 fill-white" strokeWidth={0} />
                  {ui.channel}
                </a>
              </div>
            </div>

            {/* Video grid (or empty state) */}
            <div className="mx-auto mt-6 w-full max-w-[1120px] md:mt-10">
              {videos.length > 0 ? (
                <VideoGallery videos={videos} />
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white px-6 py-14 text-center dark:bg-surface">
                  <Play className="h-10 w-10 fill-primary-600 text-primary-600" strokeWidth={0} />
                  <p className="text-[16px] font-black text-[#111827] dark:text-white">{ui.emptyTitle}</p>
                  <p className="max-w-[420px] text-[13px] text-muted">{ui.emptyBody}</p>
                  <a
                    href={SOCIAL.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FF0000] px-4 text-[13px] font-black text-white transition-all duration-300 hover:scale-[1.03]"
                  >
                    <Play className="h-4 w-4 fill-white" strokeWidth={0} />
                    {ui.channel}
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>

        <HomeBottomBanner />
      </main>
      <Footer />
    </>
  );
}
