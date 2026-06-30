# Verify-deep-flow — never ship a wave on smoke-test alone

> **Why this file exists.** On 2026-05-25 ค่ำ I reported Wave 18 as
> "clean · no bugs · no dead flows" after smoke-testing the new routes
> (curl → 200). ภูม opened the same surfaces in a browser and found 2
> bugs inside 60 seconds — both invisible to a 200-vs-500 check. ภูม
> told me: *"ทำไมไม่รีเช็ค ... ภูมิต้องมาคอยหาเจอเอง ... แบบนี้มันเหมือนเรา
> ทำงานกันลวกๆ"*. This file captures the 2 missed bugs + the
> verification discipline that should have caught them.
>
> Companion rule: **AGENTS.md §0c · "verify-deep-flow protocol"**. This
> file is the case-study + evidence; §0c is the executable rule.

Last updated: 2026-05-25 ค่ำ.

---

## The 2 bugs Wave-18 smoke-test let through

### Bug 1 — `/admin/customers` table cut off (invisible scrollbar on Windows Chrome)

- **Surface:** `app/[locale]/(admin)/admin/customers/page.tsx`
- **What I shipped:** Wave 18-A added 5 fidelity columns → table now has 14 columns. Wrapper used `<div className="overflow-x-auto">` so it WAS scrollable.
- **What ภูม saw:** "ตารางขาดไปอีกแล้วอะ" — the "จัดการ" column hidden on the right at 1920×1080 with the 256px sidebar (~1664px available, table ~1676px scrollWidth). No visible scrollbar because Windows Chrome hides scrollbars by default (overlay mode) until hover.
- **Why my route-smoke missed it:** `curl` returns the HTML; the HTML contains all 14 columns; the page status is 200. The bug is purely a CSS / viewport / OS-default interaction that you can ONLY see in a browser at 100% zoom on Windows.
- **Diagnosis (Chrome MCP JS eval):** `wrap.scrollWidth=1676, wrap.clientWidth=1583 → wrapOverflows=true`. Confirmed scrollable but invisible.
- **Fix shipped:** `globals.css` → new `.scrollbar-x-visible` class forcing a 10px thin always-visible thumb (Firefox `scrollbar-width: thin` + WebKit `::-webkit-scrollbar` rules + dark-mode variants). Applied to the customers-table wrapper + added "เลื่อนซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด ⇆" hint above it.

### Bug 2 — `/admin/customers/PR10899` intermittent 404 (silent Supabase error)

- **Surface:** `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx` L79-86
- **What I shipped:** `const { data: userRaw } = await admin.from("tb_users")...maybeSingle(); if (!userRaw) return null;`
- **What ภูม saw:** Clicked the eye-icon on PR10899 → 404. Reloaded → 200. Reloaded → 404. Server logs showed `GET 200 in 1005ms ... 200 in 1215ms ... 404 in 1813ms` for the SAME userid.
- **Why my route-smoke missed it:** I never clicked the row. Smoke-test for the LIST page returned 200; I assumed every detail page would too. Even if I'd `curl`-ed a detail URL, I might have caught a 200 (the failure is transient — PgBouncer timeout under brief load).
- **Root cause:** The code destructured ONLY `data`. On a transient Supabase error (connection timeout · 503 · PgBouncer queue full), `maybeSingle()` returns `{ data: null, error: PostgrestError }`. We threw away the error → saw `data=null` → `return null` → page calls `notFound()` → 404 for a row that exists.
- **Verified PR10899 exists in tb_users:** via service-role REST direct query (`{"userid":"PR10899","username":"jak"}`).
- **Fix shipped:** Destructure `error`, `console.error(...)` with full context (`userid`, `code`, `message`, `details`, `hint`), then `throw` so Next renders a real error boundary instead of a misleading 404. A 404 is now reserved for the genuine "row doesn't exist" case.

---

## Why "200 = working" is the wrong gate

