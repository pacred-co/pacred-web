# R&D — Customer Portal (Tracking + Self-Service)

> **Author:** Dr. Customer-Portal — specialist R&D agent · **Audit date:** 2026-05-19
> **Scope:** Pacred customer-facing portal under `app/[locale]/(protected)/*` — the surface ~8,898 migrated PCS customers + every new signup touches daily.
> **Audit branch:** `dave` (worktree `frosty-bhaskara-a38ced`).
> **Sister docs (R&D 2026-05-19):** 01 mobile-UX · 02 marketing · **03 (this)** · 04 admin/employee · 05 devops · 06 backend/integrations · 07 billing · 08 tracking/docs.
> **Owner's mandate (re-read):** *"ทำให้คนที่ไม่รู้อะไรเลยก็นำเข้าได้"* + the 4-axis tracking ask — ตู้ / ชิปเม้น / สินค้า / เอกสาร — in **one place, on a phone**.
> **Bottom-line verdict:** the spine is genuinely strong (Phase 1 + U1-7 + U4 + V-D2 + V-D3 + V-E10 all landed), but it is **fragmented across five surfaces** that no single page unifies — and the customer-side **issue / claim / chat / refund-by-photo / document-status / payment-status-in-one-view** loops are still LINE-chat-bound. Phase B (ADR-0017 — faithful PCS port) restored the launchpad but did not close the unified-tracking gap.

---

## 0. TL;DR

1. **The "unified tracking view" the owner asked for does NOT exist.** Goods + container + documents + payment status live in **five separate pages** and one DB has no surface at all (documents). The closest thing to a unified view is `/shipments/[code]` — but it shows container + scan-events + QA, and is silent about the customer's payment status, their invoice/tax-invoice state, and any documents (Form E / D-O / commercial invoice). A customer who wants the full picture must visit `/shipments` → `/service-import/[fNo]` → `/wallet/history` → `/service-import/[fNo]/receipt` separately. (§1.2)
2. **Notifications are append-only DB rows + a polled bell.** No web-push, no PWA, no email-fallback wired in production, **LINE Messaging API push is wired but env-gated off** (`LINE_PUSH_BYPASS` defaults true). When a container moves from `ek_arrived_mukdahan → unloading_in_thailand`, the customer learns about it only by re-opening the app. The "real-time updates" the chat audit's L-4 demanded are partially built (`U1-7` freshness pill, Realtime channel on the bell) but the **outbound** channels are silent. (§2.1)
3. **There is no customer-facing "report a problem" entry-point.** The only ways to flag damage / missing / wrong-item / weight-dispute today are (a) a one-line "📞 ติดต่อทีมงาน LINE @pacred" link on the QA-fail card, (b) the LINE OA card on `/refunds`, (c) an admin-only QA inspection viewable read-only. The customer can SEE the staff's `fail_minor`/`fail_major` finding but cannot ATTACH a photo, escalate, or open a claim. Gap-customer G-C2 was filed; it is unbuilt. (§3.2)
4. **Surprise — the *issue I as the customer hit using the website* loop is more mature than the *issue I hit with my goods*.** `/my-issues` (IO-1, design doc `platform-observability-system-2026-05-18.md` §6.6) auto-captures runtime errors and shows the customer their lifecycle status. But there is **no mirror** for *physical-goods* problems. Pacred lets a customer track a Sentry-captured 500 it gave them by name, but not the missing box from container GZE260516-1 with a photo. The shape is right; clone it across.

---

## 1. Current state — what the customer can actually do today

### 1.1 Inventory of customer surfaces (post-launch, `dave` at 2b800fb)

The protected layout (`app/[locale]/(protected)/layout.tsx`) renders a sidebar + navbar + `FloatingActionMenu` + `TosGate`. Every customer route is `requireAuth()`-gated and RLS-scoped. The 19 protected surfaces:

| Surface | Path | What it does | Status |
|---|---|---|---|
| Launchpad | `/dashboard` | PCS-port 9-icon grid + wallet card + sales rep + Pacred secondary stats | ✅ shipped 2026-05-19 (`4ac5d9d`) — closes ADR-0017 D1 row 1 |
| Order list | `/service-order` | Tab-filtered list of ฝากสั่ง (China shop) orders | ✅ shipped + Phase-B fidelity (`8dfd5f3`) |
| Order detail | `/service-order/[hNo]` | Items · status · pay-from-wallet · cancel | ✅ shipped |
| Order receipt | `/service-order/[hNo]/receipt` | PDF + `TaxInvoiceRequestPanel` | ✅ shipped + ADR-0006 G2b |
| Cart | `/service-order/cart` + `/service-order/add` | Manual add (legacy link-paste search still 🔴 D1-gap) | ✅ shipped, fidelity-incomplete |
| Import list | `/service-import` | Tab-filtered ฝากนำเข้า + fixed bottom "pay now" bar | ✅ shipped |
| Import detail | `/service-import/[fNo]` | Cover · items · price breakdown · `DeliveryAckPanel` (U4-3a) · container badges · forwarding-instruction recap (G-C5) | ✅ shipped |
| Import receipt | `/service-import/[fNo]/receipt` | PDF + `TaxInvoiceRequestPanel` | ✅ shipped |
| China warehouse addr | `/service-import/warehouse-addresses` | Two warehouses (Yiwu/Guangzhou) with member-code shipping-mark | ✅ shipped (data was the 2026-05-19 podeng push, `3690108`) |
| Receipts archive | `/service-import/receipts` | Date-range filter + total amount + print PDF | ✅ shipped |
| Yuan transfer | `/service-payment` + `/service-payment/[id]` | ฝากโอน list + detail + tax-invoice ask | ✅ shipped — but G-C4 (tax-invoice for yuan_payment) still gapped |
| Yuan transfer (new) | `/service-payment/add` | New transfer form | ✅ shipped |
| Wallet hub | `/wallet/history` | 4-tab (all / deposit / payment / withdraw) + balance hero + cashback + credit panel | ✅ shipped + U4-2 credit |
| Wallet deposit | `/wallet/deposit` | Slip upload | ✅ shipped, OCR not wired |
| Wallet withdraw | `/wallet/withdraw` | Withdraw request | ✅ shipped, but H-1 overdraw gap (`gap-customer` §3) — see §3.5 below |
| Shipments list | `/shipments` | Customer's cargo_shipments + freshness pill | ✅ shipped (T-P2 / CT-3) |
| Shipment detail | `/shipments/[code]` | Container card + timeline + box-receive bar + QA result | ✅ shipped + V-D2/D3/C3 + V-E10 |
| Refunds | `/refunds` | Create refund-request (forwarder · service_order · yuan_payment) + history | ✅ shipped (U1-6) — but no `freight_shipment` source |
| Notifications | `/notifications` | Inbox list (`listMyNotifications(100)`) + mark-read | ✅ shipped |
| My issues | `/my-issues` | **Platform**-incidents (IO-1) — bugs the *site* gave the customer | ✅ shipped — see §1.3 |
| Bookings | `/bookings` + `/bookings/[bookingNo]` | Booking-flow R&D ship; status submitted → won + booking docs | ✅ shipped 2026-05-18 (`0079_bookings`) |
| Freight quotes | `/freight/quotes/[quote_no]` + accept | Sea-freight FCL stub | 🟡 stub but accept-quote action works |
| Freight shipments | `/freight/shipments` + `/freight/shipments/[id]` | Customer-side freight list | 🟡 minimal — invoice surface incomplete |
| Sales / commissions | `/sales/*` · `/commissions/me` | For staff-customer (role-gated inside) | ✅ shipped |
| Profile / addresses | `/profile/*` · `/addresses` | Standard account management | ✅ shipped |

