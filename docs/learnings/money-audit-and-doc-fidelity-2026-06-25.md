# Learnings — money-audit blast-radius · perception bugs · doc signatory (2026-06-25 · เดฟ)

Append-only. Compounding lessons from the 2026-06-25 money/doc session (read before re-debugging).

## L1 — A money-audit's "blast radius" must be verified against LIVE prod data, not assumed
The 2026-06-24 audit claimed "WHT 1% double-deducted on **12** juristic ใบวางบิล · ฿21,159". A prod probe found the **real count = 0 currently double-deducted**.
- **Why the over-count:** the 1% allowance in `calcForwarderOutstanding` keys off the **per-ROW** `tb_forwarder.fusercompany`, NOT the **per-BUYER** invoice `is_juristic`. These usually DIFFER (the row flag is mostly unset). Double-deduction needs BOTH flagged. The audit assumed every juristic-invoice line was net → over-counted ~12×.
- **Lesson:** before acting on a money-audit's count, probe prod for the EXACT affected rows + the EXACT condition. A per-row vs per-buyer (or per-line vs per-header) flag mismatch can shrink the real impact to a fraction. The fix can still be correct + worth shipping (it was — `calcForwarderGross` makes the bill store gross so `computeBillWht` deducts once for the flagged/mixed cases) while the *remediation* (backfill 12 rows) turns out unnecessary. See `docs/research/juristic-credit-taxdoc-readiness-2026-06-24.md` §Audit.

## L2 — "Clicking X advanced status Y" can be coincidental timing of two INDEPENDENT feeds (perception bug, not coupling bug)
Owner: "บัญชีกดจ่ายต้นทุน MOMO → รายการเด้งไป stage 2 ถึงโกดังจีน". A 3-agent source trace proved the cost-pay (`applyMomoInvoiceCost`) writes ONLY `fcosttotalprice` — it NEVER touches `fstatus`. The "→2" came from the MOMO sync cron (`propagate.ts`, default-ON every ~5 min) firing on the same cabinets around the same time. **Two independent triggers, not one click causing both.**
- **Lesson:** when a user reports "A caused B", verify from source whether A's code path actually writes B. If not, it's misattributed causation — fix the **perception** (a banner: "หน้านี้บันทึกแค่ต้นทุน · สถานะมาจาก MOMO อัตโนมัติ คนละส่วน") + correct any stale JSDoc that misleads. Do NOT add a coupling that doesn't exist. Status (`fstatus` 1-4) genuinely comes from MOMO — exactly as the owner expected.
- Full map: `docs/research/forwarder-status-cost-domestic-clarity-2026-06-25.md` (the 3 axes: สถานะ / ค่าไทยจีน cost-vs-sell / ขนส่งในไทย).

## L3 — Customer-facing documents show the fixed authorized SIGNATORY, not the issuing-admin id
Receipt/bill rendered the issuer text as the admin's raw uuid ("Admin 3f68c143-… (manual)") because `forwarder-invoice.ts` stored `safeLegacyAdminId(adminId, 30)` (the clipped uuid). The signature image is HARDCODED to one person (`sin-wandee.jpg`). Owner chose: the NAME must match the signature = the authorized signatory, NOT whoever keyed it in.
- **Fix pattern:** a single `DOC_SIGNATORY = { name, signature }` constant in `components/seo/site.ts` (company-info SOT · §7), used by every customer doc paper (`receipt-paper`, `billing-run-paper`). Change name+signature together if the signatory changes.
- **Bonus trick:** `safeLegacyAdminId(id, 30)` clips a 36-char uuid to its first 30 chars = a PREFIX → `profiles.id LIKE '<clipped>%'` still recovers the full profile (used to resolve the issuer back to a name for the older rows).

## L4 — A rebrand of a STORED code + logic value = display-only; never touch the data/logic
Owner: "เหมาๆ เป็น PRF PRE แล้ว ทำไมยังเป็น PCS". `PCSF`/`PCSE` are stored `tb_forwarder.fshipby` values + pricing logic (`computeTransportPrice` checks `=== 'PCSF'`) across ~40 files. **Rebranded only the DISPLAY labels** (`nameShipBy` SOT · `SHIP_BY_LABEL` · doc papers · the carrier form) → "PRF เหมาๆ" / "PRE Express"; kept the stored code + every `value="PCSF"` + logic check unchanged. Same discipline as the coID PCS→PR migration (a value-rename that touches stored data is a migration + a full sweep — a label-rename is not). ⚠️ a rebrand that changes `nameShipBy` will break its unit test (`shipping-methods.test.ts` asserts the old nameTh) — update the test in the same change.

## L5 — Integration discipline that held this session
Merged ภูม(5)+ปอน(1)+session → 1 trunk → pushed all branches. Only 1 real conflict (`drivers/[id]/page.tsx` SHIP_BY_LABEL — me PRF vs ภูม branding → kept the newer owner directive, PRF). The full `verify`+`build` gate caught 2 things a per-file check missed: my PRF rebrand breaking the shipping-methods test, and a broken md-link in my own research doc (`(admin)` parens break the markdown link parser — use a code-span, not a link, for paths containing `(`). A teammate branch's migration (ปอน 0212) must be applied to prod+dev BEFORE pushing main (migration-prod-gate). Pushed only after both gates green.
