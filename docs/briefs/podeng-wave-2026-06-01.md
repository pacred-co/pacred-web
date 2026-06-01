# 🟢 ปอน — work-package brief · 2026-06-01 (frontend / customer-facing lane)

> **Branch:** `InwPond007` (sync from `dave-pacred` / `main` first — `git fetch origin && git pull origin main --no-edit`).
> **Lane:** หน้าบ้าน (customer-facing + admin CRM/marketing UI). You own the UI; เดฟ owns the money/`tb_*` write actions.
> **Source of truth:** `docs/research/big-audit-2026-06-01/_MASTER-PLAN.md` (§5 waves — you = **Wave D: CRM + marketing**) + cluster docs `01-customer-identity.md` + `06-admin-hr-notify-crm.md` + `cargothai-warehouse-ops-blueprint-2026-06-01.md`.
> **Owner rule (read once):** build ON เดฟ's + ภูม's work, don't wall it off. Coordinate the LINE/CRM lane with เดฟ. FULL design/UX freedom (`design_latitude_2026_05_30`) — เดฟ gates only "base function works on prod, no dead button". Don't file design-divergence as bugs.

---

## ⭐ START HERE (first task — highest trust-per-hour, smallest, P0 defect)

**Task 1 · M-1 — wire the inert customer address delete + set-main buttons.** It is a **P0 data-correctness defect** (a customer literally cannot remove or re-prioritise a saved Thai shipping address → wrong-parcel risk), the surface already exists (`/addresses`), the data is live (`tb_address` 4,154 rows), and the only blocker is two missing server actions that you can coordinate with เดฟ in one message. Ship this, get the verify-loop muscle warm, then move to the bigger CRM/track items.

---

## The task list (priority order)

| # | Task | Sev | Effort | Blocked on เดฟ? |
|---|---|---|---|---|
| **1** | **M-1** Address delete / set-main (inert buttons) | **P0 defect** | **S** | Action only (1 file) |
| **2** | **P2** Public `/track/{code}` — no-login tracking (the GTM moat) | P0-value | M | Data action |
| **3** | **Wave-2** CRM omni-inbox v2 — reply box + member-link + agent-assign (LINE), then FB | P0-value | **L** | Reply/assign actions |
| **4** | Ad ROAS / lead-source dashboard (frontend) | P1 | M | No (read-only) |
| **5** | **M-2 / G-1** register juristic inversion (stop writing rebuilt `corporate`) | P1 | S–M | Coord (shared action) |
| **6** | Lead win-back surface — 6,937 `userActive=''` cold-lead admin queue | P0-value | M | Read + assign action |
| (bonus) | **M-5** reverse-image camera search wiring | P1 | S | No (backend built) |

> M-5 is listed as a bonus because it's pure frontend wiring (the backend `searchByImage` + `lib/china-search/laonet.ts` already exist) and it lives in the exact same `components/sections/search-bar.tsx` file you'll already be touching — cheap to fold in.

---

## TASK 1 — M-1 · Customer address delete + set-main (P0 defect · S)

> ✅ **เดฟ shipped the 2 server actions 2026-06-01** (Wave A): `deleteAddressAction` (faithful
> soft-delete addressstatus '1'→'0', ownership-scoped, clears the main-pointer if it was main) +
> `setMainAddressAction` (upserts the single `tb_address_main` pointer, ownership-checked) — both in
> `app/[locale]/(protected)/addresses/add-address-action.ts`, same `<form action={…}>` + hidden
> `addressId` convention as `editAddressAction`. **ปอน: just wire the two buttons to these.**

**Goal:** the three per-row buttons on `/addresses` (ลบที่อยู่ · แก้ไข · ตั้งเป็นที่อยู่หลัก) all work. แก้ไข already works (`editAddressAction`). **ลบ** and **ตั้งเป็นที่อยู่หลัก** are dead — they render `data-legacy-onclick="deleteAddress(...)"` / `setMainAddress(...)` markers with **no handler**.

**Data / tables (state explicitly):**
- ✅ **LIVE:** `tb_address` (4,154 rows · soft-delete via `addressstatus`: `'1'`=active, `'0'`=deleted) + `tb_address_main` (2,919 rows · one row per customer pointing at their default `addressid`).
- 💀 **DEAD — do NOT touch:** rebuilt `addresses` (0 rows, never written).
- Join key: `tb_address.userid === profile.member_code` (the `PR<n>` string). `tb_*` is RLS-locked to service_role → all writes go through `createAdminClient()` inside the server action (the page already does this).

