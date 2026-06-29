/**
 * Migrate the hardcoded STATIC สาระน่ารู้ (knowledge) + ข่าวสาร (news) articles
 * → cms_articles, so all 3 article categories become back-office editable +
 * publishable — exactly like ปอน did for ผลงานของเรา (our_work) on 2026-06-26
 * (`scripts/migrate-reviews-to-cms.ts`). Owner 2026-06-29: "3 หมวดต้องแก้ได้จริง
 * ขึ้นเว็บได้จริง".
 *
 * Sources (the SAME data the public pages render today — nothing is invented):
 *   knowledge → lib/knowledge-articles.ts (13) + body from public/images/knowledge/<id>.txt
 *   news      → components/sections/pacred-news-data.ts (1 published TS item)
 *              + content/news/*.mdx (frontmatter + body · `draft:true` → seeded as draft)
 *
 * Field map → cms_articles:
 *   category      = "knowledge" | "news"
 *   sub_category  = the Thai badge (knowledge: นำเข้า/เคลียร์/ส่งออก · news: ข่าวด่วน/…)
 *   cover_url     = the existing local /images path (rendered fine by <img>/<Image>)
 *   body          = the .txt / MDX body (same ArticleContent dialect)
 *   slug          = PRESERVED verbatim (the public /knowledge/[slug] + /news/[slug]
 *                   detail pages + every existing inbound link keep working)
 *   status        = "published" (live items) | "draft" (MDX draft:true)
 *
 * Idempotent by slug — re-running skips any slug already present.
 *
 *   DRY-RUN (default):  tsx --env-file=.env.local scripts/migrate-knowledge-news-to-cms-2026-06-29.ts
 *   APPLY:              tsx --env-file=.env.local scripts/migrate-knowledge-news-to-cms-2026-06-29.ts --apply
 *
 * Targets whatever NEXT_PUBLIC_SUPABASE_URL points at (⚠ .env.local = PROD on เดฟ's box).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { KNOWLEDGE_ARTICLES } from "../lib/knowledge-articles";
import { PACRED_NEWS } from "../components/sections/pacred-news-data";

const APPLY = process.argv.includes("--apply");

type SeedRow = {
  source: string;
  category: "knowledge" | "news";
  title: string;
  slug: string;
  excerpt: string;
  cover_url: string;
  body: string;
  sub_category: string;
  status: "published" | "draft";
  published_at: string | null;
};

// ── knowledge: 13 static articles + body from public/images/knowledge/<id>.txt ──
function knowledgeRows(): SeedRow[] {
  return KNOWLEDGE_ARTICLES.map((a) => {
    const txtPath = resolve(process.cwd(), "public", "images", "knowledge", `${a.id}.txt`);
    const body = existsSync(txtPath) ? readFileSync(txtPath, "utf-8").trim() : "";
    return {
      source: `knowledge#${a.id}`,
      category: "knowledge",
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt,
      cover_url: a.image,
      body,
      sub_category: a.category, // นำเข้า / เคลียร์ / ส่งออก
      status: "published",
      published_at: new Date("2026-06-01T00:00:00Z").toISOString(),
    };
  });
}

// ── minimal frontmatter parser (mirrors lib/news/mdx.ts) ──
function parseFrontmatter(raw: string): [Record<string, string>, string] {
  const trimmed = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return [{}, trimmed];
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const km = line.match(/^([a-zA-Z][\w]*?):\s*(.*)$/);
    if (!km) continue;
    let v = km[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[km[1]] = v;
  }
  return [fm, m[2].trim()];
}

// ── news: 1 TS item (published) + the MDX files in content/news ──
function newsRows(): SeedRow[] {
  const rows: SeedRow[] = [];

  // TS legacy items (PACRED_NEWS) — published
  for (const n of PACRED_NEWS) {
    rows.push({
      source: `news-ts#${n.id}`,
      category: "news",
      title: n.title,
      slug: n.slug,
      excerpt: n.excerpt,
      cover_url: n.image,
      body: n.content.trim(),
      sub_category: n.category, // ข่าวด่วน / อัปเดตบริการ / กิจกรรม
      status: "published",
      published_at: new Date(`${n.publishedAt}T00:00:00Z`).toISOString(),
    });
  }

  // MDX files
  const mdxFiles = ["welcome-pacred.mdx", "import-from-china-101.mdx"];
  for (const file of mdxFiles) {
    const p = resolve(process.cwd(), "content", "news", file);
    if (!existsSync(p)) continue;
    const [fm, body] = parseFrontmatter(readFileSync(p, "utf-8"));
    const slug = fm.slug || file.replace(/\.mdx$/, "");
    const isDraft = (fm.draft ?? "").toLowerCase() === "true";
    rows.push({
      source: `news-mdx:${file}`,
      category: "news",
      title: fm.title || slug,
      slug,
      excerpt: fm.excerpt || "",
      cover_url: fm.image || "",
      body,
      sub_category: fm.category || "ข่าวด่วน",
      status: isDraft ? "draft" : "published",
      published_at: isDraft ? null : (fm.publishedAt ? new Date(`${fm.publishedAt}T00:00:00Z`).toISOString() : new Date().toISOString()),
    });
  }
  return rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const ref = (url.match(/https:\/\/([a-z0-9]+)\./) || [])[1] ?? "?";
  if (!url || !key) {
    console.error("FATAL: need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const rows = [...knowledgeRows(), ...newsRows()];
  console.log(`\n=== migrate ${rows.length} static articles → cms_articles · ref=${ref} · ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);
  for (const r of rows) {
    console.log(
      `• ${r.source.padEnd(22)} | ${r.category.padEnd(9)} | ${r.status.padEnd(9)} | [${r.sub_category}] | body:${String(r.body.length).padStart(5)} ch | cover:${r.cover_url || "—"} | ${r.slug}`,
    );
    if (!r.body && r.category === "knowledge") console.log(`    ⚠ no body (.txt missing) for ${r.slug}`);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Show what already exists (so the dry-run is honest about idempotency)
  const { data: existing } = await sb
    .from("cms_articles")
    .select("slug, category, status")
    .in("category", ["knowledge", "news"]);
  const existingSlugs = new Set((existing ?? []).map((e) => e.slug));
  console.log(`\nalready in cms_articles (knowledge+news): ${existing?.length ?? 0} row(s)`);
  const toInsert = rows.filter((r) => !existingSlugs.has(r.slug));
  console.log(`would insert: ${toInsert.length} · skip (slug exists): ${rows.length - toInsert.length}`);

  if (!APPLY) {
    console.log(`\n(dry-run — nothing written. add --apply to insert. idempotent by slug.)\n`);
    return;
  }

  let inserted = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    if (existingSlugs.has(r.slug)) { skipped++; continue; }
    const { error } = await sb.from("cms_articles").insert({
      category: r.category,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      cover_url: r.cover_url,
      body: r.body,
      sub_category: r.sub_category,
      meta_title: "",
      meta_description: "",
      tags: [],
      video_url: null,
      gallery_images: [],
      case_price: "",
      case_rating: null,
      case_route: "",
      case_facts: [],
      status: r.status,
      author_admin_id: null,
      published_at: r.published_at,
    });
    if (error) {
      // 23505 = slug UNIQUE collision (raced / pre-existing) → treat as skip
      if (error.code === "23505") { skipped++; }
      else { failed++; console.error(`  ✗ ${r.slug}: ${error.message}`); }
    } else inserted++;
  }
  console.log(`\n✓ inserted ${inserted} · skipped ${skipped} · failed ${failed}\n`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
