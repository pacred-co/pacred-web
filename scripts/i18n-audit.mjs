#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const th = JSON.parse(readFileSync(resolve(root, "messages/th.json"), "utf8"));
const en = JSON.parse(readFileSync(resolve(root, "messages/en.json"), "utf8"));

function flatten(obj, prefix = "") {
  const out = new Map();
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) {
      for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
    } else {
      out.set(key, v);
    }
  }
  return out;
}

const flatTh = flatten(th);
const flatEn = flatten(en);

const missingInEn = [];
const missingInTh = [];
const sameValue   = [];

for (const k of flatTh.keys()) {
  if (!flatEn.has(k)) missingInEn.push(k);
}
for (const k of flatEn.keys()) {
  if (!flatTh.has(k)) missingInTh.push(k);
}
for (const [k, v] of flatTh.entries()) {
  if (flatEn.has(k) && flatEn.get(k) === v && typeof v === "string" && v.length > 4) {
    if (!/^[\d\s\-+#@.():,/]+$/.test(v)) {
      sameValue.push({ key: k, value: v });
    }
  }
}

console.log("\n══════════════════════════════════════════════════");
console.log(" Pacred i18n audit");
console.log("══════════════════════════════════════════════════");
console.log(` th keys : ${flatTh.size}`);
console.log(` en keys : ${flatEn.size}`);
console.log("");
console.log(`◆ Missing in EN  (${missingInEn.length}):`);
for (const k of missingInEn) console.log("   - " + k);
console.log("");
console.log(`◆ Missing in TH  (${missingInTh.length}):`);
for (const k of missingInTh) console.log("   - " + k);
console.log("");
console.log(`◆ EN === TH still (likely untranslated, ${sameValue.length}):`);
for (const { key, value } of sameValue.slice(0, 40)) {
  const preview = value.length > 60 ? value.slice(0, 60) + "…" : value;
  console.log(`   - ${key}  →  "${preview}"`);
}
if (sameValue.length > 40) {
  console.log(`   …and ${sameValue.length - 40} more`);
}
console.log("");

const issues = missingInEn.length + missingInTh.length;
process.exit(issues > 0 ? 1 : 0);
