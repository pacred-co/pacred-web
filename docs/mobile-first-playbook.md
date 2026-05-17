# 📱 Pacred — Mobile-first Playbook

> **คู่มือลงมือทำ** สำหรับ frontend — เปิดอ่านก่อนเริ่มงาน customer-facing surface ทุกครั้ง.
> The actionable companion to [`conventions.md`](conventions.md) §11. Practical patterns, concrete examples, common pitfalls + the fix.

Last updated: 2026-05-18 · Owner: ปอน (frontend) · See also: [`conventions.md`](conventions.md) §11 · [`briefs/podeng.md`](briefs/podeng.md)

---

## 1. Why this doc exists

**ลูกค้า Pacred ส่วนใหญ่เข้าผ่านมือถือ.** They Google "ชิปปิ้งจีน" on a phone, tap an ad on a phone, fill the contact form on a phone. A landing page that looks fine on your laptop but breaks at 360px wide is a **lost customer** — they bounce before they ever see the CTA.

Three reasons mobile-first pays off:

1. **Revenue now** — a broken mobile layout on a `/services/*` landing = ad budget burned with no conversion. Google Ads Quality Score also drops on a bad mobile experience → higher cost-per-click → same budget reaches fewer people.
2. **The owner said so, hard** — every frontend change must be designed + checked at a phone viewport first. Build desktop-first and the layout "goes wrong" on mobile (overflow, tiny tap targets, off-screen CTA).
3. **Future native apps** — Pacred plans Android + iOS apps. Component-clean, mobile-first layouts in V2 port cleanly into a future app shell — so the work pays off twice.

**The rule, one line:** design + test at a phone viewport FIRST (360 / 390px), *then* scale up. Never desktop-first.

---

## 2. The 3 reference viewports

Test every customer surface at these three widths before pushing:

| Width | Represents | When it matters |
|---|---|---|
| **360px** | Common Android (the narrowest you must support) | If it works here, it works almost everywhere. Test here FIRST. |
| **390px** | iPhone (12/13/14/15 class) | The single most common device hitting Pacred ads. |
| **1280px+** | Desktop / laptop | Scale-up check — never the starting point. |

### How to set them in Chrome DevTools

1. Open the page → `F12` (or `Cmd+Opt+I`) to open DevTools.
2. Click the **device toolbar** icon (phone+tablet, top-left of the DevTools panel) — or `Cmd+Shift+M` / `Ctrl+Shift+M`.
3. In the device dropdown at the top:
   - Pick **"Responsive"** and type the width manually (`360`, then `390`, then `1280`) — fastest way to hit exact widths.
   - Or pick a preset: **"Pixel 7"** ≈ 360-412px wide, **"iPhone 14 Pro"** ≈ 390px.
4. Throttle to **"Slow 4G"** in the throttle dropdown when checking load feel — phones on mobile data are slower than your wifi.

> 💡 Test at **360px first.** It is the harshest realistic width — fixing it fixes most of 390px for free. Then confirm 390, then scale-check 1280+.

---

## 3. The checklist — each rule + the Tailwind pattern that satisfies it

These are the [`conventions.md`](conventions.md) §11 mobile rules, made concrete. Tailwind v4 here = `@theme inline` in [`app/globals.css`](../app/globals.css), **no `tailwind.config.js`**.

### 3.1 Write mobile styles unprefixed, scale up with `sm:` / `md:` / `lg:`

Tailwind is mobile-first by design: an **unprefixed** utility applies at *all* widths; a `md:` utility applies at `md` **and up**. So you write the phone layout plain, then layer larger screens on top.

```tsx
// ✅ mobile-first — 1 column on phone, 3 columns on desktop
<div className="grid grid-cols-1 gap-4 md:grid-cols-3">

// ❌ desktop-first thinking — there is no "max-width-first" in Tailwind; this is just wrong
<div className="grid grid-cols-3 max-md:grid-cols-1">
```

### 3.2 Touch targets ≥ 44px (iOS) / 48px (Android)

Buttons, links, nav items, icon buttons — anything tappable. A `44px` minimum is the iOS guideline; `48px` is Android's. `min-h-11` = `2.75rem` = 44px.

```tsx
// ✅ tap target meets the minimum
<button className="min-h-11 min-w-11 px-4">ติดต่อทีม</button>

// ✅ icon-only button — still needs the full target box
<button className="flex min-h-11 min-w-11 items-center justify-center">
  <Menu className="h-5 w-5" />
</button>

// ❌ 28px tall — too small to tap reliably on a phone
<button className="h-7 px-2 text-xs">ติดต่อ</button>
```

### 3.3 Body text ≥ 16px — or iOS zooms your form

Any text smaller than 16px **inside an `<input>` / `<textarea>` / `<select>`** triggers iOS Safari's zoom-on-focus — the page jumps and the layout looks broken. `text-base` = 16px. Keep body copy and all form fields at `text-base` or larger.

```tsx
// ✅ inputs at 16px — no iOS zoom jump
<input type="text" className="text-base ..." />

// ❌ text-sm = 14px → iOS zooms in the moment the field is focused
<input type="text" className="text-sm ..." />
```

`text-xs` / `text-sm` are fine for *non-interactive* fine print (captions, helper text) — just never on inputs, and never for primary reading copy.

### 3.4 No horizontal scroll at ANY width

The #1 mobile bug. It comes from a child that is wider than the viewport — a fixed pixel width, an un-wrapped long string, an image with no max width, or negative margins. Use fluid widths + `max-w-*` instead of fixed pixels on layout containers.

