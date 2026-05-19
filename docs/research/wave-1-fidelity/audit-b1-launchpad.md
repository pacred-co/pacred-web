# Wave-1 fidelity audit — B-1: customer 9-icon launchpad home

> Audit date: 2026-05-19 · Auditor: cargo-domain reviewer (ภูม-side) ·
> Read-only against branch `dave` (merged into `Poom` per save-point).
> Compares the Wave-1 launchpad slice to legacy `member/menu.php` per
> [`d1-fidelity-customer.md`](../d1-fidelity-customer.md) §1 +
> [`d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) §1.

---

## 1. Files audited

- `app/[locale]/(protected)/dashboard/page.tsx` — the post-login home page
- `components/sections/pcs-launchpad-header.tsx` — red header band (avatar + name + PR code + 2 corner icons)
- `components/sections/pcs-wallet-card.tsx` — overlapping wallet card (animated count-up + gold bar)
- `components/sections/pcs-sales-rep-card.tsx` — "ผู้ดูแล / เซลล์ <name>" card
- `components/sections/pcs-icon-grid.tsx` — the 9-icon launchpad grid (3×3)
- `messages/th.json` `pcsHome` namespace (lines 2341-2359) — labels
- `supabase/migrations/0081_pcs_legacy_schema.sql` — confirms `tb_*` schema exists

---

## 2. Layout fidelity — VERDICT: 🟢 excellent

The page composes the components in the correct legacy order top → bottom:

| Slot | Legacy `menu.php` | Pacred `/dashboard` | Match |
|---|---|---|---|
| 1 | Red gradient header band — avatar + name + PR + 2 corner icons | `<PcsLaunchpadHeader>` (rose gradient · 80px avatar · `displayName` · `PR####` · Pencil + Settings buttons top-right) | 🟢 faithful |
| 2 | White wallet card overlapping the band — animated counter + gold bar | `<PcsWalletCard>` (`-mt-12` overlap · `useCountUp` ease-out cubic over 900ms · gold gradient bar · Pacred logo right · clickable → `/wallet/history`) | 🟢 faithful |
| 3 | Sales-rep card — "ผู้ดูแล" + "เซลล์ <name>" + tappable Tel | `<PcsSalesRepCard>` (round 56px photo left · "ผู้ดูแล" kicker · "เซลล์ <name>" · `tel:` link · falls back to Pacred care line) | 🟢 faithful |
| 4 | 9-icon grid (3 cols × 3 rows) — 70px PNG + Thai label per cell | `<PcsIconGrid>` `grid-cols-3` · 70px circular icon wells · Lucide outline icons · labels match legacy text **exactly** · order matches **exactly** | 🟢 faithful |

**Icon order check (vs gap-map §1):** Shop → Import → Receipts → Payment → Wallet → Top-up → Withdraw → Address → Logout — ✅ correct, 1-for-1 with legacy.

**Demoted secondary section** (banners · 4 mini-stats · 2 recent-activity lists) lives *below* the grid, max-width 640px, clearly secondary — matches the gap-doc directive "Pacred-only · 🟢 acceptable as a secondary row · do not let it replace the grid."

---

## 3. Data source audit — VERDICT: 🔴🔴 B-0 GAP (per ภูม save-point key finding)

| Component / read | Table read | Classification |
|---|---|---|
| `<PcsLaunchpadHeader>` — name / member_code / avatar | (none — `profile.*` from `getCurrentUserWithProfile()`) | ⚪ already on the profile object — no extra DB read |
| `<PcsIconGrid>` | (none — static TILES array) | ⚪ static config |
| `<PcsWalletCard>` balance | `.from("wallet")` line 68 — `profile_id` filter | 🔴 **rebuilt-era** — should read `tb_wallet` by `userid = profile.member_code` |
| `<PcsSalesRepCard>` — sales-rep lookup | `.from("profiles")` × 2 + `.from("admin_contact_extras")` lines 26 / 40-41 / 48 | 🔴 **rebuilt-era** — legacy assigns rep via `tb_users.adminid`; needs lookup against the ported staff in `tb_users` |
| Dashboard mini-stat: orders pending | `.from("service_orders")` line 72 — `profile_id` + `status IN (...)` | 🔴 **rebuilt-era** — should be `tb_header_order` where `userid = profile.member_code` and `hstatus IN ('1','2')` |
| Dashboard mini-stat: forwarders pending payment | `.from("forwarders")` line 76 | 🔴 **rebuilt-era** — should be `tb_forwarder` `userid = member_code` and `fstatus = '5'` (the legacy "รอชำระเงิน" slot — see gap-map §2) |
| Dashboard mini-stat: cart count | `.from("cart_items")` line 71 | 🔴 **rebuilt-era** — should be `tb_cart` by `userid` |
| Dashboard mini-stat: yuan-payments pending | `.from("yuan_payments")` line 80 | 🔴 **rebuilt-era** — should be `tb_payment` by `userid` |
| Recent forwarders list | `.from("forwarders")` line 84 — selects `f_no, status, weight_kg, volume_cbm, total_price, created_at, tracking_th` | 🔴 **rebuilt-era** — should be `tb_forwarder` selecting `fno, fstatus, fweight, fvolume, ftotal, fdate, ftrackingth` |
| Recent shop-orders list | `.from("service_orders")` line 89 — selects `h_no, status, title, item_count, total_thb, payment_due_at, created_at` | 🔴 **rebuilt-era** — should be `tb_header_order` selecting `hno, hstatus, htitle, hcount, htotalpriceuser, hdate2, hdate` |

**Confirmation of save-point KEY FINDING — accurate:** `grep "\.from\("tb_"` against the dashboard subtree returns **0 hits**; every dynamic read targets the rebuilt-era schema. A migrated PCS customer logging in via B-auth ✅ lands on a fully-faithful UI ✅ that displays a wallet balance of **`฿0.00`**, **0 pending counts**, and empty recent-activity lists — because their data lives in `tb_wallet` / `tb_header_order` / `tb_forwarder`, which nothing here reads.

---

## 4. Fidelity gaps — element-by-element

🟢 **No paradigm / layout gaps found.** Wave-1 has rebuilt the launchpad correctly per the §1.2 gap table:
- 🟢 9-icon grid present, correct order, correct labels (`tileShop` … `tileLogout` match legacy Thai exactly)
- 🟢 Wallet card overlapping the header (`-mt-12`) with animated counter + gold bar
- 🟢 Sales-rep card pinned under the wallet (correct sub-order — was 🟠 before)
- 🟢 Top-right corner icons present (Pencil + Settings → `/profile`)
- 🟢 Avatar + PR####  in centred header
- 🟢 Logout is a launchpad cell (was 🟡 — closed)
- 🟢 Stats + recent lists demoted under the grid (clear visual hierarchy)

**Open from §1.2 not closed in this slice (carry-forward):**
- 🟠 Login redirect — non-admin still lands at `/` not `/dashboard` (out of scope for B-1; tracked in `actions/auth.ts` `signIn`)
- ⚪ Live rate chips — gap-doc said remove from dashboard; nothing rendered here → ✅ already clean
- ⚪ Page `<title>` rebrand to `… | Pacred` — minor, not blocking

---

## 5. Required fixes (the B-0 swap list)

To convert this slice from "faithful UI on empty data" → "faithful UI showing real legacy data", every `.from("<rebuilt>")` in §3 must swap to `.from("tb_<legacy>")` keyed by `profile.member_code`, not `profile.id`. The mapping (legacy column names confirmed from `0081_pcs_legacy_schema.sql`):

```
// dashboard/page.tsx
- .from("wallet")            .eq("profile_id", profile.id)
+ .from("tb_wallet")         .eq("userid", profile.member_code)
                             .select("wallettotal")          // → balance

- .from("cart_items")        .eq("profile_id", profile.id)
+ .from("tb_cart")           .eq("userid", profile.member_code)

- .from("service_orders")    .eq("profile_id", ...).in("status", ["pending","awaiting_payment"])
+ .from("tb_header_order")   .eq("userid", member_code).in("hstatus", ["1","2"])

- .from("forwarders")        .eq("profile_id", ...).eq("status", "pending_payment")
+ .from("tb_forwarder")      .eq("userid", member_code).eq("fstatus", "5")   // legacy slot-5 = pay AFTER arrive

- .from("yuan_payments")     .eq("profile_id", ...).in("status", ["pending","processing"])
+ .from("tb_payment")        .eq("userid", member_code).in(<legacy status col>, [...])

// recent lists: same swap + map the column names
//   tb_header_order: hno, hstatus, htitle, hcount, htotalpriceuser, hdate2 (payment due), hdate
//   tb_forwarder:    fno, fstatus, fweight, fvolume, ftotal, ftrackingth, fdate

// pcs-sales-rep-card.tsx — needs a rep lookup against tb_users.adminid (legacy field)
//   .from("profiles") chain → .from("tb_users").select("...").eq("userid", profile.member_code)
//   then fetch the rep row by the rep's tb_users.userid
```

Two architectural notes the fix needs to settle:
- **Status vocab.** While re-pointing, the badge maps `STATUS_BADGE_F` / `STATUS_BADGE_SO` (lines 32-48) and the `t("status.…")` / `t("fstatus.…")` keys must be re-keyed to legacy values `1..6` / `1..7` (gap-map §2). This is a B-2 concern — Wave-1 status badges currently use rebuilt-era enum strings.
- **Wallet hook-up.** `profile.member_code` is available on the page (line 107). The bigger Q is the **`profiles` ↔ `tb_users` bridge** raised in ภูม's save-point §5 — does the `userid` lookup always match `profile.member_code`? B-auth provisions via member_code, so yes for migrated rows; new sign-ups need a `tb_users` shadow row or the read needs to fall back to the rebuilt-era table for non-migrated customers. Coordinate with ภูม before swapping.

---

## 6. Severity ranking

| # | Issue | Severity | Impact |
|---|---|---|---|
| 1 | Wallet / orders / forwarders / payments / cart read rebuilt-era tables (§3) | 🔴 paradigm — blocks the faithful port outcome | A migrated PCS customer sees ฿0 / 0 / 0 / empty lists; the whole UI is a hollow shell for the 8,898 ported customers |
| 2 | Sales-rep lookup goes through `profiles`/`admin_contact_extras` not `tb_users.adminid` | 🔴 paradigm | Migrated customers' assigned rep (years of CRM relationship) is invisible; fallback to the company line |
| 3 | Status badges + `t("status.…")` map rebuilt-era enums | 🟠 layout — visible mismatch once §1+§2 are fixed | Will display wrong Thai labels for the recent-activity rows after swap |
| 4 | Login redirect → `/` instead of `/dashboard` | 🟠 layout | Carry-forward from §1.2; migrated customer skips the launchpad entirely |
| 5 | Page `<title>` rebrand to Pacred | 🟡 polish | Tab title only |

---

## 7. Recommendation

**Ship Wave-1 as-is + queue B-0 + B-2 as Wave-2 — DO NOT rebuild B-1.** The UI/layout port is excellent — exactly what the owner's "copy 100% identical first" directive demanded, and what `d1-fidelity-customer.md` §1 explicitly requested as "the #1 Phase-B item." Reverting it would be net-negative.

What needs to happen *next*:

1. **Wave-2 / B-0 (data foundation)** — the single highest-leverage Phase-B unit of work. Re-point the 7 reads in §5 above. This is the same B-0 ภูม flagged in `poom-save-point-2026-05-19.md`; the launchpad is one of three Wave-1 slices that depend on it (the other two: admin-sidebar badge counts, and any future read in the per-role sidebars). Without B-0 the launchpad's "faithfulness" is cosmetic only.
2. **Wave-2 / B-2 (status-vocab reconcile)** — must land in the *same* wave as B-0; otherwise recent-activity badges break on swap. Bundle them.
3. **Login-redirect tweak (§1.2 carry-forward)** — one-line fix in `actions/auth.ts` `signIn` — trivially bundleable with B-0.

**Flag back to เดฟ:** the B-1 visual fidelity is shippable; the connective data layer (B-0) is the real next slice and must precede any further Phase-B UI work — otherwise every new faithful screen will be another hollow shell pointing at rebuilt-era data. The save-point's "B-0 is the missing layer" conclusion holds, with the launchpad as Exhibit A.
