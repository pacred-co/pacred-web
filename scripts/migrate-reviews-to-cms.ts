/**
 * Stage 2 — migrate the 33 hardcoded catalog REVIEWS → cms_articles (our_work)
 * so every "ผลงานของเรา" case becomes back-office editable (Ultra approve → live).
 * Owner ปอน 2026-06-26 ("ย้ายเคสเก่าเข้า CMS ด้วย · TH+EN · CMS เป็น source").
 *
 * Each review → one PUBLISHED our_work article carrying the rich case-pattern
 * fields (mig 0213): title · slug (TH canonical) · cover · gallery · tags ·
 * case_price · case_rating · case_route · case_facts. Body stays empty (the
 * gallery + facts + rating + price ARE the case). Idempotent by slug — re-running
 * skips any slug already present, so it's safe to run twice.
 *
 *   DRY-RUN (default):  tsx --env-file=.env.local scripts/migrate-reviews-to-cms.ts
 *   APPLY:              tsx --env-file=.env.local scripts/migrate-reviews-to-cms.ts --apply
 *
 * Targets whatever NEXT_PUBLIC_SUPABASE_URL points at (DEV on dev machines).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import {
  REVIEWS,
  reviewCanonicalSlug,
  reviewHeading,
  reviewRoute,
  reviewLogisticsFacts,
  reviewGalleryImages,
  reviewProductLabel,
  type Review,
} from "../lib/reviews/catalog";

const APPLY = process.argv.includes("--apply");

// Tag labels (TH) from the reviews i18n namespace — same words the cards show.
const reviewsMsg: Record<string, string> =
  JSON.parse(readFileSync(resolve(process.cwd(), "messages/th.json"), "utf-8")).reviews ?? {};
const tagLabel = (k: string) => reviewsMsg[k] ?? k;

function caseRow(r: Review) {
  const cover = r.image ?? "";
  const gallery = reviewGalleryImages(r).filter((x) => x !== cover);
  const route = reviewRoute(r, "th");
  const product = reviewProductLabel(r, "th");
  // FCL is the only catalog service that publishes a price (= the service page).
  const price = r.titleKey === "titleFcl" ? "เริ่ม $500" : "";
  const tags = [...r.tagKeys.map(tagLabel), product];
  const facts = reviewLogisticsFacts(r, "th").map((f) => ({ label: f.label, value: f.value }));
  const title = reviewHeading(r, "th");
  const excerpt = `${title} — ผลงานจริงของ Pacred · ครบวงจรตั้งแต่ต้นทางจีน เคลียร์พิธีการศุลกากร ถึงปลายทางในไทย`;
  return {
    legacyId: r.id,
    category: "our_work",
    title,
    slug: reviewCanonicalSlug(r),
    excerpt,
    cover_url: cover,
    body: "",
    sub_category: "",
    meta_title: "",
    meta_description: "",
    tags,
    video_url: null as string | null,
    gallery_images: gallery,
    case_price: price,
    case_rating: r.rating,
    case_route: route,
    case_facts: facts,
    status: "published",
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = (url.match(/https:\/\/([a-z0-9]+)\./) || [])[1];
  const pw = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
  if (!ref || !pw) {
    console.error("FATAL: need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD");
    process.exit(1);
  }
  const rows = REVIEWS.map(caseRow);
  console.log(`\n=== migrate ${rows.length} reviews → cms_articles (our_work) · ref=${ref} · ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);
  for (const r of rows) {
    console.log(`• ${r.legacyId.padEnd(10)} | ฿${(r.case_price || "quote").padEnd(10)} | ⭐${r.case_rating} | ${r.case_route.padEnd(24)} | tags:[${r.tags.join(", ")}] | facts:${r.case_facts.length} | ${r.slug}`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — nothing written. add --apply to insert. idempotent by slug.)`);
    return;
  }

  const client = new pg.Client(`postgresql://postgres.${ref}:${encodeURIComponent(pw)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`);
  await client.connect();
  let inserted = 0, skipped = 0;
  try {
    for (const r of rows) {
      const exists = await client.query("select 1 from cms_articles where slug=$1 limit 1", [r.slug]);
      if ((exists.rowCount ?? 0) > 0) { skipped++; continue; }
      await client.query(
        `insert into cms_articles
          (category, title, slug, excerpt, cover_url, body, sub_category, meta_title, meta_description,
           tags, video_url, gallery_images, case_price, case_rating, case_route, case_facts,
           status, author_admin_id, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,null,now())`,
        [r.category, r.title, r.slug, r.excerpt, r.cover_url, r.body, r.sub_category, r.meta_title, r.meta_description,
         r.tags, r.video_url, r.gallery_images, r.case_price, r.case_rating, r.case_route, JSON.stringify(r.case_facts), r.status],
      );
      inserted++;
    }
  } finally {
    await client.end();
  }
  console.log(`\n✓ inserted ${inserted} · skipped ${skipped} (already present)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
