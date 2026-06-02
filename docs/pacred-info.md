# 🏢 Pacred — Company Info (Single Source of Truth)

> **Authoritative copy** of company identity — legal name, tax ID, slogan, addresses, phones, emails, brand handles.
> Code consumers (footer, invoice/receipt PDFs, JSON-LD, email signatures, FAQ) **MUST** import from [`components/seo/site.ts`](../components/seo/site.ts) — never hardcode.

Last updated: 2026-05-25 (post-org-shift roster — full per-department directory from เดฟ; correction: `066-131-0253` is **NOT** legacy — it's แนท's new Sales line. Retires `066-090-1217` (พลอย old CS) · `099-444-9978` (เรด้าห์ old) · `066-125-3007` (legacy "Sales primary"))

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

### Customer-facing constants (in `CONTACT`)

| Purpose | Number (display) | Intl format | Code |
|---|---|---|---|
| **Company main** (footer / invoice / legal) | 02-421-3325 | +6624213325 | `CONTACT.phoneCompany(Display)` |
| **Default phone** (= Sales primary = พี) | 061-779-9299 | +66617799299 | `CONTACT.phone(Display)` |
| **Customer Service** (พลอย — CS+DOCS coordinated) | 062-603-4456 | +66626034456 | `CONTACT.phoneCs(Display)` |
| **Sales reps array** (รวม 4 named) | `["061-779-9299","099-253-1415","066-125-3006","066-131-0253"]` | — | `CONTACT.phoneSalesDisplay` |

### Full org directory (in `STAFF` — per department, snapshot 2026-05-25)

| Dept | Person | Phone | Code |
|---|---|---|---|
| **Sales** | พี | 061-779-9299 | `STAFF.sales[0]` |
| **Sales** | เรด้าห์ | 099-253-1415 | `STAFF.sales[1]` |
| **Sales** | เมย์ | 066-125-3006 | `STAFF.sales[2]` |
| **Sales** | แนท *(new line — old `02-421-3325` was just the company main)* | 066-131-0253 | `STAFF.sales[3]` |
| **Pricing** | เว็บ | 062-602-8456 | `STAFF.pricing[0]` |
| **Doc** | วิน *(was "Sales primary" pre-2026-05-25)* | 062-603-0456 | `STAFF.doc[0]` |
| **Doc** | กริ้ง | 080-058-8746 | `STAFF.doc[1]` |
| **Doc** | เวฟ | 062-603-8456 | `STAFF.doc[2]` |
| **CS** | **พลอย** *(new line — old `066-090-1217` retired)* | **062-603-4456** | `STAFF.cs[0]` |
| **CS** | อ้อน | 099-435-9535 | `STAFF.cs[1]` |
| **Acc** | เจน | 081-160-9304 | `STAFF.acc[0]` |
| **Acc** | ออม | 063-210-2537 | `STAFF.acc[1]` |
| **Mkt** | เดฟ | — *(DM only — no direct line yet)* | `STAFF.mkt[0]` |
| **Mkt** | ภูมิ | 092-131-3786 | `STAFF.mkt[1]` |
| **Mkt** | ปอนด์ | 092-131-3788 | `STAFF.mkt[2]` |
| **HR** | แวม | 066-131-4733 | `STAFF.hr[0]` |

> **Pending HR confirm** (omitted from `STAFF` until names are known):
> - Sales rep `099-234-5196`
> - Pricing rep `080-030-4257`

> **CS-DOCS workflow** (per เดฟ brief): CS รับสาย → ประสาน DOCS → DOCS คุย freight/carrier/customs → return CS → ลูกค้า. Both share `docs@pacred.co` inbox.

> **Legacy numbers retired 2026-05-25 — do not reuse**:
> - `066-090-1217` (พลอย CS — replaced by `062-603-4456`)
> - `099-444-9978` (เรด้าห์ Sales — replaced by `099-253-1415`)
> - `066-125-3007` (legacy "Sales primary" — not in new roster)
> - `02-444-7046` (PCS Cargo holdover in PDF receipts + FAQ — tracked in [`runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md))

> **⚠️ `066-131-0253` correction (2026-05-25):** previously mislabeled as "legacy default"; it's actually **แนท's new Sales line**. Existing hardcodes across `warehouses/thailand` · `about` · `faq` · `footer` · `floating-tabs` · `clearance-promo` · `article-content` · `messages/*.json` are **still valid** — they happen to display แนท's line, not a stale legacy. The L-contact-refactor backlog migrates them to import from `STAFF.sales[3].phone` for SOT consistency.

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

## 🧑‍💼 Customer-facing team widget (4 cards — owner directive 2026-05-30)

> Owner directive (2026-05-30, updated): the customer-facing team widget shows **exactly 4 people — เมย์ + แนท (Sales) · วิน (Logistics Manager / ผู้จัดการโลจิสติกส์) · พลอย (CS, customer service)**. เมย์ + แนท are sales; วิน is the Logistics Manager; พลอย is CS. Apply site-wide, every spot. Source-of-truth is [`components/sections/contact-sales.tsx`](../components/sections/contact-sales.tsx) `SALES`; mirrored by [`lib/booking-data.ts`](../lib/booking-data.ts) `SALES_CARDS_DATA` (4 reps · `personKey: 'may' | 'nat' | 'win' | 'ploy'`) + the banner variants (`sales-carousel.tsx` · `purchase-banner.tsx` · `clearance-banner.tsx` · `import-export-banner.tsx`) which all show the same 4. Roles + slogans live in the `salesTeam` i18n namespace (TH/EN). All currently route to main Pacred OA; per-rep LINE channels = future enhancement (Phase C marketing).

| Name | Role (widget) | Phone |
|---|---|---|
| **เมย์** | ฝ่ายขาย (Sales) | 066-125-3006 |
| **แนท** | ฝ่ายขาย (Sales) | **066-131-0253** |
| **วิน** | ผู้จัดการโลจิสติกส์ (Logistics Manager) | 062-603-0456 |
| **พลอย** | ดูแลลูกค้า (CS) | **062-603-4456** |

> Because the widget now mixes Sales + CS, customer-facing CTA/heading copy was broadened from "เซลล์" → "ทีมงาน" / "ผู้ดูแล" (e.g. `ContactSales` heading "ทักทีมงาน"; `purchaseBanner.ctaSales` "เลือกทีมงาน"). When ad campaigns target a person, set `<ContactSales featuredName="…" />` accordingly (e.g. `featuredName="พลอย"` on `/customs-clearance-shipping-suvarnabhumi`).

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

**Migration tracker:** receipts/invoices currently render w/o bank — ภูม wire `BANK.*` into `components/pdf/forwarder-receipt.tsx` (removed — receipt now renders via the admin forwarder-invoice / tax-invoice flow, ADR-0027; brand already wired via `site.ts`) + [`components/pdf/shop-order-receipt.tsx`](../components/pdf/shop-order-receipt.tsx) in same refactor batch as `CONTACT.*` row in §"Migration tracker" below.

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
