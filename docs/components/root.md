# Components — `components/`

> 17 components across 17 files. ✓ = required prop.

### `cart-badge.tsx` · `"use client"`

#### `CartBadge`

| Prop | Req | Type |
|---|:-:|---|
| `prefetch` |  | `false` |

### `contact-form.tsx` · `"use client"`

#### `ContactForm`

_No props._

### `cost-reconfirm-panel.tsx` · `"use client"`

#### `CostReconfirmPanel`

| Prop | Req | Type |
|---|:-:|---|
| `rows` | ✓ | `ReconfirmRow[]` |

### `customer-wht-upload-panel.tsx` · `"use client"`

#### `CustomerWhtUploadPanel`

| Prop | Req | Type |
|---|:-:|---|
| `whtEntryId` | ✓ | `string` |

### `dashboard-banners.tsx`

#### async `DashboardBanners`

_No props._

### `floating-action-menu.tsx` · `"use client"`

#### `FloatingActionMenu`

_No props._

### `locale-html-lang.tsx` · `"use client"`

#### `LocaleHtmlLang`

_No props._

### `locale-switcher.tsx` · `"use client"`

#### `LocaleSwitcher`

| Prop | Req | Type |
|---|:-:|---|
| `variant` |  | `"default" \| "on-primary"` |

### `notification-bell.tsx` · `"use client"`

#### `NotificationBell`

| Prop | Req | Type |
|---|:-:|---|
| `prefetch` |  | `false` |

### `print-button.tsx` · `"use client"`

#### `PrintButton`

| Prop | Req | Type |
|---|:-:|---|
| `label` |  | `string` |

### `sales-rep-card.tsx`

#### async `SalesRepCard`

| Prop | Req | Type |
|---|:-:|---|
| `profileId` | ✓ | `string` |

### `stub-page.tsx`

#### `StubPage`

| Prop | Req | Type |
|---|:-:|---|
| `eyebrow` | ✓ | `string` |
| `title` | ✓ | `string` |
| `highlight` |  | `string` |
| `description` |  | `string` |
| `breadcrumb` |  | `Breadcrumb[]` |
| `banner` |  | `StubBanner` |
| `children` |  | `ReactNode` |

### `tax-invoice-request-panel.tsx` · `"use client"`

#### `TaxInvoiceRequestPanel`

| Prop | Req | Type |
|---|:-:|---|
| `orderType` | ✓ | `"forwarder" \| "service_order" \| "yuan_payment"` |
| `orderId` | ✓ | `string` |
| `defaults` | ✓ | `{ name: string; // company name (juristic) OR first+last (personal) address: …` |
| `existing` | ✓ | `CustomerTaxInvoiceSummary \| null` |
| `eligible` | ✓ | `boolean` |
| `deferred` |  | `boolean` |

### `theme-provider.tsx` · `"use client"`

#### `ThemeProvider`

| Prop | Req | Type |
|---|:-:|---|
| `children` | ✓ | `ReactNode` |
| `defaultTheme` |  | `Theme` |

#### `useTheme`

_No props._

### `theme-toggle.tsx` · `"use client"`

#### `ThemeToggle`

| Prop | Req | Type |
|---|:-:|---|
| `variant` |  | `"default" \| "on-primary"` |

### `tos-gate.tsx` · `"use client"`

#### `TosGate`

Props type: `Props = {}` _(defined elsewhere / extends external)_


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
