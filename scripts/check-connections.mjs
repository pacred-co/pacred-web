// Pacred connection-readiness check.
// Reads .env.local and reports which analytics / ads / monitoring / payment
// integrations are wired — grouped by launch-criticality.
//
// Usage:  pnpm check:connections   (or: node scripts/check-connections.mjs)
//
// This is a REPORT, not a gate — in dev many vars are intentionally unset, so
// it always exits 0. Run it before an ads launch or a deploy to see what still
// needs connecting. The "does data actually arrive" verify steps live in
// docs/runbook/launch-monitoring-golive-2026-05-17.md.
//
// Companion: docs/research/ads-launch-action-plan-2026-05-20.md §2 + §8.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// ── 1. Load .env.local — real values live here (.env.example is the template) ──
const envPath = path.join(root, ".env.local");
const env = {};
const envFileFound = fs.existsSync(envPath);
if (envFileFound) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

// ── 2. Classify a var: MISSING / PLACEHOLDER / SET ──
const PLACEHOLDER =
  /[<>]|XXXXX|your-|example|changeme|project-ref|anon-key|service-role-key|random-|tbd/i;
function classify(key) {
  const v = env[key];
  if (v === undefined || v === "") return "MISSING";
  if (PLACEHOLDER.test(v)) return "PLACEHOLDER";
  return "SET";
}

// ── 3. The vars to check, grouped by launch-criticality ──
const GROUPS = [
  {
    title: "🔴 LAUNCH-CRITICAL — set before paid ads go live",
    vars: [
      ["NEXT_PUBLIC_GTM_ID", "Google Tag Manager — the keystone; unset = ads run blind"],
      ["SENTRY_DSN", "Server error tracking"],
      ["NEXT_PUBLIC_SENTRY_DSN", "Browser error tracking + IO-1 incident triage"],
      ["NEXT_PUBLIC_HCAPTCHA_SITE_KEY", "Lead-form bot protection (fails OPEN if unset)"],
      ["HCAPTCHA_SECRET_KEY", "Lead-form bot protection — server side"],
    ],
  },
  {
    title: "🟡 IMPORTANT — set in launch week",
    vars: [
      ["NEXT_PUBLIC_CLARITY_ID", "Heatmap / session replay — see where visitors drop"],
      ["UPSTASH_REDIS_REST_URL", "Distributed rate-limit (degrades to in-memory)"],
      ["UPSTASH_REDIS_REST_TOKEN", "Distributed rate-limit — token"],
      ["PROMPTPAY_ID", "Wallet deposit QR generation"],
    ],
  },
  {
    title: "🟢 CORE — the app needs these to run at all",
    vars: [
      ["NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL"],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key"],
      ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service role (server-only)"],
      ["NEXT_PUBLIC_SITE_URL", "Site URL — OAuth redirects + notification deep-links"],
    ],
  },
  {
    title: "⚪ OPTIONAL — feature-gated; set when the feature is needed",
    vars: [
      ["THAIBULKSMS_API_KEY", "SMS OTP (only if OTP_BYPASS=false)"],
      ["LINE_CHANNEL_ACCESS_TOKEN", "LINE Messaging API push"],
      ["NEXT_PUBLIC_LIFF_ID", "LINE LIFF customer linkage"],
      ["RESEND_API_KEY", "Email fallback"],
      ["MOMO_JMF_TOKEN", "MOMO container tracking"],
      ["SENTRY_WEBHOOK_SECRET", "Sentry → IO-1 incident webhook"],
    ],
  },
];

// ── 4. Print the report ──
const ICON = { SET: "✅", PLACEHOLDER: "⚠️ ", MISSING: "❌" };
console.log("\n═══ Pacred connection check ═══");

if (!envFileFound) {
  console.log(
    "\n⚠️  No .env.local found — cannot check local values." +
      "\n   Normal on a fresh checkout. On Vercel, env vars are set in the" +
      "\n   dashboard — verify there:" +
      "\n   docs/runbook/launch-monitoring-golive-2026-05-17.md\n",
  );
  process.exit(0);
}

let criticalMissing = 0;
for (const group of GROUPS) {
  console.log(`\n${group.title}`);
  for (const [key, desc] of group.vars) {
    const status = classify(key);
    console.log(`  ${ICON[status]} ${status.padEnd(11)} ${key}`);
    console.log(`              ${desc}`);
    if (group.title.startsWith("🔴") && status !== "SET") criticalMissing++;
  }
}

// ── 5. Live check — Supabase reachability (AGENTS.md §11: live→2xx/401, dead→DNS fail) ──
console.log("\n─── Live check ───");
const supaUrl = env.NEXT_PUBLIC_SUPABASE_URL;
if (supaUrl && !PLACEHOLDER.test(supaUrl)) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${supaUrl.replace(/\/$/, "")}/auth/v1/health`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    console.log(
      res.status === 404
        ? `  ❌ Supabase ${supaUrl} → 404 — project may be deleted`
        : `  ✅ Supabase reachable (HTTP ${res.status})`,
    );
  } catch (e) {
    console.log(
      `  ❌ Supabase ${supaUrl} unreachable — ${e?.cause?.code || e?.name || "error"}`,
    );
  }
} else {
  console.log("  ⚪ Supabase URL not set — skipped");
}

// ── 6. Verdict ──
console.log("\n─── Verdict ───");
if (criticalMissing === 0) {
  console.log("  ✅ All launch-critical connections are set.\n");
} else {
  console.log(
    `  ⚠️  ${criticalMissing} launch-critical connection(s) NOT set.` +
      "\n     Before paid ads, wire them per:" +
      "\n     docs/research/ads-launch-action-plan-2026-05-20.md §2\n",
  );
}
process.exit(0);
