# 🏢 Pacred — Company Info (Single Source of Truth)

> **Authoritative copy** of company identity — legal name, tax ID, slogan, addresses, phones, emails, brand handles.
> Code consumers (footer, invoice/receipt PDFs, JSON-LD, email signatures, FAQ) **MUST** import from [`components/seo/site.ts`](../components/seo/site.ts) — never hardcode.

Last updated: 2026-05-17 evening (T-G3 3/5 DONE: bank ✅ · PromptPay ✅ · gateway ⚠️ Omise→Xendit+K-Biz+K-Shop change)

---

## ⚡ Company DNA (load-bearing — every customer-visible surface)

| Field | Value | Code constant |
|---|---|---|
| **Brand name** | Pacred | `SITE_NAME` |
| **Legal name (EN)** | Pacred (Thailand) Co., Ltd. | `SITE_LEGAL_NAME` |
| **Legal name (TH)** | บริษัท แพคเรด (ประเทศไทย) จำกัด | `SITE_LEGAL_NAME_TH` |
| **Tax ID / Registration** | `0105564077716` (13 digits) | `TAX_ID` |
| **Slogan** | **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"** | `SLOGAN` |
| **Canonical domain** | https://pacred.co (env `NEXT_PUBLIC_SITE_URL`) | `SITE_URL` |
| **Alternate domain** | pacred.co.th → 301 redirect → pacred.co (not canonical) | n/a |
| **Owner** | พี่ป๊อป Visit (second-tier authority: เดฟ + ก๊อต) | n/a |

### Business scope (registered TH)

> ประกอบกิจการให้บริการพิธีการกรมศุลกากร · ตัวแทนนำเข้าและส่งออกสินค้า · การขนส่งระหว่างประเทศ · รถขนส่งภายในประเทศ

**Operational interpretation:** "เอาหมดเป็น ecosystem" — every link in the import/export chain, plus adjacent logistics. ดู [`CLAUDE.md`](../CLAUDE.md) §"Pacred Ecosystem" สำหรับ service catalogue 13 รายการ.

### Vision (เป้าหมายองค์กร)

> ทำให้ทุกคน (แม้ไม่รู้อะไรเลย) สามารถนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว — full-loop service ดึงลูกค้าไว้ในระบบเรา (ไม่ปล่อยให้ออกไป handover ที่อื่น).

**Markets (priority order):** ไทย → จีน → ญี่ปุ่น → เกาหลี → มาเลย์ → อินโดนีเซีย → อเมริกา → อื่นๆ.

### Brand-split context (THIS MATTERS — affects every cleanup decision)

- Pacred = **บริษัทใหม่** กำลังแยกตัวออกจาก **PCS CARGO + TTP + ไอแต้ม** (เจ้าเก่า / คู่แข่ง / partner)
- **ตอนนี้** บาง API ยังต้อง "ยืม" จากเจ้าเก่ามาใช้ก่อน (ดู R1 china-search vendor cutoff [`ADR-0003`](decisions/0003-china-search-vendor-cutoff.md) + MOMO JMF [`integrations/momo-jmf.md`](integrations/momo-jmf.md))
- **Cleanup rule:** ลบ reference ของ PCS CARGO / TTP / ไอแต้ม **หลัง** ก๊อต confirm API switchover — ไม่ใช่ก่อน (จะ break revenue path). ดู [`runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md).

---

## 📍 Addresses

### 🏢 Office (HQ — mailing / invoice / JSON-LD PostalAddress)

> 28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ
> แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160

| Field | Value |
|---|---|
| Address line | 28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ |
| Subdistrict (แขวง) | หนองแขม |
| District (เขต) | หนองแขม |
| Province | กรุงเทพมหานคร |
| Postcode | 10160 |
| Code | `ADDRESSES.office` |

### 🏭 Warehouse (Samut Sakhon receiving — TH side)

> 48/3 หมู่ 12 ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130

| Field | Value |
|---|---|
| Address line | 48/3 หมู่ 12 |
| Subdistrict (ตำบล) | อ้อมน้อย |
| District (อำเภอ) | กระทุ่มแบน |
| Province | สมุทรสาคร |
| Postcode | 74130 |
| Code | `ADDRESSES.warehouseTh` |

> **China warehouse** (future Pacred-managed) = not yet provisioned. Per memory `staff_roles_pacred`, Pacred plans own CN warehouse; until then use MOMO JMF partner facility. Track CN warehouse address in this file once locked.

---

## ☎️ Phones

| Purpose | Number (display) | Intl format | Code |
|---|---|---|---|
| **Company main** (footer / invoice / legal) | 02-421-3325 | +6624213325 | `CONTACT.phoneCompany(Display)` |
| **Sales primary** (วิน) | 066-125-3007 | +66661253007 | `CONTACT.phoneSalesDisplay[0]` |
| **Sales secondary** | 066-125-3006 | +66661253006 | `CONTACT.phoneSalesDisplay[1]` |
| **Customer Service** (พลอย — CS+DOCS coordinated) | 066-090-1217 | +66660901217 | `CONTACT.phoneCs(Display)` |
| **Default phone** (= sales primary, back-compat) | 066-125-3007 | +66661253007 | `CONTACT.phone(Display)` |

> **CS-DOCS workflow** (per เดฟ brief): CS รับสาย → ประสาน DOCS → DOCS คุย freight/carrier/customs → return CS → ลูกค้า. Both share `docs@pacred.co` inbox.

> **Legacy numbers to scrub** (post-API-switchover): `066-131-0253` (old default) · `02-444-7046` (PCS Cargo legacy in PDF receipts + FAQ). Tracked in [`runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md).