**That is a long, real list.** What's interesting is what it **doesn't** include: no documents surface, no chat / message thread (the booking detail has a status-message field but no two-way messaging — internal-chat IC-1 is admin-only via `actions/admin/work-item-messages.ts`), no public (logged-out) tracking lookup (gap-customer H-5; planned but unshipped under R-1), no `report-problem` entry-point, no "your container is closing in 2 days — push" outbound channel.

### 1.2 The 4-axis tracking — what's wired, what's split, what's silent

The owner's exact ask (translated): "in ONE place, the customer sees — where are my goods, where is the container, what's the document status, what's the payment status."

**The current state per axis:**

| Axis | Where it lives | Real-time? | Customer-visible-without-asking? | Score |
|---|---|---|---|---|
| 📍 **Goods** (where my boxes are) | `/shipments/[code]` — `cargo_shipment_tracking` timeline + `received_box_count/box_count` (U1-5) | No (server-rendered, manual reload) | ✅ yes — pull, not push | 🟢 7/10 |
| 📦 **Container** (which container, ETA, ตัดตู้ date) | `/shipments/[code]` "Hero status card" + V-C3 close-date hint; also embedded on `/service-import/[fNo]` aside card | No, server-render only | ✅ yes — pull | 🟢 7/10 |
| 🧾 **Documents** (invoice issued? tax-invoice? Form E? D-O? customs?) | **Nowhere unified.** Receipts only via `/service-import/[fNo]/receipt`; tax-invoice via `TaxInvoiceRequestPanel`; Form E / D-O / commercial invoice = freight surface, ภูม-side incomplete | No | ❌ partial — receipts only | 🔴 3/10 |
| 💰 **Payment** (paid? pending? overdue? credit drawn?) | Status badge on order/import row + `/wallet/history` table + `/service-import` bottom-bar `pendingTotal` | No | 🟡 fragmented — 3 surfaces | 🟡 5/10 |

**Net result: the customer must hop across `/shipments/[code]` → `/service-import/[fNo]` → `/wallet/history` → `/service-import/[fNo]/receipt` to assemble what could be one card.** The legacy PCS portal also failed at this; the chat audit (`docs/audit/chat-analysis-2026-05-16.md` §"Customer pain themes") confirms the #1 customer question — "ตู้ X เข้าเมื่อไหร่" — is exactly this fragmentation symptom.

The architecture for a unified view **is already in place**:
- `cargo_shipments` JOIN `cargo_containers` → goods + container ✅ wired
- `cargo_shipments.forwarder_f_no` / `service_order_h_no` FK → order + payment ✅ wired
- `tax_invoices` table (migration 0034) → documents ✅ wired but un-joined
- `freight_invoices` table (migration 0052) → freight documents ✅ wired but un-joined

What's missing is one **`/track`** page (or one card on `/dashboard`, or one tab on `/shipments/[code]`) that runs the four queries in parallel and renders one card. ~6 hours of work, including a Postgres view for the cross-table read.

### 1.3 The IO-1 platform-observability pattern is the model

`/my-issues` (`MyIncidentsPanel`) is the closest thing in the codebase to a customer-facing "lifecycle status of a thing I care about" surface. Its shape:

- A user hits a runtime error
- `app/api/_lib/incident-capture.ts` (V-D auto-incident hook) writes a row to `platform_incidents` with `actor_ref = redactId(uid)`
- The customer sees the row on `/my-issues` with status `open → acknowledged → in_progress → resolved` (per `lib/validators/platform-incident.ts`)
- No submit button — the captured-and-visible-status is the design pattern from `platform-observability-system-2026-05-18.md` §6.6 — "the user sees the status"

This is exactly the shape Pacred needs for **physical-goods incidents** (missing box / damaged / wrong item / weight dispute / customs hold). The data path is half-built: warehouse staff already enter `freight_qa_inspections` rows (V-E10) and the customer sees `outcome: fail_major` on `/shipments/[code]`. What's missing is the **customer entry-point** (G-C2 — file a claim from the same screen, attach a photo) and the **lifecycle UI** (claim status visible like an incident is). The IO-1 pattern is one factor-out away from being two patterns.

**The structural argument:** in `MyIncidentsPanel`, lines 53-60, the lookup uses the `actor_ref` redacted-uid join to filter incidents to *this customer's events*. RLS on `platform_incidents` enforces the same predicate via the `owner_select` policy (migration 0077). Replicating the shape for a `customer_issues` table requires: a `profile_id` FK + a `ref_table` enum (`forwarder|service_order|cargo_shipment|freight_shipment`) + a `ref_id` text → identical RLS predicate (`profile_id = auth.uid()` for the customer; `is_admin(['super','ops','warehouse','accounting'])` for staff). The Server Component pattern (no client JavaScript needed for the read) is also reusable.

The IO-1 pattern also gives the team an answer to the "but customers will spam claims" worry: **claims aren't submissions; they are records of conversations the customer + Pacred already had.** A claim row exists because a real event happened (a QA-fail-major fired; a delivery was 5 days late; a box was short). The customer files because the staff opened a row. Or — for unprompted reports — the customer files, and staff acknowledge by routing it to the relevant `work_item`. Either way, the customer's view is a status, not a chat.

