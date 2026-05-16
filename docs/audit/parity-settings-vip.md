# Parity audit — `settings-vip.php` → Pacred `/admin/rates/vip` + `/admin/settings`

> **V-G7 audit verification** — compare PHP `settings-vip.php` feature surface vs Pacred LP-1b shipment + global settings page.
> **Date:** 2026-05-16 night-5 (ภูม via Claude)
> **Source PHP:** `C:\xampp\htdocs\pcscargo\member\pcs-admin\include\pages\settings-vip.php` + DB tables `tb_settings_vip`, `tb_rate_vip_*`.
> **Pacred surfaces:**
> - `/admin/rates/vip` — VIP rate CRUD (LP-1b commit `fabcf06`)
> - `/admin/settings` — global service_fee / juristic_discount / qc_fee / crate_fee / free_shipping / yuan_rate
> - `actions/admin/rates.ts::adminUpsertVipRate / adminDeleteVipRate`
> **Verdict:** 🟡 **partial** — Pacred covers VIP rate table fully (LP-1b); PHP per-tier "VIP settings" (juristic_discount, qc fee, crate fee VIP-tier multipliers) collapsed into global `settings` table — not yet per-customer-group VIP overrides.

---

## Side-by-side feature checklist

| PHP capability | Pacred surface | Status |
|---|---|---|
| `tb_rate_vip_*` per-route flat rate | `rate_vip` (mig 0009) + `/admin/rates/vip` CRUD | 🟢 covered |
| Composite key `(customer_group, source_warehouse, transport_type, product_type, basis)` | Same | 🟢 covered |
| Upsert (re-keying same combo = update) | `adminUpsertVipRate` with `.upsert({onConflict: ...})` | 🟢 covered |
| Customer-group tabs (PR / SVIP / VIP) | URL `?group=PR/SVIP/VIP` filter chips | 🟢 covered |
| Per-group **service_fee** override (PHP: VIP customer pays lower handling) | ❌ Pacred global `settings.service_fee` only | 🔴 gap |
| Per-group **juristic_discount_pct** override | ❌ Pacred global `settings.juristic_discount_pct` only | 🔴 gap |
| Per-group **qc_fee** override | ❌ global only | 🔴 gap |
| Per-group **crate_fee** override | ❌ global only | 🔴 gap |
| Per-group **free_shipping_threshold** override | ❌ global only | 🔴 gap |
| Waterfall `custom_hs → custom_user → vip → general` includes VIP-specific config | calc-price.ts uses VIP rate table but reads ALL fees from global settings | 🟡 partial |
| RBAC: super + accounting | `withAdmin(['super','accounting'])` per ADR-0005 K-7 | 🟢 covered |
| Audit trail per change | `admin_audit_log`: `rate_vip.insert/update/delete` with key + before/after | 🟢 covered (+ improved: query via /admin/audit) |
| VIP rate effective dates | ❌ NOT in schema (same gap as custom-hs audit F-G1) | 🔴 gap (low priority) |

---

## Gap list

### 🔴 Gap 1 — Per-group VIP-tier config overrides
**PHP behavior:** `settings-vip.php` lets admin set per-VIP-tier values for: service_fee, juristic_discount_pct, qc_fee, crate_fee, free_shipping_threshold. E.g., "SVIP customers pay 30 baht service fee instead of 50".

**Pacred current:** Global `settings` table singleton (id=1). Per-group VIP overrides not modeled. All VIP customers pay the same service_fee / juristic_discount / qc_fee.

**Impact:** Medium for V2 launch. Pacred today has only 3 customer_groups (PR / SVIP / VIP) — staff might want VIP/SVIP service-fee discount. WORKAROUND: use the rate_vip table for transport-rate-only VIP discount; absorb other fees uniformly.

**Recommendation:**
- **V2 launch:** ship without per-group overrides. Acceptable; chat audit didn't flag this as a customer pain point.
- **V2.1:** Add migration `0052_settings_vip_overrides.sql` — new table `settings_vip` keyed on `customer_group` with nullable column-per-fee override (fall through to global if null). Extend calc-price.ts to read settings_vip first, then global. ~3-4h.

### 🔴 Gap 2 — VIP rate effective dates
Same as `parity-hs-customrate.md` F-G1 gap. Defer to V2.1.

---

## Recommendation

🟡 **Partial coverage — ship LP-1b for V2 launch + queue gap-fix to V2.1.**

Pacred covers VIP rate-per-route fully via LP-1b. Per-group fee overrides (service/juristic/qc/crate/free_shipping) deferred to V2.1 in a single dedicated migration + UI extension. No customer-facing impact at launch.

**Cross-links:**
- LP-1b commit `fabcf06` — initial ship
- `lib/forwarder/calc-price.ts` — rate waterfall + global settings reads
- ADR-0005 K-7 — RBAC for rate edits
- Similar pattern: `parity-hs-customrate.md` F-G1 (effective_dates gap)

---

**End of audit.** No action required pre-launch. V2.1 followup item logged.
