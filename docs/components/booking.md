# Components — `components/booking/`

> 18 components across 16 files. ✓ = required prop.

### `booking/BookingCalculator.tsx` · `"use client"`

#### `BookingCalculator`

| Prop | Req | Type |
|---|:-:|---|
| `landing` |  | `TabMode } = {` |

### `booking/BookingDetailPage.tsx` · `"use client"`

#### `BookingDetailPage`

| Prop | Req | Type |
|---|:-:|---|
| `serviceConfig` | ✓ | `ServiceConfig` |
| `routeSlug` | ✓ | `string \| null` |
| `rates` | ✓ | `BookingRate[]` |
| `initialCarry` | ✓ | `Partial<QuoteCarry>` |
| `baseAmount` | ✓ | `number` |
| `baseLabel` | ✓ | `string` |
| `sourceChannel` |  | `string` |
| `sourceUrl` |  | `string` |

### `booking/BookingDocUploader.tsx` · `"use client"`

#### `BookingDocUploader`

| Prop | Req | Type |
|---|:-:|---|
| `bookingId` | ✓ | `string` |

### `booking/BookingHero.tsx` · `"use client"`

#### `BookingHero`

| Prop | Req | Type |
|---|:-:|---|
| `activeTab` | ✓ | `TabMode \| null` |
| `seaMode` | ✓ | `SeaMode` |

### `booking/BookingPortTabs.tsx` · `"use client"`

#### `BookingPortTabs`

| Prop | Req | Type |
|---|:-:|---|
| `active` | ✓ | `CustomsPortCode \| null` |
| `onChange` | ✓ | `(port: CustomsPortCode) => void;` |

### `booking/BookingSubbar.tsx` · `"use client"`

#### `BookingSubbar`

| Prop | Req | Type |
|---|:-:|---|
| `activeTab` | ✓ | `TabMode` |
| `seaMode` | ✓ | `SeaMode` |
| `onSeaModeChange` | ✓ | `(m: SeaMode) => void; lclTerm: Term; onLclTermChange: (t: Term) => void; lclD…` |

### `booking/BookingTabs.tsx` · `"use client"`

#### `BookingTabs`

| Prop | Req | Type |
|---|:-:|---|
| `active` | ✓ | `TabMode \| null` |
| `onChange` | ✓ | `(mode: TabMode) => void;` |

### `booking/CustomDropdown.tsx` · `"use client"`

#### `CustomDropdown`

| Prop | Req | Type |
|---|:-:|---|
| `label` | ✓ | `string` |
| `displayValue` | ✓ | `string` |
| `sections` | ✓ | `DropdownSection[]` |
| `onSelect` | ✓ | `(value: string, label: string) => void;` |

#### `TextDropdown`

| Prop | Req | Type |
|---|:-:|---|
| `label` | ✓ | `string` |
| `value` | ✓ | `string` |
| `onChange` | ✓ | `(v: string) => void; suggestions: string[]; placeholder?: string;` |

### `booking/MobileQuoteBar.tsx` · `"use client"`

#### `MobileQuoteBar`

| Prop | Req | Type |
|---|:-:|---|
| `serviceConfig` | ✓ | `ServiceConfig` |
| `options` | ✓ | `BookingOptionState` |
| `baseAmount` | ✓ | `number` |
| `baseLabel` | ✓ | `string` |
| `rates` | ✓ | `BookingRate[]` |
| `onSubmit` | ✓ | `() => Promise<void>;` |

### `booking/OpenBookingCTA.tsx` · `"use client"`

#### `OpenBookingCTA`

| Prop | Req | Type |
|---|:-:|---|
| `quote` | ✓ | `QuoteCarry` |

### `booking/QuotationPanel.tsx` · `"use client"`

#### `buildBreakdown`

Props type: `ServiceConfig, options: BookingOptionState, baseAmount: numb` _(defined elsewhere / extends external)_

#### `QuotationPanel`

| Prop | Req | Type |
|---|:-:|---|
| `serviceConfig` | ✓ | `ServiceConfig` |
| `options` | ✓ | `BookingOptionState` |
| `baseAmount` | ✓ | `number` |
| `baseLabel` | ✓ | `string` |
| `rates` | ✓ | `BookingRate[]` |
| `onSubmit` | ✓ | `() => Promise<void>; /** Optional toast/error to surface inline (parent owns …` |

### `booking/QuoteCTA.tsx` · `"use client"`

#### `QuoteCTA`

| Prop | Req | Type |
|---|:-:|---|
| `quote` | ✓ | `QuoteCarry` |

### `booking/RelatedTagsRail.tsx`

#### `RelatedTagsRail`

| Prop | Req | Type |
|---|:-:|---|
| `tags` | ✓ | `string[]` |

### `booking/ResultBox.tsx`

#### `ResultBox`

| Prop | Req | Type |
|---|:-:|---|
| `result` | ✓ | `CalcResult` |
| `quote` |  | `QuoteCarry` |

### `booking/SalesModal.tsx` · `"use client"`

#### `SalesModal`

| Prop | Req | Type |
|---|:-:|---|
| `open` | ✓ | `boolean` |
| `onClose` | ✓ | `() => void; cards: SalesCard[];` |

### `booking/UpgradeRail.tsx` · `"use client"`

#### `UpgradeRail`

| Prop | Req | Type |
|---|:-:|---|
| `availableKeys` | ✓ | `string[]` |
| `rates` | ✓ | `BookingRate[]` |
| `selected` | ✓ | `string[]` |
| `onChange` | ✓ | `(next: string[]) => void;` |


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
