# ภูม R&D Notes — Master synthesis (cargo-domain QC pass over the 8-specialist deep-dive)

> **Run by ภูม via 4 parallel cargo-domain reviewers — 2026-05-19 evening.**
> Reads the 8 R&D specialty docs through the D1 / Phase-B / cargo-domain
> lens (the QC the agents can't self-do — per
> [`../briefs/poom.md`](../../briefs/poom.md)).  Pairs with — does NOT
> replace — เดฟ's executive [`_synthesis.md`](_synthesis.md) (the "what to
> ship" plan).  This doc adds the **cargo-fidelity perspective**: what's
> safe under D1, what risks "zero retraining", what's already covered by a
> B-stage, what to flag back to senior lane.
>
> **Source notes:**
> - [`_poom-notes-A-cargo-ops.md`](_poom-notes-A-cargo-ops.md) — 01 mobile-scanning + 04 admin-employee
> - [`_poom-notes-B-customer-facing.md`](_poom-notes-B-customer-facing.md) — 03 customer-portal + 02 marketing-ads
> - [`_poom-notes-C-infra.md`](_poom-notes-C-infra.md) — 06 backend-arch + 05 devops
> - [`_poom-notes-D-revenue-tracking.md`](_poom-notes-D-revenue-tracking.md) — 07 billing-payments + 08 tracking-logistics

---

## 0. TL;DR (what to act on this week)

1. **Most R&D = Phase C, not Phase B.** Independent finding across all 4
   reviewers — the R&D pack proposes net-new features (R-3 PWA, AP-2
   mobile shell, G1 unified-track, DN-1 dunning) when ภูม's Phase-B job is
   *faithful reproduction* of the legacy PCS workflow. Shipping these
   ahead of the faithful port would violate the owner's "copy 100%
   sameness FIRST" rule.
2. **But several R&D items SHOULD ride Wave 2 (the B-0 + B-2 + ghost-fix
   bundle) — they're invisible enablers** (§3).  Get them in now or they
   miss the window.
3. **3 🔴 critical cargo-domain misreads** the R&D specialists made — all
   collapse the cargo COD payment model into a generic "invoice → pay →
   ship" mental model.  Will cause real customer harm if shipped without
   correction (§4).
4. **Several R&D proposals collapse INTO existing B-stages** — same work,
   different label.  Fold the spec into the B-stage; don't create a
   parallel feature (§5).
5. **15+ open senior-lane questions** surfaced across the 4 reviews
   (consolidated in §7).

---

## 1. Cross-cutting patterns the 4 reviewers all saw

### 1.1 The "rebuilt-only schema" blind-spot (in 4 of 8 R&D docs)
Multiple R&D proposals operate on rebuilt-era tables (`profiles` ·
`service_orders` · `forwarders` · `wallet*` · `container_costs`) without
acknowledging that **Phase A loaded the legacy `tb_*` truth and 8,892 of
8,898 customers live there, not in rebuilt-era**.

Concrete cases (one per reviewer):
- **A:** AP-7.5 proposes a new `system_config` table when `tb_setting` is
  already ported.
- **B:** G-M-10 CRM schema keys on `profiles.id` instead of
  `tb_users.userID` text PK → migrated leads via LINE webhook fail to attach.
- **C:** §3.3's admin-client ESLint rule would fire false positives on
  legitimate Phase-B `tb_*` admin reads (per coexistence rule).
- **D:** BC-1a operates on rebuilt `container_costs` (0069); B-6 already
  uses legacy `tb_cnt` (0081). BC-1 must extend `tb_cnt_*`, not the
  rebuilt table.

**Lesson for the next R&D wave:** the spec must call out which table
family it operates on, per the §7.1 reference card in
[`../wave-1-fidelity/_SYNTHESIS.md`](../wave-1-fidelity/_SYNTHESIS.md).
This is the single biggest pattern.

