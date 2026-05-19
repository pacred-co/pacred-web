# Audit C — Sidebar mislinks (page content ≠ sidebar label)

> Companion to Audit A (broken hrefs — no page.tsx) and Audit B (label/i18n).
> This audit covers the ~103 hrefs that DO have a `page.tsx` but the page renders content that doesn't match what the sidebar label promised.
>
> Working tree: `claude/adoring-chandrasekhar-0f8ad7` (read-only).
> Source files: `lib/admin/sidebar-menu.ts` (702 lines) · `messages/th.json` §`pcsAdminNav` (lines 2383–2616) · `app/[locale]/(admin)/admin/**/page.tsx`.

## 1. Methodology

1. Extracted every `href: "/admin/…"` from `lib/admin/sidebar-menu.ts` (lines 99–641) and resolved each `labelKey` against `messages/th.json` §`pcsAdminNav`.
2. Globbed every `app/[locale]/(admin)/admin/**/page.tsx` and grepped `<h1[^>]*>(.+)</h1>` across all matches in one pass (output saved to a single 98-line index).
3. For routes that DO have a `page.tsx`, manually compared the resolved Thai label vs. the page's main `<h1>` heading.
4. For routes with query-string carriers (`?q=…`, `?tab=…`, `?sla=…`, `?group=…`, `?kind=…`, `?mode=…`, `?topic=…`, `?segment=…`), opened the page source and grepped for `searchParams`/`sp.<key>` to confirm whether the filter is actually applied or silently dropped.
5. Hrefs with NO `page.tsx` (covered by Audit A) excluded.

## 2. 🔴 Mislinks — page is entirely different from sidebar promise

These cause real confusion — staff click X expecting screen X, get screen Y.