The route-smoke gate (`phase-verify-loop` skill + AGENTS.md §11) proves:
- ✅ The route is registered
- ✅ The handler doesn't throw at module-eval time
- ✅ Auth/middleware don't reject
- ✅ No `DYNAMIC_SERVER_USAGE` from a static-only render hitting cookies

It does NOT prove:
- ❌ The visible UI fits the viewport
- ❌ Scrollbars are visible to the OS the user runs
- ❌ Database queries succeed under non-zero load
- ❌ Row-click → detail page works (the row data may not match the detail-route lookup column)
- ❌ Action buttons (approve · suspend · view-as · ดู · etc.) succeed
- ❌ Mobile breakpoints render correctly
- ❌ Empty / loading / error states render at all

Each ❌ is a different class of bug. Smoke-test is necessary but a long way from sufficient.

---

## The verify-deep-flow protocol (executable form in AGENTS.md §0c)

Before claiming any wave / page / surface "clean", run this checklist per page:

1. **Route smoke** — `curl` returns 200/307. (existing gate · necessary)
2. **Click-through primary row action.** Open list in Chrome (MCP), click first row → verify detail renders. Click each row-action button → verify response.
3. **Measure horizontal overflow + verify visible scrollbar.** For ≥ 8-column tables, JS-measure `scrollWidth > clientWidth`; if true → either fits at the tested viewport OR `.scrollbar-x-visible` + a "⇆ scroll" hint must be present.
4. **Destructure `error` from EVERY Supabase query.** No `const { data } = ...`. Always `const { data, error } = ...` + log + throw on error. Silent null → 404 is unacceptable.
5. **Report verified vs not-yet-verified per surface.** Be explicit. *"3 of 5 click-verified, 2 only smoke-tested — those 2 may have interactive bugs I didn't catch"*. Never say "all clean" if any item is ⚠️/❌.

If you wouldn't trust your own claim of "clean" without a click-through, ภูม certainly shouldn't.

---

## Pattern: how to destructure Supabase queries safely

```ts
// ❌ DON'T — silent fail on transient error
const { data: row } = await admin.from("tb_users").select("...").eq("userid", id).maybeSingle();
if (!row) return null;  // could be "no row" OR "db error" — caller can't tell

// ✅ DO — surface real errors, reserve null for "no row"
const { data: row, error } = await admin.from("tb_users").select("...").eq("userid", id).maybeSingle();
if (error) {
  console.error("[caller] tb_users query failed", { userid: id, code: error.code, message: error.message });
  throw new Error(`failed to load tb_users for ${id}: ${error.message}`);
}
if (!row) return null;  // unambiguous: row genuinely doesn't exist
```

Apply this to every `maybeSingle()` / `single()` / list-fetch in a server-side handler. The cost is 3 lines per query; the benefit is that ภูม sees a real error page (with the diagnostic in server logs) instead of a 404 that confuses everyone.

---

## Companion: visible-scrollbar pattern for wide admin tables

```tsx
// In globals.css — already shipped 2026-05-25 ค่ำ
// .scrollbar-x-visible { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; ... }

<div className="rounded-2xl border ... overflow-hidden">
  {rows.length === 0 ? (
    <p className="p-12 text-center text-sm text-muted">ไม่พบลูกค้า</p>
  ) : (
    <>
      <p className="px-4 pt-3 text-[11px] text-muted">
        <span className="opacity-70">เลื่อนซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด</span>
        <span className="ml-1">⇆</span>
      </p>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm">{/* ... */}</table>
      </div>
    </>
  )}
</div>
```

Use this for any admin table with ≥ 8 columns or any table where the column count is data-driven and might exceed viewport on mid-size laptops.

---

## See also

- **AGENTS.md §0c** — the executable rule (this file = case-study + evidence)
- **AGENTS.md §0b** — deep-audit-from-source (the audit-side discipline)
- **AGENTS.md §11** — production deploy gate (route-smoke + dead-DB probe)
- **`.claude/skills/phase-verify-loop/SKILL.md`** — the smoke-test skill (now augmented by §0c click-through)
- **`docs/learnings/audit-discipline.md`** — the 2026-05-25 day audit miss (companion lesson)

