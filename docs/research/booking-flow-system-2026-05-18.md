# 🛒 Pacred Booking Flow — a real "เหมือน Trip.com" booking experience

> **Produced 2026-05-18** for เดฟ, on the project lead's ask. **What this is:**
> the design for Pacred's **customer-facing booking flow** — the path that turns
> a priced freight calculator from *decoration* into a *real, usable, gives-a-job
> booking experience*, explicitly modelled on **Trip.com**. A customer clicks a
> booking card → lands on a real **booking detail page** → picks options on it
> (แรงงาน · หัวลาก · pin pickup/drop · attach docs · doc-handling mode) → sees an
> itemised, live-updating **quotation panel** ("ราคาประมาณการ") → on submit the
> booking becomes a **job in the admin back-office** that lands in the **Sales**
> + **Pricing** desks, and a rep contacts the customer to negotiate the final
> price.
>
> **What this is NOT:** a re-spec of ภูม's in-progress backend. The booking flow
> is a **customer-facing front-end + a thin intake table**; it *feeds* — does not
> replace — ภูม's **R-3 lead-inbox / CRM** and **R-5 quote-calculator** work
> ([`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) §R-3, §R-5). This doc owns
> the *submit surface*; R-3/R-5 own the *desk that receives it*.
>
> **Where facts already live, this links — it does not duplicate.** The booking
> calculator + price formulas live in `components/booking/` + `lib/booking-*`;
> the work-board job spine in migration `0080_work_items`; the lead-inbox /
> quote-record model in R-3/R-5; the buy-bridge precedent (`/start-order`) is
> already shipped. This doc designs only the **booking detail page + the
> `bookings` intake table + the submit→job wiring**.

---

## 0. TL;DR

**The flow in one sentence:** a customer on a landing page clicks a card →
arrives on a **per-service / per-route booking detail page** that looks like a
Trip.com product page (main content column + a sticky **quotation panel**
top-right + a side rail with an *upgrade plan* and *related-article tags*) →
selects options that update an itemised **"ราคาประมาณการ"** receipt live → hits
"จองเลย" → if a guest, is asked *"สมัครก่อนมั้ย"* and registers; if logged in,
sees the booking form directly → on submit the booking is written as a
**`bookings` row** + a **`work_item` job** that lands in the Sales + Pricing
desks → a rep phones / LINEs the customer to confirm the real price.

**Why this matters — the "decoration" gap, named.** Today the home/landing
`BookingCalculator` computes a genuine freight price, renders it in `ResultBox`,
and then — for `customs` / `remit` modes — **dead-ends into a phone/LINE
modal** (`SalesModal`). For `sea` / `truck` / `air` / `sourcing` a `QuoteCTA`
*does* bridge to `/start-order`, but that bridge skips straight into a protected
order *form* — there is **no booking detail page in between**, no place to pick
labor / a tractor / pin a map / attach documents, and no itemised quotation the
customer reads before they commit. The project lead's verdict — *"it feels like
decoration"* — is precise: **interacting with the booking card does not lead to
a place that feels like a real booking.** Trip.com's strength is exactly that
in-between page. This design builds it.

**Five deliverables of this design:**

1. **The booking detail page** — `/book/[service]/[route]` — a Trip.com-style
   two-column layout: main content + a sticky quotation panel + a side rail.
   §3, §4.
2. **The option model** — labor · tractor · pin pickup/drop · document attach ·
   document-handling mode — each selector, what it does to the price. §4.3.
3. **The quotation panel** — the live itemised "ราคาประมาณการ" receipt: one row
   per service charge, recomputed on every option change. §4.4.
4. **The auth gate** — guest clicks "จองเลย" → *"สมัครก่อนมั้ย"* prompt →
   register → return to the booking with selections intact; logged-in user →
   the booking form directly. §5.
5. **Schema + submit→job wiring** — a `bookings` + `booking_options` intake
   pair, and the trigger that turns a submitted booking into a `work_item` job
   for the Sales + Pricing desks, feeding R-3/R-5. §6.

**Minimal-viable (Phase BK-1):** one booking detail page template + the five
option selectors + the live quotation panel + the auth gate + the `bookings`
intake table + the submit→`work_item` wiring (routes the job to `sales`). That
alone replaces the dead-end with a real booking experience. The map-pin picker,
the per-route SEO pages, the upgrade-plan rail, and the rate-table admin UI are
later phases. §7.

---

## 1. The problem, grounded

### 1.1 What "decoration" means — the code, exactly

The booking calculator is a real, working price engine. The dead-end is also
real. Both verified in code:

| Asset | State | Where |
|---|---|---|
| `BookingCalculator` — 8-mode estimator (LCL · FCL · Truck · Air · Customs · Sourcing · Remit) | **works** — computes a genuine freight price per mode | `components/booking/BookingCalculator.tsx` (555 lines) |
| `calcLCL` / `calcFCL` / `calcTruck` / `calcAir` — the formulas | **works** — greater-of weight×rate, dimensional weight `W×L×H/6000`, additive surcharges, hardcoded rate tables | `lib/booking-calculator.ts` (227 lines) |
| `ResultBox` — renders the priced result | **works** — a big number + a `rows[]` itemised breakdown + a note | `components/booking/ResultBox.tsx` |
| `QuoteCTA` — the buy-bridge | **partial** — only `sea`/`truck`/`air`/`sourcing`; links to `/start-order`, which jumps **straight into a protected order form**, no detail page between | `components/booking/QuoteCTA.tsx` |
| `customs` / `remit` modes | **dead-end** — no `quote` passed → no `QuoteCTA` → only the `SalesModal` phone/LINE escalation | `BookingCalculator.tsx` L487-545 |
| `/start-order` | **works** — resolves auth, redirects guest→login / user→order form, carries the quote in the query string | `app/[locale]/(public)/start-order/page.tsx` |

**The gap, stated precisely.** The calculator answers *"how much, roughly?"*.
It does **not** give the customer a *place* — a page they land on, with the
service laid out, where they choose how the job is run (labor? a tractor? where
do we pick up? what documents?) and watch a quotation assemble itemised in front
of them. That place is the **booking detail page**, and it does not exist.
`/start-order` jumps over it. The customs landing pages
(`/customs-clearance-shipping-suvarnabhumi/[port]`) come *closest* — they have a
genuine two-column layout with a sticky quote box — but their only CTA is
`/register` or "ทักไลน์"; the quote box is **static text**, not an interactive
booking surface.

### 1.2 What the owner / lead actually asked for

> เดฟ: *"ตอนนี้มันเหมือนเป็นของประดับ — กดการ์ด booking แล้วไม่ได้ไปไหนต่อจริงๆ.
> อยากได้ประสบการณ์จองที่ใช้ได้จริง เหมือน Trip.com."*

Decoded against Pacred's #1 lens — **customer acquisition: "หาลูกค้า + ปิดดีล +
กดซื้อ"** ([`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md)
P1) — the ask is the **"ปิดดีล / กดซื้อ"** half. The find-machinery
(landing pages, SEO, JSON-LD) is ~80% done; the **convert** surface is the
booking detail page, and it is the missing piece. The capability doc already
flagged this exact break:

> *"No self-serve ad-click → กดซื้อ path — `BookingCalculator` computes a real
> price, then `ResultBox` dead-ends into a phone/LINE modal."*
> — `capability-tools-strategy-2026-05-18.md`, Priority 1, break #3.

This doc is the design that closes break #3 properly — not just a CTA, but the
**real booking experience** the lead named.

### 1.3 Why Trip.com is the right model

Trip.com is a booking platform for products that, like Pacred's, are **not a
fixed-price SKU** — a flight, a hotel night, a tour have variable fares,
add-ons, and fine print, and the customer must *assemble* their booking before
they commit. Pacred's freight job is the same shape: a base freight rate, plus
labor, plus a tractor, plus customs handling, plus document choices. Trip.com
solved the UX of *"assemble a variable-price booking and feel confident pressing
Book"* — that is exactly Pacred's problem. §2 extracts the specific patterns.

### 1.4 Codebase reality check (what exists to build on)