### 1.2 The "good idea, wrong phase" pattern
Several R&D items are GOOD long-term but ship them in Phase B and you
break the zero-retraining promise (the owner's hard rule).
- R-4 mobile-card table (Doc 01) — staff trained on Bootstrap-4 DataTables.
- DN-1 dunning (Doc 07) — would dun customers PCS never duns (the COD-flow
  cargo-arrival case).
- G1 unified-track redesign (Doc 03) — replaces the 9-icon launchpad
  mental model.

→ **All should defer to Phase C — but the R&D pack reads as if they're
shippable now.**  Phase-B reviewer (ภูม) is the only sanity check.

### 1.3 The "Phase-B-blocking item hidden in a Phase-C wishlist"
Spots where ภูม + reviewers extracted an item the R&D pack listed as
Phase-C polish but is actually Phase-B-blocking:

| R&D doc | Item | Why Phase-B-blocking |
|---|---|---|
| 01 (A) | R-1 zxing browser polyfill | Without it, iOS Safari staff get a broken scanner in B-7 — *less* faithful than legacy |
| 01 (A) | R-2 Button 44px restore | Legacy used `.btn-lg`; current Pacred buttons under 44px = a fidelity regression |
| 03 (B) | G2 LINE-push env-flip | The B-auth login works but no LINE notify out = customers see less than legacy |
| 06 (C) | §3.2 Supabase codegen | Dual-schema `tb_*` ↔ rebuilt window needs typed `Database` to keep type-safety |
| 05 (C) | §3.A Sentry env-flip | Phase-B rework on a dark observability baseline = blind to regressions |
| 06 (C) | §3.7 SMS failover | Legacy ran 4 SMS providers; current = 1 = a fidelity gap |
| 07 (D) | F-11 yuan_payment idempotency + XC-5 bulk_action_runs | Money double-debit risk if bulk paths ship without |

**These 7 should be folded into Wave 2 (or a tight follow-up wave),
not left in Phase C.**

### 1.4 The "env-var flip" mega-finding (confirmed)
Echoes เดฟ's `_synthesis.md` §1.1 — but ภูม's lens adds: **flipping these
is mostly ก๊อต's senior-lane move** (PROMPTPAY_ID · RESEND_* · SENTRY_* ·
UPSTASH_* · HCAPTCHA_* · GTM · CLARITY · LINE_PUSH_BYPASS).  Already
flagged in [`../poom-d1-open-questions.md`](../poom-d1-open-questions.md)
— this corroborates.

---

## 2. R&D items that should RIDE Wave 2 (concrete list)

The audit-confirmed Wave-2 bundle is `0088_pcs_profiles_backfill` + bridge
extension + §7 swap diffs.  Add these to the same wave (they're
small + Phase-B-blocking per §1.3):

| # | From | Item | Effort | Why now |
|---|---|---|---|---|
| W2-a | 01 R-1 | `@zxing/browser` polyfill on `/admin/barcode` | ~2h | B-7 staff workflow on iPad/iOS otherwise broken |
| W2-b | 01 R-2 | `<Button>` 44px tap-target restore | ~1h | Fidelity regression; legacy was `.btn-lg` |
| W2-c | 01 R-5 | `capture="environment"` on slip uploads | ~30 min | Mobile-first; trivial |
| W2-d | 03 G11 | Copy-to-clipboard on warehouse-CN address | ~1h | **highest-leverage 1-hour win in the whole R&D pack** — kills W-1 "what address do I give Taobao?" pain |
| W2-e | 03 G2 | Flip `LINE_PUSH_BYPASS=false` + `RESEND_API_KEY` | 10 min env-flip + 0 code | Customers see less than legacy until flipped |
| W2-f | 03 G8/G9 | Wallet H-1/H-2 polish (small UX wins) | ~2h | Phase-B-safe layout-only tweaks |
| W2-g | 07 F-11 + XC-5 | `yuan_payment` partial-unique + `bulk_action_runs` | ~3h | MUST land BEFORE any bulk action ships (double-debit guard) |

**Total Wave-2 add-ons: ~10 hours.**  All safe under D1, all unblock or
prevent regressions.

---

## 3. R&D items that COLLAPSE INTO existing B-stages (don't double-build)

Several R&D proposals are the SAME work as a B-stage just labelled
differently.  Fold the spec into the B-stage; do NOT create a parallel
feature:

