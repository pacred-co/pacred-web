# 🧭 Pacred Capability & Tools Strategy — 2026-05-18

> **Synthesis** of three parallel post-launch analyses — [growth-acquisition](growth-acquisition-strategy-2026-05-18.md) · [operating-system](operating-system-analysis-2026-05-18.md) · [tools build-vs-buy](tools-strategy-build-vs-buy-2026-05-18.md). Written for เดฟ. The brief: with everything the team has built, **what tools do we have, what do we lack, and where does effort go** — so Pacred (1) gets + closes customers, (2) makes every department's work easy and visible, (3) keeps it all inside Pacred's own ecosystem.

---

## The one insight

**Pacred's bottleneck is not missing capability — it is CONNECTION.** The system is ~80-90% built. Across all three analyses the same shape appears: tools that are code-wired but switched **off**, pipelines that are built but not **joined end-to-end**, and a short list of genuinely-missing pieces that should be **built in-house, not bought**.

→ The highest-leverage work this week is *"turn on + wire what already exists"* — not *"build new."* It is also the cheapest: roughly **one day of dashboard clicks + one day of wiring** unlocks the customer-acquisition machine the company is currently spending ad money without.

---

## 🔴 Priority 1 — Customer acquisition (หาลูกค้า + ปิดดีล + กดซื้อ)

> เดฟ's paramount lens: *"ต่อให้ระบบดีแค่ไหน ถ้าหาลูกค้าไม่ได้ หรือปิดดีลให้กดซื้อไม่ได้ ก็จบเห่."* This cluster is non-negotiable #1.

The get-found machinery is ~80% ready (strong sitemap, JSON-LD, per-service landings). But **convert + buy + measure are built and NOT wired to each other** — three breaks, all verified in code:

| # | Break | Consequence |
|---|---|---|
| 1 | GTM/GA4 · Clarity · Sentry — fully code-wired in `app/layout.tsx`, **env-gated to a no-op** | Pacred runs Google + FB ads **right now with zero conversion tracking** — cost-per-lead is uncomputable |
| 2 | The lead pipeline (`ContactForm` → `submitContactMessage` → `contact_messages` → admin notify) is complete + working — but **`ContactForm` renders on no public page**; `/contact` is a `StubPage` | The lead funnel is disconnected at stage one — GA4 will report zero leads even after tracking is on |
| 3 | No self-serve **ad-click → กดซื้อ** path — `BookingCalculator` computes a real price, then `ResultBox` dead-ends into a phone/LINE modal | Every priced visitor must be hand-closed by a sales rep — no scalable "เปิดออเดอร์ราคานี้" |

**Tier 0 — this week (~1 day total, mostly free):** ① switch on the analytics/monitoring env vars (~15 min in Vercel) · ② render `ContactForm` on `/contact` + service pages · ③ verify Google Search Console + submit the sitemap · ④ claim Google Business Profile. Three of four are *connect what exists*.

**Tier 1 — BUILD:** the "เปิดออเดอร์ราคานี้" calculator→buy CTA — the missing public→purchase bridge.

---

## 🟡 Priority 2 — The internal operating system (ทุกแผนกเห็นงาน ไม่ต้องตามถาม)

Status-visibility — the Pacred DNA promise — is **half-delivered**: the *customer-facing* shipment timeline is genuinely strong (8-state ladder, scan events, U1-2 propagation makes it true). But **staff have only per-department lists — no shared cross-department board**; a hand-off is still a LINE message. The legacy "ของอยู่ไหน" relay failure is rebuilt at the staff layer.

**The centrepiece BUILD:** a cross-department **work-item / job-assignment spine** (`work_items` table + `/admin/board` + per-role inbox). It is additive — it reuses the shipped U1-2 cascade hooks, no domain-table rewrite — and it is the change that makes "every department sees the work" real for staff.

Residual department gaps (all → BUILD, sequenced after the board): CS workspace · Acc-AP vendor-payment desk · planner/dispatch board + driver mobile view · docs-team queue + Form-E/D-O generators · consignment-sale intake · messenger module.

> **Correction to the source analysis:** the operating-system doc flagged `admins.role` as a "stale 4-value enum". Verified false — migration `0033` extended it with `warehouse`+`driver` and `0054` added `interpreter`. The real residual is only (a) *new* role-types (e.g. `cs_admin`) would need a migration if those workspaces are built, and (b) the per-page `requireAdmin` RBAC decision already tracked as the F-2 follow-up.

---

## 🟢 Priority 3 — Tools: connect free, build the rest in-house

The tools analysis verdict: **"the tools we have aren't switched on, and the tools we lack are mostly things we should build, not buy."**

**CONNECT now — free, not rebuildable, ~1 day of clicks:** the 9 monitoring env vars (Sentry/GTM/GA4/Clarity/Upstash/hCaptcha — all code-wired) · Google Search Console · Google Business Profile · Meta Business Suite.

**BUILD in-house — instead of paying:** the executive KPI dashboard (the `audit-kpi-dashboard` skill + Supabase data already exist) · the MOMO sync engine · a **CI pipeline** (there is no `.github/workflows/` today — `pnpm verify` only runs when a dev remembers) · a CPC/CAC panel fed by free Google/Meta ad data.

**Empeo (HR SaaS) — rejected.** Pacred already runs a ~98%-complete in-house HR module; buying Empeo would pay monthly for built code and split employee data out of the ecosystem.

---

## Build-vs-buy — the verdict

