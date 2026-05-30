# ORPHAN / ENTRY-POINT SWEEP — reachability audit (2026-05-30)

> **Owner directive (AGENTS.md §0d):** *"ทุกฟังชั่น ต้องมีปุ่ม หรือทางเข้า ให้เข้าถึง เข้าใช้ได้หมด"* — every route must be reachable in ≤3 clicks from the sidebar/dashboard. URL-typing does **not** count.
>
> This is the Sprint-0 deliverable requested in [`_MASTER.md`](_MASTER.md) §8 (owner: **ปอน** frontend-nav + **เดฟ** review).
> **Method:** 4-agent parallel sweep over all `(admin)/admin/*` + `(protected)/*` routes vs every inbound `<Link href>` / `<a href>` / sidebar-nav-array entry / menubar / row-action button / `router.push` / `redirect()`. `/admin/search` orphan hand-verified.
> **Scope:** `InwPond007` @ post-sync 2026-05-30 (= `dave-pacred` HEAD `bbfd525e`). Read-only discovery — **no nav was wired yet** (awaiting เดฟ review + ปอน prioritisation).

## Summary

| Zone | Routes | Reachable | Orphan (hard) | Cascade-orphan |
|---|---|---|---|---|
| `(protected)/*` customer | 66 | 52 | **14** | — |
| `(admin)/admin/*` | 210 | 184 | **18** | **8** (freight family) |
| **Total** | **276** | **236** | **32** | **8** |

**Verdict legend:** 🔴 **WIRE** = real feature, just missing a nav entry · 🟡 **WIRE?** = orphan but confirm intent with เดฟ (may be Phase-C/deferred) · 🗑️ **DELETE-REVIEW** = looks like a dead/duplicate stack whose live twin is already wired → เดฟ confirms then delete.

---

## A. Customer portal `(protected)/*` — 14 orphans

