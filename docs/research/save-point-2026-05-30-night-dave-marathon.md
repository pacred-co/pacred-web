# 🌙 Save-point — 2026-05-30 night · เดฟ marathon (close-out)

Long autonomous เดฟ session. Closed out to conserve token/time; remaining audit to be run **manually** later (the automated workflow audit was too token-heavy — see learnings).

## 🚀 SHIPPED to `main` (prod · a58a6893)
The whole **money loop** + customer/admin core, shipped to production:
- **ADR-0018 wallet SOT** (`tb_wallet`+`tb_wallet_hs` canonical + settle contract) — `docs/decisions/0018-wallet-sot.md`
- P0-1..9 money loop: yuan settle · pay-from-wallet · withdraw (debit-hold + approve/reject/refund) · top-up approval · wallet history repoint
- P0-3/4/5 cart unification (`/service-order/cart` faithful `tb_cart`/`tb_header_order`)
- P0-17/18 customer identity + juristic (`tb_users`/`tb_corporate`)
- A4 ack dead-write removed (delivery-ack = Pacred-native Phase-C, deferred → `docs/v3-wishlist.md`)
- ภูม admin: P0-10/11/14/21/22 · task#41 forwarder bulk · P1-17 userActive
- ปอน 31-file mobile-first refactor
- ADR-0019 (3 เดฟ↔ภูม handshakes) · extended qa-flow gate (`tests/qa-flows/wallet-delta.ts`) for ก๊อต

## 🟢 STAGED on `dave-pacred` (332a8d38 · 9 ahead of main · gated green · awaiting next ship)
- **P0-19 จ่ายแทนลูกค้า (pay-on-behalf)** — shop leg + forwarder leg (money-reviewed: PCSF +50 · corporate 1% · authoritative recompute · 40 tests) — `actions/admin/pay-user.ts` + `/admin/wallet/pay-user`
- **P0-15 admin print** `/admin/service-orders/print` (repointed 4 broken admin print links)
- **P0-20** 5 admin reports → `tb_*` (ภูม)
- Next main-ship: needs ก๊อต qa-flow run (or owner go). All gated lint/tsc/test/build green.

## 🟡 PRESERVED on branches (NOT integrated — for manual review/reconcile)
| Branch | What | Owner/note |
|---|---|---|
| `worktree-agent-a6ce5501…` @28d6d30d + `…aba06d329`@fc74e19e | cust-03 forwarder cluster (P1-18/19/20 + ack-twin) — 2 WIP attempts (agents died/stopped) | เดฟ backend + ปอน UI — needs reconcile w/ ปอน refactor |
| `worktree-agent-ae275c01…` @2356b07d | P0-19 slip-top-up Phase 3 (insufficient-balance path) WIP | เดฟ — review money math |
| `worktree-agent-ad91214c…` @ff446440 | cust-06 address actions + reverse-image-search gaps WIP | **ปอน lane** (she reclaimed customer frontend) |
| `worktree-agent-a1eb729…` @614d4ec7 | customer dashboard de-bloat (hero cap + nav dedup) — was merged then **reset out** | **ปอน lane** — hand the ideas to ปอน |

## 🗺 Teammate branches (manual integrate later)
- **Poom-pacred** (ภูม) `61bca6b7` — 16 ahead of main; pushed new admin work (P0-12/13/16 lane?) NOT yet in dave-pacred → integrate next session (per branch-integrate-loop, batch-merge when ภูม signals a lane done).
- **InwPond007 / podeng** (ปอน) `5c678ba5` — ปอน **reclaimed the customer frontend + member portal** (own lane); เดฟ stops touching `(protected)/*` UI.

## 🔴 Remaining gaps (run the manual audit later)
Per the (aborted) workflow scope — re-check on current code, many old gaps already fixed:
- ภูม lane: P0-12 yuan self-approve+notify · P0-13 5-tab shop UPDATE (XL) · P0-16 per-item refund · commission earn-trigger (ADR-0019 D-B)
- เดฟ lane: cust-03 forwarder reconcile · P0-19 slip Phase 3
- ปอน lane: customer frontend polish (dashboard de-bloat, address actions, responsive/theme) — ปอน owns
- Deferred (owner): OTP `EMERGENCY_OTP_BYPASS`

## 🧠 Learnings captured this session
`docs/learnings/agent-orchestration.md` — (1) worktree-isolation mandatory for file-mutating background agents; (2) **concurrent build-heavy agents thrash the host (load 216)** — cap at 1-2 w/ a dev server; (3) **Workflow `{schema}` is fragile at scale** — one missed StructuredOutput kills the whole run + the per-finding verify fan-out exploded to 119 agents/3.9M tokens → use schema-less self-verifying text agents.
Plus: ADR-0018 (wallet SOT) · ADR-0019 (handshakes) · schema casing drift (`tb_users` camelCase vs `tb_wallet` lowercase).

## ▶️ Resume (manual)
```bash
git fetch origin --prune
git log --oneline -3 origin/dave-pacred   # = 332a8d38
# 1) manual gap audit: walk legacy vs current per lane (NOT a 119-agent workflow — too costly)
# 2) integrate Poom-pacred (ภูม 16 ahead) when a lane is signalled done
# 3) ship dave-pacred → main after ก๊อต qa-flow (P0-15/19/20)
# 4) cust-03 + P0-19-slip reconcile (preserved branches above)
```
