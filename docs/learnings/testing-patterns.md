# Learnings — testing patterns (Pacred-specific)

Topics: node --test idioms, Supabase mock patterns, server-action test scaffolding, integration-vs-unit split.

> Add via `.claude/skills/scholar-immortal/SKILL.md` protocol after a non-obvious test setup works.

---

## [2026-05-16] @react-pdf/renderer `fontStyle: "italic"` silently breaks render when no italic font variant registered

**Context:** Phase C of Part U pickup — wrote `lib/pdf/render.test.tsx` (U1-8) to smoke-test PDF rendering for Thai special characters per chat audit L-5 (mPDF brittleness). All 5 test cases failed on first run with the same error before any Thai-character assertion ran.

**Symptom:** `renderToBuffer` rejects with:
```
Error: Could not resolve font for Sarabun, fontWeight 400, fontStyle italic
```
This happens even on the BASE test case (no edge characters) — purely because the styles include `fontStyle: "italic"` but `lib/pdf/register-fonts.ts` only registers Sarabun-Regular + Sarabun-Bold (no italic TTF in `public/fonts/`).

**Root cause:** `@react-pdf/renderer` requires every `(family, fontWeight, fontStyle)` combination used in any `StyleSheet` rule to have a matching `Font.register({ ..., fontStyle: "italic" })` call. Unlike CSS where browsers fake-italicize a regular font when no italic file exists, react-pdf throws hard. The error is only triggered at render time, not at style definition — so the bug is latent until the styled element is actually composed.

**Fix:** Two surfaces touched, both in `components/pdf/styles.ts`:
- `originalCopy` (added by ภูม in G2c — `components/pdf/styles.ts:90-95`)
- `amountInWords` (predates G2c — `components/pdf/styles.ts:235`)

Removed `fontStyle: "italic"` from both. Visual distinction now relies on smaller font + muted color (originalCopy) + surface-alt background (amountInWords). Both PDF templates (forwarder-receipt + tax-invoice) render again.

```ts
// BEFORE
amountInWords: {
  fontSize: 9,
  fontStyle: "italic",   // ← throws at renderToBuffer
  color: COLORS.foreground,
  ...
}

// AFTER
amountInWords: {
  fontSize: 9,
  color: COLORS.foreground,   // visual distinction via bg + size only
  ...
}
```

**Why this matters next time:**
- This was a **latent production bug**: the existing forwarder PDF route (`app/api/pdf/forwarder/[fNo]/route.tsx`) uses `amountInWords` and would have failed in real customer downloads if the test hadn't caught it first. Estimated impact: 100% failure rate on every forwarder receipt PDF download.
- Any time a new PDF style adds `fontStyle: "italic"` OR `fontWeight: <number>` not in {400, 700}, the same trap fires. **Rule:** every fontWeight/fontStyle combo used in `StyleSheet.create({...})` MUST have a matching `Font.register` call.
- If we want italic later, bundle `Sarabun-Italic.ttf` to `public/fonts/` and add a third entry in `lib/pdf/register-fonts.ts`.

**Test that catches this going forward:** `lib/pdf/render.test.tsx` (15 assertions across 5 PDF variants, runs in `pnpm test:unit`).

**Cross-links:**
- Migration: chat audit L-5 → `docs/audit/chat-analysis-2026-05-16.md` § L-5
- Files: `components/pdf/styles.ts:90,235` · `lib/pdf/register-fonts.ts` · `lib/pdf/render.test.tsx`
- Commit: (this batch — Phase C of Part U pickup)

---

## [2026-05-16] tsx test runners can't import from files with `import "server-only"`

**Context:** Same Phase C work — initial PDF test imported `lib/pdf/register-fonts.ts` to call `registerPdfFonts()`. Test crashed before any assertion ran.

**Symptom:**
```
Error: Cannot find module 'server-only'
Require stack:
- lib/pdf/register-fonts.ts
- lib/pdf/render.test.tsx
```

**Root cause:** `server-only` is a virtual module Next.js provides at build time to enforce server-component boundaries. Raw `tsx` (the test runner) doesn't know about it — it tries to resolve as a real npm package and fails.

**Fix:** Inline the font-registration logic directly in the test instead of importing it. Mirror the same `Font.register({...})` call but skip the `import "server-only"` line.

```ts
// In test file — bypass register-fonts.ts entirely:
function registerSarabunForTest(): void {
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Sarabun",
    fonts: [
      { src: path.join(fontsDir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(fontsDir, "Sarabun-Bold.ttf"),    fontWeight: "bold"   },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}
```

**Why this matters next time:**
- Any future test that wants to exercise a server-only module needs to either (a) inline the logic or (b) extract the testable part into a non-server-only helper file.
- General rule: don't add `import "server-only"` to anything you want to unit-test in raw tsx. Save that marker for files that genuinely must never bleed to the client (e.g., admin client construction, secret loading).

**Cross-links:** `lib/pdf/render.test.tsx` (test workaround) · `lib/pdf/register-fonts.ts` (the file we couldn't import)
