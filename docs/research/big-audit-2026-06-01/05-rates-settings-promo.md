# Big audit 2026-06-01 — Cluster 05: RATES · SETTINGS · PROMO · TOS

**Auditor lane:** rate engine · the 152-col `tb_settings` master config · promotions · TOS/policy versioning · china product-category lookup.
**Pacred HEAD:** `dave-pacred` (post `3478edac`). **Prod:** `yzljakczhwrpbxflnmco`. Row counts queried live 2026-06-01.

**Headline:** the rate engine is the **most-faithfully-ported subsystem in the whole app** — the live forwarder pricing waterfall reads the real `tb_*` rate tables, and 3 of the 4 rate-card editors + the 144-cell default-cost matrix have been wired to `tb_*` since the 2026-05-30/31 audits flagged them. The remaining gaps are now **concentrated and small**: (1) ONE dead VIP rate-card editor still writes a rebuilt empty twin (live dead-write trap), (2) a 3-way config split-brain (`tb_settings` vs rebuilt `settings` vs `business_config`) with overlapping yuan-rate/free-shipping fields, (3) the customer announcement popup (`tb_notify_wp`) + TOS-acceptance + the promo engine are rebuilt-only/empty. This doc supersedes the open status of `adm-14` items #5/#8 (now shipped) and `_MASTER-FRESH` Theme-B #3/#4 (now shipped).

---

## 1 · DATA INVENTORY — legacy `tb_*` tables

### 1a · The rate engine (per-kg + per-CBM cards)

| Table | Rows | Purpose · key columns ("หัวข้อ") |
|---|---:|---|
| `tb_rate_g_kg` | 16 | **General tiered KG card** (the default "ลูกค้าทั่วไป" rate). Key: `coid='PCS'`, `sourcewarehouse` (1=กวางโจว 2=อี้อู), `rgtransporttype` (1=รถ 2=เรือ), `rgproductstype` (1 ทั่วไป·2 มอก.·3 อย./น้ำยา·4 พิเศษ). Values: `rgkg1`/`rgkg2`/`rgkg3` = 3 weight-tier rates (≤100kg / 100–500 / ≥500). `adminidupdate`. |
| `tb_rate_g_cbm` | 16 | **General tiered CBM card.** Same key; values `rgcbm1`/`rgcbm2`/`rgcbm3` (≤2 / 2–5 / ≥5 CBM tiers). |
| `tb_rate_vip_kg` | 192 | **VIP-group flat KG rate.** Key: `coid` (VIP1/VIP2/…), warehouse, transport, product. Value: `rkg` (single flat rate). |
| `tb_rate_vip_cbm` | 192 | **VIP-group flat CBM rate.** Value: `rcbm`. |
| `tb_rate_custom_kg` | 2,288 | **SVIP per-customer flat KG rate** (super-VIP, keyed by `userid`, not group). Value: `rkg`. |
| `tb_rate_custom_cbm` | 2,280 | **SVIP per-customer flat CBM rate.** Value: `rcbm`. ⚠️ The mere *existence* of a row here is the legacy SVIP flag (`getPrice()` probes `SELECT ID FROM tb_rate_custom_cbm WHERE userID`). |
| `tb_hs_rate_custom_kg` | 1,481 | **Per-customer per-HS-category KG override.** Adds `crhsid` (FK to a customrate-HS group) + `rkgbefore` (the prior value, for audit/diff). Value `rkg`. |
| `tb_hs_rate_custom_cbm` | 1,537 | **Per-customer per-HS-category CBM override.** Same + `rcbm`. |

> Two more variant tables exist in the legacy schema (`_car`/`_ship` splits of the general card, per adm-14) but were not present as separate live tables in this query pass — the live engine uses the 8 above.

### 1b · `tb_settings` — THE 152-column master config (singleton id=1)

One row, 152 columns. Logical groups (with the live values that matter):

