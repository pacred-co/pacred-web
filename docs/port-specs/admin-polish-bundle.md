# Port-spec — Admin polish bundle (V-G1..V-G7)

> **Status:** 🟡 spec by เดฟ — Phase I3 admin polish; one combined doc covering 7 smaller items (each ~150-300 LOC implementation). ภูม implements à la carte once V2 cargo loop launches Monday + V-E* freight stack is in motion.
> **Date:** 2026-05-16 night · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-G1..V-G7` + deep-sweep audit §6.
>
> **Read with:**
> [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §6 AP1..AP24 (broader admin polish list — V-G covers the highest-leverage subset) ·
> [`docs/decisions/0002-admin-architecture.md`](../decisions/0002-admin-architecture.md) (RBAC patterns).

---

## TL;DR — what's in this bundle

| Item | LOC est | Time est | Dependencies |
|---|---|---|---|
| **V-G1** Bulk forwarder actions | ~250 | 3-4h | none |
| **V-G2** Bulk transfer customers to sales rep | ~150 | 2-3h | none |
| **V-G3** Admin push broadcast (popup) | ~300 | 4h | LINE Messaging API live |
| **V-G4** Cargo TOS version management UI | ~200 | 3h | `actions/tos.ts` exists |
| **V-G5** Org 5 contact CRUDs (domain/email/line/tel/wechat) | ~250 | 4-6h | none |
| **V-G6** New admin reports (4 — volume / sales-by-user / user-sales / HS-salary) | ~400 | 6-8h | data sources exist |
| **V-G7** Audit feature-parity verifications | ~50 each | 1h each × 6 = 6h | n/a (audit only) |
| **Total** | ~1850 | ~32-40h | mostly independent |

All items are **V2 long-phase post-Monday launch**. None block Sunday-night blockers (B1-B5).

---

## V-G1 — Bulk forwarder actions

### Problem
Pacred admin can edit forwarders one-at-a-time on `/admin/forwarders/[fNo]`. PHP `forwarder-action.php` + `pages/forwarder-action/` lets staff update N shipments in one form (bulk status flip / bulk driver assignment / bulk note append).

### Design
**Approach:** add a "bulk actions" mode to the existing `/admin/forwarders` list page (mirror the bulk-approve-bar pattern from T-P3 wallet/yuan-payments).

### UI
- Sticky bar appears when ≥1 row checked: "เลือก N รายการ" + dropdown of bulk actions
- Bulk actions:
  - **เปลี่ยน status** (modal: select target status from allowed transitions; rejects mixed states with "ทุกรายการต้องอยู่สถานะเดียวกัน")
  - **มอบหมายคนขับ** (driver picker — applies same driver to all)
  - **เพิ่ม note** (free-text appended with `[BULK YYYY-MM-DD]` prefix to each row's note_admin)
  - **ยกเลิก** (status → cancelled; requires reason ≥ 3 chars; audit per row)

### Server actions (`actions/admin/forwarders-bulk.ts`)
```ts
adminBulkUpdateForwarderStatus({ f_nos: string[]; new_status: string; reason?: string }): Promise<AdminActionResult<{ updated: number; skipped: number; failed: string[] }>>
adminBulkAssignDriver({ f_nos: string[]; driver_admin_id: string }): Promise<...>
adminBulkAppendNote({ f_nos: string[]; note: string }): Promise<...>
adminBulkCancelForwarders({ f_nos: string[]; reason: string }): Promise<...>
```

Each:
- `withAdmin(['super','ops'])` (status flips); `withAdmin(['super'])` for cancel
- Iterates per-row; uses each row's individual validation (mirror non-bulk action gates)
- Returns count of updated / skipped (reason invalid) / failed (with error per id)
- Writes **N audit log rows** (per item, not one bulk row — keeps audit grain)
- Optimistic per-row update via `eq('status', expected)` race-safe

### Acceptance
- Selecting 10 forwarders + "เปลี่ยน status → shipped_china" → 10 audit rows + 10 customer notifications
- Mixed-status rejection works ("3 รายการ skip เพราะอยู่สถานะอื่น")

---

## V-G2 — Bulk transfer customers to sales rep

### Problem
Pacred has per-customer transfer at `/admin/customers/[id]/transfer-rep` (per ภูม night-2). PHP `transferSalesCustomers.php` does this in bulk — staff selects multiple customers + one target rep.

### Design
Add bulk mode to `/admin/customers` list page (filter by current rep → checkbox select → bulk transfer).

### UI
- New route `/admin/customers/transfer-rep` (already exists as placeholder per night-2 — extend)
- Or: add sticky bar on `/admin/customers` list (mirror V-G1 pattern)
- Bulk action: dropdown "ย้ายไป sales rep ใหม่" → picker
- Confirmation: "ย้าย {N} ลูกค้า จาก {old_rep} ไป {new_rep}?" + audit reason text

### Server action (`actions/admin/customers.ts` extension)
```ts
adminBulkTransferRep({
  customer_ids: string[];
  new_rep_admin_id: string;
  reason?: string;
}): Promise<AdminActionResult<{ updated: number }>>
```

Each customer:
- Update `profiles.adminID_sale` (or whatever the existing field is)
- Audit row per customer (action: `customer.rep_transferred`)
- Notify the new rep ('customerAssigned') + old rep ('customerRemoved') via in-app notification

### Acceptance
- Transfer 50 customers to one rep → 50 audit rows + 1 notification to new rep (summary: "ได้รับลูกค้าใหม่ 50 รายจาก {old_rep}") + 1 notification to old rep

---

## V-G3 — Admin push broadcast (popup)

### Problem
Pacred has inbound `/admin/contact-messages` (customer → admin). PHP `popup.php` + `pages/popup/` lets admin send **outbound** push notifications to customers (e.g. "ปิดทำการสงกรานต์ 13-15 เม.ย." / promo announcements). No equivalent in Pacred.

### Design
**Two delivery channels:** in-app notification (existing `notifications` table) + LINE OA push (when customer has `line_user_id`).

### Schema (additive)
Reuse existing `notifications` table; add `kind='broadcast'` value + new metadata column:

```sql
alter table notifications
  add column if not exists broadcast_id uuid references broadcasts(id);

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link_href text,
  audience text check (audience in ('all','juristic_only','personal_only','specific_ids','specific_segment')),
  audience_ids uuid[],   -- when audience='specific_ids'
  audience_segment_query jsonb,  -- when audience='specific_segment' (future)
  scheduled_for timestamptz,    -- nullable; null = send now
  status text check (status in ('draft','scheduled','sending','sent','cancelled')),
  sent_count int default 0,
  failed_count int default 0,
  created_by_admin_id uuid references profiles(id),
  sent_at timestamptz,
  created_at timestamptz default now()
);
```

### Server actions (`actions/admin/broadcasts.ts` — super + super_user_marketing? TBD)
```ts
adminCreateBroadcast(input): Promise<AdminActionResult<{ id }>>  // draft state
adminScheduleBroadcast(id, scheduled_for): Promise<...>  // draft → scheduled
adminSendBroadcastNow(id): Promise<...>  // draft → sending → sent (writes N notifications + N LINE pushes)
adminCancelBroadcast(id): Promise<...>  // draft|scheduled → cancelled
```

Cron `/api/cron/send-scheduled-broadcasts` (every 5 min) — picks up `scheduled` rows past `scheduled_for` → marks `sending` → bulk-creates notification rows + fires LINE push (rate-limited per LINE OA per-second quota).

### UI (`/admin/broadcasts`)
- List with status filter (draft / scheduled / sent / cancelled)
- New broadcast page: title + body (markdown light) + link_href + audience picker + schedule (now / later)
- Detail view: stats (sent / failed / read-rate from existing `notifications` read tracking)

### Acceptance
- Admin composes broadcast → preview → schedule for tomorrow 10:00 → cron fires at 10:00 → N customers receive in-app + LINE
- Failed deliveries logged in `broadcasts.failed_count`; retry logic per LINE API spec

### Open question for ก๊อต
- Audience filter: which RBAC role can broadcast to **all** customers? Recommend super only; sales_admin can do `specific_ids` (lead nurture only).

---

## V-G4 — Cargo TOS version management UI

### Problem
`actions/tos.ts::acceptCurrentTos` exists + `profiles.tos_accepted_version` column tracks acceptance. But there's NO admin UI to create new TOS versions, view who-accepted-what, or force re-acceptance.

### Design
Add `tos_versions` table + admin CRUD + customer-side gate (already partially in `actions/tos.ts`).

### Schema
```sql
create table tos_versions (
  id uuid primary key default gen_random_uuid(),
  version_no text unique,  -- e.g. "v2.0", "2026-05-16"
  title text not null,
  body_md text not null,   -- markdown source
  effective_from date not null,
  is_active bool default true,
  created_by_admin_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table tos_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  tos_version_id uuid references tos_versions(id),
  accepted_at timestamptz default now(),
  ip_address inet,
  user_agent text
);