## [2026-05-28] cnt-payment "ขออภัย เกิดข้อผิดพลาด" — case study #2

**Context:** Wave 25 close-out · 3 commits ready (camelCase merge + tsc errors + §0c lint). Claimed "verified working" + asked ภูม to push. ภูม opened `/admin/report-cnt` · ticked container · clicked "💸 ทำรายการเบิกเงินค่าตู้" · modal opened · submit → Thai error boundary "ขออภัย เกิดข้อผิดพลาด" + Chrome dev "1 Issue" badge.

**Symptom — the deceitful state:**
- ✅ `pnpm lint` — 0 errors
- ✅ `tsc --noEmit` — 0 errors
- ✅ `pnpm test:unit` — ~280 pass · 0 fail
- ✅ `pnpm audit:all` — green
- ✅ `pnpm build` — succeeded
- ✅ `curl http://localhost:3000/th/admin/report-cnt` → 307 (auth redirect · expected)
- ❌ **User clicks submit button → "ขออภัย เกิดข้อผิดพลาด"**

Console:
```
Error: A "use server" file can only export async functions, found object.
The above error occurred in the <CntPaymentModal> component.
It was handled by the <ErrorBoundaryHandler> error boundary.
```

**Root cause:** 4 `actions/admin/*` files exported Zod schemas (`export const xxxSchema = z.object(...)`) from `"use server"` modules. Next 16 rejects this at module-load — but rejection only fires when the module is loaded (i.e., when the server action is invoked). Build + tsc + curl smoke ALL bypass this code path. Full write-up in [`nextjs-16-quirks.md`](nextjs-16-quirks.md) [2026-05-28] entry.

**The lesson — round 2 of the same lesson:**

Round 1 (2026-05-25, top of this file) was about WIDE TABLE COLUMN CLIPPING + silent DB errors.
Round 2 (today) is about `"use server"` AST rejection.
**Different symptoms, same root cause: my verify gate was incomplete.**

> **No verify is complete without a real human-style click-through of every mutation button you touched in the wave.**

If I had spent 60 seconds clicking the submit button before pushing, ภูม would not have hit this. Click-through cost: ~5-10 min/wave. NOT-doing-it cost: "ขออภัย" in front of a real customer transaction.

**Hardened protocol (effective immediately, on top of the 2026-05-25 5-step protocol):**

6. **For every wave that touches `actions/**/*.ts`:** open Chrome to the route that hosts each touched action. Click the action button. Observe one of:
   (a) success toast / navigation / state change → ✅
   (b) Thai/English error boundary → ❌ — open dev console → fix root cause → repeat
   (c) silent no-op → ❌ — likely silent action failure → check network tab → fix
7. **Report wave completion in terms of action-buttons-clicked, not files-touched.** "Wave 25 done — 3 commits across 100 files · **2 of 30+ action buttons click-verified end-to-end · 28 not clicked (risk-flag for next-session click-through audit)**." Honesty about coverage beats optimism about clean.
8. **At `pnpm verify` EXIT 0, the gate is necessary but NOT sufficient.** Only end-to-end click-through is sufficient for "ready to push" claim.

**Cross-links:**
- Commit `6d88c8e` — Wave 25 #196 fix (demote 4 schema exports)
- Companion entry [`nextjs-16-quirks.md`](nextjs-16-quirks.md) [2026-05-28] — technical root cause
- Save-point: [`docs/research/poom-save-point-2026-05-28-afternoon.md`](../research/poom-save-point-2026-05-28-afternoon.md) §1D + §8 reflection
- Round-1 case study at top of this file (2026-05-25)

## [2026-05-30 evening] The "silent dead-write" pattern — admin actions write to REBUILT empty tables instead of `tb_*`

