---
name: legacy-php-sweep
description: Use this skill whenever the user wants to port a feature from the old PHP cargo system to Pacred Next.js — "port the customs clearance flow", "find how PHP did Y", "ดึงฟังก์ชั่นเก่ามา", "เอาของเก่ามาแปลง", "sweep the legacy PHP for X", "implement <feature> based on the PHP original". Sweeps `D:\xampp\htdocs\pcscargo\` (the canonical legacy source path on เดฟ's machine) for the relevant PHP files, extracts the business logic + DB tables + helper functions, then writes the equivalent Next.js + Supabase implementation in the right Pacred location. Critical because Pacred ecosystem services 2-4 (cargo) port directly from this PHP source — getting the port accurate is the revenue path during emergency sprint.
---

# Legacy PHP Sweep — port from `D:\xampp\htdocs\pcscargo`

> **Why this exists.** Pacred's emergency P0 is **cargo system live → revenue**. The cargo system exists, fully working, in PHP at `D:\xampp\htdocs\pcscargo\`. Every cargo feature already has a battle-tested PHP implementation that handled real customers for years. Don't reinvent — port. The user (เดฟ) said *"เน้นจริงๆ D:\xampp\htdocs\pcscargo"* + *"ไปกวาดฟังชั่นทั้งหมด และเรียนรู้การทำงานทั้งหมด ของเก่าเรามาด้วย เอาให้ไม่เหลือซากอะไรต้องกลับไปมอง"*.

## ⚠️ Path discipline

**Canonical legacy source:** `D:\xampp\htdocs\pcscargo\`
**Member-facing PHP:** `D:\xampp\htdocs\pcscargo\member\`
**Admin PHP:** `D:\xampp\htdocs\pcscargo\member\pcs-admin\`
**Helper catalogue:** `D:\xampp\htdocs\pcscargo\member\include\function.php` (2451 LOC business helpers)
**Auth + dashboard precompute:** `D:\xampp\htdocs\pcscargo\member\include\header.php`
**DB schema dump (read-only ref):** `C:\Users\Admin\Desktop\SQLWPPCS\somedata-2026-03-19-1348-pcsc_main.sql` (1.38M LOC — never `Read` whole, use `Grep`)

The PHP source is **read-only reference**. We DO NOT modify it. We extract logic + write fresh Next.js code.

## When to invoke

- ✅ "Port the rate engine to Next.js"
- ✅ "How does PHP decide refund eligibility?"
- ✅ "Replicate the auto-cancel cron"
- ✅ "I need the receipt PDF template (mPDF original)"
- ✅ "Find every place PHP touches `tb_wallet`"
- ❌ Building a feature that has no PHP analog (Phase I new services) — no legacy to sweep
- ❌ Implementing a fresh ADR — that's design, not port

## The pattern

```
1. LOCATE — find PHP file(s) implementing the target feature
   Use the helper catalogue + file tree:
   · grep -r "<feature keyword>" D:\xampp\htdocs\pcscargo\member\
   · Cross-reference docs/sprints/archive-a-to-n.md (Phase D/E/F)
     for the feature-to-PHP-file mapping the legacy audit produced

2. READ — extract business logic
   For each relevant PHP file:
   · Identify the entry point (mostly a $_POST/$_GET handler)
   · Trace through to DB operations (mysqli_query lines)
   · List the input validation (often inline string functions)
   · List the side effects (mail, SMS, file upload, redirect)
   · Note any helper functions called (look them up in function.php)

3. CATALOGUE — write a port-spec doc before coding
   Save to docs/audit/php-pcscargo-integrations.md OR a feature-specific
   doc under docs/port-specs/<feature>.md. Include:
   · Inputs (form fields / URL params)
   · Validation rules
   · DB operations (tables, columns, conditions)
   · Side effects
   · Output (HTML response / redirect / file download)
   · Business edge cases discovered

4. MAP — design Pacred Next.js equivalent
   · DB: schema migration (snake_case + RLS + FK + Pacred conventions)
   · Validation: Zod schema in lib/validators/
   · Logic: pure function in lib/<domain>/ (separate from server action)
   · Server Action in actions/<domain>.ts wrapping the logic
   · UI: page + form in app/[locale]/(...)/<route>/page.tsx
   · Tests: write to test-coverage-writer skill targets

5. PRESERVE BEHAVIOR + IMPROVE SAFETY
   · Match every input rule + edge case (port has to handle the same orders)
   · BUT: replace string-concat SQL with Supabase typed client
   · Replace raw $_POST with Zod parse + type-safe action
   · Replace inline RBAC checks with requireAdmin([roles])
   · Replace mPDF with @react-pdf/renderer
   · Replace mysqli with Supabase RLS

6. CAPTURE port decisions to learnings
   docs/learnings/php-port-patterns.md — patterns that work, gotchas.
   Especially: legacy table column name → Pacred camelCase mapping,
   string-handling differences, charset/encoding (legacy used latin1+utf8mb4 mix).