create unique index tos_acceptances_profile_version on tos_acceptances (profile_id, tos_version_id);
```

(Note: `profiles.tos_accepted_version` column stays — denormalises latest acceptance for fast gate check. `lib/tos.ts::CURRENT_TOS_VERSION` becomes a DB read instead of hardcode.)

### UI (`/admin/settings/tos-versions`)
- List of versions (active highlighted)
- "เพิ่ม version ใหม่" → markdown editor (existing pattern)
- Per-version: acceptance count + "ดู acceptances" drill-down
- Toggle active/inactive

### Customer gate (extends existing)
- On every protected layout load, check `profile.tos_accepted_version < latest_active_tos.version_no` → show modal
- Modal: TOS body + accept button → calls existing `acceptCurrentTos`

### Acceptance
- Admin creates v2.0 → effective tomorrow → cron flips active flag
- Next-day, all customers see TOS modal on first visit until they accept

---

## V-G5 — Org 5 contact CRUDs

### Problem
PHP has 5 admin micro-modules: `organization-{domainname,email,line,tell,wechat}/` — each lets admin manage one type of org contact info (e.g. multiple LINE OA IDs, multiple email addresses by department). Pacred currently has contact constants hardcoded in `components/seo/site.ts` — owner can't self-serve update.

### Design
Single `org_contacts` table with type discriminator + admin CRUD page.

### Schema
```sql
create table org_contacts (
  id uuid primary key default gen_random_uuid(),
  kind text check (kind in ('domain','email','line_oa','phone','wechat','social','address')),
  label text not null,        -- e.g. "ฝ่ายลูกค้า", "Cargo line", "Bangkok office"
  value text not null,         -- the actual contact value (URL / email / phone / etc.)
  department text,             -- optional grouping
  is_active bool default true,
  display_order smallint default 0,
  notes text,
  created_by_admin_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index org_contacts_kind_active on org_contacts (kind, is_active);
```

### UI (`/admin/settings/contacts`)
- Tabs per kind (domain / email / line / phone / wechat / social / address)
- Each tab: simple CRUD table + inline add form
- Drag-to-reorder via display_order

### Migration path from `components/seo/site.ts`
1. Seed migration inserts current constant values (CONTACT.phone, LINE_OA, SOCIAL, ADDRESSES) into `org_contacts`
2. `components/seo/site.ts` becomes optional fallback (when DB unreachable / build time)
3. Site components read from DB via `getOrgContacts()` helper — cached at request level
4. Footer + service pages auto-update when admin edits

### Acceptance
- Owner can change LINE OA URL via admin UI → immediately reflected on landing footer
- Adding a new email under "ฝ่ายบัญชี" → shows in contact list on contact-us page

---

## V-G6 — New admin reports (4)

### Problem
PHP has 4 reports Pacred doesn't have:
- `report-forwarder-volume.php` — shipment volume per forwarder per period
- `report-sales-group-by-user.php` — sales revenue per rep
- `report-user-sales.php` — individual customer sales history (admin view)
- `salary-hs.php` — staff salary/commission per HS code (revenue contribution analysis)

### Design
Add 4 routes under `/admin/reports/` mirroring the existing V-B1 pattern (6 reports per ภูม night-1).

| Route | Source query | Columns |
|---|---|---|
| `/admin/reports/forwarder-volume` | `forwarders` join `cargo_shipments` | period · forwarder name · shipment count · total cbm · total kg · total revenue |
| `/admin/reports/sales-by-rep` | `service_orders` + `forwarders` grouped by `adminID_sale` | rep · order count · total revenue · commission earned · vs prev period |
| `/admin/reports/user-sales-history/[customer_id]` | `service_orders` + `forwarders` + `yuan_payments` for that customer | timeline of all transactions w/ total |
| `/admin/reports/hs-code-revenue` | `cargo_shipments` join `hs_codes` grouped by HS code | hs code · description · shipment count · total revenue · top-3 forwarders carrying it |

### Each implements
- Date range filter (default 30d)
- CSV export
- Drill-down: click row → relevant detail page
- Role-gated per `withAdmin([...])`

### Acceptance
- Reports load in < 2s for 1-year data range
- CSV matches the displayed table

---

## V-G7 — Audit feature-parity verifications (no implementation; ~1h each)

### Problem
6 PHP features may or may not be fully covered by Pacred. ภูม spot-checks each + writes a 1-pager: covered ✓ / partial 🟡 / gap 🔴.

### List
| PHP file | Pacred surface to compare | Audit doc target |
|---|---|---|
| `forwarder-driver.php` (admin assign + bulk + report) | `/admin/barcode/driver` + `actions/admin/forwarder-drivers.ts` | `docs/audit/parity-forwarder-driver.md` |
| `time-attendance-system.php` (HR + reports + leaves) | `/admin/hr/attendance` + `/admin/hr/attendance/leaves` | `docs/audit/parity-time-attendance.md` |
| `hs-customrate.php` (per-customer HS rate) | `/admin/rates/custom-hs` | `docs/audit/parity-hs-customrate.md` |
| `settings-vip.php` (VIP-tier-specific config) | `/admin/rates/vip` + `/admin/settings` | `docs/audit/parity-settings-vip.md` |
| `admin-profile.php` (152KB — large feature) | `/admin/admins/[id]` + admin profile pages | `docs/audit/parity-admin-profile.md` |
| `admin-table.php` (admin list + RBAC config) | `/admin/admins` | `docs/audit/parity-admin-table.md` |

### Each audit doc
- Side-by-side feature checklist (PHP capability → Pacred surface + status)
- Gap-list with implementation effort estimate
- Recommendation: "ship gap" / "covered, no action" / "defer to V2.1"

### Acceptance
6 audit docs in `docs/audit/parity-*` + summary table in PORT_PLAN noting which gaps need building.

---

## Migration note (cumulative)

V-G1 + V-G2: no schema changes (use existing tables).
V-G3: 1 migration (broadcasts table + notifications.broadcast_id FK).
V-G4: 1 migration (tos_versions + tos_acceptances).
V-G5: 1 migration (org_contacts + seed from site.ts constants).
V-G6: no schema changes (read-only queries on existing tables).
V-G7: no schema changes (audit only).

Total: 3 new migrations. ภูม assigns numbers; likely `0053+` after V-E* stack.

---

## Acceptance — full bundle

- All 7 V-G items mergeable independently (no blocking deps between them, except V-G3 cron needs LINE push live which is DV-2)
- All follow existing patterns (KPI cards from T-P5 · bulk-action bars from T-P3 · audit log per ADR-0014)
- Each one's PR ≤ 500 LOC + tests + brief commit message

---

## Cross-references

- Schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-G1..V-G7`
- Broader admin polish list (24 items; V-G is the top-7 subset) → [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §6 AP1..AP24
- RBAC patterns → [ADR-0002](../decisions/0002-admin-architecture.md) + [ADR-0005 K-7](../decisions/0005-launch-operational-decisions.md)
- Bulk-action UI pattern → ภูม T-P3 sticky bar in `/admin/wallet` + `/admin/yuan-payments`
- KPI card pattern → ภูม T-P5 in `/admin/accounting`
- Audit row pattern → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- Legacy PHP source paths (per item) → linked in each V-G section above

**End of V-G bundle spec.** ภูม picks items à la carte after Monday launch. ก๊อต: confirm V-G3 broadcast RBAC (super-only for all-customers; sales_admin for specific_ids).
