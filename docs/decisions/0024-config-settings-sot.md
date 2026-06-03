# ADR-0024 — Config SOT: legacy `tb_settings` (rate/cost) + `business_config` (tax/OTP/flags); retire the rebuilt `settings`

**Status:** ✅ ACCEPTED + IMPLEMENTED 2026-06-01 (owner approved; shipped main `1fb8ee6f`). `/admin/settings` neutralized → read-through hub (6 dead-write fields stopped; canonical editors = `/admin/settings/legacy-rates` + `/forwarder-costs` + `/business-config`). Follow-up (chip filed): `/admin/rates/page.tsx` still reads the rebuilt `settings` (dead-read display).
**Source:** 2026-06-01 big audit — [`docs/research/big-audit-2026-06-01/05-rates-settings-promo.md`](../research/big-audit-2026-06-01/05-rates-settings-promo.md) §1b/§2/§3 G3 + [`_MASTER-PLAN.md`](../research/big-audit-2026-06-01/_MASTER-PLAN.md) §3 P1 #11 ("Config split-brain").
**Domain:** the three coexisting config homes (`tb_settings`, `business_config`, rebuilt `settings`). Resolves the overlap on **yuan-rate** and **free-shipping** that currently lets the rebuilt forwarder lane price off a different rate than the live customer money path.

> ⚠️ This ADR is a PLAN. No SQL or code change has been run. The data points below were gathered read-only on prod `yzljakczhwrpbxflnmco` during the 2026-06-01 audit.

---

## Context

### Three config homes coexist

| Home | Rows | Key | What it holds | Who reads it |
|---|---:|---|---|---|
| **`tb_settings`** (legacy) | 1 (id=1) | singleton | **152 columns.** Yuan rates (`rsdefault`=4.97 shop · `rpdefault`=4.93 transfer · `hratecostdefault`=4.84 cost · `hratecostsale`), `freeshipping` (1 on/2 off), `numberpaymemt` (pay-on-behalf running doc no.), and the **~144-column partner-cost matrix** (`fcostcar/ship{1-4}default[2]` × 9 partner suffixes). | `actions/payment.ts::getCurrentYuanRate` (`rpdefault` · LIVE) · `actions/cart.ts` (`rsdefault` · LIVE shop pricing) · `lib/forwarder/*` (cost matrix · LIVE) · admin editors `tb-settings.ts` (`/admin/settings/legacy-rates` + `/admin/settings/forwarder-costs`) |
| **`business_config`** (Pacred-native) | 16 | key-value | WHT (1/3/5/0%) + VAT 7%, OTP (ttl 300000, 3/hr), wallet min/max, cashback %, bank list, feature flags (liff/china-demo), `forwarder.reprice_threshold_pct`. | `lib/business-config.ts` · `lib/tax/*` · `lib/forwarder/reconfirm-gate.ts` · admin `/admin/settings/business-config` |
| **`settings`** (rebuilt) | 1 (id=1) | singleton | 11 cols: `service_fee`, **`yuan_rate`**, **`free_shipping_enabled`** + `free_shipping_threshold`, `juristic_discount_threshold/_pct`, `qc_fee_per_item`, `crate_fee_base`, `domestic_costs`. | `actions/forwarder.ts` L331/L557 (the **rebuilt** forwarder lane — uses its `yuan_rate` + `service_fee`) · `/admin/settings` (`adminUpdateSettings`) · `/api/settings-rate` |

### The split-brain (the actual bug)

The same logical setting lives in **two or three places**:

