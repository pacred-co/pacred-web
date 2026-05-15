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

| # | Legacy dependency | Runs through | Pay-or-die? | Pacred replacement | Status | Cutover gate |
|---|---|---|---|---|---|---|
| F1-1 | **China product API** (1688/Taobao search for ฝากสั่งซื้อ) | ไอแต้ม — annual fee | 🔴 yes ("ระบบฝากสั่งซื้อใช้ไม่ได้") | `lib/china-search/` Track G (TAM interim — ADR-0003) | 🟡 code shipped, prod = demo mode (R1 Option E hybrid) | ก๊อต picks the real vendor + sets Vercel env vars |
| F1-2 | **OTP SMS** | ไอแต้ม — "ค่า SMS ของระบบ" | 🔴 yes (no OTP = no signup) | Pacred's own ThaiBulkSMS account | 🟡 code ready (`OTP_BYPASS` flag); Pacred account pending (DV-3) | เดฟ signs up ThaiBulkSMS → flip `OTP_BYPASS=false` |
| F1-3 | **Server / hosting** | ไอแต้ม — 3rd-party host, 3% fee | 🔴 yes (overdue = site down) | Vercel + Supabase Cloud (Pacred-owned) | 🟢 Pacred infra live; legacy host only serves the old PHP | retire when F1-4 completes |
| F1-4 | **The legacy PHP cargo system itself** | ไอแต้ม | 🔴 yes (it *is* production today) | `pacred-web` (this repo) | 🟡 ~95% ported; cargo loop V1 closed | T-D1 smoke test pass → T-D4 soft-launch |
| F1-5 | **MOMO JMF container API** | "borrowed" partner creds (interim) | 🟡 container tracking only | Pacred's own MOMO partner contract/creds | 🟡 endpoint inventory pending (ก๊อต T-G2) | ก๊อต confirms MOMO endpoints + Pacred creds |
| F1-6 | **Payment / bank account** | PCS legacy bank account | 🔴 yes (no account = no revenue) | Pacred company bank + PromptPay | 🔴 pending Pacred owner (DV-4 bundle) | owner provides bank + PromptPay number |
| F1-7 | **OAuth (Google / Facebook)** | — | — | Pacred's own Supabase Auth providers | 🟢 Pacred-owned | none — done |
| F1-8 | **LINE OA + notifications** | legacy used LINE Notify (EOL Apr 2025) | — | Pacred OA (`lin.ee/Yg3fU0I`) + Messaging API push (ADR-0001) | 🟢 Pacred-owned; LIFF pending DV-2 | flip `LINE_PUSH_BYPASS=false` after LIFF app created |

---

## What "cut over" means per row

A row moves to **✅ cut over** only when **all** of:
1. The Pacred replacement is live in production (not demo / not bypassed).
2. No code path still calls the legacy service.
3. ก๊อต has confirmed it in this table (`✅` + commit).
4. *Then* — and only then — the matching PCS/TTP/ไอแต้ม references may be scrubbed per [`pcs-scrub-plan.md`](pcs-scrub-plan.md).

## Critical path to "ไอแต้ม-free"

The legacy stack stops being a single-point-of-failure when **F1-1, F1-2, F1-4** are all cut over — that is when ฝากสั่งซื้อ, OTP, and the cargo system all run on Pacred-owned infrastructure. F1-3 (server) retires automatically once F1-4 is done. F1-6 (bank) is owner-blocked and parallel.

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
