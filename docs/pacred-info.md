# 🏢 Pacred — Company Info (Single Source of Truth)

> **Authoritative copy** of company info — addresses, phones, emails, brand handles.
> Source: เดฟ provided 2026-05-15.
> All consumers (footer, invoices, PDF receipts, JSON-LD, email signatures, FAQ) **MUST** import from `components/seo/site.ts` (`CONTACT` + `ADDRESSES` + `LINE_OA` + `SOCIAL`) — not duplicate hardcoded.

Last updated: 2026-05-15

---

## Company

| Field | Value |
|---|---|
| **Brand name** | Pacred |
| **Legal name** (TH/EN) | Pacred CO., LTD. *(verify Thai legal name + tax ID with owner)* |
| **Tax ID** | TBD — needed for tax invoice / DBD lookup |

## Addresses

### 📮 Office (HQ / mailing / invoice)
> 28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ
> แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160

| Component | Value |
|---|---|
| Address line | 28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ |
| Subdistrict (แขวง) | หนองแขม |
| District (เขต) | หนองแขม |
| Province | กรุงเทพมหานคร |
| Postcode | 10160 |

→ Code: `ADDRESSES.office` in `components/seo/site.ts`

### 🏭 Warehouse (Samut Sakhon receiving)
> 48/3 หมู่ 12 ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130

| Component | Value |
|---|---|
| Address line | 48/3 หมู่ 12 |
| Subdistrict (ตำบล) | อ้อมน้อย |
| District (อำเภอ) | กระทุ่มแบน |
| Province | สมุทรสาคร |
| Postcode | 74130 |

→ Code: `ADDRESSES.warehouseTh` in `components/seo/site.ts`

## Phones

| Purpose | Number | Display | Code constant |
|---|---|---|---|
| **Company main** (footer / invoice) | +6624213325 | 02-421-3325 | `CONTACT.phoneCompany(Display)` |
| **Sales primary** (Win) | +66661253007 | 066-125-3007 | `CONTACT.phoneSalesDisplay[0]` |
| **Sales secondary** | +66661253006 | 066-125-3006 | `CONTACT.phoneSalesDisplay[1]` |
| **Customer Service** (พลอย) | +66660901217 | 066-090-1217 | `CONTACT.phoneCs(Display)` |
| **Default** (= sales primary, back-compat alias) | +66661253007 | 066-125-3007 | `CONTACT.phone(Display)` |

→ ⚠️ Legacy values to grep + replace across codebase:
- `066-131-0253` (old default — wrong number, was in `site.ts`)
- `02-444-7046` (PCS Cargo legacy — appears in PDF receipts + FAQ)

## Email

| Purpose | Value |
|---|---|
| General contact | contact@pacred.co |
| Sales | sales@pacred.co |

→ Code: `CONTACT.email` + `CONTACT.emailSales`

## LINE OA

| Field | Value | Code constant |
|---|---|---|
| Channel ID | 2009931373 | env `LINE_CHANNEL_ID` |
| Basic ID | @683wolja | `LINE_OA.basicId` |
| Premium ID | @pacred | `LINE_OA.premiumId` |
| Short URL (brandable) | https://lin.ee/Yg3fU0I | `LINE_OA.shortUrl` |
| Add-friend URL (default CTA) | https://line.me/R/ti/p/%40pacred | `LINE_OA.addFriendUrl` |

## Social

| Channel | URL | Code |
|---|---|---|
| LINE OA | https://lin.ee/Yg3fU0I | `SOCIAL.line` |
| Facebook | https://www.facebook.com/PacredShippingCustomsClearanceImportExport/ | `SOCIAL.facebook` |
| YouTube | https://www.youtube.com/@PacredShipping | `SOCIAL.youtube` |
| TikTok | https://www.tiktok.com/@pacred.co | `SOCIAL.tiktok` |
| Instagram | https://www.instagram.com/pacred.co/ | `SOCIAL.instagram` |

## Sales reps

> Per `lib/booking-data.ts` `SALES_CARDS_DATA` — currently 3 reps, all routed to the main Pacred OA. Migrate to per-rep LINE links once each rep has own channel.

| Name | Phone | Slogan |
|---|---|---|
| วิน | 066-125-3007 | นำเข้าทุก Port ทุก Term ปิดดีลให้จบในที่เดียว |
| แนท | 02-421-3325 *(uses company line — verify own number?)* | นำเข้าสั่งซื้อจีน ทุกแพลตฟอร์ม ครบจบในที่เดียว |
| พลอย | 066-090-1217 | เคลียร์สินค้าติดด่าน เร็ว ปลอดภัย การันตีจบ (also = CS) |

⚠️ Open question: แนท uses company line `02-421-3325` (vs other reps with mobile). Confirm if that's intentional or แนท has own mobile not yet provided.

## Pending — owner to provide

- [ ] Tax ID (13 digits) — for tax invoice + DBD verification
- [ ] Legal company name TH + EN (e.g. "Pacred CO., LTD." vs current PCS Cargo legal entity)
- [ ] Bank account + PromptPay number (Pacred new — PCS Cargo legacy `064-174-3836` Kasikorn cannot be used)
- [ ] LINE Premium ID @pacred — confirm payment subscription is active
- [ ] แนท sales rep own mobile (currently shows company line)

---

## Migration / refactor TODO

Files still hardcoding old/legacy contact info — refactor to import from `CONTACT`/`ADDRESSES`:

| File | Old value | Migrate to |
|---|---|---|
| `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx` | `02-444-7046 · contact@pacred.co` | `CONTACT.phoneCompanyDisplay` + `CONTACT.email` |
| `components/pdf/forwarder-receipt.tsx` | `02-444-7046 · contact@pacred.co` + `02-444-7046 · LINE @pacred · pacred.co` | `CONTACT.*` |
| `components/pdf/shop-order-receipt.tsx` | (same) | `CONTACT.*` |
| `app/[locale]/(public)/faq/page.tsx` | `066-131-0253` text | `CONTACT.phoneDisplay` (read at render) |
| `components/sales-rep-card.tsx` | (verify) | use sales rep data from `lib/booking-data.ts` |
| `components/sections/clearance-promo.tsx` | (verify) | `CONTACT.*` |
| `components/sections/footer.tsx` | (verify) | `CONTACT.*` |
| `components/sections/warehouse-detail.tsx` | (verify — likely warehouse address) | `ADDRESSES.warehouseTh.full` |

**Tracked as `L-contact-refactor`** in PORT_PLAN Part O3 — ปอน owns migration of frontend components; ภูม owns PDF + admin pages.
