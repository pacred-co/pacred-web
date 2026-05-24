import type { MetadataRoute } from "next";
import { SITE_LOCALES, SITE_URL, absoluteUrl, type SiteLocale } from "@/components/seo/site";
import { KNOWLEDGE_ARTICLES } from "@/lib/knowledge-articles";
import { CUSTOMS_PORTS } from "@/components/sections/customs-port-data";
import { ALL_NEWS as PACRED_NEWS } from "@/lib/news/all";

type Freq = MetadataRoute.Sitemap[number]["changeFrequency"];

type Route = {
  path: string;
  priority: number;
  changeFrequency: Freq;
};

const STATIC_ROUTES: Route[] = [
  { path: "/",                            priority: 1.0, changeFrequency: "weekly"  },
  { path: "/services",                    priority: 0.9, changeFrequency: "monthly" },
  { path: "/services/import-china",       priority: 0.9, changeFrequency: "monthly" },
  { path: "/services/import-china-fcl",   priority: 0.9, changeFrequency: "monthly" },
  { path: "/services/import-china-lcl",   priority: 0.9, changeFrequency: "monthly" },
  { path: "/customs-clearance-shipping-suvarnabhumi",  priority: 0.9, changeFrequency: "monthly" },
  { path: "/services/export-worldwide",   priority: 0.9, changeFrequency: "monthly" },
  { path: "/services/china-shopping",     priority: 0.9, changeFrequency: "monthly" },
  { path: "/about",                       priority: 0.7, changeFrequency: "monthly" },
  { path: "/contact",                     priority: 0.7, changeFrequency: "monthly" },
  { path: "/booking",                     priority: 0.7, changeFrequency: "monthly" },
  { path: "/knowledge",                   priority: 0.8, changeFrequency: "weekly"  },
  { path: "/news",                        priority: 0.8, changeFrequency: "weekly"  },
  { path: "/faq",                         priority: 0.7, changeFrequency: "monthly" },
  { path: "/warehouses/china",            priority: 0.7, changeFrequency: "monthly" },
  { path: "/warehouses/guangzhou",        priority: 0.6, changeFrequency: "monthly" },
  { path: "/warehouses/yiwu",             priority: 0.6, changeFrequency: "monthly" },
  { path: "/warehouses/thailand",         priority: 0.6, changeFrequency: "monthly" },
  { path: "/payment/alipay",              priority: 0.6, changeFrequency: "monthly" },
  { path: "/payment/1688",                priority: 0.6, changeFrequency: "monthly" },
  { path: "/payment/taobao",              priority: 0.6, changeFrequency: "monthly" },
  { path: "/how-to-use",                  priority: 0.6, changeFrequency: "monthly" },
  { path: "/delivery-areas",              priority: 0.5, changeFrequency: "monthly" },
  { path: "/holidays",                    priority: 0.4, changeFrequency: "yearly"  },
  { path: "/join-us",                     priority: 0.5, changeFrequency: "monthly" },
  { path: "/terms",                       priority: 0.3, changeFrequency: "yearly"  },
  { path: "/privacy",                     priority: 0.3, changeFrequency: "yearly"  },
];

function entry(path: string, opts: Omit<Route, "path">): MetadataRoute.Sitemap[number] {
  const languages = SITE_LOCALES.reduce(
    (acc, l) => ({ ...acc, [l]: absoluteUrl(path, l as SiteLocale) }),
    {} as Record<string, string>,
  );
  return {
    url: absoluteUrl(path, "th"),
    lastModified: new Date(),
    priority: opts.priority,
    changeFrequency: opts.changeFrequency,
    alternates: { languages },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_URL || SITE_URL === "http://localhost:3000") {
    // Still emit a sitemap in dev — just leaves localhost URLs that crawlers ignore
  }

  const staticEntries = STATIC_ROUTES.map((r) =>
    entry(r.path, { priority: r.priority, changeFrequency: r.changeFrequency }),
  );

  const articleEntries = KNOWLEDGE_ARTICLES.map((a) =>
    entry(`/knowledge/${a.slug}`, { priority: 0.7, changeFrequency: "monthly" }),
  );

  // Per-port customs detail pages — one per CUSTOMS_PORTS slug
  const portEntries = CUSTOMS_PORTS.map((p) =>
    entry(`/customs-clearance-shipping-suvarnabhumi/${p.slug}`, {
      priority: 0.85,
      changeFrequency: "monthly",
    }),
  );

  // Pacred News detail pages — one per PACRED_NEWS slug
  const newsEntries = PACRED_NEWS.map((n) =>
    entry(`/news/${n.slug}`, { priority: 0.7, changeFrequency: "monthly" }),
  );

  return [...staticEntries, ...articleEntries, ...portEntries, ...newsEntries];
}
