# Port-spec — Freight quotation workflow (V-E6)

> **Status:** 🟡 spec by เดฟ — Phase I2 backend prep for ภูม. ภูม implements + finalises; this is a proposal not a contract.
> **Date:** 2026-05-16 night · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-E6` + deep-sweep audit `php-deep-sweep-2026-05-16.md` §5.1
>
> **Read with:**
> [`docs/port-specs/freight-document-suite.md`](freight-document-suite.md) (V-E1 invoice + V-E3 Form E + V-E4 D/O — uses same `freight_shipments` spine) ·
> [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §5.1 ·
> [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V.

---

## Context

Legacy PHP has a quotation system at `pcs-admin/include/pages/forwarder-quotation/` (5 files: `add.php`, `home.php`, `detail.php`, `view.php`, `listPayCommShops.php` — last one is misnamed; it's actually the commission-pay listing referenced from quotation context). The workflow lets admin staff issue a **freight quote** to a customer; the quote has a role-based **approval gate** (CEO/Manager can approve; sales rep cannot); once the customer accepts, the quote **converts into a real `freight_shipments` job**.

Pacred has **no equivalent** today. Customers can chat with sales rep, but there's no formal quote document → no traceable conversion rate → no commission attribution. Building this unlocks the freight sales funnel.

The PHP tables (per agent inventory):
- `tb_farwarder_quotation` (13 cols): `ID`, `fqNo` (quote-number), `date`, `adminIDCreate`, `adminIDApprover`, `dateApprover`, `compNumber` (tax ID), `compName`, `contact`, `email`, `tel`, status fields.
- `tb_farwarder_quotation_item` — per-line quote items (warehouseType, route, CBM/KG, price).

---

## Data model

### `freight_quotes` — quote header

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `quote_no` | text unique | `FQ{YYMMDD}-{seq}` (Pacred-issued; replaces legacy `fqNo`). |
| `status` | text check | `draft` → `pending_approval` → `approved` → `sent` → `accepted` / `rejected` / `expired` |
| `profile_id` | uuid FK → `profiles(id)` | the prospective customer (NULL allowed for cold-quote to a non-registered company). |
| `buyer_name_snapshot` | text | company name at issuance (mirror `tax_invoices` snapshot rule, 0034). |
| `buyer_tax_id_snapshot` | text | 13-digit (nullable for cold-quote / personal). |
| `buyer_contact_snapshot` | text | name + tel + email block. |
| `transport_mode` | text check | `sea_fcl`, `sea_lcl`, `truck`, `air` (mirror `cargo_containers.transport_mode` enum where overlap). |
| `port_loading` · `port_discharge` · `place_delivery` | text | e.g. `NANSHA` · `LAEM CHABANG` · ... |
| `incoterm` | text | `CIF`, `FOB`, `EXW`, `DDP`, ... |
| `currency` | text default `THB` | quotes are typically THB; allow `USD` flag. |
| `subtotal` | numeric(12,2) | computed Σ line amounts; stored at issuance, frozen on approval. |
| `vat_pct` | numeric(4,2) default `7.00` | typically 7% Thai VAT; configurable per line. |
| `vat_amount` | numeric(12,2) | computed = `subtotal × vat_pct/100`. |
| `total` | numeric(12,2) | = `subtotal + vat_amount`. |
| `valid_until` | date | quote expiry; default = issuance_date + 30 days. |
| `notes` | text | free-text (delivery conditions, special-handling). |
| `created_by_admin_id` | uuid FK → `profiles(id)` | sales-rep / ops who drafted. |
| `approved_by_admin_id` | uuid FK → `profiles(id)` | CEO/Manager — RLS-enforced. |
| `approved_at` | timestamptz | |
| `rejected_reason` | text | required when status=`rejected` (CHECK). |
| `accepted_at` | timestamptz | when customer accepts (via portal or admin marks). |
| `converted_to_shipment_id` | uuid FK → `freight_shipments(id)` | NULL until accept→convert; UNIQUE so a quote becomes at-most-one shipment. |
| `created_at` · `updated_at` | timestamptz | standard. |

**Check constraints:**
- `freight_quotes_status_chk`: status in the allowed enum
- `freight_quotes_rejected_has_reason`: `status='rejected' → rejected_reason is not null`
- `freight_quotes_approved_set_consistent`: `status in ('approved','sent','accepted') → approved_by_admin_id is not null AND approved_at is not null`

### `freight_quote_items` — quote line items

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `freight_quote_id` | uuid FK → `freight_quotes(id)` on delete cascade | |
| `position` | smallint | display order. |
| `description` | text | e.g. "ค่าขนส่ง LCL กวางโจว → แหลมฉบัง". |
| `quantity` | numeric(12,3) | |
| `unit` | text | `CBM`, `KGM`, `JOB`, `PCS`, `LO`, ... |
| `unit_price_thb` | numeric(12,2) | range-guarded (V-E5 — no int32 overflow). |
| `line_total_thb` | numeric(12,2) | computed = `quantity × unit_price_thb`; stored for immutability. |
| `note` | text nullable | per-line conditions. |

**Indexes:**
- `freight_quotes (status, created_at desc)` — admin list filters.
- `freight_quotes (profile_id, status)` — customer's quotes list.
- `freight_quote_items (freight_quote_id, position)` — ordered fetch.

### RLS policies

```sql
alter table freight_quotes enable row level security;
alter table freight_quote_items enable row level security;

