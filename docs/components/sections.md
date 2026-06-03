# Components — `components/sections/`

> 57 components across 55 files. ✓ = required prop.

### `sections/admin-sidebar.tsx` · `"use client"`

#### `AdminSidebar`

| Prop | Req | Type |
|---|:-:|---|
| `roles` | ✓ | `AdminRole[]` |
| `counts` |  | `BadgeCounts` |
| `adminLabel` |  | `string` |

### `sections/article-list-tabs.tsx`

#### `ArticleListTabs`

| Prop | Req | Type |
|---|:-:|---|
| `active` | ✓ | `"knowledge" \| "news"` |
| `className` |  | `string` |

### `sections/blog.tsx` · `"use client"`

#### `Blog`

_No props._

### `sections/certs-slideshow.tsx` · `"use client"`

#### `CertsSlideshow`

_No props._

### `sections/clearance-banner.tsx` · `"use client"`

#### `ClearanceBanner`

_No props._

### `sections/clearance-cards.tsx` · `"use client"`

#### `ClearanceCards`

_No props._

### `sections/clearance-documents.tsx`

#### `ClearanceDocuments`

_No props._

### `sections/clearance-faq.tsx` · `"use client"`

#### `ClearanceFAQ`

_No props._

### `sections/clearance-permits.tsx`

#### `ClearancePermits`

_No props._

### `sections/clearance-process.tsx`

#### `ClearanceProcess`

_No props._

### `sections/clearance-promo.tsx`

#### `ClearancePromo`

_No props._

### `sections/contact-sales.tsx` · `"use client"`

#### `ContactSales`

Props type: `ContactSalesProps = {}` _(defined elsewhere / extends external)_

### `sections/customs-mode-cards.tsx` · `"use client"`

#### `CustomsModeCards`

_No props._

### `sections/customs-port-data.ts`

#### `findCustomsPortBySlug`

Props type: `string` _(defined elsewhere / extends external)_

### `sections/customs-video-clips.tsx` · `"use client"`

#### `CustomsVideoClips`

_No props._

### `sections/faq-accordion.tsx` · `"use client"`

#### `FaqAccordion`

| Prop | Req | Type |
|---|:-:|---|
| `groups` | ✓ | `FaqGroup[]` |

### `sections/floating-tabs.tsx` · `"use client"`

#### `FloatingTabs`

| Prop | Req | Type |
|---|:-:|---|
| `payDueCount` |  | `number` |

### `sections/footer.tsx`

#### `Footer`

_No props._

### `sections/guarantee-banner.tsx`

#### `GuaranteeBanner`

_No props._

### `sections/hero-section.tsx`

#### `HeroSection`

_No props._

### `sections/home-article.tsx`

#### `HomeArticle`

| Prop | Req | Type |
|---|:-:|---|
| `locale` | ✓ | `"th" \| "en"` |

### `sections/home-bottom-banner.tsx`

#### `HomeBottomBanner`

_No props._

### `sections/home-related-tags.tsx`

#### `HomeRelatedTags`

_No props._

### `sections/horizontal-scroller.tsx` · `"use client"`

#### `HorizontalScroller`

| Prop | Req | Type |
|---|:-:|---|
| `children` | ✓ | `ReactNode` |

### `sections/impersonation-banner.tsx`

#### async `ImpersonationBanner`

_No props._

### `sections/impersonation-countdown.tsx` · `"use client"`

#### `ImpersonationCountdown`

| Prop | Req | Type |
|---|:-:|---|
| `expiresAt` | ✓ | `string` |

### `sections/impersonation-exit-button.tsx` · `"use client"`

#### `ImpersonationExitButton`

_No props._

### `sections/import-export-banner.tsx` · `"use client"`

#### `ImportExportBanner`

_No props._

### `sections/knowledge-news-block.tsx` · `"use client"`

#### `KnowledgeNewsBlock`

_No props._

### `sections/navbar.tsx` · `"use client"`

#### `NavBar`

_No props._

### `sections/our-service.tsx`

#### `OurService`

_No props._