| Asset | State | Reuse |
|---|---|---|
| `BookingCalculator` + `calc*` formulas + rate tables | shipped | The booking detail page **reuses the `calc*` functions** as its price engine — no new formula code |
| `/start-order` auth-resolving bridge | shipped | The pattern (public route → resolve `auth.getUser()` → redirect) is the **template for the booking auth gate** (§5) |
| `0080_work_items` cross-department job spine | shipped on `dave` | A submitted booking becomes a `work_item` — **the booking is just a new `entity_type`** (§6.3) |
| `freight_quotes` + `freight_quote_items` (V-E6) | shipped | The admin-side quote record. A booking **becomes** a `freight_quote` when Pricing formalises it (§6.4) — booking ≠ quote, booking *seeds* a quote |
| `contact_messages` + `submitContactMessage` + admin notify | shipped (`b90806b`) | The lead-capture precedent — the booking submit reuses the same `sendNotification()` rails |
| customs-clearance landing pages (2-col + sticky quote box) | shipped | The **visual template** for the booking detail page already exists — `grid lg:grid-cols-[1fr_360px]`, `lg:sticky lg:top-24` |
| R-3 lead-inbox / CRM · R-5 quote-calculator | **specced, not built** — ภูม's lane | The booking flow **feeds** these; §6.5 defines the hand-off contract |

**Nothing in this design rewrites a shipped table.** It adds two intake tables
(`bookings`, `booking_options`), one new `work_items.entity_type` value, and a
front-end. It rides the calculator, the auth-bridge pattern, the work-board, and
the notification rails.

---

## 2. Trip.com booking flow — researched patterns

> Trip.com's booking UX is stable + well-documented; the patterns below are the
> ones load-bearing for Pacred's design. Each is mapped to a Pacred decision in
> §3-§6. (WebSearch/WebFetch were unavailable in this session — the analysis
> draws on Trip.com's established, long-stable booking-funnel design.)

### 2.1 Browse → click → a real detail page

On Trip.com a user browses a **list/grid of cards** (flights, hotels, tours,
attraction tickets). Each card is a *teaser*: a thumbnail, a title, a **"from
฿X"** starting price, a couple of trust signals (rating, reviews). **Clicking a
card never books anything** — it routes to a dedicated **detail page** for that
one product. The detail page is where the real interaction happens.

→ **Pacred mapping:** the `BookingCalculator` mode-tabs + the service landing
cards are the *teasers*. Clicking "จองเลย" / "เปิดบุ๊กกิ้ง" must route to a
**booking detail page** — `/book/[service]/[route]` — not into a form and not
into a modal. §3.1.

### 2.2 The detail-page layout — content column + price panel

Trip.com's detail page is a **two-column layout**:

- **Main content column (left, wide)** — the product itself: photos, the
  description, the *options to choose* (room type / fare class / ticket
  date / add-ons), reviews, policies, the fine print.
- **Price / booking panel (right, narrow, STICKY)** — the panel that follows
  the scroll. It holds the **current total**, an **itemised breakdown**, and the
  primary **"Book"** button. As the user scrolls the long content column, the
  price panel stays in view — the customer always sees *what they are about to
  pay* and *how to proceed*.

The stickiness is the key behaviour: it makes the price **continuously
present** without the customer scrolling back up to find it.

→ **Pacred mapping:** the booking detail page is `grid lg:grid-cols-[1fr_360px]`
— main content left, the **quotation panel** right + `lg:sticky lg:top-24`.
This is *the same layout the customs landing pages already use* (§1.4) — Pacred
is not inventing a layout, it is making the existing one *interactive*. §4.1.

### 2.3 Options update the price live

On Trip.com, every option the user picks — a pricier room, a flexible fare, a
"breakfast included" add-on, an extra bag, travel insurance, an airport
transfer — **immediately recomputes the panel total**. There is no "calculate"
button between selecting an option and seeing the new price; the panel is
**reactive**. Each add-on also shows its **own line** in the breakdown, so the
customer sees not just *the new total* but *which choice moved it*.

→ **Pacred mapping:** picking แรงงาน, a หัวลาก, or a document-handling mode
**recomputes the quotation panel on the spot** — no "คำนวณ" button. Each option
that carries a charge gets **its own row** in the itemised receipt. §4.3, §4.4.

### 2.4 The itemised breakdown — the "receipt"

Trip.com's price panel does not show only a total. It shows a **breakdown** —
base fare, taxes & fees, each add-on as a separate line, any discount as a
negative line, then the **total** in bold. This is the *receipt* pattern: the
customer sees the price is **built from named parts**, which is what makes a
variable price feel **honest** rather than arbitrary.

→ **Pacred mapping:** the quotation panel itemises **every service charge** —
ค่าขนส่ง (freight), ค่าแรงงาน (labor), ค่าหัวลาก (tractor), ค่าพิธีการศุลกากร
(customs handling), ค่าออกใบกำกับภาษี / ใบขนสินค้า (document handling) — each on
its own row with a short detail, then the **ราคาประมาณการรวม** total. §4.4.

### 2.5 Related content / upsell placement

Trip.com weaves **related products + upsells** into the page: "you might also
like", "travellers also booked", cross-sell of insurance / transfers, and — on
content-style pages — links to relevant travel guides/articles. These sit
**below or beside** the main booking interaction — present, never blocking it.

→ **Pacred mapping:** the booking detail page's **side rail** carries (a) an
**upgrade-plan** card — "add ประกันสินค้า", "upgrade to door-to-door", "เพิ่ม
fumigation" — the Pacred equivalent of Trip.com's add-on upsell, and (b)
**related-article tags** — links into `/knowledge` (the existing knowledge hub),
the Pacred equivalent of Trip.com's travel-guide links. §4.5.

### 2.6 Where login is required — *late*, after option selection

Trip.com lets a **guest browse, open a detail page, and select every option**
*without logging in*. The auth wall appears **at the booking step** — when the
user actually presses "Book" / "Reserve" and must enter passenger/payment
details. Even then, Trip.com offers **guest checkout** as well as
sign-in/register. The principle: **never gate exploration; gate only commit** —
because an auth wall in front of browsing kills the funnel.

→ **Pacred mapping:** a guest reaches the booking detail page and selects
**every option freely** — no login. The gate fires only on **"จองเลย"**: a
guest is shown *"สมัครก่อนมั้ย"* (register first?) and routed through
`/register`, then **returned to the booking with every selection intact**. A
logged-in user skips the prompt and sees the booking form directly. Pacred
**requires** an account (the job must attach to a customer record for the Sales
desk + the portal) — so there is no anonymous "guest checkout"; the equivalent
courtesy is **carrying the selection across the registration** so the customer
never re-enters it. §5.

### 2.7 Confirm → book → confirmation

Trip.com's final steps are: a **review screen** (everything you chose + the
final price, one last look) → press **Book** → a **confirmation page** with a
booking reference + "what happens next". The customer always lands somewhere
that says *"this worked, here is your reference, here is the next step"* — never
a dead-end.

→ **Pacred mapping:** because a Pacred freight price is **not final until a rep
confirms it**, Pacred's "confirmation" is honest about that: submit → a
**confirmation page** with a **booking reference** (`BKYYMMDD-NNNN`) + the
message *"ทีมขายจะติดต่อกลับเพื่อยืนยันราคาจริง"* + the estimate shown as an
**estimate**. The customer leaves with a reference and a clear next step — and
the booking is already a job on the Sales desk. §5.3, §6.

### 2.8 Why Trip.com's booking *feels* trustworthy + usable — the five reasons

| # | Trip.com trait | Pacred application |
|---|---|---|
| 1 | **The price is always visible** (sticky panel) — never hunt for it | Sticky quotation panel, `lg:top-24` (§4.1) |
| 2 | **The price is itemised** — built from named parts, not a black box | Per-service rows in the quotation receipt (§4.4) |
| 3 | **The price reacts** — pick an option, see it move *now* | Live recompute, no "calculate" button (§4.3) |
| 4 | **Browsing is never gated** — login only at commit | Auth gate fires on "จองเลย" only; selection carried across register (§5) |
| 5 | **No dead-ends** — every step lands somewhere with a clear next action | Confirmation page + booking reference + "ทีมขายติดต่อกลับ" (§5.3) |

These five are the **acceptance bar** for the Pacred design. A booking surface
that misses any one of them is back to "decoration".

---

## 3. Pacred booking flow — the shape

