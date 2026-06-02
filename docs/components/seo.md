# Components — `components/seo/`

> 13 components across 4 files. ✓ = required prop.

### `seo/json-ld.tsx`

#### `JsonLd`

| Prop | Req | Type |
|---|:-:|---|
| `data` | ✓ | `unknown` |
| `id` |  | `string` |

### `seo/page-meta.ts`

#### async `buildPageMetadata`

| Prop | Req | Type |
|---|:-:|---|
| `locale` | ✓ | `string` |
| `path` | ✓ | `string` |
| `namespace` | ✓ | `string` |
| `imagePath` |  | `string` |

### `seo/schemas.ts`

#### `organizationSchema`

Props type: `SiteLocale = "th"` _(defined elsewhere / extends external)_

#### `localBusinessSchema`

Props type: `SiteLocale = "th"` _(defined elsewhere / extends external)_

#### `websiteSchema`

Props type: `SiteLocale = "th"` _(defined elsewhere / extends external)_

#### `breadcrumbSchema`

Props type: `BreadcrumbItem[], locale: SiteLocale = "th"` _(defined elsewhere / extends external)_

#### `serviceSchema`

| Prop | Req | Type |
|---|:-:|---|
| `name` | ✓ | `string` |
| `description` | ✓ | `string` |
| `slug` | ✓ | `string` |
| `serviceType` |  | `string` |
| `areaServed` |  | `string[]` |
| `locale` |  | `SiteLocale` |

#### `faqPageSchema`

Props type: `FaqItem[]` _(defined elsewhere / extends external)_

#### `articleSchema`

| Prop | Req | Type |
|---|:-:|---|
| `title` | ✓ | `string` |
| `description` | ✓ | `string` |
| `slug` | ✓ | `string` |
| `image` | ✓ | `string` |
| `datePublished` |  | `string` |
| `dateModified` |  | `string` |
| `locale` |  | `SiteLocale` |

#### `reviewSchema`

| Prop | Req | Type |
|---|:-:|---|
| `name` | ✓ | `string` |
| `reviewBody` | ✓ | `string` |
| `ratingValue` | ✓ | `number` |
| `itemName` | ✓ | `string` |
| `itemServiceType` |  | `string` |
| `slug` | ✓ | `string` |
| `image` |  | `string` |
| `locale` |  | `SiteLocale` |

### `seo/site.ts`

#### `absoluteUrl`

Props type: `string, locale: SiteLocale = DEFAULT_LOCALE` _(defined elsewhere / extends external)_

#### `localizedUrls`

Props type: `string` _(defined elsewhere / extends external)_

#### `SITE_URL`

Props type: `//pacred.co"` _(defined elsewhere / extends external)_


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