### 1.2.1 Shipment-tracking surface — what the customer actually sees

A walk-through of `/shipments/[code]` (the strongest customer-facing surface):

1. **Hero status card** — current status + freshness pill ("🔄 5 นาทีที่แล้ว"). The freshness pill is **the single best UX detail** in the entire customer portal: it makes the staleness of data **visible**, which directly counters the chat-audit L-4 trust gap. When staleness exceeds the threshold, the amber/red banner explicitly tells the customer "ติดต่อทีมงานเพื่อตรวจสอบ" — turning a passive wait into an actionable next step.
2. **Container details grid** — code, transport mode, origin/destination, ETA, actual_arrival, carrier B/L (V-D3), cargo type (V-D2). The V-C3 ตัดตู้ countdown is the friendliest detail — "อีก N วัน" vs "วันนี้" with a colour change.
3. **Order references** — links back to `forwarder` and/or `service_order` of origin.
4. **QA panel (V-E10)** — `pass/fail_minor/fail_major/waived` with damage level, missing items count, notes. Customers can SEE staff's QA findings. **But the line `📞 กรุณาติดต่อทีมงาน — LINE @pacred เพื่อหารือเกี่ยวกับการรับสินค้า` is the only escalation path** — that's G3.
5. **Shipment metrics** — U1-5 received/expected progress bar (`receiveBoxCount/box_count`), weight, volume, expected box count. The split-receipt UX ("ได้รับแล้ว 40 / 85 กล่อง") is exactly what chat audit's W-5 + L-2 demanded.
6. **Timeline** — newest-first vertical timeline with event icon dot + label + location + timestamp + note. Source tag (`[momo]` / `[pacred]` / `[customer_scan]`) is visible — the customer knows whose data this is.

What this page is missing:
- **Payment status anywhere on the page** — there is a link back to the parent order, but no inline "✅ ชำระแล้ว ฿2,340" badge. Customer hops away to check.
- **No copy-to-clipboard for the shipment_code** — useful when sharing with a recipient
- **No "share tracking" button** — the recipient (not the account holder) cannot see the timeline; H-5 / R-1 still gaps the logged-out view
- **No realtime subscription** — page is server-rendered + manual reload only (the `notification-bell.tsx` Realtime channel is the architectural precedent — adding a Realtime subscription on `cargo_shipment_tracking` filtered to this shipment_id would auto-render new events without reload; ~10-line addition)
- **Photos are 0** — no scan photo, no delivery photo, no damage photo. The chat audit's W-8 (Lalamove dispatch tracking) flagged courier-photo-proof as standard expectation; not built.

### 1.3.1 Wallet UX — what's good, what's missing

