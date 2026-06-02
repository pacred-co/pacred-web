#!/usr/bin/env node
/**
 * One-off codemod 2026-06-02: add `as unknown as ` to Supabase result casts
 * that broke after home-Claude added migrations 0129-0134 (new tables that
 * `database.types.ts` doesn't know about, so the chained `.select(...)`
 * returns `{ error: true } & String`, and direct `as RowType[]` fails tsc).
 *
 * Pattern matched (anchored on closing `??  []` paren):
 *
 *   (something ?? []) as XxxRow[]
 *     →  (something ?? []) as unknown as XxxRow[]
 *
 *   ((something ?? []) as XxxRow[]).map(...)
 *     →  ((something ?? []) as unknown as XxxRow[]).map(...)
 *
 *   for (const x of (foo ?? []) as XxxRow[])
 *     →  for (const x of (foo ?? []) as unknown as XxxRow[])
 *
 * Type-name allow-list (ends in Row/Raw/Entry/Item/Option/Hit/Record) to
 * avoid touching unrelated casts like `as MutationOptions[]`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["actions", "app", "lib"];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!p.includes("node_modules") && !p.includes(".next")) walk(p, files);
    } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
      files.push(p);
    }
  }
  return files;
}

const all = ROOTS.flatMap((r) => walk(r));
let totalFixes = 0;
const touched = [];
for (const f of all) {
  const txt = fs.readFileSync(f, "utf8");
  // Match `) as <UpperTypeName>(Row|Raw|...)<[]>` where preceding `as` is
  // NOT already `unknown as`. We anchor on `)` to capture only Supabase
  // result casts (which always come from `... ?? []` wrapped in parens).
  const rx = /(\)\s+)as\s+([A-Z][a-zA-Z]*(?:Row|Raw|Entry|Item|Option|Hit|Record))(\s*\[\])/g;
  let count = 0;
  const newTxt = txt.replace(rx, (m, before, type, brk) => {
    count++;
    return `${before}as unknown as ${type}${brk}`;
  });
  if (count > 0) {
    fs.writeFileSync(f, newTxt);
    totalFixes += count;
    touched.push(`${f.replace(/\\/g, "/")}: ${count}`);
  }
}
console.log(`Files touched: ${touched.length}`);
for (const t of touched.slice(0, 30)) console.log(`  ${t}`);
if (touched.length > 30) console.log(`  ... +${touched.length - 30} more`);
console.log(`Total replacements: ${totalFixes}`);
