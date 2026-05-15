# 📋 Team status checkpoint — 2026-05-16 (post-merge + T-P1 batch)

> **Purpose:** ใครเปิด repo มาแล้วเห็นไฟล์นี้ → รู้ทันทีว่าเรา **อยู่ตรงไหน · ติดอะไร · ใครต้องทำอะไร**.
> **Last updated:** 2026-05-16 evening-16 (เดฟ via Claude) — **🔀 BIG INTEGRATION MERGE.** Pulled `origin/Poom` (ภูม — T-P4 G2 complete + Phase A-D Part U items + 4 migrations) + `origin/podeng` (ปอน — 5 L-5 landing pages + customs polish + port pricing carousel) into `dave`. Resolved 4 conflicts (tax-invoices page → ภูม's · templates → merged · package.json test chains → merged · _index.md → ภูม's). `pnpm verify` ✅ all gates pass. ก๊อต `main` unchanged (no new push).
> **dave HEAD:** post-merge — both น้องๆ branches integrated + เดฟ 8-commit hold-batch (validator tests +438 · ADR-0014 · STRATEGY refresh). Cargo loop V1 closes end-to-end incl. juristic tax invoice. Everyone → `git fetch && git merge origin/dave` before next batch.
> **Cadence:** ใครเปลี่ยน blocker / ปลดล็อค / ship ของใหญ่ → อัพไฟล์นี้ + commit `docs(team): status checkpoint <date> — <what>`.

---

## 🚀 TEAM-WIDE RUN-LONG MODE — read FIRST (active 2026-05-16 evening)

**Until:** เดฟ check-in (เดฟ stepping out; will pull `origin/dave` + review on return).
**Frame:** EMERGENCY cargo revenue sprint. Every task asks: *"ช่วยให้รับลูกค้า cargo ได้เร็วขึ้นไหม?"* — Yes = do · No = defer.

### Master rules (all roles)

1. **Sync first.** `git fetch && git merge origin/dave` into your branch. `dave` = staging hub.
2. **Read your brief.** `docs/briefs/<you>.md` for scope + patterns. Then your queue below.
3. **Pick top unblocked item** from your queue (P0 first). If blocked, skip to next priority.
4. **Patterns** (proven good in T-P1 + T-P3 review): Zod · `withAdmin([...])` per [ADR-0005](../decisions/0005-launch-operational-decisions.md) K-7 · idempotency on money-moving actions · granular audit log · `sendNotification` · `revalidatePath`.
5. **Update this doc** when you ship a big batch — mark ✅ in your queue + add to "Just shipped today" + commit `docs(team): status checkpoint ...`.
6. **Push at save-points only** (`push_frequency_strict`): end of session · before sleep · machine change · big batch done. ~1 push/session.
7. **Stay in V2 scope.** No refactor mid-burn ([ADR-0010](../decisions/0010-v2-v3-version-strategy.md)). Future ideas → `docs/v3-wishlist.md`.
8. **Don't preempt brand cleanup.** PCS/TTP/ไอแต้ม references survive until ก๊อต confirms API switchover (`docs/runbook/pcs-scrub-plan.md`).
9. **Escape hatch:** True blocker not in ADR/Part T/patterns → write flag at end of this doc → flip to next priority. เดฟ + ก๊อต respond async.

### Cross-dependency map (who unblocks whom)

```
ก๊อต K-12 GTM signup            → เดฟ T-D3 GTM verify + ปอน T-N3 CTA verification
ก๊อต K-13 Clarity signup        → ปอน heatmap reading (P2)
ก๊อต DV-1a Sentry signup        → prod error visibility (everyone)
ก๊อต DV-1b Upstash signup       → rate limit live (everyone)
ก๊อต DV-1c hCaptcha signup      → bot filter live (everyone)
ก๊อต T-G3 owner Bundle 1 call   → เดฟ DV-4 + entire payment path
ก๊อต MOMO endpoint inventory    → ภูม MOMO sync wire (post T-P2)
เดฟ migration apply prod        → T-D1 smoke test
เดฟ T-D1 cargo smoke test       → T-D4 soft-launch coordination
ภูม T-P5 /admin/accounting      → owner sees revenue dashboard (พี่ป๊อป stress ↓)
ภูม T-P2 containers + CT-3 view → customer "where is my container?" (churn ↓)
ภูม T-P4 tax invoice G2b-G2f    → juristic B2B customers can pay (>50% cargo value)
ปอน T-N1 SEO audit              → unblocks Ads (currently invisible to Google)
ปอน T-N2 ad landing quality     → cheaper CPC → more leads per same budget
```

Use this to prioritise the items that unblock the most downstream work.

### Per-role run-long quick reference

| Role | Brief | Top priority NOW | When blocked |
|---|---|---|---|
| **ก๊อต** | [`got.md`](../briefs/got.md) | K-12 GTM signup → K-13 Clarity → DV-1a/b/c (browser work, ~2h total) | Draft ADR-0011/0012/0013 (RBAC/shell/V2→V3 migration) OR K-sec-2 RLS audit |
| **ปอน** | [`podeng.md`](../briefs/podeng.md) | T-N1 SEO audit (why is pacred.co invisible?) → T-N2/T-N3 ad landing quality | Competitor analysis OR keyword research OR i18n polish (L-9b/c) |
| **ภูม** | [`poom.md`](../briefs/poom.md) | T-P5 `/admin/accounting` stub (acc-* PHP port) → T-P2 containers → T-P4 tax invoice G2b-G2f | T-P3 polish if any UX bug surfaces; else queue continues |
| **เดฟ** | [`dave.md`](../briefs/dave.md) | **stepping out** — returns to: T-D1 smoke test · migration apply prod · DV-1..DV-4 signups · DV-2 LIFF · DV-4 พี่ป๊อป Bundle 1 | n/a (reviewer/integrator) |

---

## 🟢 Just shipped today (ภูม + เดฟ merge)