| Group | Columns | What it drives |
|---|---|---|
| **Yuan/CNY rates** (LIVE) | `rsdefault`=4.97 (shop yuan rate ¥→฿), `rpdefault`=4.93 (transfer/ฝากโอน rate), `rgdefault`=0 (unused), `hratecostdefault`=4.84 (yuan COST rate, for margin), `hratecostsale`=4.95 | Shop-cart pricing, ฝากโอน pricing, profit margin. **`payment.ts getCurrentYuanRate()` reads `rpdefault` LIVE.** |
| **Free shipping / receipt** | `freeshipping`=1 (1 on·2 off), `numberpaymemt`=123412345 (running เลขที่ฝากจ่าย doc number) | Free-shipping toggle + pay-on-behalf doc numbering. |
| **Default forwarder-cost matrix** (the bulk — ~144 cols) | `fcostcar{1-4}default[2]`, `fcostship{1-4}default[2]` × **9 partner suffixes**: `(none/default)`, `sang`, `mkcargo`, `mxcargo`, `wmxcargo`, `jmf`, `gogo`, `cargocenter`, `momo` | Auto-fill default China→TH transport cost per box-size (1-4) × car/ship × partner when a new forwarder row is created. `wmxcargo*` cols are weight-multipliers (=13) not flat costs. `gogo`=0 (inactive partner). |

This is the single richest config object in the system — it encodes the entire **partner-cost book** as flat columns (a normalization the Pacred-native `settings`/`business_config` tables do NOT replicate).

### 1c · Promotions

| Table | Rows | Purpose |
|---|---:|---|
| `tb_promotion` | 8,540 | **Promo-applied ledger** — one row per order that got a promo: `promoid`, `fid` (forwarder id), `hno` (header-order no), `date`. This is the JOIN-log, not the promo definitions. |
| `tb_promotion33` | 43 | Per-customer enrollment in promo #33: `userid`, `statuspro` (1/2). |
| `tb_pro_valentine` | 44 | One-off Valentine campaign: `userid`, `message` (personalized Thai greeting), `date`. |

> NB: there is **no `tb_promo_def`-style master "promotion catalogue" table** in this set — promo *rules* live in code (`lib/promo/catalog.ts` reads `tb_settings`) and the `promoid` integers are hard-coded. The tables above are enrollment/application logs only.

### 1d · Options / TOS / china-category lookup

| Table | Rows | Purpose |
|---|---:|---|
| `tb_options` | 8 | Tiny WordPress-style kv: `site_url`, `system_name` ("PCS Back Office"), `site_url_backoffice`, `site_url_member`, default language. Branding/URL constants. **Stale PCS values** (pcscargo.co.th). |
| `tb_terms_service` | **0** | TOS versions — **empty on prod** (legacy `termsOfServiceCargo.php`). No customer ever stored an acceptance here. |
| `tb_api_china_hs` | **77,218** | ⚠️ MISNOMER — NOT customs HS codes. Columns `whsid`, `url`, `type`, `status`, `namecategory` = the **1688/Taobao/Tmall product-category → search-URL lookup** that powers china product image-search. (Real customs-HS-code data lives elsewhere.) |

---

## 2 · REBUILT TWINS — which is canonical (cross-ref prior audits + live code)

