# 🎯 MASTER PLAN — Pacred big audit + long-term upgrade roadmap (2026-06-01)

**Scope:** 6-agent deep audit of ALL 263 Supabase tables (116 `tb_*` legacy + 147 rebuilt/new) ×
legacy PHP (member + 180 pcs-admin files) × current Pacred code, building on the 2026-05-30/31 gap audits.
Per-cluster detail: `01-customer-identity.md` · `02-cargo-forwarder.md` · `03-shop-order-money.md` ·
`04-billing-tax-sales.md` · `05-rates-settings-promo.md` · `06-admin-hr-notify-crm.md`.

---

## §1 — The data reality (verified on prod yzljakczhwrpbxflnmco)

The faithful port is **substantially DONE**. Legacy `tb_*` is canonical everywhere; the rebuilt twins are
empty seeds. Headline volumes (all real, all collected, mostly **unleveraged**):

| Domain | Live legacy data |
|---|---|
| Customers | **8,927** `tb_users` (8,939 `profiles` backfilled) · 346 `tb_corporate` · 4,154 `tb_address` |
| Forwarder (import) | **47,636** orders × **114 cols** · ~29k deliveries · 457 waiting-payment (fstatus=5) |
| Shop / orders | `tb_header_order` 21,950 · `tb_order` **124,345** · cart/product live |
| Money | `tb_wallet` 8,899 (254 non-zero) · **`tb_wallet_hs` ledger 104,591** · `tb_payment` 1,460 · `tb_cash_back` 8,810 · `tb_credit` 24 real |
| Billing | `tb_receipt` 13,800 · `tb_bill` 10,600 · commission: `tb_user_sales` 4,104 earns · 71 payout batches / 6,151 items |
| Rates/config | `tb_rate_*` engine LIVE · **`tb_settings` 152 cols** · **`tb_api_china_hs` 77,218** product-category rows |
| Staff/CRM | `tb_admin` 13 staff · LINE CRM `Podeng_*` 52 contacts/212 msgs · FB CRM + `meta_ads` schema present · `cron_invocations` 1,881 · `platform_incidents` 77 |

**Rebuilt-twin row counts confirmed 0 on prod:** `forwarders`, `containers`, `cargo_*`, `wallet_transactions`,
`yuan_payments`, `tax_invoices`, `freight_invoices`, `commission_*`, `sales_payouts`, `admin_contact_extras`,
`customers_line`/`line_messages` (0131), `broadcasts`, `addresses`, `corporate`(1). → legacy is the SOT.

---

## §2 — Three cross-cutting patterns (the root causes)

**Pattern A — Potemkin twins (mostly already repointed).** Most rebuilt tables are empty; the live code
was repointed to `tb_*` over the 2026-05-30→06-01 marathons. **Money loop CLOSED (no double-spend).** The
forwarder lane is ~90% complete. Do NOT re-implement the closed items (see §6).

**Pattern B — Reachable dead-write TRAPS (the dangerous residue · trust + money).** A few admin surfaces are
still wired to a DEAD rebuilt table — staff edit, get a green toast, **nothing changes**. These are worse than
a missing feature (silent wrong-data). Found:
- `/admin/rates/vip` → writes empty `rate_vip` (engine reads `tb_rate_vip_*`; faithful editor mislabeled `/admin/rates/custom-user`). **(G1)**
- `/admin/commissions` · `/admin/withdrawals` · `/admin/forwarder-sales` → read dead `commission_*`/`sales_commissions` while 4,104 real earns are invisible.
- (`/admin/settings` `yuan_rate` field — **fixed this session**; same class.)
- orphan dead twins, unreached but re-route landmines: `adminBulkApproveYuanPayments`→`yuan_payments`; customer `actions/forwarder.ts` rebuilt cluster.
→ **Action: every reachable dead-write must be repointed OR removed OR bannered. A "Potemkin sweep" is the cheapest trust win.**

**Pattern C — The unmined goldmine (where "ดึงศักยภาพสูงสุด" lives — the 10× value).** Years of operational
data are collected but almost nothing aggregates/acts on it: 47,636 forwarder orders carry per-order
`fprofittotal`/`fcosttotalprice`/`fdatestatus2..7` (profit + stage timestamps) → **no analytics**. 104k wallet
ledger → no reconcile/insight. 6,937 customers `userActive=''` (78%) never sales-contacted. 77,218 china
product-categories inert. LINE+FB CRM + ad-touchpoints captured → no ROAS. **This is the real upgrade frontier.**

