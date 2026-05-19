# ปอน — Brand-Asset Swap (2026-05-20) · ✅ pass 1 complete

> **To: เดฟ + ภูม** — coordination note (claim-before-build, per the
> faithful-port no-collision rule). ปอน is on `podeng`, synced to
> `faithful-port` (`e8a0ba0` · customer portal 12/24 transcribed).
>
> **Status:** ✅ pass 1 done — 1 safe swap applied · full inventory + the
> missing-PR-asset list below · 2 broken refs flagged for เดฟ.

## The task

The 1:1 transcription uses **legacy PCS placeholder assets** under
`public/legacy/pcs/` wherever an official Pacred `PR` asset doesn't exist yet.
ปอน's job ([`faithful-port-plan.md`](../runbook/faithful-port-plan.md) work-split):
swap to the `PR` asset where one exists; where it doesn't, **keep the legacy
placeholder** (stays 1:1-faithful) + log it here for the owner to commission.

**Method note — non-collision.** Swaps are done **in-place** (`public/` files
only) — overwrite the file the screen already references; no edits to the
transcribed `.tsx`/`.css` files (those are เดฟ's active lane). The reality of
this pass: **almost no `PR` assets exist yet**, so pass 1 is mostly the
inventory — the precise list of what the owner must source. Inventing recolored
icons would be divergence, not a faithful port — so legacy placeholders stay
until real `PR` assets land.

---

## ✅ Done this pass — the one safe swap

| Asset | Action |
|---|---|
| `public/legacy/pcs/logo.png` | **Swapped → the Pacred red logo** (`images/pacred-logo-red.png`). It is the wallet-card brand mark on `/wallet` + `/service-payment` (class `brand-logo logo-wallet`, white card → red logo). PCS→PR rebrand; both square (80²→140², no distortion); both usages share one context so one file serves both; touches only `public/` — zero collision. |

---

## 📋 Full inventory — 36 legacy PCS placeholder assets

### A. Pacred-brand assets — swap targets

| Asset | Used by | PR asset? | Action |
|---|---|---|---|
| `logo.png` | wallet · service-payment (wallet card) | ✅ `pacred-logo-red.png` | ✅ **SWAPPED** |
| `shops/pcs-logo.png` (236×64 wide lockup) | service-order (shop-source row) | ❌ no wide PR lockup | 🔴 missing — need a **horizontal PR logo lockup ~236×64** |
| `icon/pcs-*.png` ×16 (launchpad icon set — 64×64: address · call-center · cart · forwarder · forwarder-pay · home · home-main · line-notify · log-out · payment · sales · shop · shops · wallet · wallet-add · wallet-drop) | dashboard launchpad + portal nav | 🟡 only 2 candidates exist (`images/home/iconfloating/pacred-home-main.png` + `pacred_sales.png`, both 64×64) | 🔴 missing — need a **complete 16-icon PR set**. Partial-swapping 2/16 = an inconsistent grid → keep the whole legacy set until the full PR set lands. |

### B. Third-party logos — KEEP (not Pacred brand — must NOT rebrand)

`shops/1688-logo.png` · `shops/1688-logo-3.png` · `shops/taobao-logo.png` ·
`shops/tmall-logo.png` · `shops/tmall-taobao-logo.png` · `shops/nice-logo.png`
→ external platform logos (1688 / Taobao / Tmall). **Stay as-is** — these are
not Pacred assets; rebranding them would be wrong.

### C. Decoration / theme — legacy, no PR version (low priority)

| Asset | Note |
|---|---|
| `theme/crate-v3.png` · `theme/uncrate-v3.png` | ตีลังไม้ / ไม่ตีลัง option art (cart) |
| `theme/transport-car-v3.png` · `theme/transport-sea-v3.png` | รถ EK / เรือ SEA transport-mode art |
| `theme/free50-3.png` | "free 50฿" promo art (referenced ×5) |
| `theme/bg-form-pro-valentine.png` · `theme/bg-form-pro-valentine+maomao.png` · `theme/btn-form-pro-valentine+maomao.png` | seasonal Valentine skin — legacy promo |
| `bg.jpg` · `shop-2-300x300.png` | background / shop placeholder |

→ keep legacy; ⚪ owner to decide whether Pacred wants its own versions.

### D. Avatars

`images/users/user.jpg` · `admin/images/user.jpg` → default user avatar
placeholder. ❌ no PR version → keep legacy; 🟡 a PR-styled default avatar would
be a small win.

---

## ⚠️ Broken references — flag to เดฟ (transcription bug, NOT a brand-asset gap)

Two assets are **referenced by transcribed screens but do not exist** — not in
`public/legacy/pcs/`, and not in the legacy source
(`/Users/dev/Desktop/pcscargo/member/assets/images/`):

| Broken ref | Referenced by | Fix (เดฟ) |
|---|---|---|
| `/legacy/pcs/shops/default.png` | service-order screens ×3 (shop-logo fallback) | stage a default shop image, or fix the fallback logic so a missing shop logo doesn't 404 |
| `/legacy/pcs/theme/success.gif` | `public/legacy/pcs/*.css` (`url(...)`) | stage the asset, or drop the dead CSS rule |

These render as broken images today — worth a quick fix in เดฟ's lane.

---

## 🛒 Missing-PR-assets list — for the owner to commission

The faithful port is otherwise complete on assets; these are what's needed to
finish the `PCS → PR` brand swap. Until they exist, the legacy placeholders
keep every screen 1:1-faithful.

1. **🔴 A 16-icon PR launchpad icon set** (64×64 each) — the biggest item. To
   replace `icon/pcs-*.png`. The 16: address · call-center · cart · forwarder ·
   forwarder-pay · home · home-main · line-notify · log-out · payment · sales ·
   shop · shops · wallet · wallet-add · wallet-drop. *(2 already exist —
   `pacred-home-main` + `pacred_sales` in `images/home/iconfloating/` — owner /
   ปอน confirm the style, then commission the remaining 14 to match.)*
2. **🔴 A horizontal PR logo lockup** (~236×64) — for the shop-source row
   (`shops/pcs-logo.png`).
3. **🟡 A PR default avatar** — replaces `user.jpg` ×2.
4. **⚪ (optional) PR theme art** — crate / transport-mode / promo decorations.

---

## Non-collision — what ปอน did NOT touch

- ❌ Customer-screen 1:1 transcription — **เดฟ's active lane** (12/24 done +
  map · forwarder-table · print · pay · invoiceF · sales-report in flight).
- ❌ Admin back-office — **ภูม's lane**.
- ปอน edited only `public/legacy/pcs/logo.png` (1 binary swap) + this doc.

## Open question for เดฟ (carried)

The auth screens — `login.php` · `register.php` · `forgot-password.php` — are
not in เดฟ's current agent batch (`93a4ce2` reads as a polish of the rebuilt
auth pages, not a 1:1 transcription). เดฟ — confirm; ปอน takes them next round
if free.
