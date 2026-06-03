# ใบวางบิล (Billing-Run · `hs-forwarder-invoice`) — gap audit + R-1/R-2/R-3 port options

**Created:** 2026-06-03 (เดฟ session · Poom-pacred lane · post merge with dave-pacred)
**Purpose:** answer ภูม's "ทำใบวางบิล" by mapping the legacy PCS feature, the
current Pacred state, the gap, and three concrete R-N implementation options.
**Method:** legacy deep-audit from source per AGENTS.md §0b — every legacy
claim cites the file + line range so Pacred Claude can re-verify.

---

## TL;DR (5 lines for ภูม)

1. **The gap is real and orthogonal to combine-bill.** ใบรวมบิล (combine-bill)
   is fully ported and lives at `/admin/forwarders/combine-bill` (`tb_bill` +
   `tb_bill_item`). ใบวางบิล / ใบแจ้งหนี้ฝากนำเข้า (the credit-line monthly
   batch) is **completely missing** — no admin surface, no customer view, no
   server action.
2. **The legacy is print-only.** `hs-forwarder-invoice.php` doesn't persist a
   record on submit — it just renders a PDF via `printAll/`. The "saved
   invoice" lives in the customer's email/LINE + the printed paper. There's
   NO `tb_invoice_*` table in the legacy schema.
3. **Filter is `fStatus = 5` per single userID** (after delivery, before
   payment) — credit-line customers only.
4. **Recommend R-3 (Hybrid)** — ship the R-1 stub now (~3-5h) that **adds**
   persistence (a `tb_forwarder_invoice*` family migration) so the legacy
   gap closes AND we don't lose history; then R-2 polish (PDF + email +
   credit-term enforcement + customer-side view) in next sitting (~10-12h).
5. **Blocker:** 4 decision questions for ภูม (doc-number format · PDF library
   choice · delivery channel · whether to backfill any pre-launch history)
   before R-1 can start.

---

## §1 Legacy reality (truth from source)

### 1.1 `forwarder-bill.php` (1277 LOC) — ALREADY PORTED, here for completeness

Three modes (URL dispatcher via `$_GET['page']`):

| Mode | Lines | Reads | Output | Pacred status |
|---|---|---|---|---|
| (default) | 5-352 | `tb_bill` + `tb_bill_item` + `tb_forwarder` | combine-bill history list with filters (90d / range / all) | ✅ `/admin/forwarders/combine-bill/page.tsx` |
| `?page=add` | 393-515 | (form to write) | create new combine-bill | ✅ `/admin/forwarders/combine-bill/add/page.tsx` |
| `?page=detail&id=X` | 543-1277 | `tb_bill` + `tb_bill_item` + image upload | detail + image edit | ✅ `/admin/forwarders/combine-bill/[id]/page.tsx` |
| (`printBill.php?...`) | 325 LOC | `tb_bill` + `tb_bill_item` | PDF render | ✅ `/admin/forwarders/combine-bill/print/page.tsx` |

**Conclusion:** combine-bill (ใบรวมบิล) is **DONE**. The user-facing concept
"คุณกดปุ่มสร้างใบรวมบิลจากหลายรายการ" works on Pacred today.

### 1.2 `hs-forwarder-invoice.php` (30 LOC dispatcher) — THIS IS THE GAP

```php
switch ($page) {
  case 'detail': require_once('include/pages/hs-forwarder-invoice/detail.php');
  case 'add':    require_once('include/pages/hs-forwarder-invoice/add.php');
  default:       require_once('include/pages/hs-forwarder-invoice/home.php');
}
```

- `home.php` (88 LOC) = nearly-empty hero card with a "คำแนะนำการใช้งาน" modal +
  "เพิ่มรายการใหม่" CTA → `?page=add`. **No list of past invoices** — meaning
  the legacy never persisted history. (Lines 60-65 of `home.php`.)
- `add.php` (355 LOC) = the actual form. See §1.3.
- `detail.php` = referenced at L12 of dispatcher but file absent from the
  extracted tree — likely a stub or dead code path.