| Commit | What |
|---|---|
| `121ea0d` | T-P1 admin workflow buttons: `adminAssignDriverToForwarder` + `adminMarkServiceOrderPaid` + UI on `/admin/forwarders/[fNo]` + `/admin/service-orders/[hNo]` (ภูม) |
| `84ca7b5` | T-P3 bulk approve: `adminBulkApproveDeposits` + `adminBulkApproveYuanPayments` + sticky bar UI on `/admin/wallet` + `/admin/yuan-payments` (ภูม) |
| `5969e6d` | T-P5 `/admin/accounting` owner overview: hero net-revenue card + prev-period delta + 4 pipeline cards + 2 customer-count cards (ภูม) |
| `175b295` | merge `Poom→dave` — เดฟ merged ภูม T-P1 + T-P3 batch after review (production-ready: RBAC per K-7, idempotency, 305 tests green) |
| `9000c28` | AGENTS.md §1 mandatory session-start handshake (เดฟ) |
| `f2230ed` | **T-D2 schemas:** `0033_containers.sql` + `0034_tax_invoices.sql` shipped → unblocks ภูม T-P2 + T-P4 (เดฟ) |
| `f410640` | **T-P1 GAP 3 closed:** customer service-order receipt page (`/service-order/[hNo]/receipt`) — pre-req for T-D1 cargo smoke test (เดฟ) |
| `32f5bcf` | P-31 cart cap doc fix (PORT_PLAN was wrong; trigger correct at >=151 per legacy) + this checkpoint header bump (เดฟ) |
| (this batch) | **T-P2 CT-3 customer-side shipment tracking** — `actions/shipments.ts` (RLS-scoped via `shipments_customer_read`) + `/shipments` list with status pills + container info + latest event hint + `/shipments/[code]` detail timeline (newest-first events with timeline pin styling) + sidebar nav entry + i18n (ภูม) |
| (this batch) | 🐛 **Fix migration 0033 schema collision** — original `create table if not exists public.containers` silently skipped column adds when 0016 phase-H had already created the table → `42703: column "source" does not exist` on index step. Rewrote to `alter table ... add column if not exists` pattern + status CHECK constraint expanded to union of 0016 + 0033 enum values. Re-runnable safely. **Action ก๊อต/เดฟ:** when running 0033 on prod, this rewritten version is the right one (ภูม commit superseded original `f2230ed` containers section) |
| (this batch) | 🐛 **Fix 0033+0034 admins composite-PK FK** — both migrations had `references public.admins(profile_id)` for `scanned_by` / `changed_by_admin` / `issued_by_admin` / `cancelled_by_admin` (4 FKs), but admins has composite PK `(profile_id, role)` so profile_id alone isn't unique → `42830`. Changed all 4 to `references public.profiles(id)` (admin-role enforcement happens via RLS, not FK). |
| (this batch) | **CT-2 + CT-4 warehouse spine** — `lib/warehouse/{containers,shipments,tracking,code-gen,index}.ts` typed clients with code generator (BKK timezone) + 15-assertion test · `actions/admin/warehouse.ts` (5 actions: createContainer/setContainerStatus/attachShipmentToContainer/setShipmentStatus/addTrackingEvent) gated to ['super','ops','warehouse'] (driver added for scan event) · `/admin/warehouse/containers` list with status/mode/code-substr filters + inline NewContainerForm · `/admin/warehouse/containers/[code]` detail with shipments-inside list (each row links back to forwarder/service-order + has inline ScanEventForm with auto-status checkbox) + ContainerStatusForm + container_status_history audit timeline · sidebar nav entry "ตู้คอนเทนเนอร์ (Spine)" + legacy "/admin/containers" relabeled `(legacy)` · AdminRole type extended with 'warehouse' + 'driver' (ภูม) |
| (this merge) | 🔄 **Adopted เดฟ's cargo_* rename hotfix** (`936dff7`) — superseded ภูม's earlier ALTER-TABLE patch with cleaner `cargo_containers/cargo_shipments/cargo_shipment_tracking/cargo_container_status_history` naming. Updated all my code (lib/warehouse/* typed clients · actions/shipments.ts customer-side · actions/admin/warehouse.ts · /admin/warehouse/containers list+detail) to use new table+column names (container_id → cargo_container_id, shipment_id → cargo_shipment_id). Re-fixed admins composite-PK FK (เดฟ's hotfix had reverted my earlier `profiles(id)` fix) — `scanned_by` + `changed_by_admin` now ref profiles(id) again. 320 tests still green. (ภูม) |
| (this batch) | **T-P4 G2b customer tax invoice request** — `lib/validators/tax-invoice.ts` (Zod with 13-digit RegEx) · `actions/tax-invoices.ts::requestTaxInvoice` (auth + ownership + status eligibility + idempotency on existing non-cancelled row + VAT-inclusive 7% snapshot subtotal/vat/total + `getMyTaxInvoiceForOrder` helper) · `components/tax-invoice-request-panel.tsx` (3 states: existing/eligible/ineligible · pre-populates from profile+corporate · 13-digit input filter · `no-print` class so it hides on Ctrl+P) · wired into both `/service-order/[hNo]/receipt` + `/service-import/[fNo]/receipt` pages with profile+corporate join for buyer-info pre-fill. G2c admin issuance flow next. (ภูม) |
| (this batch) | **T-P4 G2e-1 tax-invoice cancellation** — `actions/admin/tax-invoices.tsx::cancelTaxInvoice` gated `withAdmin(['super','accounting'])` per ADR-0005 K-7 + ADR-0006 §7 · accepts (id, reason ≥3 chars) · validates not-already-cancelled (allows pending → cancellation as "reject request" path · allows issued → cancellation as RD-Code-86 typo correction path) · optimistic update with `.neq('status','cancelled')` race-safe guard · audit log + customer notification (only for issued cancellations — pending = silent rejection per UX hint) · 4 revalidatePaths · `CancelButton` client component (2-step UX matching IssueButton: button → confirmation panel with status-aware bullet list + reason textarea + fire button) wired into both pending action zone (alongside IssueButton) and issued zone (under download link with explanatory hint). Original PDF stays in storage; download route already re-renders with diagonal CANCELLED watermark on the fly when status='cancelled' (G2c shipped this earlier). Customer can request fresh invoice via G2b after cancel (idempotency .neq('status','cancelled') already allows it). G2e-2 credit-note (ใบลดหนี้ for actual money refunds) deferred — typo correction is the common case and works via cancel+re-request. (ภูม) |
| (this batch) | **adminMarkForwarderPaid mirror** (เดฟ pickup note evening-6) — mirror of T-P1 `adminMarkServiceOrderPaid`: `actions/admin/forwarders.ts::adminMarkForwarderPaid` gated `withAdmin(['super','accounting'])` per ADR-0005 K-7 · validates status (rejects cancelled/delivered) · idempotency on existing wallet_tx (kind='import_payment', ref to f_no) · balance check skippable via `allow_overdraw` for cash/bank-direct path · debits wallet (-total_price · ref_type='forwarder' · admin_id stamped to distinguish from customer self-pay) · status flip pending_payment → shipped_china + stamps `date_shipped_china` · audit + customer notification + 3 revalidatePaths · panel added to `/admin/forwarders/[fNo]/update-form.tsx` (mirror of service-orders mark-paid panel: 💰 wallet button + 💵 cash override w/ confirm prompt) · page passes total_price prop. Closes the forwarder admin override path that was the only gap remaining after เดฟ's `payForwarderFromWallet` customer self-pay shipped. (ภูม) |
| (this batch) | **Phase D workflow batch — U2-4 + U2-1** (2 sub-tasks, 1 push). **U2-4 post-delivery cost adjustments** (chat W-4 AIR IMPORT): migration `0038_forwarder_cost_adjustments.sql` (table with kind enum (do_fee/gateway_fee/weight_rebill/customs_extra/other) · amount_thb · note · slip_url · status (unpaid→paid→cancelled) · paid_via_wallet_tx_id link · 2 defensive CHECK constraints for paid + cancelled metadata · admin/ops/accounting RLS) · `actions/admin/forwarder-cost-adjustments.ts` 3 actions (`adminAddForwarderCostAdjustment` super/accounting → notify customer; `adminMarkCostAdjustmentPaid` → debits wallet (-amount, kind='import_payment', ref to f_no, admin_id stamped) + flips status='paid' optimistic + notify; `adminCancelCostAdjustment` → status='cancelled' (rejects if already paid — must do refund flow instead)) · `CostAdjustmentsPanel` client component on `/admin/forwarders/[fNo]` sidebar (collapsed CTA · history list with kind+amount+note+timestamps+status badges · per-row action buttons: 💰 หัก wallet / 💵 รับเงินสด / ❌ ยกเลิก · "ค้างชำระ" total banner) · customer receipt page (`/service-import/[fNo]/receipt`) shows read-only adjustment list with status pills + total ค้างชำระ + LINE @pacred contact CTA + `no-print` so it hides on Ctrl+P. **U2-1 daily container bulletin** (chat W-1 MOMO+DOC SHIPPING): `lib/warehouse/bulletin.ts::buildDailyBulletin` (Bangkok-tz date format DD/MM/YY · ค้าง vs ใหม่ split via Bangkok-day boundary on created_at · transport emoji 🚚🚢✈️ · Thai status labels for all spine statuses · most-recent-update floats up · graceful empty + DB-error states) · `lib/warehouse/bulletin.test.ts` (+25 assertions, 4 sections including DB error case) · `/admin/warehouse/bulletin` page with stats grid + readonly textarea + 📋 copy-to-clipboard button + "หลักการ" hints box · sidebar nav entry "บุลเลตินตู้รายวัน" (super/ops/warehouse). Closes the staff "type out daily summary" 5-10min repetitive task. (ภูม) |
| (this batch) | **Phase C test coverage + bug-catch — U1-8 + T-P4 G2f** (2 sub-tasks, 1 push). **U1-8 PDF Thai-special-char tests** caught a **real latent production bug**: `fontStyle: italic` in `components/pdf/styles.ts` (originalCopy + amountInWords) — Sarabun italic variant not registered in `lib/pdf/register-fonts.ts`. Every forwarder PDF download would have failed at amountInWords render with "Could not resolve font for Sarabun, fontWeight 400, fontStyle italic". Fix: removed `fontStyle: italic` from both styles (visual distinction now via size/color/bg only). New `lib/pdf/render.test.tsx` (15 assertions): 5 PDF render cases covering ForwarderReceipt + TaxInvoice with edge Thai chars (ฤ, ฯ, ๆ, combining marks ก่ก้ก๊ก๋, Thai numerals ๒๓๔, paiyannoi ฯลฯ) + cancelled watermark variant — asserts buf > 1500 bytes + valid `%PDF-` magic. Test workaround: inline Sarabun registration to bypass `import "server-only"` (raw tsx can't resolve Next's virtual module). **T-P4 G2f**: `lib/validators/tax-invoice.test.ts` (33 assertions) — 6 sections covering requestTaxInvoiceSchema happy paths · 13-digit tax_id RegEx (12/14/letters/spaces/empty all rejected) · buyer field constraints (min/max, trim semantics) · order_type enum discrimination · VAT-inclusive 7% math (subtotal=total/1.07, vat=total-subtotal, rounding floor absorbed in vat to keep total exact) · cancel + re-request idempotency invariants. Closes T-P4 to 6/7 ✅ (only G2e-2 credit-note deferred). **Scholar-immortal:** 2 entries written to `docs/learnings/testing-patterns.md` (italic-font trap + tsx server-only workaround) so future agents skip rediscovery. (ภูม) |
| (this batch) | **Phase B tracking-gap batch — U1-5 + U1-3 + U1-4** (3 sub-tasks, 1 push) — closes 3 daily IT escalation channels from chat audit. **U1-5 received_qty/expected_qty** (chat MOMO qty=1 bug): migration `0037_cargo_shipments_received_qty.sql` adds `received_box_count int default 0 NOT NULL` (CHECK ≥0, allows >expected for unmanifested boxes) + `received_at_partial timestamptz` + comments + backfill (terminal-status rows get received=expected) · `lib/warehouse/types.ts::Shipment` extended with both new fields · `lib/warehouse/shipments.ts::setShipmentReceivedQty` typed client (validates int ≥0 + stamps received_at_partial) · `actions/admin/warehouse.ts::adminSetShipmentReceivedQty` (super/ops/warehouse) wraps with audit · customer detail page (`/shipments/[code]`) shows progress bar + "ได้รับแล้ว N / M กล่อง ✓ ครบ" + relativeTime since last partial scan · admin warehouse detail row shows "N/M กล่อง" with green tint when complete. **U1-3 rebind tracking → container** (chat ~10 SQL escalations/week): UI added via `ShipmentRowControls` client component on warehouse detail page — admin pastes target container UUID + confirm prompt → reuses existing `adminAttachShipmentToContainer` action (which already overwrites cargo_container_id correctly). **U1-4 manual tracking entry** (chat IT ~15 escalations/week): `actions/admin/warehouse.ts::adminCreateShipmentManual` (super/ops/warehouse) — accepts customer_ref as profile_id (UUID) OR member_code (PR####) auto-detected via UUID regex · validates source order (forwarder XOR service_order) belongs to that customer · creates cargo_shipment via `dbCreateShipment` · auto-attaches to current container · default-on initial scan_receive event for timeline transparency · 23505 unique-code conflict friendly mapping · refresh container totals · audit. `ManualShipmentForm` client component sits in warehouse detail sidebar (collapsed dashed-border CTA, expands to full form with 3-col box/weight/cbm grid). Closes the gap before MOMO sync activates (currently blocked on ก๊อต MOMO-1). 272 tests still green. (ภูม) |
| (this batch) | **Phase A quick-win batch — U1-7 + U1-6 + U2-3 + U2-5** (4 sub-tasks, 1 push) — **U1-7 last-sync timestamps** on customer tracking pages: `lib/utils/relative-time.ts` (Thai-locale `relativeTimeTh` + `freshnessClass` helpers, +17 unit assertions) · `/shipments` list shows freshness pill + stale-data hint banner when fresh<24h, stale 1-7d, very-old >7d · `/shipments/[code]` detail hero shows per-shipment freshness pill + nudge banner (closes chat L-4 trust). **U1-6 MOMO 9-status verbatim port** per chat audit: replaced เดฟ's best-guess types with the exact PCS DEV chat 2026-05-02 enum (`loading_container` / `ek_left_china_border` / `ek_arrived_vietnam_border` / `in_transit` / `sea_leaving_china` / `sea_arrived_thailand_port` / `ek_arrived_mukdahan` / `unloading_in_thailand` / `unloaded_completed`) + corrected `MOMO_STATUS_TO_PACRED` mapping per audit table + new `MOMO_STATUS_LABEL_TH/EN` for admin UI when displaying raw MOMO status · re-exported from public surface (index.ts). **U2-3 carriers admin CRUD** (chat L-8: 4 asks/6wk for new carriers): migration `0036_carriers.sql` (carriers table with code/name_th/name_en/tracking_url_template/is_active/sort_order/note · code-format CHECK · authenticated-read + super/ops-write RLS · seeded SPX/J&T/Flash/EMS/Lalamove with tracking URL templates) · `actions/admin/carriers.ts` (`adminUpsertCarrier` create-or-update with code immutability + 23505 unique-conflict mapping; `adminDeactivateCarrier` soft-delete) · `/admin/carriers` page (sortable list w/ active counts + inline NewCarrierForm + per-row CarrierRowActions w/ inline edit form + activate/deactivate toggle) · sidebar nav under ปฏิบัติการ (super/ops). **U2-5 admin bulk-tracking search** (chat W-9 + port of legacy `forwarder-search-muti.php`): `actions/admin/bulk-tracking-search.ts::adminBulkTrackingSearch` (super/ops/accounting; parses newline/comma/space-separated input · dedups + caps at 200 · runs 3 parallel queries against `forwarders.tracking_chn` + `forwarders.tracking_th` + `forwarder_items.product_tracking` · returns matched rows + unmatched list + searched count) · `/admin/forwarders/bulk-search` page + BulkSearchForm client (textarea + 2 result tables: matched w/ links to admin detail, unmatched w/ copy-to-clipboard button) · "🔍 ค้นหา tracking หลายเลข" link added to /admin/forwarders header. (ภูม) |
| (this batch) | **T-P4 G2c admin issuance flow + PDF** — migration `0035_tax_invoices_storage.sql` (private 'tax-invoices' bucket + customer/admin read policies) · `components/pdf/tax-invoice.tsx` (RD Code 86 layout: seller block w/ TAX_ID + ADDRESSES.office, buyer snapshot, line table, subtotal/VAT/total + readThaiBaht spell-out, ผู้รับเงิน/ผู้มีอำนาจ signature lines, diagonal CANCELLED watermark when status='cancelled', Thai BE date format) · extended `components/pdf/styles.ts` with receiptTitleEn/originalCopy/buyerColWide/cancelledOverlay/cancelledText · `actions/admin/tax-invoices.tsx::issueTaxInvoice` gated `withAdmin(['super','accounting'])` (atomic serial via `next_tax_invoice_serial()` RPC → `renderToBuffer` PDF → upload to `tax-invoices/{profile_id}/{serial}.pdf` → flip status='issued' optimistic on `status='pending'` → audit + notify customer + revalidate 4 paths) · `notify.taxInvoiceIssued/Cancelled` templates added to `lib/notifications/templates.ts` · `GET /api/tax-invoice/[id]` route (auth + RLS-scoped row visibility + admin storage download for issued / on-the-fly re-render with watermark for cancelled / 409 for pending) · `/admin/tax-invoices` list with status filter chips + counts + per-row link · `/admin/tax-invoices/[id]` detail (snapshot warning · order ref backlink · lines table with subtotal/VAT/total footer · 3 status panes: pending=IssueButton, issued=download, cancelled=watermarked download) · 2-step IssueButton (confirm → fire) with 9 typed error translations · sidebar nav entry "ใบกำกับภาษี" under การเงิน group (accounting role) · customer panel download URL updated to `/api/tax-invoice/[id]` (no .pdf suffix, Content-Disposition handles filename). Loop closes B2B tax invoice end-to-end except G2e cancellation (next ~3-4h). (ภูม) |

**Tests:** 345 unit-test assertions all green (test:unit suite, +73 across this run: 17 relative-time + 15 PDF render + 33 tax-invoice validator + 25 bulletin formatter).

---

## 🟢 Just shipped overnight (เดฟ — merged from `origin/dave`)

50+ commits including:

| Area | What |
|---|---|
| **ADRs (8 NEW)** | 0003 china-search vendor cutoff (Option E) · 0004 payment gateway (PromptPay-only beta) · 0005 K-4..K-7 launch ops · 0006 tax invoice flow · 0007 analytics + A/B · 0008 ERP draft · 0009 ERP schema sketch · 0010 V2/V3 strategy |
| **Code** | `lib/analytics.ts` + `lib/experiments.ts` + `experiments-server.ts` (45 new unit tests · GTM dataLayer + cookie-based A/B bucketing) · OTP dual-pepper rotation accept-window · PROMPTPAY soft-degrade |
| **Audits** | OWASP Top 10 desk audit · `pnpm audit:{md,env,i18n,all}` scripts · `.github/workflows/ci.yml` · `pnpm verify` umbrella |
| **Runbooks** | `docs/runbook/{otp-pepper-rotation,pcs-scrub-plan,vercel-cron-plan}.md` |
| **Docs** | `docs/learnings/` corpus (7 topic files) · `docs/integrations/momo-jmf.md` · `docs/sprints/archive-a-to-n.md` · 9 new agent skills in `.claude/skills/` |
| **Brand** | R2 PCS scrub sweep (4 user-visible files migrated to `CONTACT.*` imports) · LINE_OA constants centralised in `components/seo/site.ts` |

---

## 🆘 Pacred owner blockers (need พี่ป๊อป — Bundle 1 from Part Q)

ใครคุยกับพี่ป๊อปได้ → ขอให้ครบ 4 อย่างนี้ → unblock 70% ของ launch path:

| # | Item | Blocks |
|---|---|---|
| 1 | **PromptPay number** (เบอร์โทร 10 หลัก หรือ tax-ID 13 หลัก, no dash) | wallet deposit production (ตอนนี้ throw error) |
| 2 | **Bank account** number + ชื่อธนาคาร + ชื่อบัญชี (ใช้พิมพ์ใน QR receipt) | wallet deposit + tax invoice + receipt PDFs |
| 3 | **Pacred company info** (legal name TH/EN, tax ID 13 หลัก, ที่อยู่จดทะเบียน, เบอร์กลาง, email) | tax invoice flow (ADR-0006) + email templates + footer |
| 4 | **LINE Premium ID `@pacred`** subscription confirm + LIFF app create access | LINE customer push (D-1-LIFF unblock) |

> **What happens without these:** beta launch ทำได้แต่ในโหมด degraded — wallet deposit broken, tax invoice ใช้ไม่ได้, customer ไม่ได้รับ LINE notify, receipt PDFs มีข้อมูลไม่ครบ.

---

## 🔴 ก๊อต queue (run-long ACTIVE — Part S2 + Part T-G)

| # | Task | Est | Priority |
|---|---|---|---|
| **K-12** | GTM container + GA4 signup → `NEXT_PUBLIC_GTM_ID` ใน Vercel | 30-45m | 🚀 **P0 — start here** (unblocks ปอน T-N3 + เดฟ T-D3) |
| **K-13** | Microsoft Clarity signup → `NEXT_PUBLIC_CLARITY_ID` ใน Vercel | 15-30m | 🚀 **P0 — parallel to K-12** (free tier; just signup → ID) |
| **DV-1a** | Sentry signup → `SENTRY_DSN` ใน Vercel | ~30m | 🚀 **P0 — parallel** |
| **DV-1b** | Upstash Redis DB → `UPSTASH_REDIS_REST_URL/_TOKEN` ใน Vercel | ~30m | 🚀 **P0 — parallel** |
| **DV-1c** | hCaptcha site → `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` | ~30m | 🚀 **P0 — parallel** |
| **MOMO-1 (T-G2)** | Call MOMO dev → endpoint inventory → fill [`integrations/momo-jmf.md`](../integrations/momo-jmf.md) | ~2h | 🚀 **P0.5** (unblocks ภูม MOMO sync wire post-T-P2) |
| **T-G3** | Pacred owner call — Bundle 1 (PromptPay + bank + tax-ID + legal name) | ~30m call | 🚀 **P0.5** (unblocks payment path entirely) |
| K-sec-2 | RLS policy comprehensive audit — every Supabase table | 3-4h | 🟡 **P1 (when blocked on signups/calls — heavy-focus item)** |
| K-sec-3 | Audit log coverage gap report | 1-2h | 🟡 **P1 (when blocked)** |
| CSP-1 | CSP migrate from `'unsafe-inline'` to nonce-based per Next 16 | ~4h | 🟡 **P1 (post K-sec audits)** |
| **ADR-0011** | ERP RBAC granular roles per module | 2-3h | 🟢 **P2 (run-long — when all P0/P1 cleared OR while waiting on owner)** |
| **ADR-0012** | ERP frontend shell — same app vs `erp.pacred.co` | 2-3h | 🟢 **P2** |
| **ADR-0013** | ERP V2→V3 migration strategy | 2-3h | 🟢 **P2** |
| **D-7** | Payment Gateway post-beta provider pick (Omise / 2C2P / Stripe TH) | Owner call + decision | 🟢 **P3 (post-beta, post-Bundle 1)** |
| Renovate | Auto-dep PRs setup | ~1h | 🟢 P3 (quick win when bored) |

**Run-long sequence:** browser/call work first (K-12 → K-13 → DV-1a/b/c → MOMO-1 → T-G3) in any order, parallel friendly · then while waiting on owner/MOMO callback, draft ADRs (0011/0012/0013) or K-sec-2 RLS audit · finally CSP + Renovate as polish. Push to `main` is review-only — your work surfaces via ADR files + env vars in Vercel + audit docs.

---

## 🆕 ภูม mirror pickup — `adminMarkForwarderPaid` (added 2026-05-16 evening-6)

Parallel to ภูม's T-P1 work where she shipped `adminMarkServiceOrderPaid`, the **forwarder side also needs an admin mark-paid action**. เดฟ just shipped `payForwarderFromWallet` (customer self-service, closes import loop the same way pay-from-wallet closes shop-order loop). The admin override / cash-on-delivery path is still needed.

**Pattern to mirror exactly from `adminMarkServiceOrderPaid` (T-P1 / commit `121ea0d`):**

```ts
// actions/admin/forwarders.ts  (or wherever forwarder admin actions live)
export async function adminMarkForwarderPaid(input: {
  f_no: string;
  allow_overdraw?: boolean;
}): Promise<AdminActionResult<{ tx_id: string; already_paid: boolean }>>
```

- `withAdmin(["super", "accounting"])` per ADR-0005 K-7 (wallet movements = accounting)
- Validates status: reject `cancelled` and `delivered`; allow `pending_payment` (and arguably any pre-shipped status, mirror customer flow)
- Idempotency check on `wallet_transactions` (reference_type='forwarder', reference_id=f_no, kind='import_payment', status='completed')
- Balance check (unless `allow_overdraw=true`)
- Insert wallet_tx: bucket='main', amount=-total_price, kind='import_payment', reference_type='forwarder', reference_id=f_no, admin_id=adminId, note with override flag
- Flip `forwarders.status` → 'shipped_china' (matches `payForwarderFromWallet` behavior — though admin can override the status via the existing status workflow if a different next-state is needed)
- `logAdminAction(adminId, "forwarder.mark_paid", "forwarder", forwarder_id, { ... })`
- `sendNotification(profile_id, ...)` — success severity, link_href = `/service-import/${f_no}`
- `revalidatePath` on admin + customer pages

**UI:** add the "บันทึกการชำระเงิน" panel to `/admin/forwarders/[fNo]` mirror of `update-form.tsx` in `/admin/service-orders/[hNo]/` — two buttons: "💰 บันทึกชำระจาก wallet" + "💵 รับเงินสด/นอกระบบ (override)".

**Est:** ~2-3h (mostly copy-paste from T-P1 + adjust column names). Run-long priority: insert between T-P5 (done) and T-P2.

---

## 🆕 MOMO JMF lib scaffold (added 2026-05-16 evening-7 — เดฟ prep for ภูม)

Created `lib/integrations/momo-jmf/` skeleton so ภูม can move fast once ก๊อต MOMO-1 lands (endpoint inventory call to MOMO dev).

**Files shipped:**
- `lib/integrations/momo-jmf/types.ts` — typed shapes for `MomoContainerSummary` / `MomoContainerDetail` / `MomoShipmentSummary` / `MomoTrackingEvent` / `MomoWebhookPayload` + `MOMO_STATUS_TO_PACRED` mapping → `cargo_containers.status` (per 0033)
- `lib/integrations/momo-jmf/client.ts` — typed HTTP client with `Authorization: Bearer ${MOMO_JMF_TOKEN}` + `MOMO_JMF_BASE_URL`. **Demo mode** when env not set → returns `{ ok: false, error: "not_configured" }` (no exceptions in customer paths). Public methods: `listContainers(updatedSince?)` / `getContainer(code)` / `getContainerManifest(code)` / `getShipmentTracking(shipmentCode)`.
- `lib/integrations/momo-jmf/sync.ts` — **skeleton** `syncContainersFromMomo(since?)`. Body intentionally minimal pending ก๊อต MOMO-1. JSDoc above the function has the FULL pseudo-code for the upsert loop ภูม fills (per migration 0033 cargo_* tables). Pattern reference: existing `actions/admin/csv-imports.ts` upsert+audit+idempotency conventions.
- `lib/integrations/momo-jmf/index.ts` — public re-export surface (import from `@/lib/integrations/momo-jmf`).

**ภูม pickup (after ก๊อต MOMO-1):**
1. Verify `MomoContainerSummary` matches actual MOMO response → adjust `types.ts` if not
2. Fill `syncContainersFromMomo` upsert loop per the JSDoc TODO checklist
3. Add `/api/cron/momo-jmf-sync/route.ts` calling `syncContainersFromMomo` with CRON_SECRET check (mirror existing cron routes)
4. Add cron entry to `vercel.json` — pending เดฟ confirms Pro plan (already at 5 crons; Pro allows 100)
5. Add `/api/webhooks/momo-jmf/route.ts` receiver for inbound status pushes
6. Build customer view `/service-import/[fNo]/container` showing the cargo_container card + cargo_shipment_tracking timeline (per container-centric-model.md design)
7. Build admin view `/admin/warehouse/containers` + `/admin/warehouse/containers/[code]`

---

## 🟢 `/admin/tax-invoices` list page (evening-15)

Admin list view shipped — ภูม T-P4 G2c admin issuance flow is now ~30% done.

**File: `app/[locale]/(admin)/admin/tax-invoices/page.tsx`** — resilient list:
- Status filter chips (pending/issued/cancelled with counts)
- Table: serial · buyer name + tax_id · parent order link (service_order OR forwarder) · total + VAT · status badge · request/issued dates
- **Pre-migration safe** — if `tax_invoices` table doesn't exist (0034 not yet applied), shows friendly "⚠️ ระบบกำลังเตรียมการ" message with how-to-enable steps; no crash on dev
- Footer note explains 3-state flow + RD Code 86 immutability (cancel + credit note pattern)

**ภูม T-P4 G2c remaining follow-ups (≈40-50% of G2c):**
1. `/admin/tax-invoices/[id]/page.tsx` — detail view with PDF preview + issue button + cancel button
2. `actions/admin/tax-invoices.ts::adminIssueTaxInvoice` — calls `next_tax_invoice_serial()` Postgres function (atomic) → renders react-pdf template → uploads to Storage bucket `tax-invoices/{profile_id}/{serial_no}.pdf` → UPDATE tax_invoices to status='issued' → notify customer via `notify.taxInvoiceIssued` (template already shipped evening-14)
3. `actions/admin/tax-invoices.ts::adminCancelTaxInvoice` — cancellation + credit note creation (new tax_invoices row with credit_note_id pointing to original)
4. `components/pdf/tax-invoice.tsx` — react-pdf template (fork from `forwarder-receipt.tsx`); use Sarabun font; required RD Code 86 fields per ADR-0006 §2

---

## 🟢 `requestTaxInvoice` action scaffold (evening-14)

Customer-side action shipped — ภูม T-P4 G2b is now mostly done; she just needs to:
1. Apply migration 0034 on dev (creates `tax_invoices` + `tax_invoice_lines` + serial fn)
2. Add `tax_invoice` to `NotifyReferenceType` enum + DB CHECK constraint (currently action uses `contact_message` as fallback per existing T-P1 precedent)
3. Build the form UI on customer receipt pages calling `requestTaxInvoice(...)`
4. (T-P4 G2c) Write `adminIssueTaxInvoice` mirror action with PDF generation + Storage upload + `next_tax_invoice_serial()` Postgres function call

**File: `actions/tax-invoice.ts`** — follows ADR-0014 verbatim:
- Auth → RLS-fetch parent (service_order OR forwarder via discriminated union)
- Parent status gate (terminal-ish states only)
- Idempotency (one pending/issued tax_invoices per profile + parent)
- Buyer snapshot from `corporate` (juristic) OR `profiles.tax_id` (personal-with-tax-ID) — fails cleanly if `tax_id` missing with actionable Thai error message
- VAT 7% breakdown computed (inclusive vs exclusive per ADR-0006 §6)
- Admin client INSERT into `tax_invoices` (status=pending, financial snapshot frozen)
- Notify admins (super + accounting per ADR-0005 K-7) via `notify.taxInvoiceRequested`
- revalidatePath on customer receipt + admin tax-invoices list

**New notify templates** in `lib/notifications/templates.ts`:
- `notify.taxInvoiceRequested` (admin-recipient, info severity)
- `notify.taxInvoiceIssued` (customer-recipient, success severity — ready for G2c admin action)

---

## 🔒 ADR-0014 locked (evening-12)

**[ADR-0014 — Customer self-service state-machine transitions](../decisions/0014-customer-self-service-state-transitions.md)**

Formalises the **admin-client-after-ownership-verify** pattern used by both `payServiceOrderFromWallet` + `payForwarderFromWallet`. Future customer self-service actions (tax invoice request · cancel order · mark delivery received) MUST follow this pattern.

**6-step template** locked:
1. Auth check via `supabase.auth.getUser()`
2. RLS-respecting fetch confirms ownership + business preconditions
3. Idempotency check on side-effect table (key: `reference_type + reference_id + kind + status='completed'`)
4. Switch to admin client for the actual mutations
5. **Don't roll back** side effect on state-update failure — preserve audit trail
6. Fire-and-forget notify + revalidatePath

**Canonical references table** in the ADR maps current + planned uses.

---

## 📋 Major audit batch — chat + legacy cleanup (evening-8)

Two parallel audits completed 2026-05-16 evening:

**[`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md)** — 7 LINE chats over 6 months
- 10 ranked **leak holes** (L-1..L-10) from team chats
- **Canonical MOMO 9-status enum** from PCS DEV chat May 2 (port verbatim)
- 9 **workflows the team really uses** (vs documented PHP) — daily container bulletin, จองรถ template, HS code lookup, etc.
- **Customer pain themes** ranked by frequency
- Partner integration notes (MOMO: no backend write access; owner asked May 8)
- 8 recurring dev/IT requests with Pacred status

**[`docs/audit/legacy-cleanup-2026-05-16.md`](../audit/legacy-cleanup-2026-05-16.md)** — pcscargo PHP sweep
- ~115 dead-code files + 3 full backup dirs **safe to delete** (Tier 1-3)
- **6 NEW critical security findings** (file:line specific): plaintext password 10-year cookie · weak `pass_tam()` MD5 · SQLi in `header.php` (highest-impact!) · hardcoded LINE OAuth secret · unprotected `api/autorun/` cron · unsafe file upload
- ~5 **should-port** admin tools (MaoMao tier, ShipBy-Freedom, monthly close, interpreter payout) — none revenue-blocking
- Newer SQL dump 2026-04-30 supersedes Desktop dump
- Activity signal unusable (bulk-copied 2026-03-19)

**Action items consolidated in [PORT_PLAN Part U](../PORT_PLAN.md):**
- **U1** (9 items) — critical leak holes must-fix before beta (incl. `/status` page, OTP balance alert, rebind UI, MOMO enum, SQLi patch)
- **U2** (6 items) — workflow gaps from chat (carrier CRUD, จองรถ form, bulk tracking search)
- **U3** (6 items) — legacy cleanup (snapshot + delete + archive SQL + revoke OAuth)
- **U4** (4 items) — pre-launch security (cookie clear, breach disclosure, secret rotation)
- **U5** (10 items) — should-fix P2/P3 (HS lookup, lead routing, LP-1 rates table, etc.)

**Dispatch priority for each role:**

**ก๊อต (security + cleanup gates):**
- U1-9 SQL injection patch decide (PHP exposed? if no → skip; if yes → 30m)
- U3-5 revoke LINE Notify OAuth client (15m, do anytime)
- U3-6 short-URL redirect plan with เดฟ (1h)
- U4-* security cleanup (post-cutover sequencing)

**ภูม (most U items):**
- U1-3 + U1-4 admin rebind + manual tracking UI (closes daily IT escalations)
- U1-5 received_qty/expected_qty schema update + UI (closes container-split qty=1)
- U1-7 last-sync timestamp on tracking pages
- U2-3 carrier admin CRUD (no dev required for SPX/J&T)
- U2-5 multi-line bulk tracking search (~1h quick win)
- U5-1 HS code lookup tool (P2, biggest)

**ปอน (frontend surfaces only):**
- U2-2 จองรถ form UI (after ภูม backend)
- U5-5 slip upload UX (drag-drop + OCR)

**เดฟ (next session pickup):**
- ~~U1-1 `/status` health check page~~ ✅ **DONE evening-9** — public route at `/status` with Supabase live ping + 11 service config checks + traffic-light dots + 60s server-side cache + bilingual TH/EN. Now linked from Footer (evening-10).
- ~~U1-2 OTP SMS balance check cron scaffold~~ ✅ **DONE evening-10** — `app/api/cron/sms-balance-check/route.ts` + `lib/sms/gateway.ts::checkSmsBalance()` + `notify.smsBalanceLow` template. Daily alert to admins opted-in via `notify_channels.sms_balance_alert`. **Not yet in vercel.json** — pending Pro plan confirm. ภูม/ก๊อต: confirm exact ThaiBulkSMS balance endpoint when DV-3 SMS keys arrive (best-guess `GET /credits` in scaffold).
- ~~U1-8 PDF audit (Sarabun + WHT)~~ ✅ **verified evening-10** — Sarabun font already registered (`lib/pdf/register-fonts.ts`) handles Thai special chars cleanly. WHT (ภาษีหัก ณ ที่จ่าย) deferred per ADR-0006 §8 (await first B2B juristic need). Chat L-5 finding closed by existing implementation.
- ~~U2-5 multi-line bulk tracking search~~ ✅ **DONE evening-10** — `/admin/forwarders` search bar toggles between single-line + multi-line textarea. Multi-mode persists via `?q_multi=` URL param. Matches if ANY line appears in ANY of f_no/tracking_chn/tracking_th/member_code. Closes chat W-9 daily workflow.
- U3-1 PHP tree snapshot tarball (15m, do anytime locally)
- U3-2 delete Tier 1-3 dead code in pcscargo (30m, do anytime locally — pcscargo is not in git)
- U3-3 archive SQL dump (15m)

---

## 📋 Vercel cron audit (resolved evening-7)

`docs/runbook/vercel-cron-plan.md` already exists with full diagnosis:
- 5 cron jobs in `vercel.json` (auto-cancel every 15min · sales-daily-digest 17:05 · refresh-active-customers 01:00 · expire-probation 02:00 · expire-driver-assignments hourly)
- Hobby plan = max 2 crons + daily-only schedules → Pacred needs **Pro plan** ($20/mo)
- Pro plan = 100 cron limit + any schedule → ample headroom

**Status:** ✅ doc is current; **เดฟ pending: confirm Pacred Vercel project is on Pro tier** (Vercel dashboard → Project → Settings → General → Plan). If Hobby, upgrade before next deploy to avoid Vercel silently dropping crons #3-5.

---

## 🔴 เดฟ queue (Part S4 + Part T-D) — **NEXT SESSION** (เดฟ stepping out)

| # | Task | Est | Status / Blocks |
|---|---|---|---|
| **T-D2** | Backend specs for ภูม — `0033_containers.sql` + `0034_tax_invoices.sql` | 3h | ✅ **DONE + PUSHED** (this session) |
| Customer receipt page | T-P1 GAP 3 — `/service-order/[hNo]/receipt` | 30m | ✅ **DONE + PUSHED** (this session) |
| **Migration apply prod** | Apply 0023..0034 (12 files) to production Supabase via Dashboard or CLI | 30m | 🟡 **next session — pre-req for T-D1** |
| **DV-1** | Same as ก๊อต DV-1a/b/c — actually owned by ก๊อต now per Part S2 | — | (delegated to ก๊อต) |
| **DV-2** | Create LIFF app in LINE Console (Channel ID `2009931373`) → `NEXT_PUBLIC_LIFF_ID` ใน Vercel | 30m | 🟡 next session — unblocks D-1-LIFF customer push + ปอน "LINE OA" CTA |
| **DV-3** | ThaiBulkSMS account apply → API keys → Vercel env | 30m + paid | 🟡 next session — needed for OTP_BYPASS=false |
| **DV-4** | Pacred owner ติดต่อ — Bundle 1 (PromptPay + bank + company info + LIFF ID) | 15m + รอ | 🟡 next session — actually owned by ก๊อต T-G3; เดฟ assists with sequencing |
| **T-D1** | **Cargo flow end-to-end smoke test** (signup → topup → order → admin marks paid → receipt) | 4-6h | 🔴 next session — pre-reqs (receipt page ✅, migrations apply pending) |
| **T-D3** | L-22 GTM verify after ก๊อต K-12 — events → GTM Preview Mode → GA4 | 30m | 🔴 next session — depends ก๊อต K-12 |
| **T-D4** | Internal soft-launch coordination — 5 friendly customers (พี่ป๊อป network) | 2h coord + ongoing | 🔴 next session — depends T-D1 green |

**เดฟ on return** picks up in order: migration apply prod → T-D1 smoke → confirm ก๊อต K-12/K-13 active → T-D3 verify → T-D4 soft-launch coord.

---

## 🟢 ภูม queue (Part T priority — current sprint)

| # | Task | Est | Status |
|---|---|---|---|
| **T-P1** | Admin workflow buttons (driver assign + mark-paid) | 6-10h | ✅ **DONE + MERGED** (commit `121ea0d` → dave; receipt-page GAP 3 closed by เดฟ `f410640`) |
| **T-P3** | Wallet/yuan-payments admin **bulk approve** | 2-3h | ✅ **DONE + MERGED** (commit `84ca7b5` → dave) |
| **T-P5** | `/admin/accounting` owner overview | 3-5h | ✅ **DONE** (commit `5969e6d` → Poom; awaiting dave merge) |
| **T-P2** | CT-1..CT-4 container model | 7-10h | ✅ **CT-3 + CT-2 + CT-4 DONE** (multiple batches) — `actions/shipments.ts` + `/shipments` customer list/detail + `lib/warehouse/*` typed clients + `actions/admin/warehouse.ts` + `/admin/warehouse/containers` list + `[code]` detail with shipments + scan recorder + status form + audit history + sidebar nav. CT-5/CT-6 (MOMO sync + webhook) blocked on ก๊อต T-G2 |
| **T-P4** | G2 tax invoice issuance per ADR-0006 — phases G2a-G2f | 14-19h | 🟢 **G2a + G2b + G2c + G2d + G2e-1 + G2f ✅** (only G2e-2 credit-note remains — defer until actual money-refund case appears). Schema (เดฟ `f2230ed`) + customer request + admin issuance + PDF + download route + cancel-issued + 33-assertion validator/math test suite all done. |
| **T-P1 GAP 3** | Customer receipt page `/service-order/[hNo]/receipt/page.tsx` | 30m | ✅ **DONE (เดฟ `f410640`)** — pre-req for T-D1 cargo flow smoke test satisfied |

---

## 🟡 ปอน queue (run-long ACTIVE — Part S3 + Part T-N)

| # | Task | Est | Priority |
|---|---|---|---|
| **T-N1** | **SEO emergency audit** — why pacred.co not in Google? · sitemap deploys? · GSC indexing errors? · request manual reindex | ~3h | 🚀 **P0 — START HERE** (site invisible = Ads wasted; biggest leverage) |
| **T-N2** | Ad landing quality on top-5 pages — h1 intent keyword · CTA above fold · LCP <3s on 4G · phone+LINE visible | ~3-4h | 🚀 **P0** (quality score affects CPC) |
| **T-N3** | Funnel CTA wiring on top-5 cargo pages — `generate_lead` / `cta_click` / `start_signup` events into GTM | per-page chunks | 🟡 **P1 partial — top-3 covered (DV-8 Phase 1); finish mobile + Promotion section** |
| **T-N5** | Mobile QA top-5 cargo pages — most TH cargo buyers browse mobile | ~2h | 🚀 **P0 — parallel to T-N1/T-N2** |
| **L-5 priority polish** | Order CONFIRMED by เดฟ (run-long): **home → import-china → china-shopping → customs-clearance**. Execute in this order, ~3-4h each chunk. | ~12-16h total | 🟢 **P1 — autonomous (no more confirm needed)** |
| PCS scrub frontend half | R2 — `components/`, `app/[locale]/(public)/`, `messages/` | ~2-3h | 🟢 **P1** (coordinate with ภูม backend half — `docs/runbook/pcs-scrub-plan.md`) |
| **T-N4** | Phase I landing shells — customs-clearance / customs-broker-matching / tax-invoice / logistics | ~6h | 🟡 **P2 — blocked on Pacred owner copy direction** (escalate via team-status flag) |
| Phase D L-9b/c i18n polish | EN namespace normalize + same-value list review (`pnpm audit:i18n`) | ongoing | 🟢 **P2 self-directed (chip away anytime)** |
| "เพิ่ม LINE OA" CTA at landing pages | drop button + LIFF link on top-5 pages | 1h | 🟡 **P2 blocked on เดฟ DV-2 (LIFF app creation)** — do once `NEXT_PUBLIC_LIFF_ID` lands |
| **Marketing research** | Competitor analysis (top 5 TH cargo competitors) · keyword research (Ahrefs/free tools) · customer painpoint synthesis from sales intake | ~4-6h chunks | 🟢 **P2 self-directed when bored or blocked on owner critique** |
| **A/B experiments** | First experiment after L-24 substrate — pick hypothesis, wire variant, drop `<ExperimentBeacon>` | ~2h setup + 1-2 wk traffic | 🟢 **P3 — when K-12 GTM active** |

**Run-long sequence:** T-N1 + T-N5 + T-N2 in parallel (different surfaces) · then L-5 home → import-china → china-shopping → customs-clearance in order · then T-N3 finish · then Phase I shells when owner copy lands · marketing research as filler. Push to `origin/podeng` at save-points only (end of WFH stretch).

---

## ✅ Decisions LOCKED (no more discussion needed)

Per Part S1 + ADRs 0003-0010:

- **R1 china-search vendor:** Option E hybrid (Track G code stays in repo, **DON'T set `PACRED_TAMIT_*` / `PACRED_AKUCARGO_*` / `PACRED_LAONET_*` env vars in Vercel prod** — production runs in demo mode)
- **R2 PCS scrub:** Active (partial done; runbook `docs/runbook/pcs-scrub-plan.md`)
- **D-7 payment gateway:** PromptPay-only ก่อน beta; Omise/2C2P/Stripe TH selection deferred post-beta
- **K-4 HS variants:** Keep separate (don't merge into tier)
- **K-5 Payroll:** Extend HR (not standalone, re-evaluate at ~50 staff)
- **K-6 Tax invoice numbering:** `INV-YYYYMM-NNNN` with monthly counter reset
- **K-7 Wallet deposit approver:** `super` OR `accounting` only (not ops, not sales_admin)

---

## 🗄️ Migrations status

ภูม รันบน dev project ครบ 10 ไฟล์ (0023..0032). **เดฟ pending: replay batch บน production Supabase:**

```
0023_otp_purpose_change_phone.sql
0024_notification_ref_contact_message.sql
0025_profiles_notify_channels_daily_digest.sql
0026_notification_category_sales_digest.sql
0027_admin_contact_extras_contract_end_date.sql
0028_forwarder_driver.sql
0029_csv_imports.sql                    ← creates 'csv-imports' storage bucket
0030_hs_codes_rates.sql                  ← seeds 9 common HS codes
0031_hs_codes_rls_authenticated.sql
0032_csv_imports_started_at.sql
```

✅ **NEW from เดฟ T-D2 (this session — ภูม run on dev when picking T-P2 / T-P4):**
```
0033_containers.sql                      ← cargo_containers + cargo_shipments
                                            + cargo_shipment_tracking
                                            + cargo_container_status_history
                                            (extends admins.role: + warehouse + driver)
0034_tax_invoices.sql                    ← tax_invoices + lines + seq + INV-YYYYMM-NNNN
                                            atomic serial generator (security definer)
```

> **⚠️ Note on 0033 (HOTFIX evening-5):** Tables use `cargo_*` prefix to avoid collision with legacy `public.containers` (from 0016 — keeps old ops-tracking shape used by `/admin/containers` + `forwarders.container_id`). The two coexist. ภูม picking T-P2 uses NEW `cargo_*` tables; existing `/admin/containers` keeps working unchanged. See [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) "Implementation table-name note" for full mapping.
>
> **Migration also extends `admins.role`** to add `'warehouse'` + `'driver'` (previously: super, ops, accounting, sales_admin). Existing rows unaffected. After applying, grant warehouse/driver roles via `insert into admins (profile_id, role)`.

---

## 🔍 Findings + flags from this batch (เดฟ responses inline 2026-05-16 evening)

1. **P-31 cart cap off-by-one** — PORT_PLAN spec said "150 OK → 151st throws" but actual `cart_items_cap` trigger raises on `cnt >= 151` (so up to 151 succeeds; 152nd fails). Test mirrors actual behavior.
   → **เดฟ:** ✅ **RESOLVED.** PORT_PLAN spec doc fixed in this batch (lines 250 + 977). Code stays at 151-cap matching legacy PHP `cart.php:17,76`. ภูม no action.

2. **Driver assignment notification reference type** (T-P1) — used `"forwarder"` because `"forwarder_driver"` isn't in `NotifyReferenceType` enum.
   → **เดฟ:** ✅ **OK as-is, defer.** Adding to enum = K-quality. Not blocking. ภูม no action.

3. **Customer-side service-order receipt PAGE missing** (T-P1 GAP 3) — action + PDF component exist; page doesn't.
   → **เดฟ:** ✅ **DONE.** Pushed `app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx` (this batch). Mirrors `/service-import/[fNo]/receipt` pattern (HTML print-friendly + "ดาวน์โหลด PDF" button → existing `/api/pdf/shop-order/[hNo]`).

4. **`forwarder_driver.profile_id` accepts ANY profile** — no driver role flag in schema.
   → **เดฟ:** ⏸️ **Defer to ก๊อต K-sec-2 RLS audit.** Not blocking T-P1. ภูม no action.

---

## 🚀 ภูม run-long direction (autonomous mode active)

> **เดฟ 2026-05-16 evening:** *"ตราบใดที่น้องยังอยู่ในทาง รู้ว่าอันไหนรีบ อันไหนหลัง ก็โอเค ปล่อยรันยาวๆ เลย ไม่ต้องเฟิม"*

**Priority queue (do in order; skip current if blocked, move to next):**

1. **T-P5** `/admin/accounting` stub (acc-* PHP port — 7 files: acc-forwarder, acc-payment, acc-shop, acc-shop-refund, acc-system-cargo, acc-topup, acc-withdraw). Each = dashboard view + filter date. ~3-5h. Use existing admin pattern (sticky bar UI from T-P3 if bulk actions needed).
2. **T-P2** container migration + CT-3 customer view — ✅ **unblocked**. `0033_containers.sql` in `dave`. Apply on dev → build `lib/warehouse/*.ts` typed clients (upsert + tracking-event-append) → CT-3 customer view page (`/(protected)/service-import/[fNo]/container` showing container card with tracking timeline) → admin warehouse view (`/admin/warehouse/containers` list + filter + detail). Spec: [`container-centric-model.md`](../architecture/container-centric-model.md) CT-1..CT-8.
3. **T-P4** tax invoice G2b-G2f — ✅ **unblocked**. `0034_tax_invoices.sql` in `dave` (G2a done). Sequence: G2b customer request flow (`requestTaxInvoice` action + form on receipt pages) → G2c admin issuance flow (`/admin/tax-invoices` list + detail + `issueTaxInvoice` + PDF + Storage upload) → G2d customer download route (`/api/tax-invoice/[id].pdf`) → G2e cancellation + credit note → G2f integration test. Spec: [ADR-0006](../decisions/0006-tax-invoice-flow.md).
4. **T-P3 polish** — if any UX bug surfaces from real-use of bulk-approve bars, fix it.
5. **MOMO sync wire** — when ก๊อต MOMO-1 endpoint inventory lands → wire `lib/integrations/momo-jmf/*.ts` (skeleton scaffolded by เดฟ Part S note) + cron/webhook sync into `containers` + `shipment_tracking` tables.

**Patterns to follow** (proven good in T-P1 + T-P3 review):
- Zod validate every input
- RBAC via `withAdmin([...])` per [ADR-0005](../decisions/0005-launch-operational-decisions.md) K-7 (wallet+invoice = `["super","accounting"]`; status flips = `["ops"]`; warehouse ops = `["super","ops","warehouse"]`)
- Idempotency on money-moving actions (check existing tx by `reference_type + reference_id + kind + status='completed'`)
- Granular audit log per row (not batched)
- Customer notify via `sendNotification` (severity match outcome)
- `revalidatePath` for every page that displays the changed row
- Commit message style: detailed "What's in" + "DECISIONS (per §6 self-directed)" + "Acceptance" (T-P1/T-P3 style — keep doing it)

**Escape hatch (true blocker):** write flag at end of this doc → flip to next priority. เดฟ + ก๊อต respond async on return.

**Push discipline:** Commit local freely. Push to `origin/Poom` at save-points only. 1 push/session.

---

## 📦 What เดฟ shipped this session (2026-05-16 evening — full digest)

1. ✅ **Merged `Poom → dave`** — T-P1 + T-P3 + team-status doc + UI components.
2. ✅ **AGENTS.md handshake** (`9000c28`) — mandatory session-start protocol.
3. ✅ **`0033_containers.sql`** — `containers` + `shipments` + `shipment_tracking` + `container_status_history` + extends `admins.role` to add `'warehouse'` + `'driver'`.
4. ✅ **`0034_tax_invoices.sql`** — `tax_invoices` + `tax_invoice_lines` + `tax_invoice_seq` + `next_tax_invoice_serial()` security-definer fn (RD Code 86 compliant).
5. ✅ **`app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx`** — HTML print-friendly receipt for China-shop orders. "ดาวน์โหลด PDF" button → existing `/api/pdf/shop-order/[hNo]`.
6. ✅ **PORT_PLAN P-31 cart cap resolved** — keep 151-cap matching legacy PHP `cart.php:17,76`.
7. ✅ **TEAM-WIDE RUN-LONG MODE** master section + per-role priority queues + cross-dep map + brief stamps (ปอน + ก๊อต).
8. ✅ **`actions/service-order.ts::payServiceOrderFromWallet`** — **customer self-service pay action** (loop-closing). Mirror of `adminMarkServiceOrderPaid`: idempotent · balance check (no overdraw) · admin client for status flip after ownership-verified RLS fetch · notify customer via `notify.walletTxStatusChanged`. **No more admin bottleneck per order** — customer pays themselves once balance ≥ total.
9. ✅ **`pay-from-wallet-button.tsx`** + **page.tsx update** — primary button in payment-due banner when balance sufficient; insufficient hint with shortfall otherwise; existing "ฝากเงิน" + "ดูยอด" links kept as fallback.
10. ✅ **i18n keys** (TH + EN) — 6 new keys: `payFromWallet`, `payFromWalletBalance`, `payFromWalletConfirm`, `payInsufficientHint`, `paying`, `paySuccess`.
11. ✅ **`docs/runbook/cargo-smoke-test-T-D1.md`** — 9-step runbook (signup → topup → admin approve → order → admin total → **customer pay-from-wallet** → admin status chain → receipt PDF → optional tax invoice). Pre-flight checklist + per-step verify points + edge-case spot-checks + what-to-do-when-broken.

**Acceptance (entire batch):** `pnpm exec tsc --noEmit` ✅ clean · `pnpm exec eslint` on all touched files ✅ clean · migration files idempotent · i18n keys both languages.

**Cargo loop status — actually closes end-to-end now for V1 (BOTH service-order + service-import):**
```
shop-order (ฝากสั่งซื้อ):
signup ✅ → top up wallet ✅ → admin approves deposit ✅
       → place service-order ✅ → admin reviews + total ✅
       → CUSTOMER pays from wallet ✅ → admin moves status ✅ → receipt PDF ✅

forwarder (ฝากนำเข้า):
signup ✅ → top up wallet ✅ → admin approves deposit ✅
       → create forwarder ✅ → admin reviews + total ✅
       → CUSTOMER pays from wallet ✅ (NEW evening-6, mirror of shop pay)
       → status flips to shipped_china ✅ → admin tracks + driver assign ✅
       → status flow to delivered ✅ → receipt PDF ✅

→ (juristic) tax invoice request → pending T-P4 G2b
→ (admin) container assignment + customer tracking → pending T-P2 (cargo_* tables)
→ (admin) mark-paid override path for forwarder → pending ภูม mirror pickup
```

**ภูม next session:** pull `origin/dave` → merge into `Poom` → run `0033` + `0034` on dev Supabase → pick T-P5 OR T-P2/T-P4 (both unblocked). Run-long mode — no wait.

**เดฟ next session:** apply migrations 0023..0034 to **prod Supabase** → run T-D1 smoke test using the new runbook → DV-2 LIFF + DV-3 ThaiBulkSMS signups in parallel → T-D4 soft-launch coordination once T-D1 passes.

---

## 📋 Legacy PHP port audit — what's actually left (2026-05-16 evening-5)

Re-audited all customer-side + admin-side pages against the PHP `D:\xampp\htdocs\pcscargo` feature map. **Good news: legacy port is ~95% done.** Most pages CLAUDE.md flagged as "placeholder" months ago are now fully implemented.

**Customer-side — all major modules SHIPPED + working:**
- ✅ auth (signup/login/OAuth Google/Facebook · forgot-password · complete-profile · profile/security/change-phone)
- ✅ wallet (deposit/withdraw/history · pay-from-wallet — shipped this session)
- ✅ service-order (cart, place, list, detail, **receipt page shipped this session**)
- ✅ service-import (forwarder add/list/pending/receipts)
- ✅ service-payment (yuan transfer)
- ✅ notifications (LINE Messaging API + LIFF scaffolded)
- ✅ sales (referral commission history)
- 🟡 OTP UI for production (hidden while `OTP_BYPASS=true`; ready when bypass=false)
- 🔴 LINE Login OAuth (currently stub button — Google/Facebook OAuth work; LINE pending custom OIDC)
- 🔴 URL→cart converter + 1688/Taobao search + image search (Track G code in repo, **DISABLED in prod** per ADR-0003 Option E)

**Admin-side — all major modules SHIPPED + working:**
- ✅ identity/RBAC (admins · admin-actions · HR org-chart/employees/recruitment/attendance/leaves/training/policies/audit)
- ✅ customer mgmt (customers list/detail · pending · recently-active · transfer-rep · convert-to-juristic · juristic-check)
- ✅ wallet ops (single + bulk approve · withdrawals)
- ✅ yuan payments (single + bulk approve)
- ✅ service-orders (list + detail + mark-paid + status flips)
- ✅ forwarders (list + detail + driver-assign + status flips)
- ✅ drivers (list + detail)
- ✅ containers (legacy ops tracking from 0016)
- ✅ accounting (7 tabs: summary/forwarder/yuan/shop/topup/withdraw/refund + CSV + date filters + monthly closing)
- ✅ reports (5 tabs: forwarder/shop/yuan/sales/payment + CSV + status breakdown)
- ✅ rates (exchange rate + service fees + juristic discount + free shipping; **shipping-rates-table = Phase D placeholder, see below**)
- ✅ barcode (intake + prepare + driver pickup workflows)
- ✅ csv-imports (upload + import + stale recovery)
- ✅ team-leaders + sales-payouts + forwarder-sales
- ✅ contact-messages + settings (incl. notifications-settings)
- ✅ HS codes (ratings + containers HS rates)
- ✅ Cron jobs: 5 routes scaffolded (auto-cancel-orders · expire-driver-assignments · expire-probation · refresh-active-customers · sales-daily-digest)

**🔴 Actually remaining legacy gaps (low priority — not blocking cargo revenue):**

| # | Gap | Source PHP | Effort | Priority | Owner |
|---|---|---|---|---|---|
| **LP-1** | Shipping rates table UI in `/admin/rates` — port `tb_rate_g_*` / `tb_rate_vip_*` / `tb_rate_custom_*` from PHP | rate.php · rate-vip.php · settings.php | ~4-6h | 🟡 P2 (forwarder rate engine already runs from `settings`; this UI is admin-facing rate adjustment for VIP customers) | ภูม when free |
| **LP-2** | TOS acceptance gate — modal on login if version mismatch | tb_terms_service | ~2h | 🟡 P2 (legal compliance polish; not blocking signup) | ภูม |
| **LP-3** | LINE Login OAuth (real, not stub) | fb-callback.php pattern + custom OIDC | ~3-4h | 🟡 P2 (FB + Google already work; LINE optional for now) | ภูม + ก๊อต (Supabase custom OIDC setup) |
| **LP-4** | Verify-tel — phone re-verification post-signup | verify-tel.php | ~2h | 🟢 P3 (change-phone flow exists; full re-verify is polish) | ภูม |
| **LP-5** | URL→cart converter, search, image search activation | shops.php, search.php, searchIMG.php, convertURL.php | depends on ก๊อต ADR-0003 | 🔴 P3 (locked DISABLED by ก๊อต Option E; track in repo but no Vercel env vars) | ก๊อต decision |
| **LP-6** | mPDF→@react-pdf for remaining legacy receipts | invoiceF.php · printReceiptF.php · receipt-f-hs.php | mostly done; spot-check edge cases | 🟢 P3 (forwarder + shop-order PDFs ship; "f-hs" customs declaration PDF may be partial) | ภูม |

**Decision lens:** "งานนี้ส่งผลให้รับลูกค้า cargo ได้เร็วขึ้นไหม?" — None of LP-1..LP-6 block the cargo revenue loop. They're polish items.

**ภูม run-long priority remains:**
1. T-P5 `/admin/accounting` stub — **Note: actually already DONE** (just verified — accounting page has 7 tabs + CSV + monthly closing). Can re-evaluate this entry.
2. T-P2 cargo container UI (use **`cargo_*` tables** per 0033 hotfix above) — customer view `/(protected)/service-import/[fNo]/container` + admin `/admin/warehouse/containers`
3. T-P4 tax invoice G2b-G2f (form on receipt page → admin issuance → PDF → cancel/credit note)
4. Then LP-1..LP-6 as filler

---

## 🚦 Light at the end of the tunnel

When all of this lands, Pacred ships beta:

- [x] R1 + R2 + D-7 + K-4..K-8 ADRs locked
- [x] Track G china-search code shipped (in demo mode)
- [x] Track A test coverage (260 → 305 assertions across critical paths)
- [x] T-P1 admin cargo workflow buttons (driver assign + mark-paid) — merged to dave
- [x] T-P3 wallet + yuan-payments bulk approve — merged to dave
- [x] LIFF code + LINE_OA constants ready
- [x] Sentry/Upstash/hCaptcha SDK + rate-limit + captcha wired
- [x] OTP dual-pepper rotation, PROMPTPAY soft-degrade, CI workflow, OWASP audit
- [ ] **Pacred owner Bundle 1** (PromptPay + bank + company info + LIFF app) ← biggest single blocker
- [ ] เดฟ DV-1..DV-4 external signups (Sentry/Upstash/hCaptcha/SMS) ← parallel to owner ask
- [x] เดฟ T-D2 specs → ภูม T-P2 (containers) + T-P4 (tax invoice) — schemas + receipt page pushed 2026-05-16 evening
- [x] **Cargo loop closure** — customer pay-from-wallet shipped (no more admin bottleneck per order)
- [x] **T-D1 smoke test runbook** — 9-step runnable runbook with verify points (`docs/runbook/cargo-smoke-test-T-D1.md`)
- [ ] T-D1 smoke test EXECUTED on dev + prod → first 5 friendly customers (T-D4)

**Estimated time-to-beta if owner bundle arrives this week:** ~1-2 weeks.

---

**End of checkpoint.** Update freq: when blocker resolves / new blocker appears / สำคัญ batch ship → edit this file + commit `docs(team): status checkpoint — <date> — <what changed>`.