| Route | Verdict | Evidence / why orphan |
|---|---|---|
| `/service-import/truck` | 🔴 WIRE | air/sea/truck are mutually cross-linked only (`_tracking/tracking-page.tsx:462` mode-switcher); no sidebar/launchpad entry into the trio. Wiring ONE inbound entry rescues all three. (CLAUDE.md smoke-tested `/truck` by typed URL — doesn't count.) |
| `/service-import/sea` | 🔴 WIRE | same cluster as `/truck` |
| `/service-import/air` | 🔴 WIRE | same cluster as `/truck` |
| `/freight/receipts/history` | 🔴 WIRE | only ref is `revalidatePath()` in `actions/freight.ts:249` (cache, not nav). Its print child IS linked; the list itself has no `<Link>` in |
| `/freight/invoice/[id]` | 🟡 WIRE? | `freight/shipments/[id]/page.tsx:391-415` links the **API** routes (`/api/freight-invoice/${id}`), never this page route |
| `/service-import/[fNo]/invoice` | 🟡 WIRE? | self-reference only; the `[fNo]` detail links `/freight/receipts/print/${rID}` instead. No `${...}/invoice` interpolation anywhere |
| `/service-import/[fNo]/receipt` | 🟡 WIRE? | self-reference only; the only `${...}/receipt` link in repo is for `/service-order/[hNo]/receipt` |
| `/map` | 🟡 WIRE? | verbatim Google-Maps page (cust-06); zero inbound `/map` link |
| `/my-issues` | 🟡 WIRE? | zero inbound href; Pacred-only screen, not on sidebar/launchpad |
| `/pay` | 🟡 WIRE? | page links OUT to `/dashboard` but nothing links IN |
| `/commissions` | 🗑️ DELETE-REVIEW | only `/commissions/me` is wired (protected-sidebar). This bare page is a distinct dead twin |
| `/orders` | 🗑️ DELETE-REVIEW | pre-D1 rebuilt demo; circular-only with `/orders/new`; `robots.ts:19` disallows it. Live list = `/service-order` |
| `/orders/new` | 🗑️ DELETE-REVIEW | circular twin of `/orders`; live create = `/service-order/add` |
| `/wallet-shop` | 🗑️ DELETE-REVIEW | rebuilt `tb_wallet_shop`/`tb_shop_transactions` (cust-05 W14 "💀"); legacy says not in customer menu; only `revalidatePath` refs |

**Watchlist (reachable but WEAK entry):** `/bookings` + `/bookings/[bookingNo]` — sole inbound `<Link>` is from the **public** post-booking confirmation page (`book/.../confirmation/page.tsx:289`); there is no standing customer-portal nav tile. Treat as WIRE if "reachable from the running customer chrome" is required.

---

## B. Admin `(admin)/admin/*` — 18 orphans

| Route | Verdict | Evidence / why orphan |
|---|---|---|
| `/admin/search` | 🔴 WIRE | global search hub. The 3 inbound links were **removed** Wave-24 #188 (`52397c9`); `service-orders/cart/page.tsx:259-264` documents the removal; sidebar uses `/admin/customers?focus=search` instead. **Gates the entire freight family (§C).** |
| `/admin/reports/forwarder-profit` | 🔴 WIRE | `report-shell.tsx` renders NO sibling-report nav; reports-hub menubar/cards omit it. Only its own `pathname=` prop. (Also P0-20 dead-read.) |
| `/admin/reports/shops-profit` | 🔴 WIRE | same — hub links `shops-profit-pay` (different route), never this |
| `/admin/reports/yuan-profit` | 🔴 WIRE | same — no inbound link anywhere |
| `/admin/reports/otp-success` | 🔴 WIRE | same — no inbound link |
| `/admin/reports/sales-monthly` | 🔴 WIRE | same — hub links `sales-by-rep`, not this |
| `/admin/accounting/payment` | 🔴 WIRE | faithful `acc-payment.php` port; sibling ports `/accounting/forwarder`+`/shop` ARE hub cards, this one was left out. Only its own self-POST filter form |
| `/admin/accounting/withdraw` | 🔴 WIRE | same pattern as `/accounting/payment`; omitted from ACCOUNTING_HUB_CARDS |
| `/admin/customers/[id]/transfer-rep` | 🔴 WIRE | per-customer rep transfer; `legacy-view.tsx:360` links only the **bulk** `/admin/customers/transfer-rep`. Detail-page comment: "deferred to Phase C" |
| `/admin/customers/[id]/convert-to-juristic` | 🔴 WIRE | no button on the customer detail; same "deferred to Phase C" note |
| `/admin/settings/contacts` | 🔴 WIRE | not in settings sidebar tree (general/notifications/business-config/rates/system/tools only); only self `?kind=` filter chips |
| `/admin/containers/[id]/hs` | 🟡 WIRE? | the real HS-code editor; its parent `/containers/[id]` + `/containers` are redirect-stubs (→ report-cnt), so the dashboard links bounce away and never expose `/hs`. Wire a row-action into `/admin/report-cnt/[fNo]` or `/admin/cnt-hs/[id]` |
| `/admin/wht` | 🟡 WIRE? | WHT is surfaced inline on `tax-invoices/[id]`; the standalone chase-queue has no door (only self `?status=` chips) |
| `/admin/notifications/dispatch` | 🟡 WIRE? | Sprint-11 P2.3.B feature; only its own self GET-form. Wire to Settings or DELETE-REVIEW |
| `/admin/payment-reconciliation` | 🟡 WIRE? | V-A3 Phase-2; only action-imports, zero nav. Wire to accounting menubar or DELETE-REVIEW |
| `/admin/wallet/deposit` | 🗑️ DELETE-REVIEW | dup — WALLET_MENUBAR + cards use `/admin/wallet/add`; page's own comment calls itself a future "Wave-B" stub |
| `/admin/system/cron-health` | 🗑️ DELETE-REVIEW | `redirect()` alias stub; sidebar links `/admin/system/crons` directly |
| `/admin/migration/pcs-customers` | 🗑️ DELETE-REVIEW | one-off backfill tool; zero nav refs. Confirm migration done → remove or gate behind super-tools |

**Cleared suspects (verified reachable — NOT orphans):** `/admin/wallet/pay-user` (WALLET_MENUBAR "จ่ายแทนลูกค้า") · `/admin/yuan-payments/[id]` (list rows + customer detail + dashboard) · `/admin/service-orders/cart` + `/cart/add` (service-orders menubar). `/admin/service-orders/print` **does not exist** (P0-15 — absent, not orphan). Redirect tombstones reachable-by-design: `/admin/warehouse/containers`, `/admin/containers/[id]`, `/admin/report-cnt/pay`.

---

## C. Freight cascade (8 routes — internally linked, no live root)

The whole `/admin/freight/*` subtree is internally cross-linked (list ↔ detail ↔ new) but its **primary external entry is the orphaned `/admin/search`**. Freight-role sidebars point to `/admin/forwarders?segment=freight` + `/admin/customers?segment=freight`, **not** `/admin/freight/*`. So these are effectively unreachable from any live sidebar/dashboard:

`/admin/freight/declarations` · `/declarations/[id]` · `/freight/quotes` · `/quotes/[id]` · `/quotes/new` · `/freight/shipments` · `/shipments/[id]` · `/shipments/new`

*(Partial: `/freight/quotes/new` is also reachable via the `bookings/[bookingNo]` panel, so the quotes path has a weak door; declarations + shipments do not.)*

**Fix:** add a **Freight** sidebar section (or re-wire `/admin/search`) → the freight subtree + the bookings→quotes path become reachable in ≤3 clicks.

---

## D. Next actions — BY OWNER (one owner per surface)

**🔄 Tried + reverted (ปอน 2026-05-30):**
- `/service-import/{truck,sea,air}` trio — a "ติดตามตู้ขนส่ง" tab was added to `/service-import` then **removed per ปอน** (a tab there wasn't wanted). The trio (ปอน's cargo-LCL container-tracking build) **remains an orphan** — entry point still TBD (needs a different home, decide w/ ปอน).

**👉 ภูม / เดฟ — admin nav (ปอน flagged · NOT ปอน's lane: `(admin)/*` + `lib/admin/`):**
- 5 P&L reports (`forwarder-profit`/`shops-profit`/`yuan-profit`/`otp-success`/`sales-monthly`) → reports-hub `REPORTS_MENUBAR` / QuickCards (`app/.../admin/reports/page.tsx`). **⚠️ same files as ภูม Task-7 reports rewrite — coordinate to avoid collision.**
- `/admin/accounting/payment` + `/withdraw` → `ACCOUNTING_HUB_CARDS` (`app/.../admin/accounting/page.tsx`).
- `/admin/settings/contacts` → settings sidebar tree (`lib/admin/sidebar-menu.ts`).
- **Freight** sidebar section (§C) → `lib/admin/sidebar-menu.ts` (rescues the 8 freight routes).
- "ย้ายเซลล์" + "เปลี่ยนเป็นนิติบุคคล" buttons on the admin customer-detail → `/admin/customers/[id]/{transfer-rep,convert-to-juristic}`.
- 🟡 เดฟ decision first: `/admin/search` re-entry (or replace w/ customers global-search), `/admin/wht`, `/admin/notifications/dispatch`, `/admin/payment-reconciliation`, `/admin/containers/[id]/hs`.

**🟢 ปอน customer-lane backlog (`(protected)/*` · wire when prioritised):**
- WIRE: `/freight/receipts/history` · `/service-import/[fNo]/{invoice,receipt}` · `/freight/invoice/[id]` · `/map` · `/my-issues` · `/pay`.

**🗑️ DELETE-REVIEW (เดฟ confirms · like the address-stack):** customer `/commissions` `/orders` `/orders/new` `/wallet-shop` · admin `/admin/wallet/deposit` `/admin/system/cron-health` `/admin/migration/pcs-customers`.

**Cross-ref to [`_MASTER.md`](_MASTER.md):** several orphans confirm known death-flows — `/admin/reports/*-profit` = P0-20 (dead-read **and** orphan), `/admin/wallet/pay-user`-family = P0-19, the address stack (already deleted) = P1-29. Reachability (dim-3) and dead-write (dim-2) overlap but are independent: wiring a nav to a dead-write page makes it *visible-but-still-broken* — coordinate the wire with the owner's tb_* fix.
