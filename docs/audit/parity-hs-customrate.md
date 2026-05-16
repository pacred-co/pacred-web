# Parity audit — `hs-customrate.php` → Pacred `/admin/rates/custom-hs`

> **V-G7 audit verification** — compare PHP `hs-customrate.php` feature surface vs Pacred LP-1c2 shipment.
> **Date:** 2026-05-16 night-5 (ภูม via Claude)
> **Source PHP:** `C:\xampp\htdocs\pcscargo\member\pcs-admin\include\pages\hs-customrate.php` + companion DB tables `tb_rate_custom_hs` + `tb_co`.
> **Pacred surface:** `app/[locale]/(admin)/admin/rates/custom-hs/page.tsx` + `actions/admin/rates.ts::adminUpsertCustomHsRate / adminDeleteCustomHsRate` + sidebar entry "แก้เรท Custom-HS (LP-1)".
> **Verdict:** 🟢 **covered** — Pacred LP-1c2 matches PHP capability + adds improvements (audit log, member_code resolver, filter by customer + HS).

---

## Side-by-side feature checklist

| PHP capability | Pacred surface | Status |
|---|---|---|
| Per-customer + per-HS-code flat rate override | `rate_custom_hs` table + admin upsert/delete actions | 🟢 covered |
| Composite key `(profile_id, hs_code, source_warehouse, transport_type, product_type, basis)` | Same composite key in Pacred (no UNIQUE constraint — SELECT-then-write per handoff D-1) | 🟡 partial (works via option-b; cleaner with UNIQUE) |
| `rate_before` (legacy two-tier "before-threshold" rate) | `rate_before numeric(10,2) nullable` retained | 🟢 covered |
| `rate` (after-threshold rate, required) | `rate numeric(10,2) not null` | 🟢 covered |
| Admin list view per-customer | `/admin/rates/custom-hs?member=PR####` filter chip | 🟢 covered (+ improved: also by `?hs=` filter) |
| Add new rate form | `NewCustomHsRateRow` collapsible CTA → form | 🟢 covered |
| Edit existing rate (inline) | `CustomHsRateRow` inline edit `rate` + `rate_before` + dirty-only save | 🟢 covered |
| Delete rate | confirm prompt → soft-delete-not, just `delete` | 🟢 covered (with full-row audit before delete) |
| Audit trail (who changed what) | `admin_audit_log` rows: `rate_custom_hs.insert / update / delete` with key + member_code + before/after captured | 🟢 covered (+ improved: granular per row, queryable via `/admin/audit`) |
| Customer-ref by `userID` (legacy PCS####) | Customer-ref resolves member_code (PR####) OR profile_id (UUID) via `resolveCustomerToProfileId` helper | 🟢 covered (+ improved: more flexible) |
| HS code text input | Free-form `hs_code text` (no enum) | 🟢 covered (matches PHP — both accept free-form) |
| Effective dates (effective_from / effective_to) | ❌ NOT in schema | 🔴 gap (low priority) |
| RBAC gate (admin only) | `withAdmin(['super', 'accounting'])` per ADR-0005 K-7 | 🟢 covered (+ improved: RLS read-own for customer) |

---

## Gap list (with effort)

### 🔴 Gap 1 — Effective date range
**PHP behavior:** `tb_rate_custom_hs.dateStart / dateEnd` columns exist (per schema dump grep). Used for time-bound discounts ("rate VIP คนนี้ ตั้งแต่ Q3 2025 ถึง Q3 2026").

**Pacred current:** No effective-date columns. All custom-HS rates apply indefinitely until staff manually deletes.

**Impact:** Low for V2 — Pacred today has zero time-bound custom-HS deals (per chat audit). Becomes relevant when Pacred runs promotional VIP campaigns.

**Recommendation:** **defer to V2.1**. Add migration `0052_rate_custom_hs_effective_dates.sql` + `effective_from date null`, `effective_to date null` + extend calc-price.ts to skip out-of-window rows. ~2h.

### 🟡 Partial — UNIQUE constraint (per handoff D-1)
Current: SELECT-then-write. Race condition only matters for 2 admins editing same row simultaneously (not a Pacred-scale concern).

**Recommendation:** เดฟ optional refactor — `0044+_rate_custom_hs_unique.sql` + simplify `adminUpsertCustomHsRate` to use `.upsert({onConflict: ...})`. ~10 min.

---

## Recommendation

✅ **Ship LP-1c2 as-is for V2 launch.** PHP feature parity met for the use case Pacred operates today. Effective-date range deferred to V2.1 — not a launch blocker.

**Cross-links:**
- LP-1c2 commit `0d35f1f` — initial ship
- handoff D-1 — UNIQUE constraint decision
- `lib/forwarder/calc-price.ts` — waterfall consumer: `rate_custom_hs → rate_custom_user → rate_vip → rate_general`

---

**End of audit.** No action required pre-launch.