### 3.1 The end-to-end journey

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  CUSTOMER JOURNEY                                                    │
 └─────────────────────────────────────────────────────────────────────┘

  [1] Landing / home                  [2] Booking detail page
  ┌──────────────────────┐            ┌────────────────────────────────┐
  │ BookingCalculator     │  click     │  /book/[service]/[route]       │
  │ or service landing    │  "จองเลย"   │  ┌─ main content ─┐ ┌─ quote ─┐│
  │ card → "เปิดบุ๊กกิ้ง" │ ─────────▶ │  │ service · route │ │ panel   ││
  │ shows "ราคาเริ่มต้น"   │            │  │ OPTION SELECTORS│ │ (sticky)││
  └──────────────────────┘            │  └─────────────────┘ └─────────┘│
                                       └────────────┬───────────────────┘
                                                    │ pick options
                                                    │ (price updates live)
                                                    │ press "จองเลย"
                                                    ▼
                              ┌──────────────────────────────┐
                              │  [3] AUTH GATE                │
                              │  guest → "สมัครก่อนมั้ย?"      │
                              │    → /register → return here   │
                              │  logged-in → straight through  │
                              └──────────────┬─────────────────┘
                                             ▼
                              ┌──────────────────────────────┐
                              │  [4] Booking form (review)    │
                              │  selections + contact + the   │
                              │  estimate, one last look      │
                              │  → submit                      │
                              └──────────────┬─────────────────┘
                                             ▼
                ┌────────────────────────────────────────────────┐
                │  [5] SUBMIT → write `bookings` row              │
                │       + spawn a `work_item` job                 │
                └───────────┬────────────────────┬────────────────┘
                            │                    │
              [6a] CUSTOMER │      [6b] ADMIN BACK-OFFICE
              ┌─────────────▼──┐   ┌──────────────────────────────────┐
              │ confirmation    │   │ job lands in:                    │
              │ page · BK ref · │   │  • Sales workspace (R-3 lead-inbox)│
              │ "ทีมขายติดต่อ   │   │  • Pricing desk   (R-5 calculator) │
              │  กลับ"          │   │ rep phones/LINEs → negotiates →   │
              └─────────────────┘   │ job advances through the process  │
                                    └──────────────────────────────────┘
```

### 3.2 Route structure

```
app/[locale]/(public)/book/
├─ page.tsx                       # booking hub — grid of bookable services
└─ [service]/
   ├─ page.tsx                    # service-level booking detail (route picked on-page)
   └─ [route]/page.tsx            # per-route booking detail (SEO landing target)

app/[locale]/(public)/book-start/ # auth-gate bridge (mirrors /start-order)
└─ page.tsx

app/[locale]/(protected)/bookings/  # the customer's own bookings
├─ page.tsx                       # list — "การจองของฉัน"
└─ [bookingNo]/page.tsx           # one booking — status + the estimate + rep contact
```

- **`/book/[service]/[route]`** is the SEO-friendly canonical booking detail
  URL — e.g. `/book/customs-clearance/suvarnabhumi`,
  `/book/import/guangzhou-bangkok-truck`. It is **public** (no auth — §2.6).
  `[service]` ∈ the service catalogue ([`../../CLAUDE.md`](../../CLAUDE.md)
  ecosystem table); `[route]` is an origin-destination / port slug.
- **`/book/[service]/page.tsx`** (route omitted) renders the same detail page
  with the route as an on-page selector — for entry points that know the
  service but not the route.
- **`/book-start`** is the auth-gate bridge — a public route that resolves
  `auth.getUser()` and redirects (guest → register / user → the booking form),
  carrying the booking draft. It is the **exact pattern of the shipped
  `/start-order`** (§5.2).
- **`/bookings`** (protected) is the customer's view of their own submitted
  bookings — list + per-booking status.

### 3.3 How a customer reaches the booking detail page

Three entry points, all converging on `/book/[service]/[route]`:

| Entry point | How | Carries |
|---|---|---|
| **The `BookingCalculator`** (home / `/booking` / landing) | The priced `ResultBox` gets a new **"เปิดบุ๊กกิ้ง / จองเลย"** button beside the existing `QuoteCTA` — links to `/book/[service]/[route]` with the calculator inputs as query params | mode → service, origin/dest → route, weight/cbm/cif, the computed estimate |
| **A service landing page** (e.g. customs-clearance `[port]`) | The landing's "ขอใบเสนอราคา" CTA gains a sibling **"จองออนไลน์"** → `/book/customs-clearance/[port]` | the port slug → route |
| **The `/services` catalogue** | Each service card gets a **"จองเลย"** action → `/book/[service]` (route picked on-page) | service only |

> **`QuoteCTA` is kept, not replaced.** The shipped `QuoteCTA` → `/start-order`
> → protected order *form* path stays for customers who want the **fast
> self-serve order**. The new **"เปิดบุ๊กกิ้ง"** button is the **considered
> booking** path — pick options, see an itemised quote, get a rep. Two doors,
> one calculator: `QuoteCTA` = "I know what I want, take my order";
> "เปิดบุ๊กกิ้ง" = "help me assemble + price this job". BK-1 ships the second
> door; whether the first is later folded into it is a §9 open question.

---

## 4. The booking detail page

### 4.1 Layout — Trip.com two-column + a side rail

```
┌─ /book/customs-clearance/suvarnabhumi ─────────────────────────────────┐
│  breadcrumb:  หน้าแรก › จอง › เคลียร์ศุลกากร › สุวรรณภูมิ                  │
│                                                                        │
│ ┌─ MAIN CONTENT (left, 1fr) ──────────┐ ┌─ QUOTATION PANEL ──────────┐ │
│ │ ▸ service title + route + hero       │ │  (sticky · lg:top-24)      │ │
│ │ ▸ "ราคาประมาณการ — เริ่มต้น ฿X"        │ │ ┌────────────────────────┐ │ │
│ │                                      │ │ │ ราคาประมาณการ          │ │ │
│ │ ▸ OPTION SELECTORS                   │ │ ├────────────────────────┤ │ │
│ │   ├─ แรงงาน (labor)         [ ▾ ]    │ │ │ ค่าพิธีการศุลกากร  6,500│ │ │
│ │   ├─ หัวลาก (tractor)       [ ▾ ]    │ │ │ ค่าแรงงาน ×2       1,200│ │ │
│ │   ├─ จุดรับ + จุดส่ง        [ 📍 map] │ │ │ ค่าหัวลาก          3,500│ │ │
│ │   ├─ แนบเอกสาร              [ ⬆ ]    │ │ │ ออกใบกำกับภาษี       600│ │ │
│ │   └─ การจัดการเอกสาร  ( ◯ ◯ ◯ )      │ │ ├────────────────────────┤ │ │
│ │                                      │ │ │ รวมประมาณการ    ฿11,800│ │ │
│ │ ▸ what's included / fine print       │ │ │ * ราคาเริ่มต้น —        │ │ │
│ │ ▸ how the booking works (3 steps)    │ │ │   ทีมขายยืนยันราคาจริง  │ │ │
│ │                                      │ │ ├────────────────────────┤ │ │
│ │                                      │ │ │ [ จองเลย → ]            │ │ │
│ │                                      │ │ │ [ ปรึกษาทีม / LINE ]    │ │ │
│ │                                      │ │ └────────────────────────┘ │ │
│ │                                      │ │ ┌─ SIDE RAIL ────────────┐ │ │
│ │                                      │ │ │ ⬆ upgrade plan          │ │ │
│ │                                      │ │ │   ☐ ประกันสินค้า         │ │ │
│ │                                      │ │ │   ☐ door-to-door        │ │ │
│ │                                      │ │ │   ☐ fumigation          │ │ │
│ │                                      │ │ ├────────────────────────┤ │ │
│ │                                      │ │ │ 🏷 บทความที่เกี่ยวข้อง   │ │ │
│ │                                      │ │ │  #เคลียร์ศุลกากร        │ │ │
│ │                                      │ │ │  #ใบขนสินค้า  #ภาษีนำเข้า│ │ │
│ │                                      │ │ └────────────────────────┘ │ │
│ └──────────────────────────────────────┘ └────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** `grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-10
  items-start` — *the exact pattern the customs landing pages already use*
  (`customs-clearance-shipping-suvarnabhumi/[port]/page.tsx` L162). Pacred is
  making a **proven layout interactive**, not inventing one.
- **Quotation panel:** `lg:sticky lg:top-24 self-start` — follows the scroll
  (§2.2). On mobile it is **not** sticky-top; it collapses to a **bottom sticky
  bar** showing the total + "จองเลย" (§4.6 — the mobile pattern).
- **Side rail:** the upgrade-plan card + the related-article tags sit **under**
  the quotation panel in the same right column (desktop), and **below the main
  content** on mobile (§2.5, §4.5).
