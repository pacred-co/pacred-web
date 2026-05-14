# PCS Cargo branding scrub — execution runbook (Part R2 / K-3)

Last updated: 2026-05-16

> Per R2 conviction (ภูม flag 2026-05-15 ค่ำ): "ตัด PCS ออกหมดด้วย — ไม่อยาก
> ให้ vendor เก่ารู้ว่า Pacred ทำเว็บใหม่." This runbook captures what's
> already scrubbed, what's intentionally kept, and what still needs work.

---

## What R2 actually means

Three surfaces matter for the "no leak to legacy vendor" goal:

1. **User-visible UI / PDF / email** that a customer or vendor could see in a
   browser, downloaded PDF, or admin tool. Any "PCS Cargo" / "pcscargo.co.th"
   / legacy phone or bank number here = leak. **Must scrub.**

2. **Source code comments + audit doc** that reference where features were
   ported from. Never reach client bundle (compiled away or filtered) and
   never reach external services. Keeping them is a deliberate engineering
   choice — they unblock future ports. **Keep.**

3. **Migration SQL + helper comments** referencing legacy table names or PHP
   file paths. Same as (2). **Keep.**

If you find yourself thinking "should I scrub this code comment?" — re-read
this section. The answer is no unless it's shipped to a user.

## What's done (2026-05-16)

### Replaced legacy phone `02-444-7046` → `CONTACT.phoneCompanyDisplay`

The old PCS Cargo central line was hard-coded in 4 user-visible files. Now
all 4 import from `components/seo/site.ts`:

| File | Surface | Before | After |
|---|---|---|---|
| `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx` (×2) | HTML receipt page header + footer | `02-444-7046 · contact@pacred.co` + `02-444-7046 / LINE @pacred` | `{CONTACT.phoneCompanyDisplay}` + `{CONTACT.email}` |
| `components/sales-rep-card.tsx` | Fallback "Customer Care" card | `tel:024447046` + `📞 02-444-7046` | `tel:${CONTACT.phoneCompany}` + `{CONTACT.phoneCompanyDisplay}` |
| `components/pdf/forwarder-receipt.tsx` (×2) | PDF receipt header + footer | Legacy address + phone + email | `{ADDRESSES.office.full}` + `{CONTACT.phoneCompanyDisplay}` + `{CONTACT.email}` |
| `components/pdf/shop-order-receipt.tsx` (×2) | PDF receipt header + footer | Same | Same |

### Replaced legacy address `12 ซอยเพชรเกษม 77...` → `ADDRESSES.office.full`

Receipt pages + PDF templates were also hard-coding the legacy office
address. All now read from `components/seo/site.ts ADDRESSES.office.full`
which is the authoritative Pacred HQ per `docs/pacred-info.md`.

### Replaced legacy footer i18n keys

`messages/{th,en}.json` footer block previously had placeholders:
- `address: "123 ถนนตัวอย่าง กรุงเทพฯ 10110"` → real Pacred address (commit `903f4ac`)
- `phone: "02-XXX-XXXX"` → `02-421-3325` (commit `903f4ac`)
- `email: "contact@pacred.com"` → `contact@pacred.co` (commit `903f4ac`)

## What's kept (intentional, not a leak)

### Code comments referencing legacy PHP source paths

Examples:
```
lib/utils/thai-number.ts:4    Ported from PHP `ReadNumber()` in pcs-cargo legacy
lib/forwarder/calc-price.ts:2 Forwarder price engine — port of legacy apiCalPrice.php (PCS Cargo)
lib/bkk-zip.ts:5              Ported verbatim from D:\xampp\htdocs\pcscargo\member\include\function.php
app/api/cron/*/route.ts       @see pcs-admin\api\autorun\... (full PHP path)
```

These are **engineering traceability** — they let future devs find the
original logic when extending behaviour. They never ship to the client
bundle (build strips comments) and never appear in any user-facing
surface. **Keep as-is.**

### Audit doc reference path strings