```

## Pacred-specific helper catalogue (priority ports from `include/function.php`)

These are referenced by many features; port them early once + reuse:

| PHP helper | Purpose | Pacred Next.js home |
|---|---|---|
| `nameShipBy($int)` | "1" → "AKU", "2" → "AKU FAST" etc. | `lib/forwarder/ship-by.ts` |
| `statusOrderBadge($int)` | "1" → "<span class='badge-warning'>รอชำระ</span>" etc. | `components/admin/order-status-badge.tsx` |
| `optionShipBy()` | render `<option>` for ship_by select | `lib/forwarder/ship-by.ts` + `<ShipBySelect />` |
| `calPriceForwarderSumCompany()` | SVIP→VIP→General waterfall + juristic + service fee | `lib/forwarder/calc-price.ts` (P-D3 ported partial — verify completeness) |
| `clearCreditBalance()` | apply customer credit balance to order | `lib/wallet/apply-credit.ts` |
| `DateThai*()` family | Thai date format (พ.ศ. years) | `lib/format/thai-date.ts` |

📋 Full catalogue → `D:\xampp\htdocs\pcscargo\member\include\function.php` — 2451 LOC. ภูม owns this port. Track in [`docs/PORT_PLAN.md`](../../../docs/PORT_PLAN.md) Phase D.

## Auth pattern (legacy → Pacred)

Legacy:
```php
session_start();
if (!isset($_SESSION['pcs_logged']) || $_COOKIE['pcs_logged'] !== $_SESSION['pcs_logged']) {
  header("Location: /login");
  exit;
}
$userID = $_SESSION['userID'];
```

Pacred:
```typescript
import { requireAuth } from "@/lib/auth/require-auth";
// In page.tsx or action:
const { user, profile } = await requireAuth();
// user.id = legacy userID equivalent
```

## DB pattern (legacy → Pacred)

Legacy:
```php
$sql = "SELECT * FROM tb_users WHERE userID = '" . $_SESSION['userID'] . "'";
$result = mysqli_query($conn, $sql);
$user = mysqli_fetch_assoc($result);
```

Pacred:
```typescript
import { createClient } from "@/lib/supabase/server";
const supa = createClient();
const { data: profile, error } = await supa
  .from("profiles")
  .select("*")
  .eq("id", user.id)
  .single();
```

(Plus RLS policy enforces "user can only read own profile" — eliminates a class of bugs.)

## Validation pattern (legacy → Pacred)

Legacy: ad-hoc string functions, often missing.
Pacred: Zod schema at lib/validators/<domain>.ts, parse before any DB write.

```typescript
import { z } from "zod";
export const orderSchema = z.object({
  weight: z.number().positive(),
  shipBy: z.enum(["1","2","3","4","5"]),
  // ...
});
```

## Receipt PDF pattern (legacy → Pacred)

Legacy: mPDF with THSarabunNew font, inline HTML+CSS.
Pacred: `@react-pdf/renderer` with Sarabun (TH Sarabun New successor available on Google Fonts), components in `components/pdf/<receipt>.tsx`.

Already ported: `components/pdf/forwarder-receipt.tsx`, `components/pdf/shop-order-receipt.tsx` (per archive Phase D5).

## Anti-patterns

- **Copy SQL injection patterns** — legacy concats `$_POST` into SQL. Never replicate. Always Zod + typed client.
- **Copy `tb_` prefix into Pacred** — Pacred convention drops `tb_`. `tb_users` → `profiles`, `tb_wallet` → `wallet`, etc. Per ADR-0002 + docs/sprints/archive-a-to-n.md A3.
- **Skip the catalogue step** — porting without writing the spec doc first leads to missed edge cases.
- **Modify PHP source** — it's read-only reference. Even comments. We may revisit it 6 months from now and want it intact.
- **Forget RLS** — every Pacred table needs an RLS policy. Legacy had no FK + no RLS; we add both.

## Coordination with ภูม

ภูม owns the cargo backend port (Phase D/E/F in archive). When using this skill:

- **If ภูม has already ported the feature** (check `docs/PORT_PLAN.md` Parts O–T for status) → don't re-port. Reference his work.
- **If ภูม is in flight** → coordinate via LINE / brief.
- **If you spot a bug in his port** vs PHP behavior → flag in `docs/learnings/php-port-patterns.md` AND tell him directly.

## Cross-links

- `D:\xampp\htdocs\pcscargo\` — canonical legacy source (READ-ONLY)
- [`docs/audit/php-pcscargo-integrations.md`](../../../docs/audit/php-pcscargo-integrations.md) — integration inventory from initial sweep
- [`docs/sprints/archive-a-to-n.md`](../../../docs/sprints/archive-a-to-n.md) — Phase D / E / F port phases
- [`docs/PORT_PLAN.md`](../../../docs/PORT_PLAN.md) — current port status per feature
- [`test-coverage-writer`](../test-coverage-writer/SKILL.md) — wrap ports in tests
- [`scholar-immortal`](../scholar-immortal/SKILL.md) — capture port patterns
