# 🗂 Handoff — 2026-06-01 PM · wave plan + per-lane work distribution

Everyone runs long-haul on their lane. Canonical plan: [`docs/research/big-audit-2026-06-01/_MASTER-PLAN.md`](research/big-audit-2026-06-01/_MASTER-PLAN.md).
State: `main` = `dave-pacred` = `49368172`+ (0/0 · prod). Sync first: `git pull origin main`.

> Lane rule (owner): build ON each other's work, don't wall off. Coordinate the shared seams (money tables, LINE/CRM, RBAC).

---

## 🌊 Wave sequence (overall)
**A — Trust sweep** (เดฟ · ~1wk) → **B — Activate** (owner + ภูม + ก๊อต) → **C — BI layer** (เดฟ+ภูม · 10× value) → **D — CRM + marketing** (ปอน+เดฟ) → **E — Automation** → **F — Compliance + platform**. CargoThai (Theme 7) runs as its own track (P1/P2 with เดฟ+ภูม+ปอน).

---

## 🟦 เดฟ (เรา) — backend / integrator / BI
**Wave A — Trust sweep (start now, solo):**
1. **Potemkin dead-write sweep** — every reachable admin surface that writes a 0-row rebuilt table → repoint to `tb_*` OR remove OR banner. Known: `/admin/rates/vip` (→ `tb_rate_vip_*`; faithful editor mislabeled `/admin/rates/custom-user`); the 3 commission pages (ภูม lane — coordinate); orphan twins (`adminBulkApproveYuanPayments`→`yuan_payments`, customer `actions/forwarder.ts` rebuilt cluster). (yuan_rate one already done.)
2. **Cashback spendable** (P1) — wire `tb_cash_back` (8,810) debit into shop+yuan+forwarder checkout.
3. **Credit-line live** (P1) — `getMyCredit` reads empty rebuilt view; 24 real `tb_credit` customers see ฿0. Repoint to `tb_credit`.
4. **Config-split ADR** (P1) — `tb_settings` vs `business_config` vs rebuilt `settings`; consolidate yuan_rate/free_shipping SOT.
5. **search-demand wiring** (P1) — `tb_search_history`(31) vs report's `tb_history_key`(0).
6. Server-action contracts ปอน needs: `tb_address` delete/set-main (for M-1); `tb_forwarder`-by-tracking reader (for public `/track`).

**Wave C — BI layer** (the 10×): profit/margin analytics (`tb_forwarder.fprofittotal` per carrier/mode/rep) · SLA/cycle-time (`fdatestatus2..7` + stuck-order alerts, 457 at fstatus=5) · AR-aging · exec KPI cockpit.
**CargoThai:** P1 own-warehouse intake MVP (with ภูม) + P2 public `/track` (with ปอน · the moat).

## 🟩 ปอน — frontend / customer-facing / CRM-UI
Full package: [`docs/briefs/podeng-wave-2026-06-01.md`](briefs/podeng-wave-2026-06-01.md). Owner: ปอน เก็บหน้าบ้าน. Highlights:
- **M-1 (P0):** customer address delete/set-main inert → build UI + wire (เดฟ provides `tb_address` action).
- **P2 public `/track/{code}`** (the GTM moat) — no-login tracking timeline + ETA (เดฟ provides data reader).
- **CRM omni-inbox** — extend `/admin/line-inbox` + FB (Podeng_fb_*) · link chat→`tb_users` · reply · agent-assign.
- **Ad-ROAS dashboard** (Podeng lead-sources + meta_ads) · **lead win-back** UI (6,937 cold leads) · register-juristic inversion (coord เดฟ · ADR-0021).
- Mobile-first 360/390px · §0c click-through · no dead buttons.

## 🟧 ภูม — accounting / PEAK-style finance
Full package: [`docs/briefs/poom-wave-2026-06-01.md`](briefs/poom-wave-2026-06-01.md). Owner: ภูม เคลียร์บัญชี ทำให้เหมือน PEAK. Highlights:
- **P0 start here:** repoint the 3 Potemkin commission pages (`/admin/commissions`·`/withdrawals`·`/forwarder-sales`) — they read dead `commission_*` (0 rows) while **4,104 real `tb_user_sales` earns are invisible**.
- **P1:** port the 2 legacy payout systems (`tb_withdraw_comm_sale_*` + `tb_withdraw_comm_interpreter_*` · 71 batches / 6,151 items).
- **PEAK-style accounting:** receipts (`tb_receipt` 13.8k) + tax-invoice (`tb_forwarder_tax_invoice` RD-86) + bills (`tb_bill` 10.6k) + WHT → documents+ledger UX · **AR-aging/debtor** · period close (`accounting_periods`) · e-Tax submission readiness.
- **TH-transport batch grouping** (`tb_forwarder_tran_th_*`). Coordinate เดฟ on shared money tables.

## 🟥 ก๊อต — partner-API / platform gate
- **Partner-API live pulls:** GOGO / JMF / TTP (only MOMO/CargoThai/CTT done). Fold into the unified carrier-adapter framework (master-plan Theme 3).
- **CargoThai P4 — API-as-a-service** (the inverse of our MOMO consumption): provider endpoints + key issuance + Upstash rate-limit + usage metering/billing.
- **LINE webhook consolidation** co-decide: `Podeng_*` (live, ปอน Worker) vs repo 0131 `customers_line` (empty) — one ingest for the @pacred OA.
- **RBAC + 13-admin recreate** gate (owner-activation · ADR-0022) — unblocks ภูม's commission/rep + HR.

---

## 🔑 Activation items (owner — unblock the lanes)
1. **Recreate 13 admins** (`/admin/admins/new` · ADR-0022 + `scripts/staff-purge-analysis.mjs`) → unblocks sales-rep assign + commission rep-names + HR adminid.
2. **LINE_STAFF_GROUP_ID** — ✅ DONE (live). **MOMO creds** — ✅ DONE.
3. **Decide LINE webhook consolidation** (Podeng_* vs 0131) with ก๊อต/ปอน.
4. **OTP_BYPASS** — leave until ThaiBulkSMS corporate-route speed OK (owner cmd: ห้ามแตะจนคอนเฟิม).

## ✅ Don't re-implement (verified closed — see _MASTER-PLAN §6)
OTP env-gate · admin identity-edit · juristic queue→tb_corporate · broadcast popup→tb_notify · signup seeding · money loop · forwarder [fNo] editor + tombstone + bulk-bar + cost matrix + cnt-payment + bill-to + commission-on-delivery + carrier-picker + self-cancel · receipt auto-issue + WHT + combine-bill · yuan-rate legacy-rates editor · LINE staff-notify · MOMO creds.