| Rebuilt table | Rows | Legacy twin | Verdict 2026-06-01 |
|---|---:|---|---|
| `rate_general` | 10 | `tb_rate_g_kg/cbm` | 💀 **DEAD.** `/admin/rates/general` was **REPOINTED** to `tb_rate_g_*` (via `adminUpdateGeneralRateCells` in `rate-edits.ts`). `actions/admin/rates.ts` (the `adminUpsertGeneralRate`→`rate_general` writer) is now an **orphan** — no page calls it. **(adm-14 P0-2 = CLOSED.)** |
| `rate_vip` | **0** | `tb_rate_vip_kg/cbm` | 🔴 **DEAD-WRITE TRAP — STILL LIVE.** `/admin/rates/vip` → `adminUpsertVipRate` → `rate_vip` (empty). The engine reads `tb_rate_vip_*`. The faithful VIP editor is the confusingly-named **`/admin/rates/custom-user`** (reads `tb_rate_vip_kg/cbm`). BOTH are reachable from the rates hub + sidebar. **This is the #1 current gap in the cluster.** |
| `rate_custom_hs` | 0 | `tb_hs_rate_custom_*` | 💀 DEAD (empty). Faithful path = `/admin/rates/custom-hs` → `tb_customrate_hs`+`tb_hs_rate_custom_*` via `adminUpdateCustomerHsRates`. ✅ |
| `rate_custom_user` | 0 | `tb_rate_custom_*` | 💀 DEAD (empty). Faithful path = `/admin/customers/[id]` rate-editor + `customer-rate.ts` → `tb_rate_custom_*`. ✅ |
| `settings` | 1 | `tb_settings` | 🟡 **PARALLEL / split-brain.** 11 cols (`service_fee`, `yuan_rate`, `free_shipping_enabled`, `juristic_discount_*`, `qc_fee_per_item`, `crate_fee_base`, `domestic_costs`). Read by the **rebuilt forwarder lane** `actions/forwarder.ts` (L331/L557 — uses its `yuan_rate`+`service_fee`) + `/admin/settings` + `/api/settings-rate`. Overlaps `tb_settings` (own yuan_rate, free_shipping) → drift risk, but lives on the low-data rebuilt `service-import/add` lane. |
| `business_config` | 16 | (no legacy twin — Pacred-native) | ✅ **CANONICAL** for tax (WHT 1/3/5/0% + VAT 7%), OTP (ttl 300000, 3/hr), wallet limits, cashback, banks, feature flags (liff/china-demo), `forwarder.reprice_threshold_pct`. Read by `lib/business-config.ts`, `lib/tax/*`, `reconfirm-gate.ts`. This is the modern config layer. |
| `promotions` | 0 | `tb_promotion*` | 💀 EMPTY. No promo engine wired to it. |
| `tos_versions` | 0 | `tb_terms_service` (also 0) | 🟡 Rebuilt TOS system (`actions/admin/tos-versions.ts` + `/admin/settings/tos-versions` + `lib/tos.ts`). Both legacy + rebuilt empty → no data loss, but the **customer TOS-acceptance flow is unseeded** (no published version). |
| `tos_acceptances` | 0 | (none) | Empty — no customer has accepted a versioned TOS. |
| `hs_codes` | **9** | `tb_api_china_hs` (77k, but different domain) | 🟡 `actions/admin/hs-codes.ts` CRUD targets rebuilt `hs_codes` (9 rows = customs HS codes); customs-declarations + `/admin/reports/hs-code-revenue` read it. SEPARATE from the 77k `tb_api_china_hs` product-category table (different purpose — not a true twin). |
| `policies` | 4 | (none — Pacred-native HR) | ✅ Pacred-native staff-policy docs. `policy_acknowledgments`=0 (no one acked yet). |
| `dashboard_banners` | 3 | (none — Pacred-native) | ✅ Pacred-native marketing banners (active). Distinct from `tb_notify_wp` customer-login popup (which has no Pacred home — see §3). |

**Config-home summary (3 coexisting):** `tb_settings` = LIVE for yuan rates + forwarder-cost matrix + freeshipping. `business_config` = LIVE for tax/OTP/wallet/flags. `settings` (rebuilt) = parallel, read by the low-data rebuilt forwarder lane only. The danger is the **overlap** (yuan_rate + free_shipping exist in all three).

---

## 3 · LEGACY GAPS (member + admin) — what Pacred LACKS or partially has

Ranked. Cites prior audits where it builds on them; marks NEW finds.

