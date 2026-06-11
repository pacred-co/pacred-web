# ADR-0029 — Config / Rate Source-of-Truth ledger

**Status:** Accepted · 2026-06-12
**Deciders:** Owner (พี่ป๊อป · picked "money-correctness sweep + ADR") · เดฟ (integrator)
**Consolidates:** ADR-0024 (settings-SOT) · ADR-0026 (commission-admin-surfaces-repoint) · ADR-0027 (tax-invoice SOT) · `docs/research/rate-cost-wiring-audit-2026-06-11.md`
**Refs:** AGENTS.md §0e (reachable dead-write traps) · CLAUDE_TECHNICAL.md "two coexisting worlds"

---

## Context — the "two coexisting worlds" leak money via config

The faithful-port era left two schema families side by side: the **rebuilt** Pacred-native tables (`profiles`/`orders`/`forwarders`/`settings`/`rate_vip`/`commission_tiers`/`container_costs` — mostly **0 rows** in prod) and the **legacy `tb_*`** tables (the live data · 8,898 customers). The most dangerous residual bug class (§0e) is a **reachable admin write-surface wired to the rebuilt 0-row twin while the live consumer reads the `tb_*`/`business_config` original** → staff edit a rate → green toast → **nothing changes** (silent wrong-data; can mis-state money).