The wallet hero (`app/[locale]/(protected)/wallet/history/page.tsx` lines 103-133) is one of the most polished customer surfaces in the codebase — orange gradient, animated balance counter, full-name greeting, two CTAs (เติมเงิน / ถอนเงิน). It directly mirrors the legacy `20260311wallet.php` design (the D1 fidelity doc's wallet table marks 5 of 7 elements as ✅ ported).

What works:
- The 4-tab filter (all / deposit / payment / withdraw) tracks the legacy 4-tab convention
- The `CreditLinePanel` (U4-2) lights up when `credit_limit_thb > 0` — credit-line surface is now real, not the dead UI gap-customer G-C1 flagged
- The `CancelPendingButton` (gap-customer H-3 fix) gives the customer a self-service "I attached the wrong slip" path
- The 3-bucket display (เงินสด / Cashback / เครดิต) is faithful to the legacy mental model
- Receipt reference + note shown per row (line 244 — `tx.note` line-clamp-2, then `tx.reference_id` font-mono fallback)

What's missing / weak:
- No filter for "show only my container `GZE260516-1` transactions" — the customer cannot answer "how much have I spent on this container?" without ad-hoc math
- No per-bucket history tabs — Cashback and Credit transactions are merged into the main table; a customer earning cashback over months sees it scattered
- No "outstanding by container" rollup card — given a customer can be paying for 3 containers simultaneously, a summary widget ("คุณค้างชำระ ฿X ใน 3 ตู้") would be more useful than the global "pending: N รายการ" sum at the bottom of `/service-import`
- The credit-line panel pays only into "all credit" (not per-container) — for credit-enrolled customers tracking 4 imports, per-import outstanding is invisible

These are tier-2 polish, not launch-week. But noting: the wallet is **one of the highest-engagement customer surfaces** (every payment + every deposit touches it) — UX investment here compounds.

### 1.4 Self-service workflows — what the customer can do alone

Things a customer can do without LINE-messaging staff:

✅ Self-service today (post-launch):
- Sign up + verify OTP via ThaiBulkSMS
- Top up wallet via slip-upload (`/wallet/deposit`)
- Withdraw from wallet (`/wallet/withdraw`)
- Place ฝากสั่ง order (`/service-order/add` — manual product form, the legacy link-paste search is 🔴 D1-gap)
- Add ฝากนำเข้า / register tracking (`/service-import/add`)
- Pay from wallet (`payServiceOrderFromWallet` / `payForwarderFromWallet` per ADR-0014)
- Request a refund (`/refunds`)
- Request a tax invoice on order or import (`TaxInvoiceRequestPanel`)
- Cancel a service-order pre-payment (`/service-order/[hNo]/cancel-button`)
- Cancel a pending wallet deposit/withdraw (`CancelPendingButton` — gap-customer H-3 fix ✅ shipped)
- Acknowledge delivery (`DeliveryAckPanel`, U4-3a — gap-customer G-C3 ✅ shipped)
- Update profile / change phone / change password
- Add / edit shipping addresses
- View own bookings + booking documents

🟡 Self-service partially blocked or buggy:
- **Pay from wallet** — works, but `H-2` (post-debit status-flip failure leaves money debited + order still `awaiting_payment`) is unfixed; rare but high per-incident pain (see §3 of `gap-customer.md`)
- **Withdraw** — works, but `H-1` (stacked-pending-debit overdraw) is unfixed; gap-schema-security S-5 + master strategy §2 W-3
- **Tax invoice for ฝากโอน (yuan_payment)** — silently impossible; G-C4 unbuilt
- **Refund for freight** — `refund_requests.source` excludes `freight_shipment`; juristic freight customers cannot self-serve

❌ Not self-service today — LINE-only:
- Report missing / damaged / wrong / shortfall (G-C2 unbuilt)
- Request weight-dispute / CBM-dispute resolution (closely tied to V-D1 reconciliation; admin-only today)
- Pay for a freight invoice via wallet (`freight_invoice_payments.method='wallet'` is in the CHECK but `recordFreightPayment` doesn't debit — master strategy §2 W-3 G-3)
- Re-upload a rejected deposit slip (gap-customer H-6 unbuilt)
- Edit a pending service-order (G-C6 unbuilt — cancel-and-recreate is the only path)
- Request a status rollback after a wrong staff action (V-A2 unbuilt — staff also can't, has to go to dev)

### 1.5 Customer mental-model snags

A few cognitive frictions a new (or migrated) customer hits, that the code surfaces only obliquely:

- **"ฝากสั่ง" vs "ฝากนำเข้า"** — the legacy PCS naming is "shop-order" and "import," respectively, but a beginner *can't tell* which they need. The cart-only customer (Taobao) is `service-order`; the customer with their own China shipment (already-bought goods) is `service-import`. The 9-icon launchpad has both visible — that's faithful, but the first-time customer doesn't have the mental model. **A 1-line distinguishing subtitle on each grid tile** (the `pcsHome.tileShop` / `tileImport` i18n keys, edited) would help. Effort: trivial.
- **"ตู้คอนเทนเนอร์" is operational, "Shipment" is the customer's mental model** — the legacy customer thinks "my parcel" (parcel-level tracking). Pacred has both layers (`cargo_shipments` = customer parcel + `cargo_containers` = the bulk vessel), and the `/shipments/[code]` page renders both. But the dual layer can be confusing: the customer's status badge is `cargo_shipments.status` (8 values: received_cn → delivered), the container has its own status (6 values: packing → closed). When they're misaligned (shipment `in_transit`, container `arrived`), a customer asks "which is true?" Recommend: surface only ONE narrative on the customer card — use the shipment status as the primary, treat container status as a sidebar/context only. The hero-card design already does this implicitly; just verifying it stays that way.
- **`forwarder.f_no` (`F-2026-…`) vs `cargo_shipment.shipment_code` (`SH-GZE…-PR…-01`) vs `cargo_container.code` (`GZE260516-1`)** — three identifiers, three formats, all visible on the `/service-import/[fNo]` page's cargo card. A customer searching their LINE chat for "GZE260516-1" finds nothing matching the order they paid. Cross-reference search needs to handle all three (admin-side `bulk-tracking-search.ts` does; customer search doesn't yet exist — would help with G6).
- **"Payment-due" tension** — `forwarders.payment_due_at` is shown on the dashboard MiniStat but **not** as a countdown on `/service-import/[fNo]` itself (the page just shows "{t("payByBanner")}" with the amount — no time). A "ชำระภายใน 24 ชั่วโมง" countdown reduces "did I miss it" anxiety. The expiration logic is server-side; surfacing it client-side is a 3-line addition.
- **"What if I want to ask in Thai vs English?"** — the portal is `next-intl` with TH default; English customers (juristic / international) are explicitly TH-fallback'd. Likely fine for the 8,898 PCS-migrated cohort (Thai), but a juristic English-first customer hits awkward TH-only screens. R&D 02 (marketing) will cover this from the inbound side; flagged here so the customer-portal English coverage is on the table.

---

## 2. Gaps — ranked by signal × severity × revenue lens

Effort: **S** ≤2d · **M** 1-2 wk · **L** 2-4 wk · **XL** > 1 mo.

### G1 🔴 — No unified-tracking view (the headline owner ask)

- **What:** the 4-axis card the owner specifically named — goods + container + documents + payment — does not exist in any single surface. Closest is `/shipments/[code]` which is goods + container only.
- **Why it matters:** every customer question in the chat audit (`docs/audit/chat-analysis-2026-05-16.md` §"Customer pain themes") rooted in this fragmentation. Daily sales-team hours go into stitching together a hand-typed response that should be one screen. With 8,898 migrated customers + a launched product, **every chat ticket saved by a unified view = revenue defended.**
- **Build:** one `/track` route (or `/shipments/[code]` upgraded with two more cards):
  1. *Goods + container* card (already exists)
  2. *Payment* card — `forwarders.status` × `total_price` × `wallet_transactions` for this order × `wallet.credit_balance` if applicable
  3. *Documents* card — `tax_invoices` × `freight_invoices` × (future) Form E status × (future) customs-clearance status. Link to receipt PDF.
  4. *Issues* card — `freight_qa_inspections.outcome` for this shipment + (future) customer-filed claims (G-C2)
- **Effort:** S–M (queries are RLS-safe + already wired; ~6h to ship a tabbed view; longer for a fully designed `/track`)
- **Owner alignment:** *direct match* to the owner ask.
- **Implementation note (what to NOT do):** the temptation is to build `/track/[code]` as a fresh route. Don't — the URL the migrated PCS customer already knows is `/shipments/[code]` (sidebar pin + dashboard tile). Add two cards to that page instead. Resist the rebuild instinct (AGENTS.md §4 V2≠V3 — don't refactor mid-flight). A `/track` route is later — once the cards prove out.
- **Implementation note (the query):** the four cards can be one parallel `Promise.all` of four `supabase` queries (already the `/shipments/[code]` shape — lines 95-111 of `app/[locale]/(protected)/shipments/[code]/page.tsx` already does this for QA). One RLS-safe view (`customer_tracking_unified`) is cleaner, but the parallel-queries shape is shippable in a single PR.

### G2 🔴 — Outbound real-time channels are env-gated off (LINE + email)

- **What:** `LINE_PUSH_BYPASS` defaults to `true` (`lib/notifications/index.ts:25`) → every `sendNotification(profileId, payload)` writes the DB row + logs but **does not push**. `RESEND_API_KEY` is unset → email fallback short-circuits silently. The result: every status change (order completed, container arrived, deposit approved, container ตัดตู้ tomorrow) is invisible until the customer opens the app + clicks the bell.
- **Why it matters:** the chat audit's L-4 ("Customer-facing tracking page reliability — customer trust eroded, sales reps act as human-API") is **exactly** this failure mode. Container-status freshness is presented (U1-7 pill) but the customer must come look — the system never tells them.
- **What's wired:** `lib/notifications/index.ts:107` — `sendLinePush` is fully implemented (Bearer token + `/v2/bot/message/push`). Channel `2009931373` (Pacred Shipping OA) keys received 2026-05-18 (per the file comment). The function is one env-var flip away from working — but in `dave`, it's off.
- **Build:** flip `LINE_PUSH_BYPASS=false` in Vercel + set `LINE_CHANNEL_ACCESS_TOKEN`. Verify `profiles.line_user_id` is populated for migrated PCS customers (link-flow at `/liff/link` per `actions/profile.ts:249`). Then audit: every `sendNotification` call-site should pick a sane category + severity so LINE doesn't spam. Same with Resend for email-fallback.
- **Effort:** S (env flip) + S (audit notification volume) = ~half a day.
- **Cross-link:** master strategy §5.1 — "the 4 launch-day monitoring items" still includes flipping these.
- **Why this is ranked at 🔴 not 🟠:** the entire UX advantage of `cargo_shipment_tracking` (event-level scan timeline + freshness pill + container ETA) is **wasted** if the customer doesn't know to look. The asymmetry is striking: Pacred captures 8 status types per shipment + 6 per container + a real-time freshness gradient, then tells the customer **only when they come asking**. Once G2 ships, every staff scan = a customer push = a chat ticket avoided. ROI calc: at ~4 scan events × 100 shipments/day = 400 customer notifications/day. Even if 20% would have generated a "where is my container" chat at ~3 min each, that's ~4 hours of CS time/day saved.
- **Operational note:** the `LINE_PUSH_BYPASS` env name is intentionally a *negative* flag (`bypass=true → skip`) — flipping to `false` enables push. The flag is defaulted-safe so the dev environment never accidentally spams real customers. Production set is a Vercel-dashboard env-var.

### G3 🔴 — No customer-side issue / claim / problem-reporting loop (G-C2)

- **What:** when a customer needs to report missing / damaged / wrong-item / weight-dispute, the **only** channels are (a) the "📞 LINE @pacred" link on a fail-major QA card, (b) the LINE OA card on `/refunds`, (c) the LINE-only `contactMessageReceived` form. The customer cannot file a structured claim with a photo + a status they can track. Every claim becomes a chat ticket that someone has to remember to update.
- **Why it matters:** chat audit's pain theme #6 "ตกหล่น (missing items) — physical/system mismatch" is one of the top 6. The legacy R-9 plan covered the **staff-side** discrepancy record; this is the **customer-side** entry-point — they are complementary, not duplicates (`gap-customer.md` G-C2 explicit on this).
- **Build:** mirror the IO-1 platform-incidents pattern for physical goods:
  - migration: `customer_issues` table (FK to `cargo_shipments` or `forwarders` or `service_orders`; type enum: missing / damaged / wrong / shortfall / quality; description; photos via `member-docs/` bucket; lifecycle `open → investigating → resolved → rejected`)
  - server action: `customerFileIssue` with photo upload
  - panel: `<MyIssuesPanel kind="goods">` (clone of `MyIncidentsPanel` shape) on `/shipments/[code]` and `/service-import/[fNo]`
  - admin queue: `/admin/customer-issues` (queue + assign + reply)
- **Effort:** M (~1 week — schema + action + customer panel + admin queue; photos via existing `member-docs/` bucket)
- **Owner alignment:** secondary but high — physical claims are the #1 hand-off from product to support today.
- **Why the existing `/refunds` doesn't cover this:** a refund is the **money outcome** of an issue, not the issue itself. A customer can file a refund only when the resolution is "give my money back." Many issues are non-monetary — "send the missing box," "reship the damaged item," "explain the weight discrepancy," "wait for next container." Reusing `refund_requests` for these collapses two distinct concerns. Worse — `refund_requests.source` is constrained to `forwarder|service_order|yuan_payment`, so a `cargo_shipment`-level claim has no source row to attach to.
- **Why this should land BEFORE the freight document suite (V-E1..E4):** the documents are the artifact a juristic customer asks for *because they already have a problem* (weight mismatch on the invoice → ask for Form E recheck). The issue-loop is the substrate; the document suite is the response. Inverting the order means staff get the document workflow before customers have a clean place to ask for documents in the first place.

### G4 🟠 — Outbound real-time / push notifications never reach the phone OS

- **What:** even with `LINE_PUSH_BYPASS=false`, customers who haven't linked LINE OR who use a different messaging app get no out-of-app signal. **No web-push, no PWA installable, no `manifest.json`, no service-worker.** Verified — `find … -name "manifest*" -o -name "service-worker*" -o -name "sw.ts"` returns nothing. The customer cannot install Pacred to their home screen and get a phone notification when their container ETA changes.
- **Why it matters:** for the customer cohort that doesn't use LINE OA + doesn't keep their email open + doesn't keep Pacred open in a tab — *every* status change is invisible until they happen to think about it. Mobile-first Pacred without PWA is a strategic miss: a customer importing 4 containers/year should be able to install Pacred to their phone home screen + get a single tap into the unified-tracking view.
- **Build:**
  1. `public/manifest.webmanifest` + icons (Pacred branding)
  2. `app/manifest.ts` (Next.js 15+ TypeScript manifest)
  3. Optional: a service worker for offline-tolerant tracking page caching (chat audit L-1 — "เว็ปล่ม" — the customer always sees the last-known status, even if Supabase is degraded)
  4. Web-push (VAPID) on top of `sendNotification` — gated by `profiles.notify_channels.webpush`
- **Effort:** S for PWA install (manifest + icons) · M for web-push (VAPID + service-worker push handler). PWA install alone is the 80/20.
- **Cross-link:** mobile-first-playbook + R&D 01 mobile-UX.
- **Realtime status:** Supabase Realtime IS used for the unread-bell badge (`components/notification-bell.tsx` channel `notif-bell-{uid}`) and the cart badge. The technology exists in the dependency graph; it's just not extended to the tracking / shipment surfaces. A Realtime subscription on `cargo_shipment_tracking` for the customer's shipment IDs would make `/shipments/[code]` live-update on scan — a phone-friendly nicety that costs ~15 lines of code. Defer behind PWA + LINE push but worth noting.

### G5 🟠 — Documents-axis is a gap; tax-invoice flow is the only documents UI

- **What:** `tax_invoices` (migration 0034 / 0085 credit-note) is wired into `TaxInvoiceRequestPanel` on the receipt pages. But the customer cannot see (a) Form E status for a freight job, (b) D/O letter status for a sea container, (c) commercial-invoice status, (d) customs-clearance status. The freight document suite (`docs/audit/cargo-ops-forensics-2026-05-16.md` §3.5 — E1..E5) is net-new — none of it is on the customer side yet.
- **Why it matters:** without documents visibility, a juristic customer must email "where is my Form E" to a sales rep weekly. The owner's "เกราะป้องกันสรรพากร 100%" branding requires the documents chain to be visible end-to-end — half the value of producing them on time is letting the customer SEE you produced them on time.
- **Build:** depends on the freight document suite landing (V-E backlog). On the customer side, surface a `documents` card on the unified-tracking view (G1) with status chips for each document type — implementable now with placeholders, fill as ภูม's V-E1..E4 land.
- **Effort:** S (placeholder card) · L (full document suite + customer surfaces — but that's a V-E scope item, not this gap's scope).

### G6 🟠 — No public (logged-out) tracking page (`gap-customer` H-5)

- **What:** `/shipments/[code]` is auth-gated. A recipient who isn't the account holder (the customer's warehouse staff, a re-shipping partner) cannot punch in a shipment code and see status without an account.
- **Why it matters:** standard logistics-platform expectation. Reduces "log me in to see where my container is" friction. Already planned under R-1 per gap-customer note; flagged here for completeness.
- **Effort:** M (~1 week — public route, masked PII + only the timeline, captcha on the lookup, rate-limit).