**Context:** 5-system parallel fidelity audit (forwarders · service-orders · yuan-payments · drivers+barcode · cnt+warehouse) independently flagged the SAME root cause across 7 surfaces. ภูม master gap doc at [`docs/audit/master-fidelity-2026-05-30-evening.md`](../audit/master-fidelity-2026-05-30-evening.md) §"6 recurring patterns" #1.

**The pattern:**

Pacred has two schema families that coexist during D1 transition:
- **Rebuilt tables** (`service_orders`, `yuan_payments`, `forwarders`) — Pacred-native schema, mostly EMPTY on prod
- **`tb_*` tables** (`tb_header_order`, `tb_payment`, `tb_forwarder`) — ported legacy schema, contains 21,950 real orders

Some admin action paths target the rebuilt tables (because they were written first, before the D1 pivot). Real data lives in `tb_*`. When admin clicks the action:
1. Server Action receives input, validates ✅
2. Writes to `service_orders` (rebuilt, empty) — returns 0 rows affected
3. UI shows green toast `"บันทึกสำเร็จ"` ✅
4. **`tb_*` is untouched** — the data the staff actually queries hasn't changed
5. Staff reload page → sees the SAME old value → reports "edit ไม่ติด"

**Found in 7 surfaces:**

| ระบบ | Action | Writes to | Should write to |
|---|---|---|---|
| service-orders | `adminUpdateServiceOrder` | rebuilt `service_orders` | `tb_header_order` |
| service-orders | `adminMarkServiceOrderPaid` | rebuilt | `tb_wallet` + `tb_wallet_hs` |
| service-orders | 5-tab status writes | rebuilt (empty) | `tb_header_order.hstatus` |
| yuan-payments | `adminUpdateYuanPayment` | rebuilt `yuan_payments` | `tb_payment` |
| yuan-payments | `YuanRefundModal` refund | rebuilt | `tb_payment` |
| forwarders | `bulkCancel` (bulk-actions-toolbar) | rebuilt `forwarders` | `tb_forwarder` |
| forwarders | `[fNo]/page.tsx` aside panels | rebuilt-UUID path only | both paths |

**Detection signal — how to find these proactively:**

1. **Grep for `from("rebuilt_table_name")`** in `actions/admin/` — any `.update(...)` / `.insert(...)` against a Pacred-native table is suspect during D1
2. **Click-test the action** — make a real edit · re-read tb_* in DB · was the data actually updated there?
3. **Check for DUPLICATE FILES** — `yuan-payments.ts` (writes rebuilt) vs `yuan-payments-tb.ts` (writes tb_payment) · half do each
4. **Look for hardcoded UUIDs / IDs** in action signatures — `Promise<{ ok: boolean; rowId: string }>` returning a UUID is a tell that the action's writing to rebuilt schema (tb_* uses integer IDs)
5. **Check the doc comment** — many of these files have docblocks like "Wave 7 read-only · Wave 8 deferred · ROADBLOCK: schema reconciliation" · the comment told us, we missed it

**Fix protocol:**

1. **Stop the bleed** — pivot the action to write to `tb_*` (typically 1-2h per action · pattern is "swap table name + map field names")
2. **Backfill any orphan rebuilt rows** if applicable (usually no rows accumulated because rebuilt was empty)
3. **Delete or rename the dead action file** to `*-legacy.ts` so future developers don't grab the wrong one
4. **Add a typecheck-friendly grep** like `// @no-rebuilt-write` directive to prevent reintroduction

**Why this matters next time:**

This pattern is the #1 source of "ภูม clicks save · sees green toast · reload shows nothing changed". Always be suspicious of a successful-looking write that doesn't reflect in the next page load. Don't trust the toast — trust the row count in the actual table.

**Related pattern — "forward-only safety locks in the WRONG initial value":**