| Sidebar label (TH) | href | Page actually renders | Why broken |
|---|---|---|---|
| รายการเติมเงิน | `/admin/wallet/deposit` | "กระเป๋าเงิน — รายการ" (all wallet txns) | The page is a 1-line `redirect("/admin/wallet")` — no filter applied. ภูม's reported case. |
| รายการเติมเงิน (accCargo dup) | `/admin/wallet/deposit` | Same as above | Same redirect. |
| รายการถอนเงิน | `/admin/withdrawals` | "กระเป๋าเงิน — รายการ" | 1-line `redirect("/admin/wallet?kind=withdraw&status=pending")` — heading still reads "กระเป๋าเงิน — รายการ" so user can't tell. |
| ถอนเงิน โอนโดยตรง | `/admin/withdrawals` | Same as above | Same redirect. |
| ฝากโอน (report.payment) | `/admin/reports` | "รายงาน" (generic reports hub) | Report router lands on hub; no filter is applied for ฝากโอน-only reports. |
| ใบแจ้งหนี้ (accCargo.invoice) | `/admin/freight/declarations` | "ใบขนสินค้า (V-E11)" | "ใบแจ้งหนี้" (invoice) ≠ "ใบขนสินค้า" (customs declaration). Two different documents — สับสนแน่. |
| ใบแจ้งหนี้ (accFreight.invoice) | `/admin/freight/shipments` | "งานขนส่ง freight (shipments)" | Same fault — invoice ≠ shipments page. |
| รายการเดินบัญชี | `/admin/accounting/reconcile` | "Payment ↔ Order Reconciliation" | General ledger vs payment-order matching — different tools. |
| ค่าตู้สินค้า (accCargo.containerPay) | `/admin/accounting/container-payments` | t("pageTitle") = "ตารางจ่ายเงินค่าตู้ (ค่าตู้สินค้า)" | ✓ actually matches via i18n — moved to §5. |
| ค่าตู้สินค้า (withdrawal.cntCost) | `/admin/accounting/disbursements?kind=container` | "AP Ledger / สมุดจ่าย (Container disbursements)" | Page ignores `?kind` query — but heading text is close enough → §3. |
| ค่าขนส่งไทย | `/admin/accounting/disbursements?kind=thai-freight` | "AP Ledger / สมุดจ่าย (Container disbursements)" | Page is HARD-CODED to container disbursements; `?kind=thai-freight` is silently dropped. User sees container expenses not Thai-freight expenses. |
| เบิกเงินค่าสินค้า | `/admin/sales-payouts?kind=shop-goods` | "เบิกค่าคอม (sales payouts)" | Page is sales-team commission payouts, NOT goods withdrawal. `?kind=shop-goods` dropped silently. |
| ซ่อมบำรุง | `/admin/inventory?tab=maintenance` | "สแกนรับเข้าโกดัง" | `/admin/inventory` is a 1-line `redirect("/admin/barcode")` — lands on barcode scan page, nothing about maintenance. |
| จัดซื้อ (ลงเบิกค่าใช้จ่าย) | `/admin/inventory?tab=purchasing` | Same as above | Same redirect. |
| สต๊อกของใช้ | `/admin/inventory` | Same as above | Same redirect. |
| Popup ประกาศลูกค้า | `/admin/settings/business-config` | "Business Config (super)" | Page is feature-flags / OTP TTL / wallet limits — no popup-announcement section. |
| ประเภทสมาชิก VIP | `/admin/settings/business-config` | Same as above | Same — no VIP tier editor on this page. |
| จองห้องประชุม | `/admin/hr/attendance?tab=meeting-room` | "บันทึกเวลาเข้างาน" | Time-attendance page ignores `?tab=meeting-room` — no meeting-room booking UI exists. |
| รอดำเนินการ (purchasing.pending) | `/admin/service-orders?q=1` | "ฝากสั่ง — Ops" (unfiltered) | Page reads `?status=`, not `?q=`. The "1" is silently dropped. User sees ALL orders, not pending. |
| รายการเตรียมส่ง | `/admin/forwarders?q=6` | "ฝากนำเข้า — Ops" (text-search for "6") | `?q=6` is fed into the text search box as keyword "6" — matches a few tracking-numbers containing "6". Not a "เตรียมส่ง" filter at all. |
| รายการนำเข้าเครดิต | `/admin/forwarders?q=c` | Same — keyword "c" | Same fault — full-text search for "c" gives random rows. |
| สินค้าไม่มีเจ้าของ | `/admin/forwarders?q=ownerless` | Same — keyword "ownerless" | English keyword in a TH text field → near-empty result. |
| เตรียมส่งเกินกำหนด | `/admin/forwarders?q=prepare-overdue` | Same — keyword "prepare-overdue" | Same. |
| ผังงาน Job งาน | `/admin/learning?topic=job-flow` | "📚 เรียนรู้และข้อมูลภายใน" (hub w/ 4 cards) | `?topic=` is ignored; same hub renders no matter the topic param. |
| Business Plan | `/admin/learning?topic=business-plan` | Same hub | Same — topic dropped. |
| วัฒนธรรมองค์กร | `/admin/learning?topic=culture` | Same hub | Same. |
| ข่าวสารภายในองค์กร | `/admin/learning?topic=newsfeed` | Same hub | Same. |
| กฏระเบียบและสัญญา | `/admin/learning?topic=regulations` | Same hub | Same. |
| ด้วยเครื่องสแกน (×3 contexts) | `/admin/barcode?mode=scan-{all,prepare,box}` | "สแกนรับเข้าโกดัง" (default intake mode) | `?mode=` is silently dropped — page always renders `defaultMode="intake"`. Sidebar offers 8 distinct scan modes; user gets only 1. |
| ด้วยกล้อง (×3 contexts) | `/admin/barcode?mode=camera-{all,prepare,box}` | Same | Same. |
| บันทึกสินค้าเข้าโกดัง | `/admin/barcode?mode=intake` | "สแกนรับเข้าโกดัง" | This one is the only mode that matches by accident (default = intake). |
| รายการยกเลิกออเดอร์ | `/admin/reports/monthly-orders?sla=cancelled` | "ออเดอร์ในเดือน · {label}" | `?sla=` is dropped — no cancelled-only filter applied. |
| สั่งซื้อรอเกิน 10 นาที | `/admin/reports/monthly-orders?sla=pending-10min` | Same generic page | Same — no SLA filter. |
| สั่งซื้อรอร้านจีนส่งเกิน 2 วัน | `/admin/reports/monthly-orders?sla=chn-dispatch-2d` | Same | Same. |
| รอเข้าโกดังจีนเกิน 2 วัน | `/admin/reports/containers-awaiting-th?sla=chn-wh-2d` | "ตู้คอนเทนเนอร์รอเข้าโกดังไทย" (generic) | `?sla=` dropped. |
| กำลังมาไทยเกินกำหนด | `/admin/reports/containers-awaiting-th?sla=transit` | Same | Same. |
| รอชำระสินค้าเกิน 1 วัน | `/admin/reports/pending-payments?sla=shop-1d` | "ฝากนำเข้ารอชำระเงิน" | `?sla=` dropped — sla-specific filtering not implemented. |
| รอชำระค่านำเข้าเกิน 2 วัน | `/admin/reports/pending-payments?sla=forwarder-2d` | Same | Same. |
| เครดิตเกินกำหนด | `/admin/reports/credit-pending?sla=overdue` | "เครดิตค้างนำเข้า" | `?sla=` dropped. |
| ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน | `/admin/customers/recently-active?sla=no-contact-2d` | "รายงานลูกค้าที่ใช้งานล่าสุด" | `?sla=` dropped. |
| สมาชิกทั่วไป | `/admin/customers?group=general` | "ลูกค้า" (all customers) | Page reads `?q` & `?type`, NOT `?group`. Silently dropped. |
| สมาชิก VIP | `/admin/customers?group=vip` | Same — all customers | Same. |
| สมาชิก SVIP | `/admin/customers?group=svip` | Same | Same. |
| สมาชิกนิติบุคคล | `/admin/customers?group=corporate` | Same | Same. |
| สมาชิกเครดิต | `/admin/customers?group=credit` | Same | Same. |
| สมาชิกคิดค่าเทียบ | `/admin/customers?group=comparison` | Same | Same. |
| ลูกค้า Freight ทั้งหมด | `/admin/customers?segment=freight` | Same — all customers | `?segment=` dropped same way. |