### G7 🟡 — Notification preferences UX is hidden / under-built

- **What:** `profiles.notify_channels` JSON column exists (`{ line?: boolean; email?: boolean }`), `sendNotification` respects it, but there is **no customer-facing UI** to manage it. The customer cannot turn off LINE pings, opt out of marketing categories, or pick "email-only for receipts". Per-category preferences also unwired — every notification ships through the same channel selection.
- **Why it matters:** the moment LINE push goes live (G2), some customers will get pinged 3x a day. Without preferences, they will mute the OA → all subsequent pings go dark. This is the standard SaaS notification-fatigue trap.
- **Build:** `/profile/notifications` settings page — per-channel + per-category toggle matrix.
- **Effort:** S (~1-2 days — form + an action + 12 i18n keys).

### G8 🟡 — Wallet `H-1` overdraw (stacked pending debits) is unfixed

- **What:** `actions/wallet.ts` `createWithdraw` + `actions/payment.ts` `createYuanPayment` insert pending debits; the balance trigger (migration 0007 `wallet_recompute_balance`) sums **completed-only**. A customer submits N withdraws, each individually ≤ balance — admin approves them all — balance goes negative. Master strategy §2 W-3, gap-customer H-1, gap-schema-security S-5. **Migration 0064** added overdraw-guard for self-serve sites but pending-stacked submit on the admin-gated path is still exploitable.
- **Why it matters:** real money-loss path. Exploitable from day one of withdraw + yuan being live. Pacred pays out cash it was never funded for.
- **Build:** sum *pending + completed* debits in the balance check **or** reserve funds at request-time **or** cap to one open withdraw per customer. Choose one rule; apply at every debit site.
- **Effort:** S–M. (See master strategy §2 — best owned with the W-1 security pass.)