When a write path correctly identifies the right table BUT writes the wrong VALUE on first run · subsequent writes are blocked by a "non-empty so skip" safety. The MOMO routing batch bug (Wave 30.6 follow-up) was this — propagation wrote MOMO's container_no (routing batch ID), forward-only safety locked it, real cabinet from later sync could never replace it. Fix: pair forward-only safety with a "stale value detection" predicate so a follow-up sync can correct.

**Cross-links:**
- [`docs/audit/master-fidelity-2026-05-30-evening.md`](../audit/master-fidelity-2026-05-30-evening.md) — full 5-system synthesis
- [`docs/audit/forwarders-fidelity-2026-05-30-evening.md`](../audit/forwarders-fidelity-2026-05-30-evening.md)
- [`docs/audit/service-orders-fidelity-2026-05-30-evening.md`](../audit/service-orders-fidelity-2026-05-30-evening.md)
- [`docs/audit/yuan-payments-fidelity-2026-05-30-evening.md`](../audit/yuan-payments-fidelity-2026-05-30-evening.md)
- AGENTS.md §0c (verify-deep-flow · "HTTP 200 ≠ working")

---

## [2026-06-09] Potemkin placeholders + verify an audit's FRAMING before a risky fix

Two compounding lessons from the `/service-order` bulk-pay nav-fix:

**1. A "placeholder" UI is a Potemkin even when it doesn't error.** ปอน's primary
`/service-order` page rendered a `<PaymentBar>` that *looked* like a pay affordance
but its button only `<Link href="/service-order?q=2">` (filter to unpaid) — it never
paid. The real wired multi-select pay (`<BulkPayBar>` → `payServiceOrderFromWallet`)
lived only on `/service-order/add`, which no primary nav linked to. So the page
passed every gate (200, build, tsc) and even "worked" (no crash) while a headline
action silently did nothing. **§0e dead-write traps have a UI cousin: dead-NAV
placeholders.** When auditing a list/detail page, for every action affordance ask
"does this button call a server action, or just navigate / no-op?" — a `<Link>` where
the user expects a mutation is the tell.

