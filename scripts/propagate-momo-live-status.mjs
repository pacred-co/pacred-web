/**
 * scripts/propagate-momo-live-status.mjs
 *
 * URGENT (owner/ภูม 2026-07-01 · status-path):
 *   MOMO's PARTNER token (import/track) reports status only up to "ออกจากโกดังจีน" and
 *   then DROPS the parcel → tb_forwarder.fstatus freezes for many rows. MOMO's OWN web
 *   (momocargo.com, master account) still shows the parcel in the right status board.
 *   MOMO is source-of-truth for STATUS → propagate the Live-board status into
 *   tb_forwarder.fstatus (แต้ม stays only for weight/CBM verification).
 *
 * This is the STANDALONE mirror of lib/integrations/momo-web/propagate-live-status.ts so
 * ภูม/เดฟ can run it on prod manually and see EXACTLY what it would do BEFORE it writes.
 * It replicates the MOMO login + board fetch + the board→fstatus map inline to avoid the
 * server-only import block (same pattern as scripts/advance-departed-containers.mjs).
 *
 * SAFETY (identical to the job):
 *   - FORWARD-ONLY: advance a row ONLY when the MOMO-Live board status is STRICTLY newer
 *     than the row's current fstatus. The UPDATE WHERE carries `.in('fstatus', <codes
 *     strictly behind the target>)`, so a row that raced forward updates 0 rows —
 *     NEVER demoted; a re-run advances 0 rows (idempotent · TOCTOU-safe).
 *   - STATUS-ONLY: writes ONLY fstatus, the matching fdatestatusN (when empty),
 *     adminidupdate='system-live'. NEVER money / wallet / commission / cabinet /
 *     weight / price / any other column.
 *   - This script does NOT re-derive the linked shop order (the cron job does that
 *     best-effort · the DB trigger mig 0234/0235 also re-derives shop orders).
 *
 * Per AGENTS.md §11 — dry-run FIRST (prints the full plan), then --apply.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/propagate-momo-live-status.mjs           # dry-run (default)
 *   node --env-file=.env.local scripts/propagate-momo-live-status.mjs --apply   # actually UPDATE
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + MOMO_WEB_USER +
 * MOMO_WEB_PASS — pass via `node --env-file=.env.local`.
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const MOMO_BASE = "https://api.momocargo.com:5000";

// ── pure helpers (mirror of lib/integrations/momo-web/live-status-plan.ts) ──
const LIVE_STATUS_TO_FSTATUS = {
  waiting: "1",
  arrival_kodang: "2",
  sending_thai: "3",
  wait_pay: "5",
  sending: "6",
  done: "7",
};
const LIVE_STATUSES = Object.keys(LIVE_STATUS_TO_FSTATUS);
const STATUS_TH = {
  waiting: "รอเข้าโกดังจีน",
  arrival_kodang: "ถึงโกดังจีน",
  sending_thai: "กำลังส่งมาไทย",
  wait_pay: "รอชำระค่าขนส่ง",
  sending: "กำลังนำส่ง",
  done: "จัดส่งให้แล้ว",
};
const FSTATUS_RANK = { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "99": 99 };
const rank = (v) => (v && FSTATUS_RANK[v] != null ? FSTATUS_RANK[v] : 0);
const isForward = (cur, target) => rank(target) > 0 && rank(target) > rank(cur);
const codesBehind = (target) => Object.keys(FSTATUS_RANK).filter((c) => FSTATUS_RANK[c] < rank(target));
function fdateCol(fstatus) {
  switch (fstatus) {
    case "2": return "fdatestatus2";
    case "3": return "fdatestatus3";
    case "5": return "fdatetothai";
    case "6": return "fdatestatus6";
    case "7": return "fdatestatus7";
    default:  return null;
  }
}
const todayYmd = () => new Date().toISOString().slice(0, 10);
const fmt = (v, w) => String(v).padEnd(w).slice(0, w);

const COMMON_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.momocargo.com",
  Referer: "https://www.momocargo.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36",
};

async function momoLogin(user, pass) {
  const r = await fetch(`${MOMO_BASE}/api/auth/login`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass, os: "web" }),
  });
  if (!r.ok) throw new Error(`MOMO login failed (${r.status})`);
  const j = await r.json().catch(() => null);
  const tok = j?.data?.token;
  if (!tok) throw new Error("MOMO login: no token in response");
  return tok;
}

async function momoBoard(token, status, size = 500) {
  const r = await fetch(
    `${MOMO_BASE}/api/shop_orders/user/get/order/list/v2/1/${size}/all/${status}/all/asc/all`,
    { headers: { ...COMMON_HEADERS, Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`MOMO GET ${status} → ${r.status}`);
  const j = await r.json().catch(() => null);
  const d = j?.data;
  const rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
  // flatten orders → parcels (tracking only — that's the match key)
  const out = [];
  for (const order of rows) {
    for (const ct of order?.cn_tracks ?? []) {
      for (const vt of ct?.vendor_tracks ?? []) {
        const tracking = String(vt?.tracking ?? "").trim();
        if (tracking) out.push({ tracking });
      }
    }
  }
  return out;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mUser = process.env.MOMO_WEB_USER;
  const mPass = process.env.MOMO_WEB_PASS;
  if (!url || !key) {
    console.error("✗ missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with `node --env-file=.env.local`)");
    process.exit(1);
  }
  if (!mUser || !mPass) {
    console.error("✗ missing MOMO_WEB_USER / MOMO_WEB_PASS (run with `node --env-file=.env.local`)");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const today = todayYmd();

  console.log("───────────────────────────────────────────────────────────────");
  console.log(`propagate MOMO Live status → tb_forwarder.fstatus · mode = ${APPLY ? "🔴 APPLY (will UPDATE)" : "🟡 DRY-RUN"}`);
  console.log(`today = ${today} · forward-only · status-only`);
  console.log("───────────────────────────────────────────────────────────────\n");

  // 1. login + fetch every board, tag each parcel with its board (newest-board wins).
  const token = await momoLogin(mUser, mPass);
  const targetByTracking = new Map(); // tracking → fstatus target
  const boardCounts = {};
  for (const status of LIVE_STATUSES) {
    const target = LIVE_STATUS_TO_FSTATUS[status];
    let parcels = [];
    try {
      parcels = await momoBoard(token, status);
    } catch (e) {
      console.error(`  ! board ${status} fetch failed: ${e.message}`);
      continue;
    }
    boardCounts[status] = parcels.length;
    for (const p of parcels) {
      const prev = targetByTracking.get(p.tracking);
      if (!prev || rank(target) > rank(prev)) targetByTracking.set(p.tracking, target);
    }
  }
  console.log("MOMO Live boards:");
  for (const s of LIVE_STATUSES) {
    console.log(`  ${fmt(STATUS_TH[s], 18)} (${s}) → fstatus ${LIVE_STATUS_TO_FSTATUS[s]} · ${boardCounts[s] ?? 0} พัสดุ`);
  }
  console.log(`\ndistinct parcels seen: ${targetByTracking.size}\n`);

  // 2. batch-lookup tb_forwarder by ftrackingchn, plan forward-only advances.
  const trackings = [...targetByTracking.keys()];
  const CHUNK = 200;
  const hits = [];
  for (let i = 0; i < trackings.length; i += CHUNK) {
    const slice = trackings.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fdatestatus2, fdatestatus3, fdatetothai, fdatestatus6, fdatestatus7")
      .in("ftrackingchn", slice);
    if (error) { console.error(`✗ forwarder lookup failed: ${error.message}`); continue; }
    for (const r of data ?? []) hits.push(r);
  }

  console.log(fmt("fid", 8) + fmt("tracking", 20) + fmt("from", 6) + "→ to");
  console.log("─".repeat(48));

  let matched = 0, wouldAdvance = 0, wrote = 0, failed = 0, noop = 0;
  for (const f of hits) {
    matched++;
    const target = targetByTracking.get((f.ftrackingchn ?? "").trim());
    if (!target || !isForward(f.fstatus, target)) { noop++; continue; }
    wouldAdvance++;
    console.log(fmt(f.id, 8) + fmt(f.ftrackingchn ?? "-", 20) + fmt(f.fstatus ?? "-", 6) + `→ ${target}`);

    if (APPLY) {
      const update = { fstatus: target, adminidupdate: "system-live" };
      const dc = fdateCol(target);
      if (dc) {
        const cur = f[dc];
        const hasStamp = !!cur && cur !== "0000-00-00";
        if (!hasStamp) update[dc] = today;
      }
      const behind = codesBehind(target);
      const { data: updRows, error: updErr } = await sb
        .from("tb_forwarder")
        .update(update)
        .eq("id", f.id)
        .in("fstatus", behind) // forward-only guard
        .select("id");
      if (updErr) { failed++; console.error(`   ✗ update id=${f.id} failed: ${updErr.message}`); }
      else if (updRows && updRows.length > 0) wrote++;
      else noop++; // raced past target between read + write
    }
  }

  console.log("\n───────────────────────────────────────────────────────────────");
  console.log(`matched forwarder rows: ${matched} · would-advance: ${wouldAdvance} · already-fresh: ${noop}`);
  if (APPLY) console.log(`\nAPPLIED: advanced ${wrote} · failed ${failed}`);
  else console.log(`\nDRY-RUN — no rows written. Re-run with --apply to advance the ${wouldAdvance} above.`);
  console.log("───────────────────────────────────────────────────────────────");
}

main().catch((e) => { console.error(e); process.exit(1); });