**Subtotal — 🔴 mislinks: ~46.** (Counted: 2 wallet redirects shared by 2 entries each + 1 report.payment + 2 invoice mislabels + 1 reconcile + 2 thai-freight/shopGoods + 3 inventory + 2 business-config + 1 meeting-room + 1 purchasing.pending + 4 forwarders?q=… + 5 learning?topic=… + 7 barcode?mode=… + 8 qa.*?sla=… + 1 transferSalesRep landed-correctly so removed + 7 customers?group=… + 1 ?segment=freight.)

## 3. 🟠 Label drift — page is the right content, label string differs

| Sidebar label (TH) | href | Page renders | Notes |
|---|---|---|---|
| เป๋าตังทั้งหมด | `/admin/wallet` | "กระเป๋าเงิน — รายการ" | Same domain; word choice differs ("เป๋าตัง" colloquial vs "กระเป๋าเงิน" formal). |
| รายการสั่งสินค้าทั้งหมด | `/admin/service-orders` | "ฝากสั่ง — Ops" | Same domain; sidebar uses customer-facing wording, page uses internal "Ops" suffix. |
| รายการทั้งหมด (forwarder.listAll) | `/admin/forwarders` | "ฝากนำเข้า — Ops" | Same — "Ops" suffix bleeds in. |
| รายการฝากชำระ (payment.list) | `/admin/yuan-payments` | "ฝากโอนหยวน" | Same domain; "รายการฝากชำระ" vs "ฝากโอนหยวน". |
| เพิ่มรายการ (payment.add) | `/admin/yuan-payments/new` | (no h1 — uses form heading) | Acceptable; form below clearly labels itself. |
| รายงานคนขับรถ / พนักงานขับรถ / งานที่ต้องส่ง | `/admin/driver-runs` | "งานขนส่งที่ได้รับมอบหมาย" | Three sidebar labels point at the same driver-runs page — heading is closer to "งานที่ต้องส่ง" but used for all three. |
| ค่าตู้สินค้า (withdrawal.cntCost) | `/admin/accounting/disbursements?kind=container` | "AP Ledger / สมุดจ่าย (Container disbursements)" | English subtitle + Thai short label. Acceptable but mixed. |
| ค่าตู้สินค้า (accCargo.containerPay) | `/admin/accounting/container-payments` | "ตารางจ่ายเงินค่าตู้ (ค่าตู้สินค้า)" | Matches via i18n key `pcsContainer.pageTitle`. ✅ Match. |
| โบนัสเซลล์ | `/admin/sales-payouts` | "เบิกค่าคอม (sales payouts)" | "โบนัสเซลล์" vs "ค่าคอมเซลล์" — close enough. |
| โบนัสล่ามจีน | `/admin/commissions` | "ค่าคอม + Payouts (V-E8)" | Page is shared for sales + interpreter — heading not interpreter-specific. |
| ค่าคอมมิชชั่นล่าม | `/admin/commissions` | Same | Same. |
| โอนทีมขาย (userCargo.transferRep) | `/admin/customers/transfer-rep` | "ย้ายเซลล์ผู้ดูแลลูกค้า" | โอน vs ย้าย — synonyms. |
| ค่าคอม Forwarder | `/admin/forwarder-sales` | "รายงานค่าคอมมิชชันฝากนำเข้า" | Match (formal vs short label). |
| PCS Freight (withdrawal.freight) | `/admin/forwarder-sales` | Same | "PCS Freight" is too short; heading is more descriptive. |
| ประวัติการทำรายการ | `/admin/audit` | "บันทึกการกระทำของแอดมิน" | Same domain; "ประวัติ" vs "บันทึก". |
| เช็คข้อมูลขนส่งไทย | `/admin/carriers` | "จัดการขนส่ง (Carriers)" | "เช็ค" (check/lookup) vs "จัดการ" (manage). Drift. |
| รายงานลูกค้าตัวแทน | `/admin/reports/user-sales-history` | "ประวัติยอดขายต่อลูกค้า" | "ลูกค้าตัวแทน" specifically agent-customers; page is generic per-customer history. |
| ภาพรวม (accFreight.overview) | `/admin/reports` | "รายงาน" | Hub page; "ภาพรวม" → too generic. |
| ภาษีหัก ณ ที่จ่าย | `/admin/accounting/closing` | "ปิดงบฝากนำเข้ารายเดือน" | Page is monthly-closing; WHT may be embedded but heading doesn't reflect it. |
| ใบเสร็จ (×2 — accFreight.receipt, accCargo.receipt) | `/admin/tax-invoices` | "ใบกำกับภาษี" | "ใบเสร็จ" (receipt) vs "ใบกำกับภาษี" (tax invoice). Different documents in TH accounting. |
| ค้นหารหัสสมาชิก (userCargo.searchTop) | `/admin/customers/search` | (broken — no page) | Audit A territory. |
| แดชบอร์ดการเข้างาน | `/admin/hr/attendance` | "บันทึกเวลาเข้างาน" | "แดชบอร์ด" vs "บันทึก". |