### G9 🟡 — `H-2` pay-from-wallet post-debit failure is unfixed

- **What:** wallet debit succeeds, status update fails → debit preserved (audit trail), order still `awaiting_payment` → customer sees "error" with money gone. Rare, but high per-incident pain.
- **Build:** transactional RPC (debit + status-flip atomic, on the DB side) OR a visible "payment received — finalising" intermediate status + a reconciliation cron.
- **Effort:** S (RPC). M (full reconciliation loop).

### G10 🟡 — Freight customer surface is minimal

- **What:** `/freight/shipments` lists `freight_shipments` but the invoice tie-in is incomplete. Master strategy §3 "islands" — freight chain is four disconnected stubs; the customer-side freight page rendering is also stubby. `freight_invoice_payments.method='wallet'` cannot debit the wallet (G3 in master §2).
- **Effort:** L — couples to ภูม's V-E work + master §3 wire-the-flow workstream.

### G11 🟢 — Empty G-C5 (per-shipment forwarding instruction recap) was shipped but the "copy" affordance is static text

- **What:** the orange recap card on `/service-import/[fNo]` (the mark + 4-step instructions) is good but the mark code (`{f.f_no}`) is `select-all` only — no copy-to-clipboard button. Same on the warehouse-addresses page.
- **Build:** a tiny `CopyButton` next to each copy-able field (mark + receiver + address + phone). Trivial.
- **Effort:** S (~1h).
- **Customer pain it fixes:** the chat audit's #1 new-customer confusion is "what address do I give the Taobao seller?" — they need to copy 4 fields × 2 warehouses + their own mark to a WeChat message. The select-all UX requires explaining "click then long-press then copy" to non-technical Thai users on phones. A tap-to-copy is the single highest-leverage 1-hour UX win in the customer portal.

### G12 🟢 — "ตู้จะปิดรับสินค้า" countdown nudges the customer but doesn't proactively notify

- **What:** the countdown card on `/shipments/[code]` (V-C3) shows "ตัดตู้ in N days" but the customer must visit the page to see it. No outbound notification fires N days before. Once LINE push is live (G2), this becomes a high-leverage *anti-frustration* notification ("ตู้ของคุณจะปิดรับวันที่ DD/MM — รีบนำเข้าที่โกดังจีน").
- **Build:** a Vercel cron-job + `actions/admin/cron-close-at-reminders.ts` running daily at 09:00 +07. Reads containers with `close_at` ≤ now + 2 days, finds all customer profile_ids via `cargo_shipments`, fires `sendNotification` for each.
- **Effort:** S (~3h — depends on G2 being on).

---

## 3. Recommendations — sequenced, revenue-lensed

The post-launch decision lens (AGENTS.md §2): "more **true** / more **billable** / more **measurable**." The 8,898-customer migration cohort makes this lens biting — anything that makes a daily-active customer feel "Pacred actually tells me what's happening" is a retention dollar.

### Tier 0 — flip the switches (this week, ~1 day)