---

## §3 — Genuinely-open gaps (deduped · prioritized · the fix-list)

### P0 (do first)
1. **RBAC 13-admin recreate** (owner-activation) — `tb_admin`=13 staff, Pacred `admins`=3, `admin_contact_extras`=0 → `/admin/admins` shows 3/13; blocks sales-rep assign + rep-names + HR adminid. (owner/ภูม · ADR-0022)
2. **Reachable dead-write traps** — VIP-rate page + the 3 commission pages → repoint to `tb_*` or banner. (เดฟ · ~half-day)
3. **Dual LINE webhook consolidation** — `Podeng_*` (live, ปอน's external Worker) vs repo `customers_line`/0131 (empty). Two ingests for one @pacred OA → pick one (Podeng_* has the data). (เดฟ+ปอน)

### P1
4. **Cashback unspendable** — 8,810 `tb_cash_back` seeded, no checkout pay-path debits it (shop+yuan+forwarder). (เดฟ)
5. **Credit-line dead for 24 real customers** — `getMyCredit` reads empty rebuilt view; `tb_credit` has 24 w/ creditvalue>0 seeing ฿0. (เดฟ)
6. **2 legacy commission payout systems unported** — `tb_withdraw_comm_sale_*` + `tb_withdraw_comm_interpreter_*` (71 batches / 6,151 items). (ภูม)
7. **Customer address delete / set-main inert** (M-1) — `data-legacy-onclick` with no action → wrong-parcel risk. (ปอน/เดฟ)
8. **TH-transport batch grouping** unported (`tb_forwarder_tran_th_*` 296/643 rows). (ภูม)
9. **search-demand report wiring** — `actions/search.ts`→`tb_search_history` (31) but report reads `tb_history_key` (0); halves never meet. (เดฟ)
10. **Register juristic dead-write + canonical-table inversion** — still writes rebuilt `corporate`. (ปอน+เดฟ · ADR-0021)
11. **Config split-brain** — `tb_settings`/`business_config`/rebuilt `settings` overlap (yuan_rate, free_shipping); rebuilt forwarder lane prices off a different rate. Write ADR + consolidate. (เดฟ)
12. **Partner-API live pulls** GOGO/JMF/TTP (only MOMO/CargoThai/CTT done). (ก๊อต)

### P2 (cleanup landmines)
13. Delete/neutralize orphan dead twins (yuan bulk-approve, customer forwarder.ts rebuilt cluster). · TOS/policy seeding (0 published). · admin avatar upload.

---

## §4 — The UPGRADE ROADMAP (long-term · "ปลดล๊อค + ดึงศักยภาพสูงสุด" · by theme)

### Theme 1 — BI / Analytics layer (HIGHEST value · data is 100% present)
- **Profit & margin analytics** — aggregate `tb_forwarder.fprofittotal`/`fcosttotalprice` per carrier · warehouse · mode · sales-rep · month. Exec P&L from real data. (M · P0-value)
- **SLA / cycle-time intelligence** — `fdatestatus2..7` → per-stage dwell, stuck-order alerts (457 at fstatus=5 = cash waiting). (M · P0-value)
- **AR-aging / debtor analytics** — unpaid `tb_receipt`/`tb_payment` aging buckets. (M · P1)
- **Sales leaderboard + targets** — on the 4,104 `tb_user_sales` earns. (M · P1)
- **Search-demand intelligence** — `tb_search_history` + 77k china categories → what customers want. (M · P1)
- **Exec KPI cockpit** — one dashboard rolling all of the above (revenue, volume, margin, SLA, AR, CSAT).

### Theme 2 — Omni-channel CRM (the "เซลผูกชื่อ + monitor ads/chat" ask, now grounded)
- **Unified LINE+FB inbox** — `Podeng_customers_line` already has phone/customer_code/lead_quality/agent cols → link chats to `tb_users`, surface wallet/orders in-chat, route by sales-rep, reply from `/admin/line-inbox`. (L · P0-value)
- **Ad ROAS / lead-source dashboard** — `Podeng_*_lead_sources` + `meta_ads` + `fb_ad_touchpoints` = campaign→add→order→revenue. Marketing flies blind today. (M · P1)
- **Lead win-back engine** — the 6,937 never-contacted `userActive=''` (78%!) → auto-queue to reps + LINE/SMS campaign. (M · P0-value)

### Theme 3 — Automation (kill manual ops)
- **Wallet auto-reconcile cron** — assert `tb_wallet == Σ tb_wallet_hs` per customer; alert drift. (S · P1)
- **Slip-OCR + auto-match** — the 1,460 yuan + deposit slips (accounting's #1 bottleneck). (L · P1)
- **Auto-commission accrual engine** — earn→accrue→payout on real `tb_user_sales`. (M · P0)
- **Scheduled / auto-FX yuan rate** + rate-change history + **margin-guard** (cost-floor on every rate edit — data present). (M · P0)
- **Unified carrier-adapter framework + status-propagation cron** — folds MOMO/JMF/GOGO/TTP/CargoThai into one interface + monitoring. (L · P1)

### Theme 4 — Data-asset activation
- **77,218 `tb_api_china_hs`** rows → product-search + tariff brain (1688/Taobao category→search-URL). (M · P1)
- **Cashback (8,810)** → wire into checkout = retention lever. (M · P1)
- **Customer-360 + credit-line as a managed, scored product** (admin grant/revoke VIP/credit on `tb_users`). (M · P1)

### Theme 5 — Compliance / accounting
- **e-Tax Invoice (RD-86) submission** — `tb_forwarder_tax_invoice` scaffolding is already RD-shaped. (M · P1)
- **PEAK / accounting-software sync** + accounting-period close. (M · P1)

### Theme 6 — Platform / ops
- **RBAC overhaul** (proper roles on the recreated 13 admins · least-privilege). (M · P1)
- **HR self-service** (attendance/leave/recruitment/training on `tas_*` — repointed this session; add staff UI). (M · P2)
- **Free observability dashboard** — `platform_incidents` (77) + `cron_invocations` (1,881) already capture rich JSON → cron success / MOMO drift / JS-error fingerprints. (S · P2)

---

## §5 — Sequencing (waves) + ownership

- **Wave A — Trust sweep (1 week · เดฟ):** Potemkin dead-write sweep (P0-2) + config-split ADR (P1-11) + cashback (P1-4) + credit-line (P1-5) + search-demand wiring (P1-9). All "edit→no-effect" + "data exists but invisible" bugs. Highest trust-per-hour.
- **Wave B — Activation (owner + teammates):** 13-admin recreate (P0-1) → unblocks commission/rep/HR · LINE webhook consolidation (P0-3) · partner-API (ก๊อต).
- **Wave C — BI layer (2-3 weeks · เดฟ+ภูม):** profit/margin + SLA + AR + sales leaderboard + exec cockpit (Theme 1). The 10× value; data is all present.
- **Wave D — CRM + marketing (ปอน+เดฟ):** unified inbox + ad ROAS + lead win-back (Theme 2).
- **Wave E — Automation (ongoing):** reconcile cron · slip-OCR · auto-commission · carrier-adapter (Theme 3).
- **Wave F — Compliance + platform:** e-Tax/PEAK · RBAC · observability (Themes 5-6).

> Lane rule (owner): build ON ปอน's + ภูม's work, don't wall them off. Coordinate the LINE/CRM + HR lanes.

---

## §6 — Already CLOSED — do NOT re-implement (verified this audit)

OTP env-gated (not bypassed) · admin identity-edit→`tb_users` · juristic admin queue→`tb_corporate` · whole-base
broadcast popup→`tb_notify`/`NotifyPopup` · wallet+cashback+rep seeded at signup · money loop (no double-spend) ·
forwarder `[fNo]` dual-mode editor + tombstoned `adminMarkForwarderPaid` + bulk-bar + driver-expiry cron +
general-rate editor + 144-cell cost matrix + cnt-payment+slip + bill-to + saveNote + printAll/printDriver +
commission-on-delivery (fires) + customer carrier-picker + self-cancel · receipt auto-issue + WHT engine
(exceeds legacy) + combine-bill · yuan-rate legacy-rates editor + the `/admin/settings` yuan_rate dead-write removal · MOMO API creds + staff-notify LIVE.

**The faithful-port era is closing. The next era = activate the data (BI + CRM + automation).**
