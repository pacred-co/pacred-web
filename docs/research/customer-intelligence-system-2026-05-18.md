# 🔭 ระบบรู้จักลูกค้า — Customer-Intelligence System — survey + design

> **Captured:** 2026-05-18 · **By:** customer-intelligence analyst (research worktree) · **Status:** R&D design — survey of what exists + design for the gap. **No code in this doc.**
>
> **The ask (project lead เดฟ + frontend ปอน — paraphrased Thai):** a
> **customer-intelligence system** (ระบบรู้จักลูกค้า) that —
> (1) **ingests the LINE chat** — Pacred's customers arrive *mostly via LINE*
> (the LINE OA is the primary channel), so the conversation itself must flow
> **INTO Pacred** and be monitored internally, not left siloed in the LINE app;
> (2) stores chat **both sides** — the customer's messages **and** the staff
> reply — recording **which sales person / staff member answered** and whether
> the sale **closed**; (3) builds a **customer-360 record** — the lead's literal
> phrase *"รู้ข้อมูลลูกค้าทุกอย่าง"* (know everything about the customer):
> when they added the OA + via which channel, first-message date, LINE display
> name + profile, message count, and a **chat preview viewable inside Pacred's
> admin** (outside the LINE app) so staff can read the conversation, analyse it,
> and judge whether the sale can close; (4) tracks **web behaviour** — where a
> visitor clicks, how far they scroll, where they exit, the **last button
> clicked before they leave** — anchored on **IP** when there is no auth
> (1 IP ≈ 1 customer); (5) yields **KPIs** — per-sales close rate, response
> time, **channel attribution** (which channel each customer came from);
> (6) the lead's side-question — *"meta กับ ระบบ claude วัดผลยังไง ทำงานยังไง"*
> (how do Meta + the Claude agent system measure / work); (7) **connect free
> rails, BUILD in-house the data layer; STAGE the build, MVP-first.**
>
> **Read with — this doc is the SIBLING of the platform-observability doc:**
> [`platform-observability-system-2026-05-18.md`](platform-observability-system-2026-05-18.md) —
> **owner system 4.** Observability watches the **platform's health** (errors,
> uptime, KPIs *of the system*). This watches the **customer** (who they are,
> what they did, will they buy). They are two lenses on the same telemetry
> substrate — **this doc deliberately does NOT re-design** incidents, the KPI
> rollup-view machinery, the status page, or the alert engine; where those are
> load-bearing here it **cross-links** and reuses. ·
> [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md) —
> the build-vs-buy master synthesis · [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md) —
> the find→convert→buy chain (this doc instruments its *convert* step) ·
> [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) — the post-launch roadmap ·
> [ADR-0001](../decisions/0001-line-notify-replacement.md) — LINE Notify →
> Messaging API (the LINE *push* this doc's ingestion is the inbound twin of) ·
> [ADR-0007](../decisions/0007-analytics-and-ab-testing.md) — the GTM/GA4/Clarity
> decision this extends · [ADR-0002](../decisions/0002-admin-architecture.md) —
> `is_admin()` + the `admins` role model the admin surfaces build on.

---

## 0. TL;DR

1. **LINE is the front door, and right now Pacred is blind to it.** Pacred's
   LINE integration today is **one-directional — outbound only**:
   `lib/notifications/index.ts::sendLinePush()` *pushes* messages to a customer
   via the Messaging API. There is **no webhook** — `app/api/` has no
   `webhooks/` directory at all (confirmed `find app/api`). Every inbound
   customer message — the first "สนใจส่งของจากจีนค่ะ", every follow-up, every
   "เท่าไหร่คะ" — lands in the LINE OA app and **nowhere in Pacred**. The team
   cannot see, in their own system, who is talking to them, what was said, who
   replied, or whether it closed. **Part 1 builds the inbound half.**
2. **The customer-360 is the headline — and it is genuinely net-new.** Pacred
   stores a registered customer well (`profiles`, with `line_user_id`,
   `referral_channel`, `recommended_by` — migration `0003`). But a *LINE lead*
   is not yet a `profiles` row — they are a stranger in a chat. The customer-360
   is the record that **starts at first LINE contact** (before signup), captures
   *"ทุกอย่าง"* — channel of arrival, OA-add date, display name + avatar,
   message count, the full conversation — and **graduates into / links to** the
   `profiles` row when the lead registers. It is the spine of "รู้จักลูกค้า."
3. **Web behaviour: connect Clarity (free, already does most of it) + build the
   ONE thing it cannot.** Microsoft Clarity is **already code-wired** (ADR-0007,
   `components/analytics/clarity-script.tsx`) and *already does* click tracking,
   scroll depth, rage-clicks, session replay, and exit detection — for free, at
   any scale. **Do not rebuild that.** What Clarity *cannot* do: tie a behaviour
   session to **Pacred's own customer record**, anchor an anonymous visitor on
   **IP**, and surface the behaviour **inside the admin next to the
   customer-360**. **Part 2 builds only that complement** — an in-house
   `visitor_sessions` + `visitor_events` log keyed to the customer, honest about
   the Clarity split.
4. **Meta + Claude measurement — answered in §9, concisely.** **Meta:** the Meta
   Pixel (browser) + the **Conversions API / CAPI** (server) report a Pacred
   conversion — a `generate_lead`, a `place_order` — *back to Meta*, so ad spend
   becomes measurable (cost-per-lead, ROAS) and Meta's algorithm can optimise.
   The Pixel rides the **already-wired GTM container** (ADR-0007 explicitly
   says GTM "carries future Meta Pixel"); CAPI is a thin server route that
   posts the *same* conversion events. It ties to channel-attribution: a lead
   tagged `channel=facebook_ads` is the lead Meta gets credit for. **Claude:**
   the team's Claude Code agents are measured by *what ships* — commits/PRs
   merged, the `phase-verify-loop` gates passed, surfaced through the
   **`audit-kpi-dashboard`** skill as a team-process KPI. Brief, §9.2.
5. **Build-vs-buy (เดฟ's locked principle).** **CONNECT** the free rails Pacred
   cannot cheaply rebuild — the **LINE Messaging API webhook** (already the
   channel; the inbound endpoint is free), **Clarity** (session replay /
   heatmaps — free, wired), **GA4** (web analytics — free, wired), the **Meta
   Pixel** (free, rides GTM). **BUILD in-house** everything that *holds Pacred's
   customer data* — the chat store, the customer-360, the per-sales KPIs, the
   in-house IP-anchored behaviour log, the CAPI relay. Full table §8.
6. **Staged, MVP-first.** **Stage 1 (MVP — CI-1)** = the LINE webhook ingest +
   the chat store + the customer-360 record + the admin chat-preview. *That
   alone* turns Pacred's blind front door into a seen one — the highest-value
   first slice. **Stage 2 (CI-2)** = the per-sales KPIs (close rate, response
   time) + channel attribution. **Stage 3 (CI-3)** = the in-house web-behaviour
   tracker (IP-anchored, complementing Clarity). **Stage 4 (CI-4)** = the
   unified customer-intelligence dashboard + Meta CAPI + lead scoring. §5–§9.
7. **Identity-clean — but PII-honest.** Unlike the observability doc (which
   handles only *aggregate operational* telemetry and refuses PII), this system
   **legitimately holds customer PII** — that is its job ("รู้จักลูกค้า"). So
   the discipline is different: it is **not** "avoid PII," it is **"hold PII
   under strict RLS, PDPA-aware, staff-only, with a lawful basis."** §3.4 sets
   the boundary: chat content + display name + profile = stored (the customer
   contacted a business — a service-delivery basis); RLS = staff-only, never
   customer-visible-to-each-other; a deletion path exists; the *web-behaviour*
   half stays pseudonymous (IP + a visitor id, not a name) until the visitor
   authenticates. This doc is explicit because it is the one Pacred system that
   is *meant* to know the customer.

---

## 1. Why this matters — the strategic frame

Pacred **launched 2026-05-17**. Its CLAUDE.md DNA says the customer comes via
*"ไทย ~95% ใช้ LINE"* (ADR-0001) and the LINE OA ([@pacred](https://lin.ee/Yg3fU0I),
channel `2009931373`) is the **primary acquisition channel**. The
[`growth-acquisition-strategy`](growth-acquisition-strategy-2026-05-18.md) doc
frames the company's #1 problem as *find → convert → buy*. **This system
instruments the middle of that chain — `convert` — which is currently
invisible.**

Today the team can answer "did a build compile" and (once observability ships)
"did a route 500." It **cannot** answer the questions a sales-led import/export
business lives or dies on:

- *A customer messaged us on LINE three days ago — did anyone reply? Who? What
  did they say? Did it close?*
- *ปอน's sales rep "ภูม" closed 4 deals this week and "ปอน" closed 1 — is ภูม
  better, or did ภูม just get more leads? What is each rep's close rate?*
- *Our average first-reply time on LINE — is it 4 minutes or 4 hours? (A slow
  reply loses an import customer to the next forwarder.)*
- *This new customer — which channel brought them? A Facebook ad? An organic
  Google search? A friend's referral? We are paying for ads; which ad works?*
- *This visitor priced a 20ft container on the calculator, scrolled the whole
  FAQ, then left without contacting us — what was the last thing they clicked?*

A forwarding business is a **relationship business**. The legacy chat audits in
this very folder ([`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md))
decode exactly this failure in the old operation: a *"3-human quote relay"*,
*lead-ownership disputes*, *commission disputes* — all symptoms of **no system
of record for who-owns-which-customer and who-said-what**. Pacred is rebuilding
the forwarding operation; it must not rebuild that blindness.

The owner's request names the cure. Break it into its parts:

| Lead's words (Thai) | What it means as a system requirement |
|---|---|
| "ลูกค้าส่วนใหญ่มาทาง LINE — เอาแชทเข้ามาในระบบ" | a **LINE Messaging API webhook** ingesting inbound chat **INTO Pacred**, monitored internally |
| "เก็บทั้งฝั่งลูกค้าและฝั่งพนักงาน — ใครตอบ ปิดการขายได้ไหม" | store **both directions** of the chat + the **answering staff id** + a **`closed` outcome** |
| "รู้ข้อมูลลูกค้าทุกอย่าง — เพิ่ม OA วันไหน ช่องทางไหน ทักครั้งแรกเมื่อไหร่ ชื่อ โปรไฟล์ ส่งกี่ข้อความ" | a **customer-360 record** — channel, OA-add date, first-contact, display name + avatar, message count |
| "ดูแชทย้อนหลังในแอดมินได้ — นอกแอป LINE — เอาไปวิเคราะห์ว่าปิดได้ไหม" | an **in-admin chat preview** — read the conversation *outside* the LINE app |
| "วัดผลทีมขาย — ปิดดีลกี่ %, ตอบเร็วแค่ไหน, ลูกค้ามาจากช่องทางไหน" | **per-sales KPIs** — close rate, response time, **channel attribution** |
| "เว็บก็ต้องรู้ — คลิกตรงไหน เลื่อนไปไหน ออกตรงไหน ปุ่มสุดท้ายที่กด" | a **web-behaviour tracker** — clicks, scroll-depth, exit %, last-button-before-leave |
| "ไม่ล็อกอินก็ต้องรู้ — ยึด IP, 1 IP ก็ลูกค้า 1 คน" | an **IP-anchored visitor identity** for anonymous traffic |
| "meta กับ ระบบ claude วัดผลยังไง" | explain **Meta ad measurement** (Pixel + CAPI) + **Claude-agent measurement** |

The platform-observability doc (owner system 4) cured the org's inability to
*see itself*. **This system cures its inability to *see its customer*.** They
are siblings: observability watches the *machine*, customer-intelligence
watches the *human the machine serves*. Together they are Pacred's two eyes.

---

## 2. Survey — what Pacred already HAS

This section reads the actual files. Every claim cites a path.

### 2.1 The LINE integration — outbound only, no inbound

| Fact | Evidence |
|---|---|
| LINE *push* is wired | `lib/notifications/index.ts::sendLinePush()` — `POST https://api.line.me/v2/bot/message/push`, `Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` |
| It is the notification delivery rail | `sendNotification()` → tries LINE push (if `line_user_id` set) → email fallback; `LINE_PUSH_BYPASS` (default `true`) console-logs in dev |
| The push target id is stored | `profiles.line_user_id` (`0003_profiles_extended.sql`) — "LINE Messaging API push target — ADR-0001"; unique partial index `profiles_line_user_id_idx` |
| Decided by | [ADR-0001](../decisions/0001-line-notify-replacement.md) — LINE Notify (EOL Apr 2025) → LINE Messaging API push via the Pacred OA |
| Env vars exist | ADR-0001 §Env: `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` |
| **No inbound webhook** | `find app/api -type d` → **no `webhooks/` directory**; no `app/api/line/*`; no route receives a LINE event. The integration is **one-directional.** |
| LINE *Login* is mocked | `docs/setup/line.md` — the LINE login button is `alert("กำลังจะมาเร็วๆ นี้")`; `signInWithOAuth` LINE branch is commented out; env `LINE_LOGIN_CLIENT_ID/SECRET` reserved |

→ **Pacred can talk *to* a customer on LINE; it cannot hear them.** The
Messaging API is a two-way channel — push *out*, webhook *in* — and Pacred has
wired only the out. The single most important thing this system builds is the
**inbound webhook** that completes the loop. The good news: the OA, the channel
secret, and the access token already exist (ADR-0001) — the webhook needs the
*same credentials*, only a new endpoint + the webhook URL registered in the
LINE console.

### 2.2 `profiles` — the registered-customer record

| Fact | Evidence |
|---|---|
| Table | `0003_profiles_extended.sql` extends the auth-linked `profiles` |
| LINE fields | `line_user_id` (Messaging-API push target, unique), `line_linked_at`, `line_id` (the *user-typed* chat id — "≠ `line_user_id`"), `notify_channels jsonb` |
| **Channel field already exists** | `referral_channel text` — legacy `channel` column ported; **`recommended_by text`** — who referred them |
| Member code | `PR001` running (PR + min-3-digit) — Postgres trigger `generate_member_code` (`0060`) |
| Classification | `customer_group` (`PR` default), `freight_type`, `shop_user` |

→ `profiles` is a strong record **for a customer who has registered**. Two
gaps for *this* system: (a) a LINE *lead* who has only chatted — not signed up —
has **no `profiles` row at all**; the customer-360 must exist *before* the
`profiles` row and link to it on signup; (b) `referral_channel` exists but is
**a single free-text field set at registration** — it is not a rigorous,
event-sourced channel-attribution trail. §6 + §7 address both. **Re-use, don't
replace:** the customer-360 *links to* `profiles` (it does not duplicate the
registered-customer fields) and, on signup, *populates* `referral_channel` from
the attribution it captured.

### 2.3 `contact_messages` — the web lead capture (migration `0022`)

| Fact | Evidence |
|---|---|
| Table | `0022_contact_messages.sql` — `(id, profile_id, name, contact, subject, message, status, source_url, user_agent, ip, created_at, updated_at)` |
| Status lifecycle | `new → read → replied → closed` |
| **Already captures IP + UA + referrer** | `ip text` ("abuse / rate-limit signal"), `user_agent text`, `source_url text` ("referrer if available") |
| RLS | insert = anyone (anon + auth); select-own for the submitter; admin reads via `is_admin()` |
| Lead pipeline | `ContactForm` → `submitContactMessage` → `contact_messages` → admin notify; `ContactForm` is **live on `/contact`** as of `b90806b` (per [`capability-tools-strategy`](capability-tools-strategy-2026-05-18.md)) |

→ `contact_messages` is the **web** lead-capture twin of the LINE webhook this
doc designs. Two lessons: (a) it **already proves Pacred stores `ip` + `ua` +
`source_url`** for an anonymous web contact — the Part-2 IP-anchor is *not a new
idea in the codebase*, it is the same instinct; (b) it has a `closed` status
already — the customer-360's "did it close" outcome should be *consistent* with
this. The customer-360 should treat a `contact_messages` row as **one
touch-point** of a unified customer record — a web lead and a LINE lead are the
*same person* arriving by different doors, and §6.4 unifies them.

### 2.4 The analytics rails — GTM / GA4 / Clarity (ADR-0007 — wired, env-gated off)

The [`platform-observability-system`](platform-observability-system-2026-05-18.md)
§2.1 surveys these **file-by-file** — this doc does **not** repeat that; it
states only what is load-bearing *here*:

| Rail | What it gives **this** system | State |
|---|---|---|
| **Microsoft Clarity** | session replay, **heatmaps, click tracking, scroll-depth, rage-clicks, exit** — i.e. *most of Part 2's literal asks*, for free | wired (`components/analytics/clarity-script.tsx`), `NEXT_PUBLIC_CLARITY_ID` **unset → no-op** |
| **GA4 via GTM** | web analytics, traffic-source / channel data, the anonymous funnel; `lib/analytics.ts` has typed events incl. `trackGenerateLead`, `trackPlaceOrder`, `trackCtaClick` | wired, `NEXT_PUBLIC_GTM_ID` **unset → no-op** |
| **GTM container** | the **carrier for the Meta Pixel** — ADR-0007 verbatim: GTM "also carries future **Meta Pixel**, TikTok Pixel" | wired; the Meta Pixel tag is *not yet added* to the container |
| `clarityIdentify(profileId)` | a helper that *associates* a Clarity session with a Pacred profile id ("never PII") — **the existing hook Part 2 builds on** | exists in `lib/analytics.ts` |

→ **The single most important survey finding for Part 2:** Clarity *already
does* click-tracking, scroll-depth, rage-clicks, session replay and exit
detection. **Part 2 must NOT rebuild those.** What Clarity cannot do — and what
Part 2 *will* build — is tie that behaviour to **Pacred's own `profiles` /
customer-360 record**, anchor it on **IP** for anon visitors, and show it **in
the admin beside the customer-360**. The honest framing (§7): *"switch on
Clarity for the free X; build the in-house Y that Clarity structurally cannot
do."*

### 2.5 The notifications system — the alert + (potential) reply rail

| Fact | Evidence |
|---|---|
| `sendNotification()` | `lib/notifications/index.ts` — INSERT a `notifications` row → LINE push → email fallback |
| Categories | `NotifyCategory` — `order · payment · forwarder · … · sales · system · promo · sales_digest` |
| `sales_digest` exists | there is already a sales-facing notification category + a `sales-daily-digest` cron (`app/api/cron/sales-daily-digest`) |

→ Two reuses. (1) A **new inbound LINE message → notify the assigned sales rep**
rides `sendNotification()` unchanged — needs only one new `NotifyCategory`
(`'line_inbound'`) — exactly the additive move the observability doc makes for
`'observability'`. (2) The **staff reply** half of Part 1 — when a rep replies
from *inside* Pacred's admin — *is* a `sendLinePush()` call: the reply mechanism
already exists; Part 1 adds the *capture* of it, not the *sending* of it.

### 2.6 The `audit-kpi-dashboard` skill — the KPI method

`.claude/skills/audit-kpi-dashboard/SKILL.md` codifies: **name** the metric →
**classify** (count / rate / duration / inventory / composition) → **identify**
source → **write** the query (define a `CREATE VIEW kpi_<name>` if reused) →
**render** → **capture** cadence → **cross-link**. It explicitly lists
*"customer signup conversion"* among its starter KPIs. **Part 1's per-sales KPIs
(close rate = rate, response time = duration, channel attribution =
composition) must be built *through this skill*** — not freehand. It is also the
skill that answers the "how is Claude measured" half of §9.2.

### 2.7 The platform-observability system — the SIBLING (do not duplicate)

[`platform-observability-system-2026-05-18.md`](platform-observability-system-2026-05-18.md)
(owner system 4) designs the **platform-health** lens. The two systems share a
substrate and a set of patterns; this doc **reuses, never re-designs**, the
following from it:

| From the observability doc | How this doc reuses it |
|---|---|
| `platform_events` — the unified cross-surface event log | Part 2's `visitor_events` is a **customer-behaviour-specific** log; where a web behaviour event is *also* platform-notable (a `funnel` event — `signup_completed`, `lead_submitted`), it **also** emits a `platform_events` row. The two logs are siblings, not rivals — §7.5. |
| The `v_kpi_*` rollup-view machinery + cron-refresh | Part 1's per-sales KPIs + Part 3's funnel KPIs are **`v_kpi_*` views built the same way** — this doc does not re-invent the rollup pattern. |
| The marketing-funnel rollup (`v_marketing_funnel`, find→convert→buy, CAC/CPC) | The observability doc **already owns** the *aggregate* marketing funnel. This doc's channel-attribution feeds it **per-customer attribution data**; §9.1 + §3.4 draw the line — observability = aggregate funnel counts, customer-intelligence = the per-customer record. **No double-build.** |
| The `/admin/observability/*` route group + audience-scoped RLS | This doc's `/admin/customers/*` surfaces are a **sibling route group**, same RLS grammar (`is_admin([...])`). |
| The status page, the incident-triage table, the alert engine | **Not reused / not duplicated** — those are pure platform-health; out of scope here. |

**The clean division of labour:** if the question is *"is the system OK?"* →
observability. If the question is *"who is this customer and will they buy?"* →
this system. A page-view is a `platform_events` row *for the funnel count*
**and** a `visitor_events` row *for that customer's behaviour trail* — same
event, two purposes, two owners. §7.5 makes the rule precise.

### 2.8 Survey verdict — the gap in one table

| Requirement | Today | Gap |
|---|---|---|
| Ingest LINE chat **into** Pacred | LINE push is **outbound only**; no webhook, no `app/api/webhooks/` | **NEW: a LINE Messaging API webhook ingest route** (Stage 1) |
| Store chat **both sides** + answering staff + `closed` | nothing — inbound chat lives only in the LINE app | **NEW: `line_conversations` + `line_messages` tables** (Stage 1) |
| **Customer-360** — channel, OA-add, first-contact, profile, msg count, in-admin chat preview | `profiles` covers a *registered* customer; a *lead* has no record | **NEW: `customer_profiles` 360-record + `/admin/customers` chat-preview UI** (Stage 1) |
| Per-sales **close rate / response time / channel attribution** KPIs | none — no sales-performance measurement exists | **NEW: `v_kpi_sales_*` views + a sales-performance panel** (Stage 2) |
| Web behaviour — clicks, scroll, exit, last-button | **Clarity does this** — but is env-gated **off** + its data lives in Clarity | **CONNECT Clarity** + **NEW: an in-house IP-anchored `visitor_*` log tied to the customer record** (Stage 3) |
| **IP-anchored** identity for anon visitors | `contact_messages.ip` proves the instinct; no general anon-visitor identity | **NEW: `visitor_sessions` keyed on an IP+UA fingerprint + a visitor cookie** (Stage 3) |
| Channel attribution — which channel each customer came from | `referral_channel` is one free-text field set at signup | **NEW: an event-sourced `customer_touchpoints` attribution trail** (Stage 2/4) |
| Meta ad measurement | the Meta Pixel is *not* in the GTM container; no CAPI | **CONNECT the Meta Pixel (via GTM) + BUILD a thin CAPI relay** (Stage 4) |
| One place to see it all | scattered — `profiles`, `contact_messages`, (future) Clarity | **NEW: the unified `/admin/customers/[id]` customer-intelligence view** (Stage 4) |

---

## 3. The reference model — what "knowing the customer" looks like

### 3.1 The three planes of a customer-intelligence system

```
┌─ INGEST ──────────────────────────────────────────────────────────┐
│  rails that bring customer signal IN:                            │
│  LINE webhook · web behaviour tracker · contact form ·            │
│  signup event · the analytics tags (GA4 / Clarity / Meta Pixel)   │
├─ UNIFY ───────────────────────────────────────────────────────────┤
│  Pacred-owned customer record:                                    │
│  customer_profiles (the 360) ← links → profiles ·                 │
│  line_conversations + line_messages · visitor_sessions/_events ·   │
│  customer_touchpoints (the attribution trail)                     │
├─ ACT ─────────────────────────────────────────────────────────────┤
│  staff-facing surfaces + measurement:                             │
│  /admin/customers/[id] (the 360 + chat preview + behaviour) ·      │
│  per-sales KPI panel · channel-attribution report ·               │
│  Meta CAPI relay (report conversions back) · lead scoring         │
└───────────────────────────────────────────────────────────────────┘
```

Pacred has **fragments of INGEST** (LINE push but no webhook; `contact_messages`;
3 analytics rails off), **a fragment of UNIFY** (`profiles` — registered
customers only), and **almost no ACT** (no chat preview, no sales KPI, no
attribution report). This system completes all three planes.

### 3.2 The customer-360 — the central object

The lead's phrase *"รู้ข้อมูลลูกค้าทุกอย่าง"* describes a **single record per
human** that aggregates every touch:

```
                  ┌──────────────────────────────┐
   LINE chat ───▶ │                              │
   web visit  ───▶│      customer_profiles       │◀── links to profiles
   contact    ───▶│       (the 360 record)       │    (when they register)
   form       ───▶│                              │
   signup     ───▶ └──────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        when + how      the whole      did it
        they arrived    conversation   close?
        (channel)       (chat preview)  (outcome)
```

A LINE lead, a web visitor, and a registered customer are **not three records —
they are one person seen at three stages.** The customer-360 is the record that
**spans** them: it can exist from the first anonymous LINE message, accrete the
conversation, and — when the person signs up — *bind* to their `profiles` row.
This is the structural difference from `profiles` (auth-bound, registered-only)
and the reason a new table is justified (§6.2 makes the case rigorously).

### 3.3 The "both sides + who answered + did it close" pattern

The lead is precise: store the **customer's message AND the staff reply**, the
**staff id**, the **outcome**. This is a *conversation-with-an-outcome* model:

| Element | Stored as |
|---|---|
| an inbound customer message | a `line_messages` row, `direction='inbound'` |
| a staff reply | a `line_messages` row, `direction='outbound'`, `sender_admin_id` set |
| which staff member answered | `line_conversations.assigned_admin_id` + per-message `sender_admin_id` |
| did the sale close | `line_conversations.outcome` — `open → engaged → won → lost` |
| how fast was first reply | derived: first `outbound` ts − first `inbound` ts |

This is the *same shape* the observability doc's `platform_incidents` uses (a
thing + a lifecycle status + an owner) — and the *same shape* `contact_messages`
already uses (`new→read→replied→closed`). **Consistency is deliberate:** a
Pacred "thing that a staff member works and that ends in an outcome" always
looks like this. The customer-intelligence conversation is one more instance.

### 3.4 Identity & PDPA boundary — what this design DOES and does NOT do

This is the one Pacred system **designed to know the customer** — so unlike the
observability doc (which refuses PII), the discipline here is *holding PII
correctly*, not avoiding it.

- ✅ **Stores customer PII with a lawful basis.** LINE chat content, the LINE
  display name + avatar, the message history — stored because **the customer
  initiated contact with a business to receive a service** (a contract /
  legitimate-interest basis under PDPA). This is normal CRM data; a forwarder
  *must* keep a customer's enquiry to serve them.
- ✅ **Strict RLS — staff-only, role-scoped.** The chat store + customer-360 are
  readable by **staff** (`is_admin([...])`), scoped by role (a sales rep sees
  their assigned customers; a `super`/`sales_admin` sees all). **A customer
  never sees another customer's record** — there is *no* customer-facing read
  policy on these tables. This is the *inverse* of a customer-portal table.
- ✅ **The web-behaviour half stays pseudonymous until auth.** A `visitor_session`
  for an anonymous visitor is keyed on an **IP + UA fingerprint + a visitor
  cookie** — *not* a name. It becomes *identified* only when that visitor
  authenticates (then the session links to their `profiles` id). Until then it
  is "visitor `7f3a…`", not "คุณสมชาย."
- ✅ **A deletion / export path.** Because this holds PII, the design includes a
  PDPA data-subject path — a customer can request their data be exported or
  erased; an admin action cascades the delete across `customer_profiles` +
  `line_messages` + `visitor_sessions`. §6.6.
- ✅ **The LINE webhook signature is verified.** Every inbound webhook request
  is HMAC-verified against `LINE_CHANNEL_SECRET` — an unverified body is
  rejected. (This *also* builds the `app/api/webhooks/` directory with
  signature-verification baked in — the same gap the observability doc's
  Sentry-webhook closes; §6.3.)
- ❌ **NOT a data broker.** Pacred stores *its own* customers' data from *its
  own* channels. It does not buy, enrich-from-third-parties, or sell customer
  data.
- ❌ **NOT exposing IP / behaviour to other customers or to partners.** The IP,
  the behaviour trail, the chat — staff-only. A partner sees a *shipment*, never
  a *customer's chat*.
- ❌ **The Meta CAPI relay sends *hashed, minimal* conversion signals** — Meta's
  CAPI accepts SHA-256-hashed email/phone for matching; Pacred sends the
  *hashed* identifier + the event, never raw PII in the clear. §9.1.

**The rule in one line:** this system *knows* the customer (that is the point),
but the knowledge is **staff-only, lawful-basis, RLS-locked, deletable** — a
CRM, not a surveillance tool.

> **Note on "1 IP ≈ 1 customer" (the lead's anchor).** This is a *useful
> working heuristic*, not a precise identity — shared office NAT, mobile carrier
> CGNAT, and dynamic IPs all break it. §7.2 is honest about this: the in-house
> tracker anchors on **IP + UA + a first-party visitor cookie together** (a
> composite "visitor fingerprint"), treats it as a *probable* visitor, and
> *upgrades to certainty* the moment the visitor authenticates or submits a
> form with a contact. The IP is the *seed*, not the verdict.

---

## 4. Build-vs-buy — the verdict

เดฟ's locked principle ([`capability-tools-strategy`](capability-tools-strategy-2026-05-18.md)):
**"anything that costs money and Pacred CAN build → build it. Connect the free
rails Pacred cannot cheaply reproduce. Every tool kept must be genuinely used +
monitored + producing measurable results."**

The line for *customer-intelligence* is clean: **connect the free channels +
free analytics rails; build everything that stores or reasons over Pacred's own
customer data — so the customer record lives inside Pacred's ecosystem.**

| Concern | Verdict | Why |
|---|---|---|
| **The LINE channel + inbound webhook** | **CONNECT — LINE Messaging API** (already the channel; the webhook endpoint is **free** — same OA, same `LINE_CHANNEL_SECRET`) | The inbound webhook is *part of the Messaging API Pacred already uses for push*. There is nothing to buy — only an endpoint to build + a URL to register. The webhook *transport* is the rail; the *chat store* is the system. |
| **The chat store** (`line_conversations` + `line_messages`) | **BUILD** | The conversation, who-replied, the outcome — must be **in Pacred's DB**, queryable by Pacred RLS, joinable to the customer-360. A 3rd-party LINE-CRM SaaS keeps it in the SaaS + costs monthly. |
| **The customer-360 record** (`customer_profiles`) | **BUILD** | The literal "รู้จักลูกค้า" object — the unified per-customer record. It *is* the system. A CRM SaaS (HubSpot, etc.) costs monthly + splits customer data out of the ecosystem. |
| **Session replay / heatmaps / click + scroll + exit tracking** | **CONNECT — Microsoft Clarity** (already wired; set `NEXT_PUBLIC_CLARITY_ID`) | Free at any scale, PDPA-friendly auto-masking (ADR-0007). Rebuilding session-replay is absurd. It is a **rail** — but it is *not* the in-house customer record. §7. |
| **Web analytics / traffic-source data** | **CONNECT — GA4 via GTM** (already wired; set `NEXT_PUBLIC_GTM_ID`) | Pacred cannot rebuild Google's analytics backend. Free. A **rail.** |
| **The in-house IP-anchored behaviour log tied to the customer record** | **BUILD** | The thing Clarity *cannot* do — tie behaviour to Pacred's *own* customer-360, anchor on IP, surface in the admin. §7.2. Small, specific, in-house. |
| **Per-sales KPIs** (close rate, response time, channel attribution) | **BUILD** — via the `audit-kpi-dashboard` skill | The skill + Supabase data already exist; `/admin/kpi` proves the pattern. A BI SaaS costs money + splits data out. |
| **The Meta Pixel** (browser-side conversion signal) | **CONNECT — the Meta Pixel via the existing GTM container** | Free; ADR-0007 explicitly built GTM to carry it. Adding a Pixel tag is a GTM-UI action, not a code build. A **rail.** |
| **The Meta CAPI relay** (server-side conversion report) | **BUILD — a thin server route** | CAPI is just an authenticated `POST` to Meta with the conversion event. A thin route Pacred owns — keeps the conversion logic + the hashing in Pacred. §9.1. |
| **The unified customer-intelligence dashboard / `/admin/customers/*`** | **BUILD** | An admin surface over Pacred's own tables — same shape as the shipped `/admin/kpi` + `/admin/audit`. |
| **Lead scoring** | **BUILD — simple, in-house** | A rule/weight over the customer-360 signals (msg count, behaviour, channel). Not an ML SaaS — a transparent scorecard. §9.3. |

**Summary line:** **4 rails connected** (LINE Messaging API webhook · Clarity ·
GA4 · the Meta Pixel — all free, none cheaply rebuildable). **Everything that
holds or reasons over Pacred's customer data is built in-house** — the chat
store, the customer-360, the per-sales KPIs, the IP-anchored behaviour log, the
CAPI relay, the dashboard, lead scoring. The lead's "keep it inside Pacred's
ecosystem" instinct is satisfied: the *rails* may emit to LINE/Google/Meta, but
the **system of record — every conversation, every customer-360, every KPI — is
a set of Pacred Postgres tables under Pacred RLS.**

> **Pre-requisite, not part of this build:** setting the analytics env vars
> (`NEXT_PUBLIC_CLARITY_ID`, `NEXT_PUBLIC_GTM_ID`) is the Tier-0 dashboard
> action ([`launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md)).
> Registering the **LINE webhook URL** in the LINE Developers console (and
> confirming the OA's "Use webhook" toggle is on, "Auto-reply" off) is the
> equivalent one-time setup for Part 1 — a ก๊อต/เดฟ console action, ~10 min.
> This system *consumes* the rails; flipping them on is a pre-step.

---

## 5. Design overview — the customer-intelligence system

Three planes (§3.1), all **additive** on the existing structure. No new
top-level architecture.

```
┌─────────────────────────────────────────────────────────────────────┐
│ INGEST — rails that bring customer signal IN (Stage 1 + Stage 3)     │
│   app/api/webhooks/line/route.ts  → LINE inbound chat (signature-     │
│                                     verified) → line_messages        │
│   app/api/track/route.ts          → the in-house behaviour beacon     │
│   ContactForm / signup (existing) → contact_messages / profiles       │
│   GA4 / Clarity / Meta Pixel tags (existing rails) → channel signal   │
├─────────────────────────────────────────────────────────────────────┤
│ UNIFY — Pacred-owned customer record (Stage 1 → Stage 4)             │
│   customer_profiles  — the 360 record (links to profiles)            │
│   line_conversations + line_messages — the chat store + outcome      │
│   visitor_sessions + visitor_events  — IP-anchored web behaviour     │
│   customer_touchpoints — the event-sourced channel-attribution trail │
├─────────────────────────────────────────────────────────────────────┤
│ ACT — staff surfaces + measurement (Stage 1 → Stage 4)               │
│   /admin/customers + /admin/customers/[id] — the 360 + chat preview  │
│   the LINE inbox (assign · reply-from-admin)        (Stage 1/2)      │
│   v_kpi_sales_* — per-sales close rate / response time   (Stage 2)   │
│   the channel-attribution report                        (Stage 2)   │
│   the in-house behaviour panel (beside the 360)          (Stage 3)   │
│   the Meta CAPI relay + lead scoring + the CI dashboard  (Stage 4)   │
└─────────────────────────────────────────────────────────────────────┘
        ▼ reuses ▼
   is_admin() + admins roles · sendNotification() (rep alerts) ·
   sendLinePush() (the reply mechanism) · logAdminAction ·
   the audit-kpi-dashboard skill · the v_kpi_* rollup pattern + cron
   refresh (from the observability doc) · contact_messages · profiles.
```

**The design principle:** every channel a customer arrives through (LINE, the
web, the contact form) gets an **ingest rail** writing into a **Pacred-owned
table**; every customer is **unified** into one 360 record; every staff member
who needs to *act* gets a **scoped surface**; every sales question gets a
**KPI view**. The system adds the *customer* nervous system beside the
observability doc's *platform* one.

### 5.1 Migration numbering — TBD, must be coordinated with ภูม

The observability doc §5.1 establishes the rule and this doc **follows it
exactly — does not hard-pick a number.** The highest migration on `dave` is
**`0080_work_items.sql`**; **ภูม owns `0073`-`0079` + `0081`+**;
[`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) Phase 2 states migration numbers are
*"assigned at build time, in build order; not pre-allocated."* This system
needs ~4 migrations — named here **by content**, the implementer fixes `NNNN`
against the live `supabase/migrations/` after a check-in with ภูม:

- `<NNNN>_customer_profiles.sql` — the customer-360 record
- `<NNNN>_line_conversations.sql` — the chat store (conversations + messages)
- `<NNNN>_visitor_tracking.sql` — the in-house behaviour log
- `<NNNN>_customer_touchpoints.sql` — the channel-attribution trail

All migrations are **additive + idempotent** (`if not exists` / `drop … if
exists`), zero data migration, safe on prod live — the house style. The four
owner-system docs all carry the same "numbers TBD, coordinate with ภูม" note;
the build that schedules first claims its block.

---

## 6. Stage 1 (MVP — CI-1) — LINE webhook ingest + the chat store + customer-360

> **The MVP. This stage alone turns Pacred's blind front door into a seen one** —
> it ingests the LINE chat, stores both sides, builds the customer-360, and
> surfaces the conversation inside the admin. Sibling docs use an "IO-1 / IC-1"
> first phase; this is **CI-1** (Customer Intelligence, phase 1).

### 6.1 What CI-1 delivers

An inbound LINE message is **auto-ingested** (signature-verified) into a
`line_messages` row; a `line_conversations` thread is found-or-created; a
`customer_profiles` 360-record is found-or-created from the LINE profile
(display name, avatar, OA-add channel, first-contact date); the assigned sales
rep is **notified**; and staff can open **`/admin/customers/[id]`** to read the
**full conversation outside the LINE app**, see the 360 fields, and judge the
deal. CI-1 includes the *capture* of staff replies (so "who answered" is
recorded) — replying *from* the admin is a small Stage-2 polish (§7.4); CI-1's
floor is **see everything**.

### 6.2 Schema — the three CI-1 tables

#### `customer_profiles` — the customer-360 record

Migration `<NNNN>_customer_profiles.sql` (§5.1 — number TBD/coordinated).

**Why a new table, not a column-add to `profiles`?** (the rigorous case)

| Criterion | `profiles` is… | `customer_profiles` is… | Verdict |
|---|---|---|---|
| Existence | one row **per authenticated `auth.users`** — exists only after signup | exists from **first LINE/web contact** — *before* any signup | different lifecycle |
| Subject | a *registered customer* (login, member code, KYC) | a *lead or customer* — the superset, may never register | different scope |
| Source | created by the auth signup flow | created by the **LINE webhook** / the behaviour tracker | different origin |
| Cardinality | 1:1 with `auth.users` | 1:1 with a *human* — links to `profiles` when one exists, else stands alone | different key |
| Churn | stable, slow-changing identity | accretes touch-counts, last-seen, outcome — high-write | different shape |

Forcing the 360 into `profiles` would mean every lead needs a fake
`auth.users` row (wrong + a security surface), and `profiles` — a KYC-grade
identity table — would carry lead-funnel churn. **`customer_profiles` is its
own table, with an *optional* `profile_id` FK that binds it to `profiles` the
moment the lead registers.** One-to-one, nullable, the bridge.

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | the 360 id |
| `profile_id` | uuid → profiles(id), **nullable, unique** | the bridge — set when the lead registers; null for a pure lead |
| `line_user_id` | text, unique (partial) | the LINE Messaging-API user id — the join key to `line_conversations`; nullable (a pure web lead has none) |
| `display_name` | text | the LINE display name (or a name from a form) — *"ชื่อ"* |
| `avatar_url` | text | the LINE profile picture URL — *"โปรไฟล์"* |
| `first_channel` | text CHECK | **how they first arrived** — `line_oa` · `web_organic` · `web_google_ads` · `web_facebook_ads` · `web_direct` · `referral` · `walk_in` — *"ช่องทางไหน"* |
| `first_seen_at` | timestamptz not null default now() | **first-ever contact** — *"ทักครั้งแรกเมื่อไหร่"* |
| `oa_added_at` | timestamptz | when they added the LINE OA (from the webhook `follow` event) — *"เพิ่ม OA วันไหน"*; nullable |
| `last_seen_at` | timestamptz | most recent activity of any kind |
| `message_count` | int not null default 0 | total inbound messages across all conversations — *"ส่งกี่ข้อความ"* |
| `lifecycle_stage` | text CHECK | `lead` → `engaged` → `customer` → `dormant` — the customer-journey stage |
| `lead_score` | int default 0 | a simple 0-100 score (Stage 4 fills the rule — §9.3); 0 until then |
| `assigned_admin_id` | uuid → profiles | the sales rep who **owns** this customer — nullable until assigned |
| `tags` | text[] | free staff tags (`vip`, `china-route`, `fcl`, …) — operational, not load-bearing |
| `notes` | text | a free internal note field |
| `pdpa_erased_at` | timestamptz | set when a PDPA erasure runs (§6.6) — the row is tombstoned, PII columns nulled |
| `created_at` / `updated_at` | timestamptz | `updated_at` via the existing `set_updated_at()` trigger |

**Indexes:** `(line_user_id)` partial-unique (webhook join), `(profile_id)`
partial-unique (the bridge), `(assigned_admin_id, last_seen_at desc)` (a rep's
customer list), `(lifecycle_stage, last_seen_at desc)`, `(first_channel)`
(attribution rollup).

#### `line_conversations` — the conversation thread + outcome

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `customer_profile_id` | uuid → customer_profiles(id) not null | whose conversation |
| `line_user_id` | text not null | the LINE user (denormalised for the webhook fast-path) |
| `channel` | text CHECK | `line_oa` (room for `line_group` later) |
| `status` | text CHECK | `open` · `snoozed` · `closed` — the *handling* state |
| `outcome` | text CHECK | **did the sale close** — `pending` → `engaged` → `won` → `lost` — *"ปิดการขายได้ไหม"* |
| `outcome_reason` | text | why `lost` / what `won` — required when `outcome IN ('won','lost')` (CHECK) |
| `assigned_admin_id` | uuid → profiles | **which staff member owns this conversation** — *"ใครตอบ"* |
| `first_inbound_at` | timestamptz | first customer message — the response-time numerator base |
| `first_response_at` | timestamptz | first staff reply — for the response-time KPI |
| `last_message_at` | timestamptz | most recent message either way |
| `inbound_count` / `outbound_count` | int default 0 | message tallies |
| `linked_order_ref` | text | optional — a `service_order` / `forwarder` ref if the chat produced an order (the "won" evidence) |
| `created_at` / `updated_at` | timestamptz | |

**Consistency CHECKs (fail-closed — the `work_items` / `contact_messages`
posture):** `outcome IN ('won','lost')` ⇒ `outcome_reason` NOT NULL;
`first_response_at >= first_inbound_at` when both set; `outbound_count >= 1`
⇒ `assigned_admin_id` NOT NULL (someone replied ⇒ someone owns it).

**Indexes:** `(assigned_admin_id, last_message_at desc)` (a rep's inbox),
`(status, last_message_at desc)` (the open-conversations queue),
`(outcome)` (the close-rate rollup), `(customer_profile_id)`.

#### `line_messages` — both sides of the chat

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `conversation_id` | uuid → line_conversations(id) not null | |
| `line_message_id` | text, unique (partial) | the LINE-side message id — **the idempotency key** (a redelivered webhook = the same id = no duplicate row) |
| `direction` | text CHECK | `inbound` (customer) · `outbound` (staff) — **the "both sides" requirement** |
| `sender_admin_id` | uuid → profiles | **which staff member sent it** — set for `outbound`; null for `inbound` — *"ฝั่งพนักงาน — ใครตอบ"* |
| `message_type` | text CHECK | `text` · `image` · `sticker` · `file` · `location` · `other` |
| `text` | text | the message text (null for non-text types) |
| `media_url` | text | for image/file — the LINE content id or a re-hosted URL; nullable |
| `sent_at` | timestamptz not null | the LINE event timestamp (inbound) / send time (outbound) |
| `raw` | jsonb | the raw LINE event object — kept for replay/debugging; **PII-bearing, RLS-locked** |
| `created_at` | timestamptz | ingest time |

**Indexes:** `(conversation_id, sent_at)` (render a thread in order),
`(line_message_id)` partial-unique (idempotency), `(direction, sent_at desc)`.

**RLS — staff-only, the §3.4 boundary, on all three tables:**
- SELECT — `using (public.is_admin())` — any admin reads (the sales team, ก๊อต,
  the owner); writes via service-role (the webhook uses `createAdminClient()`).
  *No customer-facing SELECT policy* — a customer never reads these tables.
- A *finer* role scope (a rep sees only `assigned_admin_id = self`) is a
  Stage-2 tightening (§7) — CI-1 ships the staff-wide read, the `/admin/kpi`
  posture.

### 6.3 The LINE webhook — the inbound rail

**`app/api/webhooks/line/route.ts`** — the single most important new file. Note
`app/api/webhooks/` **does not exist today** — CI-1 creates the directory **with
signature verification baked in** (the same directory + the same hardening the
observability doc's Sentry-webhook needs; whichever ships first builds it,
the other reuses).

| Step | What it does |
|---|---|
| 1. **Verify** | LINE signs every webhook with `X-Line-Signature` = base64(HMAC-SHA256(body, `LINE_CHANNEL_SECRET`)). The route recomputes + compares; a mismatch → `401`, no processing. **Closes the open-webhook leak class by construction.** |
| 2. **Parse events** | a LINE webhook body is `{ destination, events: [...] }`. CI-1 handles: `message` (an inbound chat — the core), `follow` (the customer **added the OA** → set `customer_profiles.oa_added_at` + `first_channel='line_oa'`), `unfollow` (they blocked the OA → mark `lifecycle_stage='dormant'`). Other event types are stored raw + ignored. |
| 3. **Resolve the customer-360** | from the event's `source.userId` (the `line_user_id`): find-or-create the `customer_profiles` row. On *create*, call the LINE **Get-Profile API** (`GET /v2/bot/profile/{userId}` — same `LINE_CHANNEL_ACCESS_TOKEN` as push) to fetch `display_name` + `avatar_url`. **`first_seen_at` = now, `first_channel = 'line_oa'`.** |
| 4. **Resolve the conversation** | find-or-create the open `line_conversations` row for that customer; set `first_inbound_at` if it is the first inbound. |
| 5. **Insert the message** | a `line_messages` row, `direction='inbound'`, the `line_message_id` as the idempotency key (a redelivered webhook upserts to the same row — no dup). Bump `customer_profiles.message_count`, `last_seen_at`, `conversation.inbound_count` / `last_message_at`. |
| 6. **Notify the rep** | `sendNotification(assignedRepProfileId, { category:'line_inbound', title:'💬 ลูกค้าทักมา', body:<preview>, link_href:'/admin/customers/<id>', reference_type:'line_conversation', reference_id:<convId> })` — rides the **shipped** notification pipeline (LINE push + email). If no rep is assigned yet → notify the `sales_admin` pool. |
| 7. **Respond fast** | the route returns `200` **immediately** after the cheap inserts — LINE requires a fast webhook ack; the Get-Profile call (step 3, on first-contact only) is the only external call and is `try/catch`-guarded so a LINE-API hiccup never fails the ack. |

> **Why ingest into Pacred when the chat is already in the LINE OA app?** The
> LINE app shows the chat — but it has **no customer-360, no per-sales KPI, no
> outcome field, no cross-channel unification, and the data is not queryable.**
> The lead's ask is explicit: read + analyse the chat *"นอกแอป LINE"* — inside
> Pacred, beside everything else Pacred knows about the customer. The webhook
> is the rail; the Pacred tables are the system of record.

### 6.4 Unifying a web lead and a LINE lead — the same person, two doors

`contact_messages` (§2.3) already captures **web** leads. A web lead and a LINE
lead are frequently **the same human**. CI-1's find-or-create logic unifies
them where it safely can:

- A `contact_messages` submission with a `profile_id` (a signed-in user used the
  form) → the `customer_profiles` row is found via `profile_id`.
- A `contact_messages` submission whose `contact` field is a phone/email that
  *matches* a known `customer_profiles`/`profiles` contact → linked.
- Otherwise the web lead is its own `customer_profiles` row (`first_channel`
  from the `source_url` / GA4 channel) — and a staff member can **manually
  merge** two 360-records later (a Stage-2 admin action — §7.4) if they turn out
  to be one person. **CI-1 does not auto-merge on weak signals** — a wrong merge
  is worse than two rows; merge is a deliberate, logged staff action.

The principle: **one human = one `customer_profiles` row, eventually** — reached
by safe automatic links + a deliberate manual merge, never by a fragile guess.

### 6.5 The admin chat-preview — `/admin/customers` + `/admin/customers/[id]`

A new admin route group — **same shape as the shipped `/admin/audit` /
`/admin/kpi`** (CI-1 reuses their layout grammar — filter form + list +
detail):

- **`/admin/customers`** — the customer list: each row = display name + avatar ·
  `first_channel` badge · `lifecycle_stage` · `message_count` · `last_seen_at` ·
  the assigned rep · the conversation `outcome`. Filters: by channel, stage,
  rep, outcome, date.
- **`/admin/customers/[id]`** — **the customer-360 view**, the headline surface:
  - the **360 panel** — display name, avatar, *"เพิ่ม OA วันไหน"* (`oa_added_at`),
    *"ทักครั้งแรก"* (`first_seen_at`), *"ช่องทาง"* (`first_channel`),
    *"ส่งกี่ข้อความ"* (`message_count`), lifecycle stage, the assigned rep, tags,
    notes;
  - the **chat preview** — the full `line_messages` thread rendered in order,
    **inbound left / outbound right**, each outbound message labelled with the
    `sender_admin_id` ("ตอบโดย: ภูม") — the conversation read *"นอกแอป LINE"*;
  - the **outcome controls** — set `outcome` (`engaged` / `won` / `lost`),
    `outcome_reason`, assign/re-assign the rep;
  - (Stage 3) the **behaviour panel** beside it — the customer's web-behaviour
    trail (§7.3);
  - `export const dynamic = "force-dynamic"` — a dynamic `[param]` route reading
    cookies/auth — the [AGENTS.md](../../AGENTS.md) §11 rule.
- **RBAC** — read = `requireAdmin()` (any admin — the sales team + ก๊อต + the
  owner); the **outcome / assignment write actions** = `requireAdmin(["super",
  "sales_admin","sales"])` — the sales roles. `logAdminAction` on every write.
  *Floor roles* (`driver`, `warehouse`) — gated out, the `/admin/kpi` precedent.
- **Nav** — a new `admin-sidebar.tsx` entry, a "ลูกค้า / Customers" group.

### 6.6 The PDPA path — erase / export

Because CI-1 holds customer PII (§3.4), it ships the data-subject path from day
one — small but non-negotiable:

- **Export** — an admin action assembles a customer's `customer_profiles` +
  `line_messages` + `contact_messages` into a JSON/CSV the customer can be sent
  on request.
- **Erase** — an admin action sets `customer_profiles.pdpa_erased_at`, **nulls
  the PII columns** (`display_name`, `avatar_url`, `notes`, message `text` +
  `raw`), and keeps only the non-PII skeleton (timestamps, counts, the channel)
  so KPIs do not break. A tombstone, not a hard delete — auditable, the house
  posture. Logged via `logAdminAction`.

### 6.7 CI-1 deliverables + effort

| # | Deliverable | Reuses |
|---|---|---|
| CI-1.1 | Migration `<NNNN>_customer_profiles.sql` — the 360 table + CHECKs + indexes + staff-only RLS | `is_admin()`, `set_updated_at()` |
| CI-1.2 | Migration `<NNNN>_line_conversations.sql` — `line_conversations` + `line_messages` + CHECKs + indexes + RLS | `is_admin()`, the `work_items` constraint posture |
| CI-1.3 | Migration ALTER — `+'line_inbound'` to the `notifications.category` CHECK + `lib/notifications/types.ts`; `+'line_conversation'` to `NotifyReferenceType` | the `0014` notifications schema |
| CI-1.4 | `app/api/webhooks/line/route.ts` — signature-verified ingest + the `app/api/webhooks/` dir | net-new (closes the open-webhook gap); `createAdminClient()` |
| CI-1.5 | `lib/line/` — the inbound helpers: signature verify, event parse, the Get-Profile API client | the existing `sendLinePush()` pattern + `LINE_CHANNEL_*` env |
| CI-1.6 | `lib/customer-360/resolve.ts` — find-or-create `customer_profiles` + `line_conversations` (idempotent, the `ensure_work_item()` pattern) | the find-or-create idiom |
| CI-1.7 | `actions/admin/customers.ts` — `assignRep` · `setOutcome` · `mergeCustomers` (stub for CI-2) · `exportCustomerData` · `eraseCustomerData`; `logAdminAction` | `actions/admin/*` patterns, `logAdminAction` |
| CI-1.8 | `/admin/customers` list + `/admin/customers/[id]` 360 + chat-preview page | `/admin/audit` + `/admin/kpi` layout grammar |
| CI-1.9 | The rep-alert wiring (new inbound → `sendNotification`) | the shipped `sendNotification()` pipeline |
| CI-1.10 | i18n th/en for all new strings (the 360 labels, the chat-preview, the outcome controls) | `pnpm audit:i18n` gate |

**Effort: M–L** — two table migrations + one ALTER, one webhook route + its
helper module, one find-or-create module, one action file, one admin route group
(list + detail). M-leaning-L because the webhook (signature verification, event
parsing, the Get-Profile call, idempotency) is the one genuinely-new piece of
infrastructure; everything else **rides** the notification pipeline, the
`is_admin()` RLS, the `/admin/audit` UI grammar, and the find-or-create idiom.

**Dependency:** the LINE webhook URL must be **registered in the LINE Developers
console** (channel `2009931373`) + the OA "Use webhook" toggle on, "Auto-reply
messages" off — a ~10-min ก๊อต/เดฟ console action (§4 pre-requisite note). The
`LINE_CHANNEL_SECRET` + `LINE_CHANNEL_ACCESS_TOKEN` **already exist** (ADR-0001) —
no new credential. CI-1 is otherwise self-contained.

---

## 7. Stage 2 + Stage 3 — per-sales KPIs, channel attribution, web behaviour

### 7.1 Stage 2 (CI-2) — per-sales KPIs + channel attribution

> Once CI-1 makes the *conversation* visible, CI-2 makes the *sales performance*
> visible. Effort: **M**.

**The per-sales KPIs** — built **through the `audit-kpi-dashboard` skill** (§2.6),
each a `v_kpi_*` view (the rollup pattern the observability doc establishes —
*reused, not re-designed*):

| KPI | Classify | Definition |
|---|---|---|
| **Close rate per rep** | rate | `count(outcome='won') / count(outcome IN ('won','lost'))` per `assigned_admin_id`, per period |
| **First-response time per rep** | duration | `avg(first_response_at − first_inbound_at)` per rep — the "ตอบเร็วแค่ไหน" number |
| **Conversations handled per rep** | count | `count(line_conversations)` per `assigned_admin_id`, per period |
| **Won-revenue per rep** | count/value | sum of the `linked_order_ref` order values where `outcome='won'` |
| **Channel attribution** | composition | `count(customer_profiles)` grouped by `first_channel` — *"ลูกค้ามาจากช่องทางไหน"* — and won-rate per channel |

**The sales-performance panel** — `/admin/customers/sales-kpi` (or a tab of
`/admin/kpi`): a table of reps × the KPIs above + a channel-mix chart. RBAC:
`requireAdmin(["super","sales_admin"])` — sales management; a rep can see
*their own* numbers. This is the lead's *"วัดผลทีมขาย."*

**The `customer_touchpoints` attribution trail** — migration
`<NNNN>_customer_touchpoints.sql`: an append-only row per *touch* — `(customer_
profile_id, channel, touch_type, occurred_at, meta jsonb)`. `touch_type` ∈
`first_seen` · `line_message` · `web_visit` · `contact_form` · `signup` ·
`order`. This upgrades `first_channel` from a single guess to an
**event-sourced trail** — first-touch *and* last-touch attribution become
computable, and on signup the trail **populates `profiles.referral_channel`**
(closing the §2.2 gap). It also feeds the observability doc's
`v_marketing_funnel` with per-customer attribution — **the two systems join
here, neither duplicates** (§9.1).

**CI-2 also ships the polish** CI-1 deferred: **reply-from-admin** (a staff
reply box on `/admin/customers/[id]` that calls the existing `sendLinePush()` +
records the `outbound` `line_messages` row with `sender_admin_id` = the replying
staff — so the rep never leaves Pacred to answer), **realtime** on the inbox
(Supabase Realtime — new messages appear without refresh), the **manual
customer-merge** action, and the **finer per-rep RLS** scope.

### 7.2 Stage 3 (CI-3) — the in-house web-behaviour tracker

> **The honest framing — read this first.** Microsoft Clarity (ADR-0007,
> wired, free) **already does** click tracking, scroll-depth heatmaps,
> rage-clicks, session replay, and exit detection. **CI-3 does NOT rebuild
> any of that.** CI-3 builds **only the piece Clarity structurally cannot**:
> tying behaviour to **Pacred's own customer-360**, anchoring an anonymous
> visitor on **IP**, and surfacing the trail **in the admin beside the 360**.
> The verdict is: **connect Clarity for the rich free X; build the thin
> in-house Y.** Effort: **M**.

**What Clarity gives (CONNECT — free):** the heatmap of where everyone clicks,
the scroll-depth distribution, rage-click detection, the session *recording* you
can watch, aggregate exit pages. The team uses the **Clarity dashboard** for all
of that. CI-3 does not touch it — it is a switched-on rail.

**What Clarity cannot do (BUILD — the in-house Y):**

| Clarity limitation | The in-house piece |
|---|---|
| Clarity sessions are *anonymous Clarity ids* — not joinable to a Pacred `customer_profiles` row | a `visitor_sessions` row keyed to **the Pacred visitor identity** — and, on auth, to the `profiles` id |
| No IP anchor — Clarity does not expose per-IP identity to *your* DB | the IP-anchored visitor fingerprint (the lead's "1 IP ≈ 1 customer") |
| Clarity data lives **in Clarity** — not queryable in the admin next to the customer-360 | `visitor_events` in Pacred's DB — surfaced on `/admin/customers/[id]` |
| Clarity cannot answer *"this **named customer** priced an FCL and left"* | the in-house log can — because it is keyed to the customer record |

**The schema** — migration `<NNNN>_visitor_tracking.sql`:

- **`visitor_sessions`** — `(id, visitor_id, ip, ip_hash, user_agent, profile_id
  nullable, customer_profile_id nullable, first_channel, landing_url, referrer,
  utm jsonb, started_at, ended_at, last_button_label, exit_url, exit_scroll_pct,
  page_count)`. The **visitor identity** = `visitor_id` (the `pacred_vid`
  first-party cookie that `proxy.ts` *already* sets — ADR-0007 — *reuse it, do
  not invent a cookie*) **+ `ip_hash`** (a salted hash of the IP — the "1 IP ≈ 1
  customer" anchor, hashed so the raw IP is not the key). `profile_id` /
  `customer_profile_id` are **null while anonymous, set on auth** — the
  pseudonymous→identified upgrade (§3.4).
- **`visitor_events`** — append-only `(id, session_id, event_type, target,
  scroll_pct, occurred_at, meta jsonb)`. `event_type` ∈ a small fixed
  vocabulary: `page_view` · `click` · `scroll_milestone` (25/50/75/100 %) ·
  `cta_click` · `form_start` · `form_submit` · `exit`. The **`exit` event
  carries `scroll_pct` + the `last_button_label`** — the lead's literal
  *"ออกตรงไหน + ปุ่มสุดท้ายที่กด"*.

**The ingest rail** — `app/api/track/route.ts` + a tiny client beacon:
- a small `"use client"` script (mounted in `app/layout.tsx` beside the existing
  Clarity/GTM scripts) listens for clicks, scroll milestones, and the
  `visibilitychange`/`beforeunload` exit, and `POST`s a compact event batch to
  `/api/track` using `navigator.sendBeacon` (survives the page unload — the only
  reliable way to capture the *exit* event).
- the route resolves the `visitor_sessions` row by `visitor_id` cookie, appends
  the `visitor_events`, updates the session's `last_button_label` / `exit_url` /
  `exit_scroll_pct`. **Rate-limited** (reuse `lib/rate-limit.ts`) so a hostile
  client cannot flood it. **No PII** in the event payload — a `target` is a CSS
  selector / a button label, never a form value.
- on a `form_submit` of the contact form / on signup, the session's
  `profile_id` + `customer_profile_id` get linked — and the session's behaviour
  becomes part of **that customer's 360**.

**The behaviour panel** — on `/admin/customers/[id]`, beside the 360 + the chat:
a compact timeline of the customer's `visitor_sessions` — pages viewed, the CTAs
clicked, the scroll depth reached, **where they exited and the last button they
pressed**. For a *named* customer this is the thing Clarity cannot show. For an
*anonymous* visitor, a separate `/admin/customers/visitors` list shows the
IP-anchored sessions (a lead a rep can try to identify).

> **Honesty on the IP anchor.** §3.4's note holds: `ip_hash` + the visitor
> cookie together are a *probable* visitor, not a certainty (NAT/CGNAT/dynamic
> IP). CI-3 treats it as a useful seed and upgrades to certainty on auth/form
> submit. The design does **not** claim IP = identity; it claims IP = *a
> reasonable join hint until something better arrives*.

### 7.3 Stage 3 — wiring CI-3 into the customer-360

When a `visitor_session` links to a `customer_profiles` row (on auth / form
submit), the session's `first_channel` + `utm` **feed `customer_touchpoints`**
(§7.1) and reconcile the 360's `first_channel`. The web-behaviour log and the
LINE chat then sit side-by-side on the *same* `/admin/customers/[id]` page — the
full *"รู้จักลูกค้าทุกอย่าง"*: what they said on LINE **and** what they did on
the web, one screen.

### 7.4 Stage 2 + 3 deliverables + effort

CI-2: the `v_kpi_sales_*` views + the sales-performance panel + the
`customer_touchpoints` migration + reply-from-admin + realtime + manual-merge +
the finer RLS. **Effort: M.** CI-3: the `visitor_tracking` migration + the
`/api/track` route + the client beacon + the behaviour panel + the
session→customer linking. **Effort: M.** Both ride existing infrastructure (the
`v_kpi_*` pattern, `sendLinePush()`, the `pacred_vid` cookie, `lib/rate-limit.ts`).

### 7.5 The `visitor_events` ÷ `platform_events` rule (no double-build)

The observability doc owns `platform_events` (the unified cross-surface log, for
*platform* KPIs + the *aggregate* funnel). This doc owns `visitor_events` (the
*per-customer* behaviour trail). **The rule:**

- a low-level behaviour event (a `click`, a `scroll_milestone`) → `visitor_events`
  **only** — it is customer-behaviour detail, not platform-notable.
- a *funnel-grade* event (`signup_completed`, `lead_submitted`, `order_placed`)
  → emits **both**: a `platform_events` row (for the observability doc's
  `v_marketing_funnel` aggregate count) **and** a `customer_touchpoints` row
  (for *this* customer's attribution trail).
- the two logs are **siblings with different grains** — `platform_events` is
  *broad + low-detail + aggregate*; `visitor_events` is *deep + per-customer*.
  Neither is the other; the funnel events are the deliberate, small overlap.

This is the same discipline §2.7 sets: one event, two purposes, two owners,
**no duplicated table**.

---

## 8. Build phases — summary

| Stage | Scope | Headline deliverable | Tables | Reuses | Effort | Dependencies |
|---|---|---|---|---|---|---|
| **CI-1 (MVP)** | LINE webhook ingest + chat store + customer-360 + the admin chat-preview | the blind LINE front door becomes **seen** — read the chat in-admin, both sides, who answered | `customer_profiles` · `line_conversations` · `line_messages` (+ a notifications ALTER) | `is_admin()`, `sendNotification()`, `sendLinePush()` (reply), `/admin/audit` UI grammar, find-or-create idiom, `LINE_CHANNEL_*` env | **M–L** | the LINE webhook URL registered in the LINE console (~10 min); `LINE_CHANNEL_SECRET` already exists |
| **CI-2** | per-sales KPIs + channel attribution + reply-from-admin + realtime + merge | "วัดผลทีมขาย" — close rate, response time, channel mix | `customer_touchpoints` + `v_kpi_sales_*` views | the `audit-kpi-dashboard` skill, the `v_kpi_*` rollup pattern (from the observability doc), `sendLinePush()`, Supabase Realtime | **M** | CI-1 |
| **CI-3** | the in-house IP-anchored web-behaviour tracker (complements Clarity) | "คลิกตรงไหน เลื่อนไปไหน ออกตรงไหน — ปุ่มสุดท้าย" tied to the customer record | `visitor_sessions` · `visitor_events` | the `pacred_vid` cookie (ADR-0007), `lib/rate-limit.ts`, the customer-360 from CI-1 | **M** | CI-1; **Clarity switched on** (the free rail it complements) |
| **CI-4** | the unified CI dashboard + Meta CAPI relay + lead scoring | the whole picture + ad-spend measurable + a lead score | (reuses; maybe a small `lead_score_rules` config) | the GTM container + the Meta Pixel, the `v_kpi_*` views, the customer-360 | **M–L** | CI-1/2/3; the Meta Pixel added to GTM; a Meta ad-account + CAPI access token |

**Total** ≈ a substantial multi-phase build, but **each stage is independently
shippable** and **rides existing infrastructure**. **CI-1 alone** delivers the
lead's sharpest ask — the LINE chat *inside Pacred* + the customer-360 — and is
**M–L effort**. Sequence by the post-launch lens ([AGENTS.md](../../AGENTS.md)
§2): CI-1 first (it makes the *acquisition channel* visible — directly "more
*true*, more *measurable*"); CI-2 next (sales performance — "more *billable*");
CI-3 (the web-behaviour depth); CI-4 last (the unifying + ad-measurement layer).

---

## 9. The Meta + measurement question — *"meta กับ ระบบ claude วัดผลยังไง"*

The lead asked, directly, how **Meta** and the **Claude agent system** measure
and work. Answered here, concisely — this is documentation, not a build spec.

### 9.1 Meta — how ad measurement works (the Pixel + the Conversions API)

**The problem Meta measurement solves.** Pacred runs (or will run) Facebook /
Instagram ads. An ad costs money per click. The question — *"did that click
become a lead? a booking? how much did each acquired customer cost?"* — is
unanswerable unless the **conversion** is reported *back to Meta*. Meta also
*needs* that signal to **optimise** the ad delivery (its algorithm learns "show
this ad to people like the ones who converted").

**The two halves of Meta measurement:**

| Half | What it is | How it works for Pacred |
|---|---|---|
| **The Meta Pixel** (browser-side) | a JS snippet on the website; fires standard events — `PageView`, `Lead`, `Purchase` — from the *visitor's browser* | **CONNECT it via the already-wired GTM container** — ADR-0007 built GTM explicitly to "carry the future Meta Pixel." Adding the Pixel is a **GTM-UI action** (a new tag), *not* a code deploy. The Pixel's `Lead` event fires when a visitor submits `ContactForm`; `Purchase` when an order is placed. |
| **The Conversions API (CAPI)** (server-side) | a server-to-server `POST` from Pacred's backend to Meta, reporting the *same* conversion — independent of the browser | **BUILD a thin relay** — a server route that, when a real Pacred conversion happens (a `contact_messages` insert, a `service_order` placed), `POST`s the event to Meta's CAPI with a **SHA-256-hashed** email/phone (CAPI matches on hashed identifiers — never raw PII, §3.4). |

**Why both?** The browser Pixel alone is **lossy** — ad-blockers, iOS tracking
restrictions, and Safari ITP block a large share of Pixel fires. CAPI is the
**server-side backstop**: it reports the conversion *even when the Pixel was
blocked*. Meta de-duplicates the two by a shared `event_id`. Pixel + CAPI
together = the accurate conversion count Pacred's ad spend is measured against.

**How it ties to the channel-attribution above.** A customer-360 with
`first_channel='web_facebook_ads'` *is* the conversion Meta should get credit
for. The CAPI relay reports that conversion; Meta then computes **cost-per-lead**
and **ROAS** (return on ad spend) for the Facebook channel — and Pacred's own
`customer_touchpoints` attribution trail (§7.1) is the **internal** mirror of
the *same* fact. The observability doc's `v_marketing_funnel` rollup (§2.7)
consumes the aggregate; CI-2's attribution trail holds the per-customer detail;
the Meta CAPI relay reports it back to Meta. **Three views of one conversion —
internal funnel, per-customer record, Meta's ledger — and they agree because
they read the same event.**

**Where it sits in the stages.** The Meta Pixel = a **CI-4** connect (a GTM
tag); the CAPI relay = a **CI-4** build (the thin server route). It depends on
CI-1/2 (the conversion + the attribution must exist first) and on a Meta
ad-account + a CAPI access token (a ก๊อต/เดฟ setup, like the env-var flip).

### 9.2 Claude / the agent system — how the team's agent output is measured

The team builds Pacred with **Claude Code agents** working async on worktree
branches (the CLAUDE.md / `docs/team.md` model). "How is *that* measured?" —
briefly:

- **The unit of measurement is what *ships*.** A Claude agent's output is
  **commits merged + PRs landed + the feature working in production** — visible
  in `git log`, the `dave` integration branch, the `dave→main` deploys. An
  agent that produced a doc that no build consumed produced nothing measurable;
  an agent whose code is live did.
- **The quality gate is the `phase-verify-loop`.** [AGENTS.md](../../AGENTS.md)
  §9 / `.claude/skills/phase-verify-loop/SKILL.md` — every phase closes with an
  assume→check→verify→analyze→fix loop; "did every gate go green" is the
  pass/fail signal. The **production smoke gate** (§11) is the harder check —
  did the shipped code actually render in prod.
- **The team-process KPIs are surfaced by the `audit-kpi-dashboard` skill.**
  That skill's own description lists *"sprint velocity, push frequency,
  integration cycle health"* as team-process KPIs it generates. So agent output
  *is* a measurable KPI stream — commits/week, push frequency (the save-points
  rule, `docs/team.md` §3.0), integration-cycle health (the
  `branch-integrate-loop` skill) — rendered through the *same* dashboard
  machinery as the business KPIs.
- **The honest distinction from this system.** Meta measures *ad-driven customer
  acquisition*. The Claude-agent measurement measures *engineering throughput*.
  They are **different KPI families** — customer-intelligence + Meta belong to
  this doc; agent-throughput belongs to the team-process KPIs the
  `audit-kpi-dashboard` skill and the observability doc's per-department panels
  cover. They are mentioned together here only because the lead asked them in
  one breath; the *systems* are separate. **This is the brief part the lead
  asked to keep brief.**

### 9.3 Lead scoring (CI-4) — turning the 360 into a "will they buy" number

A small, **transparent, in-house** scorecard (not an ML SaaS) — a weighted sum
over the customer-360 signals: message count, response engagement, web behaviour
(did they reach the calculator? price an FCL?), channel quality, recency. It
yields `customer_profiles.lead_score` (0-100) so the sales team can **prioritise
the hottest leads**. A rule/weight config, not a black box — every point is
explainable. CI-4 scope, low effort.

---

## 10. The end-to-end picture (the headline)

How a customer flows through the finished system — every step mapped to a rail +
the table it writes:

```
 ┌── 1. A CUSTOMER MESSAGES ON LINE ──────────────────────────────────┐
 │  "สนใจส่งของจากจีนค่ะ ราคาเท่าไหร่" — sent to the Pacred LINE OA   │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 2. INGEST — the webhook, no app needed (CI-1) ───────────────────┐
 │  app/api/webhooks/line catches it (signature-verified) →           │
 │  find-or-create customer_profiles (display name + avatar from the  │
 │  LINE Get-Profile API; first_channel='line_oa'; first_seen=now) →  │
 │  find-or-create line_conversations → insert a line_messages row    │
 │  (direction='inbound')                                             │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 3. NOTIFY THE REP (CI-1) ────────────────────────────────────────┐
 │  sendNotification(rep): LINE push + email — "💬 ลูกค้าทักมา"       │
 │  link → /admin/customers/<id>                                      │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 4. THE REP READS IT IN PACRED — outside the LINE app (CI-1) ─────┐
 │  /admin/customers/[id]: the customer-360 panel (เพิ่ม OA วันไหน ·  │
 │  ทักครั้งแรก · ช่องทาง · ส่งกี่ข้อความ) + the chat preview         │
 │  (inbound left / outbound right) — analyse: can this close?        │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 5. THE REP REPLIES + RECORDS THE OUTCOME (CI-1 capture, CI-2 send)┐
 │  reply (sendLinePush) → a line_messages row, direction='outbound', │
 │  sender_admin_id = the rep · first_response_at stamped ·           │
 │  rep sets outcome: engaged → won (+ outcome_reason, linked_order)  │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 6. IT BECOMES A MEASURED NUMBER (CI-2) ──────────────────────────┐
 │  v_kpi_sales_*: this rep's close rate · first-response time ·      │
 │  the customer's first_channel rolls into the channel-attribution   │
 │  report — "ลูกค้ามาจากช่องทางไหน, ปิดได้กี่ %"                     │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 7. THE WEB SIDE JOINS IN (CI-3) ─────────────────────────────────┐
 │  the customer's earlier anonymous web visits — IP-anchored —       │
 │  link to the 360 on signup: clicks, scroll depth, the last button  │
 │  before they left — shown beside the chat. Clarity's heatmap +     │
 │  replay (free rail) cover the aggregate; the in-house log ties it  │
 │  to THIS customer.                                                 │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 8. AD SPEND BECOMES MEASURABLE (CI-4) ───────────────────────────┐
 │  the conversion is reported back to Meta — the Pixel (via GTM) +   │
 │  the CAPI relay (server-side, hashed) → Meta computes cost-per-    │
 │  lead + ROAS for the facebook_ads channel · a lead_score ranks     │
 │  the hottest leads · the unified /admin/customers dashboard shows  │
 │  the whole picture                                                 │
 └────────────────────────────────────────────────────────────────────┘
```

One customer, ingested from LINE with no app needed, unified into a 360 record,
read + analysed + closed inside Pacred, measured into a per-sales KPI, joined to
their web behaviour, and reported back to Meta so the ad that found them is
measurable. That is the system the lead asked for — *"รู้จักลูกค้าทุกอย่าง."*

---

## 11. Risks & guard-rails

| Risk | Guard |
|---|---|
| **PDPA / privacy** — this system holds customer PII (chat, name, behaviour) | §3.4 — a lawful basis (the customer contacted a business), strict staff-only RLS, a pseudonymous web-behaviour half until auth, a deletion/export path (§6.6), hashed identifiers to Meta. PII held *correctly*, not avoided. |
| **The LINE webhook is an open endpoint** — anyone could `POST` fake events | The webhook **verifies the `X-Line-Signature` HMAC** against `LINE_CHANNEL_SECRET` — an unverified body is `401`-rejected before any processing (§6.3). The `app/api/webhooks/` dir is built signature-verified by construction. |
| **Webhook redelivery → duplicate messages** — LINE retries on a slow ack | `line_messages.line_message_id` is a unique idempotency key — a redelivered event upserts to the *same* row, no duplicate (§6.2). The route also acks fast (§6.3 step 7) so retries are rare. |
| **Rebuilding what Clarity already does** — wasted effort on click/scroll/replay | §7.2 is explicit and honest: **CONNECT Clarity** for click/scroll/heatmap/replay/exit; **BUILD only** the IP-anchor + the customer-record tie + the in-admin surface. The build-vs-buy table (§4) draws the line. |
| **"1 IP = 1 customer" is wrong** — NAT, CGNAT, dynamic IPs | §3.4 + §7.2 note — the IP is a *probable* seed, anchored *together* with the `pacred_vid` cookie + UA, and *upgraded to certainty* on auth/form-submit. The design never claims IP = identity. |
| **Duplicate 360 records** — the same human as a LINE lead + a web lead | §6.4 — safe automatic links (matching `profile_id` / contact) + a *deliberate, logged* manual-merge action (CI-2); **no auto-merge on weak signals** — a wrong merge is worse than two rows. |
| **Double-building the marketing funnel** — this doc + the observability doc both touch it | §2.7 + §7.5 + §9.1 — the observability doc owns the *aggregate* `v_marketing_funnel`; this doc owns the *per-customer* trail; funnel events emit to *both* by design. One event, two purposes, **one table each — no overlap.** |
| **Scope creep — this becomes a full marketing-automation suite** | Hard boundary §3.4 — this is a *CRM data layer* + measurement. A campaign sender, an email-blast tool, an ML lead-model — **out of scope.** Lead scoring (§9.3) is a transparent scorecard, not an ML SaaS. |
| **Migration-number collision with ภูม / the sibling owner-systems** | §5.1 — this doc **does not hard-pick numbers**; migrations are named by content; the implementer fixes `NNNN` against live `supabase/migrations/` after a check-in with ภูม (who owns `0073-0079` + `0081`+). |
| **The owner expects it all at once** | The doc is explicit — **CI-1 is the MVP** and alone delivers the LINE-chat-in-Pacred + the customer-360. Stage it; ship CI-1; show the working chat-preview; then CI-2/3/4. ([AGENTS.md](../../AGENTS.md) §2 — "plan work properly; don't ship half-built.") |
| **LINE OA "Auto-reply" eats the webhook** — the OA's built-in auto-reply can intercept messages | The §4 + §6.7 pre-requisite — when registering the webhook, the OA's "Auto-reply messages" must be **off** and "Use webhook" **on**, or the webhook never fires. A console checklist item. |

---

## 12. Open questions for ก๊อต / เดฟ

1. **Migration numbers.** §5.1 — this system needs ~4 migrations. ภูม owns
   `0073-0079` + `0081`+; `0080` is taken. Confirm the block — and reconcile it
   with the other owner-system docs in one pass (a เดฟ-reserved range, like
   `0080` was, would be cleanest).
2. **LINE webhook console setup.** §6.7 — registering the webhook URL +
   toggling "Use webhook" on / "Auto-reply" off in the LINE Developers console
   (channel `2009931373`) is a ~10-min ก๊อต/เดฟ action. Confirm who owns it and
   when — it is CI-1's one external dependency.
3. **One OA channel or split Login + Messaging.** ADR-0001 reserved
   `LINE_LOGIN_CLIENT_ID/SECRET` for a *Login* channel (still mocked,
   `docs/setup/line.md`); the Messaging API uses `LINE_CHANNEL_*`. CI-1 needs
   only the **Messaging** channel — but confirm the OA channel id `2009931373`
   is the Messaging channel and the access token is current.
4. **Reply-from-admin timing.** §7.1 — CI-1 *captures* staff replies; replying
   *from* the admin (vs. the rep still using the LINE app + CI-1 just recording
   it) is slated for CI-2. Confirm: is reply-from-admin wanted *in* the MVP, or
   is CI-1's "see + record" floor enough for the first ship?
5. **Customer-merge policy.** §6.4 — auto-link only on strong signals
   (`profile_id` / exact contact match); a manual merge for the rest. Confirm
   the team is comfortable that two 360-rows for one human is acceptable until a
   staff member merges them (the alternative — aggressive auto-merge — risks
   merging two *different* people).
6. **The Meta CAPI — when.** §9.1 — the Meta Pixel is a CI-4 GTM-tag connect;
   the CAPI relay is a CI-4 build needing a Meta ad-account + a CAPI token.
   Confirm Pacred has (or will have) a Meta Business / ad account so CI-4's Meta
   half is not blocked.
7. **Behaviour-tracker retention.** §7.2 — `visitor_events` is high-volume.
   Recommend a pruning cron (raw events 90d; the rolled-up session summary
   kept longer). Confirm with the owner's record-keeping preference — and align
   it with the observability doc's `platform_events` retention answer (Q7 there).
8. **`referral_channel` reconciliation.** §2.2 + §7.1 — `profiles.
   referral_channel` is an existing single field; CI-2's `customer_touchpoints`
   is the richer event-sourced trail. Confirm CI-2 *populates*
   `referral_channel` from the trail on signup (keeping the existing field as a
   denormalised convenience) rather than deprecating it.

---

## 13. Cross-references

- 🔭 **The SIBLING — platform-observability** (this doc watches the *customer*;
  that one watches the *platform's health* — shared substrate, shared `v_kpi_*`
  + RLS patterns; the marketing-funnel division is §2.7 / §7.5 / §9.1) →
  [`platform-observability-system-2026-05-18.md`](platform-observability-system-2026-05-18.md)
- 🧭 The build-vs-buy master synthesis (เดฟ's locked principle) →
  [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md)
- 📈 The find→convert→buy chain — this doc instruments its *convert* step →
  [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md)
- 🚀 The post-launch roadmap — where the CI stages schedule →
  [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) (Phase 2 — the owner systems)
- 🔔 ADR-0001 — LINE Notify → Messaging API; the LINE *push* this doc's webhook
  ingest is the inbound twin of → [`../decisions/0001-line-notify-replacement.md`](../decisions/0001-line-notify-replacement.md)
- 📊 ADR-0007 — the GTM/GA4/Clarity decision; GTM as the Meta-Pixel carrier;
  the `pacred_vid` visitor cookie CI-3 reuses → [`../decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md)
- 🔐 ADR-0002 — `is_admin()` + the `admins` role model the staff-only RLS builds
  on → [`../decisions/0002-admin-architecture.md`](../decisions/0002-admin-architecture.md)
- 💬 The legacy sales/lead-ownership failures this system structurally cures →
  [`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md)
- 🛠 The `audit-kpi-dashboard` skill — the method the per-sales KPIs (CI-2) are
  built through; also the team-process-KPI source for §9.2 →
  [`../../.claude/skills/audit-kpi-dashboard/SKILL.md`](../../.claude/skills/audit-kpi-dashboard/SKILL.md)
- 📋 The env-var flip that activates Clarity/GA4 (CI-3's free rail) →
  [`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md)
- 🗄 Migration runbook → [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md)
- 🛑 Don't scrub PCS/TTP/MOMO partner refs early — the brand-split is in progress
  → [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)
- 🏢 The company DNA — LINE OA `2009931373` as the primary channel, the
  ecosystem scope → [`../../CLAUDE.md`](../../CLAUDE.md)

**End of design.** Pacred's LINE integration today is **outbound-only** — it can
push to a customer but cannot hear them; `app/api/` has no webhook. The
customer-360 — *"รู้จักลูกค้าทุกอย่าง"* — does not exist; a LINE lead is a
stranger in a chat. Clarity does click/scroll/replay/exit but is switched off
and its data is not in Pacred. This doc designs the **customer-intelligence
system** as four additive stages on Pacred's existing structure. **MVP CI-1** —
the **LINE Messaging API webhook** (signature-verified — closing the
open-webhook gap by construction), the **chat store** holding *both sides* + the
answering staff + the `won/lost` outcome, the **customer-360 record** (channel,
OA-add date, first-contact, profile, message count), and the **in-admin
chat-preview** — turns the blind front door into a seen one and is **M–L
effort** because it rides the shipped LINE push pipeline, the notification rail,
the `is_admin()` RLS, and the `/admin/audit` UI grammar. **Build-vs-buy: connect
the 4 free rails Pacred cannot rebuild — the LINE webhook, Clarity, GA4, the
Meta Pixel; build everything that holds Pacred's customer data — so every
conversation, every customer-360, every KPI lives inside Pacred's own
ecosystem.** Meta measurement = the Pixel (via GTM) + the CAPI relay reporting
conversions back so ad spend is measurable; the Claude-agent system is measured
by what ships, gated by `phase-verify-loop`, surfaced via the
`audit-kpi-dashboard` skill.