| Setting | `tb_settings` | rebuilt `settings` | `business_config` | Live consumer of record |
|---|---|---|---|---|
| **Yuan rate (transfer)** | `rpdefault`=4.93 | `yuan_rate` | — | **`tb_settings.rpdefault`** (`getCurrentYuanRate`, ฝากโอน) |
| **Yuan rate (shop cart)** | `rsdefault`=4.97 | `yuan_rate` (one field for both) | — | **`tb_settings.rsdefault`** (`cart.ts`) |
| **Free shipping** | `freeshipping` (1/2) | `free_shipping_enabled` (bool) + `_threshold` | — | **`tb_settings.freeshipping`** (live forwarder/receipt path) |
| **Service fee / juristic / QC / crate** | (in the 144-col matrix + general rate cards) | `service_fee`, `juristic_discount_*`, `qc_fee_per_item`, `crate_fee_base` | — | **rebuilt `settings`** — but ONLY the rebuilt `actions/forwarder.ts` lane (`service-import/add`) reads these; the live customer forwarder pricing uses `lib/forwarder/resolve-rate.ts` + `tb_rate_*`/`tb_settings` |
| **Tax (WHT/VAT), OTP, wallet limits, flags** | — | — | `business_config` (clean key-value) | **`business_config`** (uncontested · canonical) |

**Why it's not bleeding money today (but is a trap):** the LIVE customer money paths (`getCurrentYuanRate` for ฝากโอน, `cart.ts` for shop, the `resolve-rate.ts` waterfall + `tb_settings` cost matrix for forwarder) all read `tb_settings`. The rebuilt `settings.yuan_rate` is read **only** by `actions/forwarder.ts` (the rebuilt `service-import/add` forwarder lane), which sits on near-zero real data. So the drift is latent — but:
1. An admin who edits "settings" at **`/admin/settings`** (`adminUpdateSettings` → rebuilt `settings`) **thinks they changed the live yuan rate / free-shipping** — they changed a field the live path ignores. Same class as the `/admin/rates/vip` dead-write trap (G1) and the just-fixed `/admin/settings` `yuan_rate` field (§2 of the cluster doc notes `yuan_rate` dead-write was removed this session — but `service_fee`/`free_shipping_enabled`/etc. on the same page are still rebuilt-only).
2. If the rebuilt forwarder lane (`service-import/add`) ever takes real traffic, it prices off `settings.yuan_rate` — a **different number** from `tb_settings.rpdefault` — silently under/over-charging.

`business_config` is **not** part of the split — it owns tax/OTP/flags uncontested and is the clean modern layer. The split is purely `tb_settings` ⟷ rebuilt `settings` on yuan-rate + free-shipping (+ the rebuilt-only fee fields).

---

## Decision

### D-1 — Canonical config SOT, per group

