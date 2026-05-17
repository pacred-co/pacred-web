# 🔌 Pacred — Integrations & Monitoring-Tools Gap Hunt

> **Captured:** 2026-05-17 · **Requested by:** เดฟ — "ทำมาต่อมาไม่มีคนใช้"
> (signed-up-but-unusable, or needed-but-unbuilt, and not yet properly planned).
>
> **Scope:** the monitoring tools ก๊อต signed up + the integrations เดฟ named.
> Verifies *actual code state* against [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)
> (`R-M1..R-M5`, `R-2/R-2b/R-4`) + [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V +
> [`../decisions/d7-payment-gateway-decision-matrix.md`](../decisions/d7-payment-gateway-decision-matrix.md).
>
> **This doc adds the verification layer the gap-analysis lacked** — it read the
> intent; this read the files. Where the gap-analysis was right, this cites the
> file proving it; where reality differs, it flags **CORRECTION**.

---

## 1. Summary

The gap-analysis was directionally correct but understated two things.

**Monitoring tools — all 5 are real SDK installs, none is usable.** Sentry, GTM,
Clarity, Upstash, hCaptcha are all `npm`-installed, code-wired, and mounted —
but every one is **env-gated to a no-op**: no DSN / no container ID / no Redis
URL / no captcha secret is set. They are *not* dead scaffolds (the code is
correct and one env var flips each on) — they are **"installed and forgotten."**
The launch-day risk is that nobody sets the 6 env vars and the team launches
**blind**: no error visibility on launch day, no conversion tracking on the ad
path the company is burning money on, no bot protection. Two extra problems the
gap-analysis missed: (a) a **doc contradiction** on hCaptcha's prod fail mode —
`lib/hcaptcha.ts` degrades **OPEN**, `.env.example` says **fails-closed**; one is
wrong and it changes whether unset = launch-blocker. (b) the two Sentry
deprecation warnings the gap-analysis said `R-M1` would fix are **still in
`next.config.ts`** (`disableLogger`, `automaticVercelMonitors`).

**Integrations — the MOMO gap is worse than "skeleton."** `lib/integrations/momo-jmf/`
has a typed client + types + a `sync.ts` whose body is a stub — but it also has
**zero callers, no cron route, and no entry in `vercel.json`.** The
gap-analysis called MOMO "sync scaffold"; in fact the sync **cannot run at all**
— even with a token + endpoints, nothing invokes it. The container board
(`/admin/warehouse/containers`) is fully built and functional, but is fed
**only by manual `NewContainerForm` entry** — the MOMO→board pipe does not
exist. **The top unbuilt integration is the MOMO sync cron + upsert loop**
(`R-2`); without it every container is hand-typed and the "billing freeze"
leak (§1.3 of gap-analysis) is unfixed.

**Genuinely unplanned (no code, no schema, beyond gap-analysis prose):** PEAK
and NetBay have **zero references** anywhere in the repo — they exist only as
roadmap paragraphs. Real-time ship tracking is a single hand-typed
`vessel_voyage` string. Fuel-cost calc has zero references. Customs Trader
Portal — zero. These are correctly flagged in the gap list below as
**UNPLANNED** (= named, prose-described, but no design artifact, no ADR, no
schema, no task spec — a roadmap line is not a plan).

---

## 2. Monitoring-tools usability matrix

Legend — **Signed up:** account/SDK exists · **Wired:** code present + mounted ·
**Usable:** actually does something in prod today.

| Tool | Signed up | SDK installed | Code wired | Mounted / invoked | Env set | **Usable in prod?** | Gap |
|---|---|---|---|---|---|---|---|
| **Sentry** | ✅ (ก๊อต) | ✅ `@sentry/nextjs@10` | ✅ `sentry.{server,edge}.config.ts`, `instrumentation*.ts`, `withSentryConfig` in `next.config.ts` | ✅ `register()` + `onRequestError` + `onRouterTransitionStart` | ❌ `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` unset | ❌ **no-op** | DSN unset → `Sentry.init` never runs. No LINE alert, no admin widget. Deprecation warns still in config. |
| **GTM + GA4** | ✅ (ก๊อต) | n/a (script tag) | ✅ `components/analytics/gtm-script.tsx` (`GtmScript`/`GtmNoscript`) + `lib/analytics.ts` typed events | ✅ mounted in `app/layout.tsx` `<head>` + `<body>` | ❌ `NEXT_PUBLIC_GTM_ID` unset | ❌ **renders nothing** | `GtmScript` returns `null` when ID unset. 9 event helpers exist + are called, but `track()` early-returns. Conversion tracking = 0. |
| **Microsoft Clarity** | ✅ (ก๊อต) | n/a (script tag) | ✅ `components/analytics/clarity-script.tsx` + `clarityTag/Event/Identify` in `lib/analytics.ts` | ✅ mounted in `app/layout.tsx` `<head>` | ❌ `NEXT_PUBLIC_CLARITY_ID` unset | ❌ **renders nothing** | `ClarityScript` returns `null`. No heatmap/replay data accrues. No documented review workflow for ปอน. |
| **Upstash Redis (rate-limit)** | ✅ (ก๊อต) | ✅ `@upstash/{ratelimit,redis}` | ✅ `lib/rate-limit.ts` (full impl, 5 buckets, sliding window) | 🟡 lib exists — **caller coverage unverified** in this pass | ❌ `UPSTASH_REDIS_REST_URL/TOKEN` unset | 🟡 **in-memory fallback** | Falls back to per-instance `Map` — multi-instance Vercel = quota leak (lib's own header comment admits this). Functional but not prod-safe. No admin visibility of rate-limit hits. |
| **hCaptcha** | ✅ (ก๊อต) | ✅ `@hcaptcha/react-hcaptcha` | ✅ `lib/hcaptcha.ts` (siteverify) | 🟡 lib exists — form coverage unverified | ❌ `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` / `HCAPTCHA_SECRET_KEY` unset | ❌ **degrades OPEN** | `lib/hcaptcha.ts` returns `{success:true}` when secret unset (prod logs a warn). ⚠️ **`.env.example` says "fails-closed in prod" — contradicts the code.** No admin visibility of captcha fails. |

**Verdict — none of the 5 is a dead scaffold; all 5 are "installed-and-forgotten."**
The code is correct and well-commented; each is one Vercel env var away from
working. The failure mode is *operational, not technical*: launch happens, the
env vars are never set, and the team flies blind. **Fix = a launch-checklist
item to set 6 env vars in Vercel** (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_CLARITY_ID`, `UPSTASH_REDIS_REST_URL/TOKEN`,
`NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY`) — already roadmapped as
`R-M1..R-M5` but worth re-stating as a hard gate, not a "should."

---

## 3. Integrations / tools gap list (ranked)

Effort: **S** ≤3 d · **M** 1–2 wk · **L** 2–4 wk · **XL** > 4 wk.
**Planned?** — has a design artifact (ADR / spec / schema), not just roadmap prose.

### G-1 🥇 — MOMO JMF sync: no cron, no caller, stub body — `R-2`
- **What exists:** `lib/integrations/momo-jmf/` — `client.ts` (typed HTTP wrapper,
  4 endpoints, demo-mode degrade), `types.ts` (9-status enum + Pacred map +
  TH/EN labels — verbatim-ported from chat audit), `index.ts` (public surface),
  `sync.ts` (`syncContainersFromMomo`).
- **What's missing — three layers:**
  1. **`sync.ts` body is a stub** — it fetches `listContainers()` then `void`s the
     admin client and returns `ok:true`. The upsert loop is JSDoc pseudo-code only.
  2. **Zero callers** — no `app/` / `actions/` file imports `syncContainersFromMomo`.
  3. **No cron route + not in `vercel.json`** — `app/api/cron/momo-jmf-sync/`
     does not exist; `vercel.json` has exactly 6 crons, none is MOMO. The
     skeleton's own header says "Called from `/api/cron/momo-jmf-sync/route.ts`"
     — that route was never created.
- **Why it matters:** MOMO is Pacred's *only* digital source of container +
  per-tracking status ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §1).
  The container board (`/admin/warehouse/containers`, fully built) is fed only
  by manual `NewContainerForm` entry — so today every container is hand-typed.
  Directly blocks the "billing freeze" leak fix (gap-analysis §1.3).
- **Also blocked upstream:** the real `?api=` endpoint names are still unknown —
  needs the `main-es2015.*.js` bundle capture or a DevTools recording
  ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §0) + the MOMO-1 call.
- **Severity:** 🔴 high (post-launch P0). **Effort:** L. **Planned?** ✅ partially —
  `R-2` + `momo-jmf.md` + `momo-1-call-prep.md` exist; **but no cron route is
  even scaffolded** and no ADR locks the read-only/no-writeback constraint.
- **Launch-blocker?** No (manual entry covers launch). P0 immediately after.

### G-2 🥈 — Monitoring env vars never set → launch blind — `R-M1/R-M2/R-M5`
- **What exists:** all 5 tools wired (see §2).
- **What's missing:** the 6 Vercel env vars. Until set: Sentry no-op, GTM/Clarity
  render nothing, Upstash in-memory only, hCaptcha open.
- **Why it matters:** launch-day error blindness (Sentry), blind ad spend on the
  cargo path the company is burning runway on (GTM/GA4 — emergency state is
  *"Google Ads ยิงไม่ติด"*), no bot protection on registration during an ad push.
- **Severity:** 🟡 launch-week (the env-set itself is zero-effort; the *risk* of
  forgetting is the gap). **Effort:** S. **Planned?** ✅ `R-M1..R-M5`.
- **Launch-blocker?** Partial — set `SENTRY_DSN` + `NEXT_PUBLIC_GTM_ID` +
  hCaptcha keys *before* launch; Clarity/Upstash can trail by days.

### G-3 — hCaptcha prod fail-mode doc contradiction — NEW, not in gap-analysis
- **What:** `lib/hcaptcha.ts` (lines 50-63) degrades **OPEN** in prod when
  `HCAPTCHA_SECRET_KEY` is unset (`return {success:true}` + a `logger.warn`).
  `.env.example` (hCaptcha block) states *"fails-closed in prod."* `STRATEGY.md`
  §9 and `PACRED-GAP-ANALYSIS.md` `R-M5` both echo "fails-closed."
- **Why it matters:** the two behaviors are opposite. If the *code* is intended,
  unset hCaptcha is **safe** at launch (signup still gated by OTP + rate-limit) —
  not a launch-blocker, and `R-M5`'s "fail-closed risk" framing is wrong. If the
  *doc* is intended, the code has a security hole. Someone must decide and make
  the three docs + the code agree.
- **Severity:** 🟡 (correctness/clarity, not an outage). **Effort:** S (decide +
  align). **Planned?** ❌ **UNPLANNED** — the contradiction is undocumented.
- **Launch-blocker?** No — but resolve before launch so the launch checklist is
  honest about whether the hCaptcha keys are mandatory.

### G-4 — Sentry deprecation warnings still present — minor, gap-analysis claimed fixed
- **What:** `next.config.ts` `sentryBuildOptions` still passes `disableLogger:
  true` + `automaticVercelMonitors: false`. `R-M1` lists "fix the two deprecation
  warnings" as done-scope; they are **not done**.
- **Why it matters:** cosmetic now (build warnings); a future `@sentry/nextjs`
  major could turn them into errors.
- **Severity:** 🟢 low. **Effort:** S. **Planned?** ✅ `R-M1` (but not executed).
- **Launch-blocker?** No.

### G-5 — Webhook receiver infrastructure: directory does not exist — NEW
- **What:** `app/api/webhooks/` **does not exist**. `MomoWebhookPayload` is a
  defined type in `momo-jmf/types.ts` (MOMO POSTs status changes) — but there is
  no route to receive it. The d7 matrix's §5.3 also assumes
  `app/api/webhooks/xendit/route.ts` + `kbiz/route.ts` (T+30d) — also absent.
  `d7` §7 even says "`app/api/webhooks/` currently empty" — it is not empty, it
  is **missing**.
- **Why it matters:** any push-based integration (MOMO status webhook, the
  future Xendit/K-Biz payment webhooks) needs this. Building it now with the
  signature-verification pattern baked in pre-empts the "open partner webhook"
  leak (gap-analysis §1.8 — legacy CargoThai webhook accepted any POST).
- **Severity:** 🟡 (blocks MOMO push + all payment webhooks). **Effort:** S for
  the harness; per-provider routes are M. **Planned?** 🟡 prose-only — `d7` §5.3
  names the files but no signature-verification design exists.
- **Launch-blocker?** No (MOMO sync is pull-based; payments are T+30d).

### G-6 — Real-time ship tracking (vessel + voyage): a string field, not a feed — `R-2b`
- **What exists:** `lib/validators/freight-shipment.ts` has `vessel_voyage:
  z.string().max(120).optional()` — a **hand-typed text field** on the freight
  shipment form (`admin/freight/shipments/new/new-shipment-form.tsx`). That is
  the entire "ship tracking."
- **What's missing:** any live vessel-position data source (MarineTraffic /
  vessel API), the join to a `GZS` sea-container record, any ETA refresh.
- **Why it matters:** sea route (`GZS`) is a black box; customers ask "ของอยู่ไหน"
  for sea containers and staff cannot answer (gap-analysis §1.1, `R-2b`).
- **Severity:** 🟡 (post-launch 2nd wave). **Effort:** M. **Planned?** ❌
  **UNPLANNED beyond prose** — `R-2b` is one paragraph; no provider chosen, no
  schema for vessel position, no ADR. A roadmap line ≠ a plan.
- **Launch-blocker?** No.

### G-7 — PEAK accounting integration: zero code references — `R-4`
- **What exists:** **nothing** — grep for `peakaccount` / `peak_` / `parsePeakReport`
  across `lib/ app/ actions/ supabase/` returns zero hits.
- **What's missing:** everything — the API client, the Excel-diff fallback
  (`parsePeakReport` replication), the `ภพ.30` reconciliation view. Also depends
  on `R-7` (the AP/cost ledger), which is itself unbuilt + needs a new ADR.
- **Why it matters:** PEAK is the system of record for the actual books; legacy
  ran a parallel sheet → `฿15,192 ภพ.30 gap` (gap-analysis §1.8, `R-4`).
- **Severity:** 🟡 (post-launch P1). **Effort:** L (S for the Excel-diff first).
- **Planned?** ❌ **UNPLANNED** — `R-4` prose only; no ADR, no schema, no spec
  doc, and its dependency `R-7` has no ADR either.
- **Launch-blocker?** No.

### G-8 — NetBay customs e-declaration ("ยิงใบขน"): zero code references — `R-11`
- **What exists:** **nothing** — grep for `netbay` returns zero hits repo-wide.
- **What's missing:** the SOAP/XML client, declaration generation from the
  shipment record, the NetBay export parser. Depends on `V-E11` (customs
  declaration UI) which is itself a Part-V backlog item, unbuilt.
- **Why it matters:** declarations are fired by hand in batches of 17-22 PDF
  drafts (gap-analysis §1.8 / `R-11`).
- **Severity:** 🟡 (post-launch P2, Phase I2). **Effort:** L. **Planned?** ❌
  **UNPLANNED** — `R-11` prose only; no ADR, no schema. Build the legitimate
  declaration path only (gap-analysis §4 guardrail).
- **Launch-blocker?** No.

### G-9 — Fuel-cost calculator: zero references — `R-8` part (4) / `R-13`
- **What exists:** **nothing** — grep for `fuel` repo-wide returns zero hits. The
  legacy ฿100/CBM surcharge is a manual button (gap-analysis §1.8).
- **What's missing:** the calculator (distance × rate, or CBM-based) + an
  admin-editable fuel-rate value.
- **Severity:** 🟢 low (post-launch P2). **Effort:** S. **Planned?** ❌
  **UNPLANNED** — folded into `R-8` as "part (4)", one sentence; no formula
  decided, no rate-source design.
- **Launch-blocker?** No.

### G-10 — Customs Trader Portal registration (จับคู่ลงทะเบียนกรมศุล) — `R-12`
- **What exists:** nothing — ecosystem service #1, no PHP predecessor, no Pacred
  code/route/schema.
- **Why it matters:** named ecosystem service; net-new revenue surface.
- **Severity:** 🟢 low (post-launch P3). **Effort:** M. **Planned?** ❌
  **UNPLANNED** — `R-12` prose only; the Thai Customs Trader Portal
  access/process is unresearched.
- **Launch-blocker?** No.

### G-11 — Driver scheduling & warehouse intake: pages exist, no data feed — `R-8/R-9`
- **What exists — and this is the CORRECTION to the gap-analysis's "missing
  entirely" framing:** these are **not** missing. `app/[locale]/(admin)/admin/
  driver-runs/page.tsx` (CT-7 "งานของฉัน" driver-assignment landing, server
  action `driverUpdateOwnAssignmentStatus`), `admin/drivers/` (driver directory),
  `admin/warehouse/containers/` (full container CRUD), `admin/warehouse/bulletin/`
  (auto daily LINE bulletin from live state), `admin/warehouse/qa-inspections/`
  all exist and are functional. There is even a cron
  (`expire-driver-assignments`).
- **What's actually missing:** (a) **per-box scan-in** at transload (the
  `expected_qty` vs `received_qty` discrepancy / "ตกหล่น" record — `R-9`); (b)
  truck/tractor **booking-as-a-calendar** with capacity (`R-8`); (c) the
  fuel-cost calc (G-9). The *foundations* the gap-analysis said don't exist,
  do — what's missing is the scanning + capacity layer on top.
- **Severity:** 🟡 (post-launch P2). **Effort:** L. **Planned?** 🟡 — `R-8/R-9`
  prose + the existing scaffolds; the scan/discrepancy data model is undesigned.
- **Launch-blocker?** No.

### G-12 — Container/product/driver unified status board — `R-10`
- **What exists:** `admin/warehouse/containers` (container view), `admin/driver-runs`
  (driver view), `admin/warehouse/bulletin` (auto LINE bulletin). The *pieces*
  exist; the single unified cross-cutting board does not.
- **Severity:** 🟢 low (post-launch P2 — mostly composition once G-1/G-11 land).
- **Effort:** M. **Planned?** 🟡 `R-10` prose + existing component pieces.
- **Launch-blocker?** No.

### G-13 — Legacy carrier APIs (JMF, CargoThai TTP) left commented in `.env.example`
- **What:** `.env.example` carries commented-out `JMF_CARGO_TOKEN/BASE_URL` +
  `CARGOTHAI_TTP_TOKEN` (with a **live-looking token value left in the comment**)
  + `CARGOTHAI_CN_TOKEN`. No code consumes them (the active path is `momo-jmf`).
- **Why it matters:** [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) §0
  confirms CargoThai has *no* partner API — the `cargoT/`/`CGTH/` folders are
  Pacred's own scrape via a logged-in session cookie. These env stubs are dead
  and the committed token string is a minor hygiene issue.
- **Severity:** 🟢 low (cleanup). **Effort:** S. **Planned?** ❌ **UNPLANNED** —
  but per AGENTS.md §3 do **not** scrub until ก๊อต confirms API switchover;
  flag, don't delete.
- **Launch-blocker?** No.

### Ranked

| # | Gap | Sev | Effort | Planned? | Launch-blocker |
|---|---|---|---|---|---|
| G-1 | MOMO sync — no cron, no caller, stub body | 🔴 | L | 🟡 partial | No (P0 after) |
| G-2 | Monitoring env vars never set → blind launch | 🟡 | S | ✅ | Partial |
| G-3 | hCaptcha prod fail-mode doc contradiction | 🟡 | S | ❌ | No (resolve first) |
| G-5 | Webhook receiver dir does not exist | 🟡 | S–M | 🟡 prose | No |
| G-7 | PEAK accounting — zero code | 🟡 | L | ❌ | No |
| G-8 | NetBay e-declaration — zero code | 🟡 | L | ❌ | No |
| G-6 | Ship tracking — a string, not a feed | 🟡 | M | ❌ | No |
| G-11 | Driver/warehouse — no scan/capacity layer | 🟡 | L | 🟡 | No |
| G-4 | Sentry deprecation warnings | 🟢 | S | ✅ unexec | No |
| G-9 | Fuel-cost calculator — zero code | 🟢 | S | ❌ | No |
| G-12 | Unified status board | 🟢 | M | 🟡 | No |
| G-10 | Customs Trader Portal registration | 🟢 | M | ❌ | No |
| G-13 | Dead legacy carrier env stubs | 🟢 | S | ❌ | No |

**Genuinely UNPLANNED (named, but no ADR / schema / spec — prose only):** G-3,
G-6, G-7, G-8, G-9, G-10, G-13. Each needs a design artifact before it counts
as planned — `PACRED-GAP-ANALYSIS.md` `R-#` paragraphs are a backlog, not a plan.

---

## 4. Chain notes

- **MOMO is the spine for half the roadmap.** `R-1` (status board), `R-10`
  (unified board), `R-2b` (sea tracking join) all read MOMO-synced data. G-1
  unbuilt → those downstream items have nothing to display beyond manual entry.
  **Build order:** capture the `?api=` endpoints → fill `sync.ts` upsert loop →
  add `app/api/cron/momo-jmf-sync/route.ts` → add the 7th `vercel.json` cron.
- **Webhook harness (G-5) gates two futures.** MOMO's `MomoWebhookPayload` push
  and the d7 Xendit/K-Biz payment webhooks (T+30d) all need `app/api/webhooks/`.
  Build the signature-verifying harness once; reuse per provider. This also
  closes the "open webhook" leak (gap-analysis §1.8) by construction.
- **PEAK (G-7) is double-blocked** — needs `R-7`'s AP/cost ledger to reconcile
  against, and `R-7` itself has no ADR. The Excel-diff fallback (`parsePeakReport`
  replication) is the only PEAK-related thing shippable without that chain.
- **Monitoring is a checklist failure, not a code failure.** All 5 tools work
  the moment env vars land. The single highest-ROI action in this whole doc is
  a **launch-checklist line** that sets 6 Vercel env vars — it converts five
  "installed-and-forgotten" tools into five working ones for ~10 minutes of work.
- **Resolve G-3 before writing the launch checklist** — whether the hCaptcha
  keys are *mandatory* for launch depends entirely on which of code-vs-doc is
  correct. Decide first, then the checklist can be honest.

---

## 5. Cross-references

- 📋 Roadmap this verifies → [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)
  `R-M1..R-M5`, `R-2/R-2b/R-4/R-8..R-12`
- 🤝 MOMO decode + endpoint-capture next step → [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §0
- 🚢 TTP/CargoThai = carrier partners, not APIs → [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) §0
- 💳 Payment webhooks (G-5 chain) → [`../decisions/d7-payment-gateway-decision-matrix.md`](../decisions/d7-payment-gateway-decision-matrix.md) §5.3
- 📦 Cargo backlog → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V
- ⚠️ Don't scrub legacy carrier refs (G-13) before switchover → [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)

**End — `gap-integrations-tools.md`.** Verification layer over the gap-analysis:
5 monitoring tools = installed-and-forgotten (env-gated no-ops, not dead
scaffolds); top unbuilt integration = MOMO sync cron + upsert loop (`R-2` / G-1).
