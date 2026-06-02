# Components — `components/analytics/`

> 11 components across 7 files. ✓ = required prop.

### `analytics/clarity-script.tsx`

#### `ClarityScript`

_No props._

### `analytics/experiment-beacon.tsx` · `"use client"`

#### `ExperimentBeacon`

| Prop | Req | Type |
|---|:-:|---|
| `experimentKey` | ✓ | `K` |

### `analytics/facebook-pixel-script.tsx`

#### `FacebookPixelScript`

_No props._

#### `FacebookPixelNoscript`

_No props._

### `analytics/google-ads-script.tsx`

#### `GoogleAdsScript`

_No props._

### `analytics/google-analytics-script.tsx`

#### `GoogleAnalyticsScript`

_No props._

### `analytics/gtm-script.tsx`

#### `GtmScript`

_No props._

#### `GtmNoscript`

_No props._

### `analytics/tracked-link.tsx` · `"use client"`

#### `TrackedLink`

Props type: `CommonProps & { href: string }` _(defined elsewhere / extends external)_

#### `TrackedExternalLink`

Props type: `CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { hr` _(defined elsewhere / extends external)_

#### `TrackedPhoneLink`

Props type: `CommonProps & { phone: string }` _(defined elsewhere / extends external)_


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