**Server-action contract — NEEDS เดฟ (or you, coord first):** two new actions in `app/[locale]/(protected)/addresses/add-address-action.ts` (same file as the existing add/edit — keep them together). Mirror the existing `editAddressAction` pattern exactly (ownership guard is load-bearing):

```ts
// deleteAddressAction(formData) — legacy include/pages/address/deleteAddress.php
//   1. addressId = Number(formData.get("addressId"))
//   2. userID = profile.member_code (redirect /complete-profile if none)
//   3. GUARD: refuse if this addressId IS the customer's main address
//      (legacy refuses delete-of-main). Read tb_address_main WHERE userid=userID;
//      if it points at addressId → redirect("/addresses?error=delete_main").
//   4. soft-delete: UPDATE tb_address SET addressstatus='0'
//        .eq("addressid", addressId).eq("userid", userID)   // userid = ownership guard, REQUIRED
//   5. revalidatePath("/addresses"); redirect("/addresses?deleted=1")

// setMainAddressAction(formData) — legacy include/pages/address/setMainAddress.php
//   1+2 same. 3. UPSERT tb_address_main { userid, addressid } onConflict "userid"
//      (one main per customer). Verify the addressid belongs to userID + addressstatus='1' first.
//   4. revalidatePath; redirect("/addresses?main=1")
```

⚠️ **The `.eq("userid", userID)` predicate is the ONLY ownership check** (admin client bypasses RLS) — without it a customer could delete/repoint another customer's address by POSTing a foreign `addressId`. เดฟ knows this pattern; point him at `editAddressAction` (lines 171-251) as the template.