A source-verified sweep on 2026-06-12 (4 mappers + synthesis, each finding cited file:line, then spot-verified by hand) audited **every admin RATE/CONFIG write surface against its live consumer**. **Verdict: ZERO confirmed silent traps survive** — every surface is either CLEAN (write+read hit the same live store), already **bannered** reference-only, already **redirected**/**tombstoned**, or already fixed by the 2026-06-11 rate-cost-wiring audit + ADR-0024/0026. This ADR records the canonical store per rate/config family so **no future write surface re-introduces a dead-write twin**, and so reviewers have one place to check "which table is canonical for X".

---

## Decision — the canonical store per family (writers MUST target these)

| Family | **Canonical store** (live-read) | Live reader (file:line) | Canonical writer | Dead twin — never write/read |
|---|---|---|---|---|
| **Yuan rates** (shop/ฝากสั่ง sale `rsdefault` · transfer/ฝากโอน `rpdefault` · ฝากสั่ง buy/cost `hratecostdefault`) | `tb_settings` singleton (`id=1`) | dashboard `admin/page.tsx:158,235` (`hratecostdefault`) · `getCurrentYuanRate` `actions/payment.ts` (`rpdefault`) · `calculateCartTotal` `actions/cart.ts` (`rsdefault`) | `adminSetTbSettingsRates` `actions/admin/tb-settings.ts` | `tb_settings.rgdefault` (0.00 prod, **never read** — commented dead in `admin/page.tsx:232`) |
| **Free shipping** | `tb_settings.freeshipping` | `admin/rates/page.tsx:45` + the live forwarder money path | `adminSetTbSettingsForwarderCosts` `actions/admin/tb-settings.ts` | rebuilt `settings.free_shipping_*` (ADR-0024 — `/admin/settings` hub is read-only) |
| **Customer rates — 3 tiers** | **SVIP** (per-user) `tb_rate_custom_kg`/`_cbm` · **General** (`coID='PCS'`) `tb_rate_g_kg`/`_cbm` · **VIP-group** (`coID≠PCS`) `tb_rate_vip_kg`/`_cbm` | `resolveLiveForwarderRate` `actions/admin/forwarders-edit.ts:230-296` (SVIP L249-262 · General L266-279 · VIP-group L282-295) | `adminUpdateVipRateCells` + general/SVIP cell writers `actions/admin/rate-edits.ts` (UPSERT) | rebuilt `rate_vip` (0 rows) — `/admin/rates/vip` **redirects** to `/admin/rates/custom-user` |
| **Sales commission** | `tb_user_sales` (earn) + `tb_user_sales_admin_pay` (withdraw header) + `tb_user_sales_pay` (link) · per-team rate hardcoded **1%** (`lib/sales-commission/calc.ts`, ADR-0020 intentional) | the commission admin surfaces (ADR-0026 repoint) | the `tb_user_sales*` writers | rebuilt `commission_tiers`/`sales_commissions`/`rate_vip` (tombstoned · early-return errors) |
| **Freight cost rate** | `tb_freight_rate` (mig 0145) | `lookupChinaFreightCostThb` `lib/freight/rate-lookup.ts:31` | `adminCreate/UpdateFreightRate` `actions/admin/freight-rates.ts` | — |
| **Cargo per-container cost** (margin basis) | `tb_forwarder.fcosttotalprice` | margin-monitor + `peak-export` + the margin-flag cron | the report-cnt per-ตู้ cost editor | rebuilt `container_costs` (0 rows · **bannered** reference-only `/admin/accounting/container-costs`) |
| **Cargo per-line cost/declared** | `tb_forwarder_item` / `tb_order` `cost_*` + `declared_*` (mig 0158/0179) | `cargoLineCostThb` `lib/payment/cargo-cost-line.ts` → taxdoc-workspace + PEAK · `declared_value_thb` → ใบขน PDF `/api/customs-declaration/[id]` + cargo-declarations | `setForwarder/ShopOrderItemCost` `actions/admin/cargo-cost.ts` (range-guarded via `lib/validators/cargo-cost-fields.ts`) | — |
| **Business config** | `public.business_config` (60s cache · `lib/business-config.ts:getBusinessConfig`) | per-key (see below) | `actions/admin/business-config.ts` | a key the code never reads via `getBusinessConfig()` |

### business_config — WIRED vs reference-only

- **WIRED** (writer + live reader both present · editing has real effect): `freight.fx_rate_thb_per_usd` · `freight.markup_tiers_pct` · `freight.default_markup_pct` · `freight.margin_cap_thb` · `peak.gl_accounts` · `customs.fx_rates`.
- **NOT-WIRED — reference-only, BANNERED** (editable but the real value is a hardcoded const; the editor renders the amber "⚠️ ยังไม่เชื่อมโค้ด (reference-only) — แก้แล้วยังไม่มีผลกับระบบ" via `app/[locale]/(admin)/admin/settings/business-config/editor.tsx:33-43,128-132`): `otp.ttl_ms` (+"ค่าจริงในโค้ด = 15 นาที") · `otp.rate_limit_per_hour` · `wallet.{deposit,withdraw}_{min,max}_thb` · `cashback.default_pct` · `features.{liff_enabled,china_search_demo}`. Real values hardcoded in `actions/otp.ts:25-26` + `lib/validators/wallet.ts:7-10`.

---

## The rule

1. **A rebuilt 0-row twin is NEVER canonical.** Any new admin write surface for a rate/config family MUST target the canonical store in the table above. When in doubt, grep the LIVE reader (the customer page / pricing engine / cron / report) and write where it reads.
2. **A config key the code does not read via `getBusinessConfig()` MUST carry the reference-only banner** until it is wired — an honestly-labeled dead-write ("แก้แล้วยังไม่มีผล") is acceptable; a silent one is a §0e bug.
3. **Before flagging a dead-write in any future audit, verify criterion 3** (is it already bannered / redirected / tombstoned?). The 2026-06-12 sweep's mappers initially flagged the 9 NOT-WIRED business_config keys as traps; they were downgraded because the editor already banners every one. A reachable dead-write that is honestly labeled is not a silent trap.

---

## Consequences

- **No code change shipped with this ADR** — the sweep found zero silent traps; the money-config landscape is already clean (prior audit + ADR-0024/0026 did the remediation). This ADR is the consolidated SOT reference + the forward-looking rule.
- **Reviewers** get one lookup table for "which store is canonical for rate X" — cheaper than re-deriving from the pricing engine each time.
- **Backlog (owner-decision, not a trap):** the 9 NOT-WIRED business_config keys can be made live by wiring `getBusinessConfig()` into their hardcoded call sites (OTP TTL/rate-limit, wallet min/max, cashback %, feature flags) — or the hardcodes accepted and the keys removed from the editor. Either closes the reference-only gap; neither is urgent.
- **`otp.ttl_ms` staleness** (config shows 5 min · code = 15 min) is real but disclosed in-banner → not a silent security/money trap; resolve it when the OTP keys are wired.
