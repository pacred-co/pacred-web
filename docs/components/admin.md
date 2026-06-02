# Components — `components/admin/`

> 19 components across 19 files. ✓ = required prop.

### `admin/accounting-segment-pills.tsx`

#### `AccountingSegmentPills`

| Prop | Req | Type |
|---|:-:|---|
| `active` | ✓ | `Side` |

### `admin/api-forwarder-manual-form.tsx` · `"use client"`

#### `ApiForwarderManualForm`

| Prop | Req | Type |
|---|:-:|---|
| `carrier` | ✓ | `Carrier` |
| `carrierLabel` | ✓ | `string` |

### `admin/bill-to-override-panel.tsx` · `"use client"`

#### `BillToOverridePanel`

| Prop | Req | Type |
|---|:-:|---|
| `kind` | ✓ | `"forwarder"` |
| `fNo` | ✓ | `string` |
| `defaultName` | ✓ | `string` |
| `current` | ✓ | `string \| null` |

### `admin/camera-scanner.tsx` · `"use client"`

#### `CameraScanner`

| Prop | Req | Type |
|---|:-:|---|
| `gatewayType` |  | `GatewayType` |
| `onDetected` |  | `(code: string) => void;` |

### `admin/carrier-manual-form.tsx` · `"use client"`

#### `CarrierManualForm`

| Prop | Req | Type |
|---|:-:|---|
| `carrier` | ✓ | `CarrierConfig` |
| `coidList` | ✓ | `CoidOption[]` |
| `freeShipping` | ✓ | `boolean` |
| `presetUser` | ✓ | `CustomerOption \| null` |
| `presetCoid` | ✓ | `string \| null` |
| `presetAddresses` | ✓ | `AddressOption[]` |

### `admin/csv-button.tsx` · `"use client"`

#### `CsvButton`

| Prop | Req | Type |
|---|:-:|---|
| `rows` | ✓ | `CsvRow[]` |
| `cols` | ✓ | `{ key: string; label: string }[]` |
| `filename` | ✓ | `string` |

### `admin/customer-picker.tsx` · `"use client"`

#### `CustomerPicker`

| Prop | Req | Type |
|---|:-:|---|
| `value` | ✓ | `string` |
| `onChange` | ✓ | `(profileId: string, row: CustomerPickerRow \| null) => void; /** Optional plac…` |

### `admin/customer-row-actions.tsx` · `"use client"`

#### `CustomerRowActions`

| Prop | Req | Type |
|---|:-:|---|
| `id` | ✓ | `string` |
| `status` | ✓ | `string` |

### `admin/date-filter.tsx` · `"use client"`

#### `AdminDateFilter`

| Prop | Req | Type |
|---|:-:|---|
| `tab` |  | `string` |
| `dateFrom` |  | `string` |
| `dateTo` |  | `string` |

### `admin/forwarder-cost-edit-button.tsx` · `"use client"`

#### `ForwarderCostEditButton`

| Prop | Req | Type |
|---|:-:|---|
| `mode` | ✓ | `ForwarderCostEditMode` |
| `forwarder` | ✓ | `ForwarderCostEditTarget` |
| `sheetCost` |  | `number` |
| `onSaved` |  | `() => void; /** Optional custom label. Default is the legacy icon-only afford…` |

### `admin/forwarder-cost-edit-modal.tsx` · `"use client"`

#### `ForwarderCostEditModal`

| Prop | Req | Type |
|---|:-:|---|
| `mode` | ✓ | `ForwarderCostEditMode` |
| `forwarder` | ✓ | `ForwarderCostEditTarget` |
| `sheetCost` |  | `number` |
| `onClose` | ✓ | `() => void; /** Fired after a successful UPDATE — parent should refresh data.…` |

### `admin/hover-zoom-image.tsx` · `"use client"`

#### `HoverZoomImage`

| Prop | Req | Type |
|---|:-:|---|
| `src` | ✓ | `string` |
| `alt` | ✓ | `string` |
| `mime` |  | `string` |
| `zoom` |  | `number` |
| `className` |  | `string` |

### `admin/invoice-adjustments-panel.tsx` · `"use client"`

#### `InvoiceAdjustmentsPanel`

| Prop | Req | Type |
|---|:-:|---|
| `targetType` | ✓ | `InvoiceAdjustmentTargetType` |
| `targetId` | ✓ | `string` |
| `existing` | ✓ | `InvoiceAdjustmentRow[]` |

### `admin/page-top-menubar.tsx` · `"use client"`

#### `PageTopMenubar`

| Prop | Req | Type |
|---|:-:|---|
| `items` | ✓ | `MenubarItem[]` |
| `activeHref` |  | `string` |

### `admin/scanner-input.tsx` · `"use client"`

#### `ScannerInput`

| Prop | Req | Type |
|---|:-:|---|
| `type` | ✓ | `ScannerType` |
| `placeholder` |  | `string` |

### `admin/slip-transferred-at-cell.tsx` · `"use client"`

#### `SlipTransferredAtCell`

| Prop | Req | Type |
|---|:-:|---|
| `kind` | ✓ | `"wallet_tx"` |
| `id` | ✓ | `string` |
| `currentValue` | ✓ | `string \| null` |

### `admin/top-menu-barcode.tsx`

#### `TopMenuBarcode`

| Prop | Req | Type |
|---|:-:|---|
| `activeHref` |  | `string } = {` |

### `admin/top-menu-report.tsx`

#### async `TopMenuReport`

| Prop | Req | Type |
|---|:-:|---|
| `activeHref` |  | `string } = {` |

### `admin/work-item-thread.tsx` · `"use client"`

#### `WorkItemThread`

| Prop | Req | Type |
|---|:-:|---|
| `workItemId` | ✓ | `string` |
| `className` |  | `string` |


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
