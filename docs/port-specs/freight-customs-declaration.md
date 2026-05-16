# Port-spec — Customs declaration UI (V-E11)

> **Status:** 🟡 spec by เดฟ — Phase I2 backend prep for ภูม. Internal-only V2 scope (no real Thai Customs API integration yet).
> **Date:** 2026-05-16 night · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-E11` + deep-sweep audit §5.1 .
>
> **Read with:**
> [`docs/port-specs/freight-document-suite.md`](freight-document-suite.md) (V-E1/E3/E4 — same freight_shipments spine) ·
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5 ·
> [`supabase/migrations/0030_hs_codes_rates.sql`](../../supabase/migrations/0030_hs_codes_rates.sql) (HS code lookup, existing).

---

## Context

Thai import flow requires an **ใบขนสินค้า (customs declaration form)** for every shipment crossing customs. Legacy PHP has placeholder UIs in `home/Freight/FreightImport/CSAndDocImport.php` + `home/Freight/FreightImport/ShippingDocImport.php` (template stubs, zero business logic) hinting at a planned customs-declaration module — never built.

**Pacred V2 scope (internal only):**
- Store declaration data (HS codes · declared values · weight · origin) keyed to a `freight_shipment`
- Generate PDF for staff to print + lodge with customs broker manually
- Track declaration status (draft / submitted / cleared / rejected)
- NO direct Thai Customs API integration (that's Phase III — DPX ERP)

This unblocks freight customers seeing "customs status: cleared" in their portal + admin tracking lifecycle without manual spreadsheets.

---

## Data model

### `freight_customs_declarations` — declaration header

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `declaration_no` | text unique | `CD-{YYMMDD}-{seq}` Pacred internal; **note**: this is NOT the real customs control number (which the broker gets back from Thai Customs — that goes into `customs_control_no` below). |
| `freight_shipment_id` | uuid FK → `freight_shipments(id)` not null | |
| `kind` | text check | `import` · `export` · `transit`. |
| `customs_office` | text | e.g. `BANGKOK_PORT_CUSTOMS_HOUSE` · `LAEM_CHABANG_CUSTOMS_HOUSE` · `MUKDAHAN_CUSTOMS_BORDER`. |
| `incoterm` | text | snapshot from shipment (CIF / FOB / EXW / DDP). |
| `declared_value_thb` | numeric(14,2) | from `freight_value_plans` (ADR-0016) — the value used for duty/VAT computation. |
| `cif_value_thb` | numeric(14,2) | Cost + Insurance + Freight value (may differ from declared per "แผน VAT"). |
| `freight_charge_thb` | numeric(14,2) | freight component declared. |
| `insurance_charge_thb` | numeric(14,2) | insurance component. |
| `duty_amount_thb` | numeric(14,2) | Σ of line duty (from HS code rates × declared value share). |
| `vat_amount_thb` | numeric(14,2) | `round((declared + duty) × 0.07, 2)`. |
| `other_tax_thb` | numeric(14,2) default 0 | excise / municipal / etc. |
| `total_tax_thb` | numeric(14,2) | duty + vat + other. |
| `form_e_no` | text nullable | when Form E (FTA preference) is applied — links to V-E3 generator output. |
| `customs_control_no` | text nullable | the real Thai Customs control number returned after submission (broker fills in). |
| `submitted_at` | timestamptz nullable | when staff/broker submitted. |
| `cleared_at` | timestamptz nullable | when customs released. |
| `rejected_at` · `rejected_reason` | nullable | if customs rejects (missing docs / wrong HS / value query). |
| `broker_name` | text nullable | customs broker who handled (free-text + future FK to broker directory in Phase I3). |
| `notes` | text | |
| `created_by_admin_id` · `updated_by_admin_id` | uuid FK → profiles(id) | |
| `status` | text check | `draft` → `submitted` → `cleared` / `rejected`. |
| `created_at` · `updated_at` | timestamptz | |

**Constraints:**
- `freight_customs_status_chk`: in enum
- `freight_customs_submit_consistency`: `status in ('submitted','cleared','rejected') → submitted_at not null`
- `freight_customs_clear_consistency`: `status='cleared' → cleared_at not null`
- `freight_customs_reject_consistency`: `status='rejected' → rejected_at + rejected_reason not null`

### `freight_customs_declaration_lines` — per-HS-code line

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `freight_customs_declaration_id` | uuid FK → `freight_customs_declarations(id)` on delete cascade | |
| `position` | smallint | display order. |
| `hs_code` | text FK → `hs_codes(code)` | from migration 0030. |
| `description` | text | e.g. "เครื่องเลเซอร์รักษาผิว". |
| `country_of_origin` | text default 'CN' | ISO country code 2-letter. |
| `quantity` | numeric(14,3) | |
| `unit` | text | `PCS` / `KGM` / `MTK` / etc. |
| `unit_price_thb` | numeric(14,2) | |
| `line_value_thb` | numeric(14,2) | computed = qty × unit_price. |
| `duty_rate_pct` | numeric(6,3) | snapshot from `hs_codes.duty_rate_pct` at issuance. |
| `duty_amount_thb` | numeric(14,2) | computed = line_value × duty_rate/100 (after FTA preference if applicable). |
| `fta_applied` | bool default false | Form E or other FTA preference used. |
| `notes` | text | |

**Index:** `freight_customs_declaration_lines (freight_customs_declaration_id, position)`.

### RLS

```sql
alter table freight_customs_declarations enable row level security;
alter table freight_customs_declaration_lines enable row level security;

