/**
 * Smoke tests for `no-bare-supabase-data-destructure`.
 * Run with: pnpm tsx eslint-rules/no-bare-supabase-data-destructure.test.js
 *
 * The rule's logic is small enough that we don't pull in the full RuleTester
 * harness — instead we run ESLint's flat API on inline snippets and assert
 * the expected count of reports.
 */
"use strict";

const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("./no-bare-supabase-data-destructure");

const linter = new Linter();

function lint(code) {
  return linter.verify(
    code,
    {
      languageOptions: {
        parser: tsParser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      plugins: {
        pacred: { rules: { "no-bare-supabase-data-destructure": rule } },
      },
      rules: { "pacred/no-bare-supabase-data-destructure": "error" },
    },
  );
}

function lintAndFix(code) {
  return linter.verifyAndFix(
    code,
    {
      languageOptions: {
        parser: tsParser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      plugins: {
        pacred: { rules: { "no-bare-supabase-data-destructure": rule } },
      },
      rules: { "pacred/no-bare-supabase-data-destructure": "error" },
    },
  );
}

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    if (detail) console.log("       " + JSON.stringify(detail, null, 2));
    failed++;
  }
}

console.log("\n— no-bare-supabase-data-destructure —\n");

// Valid cases
console.log("valid:");
check(
  "destructure with error",
  lint(`async function f() {
    const admin = {} as any;
    const { data, error } = await admin.from("X").select();
  }`).length === 0,
);

check(
  "renamed data with renamed error",
  lint(`async function f() {
    const admin = {} as any;
    const { data: foo, error: fooErr } = await admin.from("X").select().single();
  }`).length === 0,
);

check(
  "non-Supabase await (fetch)",
  lint(`async function f() {
    const { data } = await fetch("/api").then((r) => r.json());
  }`).length === 0,
);

check(
  "no data property — no fire",
  lint(`async function f() {
    const admin = {} as any;
    const { count } = await admin.from("X").select();
  }`).length === 0,
);

check(
  "Storage op (different error shape) — no fire",
  lint(`async function f() {
    const supabase = {} as any;
    const { data } = await supabase.storage.from("slips").createSignedUrl(p, 3600);
  }`).length === 0,
);

// Invalid cases
console.log("\ninvalid:");
const r1 = lint(`async function f() {
  const admin = {} as any;
  const { data } = await admin.from("X").select();
}`);
check("bare data — admin.from chain", r1.length === 1, r1);

const r2 = lint(`async function f() {
  const supabase = {} as any;
  const { data } = await supabase.rpc("fn");
}`);
check("bare data — supabase.rpc chain", r2.length === 1, r2);

const r3 = lint(`async function f() {
  const sb = {} as any;
  const { data: row } = await sb.from("X").select().maybeSingle();
}`);
check("bare renamed data", r3.length === 1, r3);

// Auto-fix
console.log("\nauto-fix:");
const f1 = lintAndFix(`async function f() {
  const admin = {} as any;
  const { data } = await admin.from("X").select();
}`);
check(
  "fix adds `, error`",
  f1.fixed && f1.output.includes("data, error"),
  f1,
);

const f2 = lintAndFix(`async function f() {
  const admin = {} as any;
  const { data: row } = await admin.from("X").select().maybeSingle();
}`);
check(
  "fix adds `, error: rowErr` for renamed",
  f2.fixed && f2.output.includes("error: rowErr"),
  f2,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
