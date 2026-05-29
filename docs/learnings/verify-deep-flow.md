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
