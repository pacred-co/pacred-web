# 🔭 Full-scope gap analysis + buildable roadmap — cargo + freight (2026-06-08 · เดฟ)

Owner handed the complete `olddata dev` data (cargo + freight) + said "ทำหมด" (do all: ใบกำกับ ฝากสั่ง/ฝากโอน + acquisition/CRM + reachability + freight + cargo-chat). Ran a **5-agent customer reachability audit** then a **4-agent full-scope gap analysis** (read-only, vs legacy PHP + the 2026-06-01 freight synthesis). **Headline: the platform is ~90% built; the gaps are precise last-mile wiring + a few small missing pieces — NOT a from-scratch build.**

Branch: `claude/beautiful-swartz-7cde53` (off `dave-pacred`/`main` @ `5f344b8f`). 2 verified commits this session (see §SHIPPED). `pnpm verify` / `pnpm typecheck` EXIT 0. **Not pushed** (customer-facing nav unverified-when-authed — no test login; owner to OK the deploy or provide a login).

---

## ✅ SHIPPED this session (committed local, gate-green, NOT pushed)

1. **`9b80e07e` — customer reachability (§0d):** audit found the customer surface link-clean + legacy-complete (0 404 / 0 missing legacy fn / 0 §0e dead-write trap / 0 money bug). Root cause of all orphans = the dead `components/sections/protected-sidebar.tsx` (live nav = `components/legacy/pcs-left-menu.tsx`). Wired 5 clear orphans into the live nav + th/en i18n: `/service-import/receipts` (legacy `left-menu.php:74` parity) + `/shipments` → import accordion; `/refunds` → cash-wallet accordion; `/pay` (owner's 2026-06-08 static-QR) → top-level; `/my-issues` → user-pill.
2. **`c6ce6e73` — sales→CS handoff (CEO §5):** `logLeadCall(status='closed')` auto-assigns a CS (`pickLeastLoadedCsRep` → `tb_users.adminIDCS`, only if none) so CS follows the order; เคลียร์/แอร์ deals bypass CS via a close-panel checkbox. Best-effort (never fails the call log).

---

## 🟡 STAGED — buildable deltas per stream (file-level, from the gap agents)

### 1) ใบกำกับ ฝากสั่ง/ฝากโอน (tax-invoice) — 🔴 MONEY/TAX-CRITICAL · do NOT ship untested
**State:** 3-mode engine `lib/tax/tax-doc-mode.ts` (ใบกำกับ/ใบขน/ไม่รับเอกสาร VAT bases, per CEO rules) + cart selector `cart/cart-tax-doc-pref.tsx` exist; **forwarder lane fully wired** (the reference: `lib/admin/forwarder-tax-invoice.ts` + `auto-issue-receipt.ts` + `tb_forwarder_tax_invoice`). **GAP:** shop pref is a **§0e dead-write** (cart writes `tb_header_order.tax_doc_pref`, nothing consumes it; receipt panel shows "coming soon"); yuan has **no selector + no column**.
- **Build A (shop):** migration `0148` (`tb_shop_tax_invoice` + `_item` + add yuan tax-doc cols to `tb_payment`) → `lib/admin/shop-tax-invoice.ts` (clone forwarder; VAT base = `tb_header_order.htotalpricechn` goods) → wire auto-issue at shop payment-land (`actions/admin/wallet-hs.ts` shop settle branch ~L1594) → un-defer customer request (`actions/tax-invoices.ts:92` + `service-order/[hNo]/receipt/page.tsx:337`).
- **Build B (yuan):** selector + `lib/admin/yuan-tax-invoice.ts` (VAT base = `thb_amount`) + **enforce "ฝากโอนกับเราเท่านั้น" gate** (importer-of-record) + un-defer (`service-payment/[id]/page.tsx:183`).
- **Build C:** PDF routes + admin views (extend `/admin/accounting/etax` to union shop+yuan).
- 🚦 **GATES before live:** (a) browser money-loop test on a TEST order (needs a customer login — owner said skip → BLOCKED), (b) **accounting sign-off on ใบขน VAT base** (`tax-doc-mode.ts:187` flags service-only vs service+transport+rental — no legacy precedent), (c) idempotency on `hno`/`tb_payment.id`, (d) use World-B tb_*-native store (NOT the dead World-A `tax_invoices`).

### 2) Acquisition leads + CRM depth — 🟢 mostly built, wire the rest
**State:** `/admin/leads` call-queue + `/admin/crm` omni-inbox + `/admin/board` work-board + `tb_users.adminIDCS` + round-robin all exist & sidebar-reachable. Sales→CS handoff = ✅ SHIPPED this session.
- **Build 2 (~2h):** Sale+CS routing controls in CRM customer-360 (`admin/crm/page.tsx` — add a `CsRouting` mirror of the sales `RepRouting`; have `getCustomer360` return `adminIDCS`).
- **Build 3 (~½ day):** customer **tag system** — migration `customer_tag` (1 isolated table, no FK, RLS service-role) + `actions/admin/customer-tags.ts` + `<TagChips>` on leads/CRM/customer-detail (self-serve · seed AXELRA/big-PCS/VIP/เคลียร์/แอร์ → also fixes the AXELRA-vs-PCS lead-source gap).
- **Build 4 (~½–1 day):** customer **activity timeline** ("เห็นว่าคุยอะไร · คนมาทำงานต่อ") — `getCustomerActivity` UNION `lead_call_log` + new `customer_note` + linked `Podeng_line_messages`, panel on customer-360.
- **Build 5 (~½ day):** lead pipeline **kanban** (group `getLeadQueue` by latest `lead_call_log.status`; drag = `logLeadCall`).
- **Build 6 (~2-3h):** big-PCS full-base ranking RPC (`count_forwarder_by_owner()` migration; repoint `leads.ts:127`).
- **Quick-wins:** callback-due segment on `/admin/leads`; show CS column in leads table; doc-drift (`leads-types.ts:54` says cap 5,000, real `EXPORT_CAP=10000`).

### 3) Freight (AXELRA) — 🟢 far more built than expected; ONE missing link
**State:** full `freight_*` schema + tested rate engine (`lib/freight/rate-engine.ts` `composeFreightQuote`, ≤15k/ตู้ guard, 26 tests) + admin CRUD (`/admin/freight/{quotes,shipments,declarations}`) + customs PDFs + customer hub + **public RFQ wizard** (`(public)/freight-quote` → `actions/freight-quote.ts::submitFreightQuote` → `freight_quote` singular + LINE ping) all built.
- 🔴 **THE GAP — the public RFQ lead is orphaned:** `freight_quote` (singular) is read by exactly ONE consumer — `getCrmFunnel()` head-count. **No admin page lists/triages the leads** (the admin `/admin/freight/quotes` reads a DIFFERENT table `freight_quotes` plural). Code self-flags it (`freight-quote.ts:152` TODO "no /admin RFQ page yet"). → sales can't act on inbound freight leads = freight revenue can't be captured.
- **THE NEXT BUILD (~1 day · highest-value freight delta):** `app/[locale]/(admin)/admin/freight/leads/page.tsx` (list `freight_quote` + filters + CSV) + `[ref]/page.tsx` (detail + triage panel + "แปลงเป็นใบเสนอราคา") + `actions/admin/freight-leads.ts` (`setFreightLeadStatus` — migration `0148`-adjacent: add `status` + `assigned_admin_id` to `freight_quote`; `convertLeadToQuote` — seed a `freight_quotes` draft + run `adminComposeQuoteFromRateCard`) + wire `lib/admin/sidebar-menu.ts` + flip the `notifyStaffGroup` deep-link to `/admin/freight/leads/${ref}`.
- **Deferred (multi-week):** freight ERP ops cockpit (`AX JOB.html` PRICING→SALES→DOC→ACC kanban + per-shipment P&L + commission engine) · customs-brokerage automation (NETBAY e-filing, HS/Form-E). Assets ready in `olddata dev\data งานเก่า\Project dev\` (PJ-BOOK Prisma schema, AX JOB.html).

### 4) Cargo chat problems — 🟢 ~90% already fixed; few small live gaps
**Already fixed (no action):** tracking↔container sync (MOMO cron */5), OTP-credit alert, carrier CRUD, commission whitelist→table, slip-time, status rollback, paid-desync (fstatus 5→6), >10% reconfirm gate, cost-adjust lines, **WHT model + 50-ทวิ** (the #1 accounting pain), self-serve CSV reports, post-lock refund, editable bill-header, CBM/cost reconcile, MOMO 9-status, bulk-tracking-search.
- **Fix #1 (~customer-visible):** "last-synced" freshness indicator on customer tracking — ⚠️ NOT as trivial as agent claimed: `service-import/_tracking/tracking-page.tsx` reads `tb_forwarder`, not the momo sync tables; needs a freshness source (momo sync last-run / `momo_import_tracks.last_synced_at` joined by tracking). Revisit with proper sourcing.
- **Fix #2 (~1-2h):** Lalamove/courier dispatch-tracking-URL field on driver-batch/forwarder.
- **Fix #3 (~2-3h):** จองรถ external-truck LINE-paste block generator (reuse `warehouse/bulletin/copy-box.tsx` pattern).
- **Fix #4 (~3-4h, customer-visible):** customer "ตกหล่น/ของไม่ครบ" missing-item report → creates a `work_items` ops ticket.
- **Fix #5 (~1-2 days):** daily container bulletin auto-generator (currently a tombstone → `/admin/report-cnt`).
- ⚠️ **Build on `lib/integrations/momo-isolated/` (live), NOT `momo-jmf/` (dead stub). `cargo_*` spine is RETIRED — target `tb_forwarder`.**

---

## 🚦 Cross-cutting gates / what's needed from the owner
- **Push:** the 2 shipped commits are gate-green but the reachability ones are customer-facing + NOT authed-verified (no test login). OK to push to `dave-pacred`→main (auto-deploys prod)? Or provide a test customer login (member_code + pw) for §0c authed verify first.
- **Migrations:** any new feature needs its migration applied to prod (next free = **0148**). Additive/safe but must apply at deploy.
- **Tax-invoice:** needs accounting sign-off on ใบขน VAT base + a TEST-order money-loop test before going live (money-critical — won't auto-ship).
- **Carryover (owner/external):** Supabase refresh-token-reuse-interval (random-logout fix) · Vercel env (TAMIT-2026 · client Sentry DSN · FB tokens) — เดฟ now HAS `VERCEL_TOKEN` so can set via API on request · staff photos · employee_code numbers · freight cost-side rate table.
