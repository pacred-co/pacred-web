# 🔴→🟢 Brand sweep — visible "PCS" + stale self-pickup address (2026-06-04)

Owner: *"คำว่า PCS หลุดมาให้ลูกค้าและพนักงานเห็น … ที่อยู่รับของเอง บางที่ยังเป็น PCS ยังเป็นสถานที่เก่า … ไล่เช็คให้ดี"*. Ran an audit agent + a manual deep grep (the agent under-reported — it only checked the `components/pdf/*` React-PDF templates and missed the legacy HTML print routes + the registry, per AGENTS.md §0b "one mode of N").

## Ground truth (components/seo/site.ts)
- **`office`** = `28/40 … แขวงหนองแขม … กรุงเทพฯ 10160` — Pacred's **registered HQ**. หนองแขม here is CORRECT (the office, not the old PCS warehouse).
- **`warehouseTh`** = `48/3 หมู่ 12 ตำบลอ้อมน้อย อ.กระทุ่มแบน จ.สมุทรสาคร 74130` (S&T WAREHOUSE219) — the correct self-pickup / receiving warehouse.

## ✅ Already correct (confirmed, NOT touched)
- **All 6 customer document templates** import Pacred constants from `site.ts`: tax-invoice · freight-receipt · shop-order-receipt · commercial-invoice · customs-declaration · DO-letter. (`components/pdf/*`)
- **Public marketing pages** (`app/[locale]/(public)/**`) — zero "PCS" tokens.
- **`faddressname: "รับที่โกดัง Pacred"`** written by every address-write action (cart, forwarder-legacy, carrier-manual, forwarders-new, momo-commit, service-orders-header-edits…) — already Pacred, no stale location.

## ✅ Intentionally KEPT (not leaks)
- **Legacy-auth bridge** "เชื่อมต่อบัญชี PCS CARGO" (`lib/auth/pcs-legacy-bridge.ts`) — migrated customers link their existing PCS account; MUST keep saying PCS.
- **`366/49 หมู่บ้านไอยรา … หนองแขม`** in 2 receipt-print routes — it's a **specific customer's** registered address (hardcoded receipt override for `userid==="PR71"` = บริษัท 3พี อีควิปเม้นท์, faithful port of `printReceiptF.php` L102-113). Customer data, not Pacred brand.
- **`about/page.tsx` HQ block** = the correct Pacred office (28/40 หนองแขม), matches site.ts.
- **Code comments** referencing legacy "PCS เหมาๆ" / "PCS Cargo `member/*.php`" — documentation of legacy origin, not rendered. Kept.
- **Internal codes** `PCS` / `PCSF` / `PCSE` / `F` (DB-stored `fshipby` values + `code:` keys) — UNCHANGED; only the human labels changed.

## 🟢 FIXED — 19 visible label sites (PCS→Pacred · stale "กทม/หนองแขม"→"(สมุทรสาคร)")
- `lib/freight/shipping-methods.ts` (registry: PCS pickup + PCSF เหมาเหมา + PCSE Express + F auto, nameTh/name/description) **+ its `.test.ts` 4 assertions** updated to match.
- `actions/admin/reports-profit-types.ts` (SHIP_BY_LABEL `PCS`).
- `app/(admin)/admin/drivers/new/page.tsx` (PCSF/PCSE/PCS labels).
- `app/(protected)/service-import/{forwarder-row-view.tsx, [fNo]/page.tsx, add/service-import-add-fields.tsx (option + help text), table/page.tsx (option + 2 comments)}` — self-pickup "Pacred กทม"→"Pacred (สมุทรสาคร)".
- `app/(admin)/admin/forwarders/new/form.tsx` + `components/admin/carrier-manual-form.tsx` — "PCS เหมาๆ"/"PCS ขนส่ง" promo labels → Pacred (the "กทม + ปริมณฑล" = the promo's free-delivery AREA, kept).

Canonical self-pickup label is now **"รับเองโกดัง Pacred (สมุทรสาคร)"** everywhere (matches the admin order-create forms which were already correct).

## 🟠 Flagged for owner (NOT changed — business logic, needs a decision)
- **`actions/forwarder.ts` หนองแขม free-shipping allowlist** (`calPrice.php` L34-38): the legacy free-delivery exemption fires when the customer's **delivery address district contains "หนองแขม"** (because the OLD warehouse was there → local delivery free). Now the warehouse is **สมุทรสาคร** — so the free-delivery local area arguably should be อ้อมน้อย/กระทุ่มแบน, not หนองแขม. This is a **pricing rule**, not a brand label → left faithful-to-legacy. Owner: confirm whether the free-ship local zone should move with the warehouse.

Verify: `pnpm verify` (incl. the updated shipping-methods test). Labels only — no logic/codes/money touched.
