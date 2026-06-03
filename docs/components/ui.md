# Components — `components/ui/`

> 10 components across 9 files. ✓ = required prop.

### `ui/hero-client.tsx` · `"use client"`

#### `HeroClient`

_No props._

### `ui/hero-tabs.tsx` · `"use client"`

#### `HeroTabs`

| Prop | Req | Type |
|---|:-:|---|
| `onActiveChange` |  | `(i: number \| null) => void;` |

### `ui/pacred-dialog.tsx` · `"use client"`

#### `PacredDialog`

| Prop | Req | Type |
|---|:-:|---|
| `dialogRef` | ✓ | `RefObject<HTMLDialogElement \| null>` |
| `title` | ✓ | `string` |
| `size` |  | `"md" \| "lg"` |
| `children` | ✓ | `ReactNode` |
| `onClose` |  | `() => void;` |

#### `DialogFooter`

| Prop | Req | Type |
|---|:-:|---|
| `onCancel` | ✓ | `() => void; pending: boolean; submitLabel?: string; pendingLabel?: string; /*…` |

#### `useConfirmDialogs`

_No props._

### `ui/promo-carousel.tsx` · `"use client"`

#### `PromoCarousel`

_No props._

### `ui/sales-carousel.tsx` · `"use client"`

#### `SalesCarousel`

_No props._

### `ui/service-carousel-double.tsx` · `"use client"`

#### `ServiceCarouselDouble`

_No props._

### `ui/service-carousel.tsx` · `"use client"`

#### `ServiceCarousel`

| Prop | Req | Type |
|---|:-:|---|
| `cardWidth` |  | `number` |
| `cardHeight` |  | `number` |
| `imageHeight` |  | `number` |
| `items` |  | `ServiceItem[]` |
| `imageItems` |  | `ImageCardItem[]` |
| `blogItems` |  | `BlogCardItem[]` |

### `ui/tooltip.tsx`

#### `Glossary`

| Prop | Req | Type |
|---|:-:|---|
| `term` | ✓ | `ReactNode` |
| `definition` | ✓ | `string` |
| `className` |  | `string` |


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