### 🔴 G1 (P1) — `/admin/rates/vip` is a LIVE dead-write trap *(NEW refinement of adm-14 #6)*
`/admin/rates/vip` + its `row-form.tsx` call `adminUpsertVipRate` → rebuilt **`rate_vip` (0 rows)**. The pricing engine reads `tb_rate_vip_kg/cbm` (192+192 rows). The faithful VIP editor exists but is hidden under the misnamed `/admin/rates/custom-user`. Both are linked from the rates hub (`rates/page.tsx` L130/L137) AND the sidebar (`sidebar-menu.ts` L409/L410). **An admin editing "VIP rates" on the obvious page sees a green toast and changes nothing the engine uses; the real editor is mislabeled.** adm-14 #6 called this "the rate-card page is dead" but it's still live + reachable. Legacy: `pcs-admin/rate-vip.php`. **Fix: delete/repoint `rates/vip` to `adminUpdateVipRateCells` (the faithful action already exists), or rename `custom-user`→"VIP rates" and drop `vip`.** Effort S.

### 🔴 G2 (P0) — `tb_notify_wp` customer-login popup reaches almost no one *(adm-14 P0-3, STILL OPEN per `_MASTER-FRESH` #5)*
Legacy `notify.php` writes `tb_notify_wp` (title/detail/dateStart/dateExp/status/URL) = the announcement banner EVERY customer sees at login. Pacred `/admin/broadcasts` writes rebuilt `broadcasts` + resolves recipients from `profiles WHERE status=active` — but `profiles` is backfilled only on first login, so a mass announcement reaches only the logged-in subset of the 8,898. `tb_notify_wp` is read by nothing. **Fix: write+read `tb_notify_wp` for the login popup, OR repoint broadcast recipients to `tb_users`.** Owner: เดฟ. Effort M.

### 🟡 G3 (P1) — Config split-brain: 3 homes, overlapping yuan-rate + free-shipping *(NEW — extends adm-14 #18 to the config layer)*
`tb_settings.rpdefault/rsdefault` (LIVE, read by payment.ts) vs `settings.yuan_rate` (read by `actions/forwarder.ts` rebuilt lane) vs `business_config` (tax/flags). `free_shipping` exists in both `tb_settings.freeshipping` and `settings.free_shipping_enabled`. Today the live customer money path uses `tb_settings`, so it's not bleeding — but the rebuilt forwarder lane (`service-import/add`) prices off a *different* yuan rate, and any admin who edits "settings" via `/admin/settings` (rebuilt `settings`) thinks they changed the live rate. **Fix: declare `tb_settings`+`business_config` canonical, make `/admin/settings` read-through to them or delete it, retire `settings.yuan_rate`.** Effort M.

### 🟡 G4 (P1) — Rebuilt `hs_codes` (9 rows) vs the real data *(NEW)*
`actions/admin/hs-codes.ts` manages 9 rebuilt `hs_codes` rows; `/admin/reports/hs-code-revenue` + customs-declarations read them. If staff expect the legacy HS catalogue, 9 codes is a near-empty registry. Separately, `tb_api_china_hs` (77,218 product-category rows) is a DIFFERENT thing (1688/Taobao search-URL lookup) — confirm it's still wired to china product-search (it's referenced by `safe-numeric.ts` + report pages, not the customer search UI in this pass). **Fix: seed `hs_codes` from a real customs-HS source OR confirm 9 is intentional MVP; verify `tb_api_china_hs` powers customer image-search.** Effort M.

### 🟡 G5 (P1) — TOS / policy versioning unseeded *(NEW)*
Both `tb_terms_service` (legacy) and `tos_versions`/`tos_acceptances` (rebuilt) are EMPTY, and `policy_acknowledgments`=0. The rebuilt TOS system (`/admin/settings/tos-versions`, `lib/tos.ts`, `actions/tos.ts`) is built but **no version is published**, so the customer-facing TOS-accept gate (if any) has nothing to show / record. Legacy `termsOfServiceCargo.php` rendered a static TOS. **Fix: publish v1 TOS + (if required) wire the customer accept gate to `tos_acceptances`; same for staff `policies`→`policy_acknowledgments`.** Effort S–M.

