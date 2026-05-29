#!/usr/bin/env node
/**
 * Run `tsc --noEmit` with a bumped V8 heap.
 *
 * The Pacred codebase grew past Node's default 2 GB heap for tsc once
 * the camelCase batches (Wave 25 #194 + batch 2a) + ปอน's MOMO isolated
 * layer + the legacy tb_* type definitions landed. Bare `tsc --noEmit`
 * OOMs in both local + CI environments — see
 *   docs/learnings/ci-and-deploy-gotchas.md
 * for the failure fingerprint ("Ineffective mark-compacts near heap limit
 * Allocation failed - JavaScript heap out of memory").
 *
 * This wrapper sets `NODE_OPTIONS=--max-old-space-size=8192` before
 * exec'ing tsc, in a way that works on Linux/Mac (npm scripts via sh)
 * AND Windows (npm scripts via cmd) — bare `NODE_OPTIONS=...` shell
 * prefixes in package.json scripts only work on the former.
 *
 * Usage: `pnpm exec node scripts/tsc-check.mjs` or (via package.json)
 * `pnpm verify`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Preserve any caller-supplied NODE_OPTIONS; only ADD the heap flag if
// it's not already present (so devs can override to e.g. 12 GB).
const existing = process.env.NODE_OPTIONS ?? "";
const heapFlag = "--max-old-space-size=8192";
const env = {
  ...process.env,
  NODE_OPTIONS: existing.includes("max-old-space-size") ? existing : `${existing} ${heapFlag}`.trim(),
};

// Find tsc — prefer the local copy under node_modules, fall back to pnpm exec.
const localTsc = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const cmd = existsSync(localTsc) ? localTsc : "pnpm";
const args = existsSync(localTsc) ? ["--noEmit", ...process.argv.slice(2)] : ["exec", "tsc", "--noEmit", ...process.argv.slice(2)];

const result = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(result.status ?? 1);