- **Mobile-first** — the page is designed at 360/390px first
  ([`conventions.md` §11](../conventions.md), [`mobile-first-playbook.md`](../mobile-first-playbook.md)),
  then scaled up. §4.6.

### 4.2 The main content column

Top → bottom:

1. **Breadcrumb** — `หน้าแรก › จอง › <service> › <route>` (the existing
   `breadcrumbSchema` JSON-LD pattern + a visible trail).
2. **Service title + route + hero** — e.g. *"เคลียร์ศุลกากร · สุวรรณภูมิ"* + a
   one-line sub + a hero image. Reuses the landing-page header pattern.
3. **The estimate headline** — *"ราคาประมาณการ — เริ่มต้น ฿X"* — the *starting*
   number, stated as an estimate (§4.7 — the estimate-honesty rule).
4. **The option selectors** — §4.3. This is the interactive heart of the page.
5. **What's included / fine print** — a short "บริการนี้รวม / ไม่รวม" list, and
   the per-service notes (reuse the landing-page content blocks).
6. **How the booking works** — a 3-step explainer (*จองออนไลน์ → ทีมขายยืนยัน
   ราคา → เริ่มงาน*) — sets the expectation that the price is rep-confirmed
   (§4.7).

### 4.3 The option selectors — the customer's choices

Five selectors, per the lead's spec. Each is a Pacred-branded control; each that
carries a charge **pushes a row into the quotation panel** the moment it
changes (§4.4).

| # | Selector | TH label | Control | Effect on the quote |
|---|---|---|---|---|
| 1 | **Labor** | แรงงาน | A stepper / count picker (0 · 1 · 2 · 3+ คน) — optionally a "ยกของหนัก" toggle | Each worker adds a `ค่าแรงงาน ×N` row at the labor rate |
| 2 | **Tractor / truck head** | หัวลาก | A select — *ไม่ต้องใช้ · หัวลาก 4 ล้อ · 6 ล้อ · 10 ล้อ · เทรลเลอร์* | The chosen class adds a `ค่าหัวลาก` row at that class's rate |
| 3 | **Pin pickup + drop-off** | ปักหมุดจุดรับ + จุดส่ง | A **map picker** — two pins (จุดรับ / จุดส่ง); each pin yields a lat/lng + an address string | Distance between pins can add a `ค่าระยะทาง` row (BK-2 — see §7); BK-1 records the pins and shows them, no distance pricing yet |
| 4 | **Attach documents** | แนบเอกสาร | A multi-file uploader with **typed slots** — invoice · packing list · certificate · ภพ.20 · บัตรประชาชน · passport | No price effect — attachments give the rep + the customs/docs team what they need up front. Reuses the `member-docs` private-bucket pattern (§6.2) |
| 5 | **Document-handling mode** | การจัดการเอกสาร | A **single-choice** radio group — pick **one** of three | The choice adds (or omits) a document-handling row — see below |