### 🟢 G6 (P2) — Promo engine is log-only *(extends adm-14 / cust-06)*
8,540 `tb_promotion` rows are an *applied-promo ledger*; there is no master promo-definition table and `promotions` (rebuilt) is empty. `lib/promo/catalog.ts` hard-codes promo rules off `tb_settings`. Free-shipping promo carry-forward DOES work (tab-4 spawn, per CLAUDE.md P1-10). But there's no admin UI to define/schedule a new promotion, set windows, or audit redemptions against definitions. Legacy promos were also largely hard-coded. **Fix: only if marketing wants self-serve promo creation (Phase C).** Effort L.

### Items now CLOSED (were open in 2026-05-30 / 05-31 audits — verified shipped today)
- ✅ **General rate-card editor** (`tb_rate_g_*`) — adm-14 P0-2 / `_MASTER-FRESH` #3. `/admin/rates/general` + `general-rate-matrix.tsx` → `adminUpdateGeneralRateCells` → `tb_rate_g_kg/cbm`. Per-cell diff + audit log. **SHIPPED** ("Theme B", CLAUDE.md 2026-06-01).
- ✅ **144-cell default forwarder-cost matrix editor** — adm-14 P1-8 / `_MASTER-FRESH` #4. `/admin/settings/forwarder-costs` + `adminSetTbSettings...` writes the 144 `tb_settings` cost columns (allow-listed) + `numberpaymemt` + `freeshipping`. **SHIPPED.**
- ✅ **Yuan rates editor** (`rsdefault`/`rpdefault`/`rgdefault`) — `/admin/settings/legacy-rates` → `adminSetTbSettingsRates` → `tb_settings`. **SHIPPED** (Tier A6).
- ✅ **VIP/SVIP/custom-HS per-customer rate editors** → `tb_rate_vip_*` / `tb_rate_custom_*` / `tb_hs_rate_custom_*` via `rate-edits.ts` + `customer-rate.ts`. **FAITHFUL** (the dead `/admin/rates/vip` G1 is the lone exception).
- ✅ **The forwarder pricing waterfall** (`lib/forwarder/resolve-rate.ts`) is a verbatim, unit-tested port of legacy `forwarder.php getPrice()` + `calPriceForwarder()` reading the real `tb_rate_*` tables. Best-documented port in the repo.

---

## 4 · MAX-POTENTIAL UPGRADES (owner's "ดึงศักยภาพสูงสุด")

Tagged effort S/M/L · value P0/P1/P2.