| R&D proposal | Maps to | Action |
|---|---|---|
| 04 AP-1.1 RBAC enum extension | ภูม's draft `0088_admin_role_triple.sql` (B-4) | One migration, not two |
| 04 AP-1.5 per-role sidebars | Already shipped as B-4 by Wave 1 | Wave 1 satisfies AP-1.5 |
| 04 AP-7.7 `/admin/qa` 11-card UI | Pre-spec'd as B-9 QA queue | Use AP-7.7 wireframe AS the B-9 spec |
| 07 BG-1a bulk tax invoice | Pre-spec'd as B-8 รวมบิล consolidation | Same surface; fold |
| 07 BC-1a bulk container cost | B-6 + B-8 (cost-side of `tb_cnt` ledger) | Re-target to `tb_cnt_*` not `container_costs` |
| 08 W-4 MOMO sync hardening | Phase-C (already deferred per ADR-0017) but the IDEA = T-6 reconciliation | Defer W-4 to Phase C as planned |

---

## 4. 🔴 Cargo-domain misreads (the unique value ภูม adds)

The R&D specialists are good but **none operate the cargo flow daily**.
These 3 misreads will cause real customer harm if shipped uncorrected:

### 4.1 G1 customer-portal "payment status" card (Doc 03)
**Misread:** `paid / pending / overdue` ternary.
**Reality:** Cargo COD model = customer pays AFTER weight known at Thai
warehouse (legacy `fstatus=5 รอชำระเงิน` at slot 5, AFTER ship + arrive).
A customer at `fstatus=2` (สินค้าถึงโกดังจีน) seeing "pending" reads as
"I'm late on a bill" = wrong mental model + erodes trust.
**Fix:** If G1 ships at all, the payment card MUST query
`tb_forwarder.fstatus` and label `<5` as "ยังไม่ถึงรอบชำระ" (not "pending").

### 4.2 DN-1 dunning engine (Doc 07)
**Misread:** Trigger on "invoice issued > 24h ago and unpaid".
**Reality:** Same as 4.1 — `fstatus=5` is *intentionally* unpaid until
weight known.  Auto-dunning fires while cargo is still in transit.  Legacy
PCS NEVER dunned cargo customers automatically.
**Fix:** DN-1 needs a `tb_forwarder.fstatus >= 5 AND fdatestatus5 >
<grace>` filter, OR ลูกพี่/accountant explicit policy decision before
shipping.

### 4.3 R&D's "billing automation" assumes pay-first model
Pattern across Doc 07: BG-1 + BC-1 + DN-1 all assume "service done →
invoice → pay → ship".  Cargo is the inverse.  **Every billing
automation must be Phase-B/C-gated behind a fidelity check that respects
the ship→arrive→THEN-pay legacy order** (B-5).

---

## 5. R&D items that R&D missed but cargo needs (gap-in-the-gap)

The 4 reviewers found things the R&D pack DIDN'T cover but cargo needs:
- **D/O letter receipt-gate for sea containers** (Agent D) — Thai consignee
  → carrier B/L release flow, no proposal covers it
- **The 2-price model** (offered vs target) the rep negotiates against —
  R&D imagines fixed prices
- **Member-segmentation pricing** (VIP / SVIP / นิติบุคคล / เครดิต tiers
  on `tb_users.userType`) — R&D pricing proposals all uniform
- **Form E (ASEAN-China FTA CO)** — discount path for HS-code-eligible
  cargo, R&D doesn't mention
- **VAT plan ("แผน VAT 1/2/...")** per ADR-0016 — R&D billing proposals
  ignore the legitimate-path-only stance the UPGRADE_PLAN mandates

**Implication:** The next R&D wave needs a cargo-domain reviewer on
intake, not just on synthesis.

---

## 6. Phase-C-1 priority recommendations (ภูม cargo-revenue lens)

Each reviewer picked top-leverage Phase-C-1 items.  Consolidated:

| # | Item | From | Why cargo-revenue impact |
|---|---|---|---|
| C1-1 | **B-8 `รวมบิล` consolidation + BG-1a multi-select tax invoice** | A + D | Direct DSO win · faithful-port-safe (just adds checkbox + bulk action) |
| C1-2 | **T-6 MOMO sync (W-4) + L-3 reconciliation** | D | Backend pre-condition that makes the `tb_cnt` ledger + freshness pill trustworthy |
| C1-3 | **AP-5 unified disbursement + WHT cert UI** | A | Owner's "always has problems" + most-repeated cargo complaint (per audits) |
| C1-4 | **R-7 print-own labels** (kill the supplier-CN-barcode dependency) | A | Faster intake → faster billing → faster cashflow |
| C1-5 | **CI-1 LINE webhook + `/admin/leads`** | B | Every cargo prospect becomes visible + SLA-timed + attributable (revenue acquisition) |
| C1-6 | **G2 LINE-push to customers** (post env-flip) | B | ~4hrs/day sales-rep time recovered (no more manual relay) |
| C1-7 | **Codegen + Drizzle on `tb_*`** | C | Backend type-safety during the long Phase-B coexistence |
| C1-8 | **Vercel Preview env + Supabase Branching** | C | Rehearse risky `tb_*` migrations before prod |

