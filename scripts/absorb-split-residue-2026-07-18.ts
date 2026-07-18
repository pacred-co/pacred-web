/**
 * ════════════════════════════════════════════════════════════════════════
 * SWEEP — absorb HALF-SPLIT residue groups (owner 2026-07-18 · PR050
 * 519218029029 "มีแค่ 2 กล่อง แต่ระบบแสดง 4 · เบิ้ลกล่อง เบิ้ลคิว เบิ้ลน้ำหนัก").
 * ════════════════════════════════════════════════════════════════════════
 * THE STATE: a bare AGGREGATE tb_forwarder row coexists with a FULL set of
 * "-1/n".."-n/n" box rows for the same base (MOMO re-keyed the parcel mid-flight
 * and each box was committed as an independent row, pre-Fix-F backlog). Every
 * group Σ (boxes/weight/คิว/cost) double-counts — หน้าบ้าน + หลังบ้าน alike.
 *
 * THE BRAIN is the SAME pure planner the live cron uses (planResidueAbsorb in
 * lib/integrations/momo-web/split-box-rows-plan.ts — unit-locked): this script
 * only enumerates the groups + applies the returned decision, mirroring the
 * writer's apply order (survivor shares → anchor adopt → delete "-1/n" →
 * staging re-point → survivor cost dedup). Money: Σ(sell) preserved EXACTLY
 * (allocation with the anchor absorbing the satang remainder).
 *
 * GUARDS (from the plan + here): every row unbilled (fstatus 1-4 · paydeposit≠1 ·
 * no advance-confirm · reforder='' · NOT on any invoice). A billed/ambiguous
 * group is FLAGGED, never touched — the report lists it for accounting.
 *
 * SAFETY RAILS
 *   - DRY-RUN by default — prints every plan; writes NOTHING. `--apply` to write.
 *   - `--apply` writes a JSON backup of every touched row FIRST
 *     (scripts/_backup-absorb-residue-<ts>.json) incl. the staging ptr rows.
 *
 * RUN (repo root · .env.local carries the prod service key):
 *   dry:   node_modules/.bin/tsx --env-file=.env.local scripts/absorb-split-residue-2026-07-18.ts
 *   apply: node_modules/.bin/tsx --env-file=.env.local scripts/absorb-split-residue-2026-07-18.ts --apply
 * ════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import {
  planResidueAbsorb,
  baseOf,
  suffixOf,
  type ResidueRowInput,
} from "../lib/integrations/momo-web/split-box-rows-plan";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false } });

const FILLABLE = ["1", "2", "3", "4"];

type Raw = Record<string, unknown>;
const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const toInput = (r: Raw): ResidueRowInput => ({
  id: Number(r.id),
  ftrackingchn: String(r.ftrackingchn ?? ""),
  fstatus: String(r.fstatus ?? ""),
  reforder: String(r.reforder ?? ""),
  paydeposit: (r.paydeposit as string | null) ?? null,
  advanceBillConfirmed: (r.advance_bill_confirmed as string | null) ?? null,
  fweight: num(r.fweight), fvolume: num(r.fvolume),
  fwidth: num(r.fwidth), flength: num(r.flength), fheight: num(r.fheight),
  famount: num(r.famount),
  famountcount: (r.famountcount as string | null) ?? null,
  ftotalprice: num(r.ftotalprice),
  frefrate: r.frefrate as number | string | null,
  frefprice: r.frefprice as number | string | null,
  fcosttotalprice: num(r.fcosttotalprice),
});

async function main() {
  console.log(`\n=== absorb-split-residue — ${APPLY ? "🔴 APPLY" : "DRY-RUN"} ===\n`);

  // 1. enumerate ALL rows → group by base → find residue signature (bare + "-1/n").
  const all: Raw[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("tb_forwarder").select("*").range(from, from + 999);
    if (error) { console.error("scan failed", error.message); process.exit(1); }
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const groups = new Map<string, Raw[]>();
  for (const r of all) {
    const t = String(r.ftrackingchn ?? "").trim();
    if (!t) continue;
    const b = baseOf(t);
    groups.set(b, [...(groups.get(b) ?? []), r]);
  }

  let found = 0, absorbed = 0, flagged = 0;
  const flaggedReport: string[] = [];
  const backup: { forwarders: Raw[]; staging: Raw[] }[] = [];
  const BACKUP_FILE = `scripts/_backup-absorb-residue-${Date.now()}.json`;

  for (const [base, rows] of groups) {
    const bareRaw = rows.find((r) => suffixOf(String(r.ftrackingchn ?? "")) === 0);
    const sufRaws = rows.filter((r) => suffixOf(String(r.ftrackingchn ?? "")) > 0);
    if (!bareRaw || sufRaws.length === 0) continue;
    const minSuf = Math.min(...sufRaws.map((r) => suffixOf(String(r.ftrackingchn ?? ""))));
    if (minSuf !== 1) continue; // proper split shape — leave
    found += 1;

    const bare = toInput(bareRaw);
    const sibs = sufRaws.map(toInput);
    const allIds = [bare.id, ...sibs.map((s) => s.id)];
    const label = `${base} (${String(bareRaw.userid ?? "")}) bare#${bare.id} +${sibs.length} sufs`;

    // invoice guard (the plan can't see it)
    const { data: inv, error: invErr } = await admin
      .from("tb_forwarder_invoice_item").select("forwarder_id").in("forwarder_id", allIds);
    if (invErr) { flagged += 1; flaggedReport.push(`${label} → invoice-guard read failed: ${invErr.message}`); continue; }
    if ((inv ?? []).length > 0) {
      flagged += 1;
      flaggedReport.push(`${label} → ON AN INVOICE (${(inv ?? []).map((i) => (i as { forwarder_id: number }).forwarder_id).join(",")}) — accounting`);
      continue;
    }

    const decision = planResidueAbsorb(bare, sibs, { allowPriced: true });
    if (!decision.absorb) {
      flagged += 1;
      flaggedReport.push(`${label} → ${decision.reason}`);
      continue;
    }
    const box1 = sibs.find((s) => s.id === decision.deleteSibId)!;

    // cabinet / transport / date adoption (mirror the writer)
    const sibCabs = new Set(sufRaws.map((r) => String(r.fcabinetnumber ?? "").trim()).filter(Boolean));
    const sibCab = sibCabs.size === 1 ? [...sibCabs][0]! : null;
    const bareCab = String(bareRaw.fcabinetnumber ?? "").trim();
    const adoptCab = sibCab && sibCab !== bareCab && bareRaw.fcabinet_locked !== true ? sibCab : null;
    const sibTt = new Set(sufRaws.map((r) => String(r.ftransporttype ?? "").trim()).filter(Boolean));
    const adoptTt = adoptCab && sibTt.size === 1 ? [...sibTt][0]! : null;
    const bareDate = String(bareRaw.fdatetothai ?? "").trim();
    const sibDates = sufRaws.map((r) => String(r.fdatetothai ?? "").trim()).filter((d) => d && d !== "0000-00-00");
    const adoptDate = (!bareDate || bareDate === "0000-00-00") && sibDates.length > 0 ? sibDates.sort().at(-1)! : null;
    const dupCostIds = decision.surviveSibIds.filter((id) => (sibs.find((x) => x.id === id)?.fcosttotalprice ?? 0) > 0);

    console.log(`— ${label}`);
    console.log(`   mode=${decision.mode} · anchor#${bare.id} adopts box-1 (${decision.anchorPatch.fweight}kg/${decision.anchorPatch.fvolume}คิว/฿${decision.anchorPatch.ftotalprice})`);
    console.log(`   delete "-1/n" #${decision.deleteSibId} · survivors [${decision.surviveSibIds.join(",")}]${decision.sibPatches.length ? ` shares ${decision.sibPatches.map((p) => `#${p.id}=฿${p.ftotalprice}`).join(" ")}` : ""}`);
    if (adoptCab) console.log(`   cabinet ${bareCab || "(empty)"} → ${adoptCab}${adoptTt ? ` · tt→${adoptTt}` : ""}`);
    if (adoptDate) console.log(`   fdatetothai → ${adoptDate}`);
    if (dupCostIds.length) console.log(`   survivor dup-cost → 0 on [${dupCostIds.join(",")}]`);
    const before = num(bareRaw.fweight) + sibs.reduce((s, x) => s + x.fweight, 0);
    const after = decision.anchorPatch.fweight + decision.surviveSibIds.reduce((s, id) => s + (sibs.find((x) => x.id === id)?.fweight ?? 0), 0);
    const sellBefore = bare.ftotalprice + sibs.reduce((s, x) => s + x.ftotalprice, 0);
    const sellAfter = decision.anchorPatch.ftotalprice + decision.sibPatches.reduce((s, p) => s + p.ftotalprice, 0)
      + decision.surviveSibIds.reduce((s, id) => (decision.sibPatches.some((p) => p.id === id) ? s : s + (sibs.find((x) => x.id === id)?.ftotalprice ?? 0)), 0);
    console.log(`   Σweight ${before}→${after} · Σsell ฿${sellBefore}→฿${Math.round(sellAfter * 100) / 100}`);

    if (!APPLY) { absorbed += 1; continue; }

    // ── backup group rows + staging ptrs — FLUSHED TO DISK BEFORE any write
    //    (a mid-run crash must never lose the restore data) ──
    const { data: stg } = await admin.from("momo_import_tracks")
      .select("*").in("committed_forwarder_id", allIds);
    backup.push({ forwarders: rows, staging: (stg ?? []) as Raw[] });
    writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 1));

    // 1. survivor price shares
    let ok = true;
    const patched: number[] = [];
    for (const p of decision.sibPatches) {
      const { data: pr, error: pErr } = await admin.from("tb_forwarder")
        .update({ ftotalprice: p.ftotalprice, frefrate: p.frefrate, frefprice: p.frefprice, adminidupdate: "sys-absorb" })
        .eq("id", p.id).lte("ftotalprice", 0).in("fstatus", FILLABLE).select("id");
      if (pErr || !pr || pr.length === 0) {
        for (const id of patched) await admin.from("tb_forwarder").update({ ftotalprice: 0, frefrate: 0, frefprice: "0" }).eq("id", id);
        console.error(`   🔴 share patch failed (fid ${p.id}) — reverted, group skipped`);
        ok = false; break;
      }
      patched.push(p.id);
    }
    if (!ok) { flagged += 1; flaggedReport.push(`${label} → apply-share-failed`); continue; }

    // 2. anchor adopt
    let q = admin.from("tb_forwarder").update({
      fweight: decision.anchorPatch.fweight, fvolume: decision.anchorPatch.fvolume,
      fwidth: decision.anchorPatch.fwidth, flength: decision.anchorPatch.flength, fheight: decision.anchorPatch.fheight,
      famount: decision.anchorPatch.famount,
      ftotalprice: decision.anchorPatch.ftotalprice, frefrate: decision.anchorPatch.frefrate, frefprice: decision.anchorPatch.frefprice,
      ...(decision.mode === "empty-bare" ? { fcosttotalprice: box1.fcosttotalprice ?? 0 } : {}),
      ...(adoptCab ? { fcabinetnumber: adoptCab } : {}),
      ...(adoptTt ? { ftransporttype: adoptTt } : {}),
      ...(adoptDate ? { fdatetothai: adoptDate } : {}),
      adminidupdate: "sys-absorb",
    }).eq("id", bare.id).eq("famount", bare.famount).in("fstatus", FILLABLE);
    q = decision.mode === "bare-priced" ? q.eq("ftotalprice", bare.ftotalprice) : q.lte("ftotalprice", 0);
    const { data: aRows, error: aErr } = await q.select("id");
    if (aErr || !aRows || aRows.length === 0) {
      for (const id of patched) await admin.from("tb_forwarder").update({ ftotalprice: 0, frefrate: 0, frefprice: "0" }).eq("id", id);
      console.error(`   🔴 anchor adopt failed (${aErr?.message ?? "raced"}) — shares reverted, group skipped`);
      flagged += 1; flaggedReport.push(`${label} → apply-anchor-failed`); continue;
    }

    // 3. delete "-1/n"
    const { data: dRows, error: dErr } = await admin.from("tb_forwarder").delete()
      .eq("id", decision.deleteSibId).eq("ftotalprice", box1.ftotalprice).in("fstatus", FILLABLE).select("id");
    if (dErr || !dRows || dRows.length === 0) {
      console.error(`   🔴 box-1 delete failed AFTER anchor adopt (fid ${decision.deleteSibId}) — MANUAL`);
      flagged += 1; flaggedReport.push(`${label} → apply-delete-failed (box-1 DOUBLE until manual)`); continue;
    }

    // 4. staging re-point (kill the dangling-ptr re-commit engine)
    const { error: rpErr } = await admin.from("momo_import_tracks")
      .update({ committed_forwarder_id: bare.id, updated_at: new Date().toISOString() })
      .eq("committed_forwarder_id", decision.deleteSibId);
    if (rpErr) console.error(`   ⚠ staging re-point failed: ${rpErr.message} (dangling ptr!)`);

    // 5. survivor dup-cost → 0
    if (dupCostIds.length > 0) {
      const { error: cErr } = await admin.from("tb_forwarder").update({ fcosttotalprice: 0 }).in("id", dupCostIds);
      if (cErr) console.error(`   ⚠ cost dedup failed: ${cErr.message}`);
    }
    absorbed += 1;
    console.log(`   ✅ absorbed`);
  }

  if (APPLY && backup.length > 0) {
    console.log(`\n💾 backup → ${BACKUP_FILE}`);
  }
  console.log(`\n=== residue groups: ${found} · ${APPLY ? "absorbed" : "would absorb"}: ${absorbed} · flagged: ${flagged} ===`);
  for (const f of flaggedReport) console.log(`  🚩 ${f}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