```tsx
// ✅ fluid — fills small screens, capped on large ones
<div className="w-full max-w-md">

// ✅ page shell
<main className="mx-auto w-full max-w-6xl px-4">

// ❌ fixed 420px — overflows a 360px screen by 60px → horizontal scrollbar
<div className="w-[420px]">
```

### 3.5 Primary CTA in the thumb zone

On a phone the comfortable tap area is the **lower half** of the screen (where the thumb naturally rests). The main action ("ติดต่อทีม", "เริ่มสั่งซื้อ", "คำนวณราคา") should be reachable there — either repeated low in a hero, or pinned with a `sticky bottom-0` bar on long pages.

```tsx
// ✅ sticky bottom action bar on mobile, normal flow on desktop
<div className="sticky bottom-0 z-10 border-t bg-white p-4 md:static md:border-0">
  <button className="min-h-11 w-full">ติดต่อทีม</button>
</div>
```

### 3.6 Forms: the right keyboard via `type` / `inputMode`

A phone shows a *different keyboard* per field type. Set it so the customer is not hunting for the `@` or digits. This is a 1-attribute change with a real conversion impact on mobile forms.

```tsx
<input type="tel"   inputMode="numeric" />   // phone number → number pad
<input type="email" inputMode="email"   />   // email → keyboard with @ and .
<input inputMode="numeric" />                 // amounts / codes → number pad
```

### 3.7 The pre-push gate

Before pushing **any** customer surface, confirm at **360 + 390px**:

- ✅ No horizontal scroll
- ✅ Every tap target ≥ 44px
- ✅ All text ≥ 16px (especially form fields)
- ✅ Primary CTA visible and thumb-reachable

(Plus a 1280+ scale-check so desktop is not broken either.)

---

## 4. Common pitfalls + the fix

| Pitfall | Symptom on a 360px phone | Fix |
|---|---|---|
| **Horizontal scroll** | Page slides sideways; a thin scrollbar at the bottom | Find the overflowing child — usually a `w-[NNNpx]` fixed width, a wide `<table>`, or a non-wrapping long string. Swap to `w-full max-w-*`. To hunt it: in DevTools console run `document.querySelectorAll('*')` and look for elements wider than `360`, or temporarily add `* { outline: 1px solid red }` to spot the culprit. |
| **Tiny tap targets** | Buttons/links hard to hit, mis-taps | `min-h-11 min-w-11` on every interactive element; give icon-only buttons a padded box. |
| **Text overflow / truncation** | Long Thai/English words spill out of cards or get cut | Let text wrap (`break-words`); for deliberate single-line clip use `truncate` *only* where the full text is available elsewhere. Never fix overflow by shrinking the font below 16px. |
| **Modal doesn't fit 360px** | Dialog wider than the screen, or its buttons fall off the edge | `w-full max-w-md` on the modal panel + `p-4`; make the body `overflow-y-auto` with a `max-h-[90vh]` so a tall modal scrolls internally instead of overflowing. |
| **Sticky header eats the viewport** | A tall `sticky`/`fixed` header covers content; anchored sections hide under it | Keep mobile headers short (`h-14`); offset anchored content with `scroll-mt-16`; reserve space with matching top padding. |
| **Images missing `max-w-full`** | A large image forces the whole page wider → horizontal scroll | Always `max-w-full h-auto` on images; with `next/image` set `width`/`height` and a responsive `sizes`, and let the wrapper be fluid. |
| **Hover-only interactions** | Dropdown/tooltip that opens on `:hover` never opens on touch | Touch devices have no hover. Drive menus/tooltips with a tap (`onClick` toggling state), not `hover:` alone. Treat `hover:` styles as a desktop enhancement only. |
| **Fixed-height containers** | Content clipped when Thai text wraps to more lines than English | Avoid fixed `h-[NNNpx]` on text containers — use `min-h-*` so the box grows with content. |

---

## 5. How to test

1. **DevTools device toolbar** — the everyday check. Set Responsive width to **360**, walk the whole flow, then **390**, then **1280+**. Throttle to Slow 4G to feel real load. (Setup steps → §2.)
2. **A real phone** — for a final pass on a customer-critical surface (a landing page, the contact form, checkout), open it on an actual Android + iPhone if you can. Emulation is close, not identical — real touch + real Safari catch the last issues.
3. **The `mobile-first-verify` skill** — an agent walks the 3 reference viewports for you and reports horizontal-scroll / tap-target / text-size / CTA-visibility violations against the §3.7 gate. Invoke it before pushing a customer surface, or when a layout "feels off" on mobile. (`mobile-first-verify` is being added in this same docs-upgrade pass — once present it is the fastest way to run the gate.)

---

## 6. The gate — before pushing any customer-facing surface

Do not push a customer-visible change until you have verified, **at 360px and 390px**:

- [ ] **No horizontal scroll** — page does not slide sideways at any width
- [ ] **All tap targets ≥ 44px** — buttons, links, nav items, icon buttons
- [ ] **All text ≥ 16px** — body copy and *every* form field (`text-base`+)
- [ ] **Primary CTA visible + thumb-reachable** — the main action sits in the lower-half thumb zone, not off-screen
- [ ] **1280+ scale-check** — desktop layout still holds

ผ่านครบ → push ได้. ไม่ผ่าน → แก้ก่อน. หน้าจอลูกค้าพังบนมือถือ = เสียลูกค้า.

---

**End of mobile-first-playbook.md** — questions ถามเดฟ / ปอน. The canonical rule list lives in [`conventions.md`](conventions.md) §11; this doc is the how-to.