create policy customs_declarations_customer_read on freight_customs_declarations for select
  using (exists (select 1 from freight_shipments s
                 where s.id = freight_customs_declarations.freight_shipment_id
                   and s.profile_id = auth.uid())
         and status in ('submitted','cleared','rejected'));

create policy customs_declarations_admin_all on freight_customs_declarations for all
  using (is_admin(array['super','accounting','ops']))
  with check (is_admin(array['super','accounting','ops']));

-- Lines inherit
create policy customs_lines_customer_read on freight_customs_declaration_lines for select
  using (exists (select 1 from freight_customs_declarations cd
                 join freight_shipments s on s.id = cd.freight_shipment_id
                 where cd.id = freight_customs_declaration_lines.freight_customs_declaration_id
                   and s.profile_id = auth.uid()
                   and cd.status in ('submitted','cleared','rejected')));
create policy customs_lines_admin_all on freight_customs_declaration_lines for all
  using (is_admin(array['super','accounting','ops']))
  with check (is_admin(array['super','accounting','ops']));
```

---

## Server actions outline

`actions/admin/freight-customs.ts`:

```ts
adminCreateCustomsDeclaration(input: {
  freight_shipment_id: string;
  kind: 'import'|'export'|'transit';
  customs_office: string;
  lines: Array<{ hs_code: string; description: string; qty: number; unit: string; unit_price_thb: number; fta_applied?: boolean }>;
  incoterm: string;
  freight_charge_thb: number;
  insurance_charge_thb: number;
  notes?: string;
}): Promise<AdminActionResult<{ id; declaration_no }>>
//   computes per-line duty (from hs_codes lookup × value share)
//   computes total duty / vat / total_tax
//   snapshot rates frozen at declaration creation
//   status = 'draft' initially

adminSubmitCustomsDeclaration(id, broker_name?): Promise<AdminActionResult>
//   draft → submitted (stamps submitted_at; optional broker_name)
//   render PDF + upload (mirror tax-invoice pattern)

adminMarkCustomsCleared(id, customs_control_no): Promise<AdminActionResult>
//   submitted → cleared (broker provides real customs_control_no after acceptance)

adminMarkCustomsRejected(id, reason: string): Promise<AdminActionResult>
//   submitted → rejected (reason required ≥ 5 chars)

adminUpdateCustomsDeclaration(id, partial): Promise<AdminActionResult>
//   draft-status only; immutable after submit (per Thai customs compliance)
```

**Customer-side (`actions/freight-customs.ts`):**

```ts
listMyCustomsDeclarations(): RLS-scoped reads
getCustomsDeclaration(declaration_no): RLS-scoped
```

---

## UI outline

**Admin (`/admin/freight/customs-declarations/`):**
- List with status filter chips
- Detail: line-item builder + tax preview (live recompute as user types) + PDF preview + status action panel
- Bulk-actions: mark multiple submitted/cleared at once (broker batch handover scenario)
- HS code lookup tool integration (auto-fill duty rate from `hs_codes`)

**Customer (`/(protected)/freight/shipments/[code]`):**
- Customs section inline on shipment detail
- Status pill (submitted / cleared / rejected)
- "ดาวน์โหลดใบขน" button → PDF download (when status >= submitted)

---

## PDF template

`components/pdf/freight-customs-declaration.tsx` — Thai customs ใบขนสินค้า layout (approximate; real form has specific government numbering — see broker's preferred format).

Fields shown:
- Header: declaration_no · customs_office · kind
- Shipper / consignee snapshot (from freight_shipments)
- Line table (hs_code · description · qty · unit · unit_price · line_value · duty_rate · duty_amount · FTA)
- Totals: cif · duty · vat · other · total_tax
- Form E reference (if applicable)
- Broker section + signature line
- Watermark "DRAFT" / "REJECTED" per status

Route: `app/api/freight-customs/[id]/pdf/route.ts` — RLS-scoped + admin-only-download for draft + on-demand render.

---

## Migration note

One migration: 2 tables + checks + index + RLS. ภูม assigns; likely `0051+` (after V-E6..E10 + V-E9). Depends on `freight_shipments` (V-E1) + `hs_codes` (0030) — both exist.

---

## Acceptance

- Admin can create declaration from freight shipment with N HS-coded lines
- Duty + VAT auto-computed; staff can override per line (range-guarded; audit)
- Submit + mark cleared/rejected workflow audited
- PDF renders Thai customs declaration layout
- Customer sees status + downloads PDF when ≥ submitted
- Cross-link with V-E3 Form E generator (if FTA applied → form_e_no populated)

---

## Cross-references

- Schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E11`
- Sibling specs → [`port-specs/freight-document-suite.md`](freight-document-suite.md) V-E1/E3/E4
- HS code rates source → migration `0030_hs_codes_rates.sql`
- Value/VAT math source → [ADR-0016](../decisions/0016-freight-value-model.md)
- Forensics context → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5
- Legacy PHP placeholders → `/Users/dev/Desktop/pcscargo/member/pcs-admin/include/pages/home/Freight/FreightImport/{CSAndDocImport,ShippingDocImport}.php`

**End of V-E11 spec.** ก๊อต: confirm declaration_no format + customs_office enum (current proposals are guesses). ภูม: implement AFTER V-E6 (freight_shipments must exist) + V-E1 (Commercial Invoice lines may inform declaration lines).
