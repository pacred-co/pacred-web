/**
 * Pacred Services Reviews — shared catalog (data layer).
 *
 * **Client-safe + server-safe** — no `"use client"`, no React, no
 * `server-only`. Imported by:
 *   - `components/sections/reviews.tsx` (`"use client"` homepage carousel)
 *   - `app/[locale]/(public)/reviews/[id]/page.tsx` (server landing page)
 *   - `lib/reviews/content.ts` (server-only SEO prose generator)
 *
 * The card's **short** labels (title / tags / type) still come from the
 * `reviews` i18n namespace in `messages/{th,en}.json` — this file owns only
 * the **data** (which reviews exist, their type/mode/term, cover image).
 * The **long-form, keyword-rich** SEO copy for each `/reviews/[id]` landing
 * page lives in `lib/reviews/content.ts` (`getReviewContent`).
 */

export type ServiceType = "import" | "export" | "clearance";

export type TitleKey =
  | "titleFcl"
  | "titleLcl"
  | "titleClearance"
  | "titleAirClearance";

export type TagKey =
  | "tagFcl"
  | "tagLcl"
  | "tagSea"
  | "tagRoad"
  | "tagAir"
  | "tagExpress"
  | "tagDdp"
  | "tagCif";

export type Review = {
  id: string;
  type: ServiceType;
  titleKey: TitleKey;
  rating: number;
  tagKeys: TagKey[];
  image?: string;
};

export const REVIEWS: Review[] = [
  // ─── FCL (Import) ──────────────────────────────────────
  { id: "fcl-1",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/1.jpg"  },
  { id: "fcl-2",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagRoad", "tagDdp"], image: "/images/review/fcl/2.jpg"  },
  { id: "fcl-3",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/3.jpg"  },
  { id: "fcl-4",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/4.jpg"  },
  { id: "fcl-5",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/5.jpg"  },
  { id: "fcl-6",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/6.jpg"  },
  { id: "fcl-7",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/7.jpg"  },
  { id: "fcl-8",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/8.jpg"  },
  { id: "fcl-9",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/9.jpg"  },
  { id: "fcl-10", type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/10.jpg" },
  { id: "fcl-11", type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/11.jpg" },
  { id: "fcl-12", type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/12.jpg" },

  // ─── LCL (Import) ──────────────────────────────────────
  { id: "lcl-1",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagCif"],  image: "/images/review/lcl/1.jpg"  },
  { id: "lcl-2",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagDdp"],  image: "/images/review/lcl/2.jpg"  },
  { id: "lcl-3",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagCif"],  image: "/images/review/lcl/3.jpg"  },
  { id: "lcl-4",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagDdp"],  image: "/images/review/lcl/4.jpg"  },
  { id: "lcl-5",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagRoad", "tagCif"], image: "/images/review/lcl/5.jpg"  },
  { id: "lcl-6",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagRoad", "tagDdp"], image: "/images/review/lcl/6.jpg"  },
  { id: "lcl-7",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagCif"],  image: "/images/review/lcl/7.jpg"  },
  { id: "lcl-8",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagDdp"],  image: "/images/review/lcl/8.jpg"  },

  // ─── Clearance ────────────────────
  { id: "clr-1",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad", "tagCif"], image: "/images/review/clearance/1.jpg"  },
  { id: "clr-2",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad"],            image: "/images/review/clearance/2.jpg"  },
  { id: "clr-3",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea", "tagCif"],   image: "/images/review/clearance/3.jpg"  },
  { id: "clr-4",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea", "tagCif"],   image: "/images/review/clearance/4.jpg"  },
  { id: "clr-5",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad"],            image: "/images/review/clearance/5.jpg"  },
  { id: "clr-7",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad"],            image: "/images/review/clearance/7.jpg"  },
  { id: "clr-10", type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea", "tagCif"],   image: "/images/review/clearance/10.jpg" },
  { id: "clr-11", type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad", "tagCif"],  image: "/images/review/clearance/11.jpg" },
  { id: "clr-12", type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea"],             image: "/images/review/clearance/12.jpg" },

  // ─── Air Clearance ───
  { id: "clr-air-6", type: "clearance", titleKey: "titleAirClearance", rating: 5, tagKeys: ["tagAir", "tagExpress", "tagDdp"], image: "/images/review/clearance/6.jpg" },
  { id: "clr-air-8", type: "clearance", titleKey: "titleAirClearance", rating: 5, tagKeys: ["tagAir", "tagExpress", "tagDdp"], image: "/images/review/clearance/8.jpg" },
  { id: "clr-air-9", type: "clearance", titleKey: "titleAirClearance", rating: 5, tagKeys: ["tagAir", "tagExpress", "tagDdp"], image: "/images/review/clearance/9.jpg" },
];

export function getReviewById(id: string): Review | undefined {
  return REVIEWS.find((r) => r.id === id);
}

/**
 * Related cases for the "ผลงานอื่นๆ" panel on a `/reviews/[id]` page.
 * Prefer same `titleKey` (most relevant), then top up with other reviews so
 * the panel is always full even for sparse categories.
 */
export function getRelatedReviews(id: string, limit = 6): Review[] {
  const current = getReviewById(id);
  if (!current) return REVIEWS.slice(0, limit);

  const sameTitle = REVIEWS.filter(
    (r) => r.id !== id && r.titleKey === current.titleKey,
  );
  const others = REVIEWS.filter(
    (r) => r.id !== id && r.titleKey !== current.titleKey,
  );
  return [...sameTitle, ...others].slice(0, limit);
}