| Buy / connect (rails Pacred genuinely can't produce) | Build in-house (keep in the Pacred ecosystem) |
|---|---|
| Google Search Console · Google Business · Meta Business · Google Keyword Planner — all **free** | KPI / exec dashboard · CPC-CAC panel · CI pipeline · MOMO sync engine |
| LINE Messaging API (already the channel) | the cross-department work-board · all per-department workspaces |
| MarineTraffic (ship GPS) · PEAK (statutory books) · NetBay / Customs Trader Portal (gov clearance) | the "เปิดออเดอร์" calculator→buy bridge · HR (already in-house — finish gaps) |

**เดฟ's locked principle:** anything that costs money and Pacred *can* build → build it. Every tool kept must be genuinely **used + monitored + producing measurable results** — otherwise cut it.

---

## 🆕 Owner-requested systems (2026-05-18) — three more, designed

After the synthesis, the owner (พี่ป๊อป) named three systems the analyses had under-weighted. Each is now a design doc:

1. **Internal org-chat — shipment/job-scoped work-comms** → [`internal-chat-system-2026-05-18.md`](internal-chat-system-2026-05-18.md). A `work_item_messages` thread layer + a `waiting_for` block (`blocked_on_role` / `blocked_on_admin` / `waiting_reason`) on `work_items` — staff talk *on the job*, the job *shows why it is stuck*. The structural cure for "ของอยู่ไหน / รอใครเฟิม". MVP **IC-1** rides on the shipped `0080` work-board.
2. **Disbursement / payment system (เบิก-จ่าย)** → [`disbursement-system-2026-05-18.md`](disbursement-system-2026-05-18.md). Today Pacred has fragments (commission `0054` · container-disbursements `0069` · inbound-WHT `0044/0053`) — not a system. Design: `disbursement_requests` + per-recipient `disbursement_lines` + `disbursement_allocations` + `disbursement_fund` (กองกลาง) + outbound `wht_certificates` (50-ทวิ, 1%/3%); claim modes (เบิกขาด/เบิกเกิน/เบิกด่วน); money-OUT fail-closed safeguards copying `checkRefundCeiling` + the `0064` floor.
3. **China-ops / container-closing (ปิดตู้)** → [`china-ops-container-closing-2026-05-18.md`](china-ops-container-closing-2026-05-18.md). The container *data* model is ~80% built; what is missing is the China *origin* — a `cn_warehouse` role + portal, the receive → measure → barcode → close-sack → **close-container** → hand-to-freight ceremony. Post-launch, **volume-gated** (only once Pacred's cargo queue is large enough to consolidate its own containers).

---

## The unified roadmap

- **Tier 0 — ✅ code SHIPPED · ⏳ dashboard pending:** `ContactForm` is live on `/contact` (`b90806b`) — the lead funnel is connected. The env-var switch-on + GSC + Google Business + Meta = ก๊อต/เดฟ dashboard actions (checklist → [`launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md)) — **the one open Tier-0 item.**
- **Tier 1 — ✅ SHIPPED:** the "เปิดออเดอร์ราคานี้" calculator→buy bridge (`/start-order` + `QuoteCTA`) · CI build-step · the `/admin/kpi` executive dashboard — integrated + verified on `dave`.
- **Tier 2 — 🟡 PARTIAL:** the cross-department `work_items` work-board (`/admin/board` + inbox) is ✅ SHIPPED (migration `0080`). MOMO sync + per-department workspaces remain specced → [`port-specs/operating-system-tier2.md`](../port-specs/operating-system-tier2.md).
- **Tier 3 — the owner's three systems (above):** internal-chat (IC-1 next) · disbursement · china-ops (volume-gated).

All shipped Tier 0/1/2 code is on `dave`, ahead of `main` — the `dave→main` deploy is gated on ภูม applying migrations `0058`-`0080` to prod Supabase.

---

## Work split — who owns what next

| Owner | Next work |
|---|---|
| **ก๊อต / เดฟ** | Tier-0 dashboard — flip the monitoring env vars in Vercel · GSC + submit sitemap · Google Business · Meta Business. *The one thing still blocking ad-conversion visibility.* |
| **ภูม** | Apply migrations `0058`-`0080` to prod (unblocks `dave→main`) · then BUILD, in order: internal-chat IC-1 → disbursement system → china-ops (volume-gated) · + the U4 / work-item-hook follow-ups. ภูม owns migrations `0073`-`0079` + `0081`+ — `0080` is taken (work_items). |
| **ปอน** | Frontend — the [`frontend-tooling-2026-05-18.md`](frontend-tooling-2026-05-18.md) recommendations (data-driven landing template) · polish the new `/contact` + `/start-order` + `QuoteCTA` surfaces. |
| **เดฟ** | Integrate the team's pushes · run the `dave→main` deploy once ภูม clears the migration gate · monitor post-deploy (Sentry/Clarity). |

---

## Source analyses

- [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md) — the find→convert→buy chain, 448 lines
- [`operating-system-analysis-2026-05-18.md`](operating-system-analysis-2026-05-18.md) — the 8 internal-department gaps, 554 lines
- [`tools-strategy-build-vs-buy-2026-05-18.md`](tools-strategy-build-vs-buy-2026-05-18.md) — the tool inventory + decision matrix, 388 lines
- [`internal-chat-system-2026-05-18.md`](internal-chat-system-2026-05-18.md) — the shipment/job-scoped work-comms design (owner system 1)
- [`disbursement-system-2026-05-18.md`](disbursement-system-2026-05-18.md) — the เบิก-จ่าย system design (owner system 2)
- [`china-ops-container-closing-2026-05-18.md`](china-ops-container-closing-2026-05-18.md) — the ปิดตู้ / China-ops design (owner system 3)
- Prior: [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md) · [`launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md) (the exact env vars for Tier 0 ①)
