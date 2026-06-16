# Cargo จีน-ไทย pricing spec (owner 2026-06-16) — canonical

> Owner-stated pricing rules for the cargo (China→Thailand import) line. Load-bearing for the rate engine + MOMO billing + sales quoting + tax-invoice. "ทุกอย่างต้องเชื่อมโยง ลิงค์ กันได้ทั้งหมด · ทำงานได้ทุกแผนก · ใช้งานได้จริง."

## ⭐ FINAL RULE (owner-locked 2026-06-16, TIGHTENED) — TWO-TIER via a fixed doc-discount · ALL THREE conditions (AND)
The general/default rate is CORRECT as-is on prod (เรือ 3,700 / รถ 5,700 — do NOT change). The "spec" rate (เรือ 2,900 / รถ 4,900 / kg ฿11) is a **conditional preferential tier = the default rate MINUS a fixed ฿800/CBM discount**, granted ONLY when **ALL THREE** conditions hold (owner verbatim 2026-06-16: "ต้อง ฝากโอน ฝากนำเข้า และ เปิดใบกำกับ หรือใบขน ต้องตรงสามเงื่อนไขนี้ ถึงจะได้ราคาที่ถูกที่สุด"):
1. **ฝากโอน** = customer used OUR yuan-transfer (โอนหยวน/Alipay) service, **AND**
2. **ฝากนำเข้า** = OUR import service, **AND**
3. **tax-doc = ใบกำกับ (tax_invoice) OR ใบขน (customs)** (NOT receipt/none).
- ⚠️ This **TIGHTENS** the earlier draft (which had condition-2 as "yuan OR import" — that was too loose). It is now yuan **AND** import **AND** taxdoc.
- **kg-over-คิว switch:** when **kg > คิว (kg/250 > cbm)** the sell basis may switch to **฿11/kg** ("แต่ถ้ากิโลเยอะกว่าคิว ให้สามารถเปลี่ยนขายเป็นกิโลได้ เน้นว่าต้องโลเยอะกว่าคิว"). Only when kg dominates.
- **Mechanism: a FIXED ฿800/CBM discount** off the resolved CBM rate (3700−800=2900 · 5700−800=4900). `DEFAULT_DOC_TIER_DISCOUNT.cbm_thb=800` (ACTIVE by default), overridable via business_config `cargo.doc_tier_discount`, applied in the ONE resolver (`lib/forwarder/resolve-rate.ts`) so MOMO-billing + sales-quote + customer + วางบิล all honour it. kg basis: CBM discount only (apply to CBM; leave kg unless owner extends).
- The rate-ENGINE logic (max(cbm, kg/threshold), unified resolver) is already correct — only the doc-tier discount + the eligibility threading are NEW. Base rate cards (tb_rate_g 3700/5700) stay untouched.

## The rules (raw owner statements)
1. **ค่าเทียบ / dim-weight factor: 1 คิว (CBM) = 250 kg.** This is the volumetric comparison constant ("ที่เรา set ไว้ที่ 250").
2. **Sell by คิว (CBM) by default** — MOMO charges US by CBM; nobody charges by kg; CBM is cheaper/better value. So the chargeable basis = compare CBM vs the weight-equivalent: chargeable_cbm = **max(cbm, kg / 250)**. Normal goods → cbm dominates → bill by คิว. **EXCEPT** "ลูกค้าที่ กิโลเยอะเกินคิว" — when kg/250 > cbm (dense/heavy goods) → bill by kg.
3. **CBM rates (sell):** เรือ (sea) = **฿2,900 / CBM** · รถ (truck/land) = **฿4,900 / CBM**.
4. **Cargo kg rate (sell): ไม่ต่ำกว่า ฿11 / kg** (minimum ฿11/kg). Consistency check: 2900 ÷ 250 = 11.6 ≈ the 11 floor, so the CBM rate and the kg floor align (the kg-dominant case naturally bills more).
5. **These rates REQUIRE issuing a ใบกำกับภาษี (tax invoice) with us** — i.e. this is the with-tax-invoice price tier (ties to the tax-doc mode: ใบกำกับ vs ใบขน vs ไม่รับเอกสาร).
6. **Sales MUST quote the customer at the คิว (CBM) price** as above, except kg-over-cbm jobs (then the kg price).

## Likely formula (verify vs the live rate engine + legacy)
`chargeable_cbm = max(cbm, kg / 250)` → `freight_china_th = chargeable_cbm × cbm_rate` (2900 sea / 4900 truck).
Equivalent comparison form: `freight = max(cbm × cbm_rate, kg × kg_rate)` with kg_rate ≥ 11. Confirm the EXACT existing formula (`calPriceForwarder` / `computeAndFillForwarderImportRate` / the rate cards) before changing — do not assume.

## Why this is urgent NOW
The MOMO ฿0 fix (agent ae83e7449567b1027) makes `computeAndFillForwarderImportRate` run with non-zero kg/cbm. If the configured rates / dim-factor do NOT match this spec (250 · 2900 · 4900 · 11), the MOMO arrival will auto-fill a WRONG price. So the rate engine + rate cards MUST encode this spec for the MOMO fix to bill correctly.

## To verify / wire (the investigation + fix)
- Where the **250 dim-factor** lives (a constant / `tb_settings` / `tb_rate_*` / business_config) — is it 250?
- Whether the engine does the **max(cbm, kg/250)** comparison (sell-by-คิว-unless-kg-dominant).
- The **2900 sea / 4900 truck / CBM** + **11 kg-floor** — where set + do they match? (rate cards: tb_rate_g / tb_rate_vip / forwarder-costs / business_config.)
- The **tax-invoice tier** link (these rates ⇒ ใบกำกับ).
- The **connections**: MOMO billing (computeAndFillForwarderImportRate) · sales quote (the quote tool / cart) · customer-facing price · the วางบิล/receipt — all must read the SAME rate. (เชื่อมโยงทุกแผนก.)