### 1.3 `hs-forwarder-invoice/add.php` (355 LOC) — the form

**Customer selector dropdown (L97-114):**
```sql
SELECT u.userID, userName, userLastName, corporateNumber, corporateName
FROM tb_forwarder f
LEFT JOIN tb_users u ON f.userID = u.userID
LEFT JOIN tb_corporate c ON c.userID = u.userID
WHERE f.fStatus = 5
GROUP BY f.userID
ORDER BY f.userID
```
→ Only customers with at least one **delivered-awaiting-payment** forwarder
(`fStatus=5`) appear. Juristic display when `corporateNumber != ''` else
person name.

**Form sections:**
- Doc number (auto-generated `$newID` — placeholder string, never actually
  assigned in the visible code — likely set by `getInvoiceNo()` or a
  function not yet found · could be `FRG{yyMM}-{NNNNN}` like
  `mint-receipt-doc-no.ts`)
- Date issued (`<input type="date">` defaults to today)
- Date due (`<input type="date">` defaults to today — customer must change)
- Customer info: address list + tel list (AJAX-loaded)
- Credit-line info: personType, coTags, credit setting, credit days,
  credit balance (AJAX-loaded · read-only display)
- Forwarder items table (AJAX-loaded): ID, order-no, tracking,
  box count, weight, CBM, amount, status
- Summary footer: Total · Delivery Charge CHN · Delivery Charge TH ·
  Other · Discount · **Total Amount** (bg-danger2)
- "หมายเหตุสำหรับลูกค้า" textarea
- Reset + "สร้างใบแจ้งหนี้" submit (form action = `printAll/`, method = GET)

**Two AJAX endpoints (L307-345):**
1. `getUserFS5.php` (POST `userID`) → returns `{ address, userTel, personType,
   coID, userCredit, userCreditValue, userCreditDate }` JSON
2. `forwarder-invoice/listForwarderItem.php` (POST `userID`) → returns HTML
   fragment with the populated `<table>` rows

**🚨 Critical observation:** the form's `action="printAll/"` is **GET** — meaning
the submit goes straight to the print template. **There is no INSERT into any
`tb_invoice_*` table.** The "invoice" exists only as a printed/PDF document.
The customer's payment trail back to the invoice number must rely on either
(a) the printed paper, (b) the doc-no convention `FRG{yyMM}-{NNNNN}`, or
(c) the forwarder IDs themselves.

### 1.4 `printBill.php` (325 LOC) — print template

Reads from `tb_bill` + `tb_bill_item` (for combine-bill). The
`hs-forwarder-invoice` printAll endpoint is a DIFFERENT print template (the
form submits to `<basePathAdmin>printAll/` — separate file under
`printAll/` directory) — not yet read but follows the same mPDF pattern as
the existing port (`lib/admin/print-receipt-faithful.ts` is the analogue
already shipped).

### 1.5 Customer-side surface

`grep "hs-forwarder-invoice\|getUserFS5" -r D:/REALSHITDATAPCS/pcsc/public_html/member/`
turns up:
- The admin add.php (already covered)
- The 2 AJAX endpoints
- **No customer-facing page renders invoices.** Customer sees them via
  email attachment / LINE OA push / printed paper only.

→ Customer-side gap is "**no in-app view**" — port may want to add one
(Pacred enhancement, not legacy parity).

---

## §2 Pacred current state

### 2.1 What's PORTED

| Surface | Path | Tables |
|---|---|---|
| Combine-bill list | `/admin/forwarders/combine-bill` | `tb_bill`, `tb_bill_item` |
| Combine-bill detail | `/admin/forwarders/combine-bill/[id]` | same |
| Combine-bill add | `/admin/forwarders/combine-bill/add` | same |
| Combine-bill print | `/admin/forwarders/combine-bill/print` | same |
| Server action | `actions/admin/combine-bill.ts` | `adminCreateCombineBill`, `adminDeleteCombineBill` |
| URL helpers | `lib/admin/combine-bill-urls.ts` | — |