| # | Upgrade | Why it's high-leverage | Effort/Value |
|---|---|---|---|
| U1 | **Rate-change audit + history view** | Every rate editor already stamps `adminidupdate` + writes `logAdminAction`. Surface a **"rate history" timeline** per card/customer (who changed X→Y, when) + a diff view. Turns the existing audit log into accountability + rollback. The `tb_hs_rate_custom_*.rkgbefore` column proves the legacy already wanted before/after. | M / P1 |
| U2 | **Dynamic / scheduled rates** | Add `effective_from`/`effective_to` to a rate-override layer so admins can pre-stage a CNY-rate change or a peak-season surcharge that auto-activates. The yuan rate (`rpdefault`) moves with the CNY FX daily — a **scheduled/auto-FX-fed yuan rate** (pull a CNY→THB feed → propose → admin 1-click apply to `tb_settings`) removes a daily manual edit + margin risk. | L / P1 |
| U3 | **Margin guard / cost-floor on every rate edit** | The data is all there: `hratecostdefault` (yuan cost), the 144-cell forwarder COST matrix, and the sale rates. Compute live **margin % per cell** in the rate editors and block/warn when a sale rate dips below cost+floor. Prevents the classic "admin types a rate that loses money" — and the profit reports (`forwarder-profit`, `shops-profit`, `yuan-profit`) confirm margin is already tracked. | M / P0 |
| U4 | **Per-customer rate automation / tiering** | 2,288 SVIP + 192 VIP rows are maintained by hand. Use the customer's actual volume (from `tb_forwarder`/`tb_header_order`/`tb_wallet_hs`) to **auto-propose VIP/SVIP promotion** ("PR123 shipped 40 CBM/mo → suggest VIP2 rate") and auto-seed the `tb_rate_custom_*` rows on approval. Turns rate-setting from reactive to data-driven. | L / P1 |
| U5 | **Unify the config layer + add a typed settings registry** | Collapse `settings`(rebuilt) into `tb_settings`+`business_config`, then expose **one typed admin config page** with field descriptions, validation, and an audit trail (extend the `business_config` key-value pattern, which is already clean). Kills G3 split-brain + makes every toggle (freeshipping, feature flags, fees) self-documenting and safely editable. | M / P1 |
| U6 | **Promo engine + redemption analytics** | Build a `promotions` master (rules/windows/eligibility) + wire `tb_promotion` as the redemption ledger → a **promo dashboard** (uptake, revenue lift, per-customer). 8,540 historical redemptions are a goldmine for "which promos actually drove orders". Pairs with U4 (targeted promos to high-value customers). | L / P2 |
| U7 | **Activate `tb_api_china_hs` (77k) as a real product-search + tariff brain** | 77,218 category→1688/Taobao URL rows are a large untapped asset. Power **customer product image-search → suggested 1688 category → est. import cost** end-to-end, and (with a real customs-HS join) auto-suggest the HS code + duty rate for a declaration. This is the "ง่ายๆแค่ปลายนิ้ว" import vision. | L / P1 |
| U8 | **Publish + version TOS/policies and gate acceptance** | Seed `tos_versions` v1 + the customer accept-gate (`tos_acceptances`) and staff `policies`→`policy_acknowledgments`. Low effort, real compliance value (PDPA consent trail), and the tables/UI already exist — they're just empty. | S / P1 |

---

## Appendix — the rate waterfall (verified faithful, for reference)

Legacy `forwarder.php getPrice()` (L1806-1931) + `calPriceForwarder()` (function.php L1990-2122), ported verbatim in `lib/forwarder/resolve-rate.ts`:

```
0. customRate switch ON        → admin-typed per-order rate (coID forced 'CUSTOM')   [highest]
   else, probe SELECT ID FROM tb_rate_custom_cbm WHERE userID:
     num_rows > 0  → 4. SVIP   → tb_rate_custom_kg.rKG / tb_rate_custom_cbm.rCBM  (flat per-user)
     num_rows == 0:
        coID == 'PCS' → 2. GENERAL (tiered)  → tb_rate_g_kg.rgKG{1,2,3} (≤100/100-500/≥500)
                                                tb_rate_g_cbm.rgCBM{1,2,3} (≤2/2-5/≥5)
        coID != 'PCS' → 3. VIP (flat)         → tb_rate_vip_kg.rKG (0 → fall back to rCBM)
                                                tb_rate_vip_cbm.rCBM
KG-vs-CBM: comparison ON → KGPerCBM > threshold ? bill-by-KG : bill-by-CBM
           comparison OFF ("ราคามากสุด") → compute both, priceCBM >= priceKg ? CBM : KG (ties→CBM)
→ writes tb_forwarder.fTotalPrice (= China→TH TRANSPORT subtotal), fRefRate, fRefPrice(1=kg|2=cbm)
```
HS-specific rates (`tb_hs_rate_custom_*`) are NOT consulted by this live forwarder waterfall — they're a separate per-customer-per-category override surface edited via `/admin/rates/custom-hs`.
