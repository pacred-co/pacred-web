# Components — `components/booking/options/`

> 5 components across 5 files. ✓ = required prop.

### `booking/options/DocAttachSelector.tsx` · `"use client"`

#### `DocAttachSelector`

| Prop | Req | Type |
|---|:-:|---|
| `documentIds` | ✓ | `string[]` |
| `onChange` | ✓ | `(next: string[]) => void;` |

### `booking/options/DocModeSelector.tsx` · `"use client"`

#### `DocModeSelector`

| Prop | Req | Type |
|---|:-:|---|
| `value` | ✓ | `BookingDocMode` |
| `onChange` | ✓ | `(next: BookingDocMode) => void;` |

### `booking/options/LaborSelector.tsx` · `"use client"`

#### `LaborSelector`

| Prop | Req | Type |
|---|:-:|---|
| `count` | ✓ | `number` |
| `heavyLift` | ✓ | `boolean` |
| `onChange` | ✓ | `(next: { count: number; heavyLift: boolean }) => void;` |

### `booking/options/PinSelector.tsx` · `"use client"`

#### `PinSelector`

| Prop | Req | Type |
|---|:-:|---|
| `pickup` | ✓ | `PinShape` |
| `dropoff` | ✓ | `PinShape` |
| `onChange` | ✓ | `(next: { pickup: PinShape; dropoff: PinShape }) => void;` |

### `booking/options/TractorSelector.tsx` · `"use client"`

#### `TractorSelector`

| Prop | Req | Type |
|---|:-:|---|
| `value` | ✓ | `BookingTractorClass` |
| `onChange` | ✓ | `(next: BookingTractorClass) => void;` |


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