**Subtotal — 🟠 drift: ~22.**

## 4. 🟡 Inconclusive — sidebar label not in page heading but content plausible

| Sidebar label (TH) | href | Page renders | Notes |
|---|---|---|---|
| Dashboard / Dashboard ทั้งหมด / Dashboard Freight / Dashboard Cargo | `/admin`, `/admin?c=…` | (no h1; renders KPI cards directly) | Page doesn't honor `?c=` filter; renders same dashboard for all 3 — could be confusing but plausibly the "right place". |
| รายงานตู้สินค้า (forwarder.cntReport) | `/admin/containers` | "ตู้คอนเทนเนอร์ (Spine)" via redirect | 1-line `redirect("/admin/warehouse/containers")`. Different label/heading but right domain. |
| รายงานฝากสั่ง (accCargo.shop) | `/admin/reports/monthly-orders` | "ออเดอร์ในเดือน · {label}" | Monthly-orders is a subset of รายงานฝากสั่ง — close enough. |
| ยอดทั้งหมด (accCargo.total) | `/admin/reports/forwarder-volume` | "ปริมาณฝากนำเข้า แยกตามต้นทาง × ขนส่ง" | "ยอดทั้งหมด" too generic; lands on a specific volume report. |
| ฝากชำระ/โอนหยวน (accCargo.payment) | `/admin/yuan-payments` | "ฝากโอนหยวน" | Match. |

**Subtotal — 🟡 inconclusive: ~7.**

## 5. ✅ Matches (count only)

