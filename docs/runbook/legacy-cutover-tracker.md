# 🔌 Legacy dependency cutover tracker (V-F1)

> **Status:** living tracker — เดฟ maintains, ก๊อต confirms each cutover.
> **Date opened:** 2026-05-16 · **Source:** PORT_PLAN Part V `V-F1`
>
> **Why this exists.** [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §2 found Pacred's #1 strategic risk: the legacy stack runs through **one freelance developer (ไอแต้ม)** and a chain of pay-or-die third parties. The China product API, the server, and the SMS credits all bill through him — *"จ่ายวันนี้ ไม่งั้นระบบฝากสั่งซื้อใช้งานไม่ได้"*. A sick day or a missed invoice takes down ฝากสั่งซื้อ + OTP + the website.
>
> Finishing the Pacred migration **is** the mitigation. This tracker is the burn-down — one row per legacy dependency, from "borrowed" to "Pacred-owned, cut over."
>
> **Read with:** [`docs/runbook/pcs-scrub-plan.md`](pcs-scrub-plan.md) (don't scrub references early) · [`AGENTS.md`](../../AGENTS.md) §3 · [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V.

---

## The cutover rule (load-bearing — from AGENTS.md §3)

References to PCS / TTP / ไอแต้ม survive in the codebase **on purpose** — some APIs are still "borrowed" interim. **Do not scrub a reference until its row below is `✅ cut over` and ก๊อต has confirmed.** Scrubbing early breaks the revenue path. This tracker is the single place that records when a cutover is genuinely safe.

Status legend: 🔴 fully dependent · 🟡 replacement built, not yet cut over · 🟢 Pacred-owned · ✅ cut over + confirmed by ก๊อต.

---

## Dependency burn-down

| # | Legacy dependency | Runs through | Pay-or-die? | Pacred replacement | Status | Cutover gate | Target retire |
|---|---|---|---|---|---|---|---|
| F1-1 | **China product API** (1688/Taobao search for ฝากสั่งซื้อ) | ไอแต้ม — annual fee | 🔴 yes ("ระบบฝากสั่งซื้อใช้ไม่ได้") | `lib/china-search/` Track G (TAM interim — ADR-0003) | 🟡 code shipped, prod = demo mode (R1 Option E hybrid) | ก๊อต picks the real vendor at T+30d eval + sets Vercel env vars | week 4-6 (≈2026-06-15 / 2026-06-29) |
| F1-2 | **OTP SMS** | ไอแต้ม — "ค่า SMS ของระบบ" | 🔴 yes (no OTP = no signup) | Pacred's own ThaiBulkSMS account | 🟡 code ready (`OTP_BYPASS` flag); Pacred account pending (DV-3) | เดฟ signs up ThaiBulkSMS → flip `OTP_BYPASS=false` | Day 0 (Mon 2026-05-18) |
| F1-3 | **Server / hosting** | ไอแต้ม — 3rd-party host, 3% fee | 🔴 yes (overdue = site down) | Vercel + Supabase Cloud (Pacred-owned) | 🟢 Pacred infra live; legacy host only serves the old PHP | retire when F1-4 completes | auto-retires w/ F1-4 |
| F1-4 | **The legacy PHP cargo system itself** | ไอแต้ม | 🔴 yes (it *is* production today) | `pacred-web` (this repo) | 🟡 ~95% ported; cargo loop V1 closed | T-D1 smoke test pass → T-D4 soft-launch | **🎯 week 10 (≈2026-07-27)** |
| F1-5 | **MOMO JMF container API** | "borrowed" partner creds (interim) | 🟡 container tracking only | Pacred's own MOMO partner contract/creds | 🟡 endpoint inventory pending (ก๊อต MOMO-1 call) | ก๊อต confirms MOMO endpoints + Pacred creds | ongoing partner relationship |
| F1-6 | **Payment / bank account** | PCS legacy bank account | 🔴 yes (no account = no revenue) | Pacred company bank + PromptPay | 🔴 pending Pacred owner (T-G3 Bundle 1) | owner provides bank + PromptPay number | Day 0 (Mon 2026-05-18) |
| F1-7 | **OAuth (Google / Facebook)** | — | — | Pacred's own Supabase Auth providers | 🟢 Pacred-owned | none — done | ✅ retired |
| F1-8 | **LINE OA + notifications** | legacy used LINE Notify (EOL Apr 2025) | — | Pacred OA (`lin.ee/Yg3fU0I`) + Messaging API push (ADR-0001) + new LINE Login channel 2010105778 (DV-2) | 🟢 Pacred-owned; LIFF live `2010105778-SaSkkGza` | flip `LINE_PUSH_BYPASS=false` after smoke test | Day 0 |

---

## What "cut over" means per row

A row moves to **✅ cut over** only when **all** of:
1. The Pacred replacement is live in production (not demo / not bypassed).
2. No code path still calls the legacy service.
3. ก๊อต has confirmed it in this table (`✅` + commit).
4. *Then* — and only then — the matching PCS/TTP/ไอแต้ม references may be scrubbed per [`pcs-scrub-plan.md`](pcs-scrub-plan.md).

## Critical path to "ไอแต้ม-free"

The legacy stack stops being a single-point-of-failure when **F1-1, F1-2, F1-4** are all cut over — that is when ฝากสั่งซื้อ, OTP, and the cargo system all run on Pacred-owned infrastructure. F1-3 (server) retires automatically once F1-4 is done. F1-6 (bank) is owner-blocked and parallel.

### 🎯 Retirement timeline (locked 2026-05-16 night by ก๊อต/เดฟ/ลูกพี่ — V-F3 audit ack)

Per [V-F3 audit](../audit/v-f3-legacy-infra-resilience-2026-05-16.md) §3 + recommendation:

| Milestone | Target | Trigger |
|---|---|---|
| F1-2 (OTP) | **Day 0 — Mon 2026-05-18** | DV-3 ThaiBulkSMS keys set + `OTP_BYPASS=false` |
| F1-6 (bank) | **Day 0 — Mon 2026-05-18** | T-G3 พี่ป๊อป Bundle 1 provides |
| F1-1 (china-search) | **week 4-6 (2026-06-15 to 2026-06-29)** | T+30d eval ticket count → R1 SaaS pick |
| F1-4 + F1-3 (legacy PHP + hosting) | **week 10 — Mon 2026-07-27** | All customers migrated · 30-day "legacy URL works" grace expired |
| F1-5 (MOMO partner) | **ongoing (partner contract)** | Pacred owns warehouse eventually — partner change, not cutover |
| Post-cutover (week 11+) | **2026-08-03+** | Revoke legacy creds · delete legacy code · archive DB snapshot |

**T-7 days before F1-4 retire (week 9, 2026-07-20):** announce on LINE OA + email to all customers.
**T-0 (2026-07-27):** legacy returns 410 Gone OR 301 to Pacred equivalents (DNS R3 per V-F3 audit).
**T+30 (2026-08-26):** revoke all legacy creds · delete legacy code · archive DB snapshot per pcs-scrub-plan.

This is the **V-F1 finish line.** เดฟ + ก๊อต run F1-* weekly check-ins between now and week 10.

## How to use this tracker

- **เดฟ** — update a row's Status as a replacement progresses; never delete a row.
- **ก๊อต** — when a cutover is genuinely complete, flip the row to `✅` + note the commit. That is the green light for scrubbing under `pcs-scrub-plan.md`.
- **ภูม / ปอน** — before removing any PCS/TTP/ไอแต้ม reference, check the matching row is `✅`. If it isn't, leave the reference.

## Cross-references

- Strategic risk write-up → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §2 + §5
- Task → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-F1`
- Scrub rule → [`docs/runbook/pcs-scrub-plan.md`](pcs-scrub-plan.md) · [`AGENTS.md`](../../AGENTS.md) §3
- China-search vendor decision → [`docs/decisions/0003-china-search-vendor-cutoff.md`](../decisions/0003-china-search-vendor-cutoff.md)
- LINE replacement → [`docs/decisions/0001-line-notify-replacement.md`](../decisions/0001-line-notify-replacement.md)
- MOMO partner → [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md)