The pattern (server-action minter + list page + add form + print page) is
the proven precedent for the ใบวางบิล port.

### 2.2 What's MISSING (the ใบวางบิล gap)

| Need | Status |
|---|---|
| Admin invoice list (`/admin/billing-run`) | ❌ |
| Admin invoice add form (`/admin/billing-run/add`) | ❌ |
| Admin invoice detail (`/admin/billing-run/[id]`) | ❌ |
| Print/PDF route (`/admin/billing-run/[id]/print`) | ❌ |
| Server actions (`actions/admin/billing-run.ts`) | ❌ |
| `tb_forwarder_invoice` table | ❌ (legacy never had it either) |
| `tb_forwarder_invoice_item` line-items table | ❌ |
| Doc-number minter (`FRG{yyMM}-{NNNNN}`) | 🟡 `lib/admin/mint-receipt-doc-no.ts` exists for `FRC/FRG` — needs new variant or reuse |
| Sidebar entry (per AGENTS.md §0d reachability) | ❌ |
| Customer-side "ใบวางบิลของฉัน" page (Pacred enhancement) | ❌ |
| Delivery channel (email / LINE / mailto) | ❌ |

### 2.3 Data already available

From [`docs/briefs/poom-wave-2026-06-01.md`](../briefs/poom-wave-2026-06-01.md):
- `tb_bill` 10,643 rows (combine-bill — already used)
- `tb_bill_item` 26,031 rows (combine-bill — already used)
- `tb_forwarder` 47,636 rows with `fStatus = 5` filter available
- `tb_users` + `tb_corporate` joins for credit-line metadata
- ภูม brief §3.4 mentions per-class WHT engine (`lib/tax/wht.ts`) +
  `tb_forwarder_tax_invoice*` (migration 0129) for tax-invoice flow —
  **NOT the same as ใบวางบิล**: tax-invoice is a single-job RD-86 doc;
  ใบวางบิล is the operational dunning letter listing multiple jobs.

---

## §3 Gap diff table (legacy mode ↔ Pacred path)

| Legacy file:line | Function | Reads | Writes | Output | Pacred status | Gap kind |
|---|---|---|---|---|---|---|
| `forwarder-bill.php` (DEFAULT) | combine-bill history list | `tb_bill`+`tb_bill_item`+`tb_forwarder` | — | HTML list | ✅ `/admin/forwarders/combine-bill/page.tsx` | ✓ DONE |
| `forwarder-bill.php` `?page=add` | create combine-bill | (form) | `tb_bill`+`tb_bill_item` | redirect | ✅ `/admin/forwarders/combine-bill/add/page.tsx` | ✓ DONE |
| `forwarder-bill.php` `?page=detail&id=X` | edit combine-bill | `tb_bill` | `tb_bill_item` + image | HTML | ✅ `/admin/forwarders/combine-bill/[id]/page.tsx` | ✓ DONE |
| `printBill.php` | combine-bill PDF | `tb_bill`+`tb_bill_item` | — | mPDF | ✅ `/admin/forwarders/combine-bill/print/page.tsx` | ✓ DONE |
| `hs-forwarder-invoice.php` (default) | ใบวางบิล home | — | — | hero card + CTA | ❌ MISSING | LOAD-BEARING |
| `hs-forwarder-invoice/add.php` | ใบวางบิล form | `tb_forwarder` (fStatus=5), `tb_users`, `tb_corporate` | (none — print only) | HTML form | ❌ MISSING | LOAD-BEARING |
| `printAll/` (referenced by add.php submit) | ใบวางบิล PDF | (form GET data) | — | mPDF | ❌ MISSING | LOAD-BEARING |
| `getUserFS5.php` AJAX | user metadata for invoice | `tb_users`+`tb_corporate` | — | JSON | ❌ MISSING | helper (can inline in server action) |
| `listForwarderItem.php` AJAX | forwarder rows for invoice | `tb_forwarder` | — | HTML fragment | ❌ MISSING | helper (can inline in server component) |

