/**
 * scripts/advance-departed-containers.mjs
 *
 * URGENT (owner/ภูม 2026-07-01 · status-path):
 *   MOMO's import/track API reports status only up to "ออกจากโกดังจีน" and then DROPS
 *   the parcel once it advances → many tb_forwarder rows sit STUCK at fstatus '1'
 *   (รอเข้าโกดังจีน) or '2' (ถึงโกดังจีนแล้ว) even after the container has DEPARTED China
 *   and is "กำลังส่งมาไทย" (fstatus '3'). Customers complain.
 *
 * Fix: bypass the broken API using the แต้ม (iTAM) container ETD we already store in
 *   taem_container_etd_eta (migration 0195). A container whose ETD is in the PAST has
 *   LEFT China → every parcel still at '1'/'2' in it is really at least '3'. Advance
 *   them to '3' and stamp fdatestatus3 (only when empty).
 *
 * This is the STANDALONE mirror of lib/admin/advance-departed-containers.ts so ภูม can
 * run it on prod manually and see EXACTLY what it would do BEFORE it writes. It
 * replicates the resolve inline to avoid the server-only import block (same pattern as
 * scripts/backfill-momo-forwarder-rates.mjs).
 *
 * SAFETY (identical to the job):
 *   - DEPARTED = แต้ม ETD strictly < today (0000-00-00 / blank / future → not departed).
 *   - FORWARD-ONLY: the UPDATE WHERE carries `.in('fstatus', ['1','2'])`, so a row at
 *     3/4/5/6/7 is NEVER demoted; a re-run advances 0 rows (idempotent · TOCTOU-safe).
 *   - STATUS-ONLY: writes ONLY fstatus='3', fdatestatus3=today (when empty),
 *     adminidupdate='system-auto'. NEVER money / wallet / commission / cabinet /
 *     weight / price / any other column.
 *   - This script does NOT re-derive the linked shop order (the cron job does that
 *     best-effort). The DB trigger (mig 0234/0235) also re-derives shop orders from
 *     forwarder state, so a manual run stays consistent.
 *
 * Per AGENTS.md §11 — dry-run FIRST (prints the full plan), then --apply.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/advance-departed-containers.mjs           # dry-run (default)
 *   node --env-file=.env.local scripts/advance-departed-containers.mjs --apply   # actually UPDATE
 *
 * (Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — pass via
 *  `node --env-file=.env.local` as shown.)
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

// ── pure helpers (mirror of lib/admin/departed-container-plan.ts) ──
const ADVANCE_TO_FSTATUS = "3";
const ADVANCEABLE_FROM_FSTATUS = ["1", "2"];

function todayYmd(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
function normalizeEtd(etd) {
  if (!etd) return null;
  const s = String(etd).trim();
  if (s === "" || s.startsWith("0000-00-00")) return null;
  return s.slice(0, 10);
}
function isContainerDeparted(etd, now = new Date()) {
  const d = normalizeEtd(etd);
  if (!d) return false;
  return d < todayYmd(now);
}

function fmt(v, w) {
  return String(v).padEnd(w).slice(0, w);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("✗ missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with `node --env-file=.env.local`)");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const today = todayYmd();

  console.log("───────────────────────────────────────────────────────────────");
  console.log(`advance DEPARTED-container forwarders '1'/'2' → '3' · mode = ${APPLY ? "🔴 APPLY (will UPDATE)" : "🟡 DRY-RUN"}`);
  console.log(`today = ${today} · departed = แต้ม ETD strictly < today`);
  console.log("───────────────────────────────────────────────────────────────\n");

  // 1. read the แต้ม per-container ETD store, keep DEPARTED containers only.
  const { data: taemRows, error: taemErr } = await sb
    .from("taem_container_etd_eta")
    .select("container_no, etd")
    .not("etd", "is", null)
    .lte("etd", today);
  if (taemErr) { console.error("✗ taem read failed:", taemErr.message); process.exit(1); }

  const departed = Array.from(
    new Set(
      (taemRows ?? [])
        .filter((r) => isContainerDeparted(r.etd))
        .map((r) => (r.container_no ?? "").trim())
        .filter(Boolean),
    ),
  );
  // keep the ETD per container for the printout.
  const etdByContainer = new Map();
  for (const r of taemRows ?? []) {
    const c = (r.container_no ?? "").trim();
    if (c && isContainerDeparted(r.etd)) etdByContainer.set(c, normalizeEtd(r.etd));
  }

  console.log(`departed containers (ETD in past): ${departed.length}\n`);
  if (departed.length === 0) {
    console.log("Nothing to advance. ✓");
    return;
  }

  console.log(
    fmt("container", 22) + fmt("ETD", 12) + fmt("fid", 8) + fmt("from", 6) + "→ to",
  );
  console.log("─".repeat(60));

  let scanned = 0, wouldAdvance = 0, wrote = 0, failed = 0;
  const perContainer = [];

  for (const container of departed) {
    const { data: fwdRows, error: fwdErr } = await sb
      .from("tb_forwarder")
      .select("id, fstatus, fdatestatus3, ftrackingchn")
      .eq("fcabinetnumber", container)
      .in("fstatus", ADVANCEABLE_FROM_FSTATUS);
    if (fwdErr) { console.error(`✗ forwarder read failed (container=${container}): ${fwdErr.message}`); continue; }

    const candidates = fwdRows ?? [];
    if (candidates.length === 0) continue;
    scanned += candidates.length;
    let advancedInContainer = 0;

    for (const f of candidates) {
      wouldAdvance++;
      console.log(
        fmt(container, 22) + fmt(etdByContainer.get(container) ?? "-", 12) +
        fmt(f.id, 8) + fmt(f.fstatus ?? "-", 6) + `→ ${ADVANCE_TO_FSTATUS}`,
      );

      if (APPLY) {
        const update = { fstatus: ADVANCE_TO_FSTATUS, adminidupdate: "system-auto" };
        const hasStamp = !!f.fdatestatus3 && f.fdatestatus3 !== "0000-00-00";
        if (!hasStamp) update.fdatestatus3 = today;

        const { data: updRows, error: updErr } = await sb
          .from("tb_forwarder")
          .update(update)
          .eq("id", f.id)
          .in("fstatus", ADVANCEABLE_FROM_FSTATUS) // forward-only guard
          .select("id");
        if (updErr) { failed++; console.error(`   ✗ update id=${f.id} failed: ${updErr.message}`); }
        else if (updRows && updRows.length > 0) { wrote++; advancedInContainer++; }
      } else {
        advancedInContainer++;
      }
    }
    if (advancedInContainer > 0) perContainer.push({ container, advanced: advancedInContainer });
  }

  console.log("\n───────────────────────────────────────────────────────────────");
  console.log(`departed containers: ${departed.length} · forwarder rows at '1'/'2': ${scanned} · would-advance: ${wouldAdvance}`);
  if (perContainer.length > 0) {
    console.log("per-container:");
    for (const p of perContainer) console.log(`  ${fmt(p.container, 22)} ${p.advanced}`);
  }
  if (APPLY) console.log(`\nAPPLIED: advanced ${wrote} · failed ${failed}`);
  else console.log(`\nDRY-RUN — no rows written. Re-run with --apply to advance the ${wouldAdvance} above.`);
  console.log("───────────────────────────────────────────────────────────────");
}

main().catch((e) => { console.error(e); process.exit(1); });
