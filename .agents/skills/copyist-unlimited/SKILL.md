---
name: copyist-unlimited
description: Use this skill whenever the user needs N variants of a template — landing pages for each ecosystem service, admin pages for each module, brief files for each role, migration files for each table, JSON-LD blocks for each page type, email templates for each scenario. Triggers on "scaffold 9 landing pages", "create one for each service", "ทำให้ครบ", "clone this template for", "เอา template มาดัดแปลงให้ทุก", "expand this for every X". Reads one source-of-truth template + a list of variant inputs + outputs N tailored files. Defaults to keeping diffs minimal (variant-only differences) so updates to the template propagate via re-run. This skill is the "นักกอปไร้ขีดจำกัด" (unlimited copyist) pattern the user requested.
---

# Copyist Unlimited — clone + adapt at scale

> **Why this exists.** The user (เดฟ) said *"โคลนโปรเจค template แล้วเอามาพัฒนาต่อยอด"* + *"นักกอปไร้ขีดจำกัด"*. Pacred needs many variants of the same thing — 13 service landing pages, 14 staff role workspaces, 10+ admin module pages, dozens of email templates. Hand-typing each is slow + introduces drift. This skill clones precisely.

## When to invoke

- ✅ "Create a landing page for each service in the ecosystem"
- ✅ "Generate admin pages for each module in ADR-0009 ERP schema sketch"
- ✅ "Make a brief file for each STAFF role in ops-roles.md"
- ✅ "Scaffold migration files for tables A, B, C, D"
- ✅ "Email signature template variants for each dept email"
- ❌ Generating one-off file from another — just copy with `cp` or `Write`
- ❌ Generating things that need substantial unique logic per variant — extract the shared part to a real abstraction instead

## The pattern

```
1. IDENTIFY the template
   Pick a canonical source-of-truth file that represents the "complete + good"
   version of the variant. Examples:
   · Pacred ecosystem landing template: app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/page.tsx
   · Admin module page template: app/[locale]/(admin)/admin/customers/page.tsx
   · Migration template: supabase/migrations/0028_hr_payroll.sql

2. IDENTIFY the variant axis (what varies)
   List the dimension(s) along which output files differ.
   · Service slug + display name + h1 keyword + featured rep (landing)
   · Module name + table list + RLS role (migration)
   · Role name + scope + tools (brief)

3. WRITE the inputs as data
   Inputs go in JSON / TS data file or a markdown table. Examples:
   · landing inputs: `[ { slug: "customs-broker-matching", name: "...", h1: "..." }, ... ]`
   · This makes the operation reproducible — re-run skill = regenerate same set

4. TEMPLATE the source file with placeholders
   Mark variant points in the source. Common pattern: `{{SLUG}}` / `{{NAME}}` / `{{H1}}`
   For TSX/TS files, prefer NAMED constants at top so substitution is one-line:
   ```typescript
   const SERVICE_SLUG = "{{SLUG}}";
   const SERVICE_NAME = "{{NAME}}";
   const SERVICE_H1 = "{{H1}}";
   ```

5. GENERATE
   For each input row → produce a new file by substituting placeholders.
   Output to the right path (e.g., `app/[locale]/(public)/services/<slug>/page.tsx`).
   Don't run a templating engine; just do string replace + write — it's fewer deps.

6. AUDIT — quick sanity check after generation
   · Every output file compiles (tsc)
   · Every output file's links resolve (audit:md)
   · Every output file has i18n keys covered both langs (audit:i18n if you added new keys)
   · No empty placeholder leak (`grep "{{" ` should be empty)

7. CAPTURE — record the input schema
   Save the input JSON / table next to the template OR in
   `.Codex/skills/copyist-unlimited/inputs/<batch-name>.json` so the next
   re-run is deterministic.
```

## Pacred-specific recommended uses

### Phase I landing shells (9 ecosystem services)

Inputs (sketch):

```typescript
const PHASE_I_LANDINGS = [
  { slug: "customs-broker-matching", name: "จับคู่ตัวแทนออกของ", h1Keyword: "ตัวแทนออกของ YY", featured: "พลอย" },
  { slug: "tax-refund", name: "ขอคืนภาษีขาออก", h1Keyword: "tax refund", featured: "พลอย" },
  { slug: "tax-invoice", name: "ออกใบกำกับภาษี", h1Keyword: "ใบกำกับภาษี", featured: "พลอย" },
  { slug: "shipping-document", name: "ออกใบขนสินค้า", h1Keyword: "ใบขนสินค้า", featured: "พลอย" },
  { slug: "export", name: "ส่งออกสินค้า", h1Keyword: "export ส่งออก", featured: "วิน" },
  { slug: "fumigation", name: "บริการฟูมิเกชัน", h1Keyword: "fumigation", featured: "พลอย" },
  { slug: "consignment", name: "บริการฝากขายสินค้า", h1Keyword: "ฝากขาย consignment", featured: "วิน" },
  { slug: "bill-payment", name: "บริการฝากจ่ายบริการ", h1Keyword: "ฝากจ่าย", featured: "วิน" },
  { slug: "logistics", name: "ขนส่ง + แมสเซ็นเจอร์", h1Keyword: "ขนส่ง logistics", featured: "วิน" },
];
```

Template: customs page v2. Output: `app/[locale]/(public)/services/<slug>/page.tsx` + i18n keys + sitemap entry. Each shell uses "ติดต่อทีม" / LINE CTA until backend module exists.

### Admin module pages (per ADR-0009 M1..M14)

Inputs: module name · primary table · sidebar group · RBAC role.
Template: existing `/admin/customers/page.tsx` list view.
Output: `/admin/<module-slug>/page.tsx` per module.

### Migration files (per ERP schema sketch)

Inputs: migration number · table name · columns · RLS policy.
Template: a clean `supabase/migrations/00NN_*.sql` with the boilerplate Pacred patterns (audit columns + RLS + `is_admin()`).
Output: `supabase/migrations/00NN_<name>.sql` per table.

## Anti-patterns

- **Over-templating** — making generic things generic. If a variant has truly unique logic → extract that variant to its own file, don't bloat the template with `{{IF_X}}` conditionals.
- **No safety check after generation** — generating 9 broken files burns 9× the time to fix. Always run audit gates.
- **Manually editing one generated file** — diverges from template. Edit the template + regenerate instead.
- **Skipping the inputs-as-data step** — if regeneration isn't reproducible, you'll have to remember the inputs from human memory next time. Don't.

## Output convention

When generated files include a "this was scaffolded by copyist-unlimited" hint, future readers know not to hand-edit:

```typescript
/**
 * Scaffolded by .Codex/skills/copyist-unlimited on 2026-05-15.
 * Source template: app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/page.tsx
 * Variant inputs:  .Codex/skills/copyist-unlimited/inputs/phase-i-landings.json
 *
 * To update copy across all 9 landings: edit the template + regenerate.
 * Don't hand-edit this file (changes will be lost on next regen).
 */
```

## Cross-links

- [`docs/STRATEGY.md`](../../../docs/STRATEGY.md) §4 — service catalogue (13 services, source of variant axis)
- [`docs/briefs/ops-roles.md`](../../../docs/briefs/ops-roles.md) — 14 staff role workspaces (another variant axis)
- [`docs/decisions/0009-erp-schema-sketch.md`](../../../docs/decisions/0009-erp-schema-sketch.md) — M1..M14 modules
- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — run after generation