`lib/china-search/{index,akucargo,laonet}.ts` reference
`docs/audit/php-pcscargo-integrations.md` in their docstrings. Same
rationale — internal pointer for future maintainers. The audit doc
itself is gitignored from any external publication (internal-only per
Part R2). **Keep.**

### Migration SQL comments

`supabase/migrations/0011_service_order.sql`,
`supabase/migrations/0013_sales_referral.sql`,
`supabase/migrations/0017_org_chart.sql` cite legacy table layouts as
"Cross-checked against legacy code at D:\xampp\htdocs\pcscargo\:". Same
rationale. **Keep.**

### Doc / ADR cross-links

- `docs/PORT_PLAN.md`, `docs/HANDBOOK.md`, ADRs 0001-0007 all reference
  the PHP source for context. Internal-only documentation. **Keep.**

### Grep-hint comment in `components/seo/site.ts`

The block comment at lines 16-19 says "see grep `066-131-0253` /
`02-444-7046` (PCS Cargo legacy values)" so future engineers can find
residual hardcoded refs. **Keep — it's the meta-doc for THIS runbook.**

## What's still pending (production blocker, not a code scrub)

These can't be cleaned from code — they require Pacred owner action:

| Item | Why | Where blocked |
|---|---|---|
| **Bank account `064-174-3836` Kasikorn** | Legacy PCS account; Pacred must open a fresh one before PromptPay flows can launch | Part Q Bundle 1 — Pacred owner |
| **PromptPay number / Account name on QR receipts** | Reads from `process.env.PROMPTPAY_ID`; currently unset; throws on `/wallet/deposit` | Part Q Bundle 1 |
| **Email sender domain (mail.tam-i-t.com legacy)** | Legacy used `pcscargo@tam-i-t.com` SMTP. Pacred port uses Resend; no SMTP credentials in code | Resolved by ADR-0001 (LINE Messaging API push + Resend email) |

When Pacred owner provides the bank acct + PromptPay number:
1. Set `PROMPTPAY_ID` in Vercel env (Part Q Bundle 1)
2. Update `docs/pacred-info.md` "Pending — owner to provide" — strike the
   bank acct + PromptPay line
3. Verify `/wallet/deposit` flow no longer throws

## Grep commands (for ongoing audit)

When changing customer-facing code, run these to catch new leaks:

```bash
# User-visible files with legacy phone
grep -rn "02-444-7046" --include='*.tsx' --include='*.ts' app components

# User-visible files with legacy address
grep -rn "ซอยเพชรเกษม 77" --include='*.tsx' app components

# Legacy bank acct
grep -rn "064-174-3836" --include='*.tsx' --include='*.ts' app components lib actions

# Legacy domain references in user-visible code (skip docs/audit + seo/site.ts grep-hint comment)
grep -rn "pcscargo.co.th" --include='*.tsx' --include='*.ts' app components
```

Expected output for all four: empty (or `seo/site.ts` grep-hint line only).

## Roles

- **เดฟ** owns the scrub plan + initial fix sweep (this commit + the
  footer i18n commit `903f4ac`)
- **ภูม** + **ปอน** own ongoing vigilance — when adding new customer-facing
  text or PDF templates, prefer `CONTACT.*` + `ADDRESSES.*` imports
  over hardcoded strings (see `docs/pacred-info.md` for the constant
  catalogue)
- **ก๊อต** approves any change to "what counts as a leak" (the
  intentional-keep list in this runbook)

## References

- `docs/PORT_PLAN.md` Part R2 — original conviction note
- `docs/PORT_PLAN.md` Part S2 K-3 — assigned to ก๊อต for execution plan;
  this runbook satisfies that
- `docs/pacred-info.md` — authoritative source for replacement values
  (CONTACT, ADDRESSES, SOCIAL, LINE_OA)
- `components/seo/site.ts` — code-level constants
- ADR-0003 (`docs/decisions/0003-china-search-vendor-cutoff.md`) — sister
  R1 ADR also handling vendor-cutoff messaging
