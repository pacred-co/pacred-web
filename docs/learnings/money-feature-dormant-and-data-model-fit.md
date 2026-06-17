# Learning — a money rule that can't be expressed in the data model → ship DORMANT + persist an explicit flag, never guess

**Date:** 2026-06-16 · **Context:** the cargo doc-tier ฿800/CBM discount (เรือ 2900 / รถ 4900).

## What happened
The owner stated the cheapest cargo tier requires **ALL THREE**: ฝากโอน **AND** ฝากนำเข้า **AND** (ใบกำกับ OR ใบขน). An agent had already shipped an approximation that only checked tax-doc + "any import row" (condition C3 = ฝากโอน was **never checked**), so the discount leaked to orders the owner never authorized — and the discount **defaulted to ฿800 active**, so a prod-promote would have changed real bills immediately.

A source-grounded investigation (workflow over the legacy schema) found the rule **can't be expressed per-order from `tb_forwarder`**:
- ฝากโอน / ฝากสั่งซื้อ / ฝากนำเข้า are **mutually-exclusive ORIGIN services** (`tb_wallet_hs.typeservice` 3 / 1 / 2). An order is ONE origin — so "ฝากโอน AND ฝากนำเข้า on one order" is impossible by construction.
- `tb_forwarder` has **no origin column**; `reforder` points to a shop order (`tb_header_order.hNo`), not to a yuan-transfer payment. The ฝากโอน signal lives on the payment ledger with **no FK to the shipment**. Back-deriving it via temporal-proximity joins is fuzzy → would mis-grant/mis-deny a money discount.

## What worked
1. **Ship the money feature DORMANT, fail-closed.** Gated the discount behind `business_config cargo.doc_tier_discount.enabled` (default **false**) → `getDocTierDiscountCbm()` returns 0 until explicitly enabled. This let the (urgent, unrelated) MOMO fire-fix promote to prod safely with the discount held off — it can never under-charge while dormant.
2. **Surface the contradiction; don't pick for the owner.** Asked the owner how "full-loop" eligibility should be *determined* (the load-bearing branch I couldn't infer), with 3 grounded options. Owner chose **per-order admin confirm** (a ติ๊กยืนยัน flag) — exact, auditable, no fuzzy joins on the money path.
3. **The clean way to make an un-derivable signal usable = persist it at create/confirm time** (a `doc_tier_confirmed` boolean stamped by a role-gated, audited action), NOT a runtime heuristic.

## Rules of thumb
- A money discount/charge whose default is "on" is a **prod-deploy hazard**: promoting the code changes bills the moment it merges. Default money flags to **off** and require an explicit enable.
- When an owner's literal rule and the data model disagree, that's a **flag-to-the-owner moment** ("อย่ามั่ว"), not a guess. The legacy data model is the constraint; cite it.
- Mutually-exclusive enum axes (origin/type/status) can make an "A AND B" rule **impossible** — check the enum before implementing the conjunction.
- An eligibility signal with **no FK to the row being priced** should be **persisted explicitly** (admin-confirm or create-time stamp), never temporal-join-inferred on a money path.

See also: [`docs/research/cargo-pricing-spec-2026-06-16.md`](../research/cargo-pricing-spec-2026-06-16.md) · `lib/forwarder/doc-tier-discount.ts` (the dormant gate + the 3-condition header).