### `sections/pacred-experience.tsx`

#### `PacredExperience`

_No props._

### `sections/pacred-news-data.ts`

#### `getPacredNewsBySlug`

Props type: `string` _(defined elsewhere / extends external)_

#### `getRelatedNews`

Props type: `string, limit = 3` _(defined elsewhere / extends external)_

### `sections/page-placeholder.tsx`

#### `PagePlaceholder`

| Prop | Req | Type |
|---|:-:|---|
| `title` | ✓ | `string` |

### `sections/partner.tsx`

#### `Partner`

_No props._

### `sections/pcs-icon-grid.tsx`

#### async `PcsIconGrid`

_No props._

### `sections/pcs-launchpad-header.tsx`

#### async `PcsLaunchpadHeader`

| Prop | Req | Type |
|---|:-:|---|
| `displayName` | ✓ | `string` |
| `memberCode` | ✓ | `string \| null` |
| `avatarUrl` | ✓ | `string \| null` |

### `sections/pcs-sales-rep-card.tsx`

#### async `PcsSalesRepCard`

| Prop | Req | Type |
|---|:-:|---|
| `memberCode` | ✓ | `string \| null` |

### `sections/pcs-wallet-card.tsx` · `"use client"`

#### `PcsWalletCard`

| Prop | Req | Type |
|---|:-:|---|
| `balance` | ✓ | `number` |

### `sections/port-pricing-carousel.tsx` · `"use client"`

#### `PortPricingCarousel`

_No props._

### `sections/pricing-section.tsx` · `"use client"`

#### `PricingSection`

_No props._

### `sections/product-categories.tsx`

#### `ProductCategories`

_No props._

### `sections/promotion.tsx` · `"use client"`

#### `Promotion`

_No props._

### `sections/protected-sidebar.tsx` · `"use client"`

#### `ProtectedSidebar`

| Prop | Req | Type |
|---|:-:|---|
| `badges` |  | `SidebarBadges` |
| `salesRep` |  | `SalesRepInfo` |

### `sections/purchase-banner.tsx` · `"use client"`

#### `PurchaseBanner`

_No props._

### `sections/related-tags-tabs.tsx` · `"use client"`

#### `RelatedTagsTabs`

| Prop | Req | Type |
|---|:-:|---|
| `groups` | ✓ | `TagGroup[]` |

### `sections/reviews.tsx` · `"use client"`

#### `Reviews`

| Prop | Req | Type |
|---|:-:|---|
| `defaultFilter` |  | `"all" \| ServiceType } = {` |

### `sections/sales.tsx`

#### `Sales`

_No props._

### `sections/search-bar.tsx` · `"use client"`

#### `SearchBar`

| Prop | Req | Type |
|---|:-:|---|
| `embedded` |  | `boolean` |

### `sections/service.tsx`

#### `Service`

_No props._

### `sections/stats-bar.tsx`

#### `StatsBar`

_No props._

### `sections/top-menu.tsx` · `"use client"`

#### `TopMenu`

_No props._

#### `TopMenuMobile`

| Prop | Req | Type |
|---|:-:|---|
| `onClose` | ✓ | `() => void` |

### `sections/trust-stats-strip.tsx`

#### `TrustStatsStrip`

| Prop | Req | Type |
|---|:-:|---|
| `className` |  | `string` |

### `sections/warehouse-detail.tsx`

#### `WarehouseDetail`

| Prop | Req | Type |
|---|:-:|---|
| `eyebrow` | ✓ | `string` |
| `city` | ✓ | `string` |
| `cityEn` | ✓ | `string` |
| `province` | ✓ | `string` |
| `flag` | ✓ | `string` |
| `intro` | ✓ | `string` |
| `features` | ✓ | `string[]` |
| `shippingMark` | ✓ | `ShippingMarkLine[]` |
| `shippingMarkNote` | ✓ | `string` |
| `photo` | ✓ | `string` |
| `hubLink` |  | `string` |

### `sections/why-pacred.tsx`

#### `WhyPacred`

_No props._


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