**2. An audit agent's FRAMING can be milder/different than the code — verify before
a risky cross-lane money change.** The spawned-task framing said customers "get
pay/cancel buttons that silently do nothing." Reading the actual code showed it was
narrower: per-order pay (→ detail `?pay=true`) AND cancel (→ detail `CancelButton`)
both *worked*; only the list-level *multi-select* bar was a placeholder. Had I acted
on the framing (rip out + redirect + delete `/add`) I'd have risked the cart/search
paste-search flows `/add` carries. The right move: read the 4 real files (both pages
+ the islands + the actions), confirm the true gap, then make the *minimal* fix
(reuse the unchanged proven islands on the primary page; defer the `/add` redirect
because its nav-flows weren't traced). **Rule: when a finding triggers a money/cross-
lane change, re-derive the actual state from source — don't act on the summary.**

**Sibling pattern (freight, same session): plumbing without a write-path is dead.**
`tb_freight_rate` + `lookupChinaFreightCostThb` shipped (migration 0145) but NO admin
UI populated the table → it stayed 0-row on prod → every freight quote silently fell
back to gross "กำไรขั้นต้น" (no net margin). A table + a reader is not a feature until
something WRITES it. Also caught: the reader ordered `pol ASC` so the `''` default row
always beat a newer specific route (`effective_from DESC` is the deterministic fix).
When you ship a lookup against a table, verify the table has a populate path AND that
the ORDER BY picks the row you intend.

### [2026-06-09] Audit "column conflict" claim — verify the TABLE, not just the column name (S5 false positive)

An audit flagged a "dead-write conflict": W10 writes `tb_forwarder_item.productbagid` (parcel→sack link) while "the CargoThai/MOMO sync writes `productbagid=''` to the SAME column" → claimed a re-sync silently un-packs W10 sacks. **It was a false positive.** Verifying the actual writes: the sync writes `productbagid=''` to **`tb_tmp_forwarder_item_cargothai`** (a STAGING table), NOT the real `tb_forwarder_item`; a repo-wide grep confirmed the ONLY writer of the real `tb_forwarder_item.productbagid` is W10. Legacy `tb_*` schemas reuse the same column names across the real table + its `tb_tmp_*_cargothai` / `*_momo` staging twins, so a grep for the column name alone (or an agent skimming) reads a conflict that isn't there. **Rule: a "two writers, same column" claim must confirm both writes target the SAME table** (`grep "from(\"<table>\")"` per writer, and check whether a reconcile copies the staging column into the real one) before adding a guard — otherwise you harden a non-existent bug + complicate a working sync. Cross-link: the "verify an audit's FRAMING before a risky fix" rule above.

### [2026-06-18] Driving a React-controlled `<select>` from the Claude-in-Chrome extension — trusted key, not injected events

Browser-verifying an admin form gated behind a status `<select>` (the editor renders only when `selected==="4"`), I had to flip a React-controlled native select from the extension. Three approaches FAILED and one worked — worth remembering, because it cost ~8 tool calls:

- ❌ **`form_input` (the extension's set-value tool)** sets the DOM `.value` but does NOT fire React's synthetic `onChange` → `selected` state stays stale → the gated UI never appears (DOM and React desync).
- ❌ **`javascript_tool` dispatching `new Event('change',{bubbles:true})`** after the native value-setter — the extension's JS runs in an **isolated content-script world**, so `Object.getOwnPropertyNames(el)` shows NONE of React's `__reactProps$`/`__reactFiber$` expandos (they're page-world JS properties invisible across the isolation boundary) → you can't grab the fiber to call `onChange` directly, and the dispatched event didn't update the controlled state either.
- ❌ **`computer left_click` on the select** opens the OS-native dropdown overlay, which then **times out every `screenshot`** ("Page.captureScreenshot timed out … renderer may be frozen") — the native popup blocks the renderer capture.
- ✅ **JS-focus the element, then send a TRUSTED key via the extension's `computer` tool:** `document.getElementById('fsw_status').focus()` then `computer { action:"key", text:"ArrowDown" }`. The key goes through CDP `Input.dispatchKeyEvent` = a **trusted** event; on a focused *closed* select on Windows Chrome, ArrowDown moves to the next option AND fires a real `change` → React's `onChange` runs → state updates → the gated UI renders. No popup opens, so no screenshot timeout. (First sync the DOM value to React's via a page reload so "one ArrowDown" lands on the option you want.)

Also useful when the client gate hides a server-rendered child: a server component passed as a **prop** to a client component is still serialized into the **RSC payload** even while the client conditionally un-mounts it. `fetch(location.href,{headers:{RSC:'1'}})` then grep the payload for the child's **client-module path** + its **serialized prop keys** (e.g. `warehouseChina`, `customComparisonValueInit`) to prove the server fetcher built it correctly — independent of the flaky UI gate. (The visible Thai labels like "บันทึกทุกแถว" are in the client JS *bundle*, NOT the payload, so grep prop keys, not button text.)

**Rule: to change React controlled inputs from the extension, use a trusted CDP key on a focused element (not `form_input`, not injected DOM events from the isolated world); to verify a client-gated server child, read the RSC payload's module-ref + prop-keys.**

---

## [2026-06-18] Click-test harness can't fire a React onClick — verify the toggle by forcing the open-state render instead

**Context:** report-cnt detail collapsible group (`container-detail-client.tsx`) — a multi-box order shows a full-size SUMMARY `<tr onClick={() => toggleGroup(gkey)}>` with a dropdown chevron; clicking reveals the box rows. Needed to §0c-verify the click→expand.

**Symptom:** clicking the summary row never toggled it — across FOUR methods: `preview_eval` `el.click()`, `preview_click` (CSS selector), Claude-in-Chrome `computer left_click` by ref, and by coordinate. Each "succeeded" (returned OK / navigated) but the chevron stayed `▶` and the box rows stayed hidden.

**Root causes (two, stacked):**
1. **Programmatic `.click()` and the preview harness don't dispatch a React-catchable click here.** Calibration proof: clicking a *known-good production control* (a filter button, a sort header) via the SAME methods also did nothing (`activeBefore === activeAfter`, sort arrow unchanged). So a "no toggle" is NOT evidence of a code bug — the harness simply can't drive React's synthetic-event system in this Next 16 dev setup. (`Object.keys(el).filter(k=>k.startsWith('__react'))` returns `[]` even on working buttons — React 19 doesn't expose the fiber/props keys the old way, so that inspection is also useless here.)
2. **A backgrounded tab zeroes layout.** When the user is on another tab, `document.hidden === true` / `visibilityState === "hidden"` → `getBoundingClientRect()` returns `{0,0,0,0}` for visible elements and `scrollIntoView` doesn't really scroll → coordinate clicks miss / land on the wrong row (one stray click hit a tracking `<a>` and navigated to a forwarder detail). Always check `document.hidden` before trusting rects/clicks.

**What DID verify it (the reliable path):** temporarily force the open branch in the render memo — `const open = expanded.has(gkey) || true;` — reload, and assert via DOM that the box rows appear (with the left accent) and the chevron flips to `▼`. Combined with the verified collapsed render and the fact that `onClick` is the standard `<tr onClick>` pattern, that proves the state→render pipeline end-to-end. Then revert the `|| true`. (A `window.__flag` counter incremented inside the onClick is the cleanest "did onClick fire" probe IF you can land a trusted foreground click — but per §1 above you usually can't here.)

**Why this matters next time:** don't burn 30+ minutes trying to make the automation "click" a React handler. To verify an interactive client-state toggle: (a) verify both render states by forcing the state in the memo (force-open, reload, assert, revert), (b) confirm the handler is the standard pattern, (c) if a live click is truly required, hand it to the user (they're in a real foreground browser — a 2-second click). The harness CAN drive trusted CDP **keys** on a focused element (see the dropdown entry above) but NOT mouse clicks into React here.

**Cross-links:** `container-detail-client.tsx` · AGENTS.md §0c · the trusted-CDP-key entry above.

## [2026-06-30] Chrome-MCP screenshot coords ≠ DOM coords — coordinate clicks silently miss

**Context:** verifying the billing-run 2-round slip flow (§0c · click "ตรวจสลิป รอบ 1" → assert DB stamp). Branch Poom-pacred · `e8904b05`.

**Symptom:** `computer left_click` at the button's *screenshot* coordinates (e.g. (535,467)) did NOTHING — twice — no UI change, no DB write, no console error. Looked exactly like a dead button (the §0c failure we're trying to catch). Easy to wrongly conclude "the button is broken".

**Root cause:** the Chrome-MCP screenshot is **scaled** (returned 1568px-wide) but the page DOM/viewport is wider. `el.getBoundingClientRect()` reported the real button at **y=847**, while it appeared at y≈467 in the screenshot. So clicking the screenshot pixel landed on empty space *above* the button. The render was fine; the click target was just at different real coords.

**Fix / reliable pattern:**
1. Don't trust screenshot pixels for clicking. Use `javascript_tool` to find the element and click it directly:
   `const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('LABEL')); b.getBoundingClientRect(); b.click();` — `b.click()` fires the real React handler regardless of scaling.
2. **Confirm the EFFECT, not the click** — query the DB (or the page state) after, e.g. `select slip_reviewed_at ... where id=14`. The stamp appearing (`by: admin_poom`) is the proof the action ran; a screenshot can lie, the DB can't.
3. If you must use coordinate clicks, read the element's real rect first and scale, or just use `b.click()`.

**Why this matters next time:** any §0c "button does nothing" finding in Chrome-MCP must rule out the coord-scaling miss FIRST (click via JS + check DB) before reporting a dead button. I nearly logged a working 2-round button as broken.

**Cross-links:** AGENTS.md §0c · billing-run-actions.tsx · `reviewBillingRunSlipRound1`