**Sequence suggestion:** C1-1 + C1-3 + C1-6 first (revenue-direct), then
C1-2 + C1-4 + C1-5 (revenue-enabling), then C1-7 + C1-8 (developer
velocity).

---

## 7. Open questions for senior lane (consolidated)

15+ items surfaced.  Tagged by who decides:

### For เดฟ (~Phase-A/B coordinator)
1. Supabase codegen / `Database` type pipeline — set up before Wave 2 or after? (C)
2. Inngest sign-up + cron migration — timing? (C + D)
3. Should `0088_pcs_profiles_backfill` SQL also pre-bind sales rep
   (`adminidsale → admin_id`)? (A + D)
4. The B-7 `/admin/barcode` zxing polyfill — fold into Wave 2 or
   separate? (A)
5. Should the admin-client ESLint rule (06 §3.3) defer until Phase B
   done? (C)

### For ก๊อต (~senior advisor)
6. Sentry tier (Free vs Business — backfilled retention?) (C)
7. PITR retention (the Pro upgrade) (C)
8. Q2 auth-bridge posture ratification (still pending — flagged
   pre-this-audit) (A + B + C + D — everyone needs)
9. The 8 special userIDs `PCSTT` etc — confirm Q3's rewrite-letters /
   keep-no-prefix policy is reflected in Phase-A converter (D)
10. Storage lifecycle policy on `member-docs/` before image-fetch ship (C)

### For ลูกพี่ / accountant
11. DN-1 dunning policy on cargo COD orders — auto-dun or never? (D)
12. Partial payments support on `tb_payment` (yuan transfer)? (D)
13. Credit-limit policy change (any Phase-C change planned)? (D)
14. Member-segmentation pricing — keep VIP/SVIP tiers as-is or change? (D)

### For sales-ops
15. The 2-price model — do we standardize the `offered_price`/`target_price`
    schema or keep informal? (D)

---

## 8. What this means for ภูม's near-term work

**Tonight / pre-Wave-2:** Nothing more to ship — the R&D notes are the
deliverable.  Wave 2 starts when เดฟ kicks it off (with the 3-step bundle
per [`../wave-1-fidelity/_SYNTHESIS.md`](../wave-1-fidelity/_SYNTHESIS.md)
§8.5 + the 7 ride-along items in §2 above).

**During Wave 2:** Fidelity-review each agent-landed slice (the same QC
pattern as Wave 1 — see
[`../wave-1-fidelity/`](../wave-1-fidelity/)).

**Post-Wave 2:** Spec the next 2-3 B-stages (B-5 forwarder status order ·
B-6 stickies · B-7 barcode family) with the §2 ride-along items folded
in.

**LINE-ping recipient roles** with the relevant questions in §7.

---

## 9. Cross-references

- 🧭 D1 ADR → [`../../decisions/0017-pacred-faithful-pcs-port.md`](../../decisions/0017-pacred-faithful-pcs-port.md)
- 📋 เดฟ's R&D synthesis (the "what to ship" plan — pairs with this doc) → [`_synthesis.md`](_synthesis.md)
- 🗺 Wave-1 fidelity synthesis (the audit this builds on) → [`../wave-1-fidelity/_SYNTHESIS.md`](../wave-1-fidelity/_SYNTHESIS.md)
- 🛠 Phase-B prep + B-stage plan → [`../poom-phase-b-prep.md`](../poom-phase-b-prep.md)
- ❓ Open questions to senior lane → [`../poom-d1-open-questions.md`](../poom-d1-open-questions.md)
- 👷 ภูม brief → [`../../briefs/poom.md`](../../briefs/poom.md)
- 📂 Per-bucket notes → `_poom-notes-A-cargo-ops.md` · `_poom-notes-B-customer-facing.md` · `_poom-notes-C-infra.md` · `_poom-notes-D-revenue-tracking.md`
