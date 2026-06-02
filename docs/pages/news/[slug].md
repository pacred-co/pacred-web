# `/news/[slug]`

**หน้าข่าว/บทความรายชิ้น**

> **Auth:** 🌐 Public (no auth)
> **Group:** `(public)` · **Source:** `app/[locale]/(public)/news/[slug]/page.tsx`

## Request data (params)

- **route param** `slug`

## Database tables

_None directly (page may be presentational or fetch via a child component)._

## Components

- `components/knowledge/article-content`
- `components/knowledge/article-stats`
- `components/knowledge/share-button`
- `components/sections/footer`
- `components/sections/home-bottom-banner`
- `components/sections/navbar`
- `components/sections/search-bar`
- `components/seo/json-ld`
- `components/seo/schemas`
- `components/seo/site`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/news/all`

## Exports / functions

- `generateStaticParams`
- `generateMetadata`
- `NewsArticlePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