**Bottom line:** 5 surfaces to build (home/add/detail/print + server actions),
2 helpers to inline, 1 sidebar entry to wire. Total **new** Pacred work +
optional schema additions to give us the history the legacy never persisted.

---

## §4 Three R-N options

### R-1: Quick stub (~3-5h · safe to ship)

**Goal:** unblock ภูม + close the reachability gap (AGENTS.md §0d) with a
working surface that ALSO persists to a new `tb_forwarder_invoice*` family
(the legacy didn't — but a Pacred enhancement closes a real history hole).

**Build:**
1. New migration `0137_forwarder_invoice.sql`:
   - `tb_forwarder_invoice` (id · doc_no · userid · date_issued · date_due ·
     buyer_name · buyer_tax_id · buyer_address · is_juristic · total_thb ·
     status enum [`issued`, `paid`, `cancelled`] · issued_at · issued_by ·
     note_for_customer · created_at · updated_at)
   - `tb_forwarder_invoice_item` (id · invoice_id · forwarder_id · amount_thb)
   - Doc-number sequence helper (`forwarder_invoice_no_seq`)
   - RLS: super + accounting roles only
2. Server actions `actions/admin/billing-run.ts`:
   - `adminListBillingRunCustomers()` → list of customers with eligible
     forwarders (mirrors legacy `SELECT … WHERE fStatus=5 GROUP BY userID`)
   - `adminListEligibleForwarders(userID)` → forwarder rows for the picker
   - `adminCreateBillingRunInvoice(input)` → inserts header + items, mints
     doc_no, returns the new invoice id
   - `adminMarkBillingRunPaid(invoiceID)` → flips `paid` status
3. Doc-number minter — extend `lib/admin/mint-receipt-doc-no.ts` with a
   `FRI{yyMM}-{NNNNN}` (Forwarder Invoice) variant **or** reuse `FRG`
   (decision Q1 below).
4. Pages:
   - `/admin/billing-run/page.tsx` — list of issued invoices, filters
     by date range + status (style follows `combine-bill/page.tsx`)
   - `/admin/billing-run/add/page.tsx` — form: customer picker → eligible
     forwarder checkboxes → date due → note → submit → server action →
     redirect to `[id]`
   - `/admin/billing-run/[id]/page.tsx` — detail with print button +
     "บันทึกการรับชำระ" action (writes status `paid`)
5. Sidebar wire — add to `lib/admin/sidebar-menu.ts` under accounting block

**What we DEFER to R-2:**
- PDF print (will banner "🚧 R-2: ดาวน์โหลด PDF") — for now staff print
  via browser Print
- Email / LINE delivery (banner "🚧 R-2: ส่งผ่านอีเมล/LINE")
- Customer-side "ใบวางบิลของฉัน" page
- Credit-balance enforcement (read-only display only, no automatic gating)
- 50-ทวิ certificate hook (separate Phase C)

**Why R-1 alone is enough to unblock the operational need:** staff can
create the invoice, persist it, mark it paid. Customer gets the printed
copy by phone/LINE/email manually (the same way legacy worked — the
delivery channel was never automated).

### R-2: Full faithful port (~10-12h · the "Pacred completes legacy" version)

**Adds on top of R-1:**
1. PDF print route `/admin/billing-run/[id]/print/page.tsx` — use existing
   mPDF / `@react-pdf` pattern from `combine-bill/print/page.tsx`
2. Email send button → reuse `lib/notifications/email.ts` (already wired
   for receipts)
3. LINE OA push button → reuse `notifyCustomerLine()` from
   `lib/notifications/index.ts`
4. Customer-side `/billing-run` page (juristic only, gated on
   `tb_users.userCompany='1'`) — list of their invoices + status + amount
   + PDF download link
5. Credit-balance enforcement: if customer's credit balance would go
   negative, block "สร้างใบวางบิล" with explanation
6. Status timeline: issued → due-approaching → overdue → paid (cron
   `daily-overdue-check`)
7. Print-PDF watermark "ต้นฉบับ / สำเนา" duplicating combine-bill behavior
8. Recently-paid receipt auto-link (if `tb_receipt` has matching rows)

### R-3: Hybrid (~3-5h R-1 NOW · ~10-12h R-2 NEXT SITTING)

**Recommended.** Ship R-1 today so the operational gap closes immediately
(staff stops hand-writing invoices). Then R-2 next sitting after ภูม
confirms the doc-number format + delivery channel preferences.

Reasoning:
- The legacy is print-only — R-1 already exceeds it via persistence
- R-2 features (PDF/email/LINE/customer view) are valuable but not
  blockers — staff already has manual workarounds
- R-1 is small enough (~5h) to ship + verify in one session with
  `pnpm verify` + click-through per AGENTS.md §0c
- R-2 lands in a SECOND sitting with PDF library choice locked in
- Customer-side view in R-2 step 4 is a Pacred enhancement worth the
  delay (legacy parity isn't required for the gap to close)

---

## §5 Open questions for ภูม (must answer before R-1 starts)

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Doc-number prefix — `FRI{yyMM}-{NNNNN}` (Forwarder Invoice · new) or reuse `FRG{yyMM}-{NNNNN}` from receipts? | Use `FRI` — clearer audit trail · separate sequence |
| Q2 | Filter for eligible forwarders — `fStatus=5` only (legacy) or `fStatus IN (5,6,7)` to include "in-transit-billed"? | Mirror legacy exactly: `fStatus=5` |
| Q3 | Pre-launch backfill — generate retroactive `tb_forwarder_invoice` rows for fStatus=5 forwarders without one (so "list" page shows history)? | NO — start fresh from R-1 ship date, run a one-off `scripts/backfill-billing-run-history.mjs` only if ภูม asks |
| Q4 | Date-due default — today's date (legacy) or `today + 30 days` (juristic credit term)? | `today + customer's userCreditValue` (use the actual credit term from `tb_users.userCreditValue`) |
| Q5 | Customer-side view (R-2 §4) — wait for R-2 or include as cheap addition in R-1? | Wait for R-2 — keeps R-1 surface area small |
| Q6 | Pre-existing `mint-receipt-doc-no.ts` extension — extend with `FRI` variant or duplicate the function? | Extend — single source of truth for monthly sequence helpers |

---

## §6 Implementation order (if R-3 picked)

**R-1 (this sitting · ~3-5h):**
1. Write migration 0137 (15 min)
2. Apply migration via Supabase Dashboard (ภูม or owner-cleared)
3. Server actions (60 min) — `actions/admin/billing-run.ts`
4. Extend doc-no minter (15 min)
5. Build `/admin/billing-run/page.tsx` (45 min · pattern-mirror `combine-bill`)
6. Build `/admin/billing-run/add/page.tsx` (90 min · the heaviest piece)
7. Build `/admin/billing-run/[id]/page.tsx` (45 min)
8. Sidebar wire + lint + tsc + commit (30 min)
9. Manual click-through per AGENTS.md §0c (15 min)

**R-2 (next sitting · ~10-12h):** order TBD based on what R-1 reveals.

---

## §7 Cross-links

- Combine-bill (the precedent pattern): `app/[locale]/(admin)/admin/forwarders/combine-bill/`
- Receipt doc-no minter: `lib/admin/mint-receipt-doc-no.ts`
- Auto-receipt on payment: `lib/admin/auto-issue-receipt.ts`
- Tax-invoice (different but related): `actions/admin/etax-export.ts`
- ภูม brief: [`docs/briefs/poom-wave-2026-06-01.md`](../briefs/poom-wave-2026-06-01.md)
- Legacy: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\hs-forwarder-invoice.php` + `include/pages/hs-forwarder-invoice/*.php`
- AGENTS.md §0b (deep-audit-from-source) + §0d (reachability) + §0e (Potemkin sweep)

---

**Status:** awaiting ภูม decision on R-1/R-2/R-3 + answers to Q1-Q6.