**The document-handling mode** (selector #5) is a one-of-three radio:

| Choice | TH label | Quote effect |
|---|---|---|
| `none` | ไม่รับเอกสาร | No document row — Pacred handles freight only |
| `tax_invoice` | รับเอกสารใบกำกับภาษี | Adds `ค่าออกใบกำกับภาษี` at the tax-invoice rate |
| `customs_declaration` | ออกใบขนสินค้า | Adds `ค่าออกใบขนสินค้า` at the declaration rate |

These three are **mutually exclusive** (a radio, not checkboxes) — they describe
*how Pacred handles the paperwork for this job*, and a job has exactly one
posture. The choice is also a strong **routing signal** for the back-office: a
`customs_declaration` booking needs the docs team + the customs desk, a `none`
booking does not (§6.3).

> **Which selectors show depends on the service.** A `customs-clearance` booking
> shows all five; a pure `yuan-transfer` (ฝากโอน) booking shows none of
> labor/tractor/pins (it is a money service) and only the document-handling
> selector. The booking detail page reads a **per-service selector manifest**
> (a small config object — `lib/booking/service-config.ts`) that says which of
> the five selectors apply. BK-1 ships the manifest for the cargo/freight
> services; expansion services are added as they come online.

### 4.4 The quotation panel — the live itemised "ราคาประมาณการ"

The panel is the **receipt** (§2.4) — and the answer to "why does this not feel
like decoration": the customer **watches a price assemble from named parts**.

**What it contains, top → bottom:**

1. **Header** — *"ราคาประมาณการ"* — never *"ราคา"* alone (§4.7).
2. **The itemised rows** — one row per active service charge. Each row =
   *a label · a short detail · an amount*. Rows appear/disappear/change **live**
   as options change (§2.3). The base service is always row 1:
   - `ค่าพิธีการศุลกากร` / `ค่าขนส่ง` / … — the base service charge
     (from the calculator's `calc*` result, §1.4).
   - `ค่าแรงงาน ×N` — appears when labor > 0.
   - `ค่าหัวลาก · <class>` — appears when a tractor class is chosen.
   - `ค่าออกใบกำกับภาษี` **or** `ค่าออกใบขนสินค้า` — appears per the
     document-handling mode.
   - upgrade-plan add-ons (ประกันสินค้า / door-to-door / fumigation) — appear
     when ticked in the side rail (§4.5).
3. **The total** — `รวมประมาณการ ฿X` — bold, the sum of the rows.
4. **The estimate disclaimer** — *"ราคาเริ่มต้น — ทีมขายยืนยันราคาจริงหลังตรวจ
   สินค้า"* (§4.7).
5. **The actions** — primary **"จองเลย"** (→ the auth gate, §5) + secondary
   **"ปรึกษาทีม / ทักไลน์"** (the existing LINE/phone escalation — kept as a
   fallback for customers not ready to book).

**How the panel computes.** The booking detail page is a `"use client"`
component holding the option state. On every option change a `useMemo`
recomputes a **`QuoteBreakdown`** — `{ rows: QuoteLine[], total: number }` —
where the **base-service row reuses the shipped `calc*` functions**
(`lib/booking-calculator.ts`) and the option rows are looked up from a **rate
table** (§6.6). No "คำนวณ" button — the panel is reactive (§2.3). This is the
single most important behaviour in the design: **decoration → real** is exactly
the gap between *"a number that sits there"* and *"a receipt that responds to
me"*.

`QuoteLine` shape (front-end type, `types/booking.ts`):

```
interface QuoteLine {
  key:    string;   // 'base' | 'labor' | 'tractor' | 'doc_tax_invoice' | …
  label:  string;   // i18n — "ค่าแรงงาน"
  detail: string;   // i18n — "×2 คน"
  amount: number;   // THB; the displayed line amount
}
interface QuoteBreakdown {
  rows:  QuoteLine[];
  total: number;    // Σ rows.amount
  isEstimate: true; // always — a Pacred booking quote is never final here
}
```

### 4.5 The side rail — upgrade plan + related-article tags

Per the lead's spec, the right column carries two more cards under the quotation
panel — the Trip.com **upsell + related-content** pattern (§2.5):

- **Upgrade-plan card** — *"อัปเกรดบริการ"* — a short checklist of optional
  add-ons: **ประกันสินค้า** (cargo insurance), **door-to-door** (upgrade from
  port-to-door), **fumigation**, **priority handling**. Ticking one **adds a
  row to the quotation panel** (§4.4) — these are upsell line-items, exactly
  like Trip.com's "add insurance / add a transfer". The available upgrades come
  from the same per-service manifest as the selectors (§4.3).
- **Related-article tags** — *"บทความที่เกี่ยวข้อง"* — a row of tag-chips
  linking into the existing **`/knowledge`** hub: `#เคลียร์ศุลกากร`,
  `#ใบขนสินค้า`, `#ภาษีนำเข้า`, etc. Pacred's equivalent of Trip.com's
  travel-guide links — it keeps a not-yet-ready-to-book visitor **inside the
  Pacred ecosystem** (the DNA "full-loop, no handover" principle) and feeds SEO
  internal-linking. The tags are static per-service config in BK-1.

### 4.6 Mobile — the bottom sticky quote bar

Most Pacred customers are on phones ([`conventions.md` §11](../conventions.md)).
The desktop sticky side-panel does not work at 360px — so on mobile:

- The page is **single column**: main content, then the quotation panel inline,
  then the side rail.
- A **bottom sticky bar** is pinned to the viewport — it shows
  `รวมประมาณการ ฿X` + a **"จองเลย"** button. It is the mobile analogue of the
  sticky desktop panel (§2.1, §2.8 reason #1) — the price + the action stay
  reachable with the thumb while the customer scrolls the options.
- Tapping the total in the bottom bar **expands the full itemised breakdown** in
  a bottom sheet — the receipt is one tap away, not scrolled away.
- Tap targets ≥ 44px, text ≥ 16px, a thumb-reachable CTA — the
  `mobile-first-verify` skill's acceptance bar.

### 4.7 The estimate-honesty rule (a hard design constraint)

The price on the booking detail page is **always** presented as an estimate —
*ราคาประมาณการ · ราคาเริ่มต้น · ราคาคร่าวๆ* — **never** as a final, payable
price. This is not a disclaimer footnote; it is woven through the UI:

- the headline says *"ราคาประมาณการ — เริ่มต้น ฿X"*;
- the panel header says *"ราคาประมาณการ"*;
- the panel footer says *"ทีมขายยืนยันราคาจริงหลังตรวจสินค้า"*;
- the "how it works" explainer (§4.2) names *"ทีมขายยืนยันราคา"* as step 2;
- the confirmation page (§5.3) repeats it.

**Why this is load-bearing.** A Pacred freight job's true price depends on the
real cargo (actual CBM/weight, HS code, the real customs duty, the real
destination) — facts a web form cannot fully capture. The legacy operation's
**two-price model** (an `offered` price and a `target` price, the rep
negotiates between them — [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)
§R-3, §R-5) is exactly this reality. If the booking page showed a *final* price
the customer would (rightly) treat it as a quote Pacred must honour. Showing it
honestly as an **estimate that a rep confirms** (a) sets the right expectation,
(b) is *true*, and (c) is the natural seam for the Sales desk to do its job. The
estimate gets the customer to **press "จองเลย"**; the rep closes the real
number. This is also the legitimate, document-complete posture the project
mandates — no gray-channel "เหมาภาษี" price games
([`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) cross-cutting guardrail).

---

## 5. The auth gate

### 5.1 The rule — gate commit, not exploration

Per §2.6 and the lead's spec:

- A **guest** browses the booking detail page and selects **every option
  freely** — no login, no wall. (Gating exploration kills the funnel.)
- The gate fires **only on "จองเลย"**. A guest is shown a prompt —
  ***"สมัครก่อนมั้ย? — บันทึกการจองนี้ไว้ในระบบ ทีมขายติดต่อกลับได้เร็วขึ้น"*** —
  with **"สมัคร / เข้าสู่ระบบ"** as the primary action.
- A **logged-in** user pressing "จองเลย" skips the prompt entirely → straight to
  the booking form (§5.3).
- After a guest registers, they are **returned to the booking form with every
  selection intact** — the options they picked are *carried across the
  registration*, never re-entered.

Pacred **requires an account** to submit (the job must attach to a customer
record — for the Sales desk to own it and for the customer portal to show it).
So unlike Trip.com there is no anonymous guest-checkout; the equivalent courtesy
is the **carry-the-selection-across-register** behaviour — the customer's work
is never lost.

### 5.2 How the gate is built — the `/start-order` pattern, reused

The shipped `/start-order` route (`app/[locale]/(public)/start-order/page.tsx`)
already solves *"a public route that resolves auth state and redirects a guest
through login carrying a payload"*. The booking gate is the **same pattern**, a
sibling route — `/book-start`:

```
guest presses "จองเลย"
   │
   ▼
the booking draft is persisted   ──▶  a `bookings` row at status='draft'
(so the selection survives the                (server action — §6.5)
 round-trip — see §5.4)                returns a draft booking id / token
   │
   ▼
navigate → /book-start?draft=<id>
   │
   ▼  (server component — mirrors /start-order)
   ├─ auth.getUser()  →  logged in?
   │     YES → redirect → /book/[service]/[route]/review?draft=<id>
   │     NO  → redirect → /register?next=/book/.../review?draft=<id>
   │              (the "สมัครก่อนมั้ย" prompt is shown on the
   │               booking page BEFORE the redirect — §5.1)
   ▼
after /register completes it honours `next` →
   the customer lands on the review step, draft intact
```

- **`/book-start` is public** (no auth gate) — exactly like `/start-order`, so a
  guest can reach it before any protected layout would bounce them.
- The **draft booking** is the carry mechanism — §5.4. The selection is in the
  DB, keyed by an id; the id rides the query string through register; the
  review step re-hydrates from it. Nothing is lost, and nothing fragile (a
  giant query string of every option) is needed.
- The **`next` redirect** through `/register` is the standard pattern the login
  page already honours (`/start-order` uses the identical `next` contract).

### 5.3 After the gate — review → submit → confirmation

Once past the gate (guest-now-registered or already-logged-in), the customer is
on the **review step** — `/book/[service]/[route]/review` (or a final card on
the detail page):

1. **Review** — every option chosen, the itemised estimate one last time, plus
   a small contact block (name / phone / LINE — pre-filled from the profile,
   editable) and a free-text *"รายละเอียดเพิ่มเติม"* box. The Trip.com
   "one last look" screen (§2.7).
2. **Submit** — presses **"ยืนยันการจอง"** → the `bookings` row flips
   `draft → submitted`, the `work_item` job is spawned (§6.3), notifications
   fire (§6.5).
3. **Confirmation** — a confirmation page: a **booking reference**
   (`BKYYMMDD-NNNN`), the chosen options + the estimate, and the honest next
   step — ***"ได้รับการจองแล้ว · ทีมขายจะติดต่อกลับภายใน [SLA] เพื่อยืนยันราคา
   จริง"*** + the rep's LINE/phone. The customer leaves with a reference and a
   clear next action — **no dead-end** (§2.7, §2.8 reason #5). The booking also
   now shows in their **`/bookings`** list (§3.2).

### 5.4 The draft-booking carry mechanism

A booking moves through **two pre-submit states** so the selection is never
lost:

| `bookings.status` | When | Visible to customer? |
|---|---|---|
| `draft` | the moment a guest/user presses "จองเลย" — before the auth gate | only via the `?draft=<id>` link; not in `/bookings` |
| `submitted` | the customer presses "ยืนยันการจอง" on the review step | yes — in `/bookings`, and it is now a job |

- A `draft` booking is created by a server action callable **without auth** (a
  guest must be able to create one). It holds the options + the estimate but no
  confirmed customer. It is the payload the `/book-start` gate carries.
- On submit, `draft → submitted` and the `profile_id` is bound (now there
  definitely is one — the gate guaranteed it). The `work_item` job spawns on
  this transition, not on `draft` creation — so an abandoned draft never
  reaches a desk.
- **Abandoned drafts** — a `draft` older than N days with no submit is swept by
  a cron (the existing cron-health infra) or simply left (a cheap row). They are
  also a **lead-quality signal** for R-3 — "someone configured a customs
  booking and didn't finish" is worth a rep's follow-up. BK-1 keeps drafts; the
  abandoned-draft → lead nudge is a BK-2/R-3 refinement (§7).

---

## 6. Schema + the submit→job wiring

### 6.1 Design stance

The booking flow's persistence is **a thin intake layer**, not a domain rewrite.
Two new tables (`bookings`, `booking_options`), one new `work_items.entity_type`
value, one rate table (`booking_rates`), and the existing notification rails.
The booking **feeds** the work-board + R-3 + R-5 — it does not duplicate them.

### 6.2 `bookings` + `booking_options`

```sql
-- ── bookings — one customer booking submission ──
create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  booking_no      text unique,                    -- BKYYMMDD-NNNN (daily serial,
                                                  --   mirrors freight_quote_no)

  status          text not null default 'draft'
                    check (status in (
                      'draft',       -- created pre-auth-gate, not yet submitted
                      'submitted',   -- customer confirmed → now a job
                      'contacted',   -- a rep has reached the customer
                      'quoted',      -- Pricing has formalised a freight_quote
                      'won',         -- converted to an order/shipment
                      'lost',        -- customer declined / went cold
                      'cancelled'    -- customer cancelled
                    )),

  -- the service + route this booking is for
  service_slug    text not null,                  -- 'customs-clearance' | 'import' | …
  route_slug      text,                           -- 'suvarnabhumi' | 'guangzhou-bangkok-truck'
  transport_mode  text,                           -- 'sea_lcl'|'sea_fcl'|'truck'|'air' (nullable
                                                  --   — money services have none)

  -- customer pointer — NULL only while status='draft' (a guest's pre-gate draft)
  profile_id      uuid references public.profiles(id) on delete restrict,
  contact_name    text,                           -- snapshot — editable on the review step
  contact_phone   text,
  contact_line    text,
  customer_note   text,                           -- the "รายละเอียดเพิ่มเติม" free text

  -- the document-handling posture (§4.3 selector #5) — a strong routing signal
  doc_mode        text not null default 'none'
                    check (doc_mode in ('none','tax_invoice','customs_declaration')),

  -- pin pickup / drop-off (§4.3 selector #3) — lat/lng + a human address
  pickup_lat      numeric(9,6),  pickup_lng  numeric(9,6),  pickup_address  text,
  dropoff_lat     numeric(9,6),  dropoff_lng numeric(9,6),  dropoff_address text,

  -- the estimate SNAPSHOT — what the customer saw when they submitted.
  -- Frozen here for the audit trail; the real price lives on the freight_quote
  -- the Pricing desk later creates (§6.4). estimate_breakdown is the QuoteLine[]
  -- as JSONB — the itemised receipt, preserved exactly.
  estimate_total      numeric(12,2) not null default 0,
  estimate_breakdown  jsonb        not null default '[]'::jsonb,
  is_estimate         boolean      not null default true,   -- always true (§4.7)

  -- lead provenance (feeds R-3 — §6.5)
  source_channel  text,            -- 'home_calculator'|'customs_landing'|'services'|…
  source_url      text,

  -- the formalised quote, once Pricing makes one (§6.4) — nullable until then
  freight_quote_id uuid references public.freight_quotes(id) on delete set null,

  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── booking_options — the picked option line-items (labor / tractor / upgrades) ──
-- One row per chosen option. Mirrors freight_quote_items: the line-item child
-- of a header. Lets the quotation receipt be reconstructed + the rep see exactly
-- what the customer chose.
create table public.booking_options (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  option_key   text not null,        -- 'labor'|'tractor'|'upgrade_insurance'|…
  option_label text not null,        -- snapshot label (i18n-resolved at write time)
  detail       text,                 -- '×2 คน' | 'หัวลาก 10 ล้อ'
  quantity     int  not null default 1,
  unit_amount  numeric(12,2) not null default 0,   -- per-unit rate snapshot
  line_amount  numeric(12,2) not null default 0,   -- quantity × unit_amount
  created_at   timestamptz not null default now()
);
```

- **Attached documents** (§4.3 selector #4) reuse the **existing `documents` /
  `member-docs` private-bucket pattern** — a booking's uploads are `documents`
  rows tagged with the `booking_id`, RLS owner-only. No new storage design.
  BK-1 may store a draft guest's files in a temp prefix and re-key them to the
  profile on submit (the same re-key the draft→submit transition does).
- **Indexes:** `bookings(status, created_at desc)` (the Sales-desk list),
  `bookings(profile_id, status)` (the customer's `/bookings`),
  `booking_options(booking_id)`.

### 6.3 RLS

Mirrors the shipped `freight_quotes` posture:

| Actor | `bookings` | `booking_options` |
|---|---|---|
| **Guest (anon)** | `INSERT` a `draft` only (the pre-gate draft); no select | `INSERT` children of an own draft |
| **Customer (owner)** | `SELECT` / `UPDATE` own rows; `UPDATE` limited to `draft`→`submitted` + own contact fields | `SELECT` own; `INSERT`/`DELETE` only while parent is `draft` |
| **Admin** | full (app layer enforces the per-status role split — §6.5) | full |

> The anon-`INSERT`-draft policy is the one unusual grant. It is scoped hard:
> anon can **only** insert at `status='draft'` and **cannot select** anything
> back except via the opaque `?draft=<id>` it was handed — the same shape as a
> magic-link token. A draft carries no customer PII (the guest hasn't
> registered yet), so the blast radius is a throwaway row. The app-layer action
> (§6.5) is the real guard; RLS is the floor.

### 6.4 Booking vs `freight_quote` — the relationship

**A booking is not a quote. A booking *seeds* a quote.**

- A **`booking`** is the **customer's expression of intent** — "I want this
  service, on this route, with these options, and I saw roughly ฿X". It is a
  *lead*. It is created from the public booking page.
- A **`freight_quote`** (the shipped V-E6 table) is the **formal, approved,
  send-to-customer quotation** — drafted by the Pricing desk, with an approval
  step, a validity window, a real total. It is an *internal artifact that
  becomes a binding offer*.
- The seam: when the Pricing desk works a `submitted` booking, they **create a
  `freight_quote` from it** — the booking's `service_slug` / `route_slug` /
  `transport_mode` / options / estimate **pre-fill the new quote draft**. The
  `bookings.freight_quote_id` FK links them; the booking moves to `quoted`.
- This is exactly the **R-5** hand-off — the booking's `estimate_breakdown` is
  the *starting point* the R-5 quote-calculator + 3-bucket builder refines into
  a real quote ([`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) §R-5). The
  booking flow **does not build the quote calculator** — it builds the surface
  that *feeds* it.

### 6.5 The submit→job wiring — into Sales + Pricing

When a customer presses **"ยืนยันการจอง"** (§5.3), a server action
`submitBooking()` runs:

1. **Flip the booking** — `draft → submitted`, bind `profile_id`, stamp
   `submitted_at`, freeze `estimate_total` + `estimate_breakdown`.
2. **Spawn a work-item job** — call the shipped `ensure_work_item()` helper
   (`0080_work_items`) with a **new `entity_type='booking'`**:
   - `entity_type='booking'`, `entity_ref=booking_no`,
   - `type='intake_review'` (the existing work-type for "a new order needs
     first-touch"),
   - `assigned_role='sales'`, `priority` from the service (a customs-clearance
     booking → `high`),
   - `title` = e.g. *"จองใหม่ · เคลียร์ศุลกากร สุวรรณภูมิ · ฿11,800 (ประมาณ)"*.
   - This is the **only schema change `0080` needs** — one value added to the
     `entity_type` CHECK. The booking rides the work-board exactly like a
     `forwarder` or a `contact_message` does.
3. **The job lands on two desks:**
   - **Sales workspace** — via the `work_item` `assigned_role='sales'`, the
     booking appears in the Sales inbox / on `/admin/board`. This **is** the
     **R-3 lead-inbox** entry — a booking is a lead, with a source-channel
     (`source_channel`), a first-touch timestamp (`submitted_at`), ready for an
     owner. The booking flow is, in effect, **R-3's web-form lead source**
     ([`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) §R-3 *"every inbound
     (LINE OA / FB / web form) becomes a lead record"*).
   - **Pricing desk** — the Pricing role sees `submitted` bookings (a
     `/admin/bookings?status=submitted` queue, or a board filter) to formalise
     a `freight_quote` (§6.4). Pricing is reached either by a second
     `work_item` of `type='general'` assigned to the pricing/`ops` role, or
     simply by the Pricing desk filtering the `bookings` list — BK-1 uses the
     list-filter (cheaper); a dedicated Pricing work-item is a BK-2 option.
4. **Notify** — fire `sendNotification()` (the shipped `lib/notifications/`
   rails, reused from `submitContactMessage`): an admin notification to the
   Sales role, and a customer confirmation ("ได้รับการจองแล้ว"). A new
   `notifications.category='booking'` + `reference_type='booking'` value, mirror
   into `lib/notifications/types.ts` — a tiny `ALTER`, the same edit
   `internal-chat-system` §IC-1.2 makes for `work_chat`.
5. **Then the human process runs** — the rep phones / LINEs the customer
   (`bookings.status → contacted`), negotiates against the **two-price model**
   (R-3's `offered` + `target`), Pricing formalises a `freight_quote`
   (`→ quoted`), and on acceptance the booking converts to an order / shipment
   (`→ won`). Each status step is a normal admin action; the `work_item`
   advances alongside (and, once `internal-chat` IC-1 ships, the booking's
   `work_item` carries a thread + a `waiting_for` block — the rep's "รอลูกค้า
   ตอบ" is visible).

### 6.6 `booking_rates` — the option price table (R-5-aligned)

The option rates (labor per worker, tractor per class, doc-handling fees,
upgrade-plan prices) **must not be hardcoded** — the legacy operation's pain was
exactly *"rates hardcoded in JS, stale, changed by decree"*
([`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) §R-5 point 3). So:

```sql
create table public.booking_rates (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,        -- 'labor'|'tractor'|'doc'|'upgrade'
  rate_key    text not null,        -- 'worker'|'tractor_10w'|'tax_invoice'|'insurance'|…
  service_slug text,                -- NULL = applies to all services
  label_th    text not null,
  label_en    text not null,
  unit_amount numeric(12,2) not null,
  active      boolean not null default true,
  valid_from  date,
  created_at  timestamptz not null default now()
);
```

- This is **the same `quote_rates` table R-5 specifies** — `mode`/`key`/`base`/
  `valid_from`, admin-editable, kills the stale-hardcoded-rate pattern. The
  booking flow and R-5 **share this table**: R-5's quote-calculator and the
  booking detail page read the same rates. BK-1 ships `booking_rates` seeded
  with today's hardcoded numbers; if R-5 lands first, the booking flow consumes
  R-5's `quote_rates` instead and `booking_rates` is dropped from BK-1 (a §9
  open coordination point with ภูม).
- The **base-service** price still comes from the shipped `calc*` functions
  (`lib/booking-calculator.ts`) in BK-1 — moving *those* rate tables into the DB
  is R-5's job, not the booking flow's. The booking flow only needs the
  **option** rates in a table.

### 6.7 Data-flow summary

```
PUBLIC                          INTAKE                    BACK-OFFICE
                                                          (existing + R-3/R-5)
booking detail page             bookings (draft)
  options + calc* + rates  ───▶   booking_options    
  "จองเลย" → auth gate                 │
                                       │ submit
                                       ▼
                                bookings (submitted)
                                  estimate frozen
                                       │
                          ┌────────────┼─────────────────┐
                          ▼            ▼                  ▼
                   work_item       Sales inbox       Pricing desk
                  entity_type=     (= R-3 lead)      reads submitted
                   'booking'                          bookings
                  assigned_role=                          │
                   'sales'                                │ create
                          │                               ▼
                          │                       freight_quote (V-E6)
                          │                       ← bookings.freight_quote_id
                          ▼
                  /admin/board · the rep
                  works the job, negotiates,
                  status: contacted → quoted → won
```

---

## 7. Build phases

Sequenced by Pacred's #1 lens — **customer acquisition / "กดซื้อ"**
([`../../AGENTS.md`](../../AGENTS.md) §2). BK-1 is the phase that converts the
calculator from decoration into a real booking surface — it is genuinely P1,
the **convert** half of the find→convert→buy chain.

### Phase BK-1 — minimal-viable (the "decoration → real booking" cure)

The smallest set that makes a booking card lead to a **real, usable booking
experience** that produces a job.

| # | Deliverable | Notes |
|---|---|---|
| BK-1.1 | Migration — `bookings` + `booking_options` + `booking_rates` + the daily `booking_no` serial + RLS (§6.2, §6.3, §6.6) | additive; mirrors `freight_quotes` shape. Number assigned at build time |
| BK-1.2 | Same migration: `+'booking'` to `work_items.entity_type` CHECK; `+'booking'` to `notifications.category` + `reference_type` CHECK; mirror into `lib/notifications/types.ts` (§6.5) | tiny `ALTER` + type edit |
| BK-1.3 | `lib/booking/service-config.ts` — the per-service selector manifest (which of the 5 selectors + which upgrades apply per service) + the related-article tags (§4.3, §4.5) | static config; cargo/freight services first |
| BK-1.4 | The booking detail page — `app/[locale]/(public)/book/[service]/[route]/page.tsx` — Trip.com two-column layout, reusing the customs-landing `grid lg:grid-cols-[1fr_380px]` + sticky pattern (§4.1, §4.2). `export const dynamic = "force-dynamic"` (renders `<NavBar>`) | one page template, all services |
| BK-1.5 | The 5 option selectors as components — labor stepper · tractor select · doc-attach uploader · doc-handling radio · **a basic pin picker** (BK-1: a simple address-input + an embedded map showing the pin; full draggable-map UX is BK-2) (§4.3) | `components/booking/options/` |
| BK-1.6 | The live quotation panel — `<QuotationPanel>`: `useMemo` over the option state, base row from the shipped `calc*`, option rows from `booking_rates`, itemised receipt, the estimate disclaimer (§4.4) | the reactive heart — the decoration→real change |
| BK-1.7 | The side rail — upgrade-plan card (adds quote rows) + related-article tag chips (§4.5) | reads the BK-1.3 manifest |
| BK-1.8 | Mobile — the bottom sticky quote bar + the tap-to-expand breakdown sheet (§4.6) | designed at 360/390px first; `mobile-first-verify` gate |
| BK-1.9 | The auth gate — `/book-start` route (mirrors `/start-order`) + the "สมัครก่อนมั้ย" prompt + the draft-booking carry (§5.1, §5.2, §5.4) | reuses the shipped `next` redirect contract |
| BK-1.10 | `actions/bookings.ts` — `createDraftBooking` (anon-callable) · `submitBooking` (flip + `ensure_work_item` + notify, §6.5) · the customer-side read actions | service-role for the job spawn; mirrors `actions/contact.ts` |
| BK-1.11 | The review + confirmation pages — review (one last look) → submit → confirmation with the `BKYYMMDD-NNNN` reference + "ทีมขายติดต่อกลับ" (§5.3) | no dead-end (§2.8 #5) |
| BK-1.12 | `/bookings` + `/bookings/[bookingNo]` — the customer's own booking list + per-booking status (§3.2) | protected; reuses the portal-list pattern |
| BK-1.13 | The entry-point CTAs — a **"เปิดบุ๊กกิ้ง"** button in `ResultBox` beside `QuoteCTA`; a **"จองออนไลน์"** CTA on the customs landing pages; a **"จองเลย"** action on `/services` cards (§3.3) | small edits to shipped components |
| BK-1.14 | A minimal **`/admin/bookings`** list — the Sales/Pricing desk view of `submitted` bookings, with the status filter (§6.5 step 3) | the back-office receiving surface; reuses the admin-list pattern |
| BK-1.15 | i18n th/en for every new string (§4.7's estimate vocabulary, the selectors, the panel) | `pnpm audit:i18n` gate |

**BK-1 delivers the lead's ask in full:** a booking card → a real booking
detail page → option selection with a live itemised "ราคาประมาณการ" → an auth
gate that asks "สมัครก่อนมั้ย" and carries the selection across register → a
submit that produces a `BK` reference *and* a job on the Sales + Pricing desks.
Effort: **L** — one migration, one page template, ~6 option/panel components,
one action file, the auth-gate route, two customer pages, one admin list — but
each piece **rides shipped infrastructure** (`calc*`, the `/start-order`
pattern, `0080` work-board, the notification rails, the customs-landing
layout), which is what keeps an L-effort feature from being an XL one.

### Phase BK-2 — depth (post-launch polish)

| # | Deliverable | Why later |
|---|---|---|
| BK-2.1 | **Full draggable map pin picker** — a real interactive map (จุดรับ / จุดส่ง draggable pins, address reverse-geocode) replacing BK-1.5's basic address-input | needs a chosen map provider; BK-1's address-input is enough to capture the data |
| BK-2.2 | **Distance-based pricing** — a `ค่าระยะทาง` quote row computed from the pin distance (§4.3 selector #3) | depends on BK-2.1's real coordinates + a distance/rate model |
| BK-2.3 | **Per-route SEO booking pages** — generate `/book/[service]/[route]` statically for the high-traffic origin-destination + port slugs (the customs-port set, the China-origin lanes) with per-route metadata | an SEO play; pairs with ปอน's data-driven landing-template work |
| BK-2.4 | **Abandoned-draft → lead nudge** — a `draft` booking that sits N days surfaces to a rep as a soft lead ("someone configured a booking and didn't finish") (§5.4) | a real R-3 refinement; needs R-3's lead-scoring to exist |
| BK-2.5 | **A dedicated Pricing work-item** — instead of the BK-1 list-filter, spawn a second `work_item` to the pricing/`ops` role on submit (§6.5 step 3) | a routing nicety; the list-filter works first |
| BK-2.6 | **Saved / re-run a booking** — a customer re-opens a past booking, tweaks options, re-submits | quality-of-life; needs BK-1 proven |
| BK-2.7 | **Booking → `freight_quote` one-click pre-fill** — a button on `/admin/bookings` that creates a `freight_quote` draft pre-filled from the booking (§6.4) | this is the **R-5 seam** — schedule it *with* R-5, not before |
| BK-2.8 | **Internal-chat thread on the booking job** — the booking's `work_item` gets the IC-1 thread + `waiting_for` block (the rep's "รอลูกค้าตอบ" becomes visible) | rides `internal-chat` IC-1 — schedule after it ships |

### Phase BK-3 — reach (later, optional)

| # | Deliverable | Why last |
|---|---|---|
| BK-3.1 | **Real-time estimate refresh** — if `booking_rates` change while a draft is open, the panel refreshes (Supabase Realtime) | a polish; rates rarely change mid-session |
| BK-3.2 | **Booking analytics funnel** — `clarityEvent()` / GA4 on each step (detail-view → option-change → จองเลย → register → submit) so the convert funnel is *measurable* | depends on Phase 1 R-2 (the monitoring env vars switched on) |
| BK-3.3 | **Booking templates per service for the 9 expansion services** — extend the selector manifest as customs-broker / tax-refund / export / fumigation / consignment come online | gated on those services existing ([`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) Phase 3) |
| BK-3.4 | **A "book again / re-order" surface in the customer portal** — repeat bookings from `/dashboard` | a retention feature, post-acquisition |

---

## 8. Risks & guard-rails

| Risk | Guard |
|---|---|
| **The estimate is mistaken for a final price** — a customer holds Pacred to the web number | §4.7's estimate-honesty rule is a *hard design constraint*, not a footnote — "ราคาประมาณการ" in the headline, the panel, the footer, the confirmation; the two-price negotiation is the explicit model. The price gets them to "จองเลย"; the rep closes the real number |
| **An auth wall in front of browsing kills the funnel** — the #1 booking-funnel mistake | §2.6 / §5.1: a guest selects **every option freely**; the gate fires **only on "จองเลย"**, and even then carries the selection across register so nothing is lost |
| **The booking flow re-builds R-3 / R-5** — scope creep into ภูม's lane | This doc owns the **submit surface only**. The booking *is* an R-3 lead-source and *feeds* R-5's calculator; §6.4 + §6.5 define the hand-off as a *contract*, not a re-spec. `booking_rates` is explicitly the *same* table R-5 specifies — to be merged with R-5 at build time (§6.6, §9) |
| **Hardcoded option rates go stale** — the exact legacy pain | §6.6: option rates live in `booking_rates` (an admin-editable, `valid_from`-versioned table — R-5's `quote_rates` pattern), never in code |
| **A booking submit reaches no desk / is silently lost** | §6.5: submit spawns a `work_item` (`assigned_role='sales'`) **and** fires `sendNotification()` — the job is on `/admin/board` + in the Sales inbox + a notification is sent. The `work_item` is the durable "this is now your job" signal |
| **Guest-draft RLS is too open** | §6.3: anon can **only** `INSERT` at `status='draft'`, **cannot select back** except via the opaque `?draft=<id>` token; a draft carries no PII; the app-layer action is the real guard |
| **A page under `[service]/[route]` 500s in prod** (`DYNAMIC_SERVER_USAGE`) | The booking detail page renders `<NavBar>` → it **must** carry `export const dynamic = "force-dynamic"` ([`../../AGENTS.md`](../../AGENTS.md) §11; the customs-landing `[port]` page already does this) |
| **Mobile booking is unusable** — most customers are on phones | §4.6: the page is designed at 360/390px first; the desktop sticky panel becomes a bottom sticky quote bar; tap targets ≥ 44px; the `mobile-first-verify` skill gates BK-1.8 |
| **The doc gold-plates** — `customs`/`remit`-only modes get full selectors they don't need | §4.3: the per-service selector manifest (`service-config.ts`) decides which selectors render — a money service shows only the document-handling selector, not labor/tractor/pins |

---

## 9. Open questions (for เดฟ / ภูม)

1. **`booking_rates` vs R-5's `quote_rates`** — they are the same table by two
   names. If R-5 lands first, the booking flow consumes `quote_rates` and BK-1
   drops `booking_rates`; if BK-1 lands first, R-5 adopts `booking_rates`.
   Needs a one-line coordination with ภูม so it is built once. (§6.6)
2. **One door or two from the calculator** — BK-1 keeps both the shipped
   `QuoteCTA → /start-order` (fast self-serve order) *and* the new "เปิด
   บุ๊กกิ้ง" (considered booking). Is the fast door still wanted long-term, or
   does every priced result eventually route through the booking page? (§3.3)
3. **Does Pricing get its own `work_item`** on submit, or work off a
   `/admin/bookings` list filter? BK-1 uses the filter (cheaper); BK-2.5 can add
   the dedicated work-item. Confirm the Pricing desk's preferred surface. (§6.5)
4. **The map provider** for the pin picker — BK-1 ships a basic address-input +
   a static map; BK-2.1 needs a chosen interactive-map provider (cost +
   ecosystem-fit per the build-vs-buy lens). Defer to ก๊อต's tool pick.
5. **The Sales-contact SLA** — the confirmation page promises "ทีมขายติดต่อกลับ
   ภายใน [SLA]". What is the SLA number? (a sales-ops decision, not a
   design one).
6. **`route_slug` taxonomy** — the canonical slug set for `[route]` (port slugs,
   origin-destination lanes) should be defined once and shared with ปอน's
   landing-page route taxonomy so booking URLs and landing URLs align for SEO.

---

## 10. Cross-references

- 🧭 The customer-acquisition strategy this serves → [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md) (Priority 1 — the booking flow closes the named "break #3", the calculator→กดซื้อ dead-end)
- 📋 The roadmap this slots into → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) — the booking flow is the **convert** surface; schedule BK-1 in Phase 1/2 as the customer-acquisition P1
- 🧩 The backend desks this feeds (do NOT re-spec) → [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) §R-3 (lead-inbox / CRM — the booking *is* a web-form lead source) · §R-5 (in-house quote-calculator — the booking *seeds* a `freight_quote`)
- 🏗 The job spine a submitted booking rides → migration `0080_work_items` (`entity_type='booking'` is the only schema add) · the work-board design in [`operating-system-analysis-2026-05-18.md`](operating-system-analysis-2026-05-18.md) §1.4
- 💬 The thread layer a booking job inherits later → [`internal-chat-system-2026-05-18.md`](internal-chat-system-2026-05-18.md) (IC-1 — the rep's "รอลูกค้าตอบ" `waiting_for` block)
- 🧾 The formal quote a booking becomes → migration `0048_freight_quotes` (V-E6) — booking ≠ quote; booking seeds a quote (§6.4)
- 🔧 The price engine reused → `lib/booking-calculator.ts` + `components/booking/BookingCalculator.tsx` (the shipped `calc*` formulas)
- 🌉 The auth-gate pattern reused → `app/[locale]/(public)/start-order/page.tsx` (the shipped public→buy bridge `/book-start` mirrors)
- 📐 The two-column sticky layout reused → `app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/[port]/page.tsx` (the proven `grid lg:grid-cols-[1fr_360px]` + `lg:sticky` pattern)
- 🔔 The notification rails reused → `lib/notifications/` · `actions/contact.ts` (`submitContactMessage` precedent) · [ADR-0001](../decisions/0001-line-notify-replacement.md)
- 📱 Mobile-first → [`../conventions.md` §11](../conventions.md) · [`../mobile-first-playbook.md`](../mobile-first-playbook.md) · the `mobile-first-verify` skill
- ⚙️ Next 16 dynamic-render rule → [`../../AGENTS.md`](../../AGENTS.md) §11 (`force-dynamic` on `<NavBar>`-rendering dynamic-segment pages)
- 🛡 Legitimate-path guardrail → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) cross-cutting (no gray-channel price engineering — the estimate is honest, document-complete)

**End — `booking-flow-system-2026-05-18.md`.** Spine: a `bookings` +
`booking_options` intake pair behind a Trip.com-modelled **booking detail page**
(`/book/[service]/[route]` — main content + a sticky itemised quotation panel +
an upgrade-plan / related-article side rail), five option selectors (แรงงาน ·
หัวลาก · pin pickup/drop · attach documents · document-handling mode) that
recompute a live **"ราคาประมาณการ"** receipt, an auth gate that asks "สมัคร
ก่อนมั้ย" only at commit and carries the selection across register, and a submit
that spawns a `work_item` job into the Sales + Pricing desks — **feeding**, not
re-specifying, ภูม's R-3 lead-inbox + R-5 quote-calculator. Minimal-viable
(BK-1): the detail page + the five selectors + the live quotation panel + the
auth gate + the intake tables + the submit→job wiring — the change that turns
the calculator from decoration into a real booking that produces a job.
