# Learnings — legacy PHP port patterns

Topics: porting `D:\xampp\htdocs\pcscargo\` → Pacred Next.js. Schema mappings · auth pattern · validation · RBAC · PDF · helpers.

> Seed file. Skill that writes here: [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md).
>
> Expected first entries (post-emergency sprint): `function.php` helper port catalogue · ratesheet engine port · mPDF→react-pdf migration patterns · auto-cancel cron pattern.

---

## 2026-05-16 — V-A7 receipt-number "-N suffix" is N/A in Pacred (ภูม)

**What:** PORT_PLAN Part V row V-A7 ("Receipt-number cleanup — one canonical number, drop the error-prone `-N` suffix") describes a legacy PCS Cargo PHP problem where receipts could spawn `R-12345-1`, `R-12345-2`, etc. variants for re-issues — error-prone because staff and customers kept different numbers in their records.

**Status in Pacred:** **Already designed out from day 1, no port work needed.**
- Forwarder receipts use the raw `f_no` (one-to-one with the forwarder row)
- Service-order receipts use the raw `h_no` (one-to-one with the service_order row)
- Tax invoices use atomic `INV-YYYYMM-NNNN` from `next_tax_invoice_serial()` (migration `0034`); re-issues = cancel + new serial (per ADR-0006 §7 RD Code 86 immutability)
- No `receipt_no` / `receipt_seq` column anywhere; no codepath that appends `-N`

**Why this matters:** Future agents auditing Part V might be tempted to "fix" something that isn't broken. The clean design is intentional and well-suited to Pacred's e-receipt model.

**Verification path:** `grep -rE "receipt_no|receipt_number|receipt_seq" pacred-web/` returns zero application-code hits (matches in docs only). `next_tax_invoice_serial()` is canonical + idempotent.

**If you ever see a `-N`-style suffix appear:** it's a regression. Hunt the codepath, don't add the suffix to schema.