Approximately **~28 of 103** sidebar items resolve to a page whose heading clearly matches the sidebar label — wallet history, wallet pay-user, forwarders search, freight quotes, freight declarations, refunds, refunds/new, broadcasts (all), bookings, contact-messages, audit, juristic-check, drivers, driver-runs (when entered as "งานที่ต้องส่ง"), HR (all 11), rates (all 5), reports/{forwarder-volume, hs-code-revenue, sales-by-rep, refunds, debtors, monthly-orders, credit-pending, pending-payments, containers-awaiting-th, containers-hs}, settings, settings/notifications, settings/tos-versions, settings/contacts, settings/business-config (when matched to `settingsCargo.general`-adjacent labels), accounting, accounting/{closing, periods, container-costs, container-payments}, kpi, csv-imports (×3), warehouse/{containers, bulletin, qa-inspections}, system/{crons, notifications}, team-leaders, sales-payouts (when label is "โบนัสเซลล์"), commissions, freight/shipments, freight/quotes/new, migration/pcs-customers, incidents, tax-invoices (when label "ใบกำกับภาษี" — not "ใบเสร็จ"), admins, barcode/driver, board, board/inbox.

## 6. Top-5 most-confusing mislinks (fix priority)

These hit daily flows and break ภูม's "zero retraining" D1 goal hardest.

| # | Sidebar label | href | Fix |
|---|---|---|---|
| 1 | **รายการเติมเงิน** (wallet.deposit) | `/admin/wallet/deposit` | **Change the page**, not the href. Replace the 1-line `redirect("/admin/wallet")` with a real page that lists ONLY `kind=deposit`. Today's deposit page being a redirect-stub is ภูม's exact reported case + accounting workflow's most-clicked item. |
| 2 | **รายการถอนเงิน** (wallet.withdraw) | `/admin/withdrawals` | Same fix pattern: replace `redirect("/admin/wallet?kind=withdraw&status=pending")` with a dedicated withdrawal-queue page that shows "รายการถอนเงิน" as its own heading. The redirect carries the right filter but the heading still reads "กระเป๋าเงิน — รายการ", so users can't tell whether the filter applied. |
| 3 | **All 6 customer-group sidebar items** (general / vip / svip / corporate / credit / comparison) | `/admin/customers?group=…` | **Implement the `?group` filter** in `app/[locale]/(admin)/admin/customers/page.tsx` — currently only reads `?q` and `?type`. Add `if (sp.group) q = q.eq("customer_group", sp.group);` + a "ลูกค้า — {group label}" dynamic heading. One small page change unlocks 6 sidebar items. |
| 4 | **All 8 QA / SLA queues** (`qa.*?sla=…`) | `/admin/reports/*?sla=…` | **Implement `?sla=` filter** across the 4 report pages (monthly-orders, containers-awaiting-th, pending-payments, credit-pending). Sidebar promises 8 distinct SLA-breach queues; today all 8 silently show unfiltered reports — the most blatant breach of the legacy PCS "left-menu = work queue" paradigm (per `lib/admin/sidebar-menu.ts` header comment). |
| 5 | **All 5 learning topics** (regulations / training / business-plan / culture / job-flow / newsfeed) | `/admin/learning?topic=…` | **Either**: (a) implement `?topic=` routing in `app/[locale]/(admin)/admin/learning/page.tsx` (dynamic content per topic) — the simpler win; **or** (b) drop the 5 distinct sidebar items and keep just one "เรียนรู้และข้อมูล" parent that opens the existing 4-card hub. Today the sidebar promises 5 separate destinations but delivers 1 hub regardless of click. |

**Bonus honourable mention — `?q=ownerless` / `?q=c` / `?q=6`** in `forwarder.list*` are *textbook* mislinks (sidebar feeds a status-filter-shaped value into a text-search box). The fix is to migrate those queries to `?status=` and implement the matching server-side filter — but it's lower priority than 1-5 because the four affected items are spread across menu blocks rather than back-to-back.

---

_End of audit. Author: reviewer agent for ภูม. Audit run: 2026-05-19 from worktree `claude/adoring-chandrasekhar-0f8ad7` against base commit `d27cf6c` (dave HEAD)._
