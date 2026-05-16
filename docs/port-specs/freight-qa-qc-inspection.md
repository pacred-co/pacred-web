# Port-spec — QA/QC intake inspection (V-E10)

> **Status:** 🟡 spec by เดฟ — Phase I2 backend prep for ภูม. Pre-billing quality gate.
> **Date:** 2026-05-16 night · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-E10` + deep-sweep audit §5.1 C QAAndQC.
>
> **Read with:**
> [`docs/port-specs/freight-receipt-and-payment.md`](freight-receipt-and-payment.md) (V-E7 — billing gate consumer) ·
> [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §5.1 C.

---

## Context

PHP `home/CargoAndFreight/QAAndQC/` has placeholder pages (`QA.php`, `QC.php`, `QAManager.php`) hinting at an intake quality-inspection workflow + `forwarder-check.php` + table `tb_check_forwarder` referenced from billing path. The legacy logic:

1. Container/shipment arrives at TH warehouse
2. Warehouse staff inspects each shipment item: damage? missing? quality OK?
3. If pass → marked `checked` → billing pipeline unlocks
4. If fail → marked `rework` → blocks billing until customer notified + decision made

Pacred today: NO QC concept. Forwarder/shipment goes from `arrived_thailand` → `out_for_delivery` without inspection gate. This means damage claims get raised AFTER delivery (worse — customer paid, then complains).

Building V-E10 adds the inspection step + pre-billing gate (`freight_invoices` for V-E7 cannot issue until linked shipment has `qa_status='pass' OR 'waived'`).

---

## Data model

### `freight_qa_inspections` — inspection record

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `freight_shipment_id` | uuid FK → `freight_shipments(id)` nullable | for freight side. |
| `cargo_shipment_id` | uuid FK → `cargo_shipments(id)` nullable | for cargo side (V-D / consolidated). |
| `inspection_no` | text unique | `QA-{YYMMDD}-{seq}`. |
| `inspected_by_admin_id` | uuid FK → `profiles(id)` | warehouse/QA role. |
| `inspected_at` | timestamptz | |
| `outcome` | text check | `pass` · `fail_minor` (deliverable, customer accepts as-is) · `fail_major` (rework / claim) · `waived` (admin override; requires reason). |
| `damage_level` | text check nullable | `none` · `cosmetic` · `partial` · `total`. |
| `missing_items` | int default 0 | count of items absent vs manifest. |
| `notes` | text | free-text inspection findings. |
| `photo_paths` | text[] | array of Supabase Storage paths (`qa-inspection-photos/{shipment_id}/...`). |
| `waived_reason` | text nullable | required when outcome=`waived`. |
| `waived_by_admin_id` | uuid FK → `profiles(id)` nullable | super-only override. |
| `customer_notified_at` | timestamptz nullable | when fail_minor/major triggered notification. |
| `created_at` · `updated_at` | timestamptz | |

**Constraints:**
- `freight_qa_inspections_one_parent`: exactly one of freight_shipment_id / cargo_shipment_id is non-null
- `freight_qa_inspections_outcome_chk`: in the enum
- `freight_qa_inspections_waived_consistency`: `outcome='waived' → waived_reason + waived_by_admin_id not null AND waived_reason ≥ 5 chars`
- `freight_qa_inspections_damage_consistency`: `outcome in (fail_minor, fail_major) → damage_level is not null`

**Storage bucket:** `qa-inspection-photos/` — private; warehouse + super + accounting read; warehouse write own.

### Pre-billing gate on `freight_invoices`

V-E7's `adminCreateFreightInvoice` must check:

```sql
-- Before issuing invoice for a freight_shipment_id
select count(*) > 0
from freight_qa_inspections
where freight_shipment_id = <input.freight_shipment_id>
  and outcome in ('pass', 'fail_minor', 'waived')
```

If false → return `qa_not_passed` error to admin UI → admin must run inspection first (or super uses waived override).

### RLS

```sql
alter table freight_qa_inspections enable row level security;

