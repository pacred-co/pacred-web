# Rate / Cost / Selling-price / FX — wiring audit (2026-06-11)

> Owner asked: "ไล่เก็บพวกเรท/ต้นทุน/ราคาขาย/เรทแลกเปลี่ยน ครบและเชื่อมโยงกันหมดหรือยัง?"
> Method: 7 parallel code-auditors (one per domain) + a synthesis, each tracing
> SET-surface → write-table vs live-consumer → read-table (the §0e dead-write hunt),
> grounded on prod row-counts. This doc is the record; fixes tracked in CLAUDE.md.

## TL;DR
**~90% complete. The core money loop is CONNECTED end-to-end — no customer is mis-charged.**
Remaining = ~9 "edit-but-silent" (dead-write / no-reader) settings + ~6 missing/unreachable editors.
None mis-prices a customer TODAY (the live engine reads per-order snapshots or hardcoded consts),
but they are trust traps + future budget leaks.

## ✅ COMPLETE (verified write→read same live table)
- **Cargo rate cards ×4** — general (`tb_rate_g_*`), VIP-group (`tb_rate_vip_*`), custom-user/SVIP (`tb_rate_custom_*`), custom-HS (`tb_customrate_hs` + `tb_hs_rate_custom_*`). Read by `actions/admin/forwarders-edit.ts resolveLiveForwarderRate` + `actions/forwarder-quote.ts`. (The old rebuilt `rate_*` 0-row twins are tombstoned/inert — the classic trap here was already remediated 2026-05-31→06-05.)
- **Container cost → margin** — `tb_forwarder.fcosttotalprice` (set via report-cnt cost editor) feeds margin-monitor + all P&L. This is the REAL margin basis.
- **144-col partner-cost matrix** (`tb_settings.fcostcar/fcostship*`) → auto-fills new forwarders (`report-cnt-detail.ts`).
- **3-yuan FX**: selling=`rsdefault`(4.97) · transfer=`rpdefault`(4.93) · cost=`hratecostdefault`(4.91) — all on tb_settings, settable, connected. Freight USD→THB = per-row `tb_freight_rate.fx` (~35).
- **Yuan transfer** (rpdefault) + yuan-payment snapshot + yuan-profit report; **freight cost card** (`tb_freight_rate`) + margin cap; **VAT/WHT** + min-sell floor + promo + the >10% reprice gate; **dormant flags** fail-closed.

## 🔴 DEAD-WRITES / anomalies (edit → silent no-op), by money-impact
1. **`rgdefault`=0.00** under the dashboard "เรทสั่งซื้อ" chip (`admin/page.tsx:233`) — dead legacy column; real cost rate = `hratecostdefault` (4.91). Mislabel, no customer impact. → **FIX (Lane A): point chip to hratecostdefault.**
2. **`otp.ttl_ms`** business_config=5min but code hardcodes 15min — editable + actively wrong.
3. **`/admin/accounting/container-costs`** (`container_costs`=0) — presents as margin cost-basis but NO engine reads it. → **banner reference-only (Lane D).**
4. **`hratecostsale`** (4.95 floor) — editable in forwarder-costs, zero consumers. → **banner (Lane D).**
5. **`freight.default_markup_pct` + `freight.markup_tiers_pct`** — editable in business-config, engine uses hardcoded const. → **FIX (Lane C): read config w/ const fallback.**
6. **transfer-rep yuan stat** (`customers/[id]/transfer-rep:55`) — dead-READ of rebuilt `yuan_payments`=0 → shows ฿0. → **FIX (Lane A): repoint to tb_payment.**
7. **config cluster** (`otp.rate_limit_per_hour`, `wallet.*_min/max_thb`, `cashback.default_pct`, `features.*`) — editable, validators hardcode the real values. → **banner (handled at integration).**
8. **`commission_tiers`** (0-row) — historically the classic trap; already REMEDIATED (tiers page tombstoned, writer throws loud, calc reads hardcoded 1%). Residual dead URL/table.
9. **`rate_general`** has 10 stale rows (no reader) — TRUNCATE later (hygiene).

## 🟠 MISSING / unreachable editors
1. **PEAK GL codes** (`peak.gl_accounts`) — read by PEAK export but never seeded → no row → not in editor. → **FIX (Lane B): seed migration 0177.**
2. **Freight commission tier confirm** — `freight_commission_tiers` read confirmed-only, but no in-app confirm (SQL-only). → **FIX (Lane C): confirm action+UI.** Go-live is double-gated (flip `commission.freight_enabled` AND confirm tiers).
3. **IMPORT-forwarder per-line cost editor** — `ForwarderCostSection` built (writes live `tb_forwarder_item.cost_unit_thb`) but never mounted. → **FIX (Lane A): mount on forwarders/[fNo].**
4. **Freight SELL prices + Thai-local cost** — hardcoded in `rate-model.ts`, no editor (sell change = deploy).
5. **`forwarder_cost_adjustments`** — orphan UI + keyed to rebuilt `forwarders`=0 (doubly dead).
6. **Sales commission 1%/WHT 3%/min ฿1000** — hardcoded by design (ADR-0020); the tombstoned tiers page may mislead.

## ❓ Owner-policy open questions
- Is a separate customs-declaration USD FX rate needed in freight (today only one USD axis ~35; the 3-yuan FX is cargo-side)?
- `numberpaymemt` (123412345) — should any ฝากจ่าย document stamp it? (no downstream consumer found)
- `banks.deposit_accounts` — editable + described as driving /wallet/deposit, but no runtime read found — deeper trace needed.

— full per-domain finding JSON archived in the 2026-06-11 audit workflow run.