---

## 📧 Emails (per-department semantic — เดฟ brief 2026-05-15)

> **Customer-facing footer + JSON-LD ContactPoint:** show `sales@` + `docs@` paired side-by-side per user direction ("ลูกค้าเร่งด่วน จะได้มีทางเลือก แบบดูเป็น specialist"). All other surfaces use the role-specific email below.

| Email | Owner / purpose | Where it appears | Code |
|---|---|---|---|
| **admin@pacred.co** | **Top-level org admin** — เดฟ holds. Internal control + dev oversight. **NOT customer-facing.** | Internal only (audit log notifications · dev alerts · ก๊อต-เดฟ comms) | `CONTACT.emailAdmin` |
| **sales@pacred.co** | Marketing + customer acquisition + inquiries + new business intake | Footer (paired with docs) · JSON-LD ContactPoint · signup confirmations · ad reply-to | `CONTACT.email` + `emailSales` + `emailContactPair[0]` |
| **docs@pacred.co** | **CS + DOCS shared central ops hub** — talks freight, carriers (สายเรือ/รถ/แอร์), customs (นายด่าน/นายตรวจ), sales, pricing, accounting, shipping | Footer (paired with sales) · FAQ contact form · CS inquiry handler · `emailContactPair[1]` | `CONTACT.emailDocs` |
| **acc@pacred.co** | **Receipts + transactions + payments + tax invoice queries** — every financial document | Receipt PDFs · invoice PDFs · tax invoice flow (ADR-0006) · wallet/payment notifications · payment failure alerts | `CONTACT.emailAcc` |
| **pricing@pacred.co** | Rate quotes + partner/supplier deals + multimodal freight pricing (รถ/เรือ/แอร์ × ไทย/จีน) + cross-checks docs/sales/acc | Quote request forms · partner outreach · pricing engine emails · BTW carrier negotiation | `CONTACT.emailPricing` |
| **hr@pacred.co** | Recruitment + onboarding + employee comms | HR admin pages (recruitment intake) · employee notification emails · application form action | `CONTACT.emailHr` |
| **devmkt@pacred.co** | Dev + marketing combined — website dev, social analytics, ad data, partner integrations | Sentry alert routing · GTM/Clarity reports · Google/Meta/TikTok ads contact · GitHub bot notifications | `CONTACT.emailDevMkt` |

> ⚠️ **Legacy email `contact@pacred.co`** — being phased out. Migration tracked as `L-contact-refactor` in [`PORT_PLAN.md`](PORT_PLAN.md) Part O3 (ปอน owns frontend; ภูม owns PDF + admin).

---

## 💬 LINE OA