-- Customer: read own (when status not draft — only see after admin records it)
create policy qa_inspections_customer_read on freight_qa_inspections for select
  using (exists (select 1 from freight_shipments s
                 where s.id = freight_qa_inspections.freight_shipment_id
                   and s.profile_id = auth.uid())
         OR exists (select 1 from cargo_shipments cs
                    where cs.id = freight_qa_inspections.cargo_shipment_id
                      and cs.profile_id = auth.uid()));

-- Warehouse + super + accounting: full
create policy qa_inspections_admin_all on freight_qa_inspections for all
  using (is_admin(array['super','accounting','warehouse']))
  with check (is_admin(array['super','accounting','warehouse']));
```

---

## Server actions outline

`actions/admin/qa-inspections.ts`:

```ts
adminCreateQaInspection(input: {
  freight_shipment_id?: string;
  cargo_shipment_id?: string;
  outcome: 'pass' | 'fail_minor' | 'fail_major' | 'waived';
  damage_level?: 'none' | 'cosmetic' | 'partial' | 'total';
  missing_items?: number;
  notes?: string;
  photos?: File[];  // FormData
  waived_reason?: string;  // required when outcome='waived'
}): Promise<AdminActionResult<{ id: string; inspection_no: string }>>
//   gated withAdmin(['super','accounting','warehouse'])
//   if outcome=waived: extra check is_admin(['super']) only
//   atomic: insert row + upload photos to qa-inspection-photos/
//   if outcome in (fail_minor, fail_major): notify customer ('qaFailed')
//   audit per ADR-0014

adminUpdateQaInspection(...): // limited to notes + photos (outcome is immutable after creation; create new inspection for re-check)
```

**Customer-side (`actions/qa-inspections.ts`):**

```ts
listMyQaInspections(): Promise<{ ok: true; data: QaInspection[] } | ...>
//   RLS-scoped reads only
getQaInspection(inspection_no): Promise<...>
```

---

## UI outline

**Admin warehouse (`/admin/warehouse/qa/`):**
- Landing: pending-inspection queue (shipments where status='arrived_thailand' AND no inspection yet)
- Detail per shipment: photo upload + checklist + outcome selector + notes
- History view per shipment

**Admin super (`/admin/freight/[shipment_no]`):**
- Inspection section inline on shipment detail page
- "Waive QA" button (super-only) — opens modal requiring `waived_reason`

**Customer (`/(protected)/shipments/[code]`):**
- New "QA Status" panel on existing shipment detail page
- If pass: green pill "ผ่านการตรวจคุณภาพแล้ว"
- If fail_minor: yellow pill + summary + "ยอมรับและรับสินค้า" button (mark accepted-as-is)
- If fail_major: red pill + "ติดต่อทีม" CTA + LINE OA contact

---

## Migration note

One migration: `freight_qa_inspections` + bucket + constraints. ภูม assigns; likely `0050+` (after V-E6/E7/E8/E9). Independent of other freight migrations — can land in any order relative to V-E10 (but V-E7's billing gate refers to this table, so V-E7 implementation needs this table present).

---

## Acceptance

- Warehouse staff can record inspection per arrived shipment with photos + outcome
- V-E7 `adminCreateFreightInvoice` rejects with `qa_not_passed` if no inspection exists
- Super can waive (audit-logged + reason required)
- Customer sees QA status on shipment detail page
- Fail_minor/major notifies customer immediately (LINE push)
- Photos stored in private bucket; customer + admin can view; not publicly accessible

---

## Cross-references

- Schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E10`
- Pre-billing gate consumer → [`port-specs/freight-receipt-and-payment.md`](freight-receipt-and-payment.md) V-E7
- Audit + waive pattern → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- Legacy PHP source →
  - `/Users/dev/Desktop/pcscargo/member/pcs-admin/include/pages/home/CargoAndFreight/QAAndQC/` (placeholder pages)
  - `/Users/dev/Desktop/pcscargo/member/pcs-admin/forwarder-check.php` + `pages/forwarder-check/` (the closer business-logic precedent)

**End of V-E10 spec.** ก๊อต: confirm waive RBAC (proposed super-only). ภูม: implement BEFORE V-E7 if V-E7's billing gate needs to reference this table; else either order works.