| # | Item | Effort | Owner |
|---|---|---|---|
| 0.1 | Flip `LINE_PUSH_BYPASS=false` in Vercel; set `LINE_CHANNEL_ACCESS_TOKEN` (channel 2009931373); verify push delivers for ~3 test profiles | S | ก๊อต/เดฟ (dashboard) |
| 0.2 | Set `RESEND_API_KEY` + `RESEND_FROM` so email-fallback fires when LINE is unlinked | S | ก๊อต (Resend signup) + เดฟ (env) |
| 0.3 | Add `public/manifest.webmanifest` + Pacred icons → PWA installable on home screen | S | ปอน |
| 0.4 | Run a 7-day notification-volume audit AFTER 0.1 — count `sendNotification` calls per profile per day; if any > 8/day, prune category mappings | S | เดฟ |

Total: ~1 day of work, ~no code. Activates the entire push-notification chain that's already wired. Direct match to chat audit L-4.

### Tier 1 — build the unified-tracking view (next 1-2 weeks)

| # | Item | Effort | Owner |
|---|---|---|---|
| 1.1 | Postgres view `customer_tracking_unified` joining `cargo_shipments` ⨝ `cargo_containers` ⨝ `forwarders`/`service_orders` ⨝ `tax_invoices` ⨝ `freight_invoices` ⨝ `freight_qa_inspections` — RLS-scoped to `profile_id` | M | ภูม |
| 1.2 | Upgrade `/shipments/[code]` with 2 additional cards (payment + documents) — placeholders OK for documents card; uses the view | S | ภูม + ปอน |
| 1.3 | Add `customer_issues` migration + `customerFileIssue` action + `<CustomerIssuesPanel>` on `/shipments/[code]` and `/service-import/[fNo]` — clone the IO-1 lifecycle UI shape | M | ภูม |
| 1.4 | `/admin/customer-issues` queue for staff (assign + reply + resolve) | M | ภูม |
| 1.5 | `/profile/notifications` channel + category preferences UI | S | ปอน |

**This is the closest Pacred can get to the owner's "in one place" ask without rebuilding the IA.** The unified card on `/shipments/[code]` is also the perfect deep-link target for LINE push notifications fired in Tier 0.

### Tier 2 — close the still-open money + flow gaps (post Tier 1)

| # | Item | Effort | Owner |
|---|---|---|---|
| 2.1 | Wallet H-1 fix (pending+completed-aware balance, or reservations, or one-open-withdraw cap) — pairs with master strategy W-3 | S | ภูม |
| 2.2 | H-2 pay-from-wallet atomicity (transactional RPC or visible "finalising" state) | S | ภูม |
| 2.3 | G-C4 tax-invoice for `yuan_payment` source — extends `requestTaxInvoice` action + ADR-0006 footnote | S | ภูม |
| 2.4 | G-C6 self-service order edit pre-payment (shipping address + note while `awaiting_payment`) | S | ภูม |
| 2.5 | `cron-close-at-reminders` — daily push N days before `cargo_containers.close_at` | S | ภูม |

### Tier 3 — strategic surfaces (4-6 weeks out)

| # | Item | Effort | Owner |
|---|---|---|---|
| 3.1 | Public (logged-out) tracking page (`/track`) — captcha + rate-limit + masked PII; H-5 + part of R-1 | M | เดฟ |
| 3.2 | Customer credit line UI (G-C1) — `wallet.credit_balance` becomes spendable; existing `CreditLinePanel` only shows balance, not place-on-credit. Critical for repeat importers' retention | L | ภูม |
| 3.3 | Web-push (VAPID) → service-worker → push delivery from `sendNotification` | M | เดฟ |
| 3.4 | Two-way customer-staff thread on `/service-import/[fNo]` and `/service-order/[hNo]` (port of `work_item_messages` to the customer side — partial; structurally feasible since IC-1 thread infra exists) | L | ภูม |
| 3.5 | Documents-axis full surface — Form E / D-O / commercial-invoice statuses on the unified card, depends on V-E1..E4 landing | M | ภูม |

### What to NOT build (anti-patterns flagged by AGENTS.md §4)

- Don't rebuild the customer portal IA. Phase B (ADR-0017) just shipped the launchpad fidelity; let it stabilise.
- Don't scrub PCS references on the warehouse-addresses card prematurely (still routes through legacy infra in places; master strategy + `pcs-scrub-plan.md`).
- Don't add a customer-side chat that fragments away from LINE OA — extend the LINE OA + use it as the channel; the chat-audit owner decision (`docs/audit/chat-analysis-2026-05-16.md` §6) was "keep ONE LINE OA + intelligent routing".

---

## 4. Deeper research — open questions for the team

These came up during the audit but exceed the scope of a single agent's R&D. Each one wants either a `port-spec/`, an ADR, or a focused follow-up:

### 4.1 What is the canonical "delivered" definition?

The codebase has at least **four** terminal status conventions:
- `forwarders.status = 'delivered'` (legacy)
- `cargo_shipments.status = 'delivered'`
- `service_orders.status = 'completed'`
- `freight_shipments.status = 'delivered'`

Plus `forwarders.acknowledged_at` (U4-3a delivery-ack panel). What ONE state means "this customer's transaction is closed, no more events fire"? The unified-tracking view (G1) needs this answer to render a consistent terminal card. Master strategy §3 W-5 partly addresses it but only for `service_orders` auto-close.

### 4.2 Notification volume + category budget per customer

Once LINE push is live (Tier 0.1), the system can fire `sendNotification` from ~24 sites (counted: order-placed, order-paid, deposit-requested, deposit-approved, withdraw-requested, withdraw-approved, yuan-requested, yuan-completed/rejected, status-changed × 7 forwarder statuses, container-status × 8, tax-invoice-issued, tax-invoice-cancelled, credit-note-issued, qa-failed, customer-suspended/approved, sales-transfer-out/in, etc.). A typical migrated customer with 2 active forwarders + 3 wallet ops/week could see 20-30 pings/week. No customer wants that. Need:
- a category-priority matrix (critical / important / informational)
- a "daily digest" mode that bundles low-priority pings
- a NotificationPreferences ADR

### 4.3 Photo proof + customer issue workflow

When G3 lands, what's the photo-evidence policy? Where do photos live (`member-docs/` bucket vs a new `customer-claims/`)? What's the retention? Per-photo size cap? How does staff respond on the admin side (upload photo of resolution)? Needs an ADR co-authored with ภูม + ก๊อต before G3 codes.

### 4.4 Offline tolerance — is it worth the service-worker cost?

