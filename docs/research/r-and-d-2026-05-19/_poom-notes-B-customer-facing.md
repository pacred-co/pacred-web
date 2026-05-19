# ภูม — Cargo-Domain Notes · R&D Customer-Facing (03 + 02)

> **Reviewer:** ภูม (cargo-domain · Phase-B backend) · **Date:** 2026-05-19
> **Scope:** the customer-facing pair from เดฟ's 8-specialist R&D — `03-customer-portal.md`
> + `02-marketing-ads-seo.md`. Reviewed through the **D1 faithful-port lens**
> (ADR-0017 — "copy 100% sameness FIRST, then improve") + the **cargo-revenue
> lens** (8,898 migrated PCS customers · COD payment model · LINE-OA-bound).
> **Companion to:** [`d1-fidelity-customer.md`](../d1-fidelity-customer.md) ·
> [`d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) · [`poom-phase-b-prep.md`](../poom-phase-b-prep.md).

---

## 1. Phase-B fidelity reactions (conflict / co-exist / Phase-C)

### 03-customer-portal — fidelity verdict per gap

| 03 item | Touches B-1 launchpad? | Touches B-3 customer flows? | D1 conflict | Verdict |
|---|---|---|---|---|
| **G1 unified `/track` view** | 🟡 "secondary strip below the 9-icon grid" — author flags this as ADR-worthy (their §4.5) | reads `forwarders`/`service_orders`/`cargo_shipments` — but **read-only** | 🔴 **Adds a screen legacy didn't have** — legacy customers "track" on the order/import **detail** (the status tabs ARE the tracker, per d1-fidelity §10). Pushing a unified card on the launchpad WILL crowd the 9-icon grid. | **Phase C only.** Even the secondary-strip variant must wait until B-1 launchpad fidelity + B-3 tab order are verified by the owner. |
| **G2 LINE push env-flip** | ❌ | ❌ | 🟢 None — outbound channel, not a screen. Legacy had no real-time push either, so adding it is a "no-friction enhancement". | ✅ **Can ride Wave-2.** Pure env-var work; doesn't touch the portal. |
| **G3 customer-issue / claim loop** | ❌ | 🟡 adds a `<CustomerIssuesPanel>` on `/shipments/[code]` AND `/service-import/[fNo]` | 🔴 **New screen + new schema legacy didn't have.** Legacy QA discrepancy = LINE chat. Adding a structured claim loop = Pacred-original enhancement. | **Phase C-1.** Defer until B-2/B-3 fidelity is signed off. |
| **G4 PWA / web-push** | ❌ | ❌ | 🟢 Manifest + icons are orthogonal to fidelity. | **Phase C-0** — cheap, doesn't change portal layout. |
| **G5 documents axis** | ❌ | 🟡 surfaces on `/service-import/[fNo]` | 🔴 Documents card = new UI. Legacy had no per-shipment doc-status surface. | **Phase C** — gates on V-E1..E4 freight backend (also Phase C). |
| **G7 notification preferences** | ❌ | ❌ | 🟢 New settings page; doesn't change legacy screens. | **Phase C** but trivial — pairs with G2. |
| **G8/G9 wallet H-1/H-2 fixes** | ❌ | 🟡 wallet correctness | 🟢 No fidelity conflict — money-correctness bug fixes, do not change UI. | ✅ **Can ride Wave-2 B-0 backend** — wallet `tb_wallet*` rework. |
| **G10 freight customer surface** | ❌ | ❌ (freight isn't legacy-PCS) | 🟢 — legacy had no freight customer screens. | **Phase C** — couples to V-E stack. |
| **G11 copy-to-clipboard on mark code** | ❌ | 🟡 tiny addition to `/service-import/[fNo]` | 🟢 Pure UX win; doesn't change legacy layout. | ✅ **Can ride Wave-2** — 1-hour polish. |
| **G12 ตู้-close-at cron reminder** | ❌ | ❌ (outbound) | 🟢 Outbound nudge, not a screen. | **Phase C-0** — gates on G2 first. |

### 02-marketing-ads-seo — D1 footprint

Almost entirely **ปอน's lane** (public landings + GTM/Pixel + GBP + SEO). Most items don't touch the portal flow. **Items that DO touch backend:**

- **G-M-5 service-tile dead-ends** — the 7 "เร็วๆ นี้" tiles route to `/services` only. **No portal impact — but ADR-0017 says these new services aren't legacy anyway, so deferring is fine.** ⚪
- **G-M-6 LINE webhook (CI-1 — customer-intel)** — backend touch (table + webhook route). **Phase C** per ADR-0017 (customer-intel = Phase C).
- **G-M-10 CRM / lead-management `/admin/leads`** — admin-side backend (`0085_leads.sql`). **🟡 has subtle B-4 admin-RBAC overlap** — if a Wave-3+ rework adds a "Sales/Leads" role view, plan the schema now so leads can route to it later. But the build itself = **Phase C**.
- **G-M-11 acquisition KPI dashboard** — admin backend. **Phase C**.
- **G-M-19 review capture** — `/admin/reviews` backend. **Phase C**.

**Nothing in 02 conflicts with B-1/B-2/B-3.** The portal lane and the ads lane are orthogonal.

---

## 2. Phase-B sequence implications (what can ride Wave-2 vs Phase-C-only)

### 03 — can ride Wave-2 (B-0/B-2/B-3) safely

✅ **G2 env-flip** — flip `LINE_PUSH_BYPASS=false` + set `LINE_CHANNEL_ACCESS_TOKEN` in Vercel. **Zero code, zero UI change**, but **only AFTER** B-2 reconciles the status enum to legacy values, so the LINE push templates speak the right vocabulary. Pair with a 7-day volume audit (03 Tier 0.4) to avoid the notification-fatigue trap (G7).

✅ **G8 / G9 wallet correctness** — B-0/B-3 rework `actions/wallet.ts` + `actions/payment.ts` onto `tb_wallet*`. While reworking, fix the pending-debit overdraw + the post-debit atomicity in the same PR. Pure backend; UI unchanged.

✅ **G11 copy-to-clipboard on mark/address** — Wave-2 customer-portal frontend (ปอน's lane) — flag to ปอน to add `<CopyButton>` while she's reworking `/service-import/[fNo]` for B-3 fidelity. **1 hour total.**

✅ **G7 notification preferences UI** — light B-3 add-on; only needed once G2 is live. Pair with G2 same wave.

🔴 **G1 unified-tracking card** — defer. **Reason:** legacy tracking-mental-model = "the status tab IS the tracker" (per d1-fidelity §10). Add unified card BEFORE owner signs off on the 9-icon launchpad + 7/9 tab fidelity = risk of owner re-rejecting the dashboard a second time. Phase C.

🔴 **G3 customer-issue / claim loop** — defer. Adds a screen legacy didn't have + new schema (`customer_issues`). Wait until Phase B is owner-signed-off, then Phase-C-1 priority.

🔴 **G5 documents axis** — defer. Couples to V-E1..E4 freight (Phase C anyway).

### 02 — backend items worth pre-planning during Phase B (no build)

🟦 **G-M-6 LINE webhook (CI-1)** — Phase C build, but during B-3 wallet/payment rework, **note where customer support hand-off happens today** (LINE chat) so the future webhook can match the workflow legacy customers expect.

🟦 **G-M-10 CRM lead schema** — when designing B-4 per-role admin sidebars + RBAC, **leave a "Sales" role slot** so the future `/admin/leads` queue has a home. Don't build yet.

⚪ **Everything else in 02** = ปอน + ก๊อต/เดฟ (Vercel env, GBP claim, image conversion, GSC verification) — no Phase-B backend collision.

---

## 3. Backend touch-points (ภูม-lane vs ปอน-lane vs cross)

### 03-customer-portal touch matrix

| 03 item | Server action? | Schema? | `tb_*` read? | Tag |
|---|---|---|---|---|
| G1 unified `/track` | `getCustomerTrackingUnified(profileId)` — 4-query parallel OR new view | Optional view `customer_tracking_unified` | reads `tb_forwarder` · `tb_header_order` + cargo spine | 🟪 cross — backend view + frontend card |
| G2 LINE push flip | none — Vercel env only | none | none | 🟢 ก๊อต/เดฟ (env), not ภูม-build |
| G3 customer-issues loop | `customerFileIssue(input)` + `adminAcknowledgeIssue` + photo-upload | new migration `0089_customer_issues.sql` + RLS + storage bucket | optional FK to `tb_forwarder`/`tb_cnt` | 🟢 ภูม-lane (schema + actions) |
| G4 PWA + web-push | optional `subscribeWebPush` action | optional `push_subscriptions` table | none | 🟦 ปอน-lane (manifest); 🟢 ภูม for VAPID server route |
| G5 documents card | reads `tax_invoices` + `freight_invoices` + future Form E table | future doc-state tables | yes, `tb_invoice*` | 🟢 ภูม-lane (depends on V-E backend) |
| G7 notification prefs | `updateNotifyChannels` | extend `profiles.notify_channels` already exists | none | 🟢 ภูม-lane (action) + 🟦 ปอน (UI) |
| G8/G9 wallet H-1/H-2 | `actions/wallet.ts` + `actions/payment.ts` rewrite (pending+completed-aware) | optional `0090_wallet_overdraw_guard.sql` (or strengthen `0064`) | yes, `tb_wallet*` | 🟢 ภูม-lane (B-0/B-3 overlap) |
| G11 copy-to-clipboard | none | none | none | 🟦 ปอน-lane |
| G12 ตู้-close cron | new `app/api/cron/close-at-reminders/route.ts` | none | yes, `tb_cnt` + `cargo_containers` | 🟢 ภูม-lane (Phase C) |

### 02-marketing-ads-seo touch matrix

| 02 item | Server action? | Schema? | `tb_*` read? | Tag |
|---|---|---|---|---|
| GTM/Clarity/Sentry env-flip | none | none | none | 🟦 ก๊อต/เดฟ — not ภูม |
| Meta Pixel + CAPI | `app/api/meta/conversion/route.ts` (CAPI server route) | none | none | 🟢 ภูม-lane (CAPI server route only) |
| Google Ads conversion | none — GTM tag | none | none | 🟦 ปอน via GTM |
| GSC / GBP / sitemap | none | none | none | 🟦 ก๊อต — not ภูม |
| Resend transactional + welcome series | extend `lib/notifications/index.ts` + new `email_campaigns` cron | new `email_campaigns` table (Phase C) | reads `profiles` | 🟢 ภูม-lane (Phase C) |
| LINE webhook (CI-1) | new `app/api/webhooks/line/route.ts` | new `line_messages` table | reads `tb_user` to link `line_user_id` | 🟢 ภูม-lane (Phase C) |
| CRM `/admin/leads` | new server actions + admin page | `0085_leads.sql` (renumber post-D1) | reads `tb_user` to graduate lead→customer | 🟢 ภูม-lane (Phase C) |
| Image WebP/AVIF pipeline | none | none | none | 🟦 ปอน — not ภูม |
| KPI/acquisition dashboard | extends `/admin/kpi` queries | reads `tb_*` agg | yes | 🟢 ภูม-lane (Phase C) |
| Referral / loyalty `/refer` | `createReferralReward` + crediting | extends `tb_wallet_transaction` | yes | 🟪 cross — ปอน UI + ภูม action |

**Net:** 03 has 5 ภูม-lane items (G1/G3/G7/G8-9/G12) — most are Phase C. 02 has 5 ภูม-lane items (Meta CAPI · Resend lifecycle · LINE webhook · `/admin/leads` · KPI/acquisition) — **all Phase C**. **My Phase-B Wave-2 plate has only: G2-pair (env-flip support + 7-day audit), G8/G9 (wallet correctness during B-3 rework), G7-prep (extend `profiles.notify_channels` semantics).**

---

## 4. ภูม cargo-domain red flags

### 4.1 🔴 G1's "payment status" card is **dangerously underspecified for cargo**

The author's G1 card 2 ("Payment") assumes a simple `paid / pending / overdue` ternary. **Cargo COD reality is more textured.** Per d1-fidelity §5 + d1-phase-b §2 — legacy cargo flow = ship → arrive → **THEN pay** (`fStatus=5` = `รอชำระเงิน`, *after* goods reach Thailand). A customer at `fStatus=2` (สินค้าถึงโกดังจีน) seeing "pending" reads as "I'm late" → wrong mental model. **The unified card needs to know the difference between "pre-arrival-payment-not-yet-due" and "post-arrival-payment-now-due"** — that's specifically the `fStatus=5` flip. **Author missed this.** If G1 ships in Phase C, **the payment card MUST query `tb_forwarder.fStatus` to compute "payment expected from" status, not just `forwarders.status`.**

### 4.2 🟠 G7 notification preferences risk silencing the wrong channel

03 Tier 0.4 calls for a 7-day volume audit — good. But the proposed "daily digest" mode for "low-priority pings" must NOT downgrade `fStatus=4 → 5` (ถึงไทยแล้ว → รอชำระเงิน) — that's the cash-collection trigger. **Recommend: hardcode `forwarder_payment_due` (and `cnt_payment_due`) to never-digestible, regardless of customer preference.** Cargo customers who suppress payment-due pings will silently age out → admin chases by LINE → exactly what the W-3 chat-audit pain is.

### 4.3 🟠 G3 photo-upload bucket = naming collision risk

Author proposes `customer-claims/` bucket. **Cargo already has `member-docs/` (current) + the future Form E / Commercial Invoice / D-O attachments will need their own bucket(s).** Recommend: **`customer-claims/{shipmentId|forwarderId|orderId}/<uuid>.jpg`** with RLS scoped to `profile_id` + admin-by-role. **Don't fold into `member-docs/`** — that bucket's RLS treats every doc as profile-owned + admin-privileged, whereas a claim photo needs the admin-team-only-after-acknowledge pattern (claim privacy until staff opens it).

### 4.4 🔴 G-M-10 lead → customer graduation MUST hit `tb_user`, not `profiles`

02's CRM schema proposal joins `leads.profile_id → profiles(id)`. **Under D1, the customer identity table is `tb_user` (legacy PCS source-of-truth).** Per `poom-phase-b-prep.md` §1 (read-primary `tb_*` coexistence), every customer-bearing schema **must use `tb_user.userID` (text, e.g. `PR1234`) as the join key**, not `profiles.id` (uuid). If `/admin/leads` ships referencing `profiles(id)`, every lead that came in via the LINE webhook for a MIGRATED customer will fail to join. **Recommend: `leads.legacy_user_id text references tb_user(userID)` PLUS an optional `profiles.id uuid` for Pacred-native sign-ups.**

### 4.5 🟠 02's "Resend welcome series" assumes English/Western drip cadence

03 author proposes a Day-0/1/3/7 series. **Thai cargo customers are LINE-OA-bound — email is opened << 10% of the time.** The drip should fire **only when `tb_user.userEmail` is verified + `userType != นิติบุคคล-no-LINE`**, and `notify_channels.email` is on. Default-off prevents spamming the migrated cohort who never opted into email.

### 4.6 🟢 G11 copy-to-clipboard fixes the **#1 NEW-customer confusion** (W-1 chat pain)

Author flags this as G11 ("tier-2 polish"). **Disagree — this is the highest-leverage 1-hour win in the entire R&D pack.** Per chat-audit + d1-fidelity §8, every new customer asks "what address do I give Taobao?" because **select-all-then-long-press-to-copy is broken on Thai Android keyboards** for non-tech users. A tap-to-copy is the literal fix to W-1 customer confusion. Recommend: ปอน adds this **during Wave-2 fidelity polish**, not Phase C.

### 4.7 🟢 03 author correctly identifies `/my-issues` (IO-1) as the right shape for G3 — but underweights that **`/my-issues` itself violates D1 fidelity**

The IO-1 pattern is good. But `/my-issues` was added post-launch under the platform-observability system — it's a Pacred-only screen legacy doesn't have. **Per ADR-0017, even a "great" Pacred-original screen must NOT crowd the 9-icon launchpad.** Sanity-check: is `/my-issues` in the sidebar or on the launchpad? If on the launchpad = remove for D1 fidelity, restore in Phase C.

---

## 5. Phase-C priority recommendation (cargo-revenue lens)

### From 03 → **G2 LINE push outbound channel (env-flip + cron sequence)**

Cargo customers in the migrated 8,898 cohort are LINE-OA-bound (their muscle memory says "Pacred staff will LINE me when X"). The system already captures rich event data (`cargo_shipment_tracking` × 4 axes × ~4 events/shipment/day) but tells the customer NOTHING outbound. Per the author's ROI calc — ~400 customer notifications/day × 20% chat-avoid × 3min CS = **~4hrs/day of sales-rep time recovered**. That's directly billable revenue defended (every chat ticket avoided = a sales rep on a new lead instead). The bonus: once G2 is on, G12 (ตู้-close cron) becomes a 3-hour add → reduces the #1 cargo customer frustration ("I missed the cutoff") to near-zero.

### From 02 → **G-M-10 in-house `/admin/leads` CRM + LINE webhook (CI-1)**

These two ride together. **Why:** Pacred's cargo identity is "**ทุกอย่างในระบบเรา**" — Pacred IS the system. Today, every LINE inbound is invisible (G-M-6 chat-audit L-10) → sales reps duplicate-follow-up + leads fall through the cracks. A unified `leads` table fed by both `contact_messages` (web) AND the LINE webhook (CI-1) means: every cargo prospect is visible · gets assigned to a rep · is SLA-timed · gets attribution. **Per-rep close-rate becomes measurable.** Combined with the existing `/admin/kpi` exec dashboard, this is the foundation for "kill the campaign / scale the channel" decisions that pay back faster than any individual ad campaign. **My only caveat (§4.4) — the schema MUST key on `tb_user.userID`, not `profiles.id`.**

---

**End of `_poom-notes-B-customer-facing.md`.** Wave-2 plate for me: G2-pair (env-flip support + volume audit) · G8/G9 (wallet correctness during B-3 rework) · G7-prep schema. Everything else flagged → Phase C. Biggest red flag: **G1's payment-status card MUST be cargo-COD-aware** (`tb_forwarder.fStatus=5` flip), or it will read wrong for 8,898 migrated customers.