**Your UI work:** replace the two `data-legacy-onclick` buttons (in BOTH the mobile-card block ~L270-301 and the desktop-table block ~L360-392 of `app/[locale]/(protected)/addresses/page.tsx`) with real submits. Recommended: a tiny client component (`address-row-actions.tsx`) wrapping each in a `<form action={deleteAddressAction}>` / `<form action={setMainAddressAction}>` with a hidden `addressId`, and a confirm dialog before delete (the project ships `components/ui/pacred-dialog.tsx` — reuse it; don't use jQuery SweetAlert). Render the `?deleted=1` / `?main=1` / `?error=delete_main` query flags as a toast/banner (the page already reads `?saved=1`/`?error=` flags — match that).

**Acceptance (§0c):**
- Click ลบ on a non-main address → confirm → row disappears (soft-deleted, `addressstatus='0'`), list re-renders, success toast.
- Click ลบ on the MAIN address → blocked with a clear message ("ตั้งที่อยู่อื่นเป็นหลักก่อนจึงจะลบได้").
- Click ตั้งเป็นที่อยู่หลัก on a non-main row → that row flips to the static "ที่อยู่หลัก" badge, the previous main reverts to a settable button.
- Mobile-first: verify at **360px + 390px** — buttons ≥ 44px tap target, no horizontal scroll, dialog thumb-reachable.
- No `data-legacy-onclick` left in the file (grep returns empty).

---

## TASK 2 — Public `/track/{code}` no-login tracking (P0-value · M · the GTM moat)

**Goal:** a public, no-login page: customer pastes a tracking number → sees a status **timeline** + ETA, branded. This is the headline "ไม่ต้องโทรถาม" USP from the CargoThai blueprint (§3 Layer 4). Maps the warehouse 7-status flow to customer-visible stages.

**Where it goes:** `app/[locale]/(public)/track/[code]/page.tsx` + a landing form at `app/[locale]/(public)/track/page.tsx` (input box → navigates to `/track/<code>`). Public route group = no auth. **MUST set `export const dynamic = "force-dynamic"`** (it reads live DB per request; `[code]` dynamic segment + any cookie/NavBar read → otherwise `DYNAMIC_SERVER_USAGE` 500 — see AGENTS.md §11). Model the "render even if DB down" try/catch on the existing `app/[locale]/(public)/status/page.tsx`.

**Data / tables (state explicitly):**
- ✅ **LIVE:** `tb_forwarder` (47,636 rows · 114 cols). Look up by `ftrackingchn` (the China-courier tracking number the customer types). Status = `fstatus`. Stage timestamps = `fdatestatus2..7` (the unmined goldmine — use them to build the timeline dwell + ETA).
- 💀 **DEAD:** rebuilt `forwarders` / `containers` (0 rows). Never read these.
- **Privacy:** this is PUBLIC — return ONLY non-sensitive fields (tracking, status label, stage dates, warehouse name, a coarse ETA). **Do NOT** return customer name/phone/`userID`/cost/profit. On no-match → a friendly "ไม่พบเลขนี้" (never 500, never leak whether a code "exists but isn't yours").

**The status flow (already canonical in the codebase — reuse, don't reinvent):** `fstatus` 1→7 with labels (from `app/[locale]/(protected)/service-import/[fNo]/page.tsx` L151-163 + the step list L341-344):

| fstatus | customer-visible stage | timestamp col |
|---|---|---|
| 1 | รอสินค้าเข้าโกดังจีน | — |
| 2 | สินค้าถึงโกดังจีนแล้ว | `fdatestatus2` |
| 3 | กำลังส่งมาประเทศไทย | `fdatestatus3` |
| 4 | สินค้าถึงประเทศไทยแล้ว | `fdatestatus4` |
| 5 | รอชำระเงิน | `fdatestatus5` |
| 6 | เตรียมส่ง | `fdatestatus6` |
| 7 | ส่งแล้ว | `fdatestatus7` |

> The 7-step demo flow in the CargoThai blueprint (received→…→delivered) collapses onto these 7. Show steps 1-4 + 6-7 as the public timeline; treat step 5 (รอชำระเงิน) as a neutral "อยู่ระหว่างดำเนินการ" publicly (don't expose money state to an unauthenticated viewer). The existing detail page (`service-import/[fNo]`) already renders this as a stepper — borrow its visual logic, simplify for public.

**Server-action contract — NEEDS เดฟ:** one read action, e.g. `getPublicTrackStatus(code: string)` (put in `actions/forwarder-legacy.ts` next to the other `tb_forwarder` readers, or a new `actions/track.ts`). Returns a sanitized `{ found: boolean; tracking; statusCode; statusLabel; stages: {label, date}[]; warehouse; etaRange }`. เดฟ owns the exact field whitelist + the rate-limit decision (consider Upstash — it's already in env — to stop scraping). **Coordinate the field whitelist with เดฟ before you build the UI** so privacy is settled once.

**Acceptance (§0c):**
- `/track/<real-code>` → renders the timeline with completed stages checked + current stage highlighted + ETA. `/track/<garbage>` → friendly not-found, HTTP 200, no leak.
- `pnpm build && pnpm start` then `curl /track/test` → 200 (not 500). Verify against a real `ftrackingchn` from prod.
- Mobile-first 360/390px: timeline is vertical on phone, no horizontal scroll, the input form CTA thumb-reachable.
- A clear "ติดต่อทีม" / LINE-OA fallback CTA on the page (slogan voice — AGENTS.md §6).

---

## TASK 3 — CRM omni-inbox v2 (P0-value · L · extend `/admin/line-inbox`)

**Goal:** turn the current **read-only** LINE inbox into a working omni-channel CRM: (a) **reply box** (send LINE message back), (b) **member-link** — match a LINE contact to a `tb_users` (PR code) by phone and surface wallet/orders/forwarders **in-chat** (the owner's "ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover"), (c) **agent assignment** + routing, (d) fold in **FB Messenger** (`Podeng_fb_*`) as a second channel in the same inbox.

**Data / tables (state explicitly):**
- ✅ **LIVE (canonical) — `Podeng_*` family (ปอน's own external Worker tables — you own these):** `Podeng_customers_line` (52 contacts · already has `phone`/`customer_code`/`assigned_agent_id`/`lead_quality`/`service_interest` cols — wire them, they're unused) · `Podeng_line_messages` (212 msgs) · `Podeng_cs_agents` (1 agent roster) · `Podeng_fb_customers` (1) / `Podeng_fb_messages` (0, not wired) / `Podeng_fb_lead_sources` (5).
- 💀 **DEAD — the dual-ingest trap:** repo's own `customers_line` / `line_messages` (migration 0131, 0 rows) + `app/api/webhooks/line/route.ts`. **`/admin/line-inbox` already reads `Podeng_*` (correct).** ⚠️ **P0-3 / G-15 coordination: two webhooks compete for one @pacred OA.** Before building reply-send, confirm with เดฟ which webhook is live in Vercel and that we consolidate to ONE (Podeng_* wins — it has the data). Don't build reply-send against an ambiguous channel.
- ✅ **member-link target:** `tb_users` (8,927) by `userTel` → pull `tb_wallet`/`tb_header_order`/`tb_forwarder` summaries.

**Existing surface to extend (don't rebuild):** `app/[locale]/(admin)/admin/line-inbox/page.tsx` (list + thread, mobile-responsive, already good) reads via `actions/admin/line-inbox.ts` (`getLineInboxCustomers` / `getLineCustomerThread` / `getLineInboxStats`). Sidebar entry already wired in `lib/admin/sidebar-menu.ts`. Types in `lib/admin/line-inbox-types.ts` (a "use server" file may only export async fns — keep types there).

**Server-action contract — NEEDS เดฟ (+ maybe ก๊อต for LINE push creds):**
- `sendLineReply(customerLineId, text)` — outbound via LINE Messaging API push (`lib/notifications/index.ts:sendLinePush` exists). Writes a `Podeng_line_messages` outbound row. **This is the one with a real external-send side-effect — coord เดฟ/ก๊อต on creds + the consolidated-webhook gate first.**
- `assignAgent(customerLineId, agentId)` — UPDATE `Podeng_customers_line.assigned_agent_id`.
- `linkLineContactToMember(customerLineId, memberCode)` + `getMemberSnapshotForChat(memberCode)` — read-only join `tb_users`⋈wallet/orders. Auto-suggest by `phone` match.

**Your UI work:** add a reply composer at the bottom of `ThreadPanel`; a right-rail (desktop) / collapsible (mobile) "ลูกค้าในระบบ" card showing the linked PR account (wallet balance · open orders · in-transit forwarders · with deep-links to the admin customer page); an agent-assign dropdown in the thread header (options from `Podeng_cs_agents`); a channel filter/badge (LINE vs FB) on the list. Add an FB thread variant reusing the bubble component.

**Acceptance (§0c):**
- Type a reply → send → the outbound bubble appears in the thread + a `Podeng_line_messages` row is created (assert the row, not just a toast — §0c).
- Assign an agent → `assigned_agent_id` persists + the list chip updates.
- Open a chat whose phone matches a `tb_users` → the in-system card shows that customer's real wallet/orders (verify against a known PR customer).
- Mobile 360/390px: reply box reachable, in-system card collapses, no split-screen cramming.

---

## TASK 4 — Ad ROAS / lead-source dashboard (P1 · M · read-only)

**Goal:** a marketing dashboard answering "which ad → which LINE/FB add → which order → how much revenue" + cost-per-acquisition + ROAS per campaign. Marketing flies blind today.

**Data / tables (state explicitly):**
- ✅ **schema present (ปอน's `Podeng_*`):** `Podeng_line_lead_sources` (3) + `Podeng_fb_lead_sources` (5) + `Podeng_fb_ad_touchpoints` (0) + `Podeng_meta_ads` (**0 — EMPTY**). The join path: touchpoint → `Podeng_customers_line.customer_code` → `tb_forwarder`/`tb_payment` revenue.
- ⚠️ **`Podeng_meta_ads` is EMPTY** → ROAS will be blank until the Meta Marketing API populates it (that ingest is your Worker / a ก๊อต+ปอน lane, not this UI task). **Build the dashboard to render gracefully with zero ad rows** (show lead-source breakdown + the revenue join now; banner "เชื่อม Meta Ads API เพื่อดู ROAS" where ad-cost data is absent). Don't block the whole page on empty `meta_ads`.

**Server-action contract:** read-only aggregates — `actions/admin/` (e.g. `crm-analytics.ts`). No เดฟ dependency for the read; the data is all in tables you own + public `tb_*` reads. Consider the `audit-kpi-dashboard` skill for the scaffold.

**Where it goes:** `app/[locale]/(admin)/admin/crm/ad-roas/page.tsx` (or under your CRM section). Sidebar entry in `lib/admin/sidebar-menu.ts` (reachability — AGENTS.md §0d).

**Acceptance:** renders with real lead-source counts + the revenue join; empty-ad-data state is bannered, not broken; mobile cards stack at 360/390px; reachable from sidebar in ≤3 clicks.

---

## TASK 5 — Register juristic inversion (P1 · S–M · M-2 / G-1 · coord เดฟ · ADR-0021)

**Goal:** stop the customer register-juristic flow from dead-writing the rebuilt `corporate` table; write the canonical legacy `tb_corporate` so new juristic signups are visible to the (now-faithful) admin juristic queue + tax-invoice eligibility.

**Data / tables (state explicitly):**
- ✅ **CANONICAL:** `tb_corporate` (346 rows · keyed by `userid` = member_code) — admin queue + tax-invoice read THIS.
- 💀 **near-DEAD:** rebuilt `corporate` (1 row · keyed by `profile_id` UUID) — `saveJuristicStep2` in `actions/auth.ts:460` upserts here.
- **Current state:** `actions/auth.ts:478+` ALREADY mirrors to `tb_corporate` best-effort (P1-16) — but it's a non-transactional mirror that can no-op, and it **drops `corporateFile`/`corporateFile20`** (the affidavit + VAT-20 file refs). The architecture decision (make `tb_corporate` canonical / make the mirror fail-closed) is **เดฟ's call (G-1)**.

**Your part (frontend) — coordinate with เดฟ:** this is mostly เดฟ's action work, BUT the UI side is yours: ensure the juristic register step-2 form (in the register wizard, `actions/auth.ts:saveJuristicStep2` is the handler) captures + uploads the two files (`corporateFile` affidavit, `corporateFile20` VAT-20) and passes them through so the canonical write isn't lossy. Verify the form fields render + upload (reuse the parallel-upload pattern already in register). **Don't change the canonical-table decision yourself** — wait for เดฟ's ADR-0021 call, then wire the UI to whatever action signature he lands.

**Acceptance:** a new juristic signup appears in the admin juristic queue (`/admin/juristic-check`, which reads `tb_corporate`) with company name + the two files attached; mobile-first upload UX at 360/390px.

---

## TASK 6 — Lead win-back surface (P0-value · M · the 6,937 cold leads)

**Goal:** an admin queue UI to work the **6,937 `tb_users.userActive=''`** never-sales-contacted leads (78% of the base) — surface them, assign to reps round-robin, fire a LINE/SMS nudge. (Master-plan U-2.)

**Data / tables (state explicitly):**
- ✅ **LIVE:** `tb_users` filter `userActive=''` (6,937) — these are legacy-staged leads never contacted. (Note `userActive='1'`=contacted 1,963 · `='0'`=native-pending 27 — **G-2:** confirm with ภูม whether the pending queue should show both `''` and `'0'`.)
- ✅ **reuse (already built):** sales-rep round-robin assignment (`lib/admin/assign-sales-rep.ts`) + whole-base broadcast (`adminCreateBroadcast`→`tb_notify`, reaches 8,898) + SMS (`actions/otp.ts`/`lib/sms`).

**Server-action contract — NEEDS เดฟ/ภูม:** a paginated read of cold leads + a "assign + nudge" action (writes `tb_users.adminIDSale` + queues `tb_notify`/SMS). The read is cheap; the assign reuses existing helpers. **Coordinate the sentinel filter (G-2) with ภูม** (admin lane owns the pending-queue semantics).

**Where it goes:** `app/[locale]/(admin)/admin/customers/win-back/page.tsx` (or a tab on the customers list). Sidebar/menu entry (reachability).

**Acceptance:** lists cold leads with filters (channel/registration date); select → assign to rep → row updates + a `tb_users.adminIDSale` write you can verify; bulk-nudge fires (assert a `tb_notify`/SMS row); mobile-first.

---

## BONUS — M-5 · reverse-image camera search wiring (P1 · S · no เดฟ dep)

`components/sections/search-bar.tsx` — the camera `<button type="button">` (~L116) has **no `onClick`**. The backend is **already built** (`lib/china-search/laonet.ts` + `searchByImage` in `actions/search.ts` / `actions/product-search.ts`). Pure wiring: add a hidden `<input type="file" accept="image/*" capture="environment">`, on file-select call `searchByImage`, route results to the existing search results surface. Acceptance: pick a photo on mobile → reverse-image results render; 360/390px clean. Fold this in while you're in `search-bar.tsx`.

---

## Recommended file layout (new files you'll add)

```
app/[locale]/(public)/track/
  page.tsx                      # Task 2 — tracking-number input form (public)
  [code]/page.tsx               # Task 2 — status timeline (force-dynamic, sanitized)
app/[locale]/(protected)/addresses/
  address-row-actions.tsx       # Task 1 — client: delete/set-main forms + confirm dialog
  add-address-action.ts         # Task 1 — เดฟ adds deleteAddressAction + setMainAddressAction here
app/[locale]/(admin)/admin/line-inbox/
  page.tsx                      # Task 3 — extend (reply box, member card, agent dropdown, FB)
  reply-composer.tsx            # Task 3 — client reply box
  in-system-card.tsx            # Task 3 — linked tb_users wallet/orders snapshot
app/[locale]/(admin)/admin/crm/ad-roas/page.tsx   # Task 4
app/[locale]/(admin)/admin/customers/win-back/page.tsx  # Task 6
actions/track.ts                # Task 2 — เดฟ: getPublicTrackStatus (or add to actions/forwarder-legacy.ts)
actions/admin/line-inbox.ts     # Task 3 — เดฟ adds sendLineReply/assignAgent/linkLineContactToMember
actions/admin/crm-analytics.ts  # Task 4 — read-only ROAS aggregates
lib/admin/sidebar-menu.ts       # Tasks 4 + 6 — add nav entries (reachability §0d)
```

> Reuse, don't rebuild: `components/ui/pacred-dialog.tsx` (confirms — no jQuery SweetAlert) · the `service-import/[fNo]` stepper visual for `/track` · the existing `line-inbox` list/thread shell · `audit-kpi-dashboard` skill for Task 4 · the register parallel-upload pattern for Task 5.

---

## Coordination points with เดฟ (send him these in one message)

1. **M-1 (Task 1):** add `deleteAddressAction` + `setMainAddressAction` to `addresses/add-address-action.ts` — copy `editAddressAction`'s ownership-guard pattern; refuse delete-of-main; soft-delete via `addressstatus='0'`; set-main UPSERTs `tb_address_main` onConflict `userid`. (Or you write them, he reviews.)
2. **`/track` (Task 2):** the **field whitelist** (privacy) + rate-limit decision + the `getPublicTrackStatus` reader on `tb_forwarder` by `ftrackingchn`.
3. **CRM (Task 3):** **P0-3/G-15 — which LINE webhook is live in Vercel; consolidate to `Podeng_*` (kill the dead `customers_line`/0131 ingest) BEFORE reply-send.** Then `sendLineReply` (LINE push creds — may need ก๊อต) + `assignAgent` + `linkLineContactToMember`.
4. **Juristic (Task 5):** his **ADR-0021 / G-1** canonical-table decision (`tb_corporate` vs transactional mirror) — wait for it, then wire UI to the action signature he lands. Make sure the two file uploads aren't dropped.
5. **Win-back (Task 6):** the cold-lead reader + assign+nudge action; **G-2 sentinel filter** (`userActive=''` vs `'0'`) is a ภูม (admin-lane) call — confirm with him.

---

## Definition of done (every task · AGENTS.md §0c + §0d + §6)
- **Click-through, not curl:** open the real entry point → click the row/button → assert the observable outcome (toast AND the DB row/state change). State per-surface ✅verified / ⚠️rendered-not-clicked / ❌not-opened — never "clean" if any is ⚠️/❌.
- **No dead buttons:** every button you ship has a working handler; no `data-legacy-onclick` markers left.
- **Reachable in ≤3 clicks** from sidebar/dashboard (wire the nav entry in the SAME change).
- **Mobile-first 360/390px:** no horizontal scroll · tap targets ≥ 44px · body text ≥ 16px · primary CTA thumb-reachable. (Use the `mobile-first-verify` skill.)
- **Destructure `error`** on every Supabase query; throw on error (no silent `data=null` → 404).
- `pnpm verify` EXIT 0 + (for `/track`, public) `pnpm build && pnpm start` + `curl` → 200.
- Push at save-points only (`push_frequency_strict`).
