# Platform blind-spot hunt — 2026-07-01 (Workflow · find → adversarial verify → fix)

Ultracode platform-wide blind-spot hunt (5 finders × adversarial verify · 31 agents · 1.6M tok). **Verdict: platform fundamentally SOLID.** The freight-services batch (commit e2549c00) is well-engineered — the public token-gated customs-confirm flow is genuinely secure (122-bit UUID · no auth leak · money-frozen on the customer action), the SERVICE/LOGISTICS/TRADING bank-account SOT is correct + load-bearing, the cargo declared-value model honors ADR-0016 (defaults from COST not selling), the CustomsOwnNamePanel collect is idempotent + confirm-gated + audited. **0 P0 · 6 P1 · 5 P2 confirmed** (false-positives removed by the verify pass). Real work clusters in: reachability rot + a few money edge-cases.

## ✅ FIXED this session (9 auto-fixable · commit after fix-agent)
| # | Sev | Kind | Finding | Fix |
|---|---|---|---|---|
| 1 | P1 | reachability | report-cnt missing from Super/CEO sidebar — the new ใบกำกับ/ใบขน feature reachable only by URL | add /admin/report-cnt to `wrapClassWarehouse.children` (lib/admin/sidebar-menu.ts) |
| 2 | P1 | data | customs reject + send-draft lack atomic-claim verify → silent false-success race (returns ok:true on 0-row match) | `.select("id").maybeSingle()` + `if(!claimed) return error` (actions/customs-confirm.ts reject + cargo-declarations.ts send) |
| 3 | P1 | reachability | HR recruitment detail `[id]` missing force-dynamic → DYNAMIC_SERVER_USAGE 500 | add `export const dynamic="force-dynamic"` |
| 4 | P1 | money | cashback spend writes NaN to tb_cash_back on corrupt cbtotal (NaN escapes `<=0` guard) | NaN-guard `cbTotalBefore` (actions/admin/wallet-hs.ts) |
| 5 | P2 | money/ux | cargo declaration create 23505 → raw `insert_failed` not the friendly `existing_declaration` | catch `error.code==='23505'` → existing_declaration (cargo-declarations.ts) |
| 6 | P2 | money | report-cnt LANE A resets fprofittotal on every row (no no-op skip like LANE C) | add `if(prior.fcosttotalprice===sheetCost) continue` (report-cnt-cost-update.ts) |
| 7 | P2 | security/audit | PDF invoice/packing routes omit issue_in_customer_name from SELECT (token-guard invisible at route) | add the col to INVOICE_DECL_COLS/PL_DECL_COLS |
| 8 | P2 | data | lead source-tab PCS=non-freight defined twice (server count + client filter · can drift) | extract `isPcsSource`/bucket helper to lib/validators/imported-lead.ts + use both + unit test |
| 9 | P2 | ux/§0g | lead rows: assigned vs unassigned visually identical | left-border tint / "มอบหมายแล้ว" badge for assigned rows |

## 🔴 OWNER-INPUT (2 P1 · flagged · NOT auto-fixed — need owner decision)
1. **Domestic-vs-international freight bank routing hardcoded** (`service-import/forwarder-pay-modal.tsx:138` + `actions/admin/report-cnt-detail.ts:597-748`) — the forwarder-pay-modal hardcodes `isDomesticDeliveryLeg:true` → **always routes to LOGISTICS account**. International freight bills should route to SERVICE (or TRADING if ใบกำกับ). **Owner must confirm which forwarder flag/service_key distinguishes the domestic-delivery leg from the international leg** — then thread a real `isDomesticDeliveryLeg` through `adminReportCntBillToCustomer`/`adminReportCntBillGroupToCustomer` → `resolvePaymentAccount()`. (service-catalog already maps `defaultAccount==='logistics'` so the data is mostly there.)
2. **Cargo ใบขนรวม declared_value editable upward with no cost-baseline lock** (`actions/admin/cargo-declarations.ts:261-334 setCargoDeclarationLine`) — declared seeds from COST correctly (ADR-0016), but a later edit can raise it back up with only an audit-log trail, no enforcement = a VAT/customs under-valuation audit gap (or over-valuation). **Owner/accounting confirm the policy**: cap declared ≤ cost_baseline (capture at create) + require super/accounting + explicit override reason to exceed? Then enforce.

## Notes
- The other ~5 confirmed findings (P2/P3, minor) folded into the 9 above or were cosmetic — the 11 detailed here are the actionable set.
- Verify pass dismissed the majority of raw findings as false-positives (misread comments / already-guarded TOCTOU / non-existent code) — typical of an exhaustive hunt; only the source-confirmed real ones are listed.
