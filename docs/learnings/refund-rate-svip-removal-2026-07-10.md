# Refund-at-order-rate · VIP-tier removal via Materialize · JSDoc `*/` trap · concurrent-build (2026-07-10)

Five durable learnings from the 2026-07-10 owner-driven session (เดฟ).

## 1. 🔴 Shop-order refund MUST use the ORDER's hrate — never ¥-as-THB, never the current rate

**The bug (actions/admin/service-orders-refund.ts):** `refundAmountThb = round(cprice × refundQty)` — but `tb_order.cprice` is the **¥ unit price** and the wallet is **THB**. So a removed ¥299×10=¥2,990 item was credited **฿2,990** to the wallet when the customer had paid **฿2,990 × hrate(5.10) = ฿15,249** for it → the customer was refunded **~5× too little**.

**The rule:** a shop-order refund credits `cprice × qty × header.hrate` where `hrate = tb_header_order.hrate` = the sell rate the customer ACTUALLY PAID for THAT order (e.g. 5.10). NOT the current/live yuan rate (rsdefault) — the customer paid at the order's frozen rate, so the refund must return that. Guard `hrate > 0` (refuse a 0/NaN credit).

**Also — recompute, don't delta-subtract.** After removing/reducing a line, recompute the header totals FROM THE REMAINING lines via the canonical formula (`htotalpricechn = Σ roundUp(cprice×camount)` over `crewallet≠'1'` lines; `htotalpriceuser = roundUp((htotalpricechn + hshippingchn) × hrate + hshippingservice, 2)`). A `header.total -= refund` delta-subtraction drifts (and `adminDeleteOrderItem` had a SECOND bug: it subtracted ONE unit of `cprice`, ignoring qty, and never recomputed the THB total). Every removal path (refund + hard-delete) must recompute-from-lines so front (customer) + back (admin) agree.

**Shipping refund on drop:** when items are removed the customer expects the china shipping refunded too — expose `hshippingchn` as a reduce-only staff edit; a Δ¥ reduction refunds `Δ¥ × hrate` to the wallet + recomputes the total (staff-controlled, not an ambiguous auto-proportion).

## 2. Remove a money PRICING TIER via Materialize-first (price-neutral), then drop the code

Owner: "ยกเลิก tier VIP/SVIP/VVIP → ยึดเรทขายหน้า profile." The pricing waterfall was `manual ▸ SVIP(tb_rate_custom_*, per-customer) ▸ VIP-group(tb_rate_vip_*, coid-keyed) ▸ general(tb_rate_g_*)`. Ripping out the VIP-group tier blindly would drop 154 customers to `general` → mis-charge.

**The safe order (confirmed with the owner before executing — money-critical):**
1. **Materialize the data FIRST:** for every VIP-group customer, COPY their group's rate (`tb_rate_vip_*` for their coID) into a per-customer `tb_rate_custom_*` (keyed by userid) + set their `coID → 'PR'` (general). Now every customer resolves via their own custom rate = the SAME price (the SVIP branch already wins over VIP-group, so this is price-neutral). Dry-run + backup the coID mapping first. (138 of 154 needed it; 16 already had a custom rate.)
2. **THEN drop the tier in code:** remove the `tb_rate_vip_*` read from `resolve-rate.ts` + `live-rate.ts` + the 3 quote actions → waterfall becomes `manual ▸ per-customer custom ▸ general`. Update the test lock. Relabel VIP/SVIP badges → "เรทเฉพาะตัว". Retire the tier-CRUD pages (banner/redirect · **keep** `tb_rate_vip_*`/`tb_co` data as historical · do NOT delete).

Because the data is materialized first, the resolver change is price-neutral by construction. A stragglers-check confirms zero customers left on a tier (→ any hypothetical straggler hits a LOUD `rateMissing`, never a silent misprice).

## 3. A `*/` inside a JSDoc comment closes the block early → parse error → build fails

`* and now shows this banner. The tb_rate_vip_*/tb_co data is KEPT` — the `*/` in `tb_rate_vip_*/tb_co` **terminated the `/** … */` block** mid-sentence; the rest became invalid code → `Parsing ecmascript source code failed` → `BUILD_EXIT=1`. When a comment mentions a glob like `tb_rate_vip_*` immediately followed by `/`, write `tb_rate_vip tables` or add a space (`_* /`) so no literal `*/` appears mid-comment. tsc did NOT catch this (Turbopack's parser did) — a green tsc is not a green build.

## 4. The juristic-pending gate must be a NON-blocking notice (not a full-screen block)

A customer awaiting นิติบุคคล approval (`tb_corporate.corporatestatus='1'`) had the shop-order list + add-order page REPLACED by a full-screen "รออนุมัติ 24 ชม." banner → they couldn't see their orders/status (PR549 was stuck 6 days). Change `{pending ? <banner> : <orders>}` → `{pending && <notice>}` + always render the orders. Approval = `adminSetCorporateStatus` status `1→2` (1=รอตรวจ·2=อนุมัติ·3=ไม่ผ่าน) — already a `super`-inclusive WRITE_ROLES action (NOT ultra-only). (Trick to keep the closing `)}` intact when un-ternary-ing: wrap the always-rendered block in `{( … )}`.)

## 5. NEVER launch a `next build` while another build is running — the lock gives a false BUILD_EXIT=1

Two concurrent `next build`s → the 2nd fails with `⨯ Another next build process is already running` → `BUILD_EXIT=1` that looks like a code error but isn't. It cost a wrongly-flagged "broken push". Only one build at a time; if a background build is running, wait for it before starting another. And a `BUILD_EXIT=1` — always read the log for the ACTUAL cause (`already running` vs a real `Parsing`/`error TS`) before assuming a code break.