| Field | Value | Code |
|---|---|---|
| **Channel ID** | `2009931373` | env `LINE_CHANNEL_ID` |
| **Premium ID** (preferred) | `@pacred` | `LINE_OA.premiumId` |
| **Basic ID** (fallback) | `@683wolja` | `LINE_OA.basicId` |
| **Short URL** (brandable) | https://lin.ee/Yg3fU0I | `LINE_OA.shortUrl` |
| **Add-friend URL** (default CTA) | https://line.me/R/ti/p/%40pacred | `LINE_OA.addFriendUrl` |
| **LIFF ID** (customer linkage) | TBD — Pacred owner to create | env `NEXT_PUBLIC_LIFF_ID` |

---

## 🌐 Social

| Channel | URL | Code |
|---|---|---|
| LINE OA | https://lin.ee/Yg3fU0I | `SOCIAL.line` |
| Facebook | https://www.facebook.com/PacredShippingCustomsClearanceImportExport/ | `SOCIAL.facebook` |
| YouTube | https://www.youtube.com/@PacredShipping | `SOCIAL.youtube` |
| TikTok | https://www.tiktok.com/@pacred.co | `SOCIAL.tiktok` |
| Instagram | https://www.instagram.com/pacred.co/ | `SOCIAL.instagram` |

---

## 🧑‍💼 Sales reps (current — 3 reps)

> Per [`lib/booking-data.ts`](../lib/booking-data.ts) `SALES_CARDS_DATA`. All 3 currently route to main Pacred OA. Per-rep LINE channel = future enhancement (Phase I marketing).

| Name | Phone | Slogan / specialty |
|---|---|---|
| **วิน** | 066-125-3007 | นำเข้าทุก Port ทุก Term ปิดดีลให้จบในที่เดียว |
| **แนท** | 02-421-3325 *(uses company line — confirm with owner)* | นำเข้าสั่งซื้อจีน ทุกแพลตฟอร์ม ครบจบในที่เดียว |
| **พลอย** | 066-090-1217 *(also CS lead)* | เคลียร์สินค้าติดด่าน เร็ว ปลอดภัย การันตีจบ |

---

## 💳 Bank accounts (from พี่ป๊อป via ลูกพี่ 2026-05-17)

### Primary — กระแสรายวัน (current account, biz day-to-day)

| Field | Value | Code constant |
|---|---|---|
| **Bank name (TH)** | ธนาคารกสิกรไทย | `BANK.name` |
| **Bank name (EN)** | Kasikornbank | `BANK.nameEn` |
| **Account number** | `225-2-91144-0` | `BANK.accountNumber` |
| **Account holder (TH)** | บจก. แพคเรด (ประเทศไทย) | `BANK.accountName` |
| **Account holder (EN)** | Pacred (Thailand) Co., Ltd. | `BANK.accountNameEn` |
| **Account type** | กระแสรายวัน (Current Account) | `BANK.accountType` / `BANK.accountTypeEn` |
| **PromptPay linked** | tax-ID `0105564077716` (13 หลัก) → `PROMPTPAY_ID` Vercel env | n/a (env var) |

### Secondary — ออมทรัพย์ (savings) — ⏳ พี่ป๊อป จะส่งให้ทีหลัง

เมื่อข้อมูลครบ เพิ่ม `BANK.savings` constant ใน [`components/seo/site.ts`](../components/seo/site.ts) + section here.

**Printed on:** receipt PDFs · tax-invoice PDFs · `/wallet/deposit` page (alternative to PromptPay QR).

**Migration tracker:** receipts/invoices currently render w/o bank — ภูม wire `BANK.*` into [`components/pdf/forwarder-receipt.tsx`](../components/pdf/forwarder-receipt.tsx) + [`components/pdf/shop-order-receipt.tsx`](../components/pdf/shop-order-receipt.tsx) in same refactor batch as `CONTACT.*` row in §"Migration tracker" below.

---

## ⏳ Pending — owner to provide (T-G3 Bundle 1 — ลูกพี่ takes call · 3/5 DONE 2026-05-17)