-- Customer: read own quotes only (when status >= sent)
create policy freight_quotes_customer_read on freight_quotes for select
  using (profile_id = auth.uid() and status in ('sent','accepted','rejected','expired'));

-- Admin super/ops/sales_admin: full read; create + update
create policy freight_quotes_admin_all on freight_quotes for all
  using (is_admin(array['super','ops','sales_admin','accounting']))
  with check (is_admin(array['super','ops','sales_admin','accounting']));

-- Items: inherit from parent (customer can read own quote's items; admin all)
create policy freight_quote_items_customer_read on freight_quote_items for select
  using (exists (select 1 from freight_quotes q
                 where q.id = freight_quote_items.freight_quote_id
                   and q.profile_id = auth.uid()
                   and q.status in ('sent','accepted','rejected','expired')));
create policy freight_quote_items_admin_all on freight_quote_items for all
  using (is_admin(array['super','ops','sales_admin','accounting']))
  with check (is_admin(array['super','ops','sales_admin','accounting']));
```

> **⚠️ Open question for ก๊อต:** the PHP role gate is "CEO can approve, sales rep cannot." Pacred's `admins.role` enum is `super | ops | accounting | sales_admin | warehouse | driver`. **Approval gate proposal:** `super` and `accounting` can approve; `ops` and `sales_admin` can create + edit (status=draft) only. Confirm or amend before ภูม implements `approveQuote()`.

---

## Server actions outline (`actions/admin/freight-quotes.ts`)

Follow ADR-0014 verbatim (admin-client-after-ownership-verify pattern). All gated via `withAdmin([...])`.

```ts
// Create draft (sales_admin + ops + super + accounting)
adminCreateFreightQuote(input: CreateFreightQuoteInput): Promise<AdminActionResult<{ id: string; quote_no: string }>>
adminUpdateFreightQuote(input: UpdateFreightQuoteInput): Promise<AdminActionResult>  // draft-status only
adminAddFreightQuoteItem(...)
adminUpdateFreightQuoteItem(...)
adminDeleteFreightQuoteItem(...)

// Approval gate (super + accounting only)
adminSubmitForApproval(id: string): Promise<AdminActionResult>  // draft → pending_approval
adminApproveQuote(id: string): Promise<AdminActionResult>       // pending_approval → approved; stamp approved_by + approved_at
adminRejectQuote(id: string, reason: string): Promise<AdminActionResult>  // pending_approval → rejected

// Issue to customer (super + accounting + sales_admin)
adminSendQuote(id: string): Promise<AdminActionResult>          // approved → sent; (later) trigger LINE/email push
adminMarkAccepted(id: string): Promise<AdminActionResult>       // sent → accepted (admin marks when customer says yes verbally)
adminMarkExpired(id: string): Promise<AdminActionResult>        // sent → expired (cron or manual)

// Convert (super + accounting + sales_admin)
adminConvertQuoteToShipment(id: string): Promise<AdminActionResult<{ freight_shipment_id: string }>>
//   accepted → create freight_shipments row (per port-specs/freight-document-suite.md `freight_shipments`)
//   copy: transport_mode, ports, incoterm, snapshots, link customer
//   set converted_to_shipment_id; status stays 'accepted' (immutable historical record)
```

**Customer-side actions (`actions/freight-quotes.ts`):**

```ts
// Customer reads/accepts/rejects own sent quotes
listMyFreightQuotes(): Promise<{ ok: true; data: FreightQuote[] } | ...>
getFreightQuote(quote_no: string): Promise<{ ok: true; data: FreightQuoteWithItems } | ...>
acceptFreightQuote(quote_no: string): Promise<...>  // sent → accepted (mirror admin path; idempotent)
```

**Idempotency keys:**
- `adminConvertQuoteToShipment`: check `converted_to_shipment_id IS NULL` before insert; return existing on retry.
- All status flips: optimistic update with `eq('status', expected_from)` race-safe guard.

**Audit log:** every status flip writes an `admin_audit_log` row per ADR-0014 — action: `freight_quote.{status}`, target: `freight_quote`, target_id: id.

---

## UI outline

**Admin (super/ops/sales_admin):**
- `/admin/freight/quotes` — list with status filter chips, search by quote_no / buyer_name / tax_id, date range, "pending my approval" view for super/accounting.
- `/admin/freight/quotes/new` — create draft (multi-line item builder; pre-fills from customer profile if `profile_id` selected).
- `/admin/freight/quotes/[quote_no]` — detail with:
  - quote header (status badge + role-appropriate buttons: edit if draft + own role, submit-for-approval if draft, approve/reject if pending_approval + super/accounting, send if approved, mark-accepted if sent, convert if accepted)
  - line items (inline edit when status=draft)
  - PDF preview link (`/api/freight-quote/[id]/pdf` route)
  - audit timeline (status changes + who did what)

**Customer (`/(protected)/freight/quotes`):**
- list of sent/accepted/rejected/expired quotes for `profile_id`
- detail view at `/freight/quotes/[quote_no]` — read-only PDF view + "ตอบรับ" button (if status=sent + within validity)
- LINE notification (when status flips to `sent`) — "ใบเสนอราคา {quote_no} พร้อมแล้ว"

---

## PDF template

`components/pdf/freight-quote.tsx` — `@react-pdf/renderer` with Sarabun font (mirror `components/pdf/forwarder-receipt.tsx` pattern).

**Layout (Thai standard quotation):**
- Pacred header (CONTACT + TAX_ID from `components/seo/site.ts`)
- "ใบเสนอราคา" title + `quote_no` + issuance date + valid-until date
- Buyer block (name + tax_id + address + contact)
- Line-item table (description · qty · unit · unit_price · line_total)
- Subtotal · VAT 7% · Grand total — readThaiBaht spell-out (already in repo)
- Footer: notes + payment terms + Pacred signature block
- Watermark "REJECTED" / "EXPIRED" when applicable

Route: `app/api/freight-quote/[id]/route.ts` — auth + RLS-scoped + render-on-demand (mirror `app/api/tax-invoice/[id]/route.ts`).

---

## Migration note

One additive migration: `freight_quotes` + `freight_quote_items`. **ภูม assigns the number** (current free slot starts `0044` after WHT migration per ADR-0015 fastlane; this likely lands at `0045+`). All `create table if not exists` — zero risk to existing data.

---

## Acceptance

- A sales rep can draft a quote with N line items, submit for approval; quote stays editable until submission.
- super/accounting see pending-approval queue, can approve (stamps timestamp + admin_id) or reject (requires reason ≥ 3 chars, writes audit row).
- Approved quote can be sent → customer sees in their portal + receives LINE push.
- Customer accepts in portal (or admin marks accepted on their behalf via verbal yes).
- Accepted quote can be converted to a real `freight_shipments` job in one action; `converted_to_shipment_id` linked + UNIQUE prevents double-conversion.
- All status flips audited; rejected/expired non-revertible (force new quote).
- PDF renders with Pacred legal header; watermarked when rejected/expired.

---

## Cross-references

- Schedule + ranking → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E6`
- Schema spine sibling (the converted shipment lives in) → [`docs/port-specs/freight-document-suite.md`](freight-document-suite.md)
- Status-transition + audit pattern → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- RBAC + approval role gate → [ADR-0002 admin architecture](../decisions/0002-admin-architecture.md) + [ADR-0005 K-7 launch ops](../decisions/0005-launch-operational-decisions.md)
- PDF pattern → `components/pdf/forwarder-receipt.tsx` · `components/pdf/tax-invoice.tsx`
- Deep-sweep finding → [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §5.1
- Legacy PHP source → `/Users/dev/Desktop/pcscargo/member/pcs-admin/include/pages/forwarder-quotation/`

**End of V-E6 spec.** ก๊อต: confirm the approval role gate (open question above). ภูม: do not implement until ก๊อต confirms — then schema, actions, UI, PDF in that order.