The chat audit's L-1 "เว็ปล่ม 24+ times in 6 weeks" was the legacy PHP system; Pacred on Vercel + Supabase Cloud is much more resilient. But a customer **in a factory with weak signal**, looking at "where is my container", on a 3G connection — does Pacred render last-known status from a service-worker cache, or fail-blank? If the answer is "fail-blank", Tier 0.3 PWA install is enough; if it's "render cached", a service worker is needed. Recommend: phase-1 PWA install only; revisit when traffic data shows the offline customer count.

### 4.5 Should `/dashboard` carry the unified-tracking summary card?

The Phase-B fidelity port deliberately demoted Pacred-only stats below the 9-icon grid. But the unified-tracking summary card (current active shipment + ETA + payment state + open issues) is *exactly* the kind of "above the fold = first thing you see" card the launchpad would benefit from. **Tension:** legacy PCS didn't have one (the launchpad was 9 icons + a sales rep + a wallet balance, full stop). Resolution: probably add the card as a **secondary** strip below the icon grid, never above. ADR-worthy.

### 4.6 Document-status taxonomy

For G5 / Tier 3.5, what's the canonical document-state machine?
- *Commercial Invoice:* `not_yet_uploaded → uploaded → validated → final`
- *Packing List:* same
- *Form E:* `not_applicable → drafting → applied → received → expired`
- *D/O letter:* `not_applicable → drafting → sent_to_line → released`
- *Customs declaration:* `not_yet → filed → released → on_hold`
- *Tax invoice / Credit note:* already specced in ADR-0006

These each need a port-spec; some may be folded into V-E1..E4.

### 4.7 What does "documents tracking" look like to a non-juristic customer?

A retail customer importing one cargo doesn't care about Form E or D/O. A juristic importer cares deeply. The documents card needs **per-customer-type visibility** — hide irrelevant rows, surface what's actionable. Needs an audience-scoping ADR (or a single `relevant_document_types_for_customer(profile_id)` Postgres function — like the `is_admin([roles])` shape).

---

## 5. References

### Required reading (this audit followed)

- [`docs/research/capability-tools-strategy-2026-05-18.md`](../../research/capability-tools-strategy-2026-05-18.md) — the post-launch capability synthesis + Tier 0/1/2/3 roadmap (the doc this 03-customer-portal extends, customer-side)
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md) — the cargo + freight operating model + the V-A..V-H backlog
- [`docs/audit/chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md) — workflows W-1..W-9 + leak holes L-1..L-10 + customer pain themes
- [`docs/architecture/container-centric-model.md`](../../architecture/container-centric-model.md) — `cargo_containers` / `cargo_shipments` / `cargo_shipment_tracking` schema + RLS policies
- [`docs/PORT_PLAN.md`](../../PORT_PLAN.md) Part V (cargo backlog) + Part W (gap-hunt)
- [`docs/research/PACRED-MASTER-STRATEGY.md`](../PACRED-MASTER-STRATEGY.md) — the 4-chain synthesis
- [`docs/decisions/0014-customer-self-service-state-transitions.md`](../../decisions/0014-customer-self-service-state-transitions.md) — admin-client-after-ownership-verify pattern

### Companion R&D docs (2026-05-19)

- 01 — Mobile UX / scanning (planned)
- 02 — Marketing / Ads / SEO / Growth (planned)
- **03 — Customer portal (this doc)**
- 04 — Admin / Employee portal / 14 roles (planned)
- 05 — DevOps / Observability / Monitoring (planned)
- 06 — Backend / Architecture / Integrations (planned)
- 07 — Billing / Payments / Subscriptions (planned)
- 08 — Tracking / Logistics / Documents (planned)

### Code paths audited

- Layout: `app/[locale]/(protected)/layout.tsx`
- Customer surfaces: `app/[locale]/(protected)/{dashboard,shipments,service-import,service-order,service-payment,wallet,refunds,notifications,my-issues,bookings,freight,addresses,profile,sales,commissions}/`
- Components: `components/sections/{pcs-icon-grid,pcs-launchpad-header,pcs-wallet-card,pcs-sales-rep-card,protected-sidebar,navbar}.tsx`, `components/{notification-bell,delivery-ack-panel,observability/my-incidents-panel,tax-invoice-request-panel}.tsx`
- Actions: `actions/{shipments,forwarder,service-order,payment,wallet,refunds,notifications,credit,tax-invoices,bookings}.ts`
- Notifications: `lib/notifications/{index,templates,types}.ts`
- Migrations referenced: 0007 (wallet) · 0033 (cargo spine) · 0034 (tax invoice) · 0037 (received_qty / expected_qty) · 0052 (freight invoices) · 0061 (money audit P0/P1 fix) · 0063 (wallet freight reference) · 0064 (overdraw guard) · 0067 (PCS migration) · 0071 (credit line) · 0073 (delivery ack) · 0076 (business config) · 0077 (platform incidents) · 0079 (bookings) · 0080 (work_items) · 0085 (credit-note) · 0086 (work_item_messages)
- Gap docs cross-referenced: `gap-customer.md` G-C1..G-C6 + H-1..H-6

### Out-of-scope by design

The following customer-adjacent topics belong to other R&D agents:

- **Web push / VAPID / service-worker / offline tolerance / PWA build pipeline:** → R&D 01 (mobile UX) + R&D 05 (devops)
- **Sentry / Clarity / GA4 wiring per Tier-0:** → R&D 05
- **OTP SMS balance alerting + cron:** → R&D 05 + R&D 06
- **MOMO JMF sync (`/api/cron/momo-jmf-sync`):** → R&D 06 + R&D 08
- **Customer credit-line economics (eligibility / limit / aging):** → R&D 07
- **Freight invoice + customs documents detail flow:** → R&D 08
- **Public marketing surfaces + lead-funnel + `/start-order` + `QuoteCTA`:** → R&D 02

---

**End of `03-customer-portal.md`.** Three top recommendations: Tier 0 = flip the env switches (LINE + Resend + PWA manifest — ~1 day, ~no code, opens the outbound channel). Tier 1 = build the unified-tracking view + customer-issues loop (~1-2 weeks — directly matches the owner's "in one place" ask). Tier 2 = close the H-1/H-2 wallet correctness holes and the G-C4 yuan tax-invoice gap. The biggest surprise: `/my-issues` (IO-1 platform incidents) is the right *shape* for a physical-goods claim loop — one factor-out away from G3.