- [x] **Bank account (current)** — ✅ DONE 2026-05-17 (กสิกรไทย 225-2-91144-0 บจก.แพคเรด (ประเทศไทย) กระแสรายวัน)
- [ ] **Bank account (savings)** — ⏳ พี่ป๊อป จะส่งให้ทีหลัง
- [x] **PromptPay ID** — ✅ DONE 2026-05-17 (tax-ID `0105564077716` ผูกบัญชีกสิกร 225-2-91144-0) → set Vercel env `PROMPTPAY_ID=0105564077716`
- [x] **Payment gateway pick** — ✅ DECIDED 2026-05-17: **Xendit + K-Biz + K-Shop** (Kasikorn-centric stack, owner override of Omise pre-decision). T+30d wire by ภูม per [updated D-7 matrix](decisions/d7-payment-gateway-decision-matrix.md)
- [ ] **PDPA registration status** — required ก่อน K-sec-4 pen test (per [pen-test plan §7 Q5](audit/pen-test-plan-2026-05-16.md#7-resolved-decisions-locked-2026-05-16-night-by-กอต--เดฟ--ลูกพี่))
- [ ] **Resend API key** (`RESEND_API_KEY`) — email notification fallback (soft-degrade OK if not set)
- [ ] **แนท sales rep own mobile** — currently shows company line
- [ ] **Email forwarding rules** — Gmail/Workspace: forward `sales@` + `docs@` to ทีม inbox of vacation backup; `acc@` mirror to bookkeeper
- [x] **LIFF ID** — ✅ DONE 2026-05-16 night (DV-2 — channel `2010105778` + LIFF `2010105778-SaSkkGza`)
- [x] **LINE Premium ID @pacred subscription** — ✅ Confirmed active (set up DV-2 walkthrough)

> Tracked also in [`PORT_PLAN.md`](PORT_PLAN.md) Part Q "Pacred owner call bundle" + [`runbook/t-g3-popop-call-script.md`](runbook/t-g3-popop-call-script.md).

---

## 🔁 Migration tracker — consumers still hardcoding (refactor to import from `CONTACT` / `ADDRESSES`)

| File | Old hardcoded value | Migrate to | Owner |
|---|---|---|---|
| `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx` | `02-444-7046 · contact@pacred.co` | `CONTACT.phoneCompanyDisplay` + `CONTACT.emailAcc` | ภูม |
| `components/pdf/forwarder-receipt.tsx` | `02-444-7046 · contact@pacred.co` + LINE @pacred footer | `CONTACT.*` + `LINE_OA.premiumId` | ภูม |
| `components/pdf/shop-order-receipt.tsx` | (same as above) | `CONTACT.*` | ภูม |
| `app/[locale]/(public)/faq/page.tsx` | `066-131-0253` text + `contact@pacred.co` | `CONTACT.phoneDisplay` + `CONTACT.emailContactPair` (sales + docs) | ปอน |
| `components/sales-rep-card.tsx` | (verify) | use sales rep data from `lib/booking-data.ts` | ปอน |
| `components/sections/clearance-promo.tsx` | (verify) | `CONTACT.*` | ปอน |
| `components/sections/footer.tsx` | (verify) | `CONTACT.emailContactPair` for the dual-email row | ปอน |
| `components/sections/warehouse-detail.tsx` | (verify — warehouse address) | `ADDRESSES.warehouseTh.full` | ปอน |
| `components/sections/floating-tabs.tsx` | `SALES_PHONES = ["0660901217", "0661253007", "024213325"]` (mobile FAB random-dial) | `CONTACT.phoneSalesDisplay` (already de-formatted) — import directly | ปอน |
| `messages/th.json` · `messages/en.json` | `contact@pacred.co` strings | drop strings; render via `CONTACT.emailContactPair` directly | ปอน |
| JSON-LD generators (sitemap / page-level metadata) | mostly use constants; verify `slogan` field absent → add via `SLOGAN` | + `taxID` field via `TAX_ID` | ปอน + ภูม |

**Tracked as `L-contact-refactor`** in [`PORT_PLAN.md`](PORT_PLAN.md) Part O3 — ปอน owns frontend; ภูม owns PDF + admin pages.

---

## Cross-links

- [`components/seo/site.ts`](../components/seo/site.ts) — code constants this doc describes
- [`CLAUDE.md`](../CLAUDE.md) §"Pacred Ecosystem" — 13-service catalogue
- [`decisions/0006-tax-invoice-flow.md`](decisions/0006-tax-invoice-flow.md) — tax invoice uses `TAX_ID`
- [`runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md) — PCS / TTP / ไอแต้ม cleanup plan
- [`integrations/momo-jmf.md`](integrations/momo-jmf.md) — TH warehouse partner
- Memory: `pacred_company_dna` + `cash_burning_p0_emergency` (load via /memories — not in repo)