| Config group | Canonical home | Rationale |
|---|---|---|
| **Yuan rates** (`rsdefault` shop · `rpdefault` transfer · `hratecostdefault`/`hratecostsale` cost) | **`tb_settings`** | The live customer money paths already read it; it's the only home with the shop-vs-transfer-vs-cost distinction (the rebuilt `settings.yuan_rate` is a single field that can't represent shop≠transfer). |
| **Free shipping** | **`tb_settings.freeshipping`** | The live forwarder/receipt path reads it; one flag, already authoritative. |
| **Partner-cost matrix** (144 cols) | **`tb_settings`** | The only home that encodes the per-partner cost book; `lib/forwarder/*` reads it live; no twin replicates it. |
| **General / VIP / SVIP / HS rate cards** | **`tb_rate_*`** (out of this ADR's scope — the faithful rate engine per [ADR-0017](0017-pacred-faithful-pcs-port.md); the lone dead-write is cluster-05 §3 G1) | The pricing waterfall reads `tb_rate_*`; the rebuilt `rate_*` twins are dead. (Noted here only to point the reader; the rate-card editors are tracked separately as G1.) |
| **Service fee / juristic discount / QC fee / crate fee** | **decide per consumer (D-3)** — these exist ONLY on rebuilt `settings`; the live forwarder pricing does NOT use them (it uses `tb_rate_*` + the cost matrix). | They are rebuilt-lane-only fees; either migrate the concept into `tb_settings`/`business_config` or accept they belong to the (low-data) rebuilt forwarder lane and gate that lane's status (D-3). |
| **Tax (WHT/VAT), OTP, wallet limits, cashback %, banks, feature flags** | **`business_config`** | Uncontested; clean typed key-value layer; already canonical. Keep as-is. |

**Headline rule:** **`tb_settings`** is canonical for everything the **live pricing engine** reads (yuan rates, free-shipping, partner-cost matrix). **`business_config`** is canonical for everything **Pacred-native + non-pricing** (tax, OTP, wallet, flags). The **rebuilt `settings` table is NOT a canonical home for any contested field** — every field on it that overlaps `tb_settings` is a dead-write the moment the live path reads `tb_settings`.

### D-2 — Treat `/admin/settings` (rebuilt `settings` editor) as a dead-write trap to neutralize

`adminUpdateSettings` (`actions/admin/settings.ts`) writes the rebuilt `settings` table. For the **contested fields** (`yuan_rate` — already removed this session; `free_shipping_enabled`/`free_shipping_threshold`), the admin gets a green toast and the live path is unaffected → same trust bug as G1. Action:

- **Repoint the contested fields** so `/admin/settings` writes the canonical home: free-shipping → `tb_settings.freeshipping` (1/2); yuan rate is already routed to `/admin/settings/legacy-rates` → `tb_settings.rpdefault/rsdefault` (keep that as the only yuan-rate editor).
- **OR** make `/admin/settings` a read-through dashboard that links to the canonical editors (`/admin/settings/legacy-rates` for rates, `/admin/settings/forwarder-costs` for the cost matrix, `/admin/settings/business-config` for tax/OTP/flags) and **deletes the duplicate editable fields**. (Recommended — see D-4.)

### D-3 — The rebuilt-only fee fields (`service_fee`/juristic/QC/crate): two options, owner picks

These fields exist ONLY on rebuilt `settings` and are read ONLY by the rebuilt `actions/forwarder.ts` (`service-import/add`) lane:

- **D-3a (recommended) — gate/banner the rebuilt forwarder lane, leave `settings` as that lane's local config.** The live customer forwarder pricing is the faithful `resolve-rate.ts` + `tb_rate_*` + `tb_settings` cost matrix; the rebuilt `service-import/add` lane is a low-data parallel. Declare the rebuilt `settings` table the config home **for that one lane only**, banner the lane as "rebuilt — verify before relying on it", and ensure nothing on the live path reads `settings`. Then there is no split-brain on the live path; the rebuilt lane is self-contained.
- **D-3b — migrate the fee concepts into the canonical homes** (`service_fee` etc. → `business_config` key-value or new `tb_settings` columns) and repoint `actions/forwarder.ts` to read them. More work; only worth it if the rebuilt forwarder lane is going to become a real surface.

Recommendation: **D-3a** unless the owner intends the rebuilt `service-import/add` lane to take real traffic — in which case D-3b + retiring `tb_settings`'s overlap is the longer-term unify (Theme-1 "typed settings registry", cluster-05 U5).

### D-4 — Exact changes (the fix-list)

**P1 (close the trap — Wave A):**
1. `actions/admin/settings.ts::adminUpdateSettings` + `/admin/settings/page.tsx` — remove the contested editable fields (`free_shipping_enabled`/`_threshold`; yuan rate already routed away). Either repoint free-shipping to `tb_settings.freeshipping` or turn the page into a read-through hub linking the three canonical editors. (Recommend the hub — kills the duplicate edit surface, matches D-2.)
2. Confirm `/admin/settings/legacy-rates` (`adminSetTbSettingsRates` → `tb_settings.rsdefault/rpdefault/rgdefault`) is the **only** yuan-rate editor, and `/admin/settings/forwarder-costs` (`adminSetTbSettingsForwarderCosts` → the 144 cols + `freeshipping` + `numberpaymemt`) is the **only** cost-matrix + free-shipping editor. Both already exist + write `tb_settings` ✅ — this is a verify, not a build.

**P1/P2 (rebuilt forwarder lane — per D-3 decision):**
3. **If D-3a:** banner `service-import/add` (the rebuilt lane) as rebuilt/secondary; document `settings` as that lane's local config; assert no live-path file reads `settings` for a contested field. (`actions/forwarder.ts` L331/L557 keep reading `settings` — but scoped to that lane only.)
4. **If D-3b:** add the fee fields to `business_config`/`tb_settings`, repoint `actions/forwarder.ts` reads, retire the rebuilt `settings` fee columns.

**P2 (retire — follow-up, not a blocker):**
5. Once #1 lands and no contested field is editable via rebuilt `settings`, mark the rebuilt `settings` table frozen (or, if D-3a, frozen-except-the-rebuilt-lane fields). Full retire only after the rebuilt forwarder lane is decommissioned or migrated (D-3b).

**Documentation:**
6. Add a "config homes" table to `docs/architecture.md` (or `lib/business-config.ts` docblock) stating the D-1 rule canonically, so future agents don't re-introduce a fourth home. One canonical place, per AGENTS.md §12.

### D-5 — The longer-term unify (Theme-1 · not this ADR's blocker)

cluster-05 U5 proposes collapsing rebuilt `settings` into `tb_settings`+`business_config` behind **one typed config registry** (extend the clean `business_config` key-value pattern with field descriptions + validation + audit trail). That is the right end-state — but it's a Phase-C enhancement. This ADR's job is to **stop the drift now** (D-1 + D-2 + D-4 #1-2), which is a P1 trust fix; the typed-registry unify is deferred and tracked in the upgrade roadmap.

---

## Consequences

**Positive:**
- One canonical home per config group; the live pricing path and the admin editors agree.
- The `/admin/settings` dead-write trap is closed — admins can no longer "change a setting" that the live path ignores.
- `business_config` stays clean and uncontested (no change needed there).
- The rebuilt `settings` table is explicitly scoped (D-3a) or retired (D-3b) — no more ambiguous third home.

**Negative / risks (mitigated):**
- **Shop vs transfer yuan rate:** `tb_settings` distinguishes `rsdefault` (shop) from `rpdefault` (transfer); the rebuilt `settings.yuan_rate` was one field. Anyone who relied on the single field must understand there are now two canonical rates (there always were on the live path — the rebuilt single field was the anomaly). The editor (`/admin/settings/legacy-rates`) already exposes all three; no data loss.
- **Casing:** `tb_settings` columns are lowercase (`rsdefault`, `freeshipping`) — the existing editors quote them correctly; copy their column strings.
- **Range-guard parity:** `adminSetTbSettingsRates` already has the V-A4 typo range-guard ((0,20] + suspicious-factor). If free-shipping moves off `adminUpdateSettings`, ensure the guard semantics don't regress (free-shipping is a flag, no range needed).
- **Don't touch `business_config`:** the temptation is to "consolidate everything" — but `business_config` is the clean layer; folding rate/cost into it now (vs the typed-registry end-state) would be premature. Keep tax/OTP/flags there; keep rate/cost on `tb_settings`.

**Does NOT change:**
- The rate-card editors (`tb_rate_*`) — tracked separately as cluster-05 G1 (the `/admin/rates/vip` dead-write).
- `business_config` ownership of tax/OTP/wallet/flags.
- The live customer money paths (they already read `tb_settings` — this ADR ratifies that + removes the editor that wrote the dead twin).

---

## Alternatives considered

- **A — `tb_settings` (rate/cost) + `business_config` (tax/OTP/flags) canonical; neutralize rebuilt `settings` (chosen).** Matches what the live path already reads; closes the trap; minimal change.
- **B — Make rebuilt `settings` canonical + migrate the live path onto it.** Rejected: the live customer money path + the faithful editors already read `tb_settings`; rebuilt `settings` can't even represent shop≠transfer yuan rate; this would migrate the authoritative path onto the empty twin (the anti-pattern).
- **C — Fold everything (rate + cost + tax) into `business_config` now.** Rejected as premature: the typed-registry unify (D-5 / U5) is the right end-state but is a Phase-C effort; doing it now risks destabilizing the live pricing path for a refactor. Stop the drift first, unify later.
- **D — Leave the split (it's not bleeding money).** Rejected: it's a live trust trap (admins edit a setting that does nothing) and a latent mispricing if the rebuilt forwarder lane takes traffic. The audit ranks it P1.
