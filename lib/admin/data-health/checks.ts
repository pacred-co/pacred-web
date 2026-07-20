/**
 * 🩺 DATA-HEALTH INVARIANT CHECKS — "ระบบ on green สม่ำเสมอ" (owner 2026-07-18).
 *
 * NOT "server-only" ON PURPOSE (mirrors lib/admin/pending-dispatch.ts): the module
 * holds no secret — the caller supplies the service-role client — so the CLI audit
 * (scripts/run-data-health.ts · tsx) and the unit tests can exercise it directly.
 *
 * Every check here encodes an invariant that a REAL past incident violated —
 * customers found those bugs before we did ("เอาลูกค้าจริงมาเป็นหนูลองยาได้ไง").
 * This module is the 4th defence layer: (1) write-path guards + (2) cron heals +
 * (3) one-off sweeps fixed each root; THIS layer continuously verifies the
 * invariants still hold on production and screams BEFORE a customer sees it.
 * Retrospective + class table: docs/wip/plan-2026-07-18-data-health-invariants.md.
 *
 * 100% READ-ONLY — no check writes anything, ever. Consumers:
 *   - /api/cron/data-health   (hourly · captureIncident per red check · stable fingerprint)
 *   - /admin/data-health      (live dashboard · super/ops/accounting)
 *
 * Design notes:
 *   - ONE shared paged scan of tb_forwarder feeds most checks (the table is small;
 *     every query here is bounded + fails visible — a check that ERRORS reports
 *     ok:false with the error, never a silent green).
 *   - Group(=shipment)-aware where a per-row rule would false-positive by design
 *     (e.g. cost lives ONCE on the split anchor → per-row cost/CBM is high there;
 *     the GROUP ratio is the true invariant).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { baseOf, suffixOf } from "@/lib/integrations/momo-web/split-box-rows-plan";
import { transportModeFromCabinetName } from "@/lib/forwarder/cabinet-transport";
import { totalCbmOf } from "@/lib/forwarder/quantities";
import { isNonContainerCabinetId } from "@/lib/forwarder/cabinet-class";
import { planStagingBacklinks, stagingFamilyWeights } from "@/lib/admin/backlink-staging-committed";
import { isMomoRoutingPlaceholder } from "@/lib/admin/momo-container-resolve";
import { resolveMomoBoxBasis } from "@/lib/integrations/momo-web/box-detail-basis";

export type HealthSeverity = "red" | "warn" | "info";

export type HealthCheckResult = {
  id: string;
  title: string;
  severity: HealthSeverity;
  /** เคยเกิดอะไรจริง + กระทบใคร — ภาษาคน (แสดงบน dashboard). */
  why: string;
  /** เจอแล้วทำไงต่อ. */
  action: string;
  ok: boolean;
  count: number;
  sample: Array<Record<string, unknown>>;
  /** The check itself failed to run — surfaced as NOT-ok (fail-visible, never silent green). */
  error?: string;
};

/** Live = a row that participates in operations/money (cleared/cancelled excluded). */
const DEAD_FSTATUS = new Set(["", "0", "99"]);

type FwdRow = {
  id: number;
  ftrackingchn: string;
  fstatus: string;
  paydeposit: string;
  fcredit: string;
  famount: number;
  famountcount: string | null;
  fweight: number;
  fvolume: number;
  ftotalprice: number;
  fcosttotalprice: number;
  fcabinetnumber: string;
  ftransporttype: string;
  fdatetothai: string;
  userid: string;
};

type HealthContext = {
  fwd: FwdRow[];
  /** LIVE rows grouped by base tracking. */
  groups: Map<string, FwdRow[]>;
};

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => String(v ?? "").trim();

async function loadContext(admin: SupabaseClient): Promise<HealthContext> {
  const fwd: FwdRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(
        "id, ftrackingchn, fstatus, paydeposit, fcredit, famount, famountcount, fweight, fvolume, ftotalprice, fcosttotalprice, fcabinetnumber, ftransporttype, fdatetothai, userid",
      )
      .range(from, from + 999);
    if (error) throw new Error(`tb_forwarder scan: ${error.code} ${error.message}`);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      fwd.push({
        id: Number(r.id),
        ftrackingchn: str(r.ftrackingchn),
        fstatus: str(r.fstatus),
        paydeposit: str(r.paydeposit),
        fcredit: str(r.fcredit),
        famount: num(r.famount),
        famountcount: r.famountcount == null ? null : String(r.famountcount),
        fweight: num(r.fweight),
        fvolume: num(r.fvolume),
        ftotalprice: num(r.ftotalprice),
        fcosttotalprice: num(r.fcosttotalprice),
        fcabinetnumber: str(r.fcabinetnumber),
        ftransporttype: str(r.ftransporttype),
        fdatetothai: str(r.fdatetothai),
        userid: str(r.userid),
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  const groups = new Map<string, FwdRow[]>();
  for (const r of fwd) {
    if (!r.ftrackingchn || DEAD_FSTATUS.has(r.fstatus)) continue;
    const b = baseOf(r.ftrackingchn);
    groups.set(b, [...(groups.get(b) ?? []), r]);
  }
  return { fwd, groups };
}

const cap = <T,>(arr: T[], n = 20): T[] => arr.slice(0, n);

// ─────────────────────────────────────────────────────────────────────────────
// The invariant registry. Each entry = one past-incident class.
// ─────────────────────────────────────────────────────────────────────────────

type CheckDef = {
  id: string;
  title: string;
  severity: HealthSeverity;
  why: string;
  action: string;
  run: (admin: SupabaseClient, ctx: HealthContext) => Promise<{ count: number; sample: Array<Record<string, unknown>> }>;
};

const CHECKS: CheckDef[] = [
  {
    id: "residue_half_split",
    title: "กลุ่มเบิ้ล: แถวรวมซ้อนแถวกล่อง (-1/n)",
    severity: "red",
    why: "PR050 519218029029 — MOMO re-key พัสดุกลางทาง ทำให้แถวรวม + แถวกล่องอยู่พร้อมกัน → กล่อง/น้ำหนัก/คิว/cost เบิ้ลทุกหน้าจอ (ลูกค้าเห็นด้วย)",
    action: "unbilled → cron pass-5 absorb เองภายในรอบถัดไป (ถ้าค้าง = ดู flag reason ใน log) · billed → บัญชีเคลียร์ (ห้าม auto)",
    run: async (_admin, ctx) => {
      const out: Array<Record<string, unknown>> = [];
      for (const [base, rows] of ctx.groups) {
        const bare = rows.find((r) => suffixOf(r.ftrackingchn) === 0);
        const sufs = rows.filter((r) => suffixOf(r.ftrackingchn) > 0);
        if (!bare || sufs.length === 0) continue;
        if (Math.min(...sufs.map((r) => suffixOf(r.ftrackingchn))) !== 1) continue;
        out.push({ base, userid: bare.userid, bareId: bare.id, bareWeight: bare.fweight, sufs: sufs.length });
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "dup_exact_tracking",
    title: "tracking ซ้ำ (แถว live >1 ต่อเลขเดียวกัน)",
    severity: "red",
    why: "2026-07-09/14 — re-sync สร้างแถวซ้ำ 21 แถว/19 เลข บางตัวนับเงิน 2-3 เท่า (1783582423 Σ2994kg vs จริง 2007)",
    action: "ห้ามบิลจนกว่าจะ reconcile — ใช้ scripts/reconcile-momo-dup-rows pattern (box_detail = ความจริง · dry-run ก่อน)",
    run: async (_admin, ctx) => {
      const byExact = new Map<string, FwdRow[]>();
      for (const rows of ctx.groups.values()) {
        for (const r of rows) byExact.set(r.ftrackingchn, [...(byExact.get(r.ftrackingchn) ?? []), r]);
      }
      const out: Array<Record<string, unknown>> = [];
      for (const [t, rows] of byExact) {
        if (rows.length > 1) out.push({ tracking: t, ids: rows.map((r) => r.id), userids: [...new Set(rows.map((r) => r.userid))] });
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "dangling_staging_ptr",
    title: "staging ชี้แถวที่ถูกลบ (เครื่องปั๊ม dup)",
    severity: "red",
    why: "Root 3 ของ 07-14 — committed_forwarder_id ชี้ id ที่หายไป → sync รอบถัดไปสร้างแถว billable ใหม่ = dup ไม่รู้จบ",
    action: "re-point ไปแถว survivor (scripts/repair-momo-staging-danglers pattern) — ห้ามปล่อยข้ามคืน",
    run: async (admin, ctx) => {
      const liveIds = new Set(ctx.fwd.map((r) => r.id));
      const out: Array<Record<string, unknown>> = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("momo_import_tracks")
          .select("id, momo_tracking_no, committed_forwarder_id")
          .not("committed_forwarder_id", "is", null)
          .range(from, from + 999);
        if (error) throw new Error(`${error.code} ${error.message}`);
        for (const r of (data ?? []) as Array<{ id: string; momo_tracking_no: string | null; committed_forwarder_id: number }>) {
          if (!liveIds.has(Number(r.committed_forwarder_id))) {
            out.push({ staging: r.id, tracking: r.momo_tracking_no, ptr: r.committed_forwarder_id });
          }
        }
        if ((data ?? []).length < 1000) break;
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "multi_container_shipment",
    title: "ชิปเม้นเดียวกระจาย >1 ตู้ (ตู้ผี)",
    severity: "warn",
    why: "PR050 — แถวรวมค้างตู้เรือ GZS ผี ส่วนกล่องจริงอยู่ตู้รถ GZE → ยอดต่อตู้ + สถานะตู้เพี้ยนทั้ง 2 ใบใน report-cnt",
    action: "ตรวจว่าตู้ไหนจริง (staging/box_detail/แต้ม) → แก้ fcabinetnumber แถวที่ผิด (เคารพ fcabinet_locked)",
    run: async (_admin, ctx) => {
      const out: Array<Record<string, unknown>> = [];
      for (const [base, rows] of ctx.groups) {
        if (rows.length < 2) continue;
        const cabs = [...new Set(rows.map((r) => r.fcabinetnumber).filter(Boolean))];
        if (cabs.length > 1) out.push({ base, userid: rows[0].userid, cabs, ids: rows.map((r) => r.id) });
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "cabinet_not_real_container",
    title: "ช่องเลขตู้ถือเลขกระสอบ/placeholder ค้าง (ไม่ใช่ตู้จริง)",
    severity: "red",
    why:
      "tier ต้องเป็น ตู้ ⊃ กระสอบ ⊃ ชิปเม้น — เลขกระสอบ (CBX…) หรือ placeholder รอบจัดส่งของ MOMO " +
      "(PR/MO/PCS+วันที่) ค้างในช่องตู้ = รายงานตู้โชว์ค่าที่ไม่ใช่ตู้. หมายเหตุ owner 2026-07-20: " +
      "เลขตู้ TTW/อี้อู (SEA0625-8211YW · 0717-7072 YW SEA) = ตู้จริง ใช้ตามที่ TTW ส่งมา ไม่นับเป็นปัญหา",
    action:
      "แก้ fcabinetnumber เป็นเลขตู้จริง (GZS/GZE/YW…/เลขตามใบปิดตู้ TTW) — ดูจาก MOMO Live/box_detail/packing · " +
      "write-guard (cabinet-class.ts) กันขาเข้าแล้ว แถวที่โผล่ที่นี่ = ของค้างก่อน guard หรือ placeholder ที่ MOMO ไม่เคยปิดตู้",
    run: async (_admin, ctx) => {
      // Calibrated on prod 2026-07-20: a MOMO ROUTING placeholder (PR/MO/PCS+date)
      // is ⏳-by-design while in transit (report-cnt shows "รอ MOMO ผูกเลขตู้จริง" ·
      // propagate cron heals it) → red only once arrived (fstatus>=4) with the
      // placeholder still there = the excuse expired. Sack (CBX…)/packing labels
      // (SEA0625-…) are ALWAYS red — those are human-keyed wrong-tier ids.
      const out = ctx.fwd
        .filter((r) => {
          if (r.fstatus === "99") return false; // cancelled — report-cnt excludes it (mig 0190)
          if (!isNonContainerCabinetId(r.fcabinetnumber)) return false;
          if (!isMomoRoutingPlaceholder(r.fcabinetnumber)) return true;
          return Number(r.fstatus) >= 4;
        })
        .map((r) => ({ id: r.id, tracking: r.ftrackingchn, userid: r.userid, cabinet: r.fcabinetnumber, fstatus: r.fstatus }));
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "staging_unstamped_live",
    title: "ตรวจตู้โชว์ 'ยังไม่เข้าระบบ' ทั้งที่มีแถว live ในระบบแล้ว",
    severity: "warn",
    why:
      "2026-07-20 — แถวเข้าระบบผ่าน box-split/คีย์มือ/แถวรวม ไม่เคยประทับ committed_at บน staging → " +
      "ตรวจตู้นับเป็นค้างนำเข้า + กด commit เด้ง 'มีในระบบแล้ว' ทุกรอบ (ไม่สำเร็จ 37 spam)",
    action:
      "sync pass 3.55 (backlinkStagingCommitted) จะประทับให้เองภายใน ~5 นาที — ถ้าค้างข้ามชั่วโมง = " +
      "heal พัง (ดู log scope staging_backlink) หรือ tracking ซ้ำหลายแถว (ดู check dup_exact_tracking)",
    run: async (admin, ctx) => {
      // ALL staging rows — committed ones feed the family value-coverage Σ
      // (the 2026-07-20 "กล่องหาย" guard) but are never re-matched.
      const staging: Array<{ id: string; tracking: string; weightKg: number; committed: boolean }> = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("momo_import_tracks")
          .select("id, momo_tracking_no, weight_kg, committed_at")
          .range(from, from + 999);
        if (error) throw new Error(`${error.code} ${error.message}`);
        for (const r of (data ?? []) as Array<{ id: string; momo_tracking_no: string | null; weight_kg: number | string | null; committed_at: string | null }>) {
          if (r.momo_tracking_no) {
            staging.push({
              id: String(r.id),
              tracking: String(r.momo_tracking_no),
              weightKg: num(r.weight_kg),
              committed: r.committed_at != null,
            });
          }
        }
        if ((data ?? []).length < 1000) break;
      }
      const plan = planStagingBacklinks(
        staging,
        ctx.fwd.map((r) => ({ id: r.id, tracking: r.ftrackingchn, fstatus: r.fstatus, userid: r.userid, fweight: r.fweight })),
      );
      // uncovered = the live family is SHORT this box's value — those belong to the
      // shipment_short_a_box red check, not here (this check tracks stamp-lag only).
      const out = plan.matches.map((m) => ({ staging: m.stagingId, tracking: m.tracking, fid: m.fid, kind: m.kind }));
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "aggregate_fanout_siblings",
    title: "แถวพี่น้องถือยอดรวมชิปเม้นซ้ำกัน (fanout เบิ้ล)",
    severity: "red",
    why:
      "2026-07-20 PR179 1783582423 — MOMO Live data-fill (ก่อนแก้) เขียนยอดรวมทั้งชิปเม้น (116 กล่อง/2,007kg/15.82คิว) " +
      "ลงทุกแถวย่อยของ split family → Σ ตู้บวม ~22 เท่า · ต้นทุนโชว์ ฿880k · กำไร −฿868k",
    action:
      "ต้นตอปิดแล้ว (fillLiveDataForParcels = family-aware · cron pass-6 converge ทรง proper-split ได้) — " +
      "แถวที่โผล่ = ของค้าง/ path ใหม่ที่หลุด → รัน scripts/heal-live-fanout-2026-07-20.ts pattern (plan-driven · dry-run ก่อน)",
    run: async (_admin, ctx) => {
      // signature: ≥2 LIVE siblings of one base sharing the EXACT (famount, fweight,
      // fvolume) trio with famount>1. famount=1 twins (same-size product boxes) are
      // legit — calibrated on prod 2026-07-20: only the real fanout family matched.
      const out: Array<Record<string, unknown>> = [];
      for (const [base, rows] of ctx.groups) {
        if (rows.length < 2) continue;
        const byTrio = new Map<string, FwdRow[]>();
        for (const r of rows) {
          if (r.famount <= 1 || r.fweight <= 0) continue;
          const k = `${r.famount}|${r.fweight}|${r.fvolume}`;
          byTrio.set(k, [...(byTrio.get(k) ?? []), r]);
        }
        for (const [trio, dup] of byTrio) {
          if (dup.length >= 2) {
            out.push({ base, userid: dup[0].userid, trio, rows: dup.length, ids: dup.map((d) => d.id).slice(0, 10) });
          }
        }
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "shipment_short_a_box",
    title: "ชิปเม้นถือน้ำหนักน้อยกว่า staging (กล่องหาย = เก็บเงินขาด)",
    severity: "red",
    why:
      "2026-07-20 — backlink sweep (ก่อน value-guard) ประทับกล่องที่ยังไม่เข้าระบบใส่แถวอื่น → กล่องหายจากคิวนำเข้า " +
      "ไม่เคยถูกคิดเงิน (PR208 1784190161 ขาด 38.5 กก. · 7 ครอบครัว · heal แล้วโดย scripts/heal-short-box-2026-07-20.ts). " +
      "ตรงข้ามกับ fanout: อันนั้นเบิ้ล อันนี้ขาด. วัดที่ VALUE (Σ น้ำหนัก) ไม่ใช่จำนวนแถว — แถวรวมที่ถือของครบไม่ใช่ปัญหา",
    action:
      "เพิ่มรายการที่ขาดผ่าน /admin/momo-containers (audited create path) หรือ heal-short-box pattern (dry-run ก่อน) — " +
      "ห้าม auto-create จาก cron · แถว billed (5/6/7) = บัญชีเคาะ",
    run: async (admin, ctx) => {
      // staging Σ weight per base — the value truth the live family must carry.
      // stagingFamilyWeights applies the AGGREGATE-HEADER rule (a staged bare that
      // ≈ Σ suffixed is a header, not an extra box) — else absorbed/box-split
      // families (519218029029 · JYM800120650588 · LJ20503022) false-flag at
      // exactly 2× (calibrated on prod 2026-07-20).
      const stagingRows: Array<{ tracking: string; weightKg: number }> = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("momo_import_tracks")
          .select("momo_tracking_no, weight_kg")
          .range(from, from + 999);
        if (error) throw new Error(`momo_import_tracks scan: ${error.code} ${error.message}`);
        const batch = (data ?? []) as Array<{ momo_tracking_no: string | null; weight_kg: number | string | null }>;
        for (const s of batch) {
          const t = str(s.momo_tracking_no);
          if (t) stagingRows.push({ tracking: t, weightKg: num(s.weight_kg) });
        }
        if (batch.length < 1000) break;
      }
      const stagingWt = stagingFamilyWeights(stagingRows);
      const out: Array<Record<string, unknown>> = [];
      for (const [base, rows] of ctx.groups) {
        const truth = stagingWt.get(base) ?? 0;
        if (truth <= 0) continue; // no staging signal → nothing provable
        const liveWt = rows.reduce((s, r) => s + r.fweight, 0);
        const shortBy = truth - liveWt;
        if (shortBy <= Math.max(0.5, truth * 0.02)) continue;
        out.push({
          base,
          userid: rows[0].userid,
          liveKg: Number(liveWt.toFixed(2)),
          stagingKg: Number(truth.toFixed(2)),
          shortKg: Number(shortBy.toFixed(2)),
          fstatus: [...new Set(rows.map((r) => r.fstatus))].join("/"),
        });
      }
      out.sort((a, b) => Number(b.shortKg) - Number(a.shortKg));
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "perbox_cbm_under_total_flag",
    title: "คิวต่อกล่องถูกเก็บใต้ธงยอดรวม (ต้นทุนตู้ต่ำกว่าจริง)",
    severity: "warn",
    why:
      "2026-07-20 — 3 แถว (52154/52422/52184) เก็บ fvolume = คิวต่อกล่อง แต่ famountcount='1' บอกว่าเป็นยอดรวม → " +
      "คิวรวมหาย ×famount → ต้นทุนตู้ต่ำกว่าจริง ≈฿8,064 (ขายคิดตามน้ำหนัก ลูกค้าไม่กระทบ · กำไรรายงานเกินจริง)",
    action:
      "fvolume → คิวรวมจริง (ต่อกล่อง×famount ยืนยันกับ box_detail dims) + recompute cost — " +
      "แถว unbilled แก้ได้เลย · แถว billed = ตาม fix-perbox-cbm-cost pattern (SELL ต้องไม่ขยับ · dry-run ก่อน)",
    run: async (admin, ctx) => {
      // box_detail per-box truth, keyed by the exact box tracking.
      const boxByTrack = new Map<string, { qty: number; perbox: number; total: number }>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("momo_box_detail")
          .select("box_tracking, width, length, height, weight_kg, cbm, quantity")
          .range(from, from + 999);
        if (error) throw new Error(`momo_box_detail scan: ${error.code} ${error.message}`);
        const batch = (data ?? []) as Array<Record<string, unknown>>;
        for (const b of batch) {
          const t = str(b.box_tracking);
          if (!t) continue;
          const basis = resolveMomoBoxBasis({
            width: num(b.width), length: num(b.length), height: num(b.height),
            weightKg: num(b.weight_kg), cbm: num(b.cbm), quantity: num(b.quantity),
          });
          if (!basis.decided || basis.pieces <= 0 || basis.totalCbm <= 0) continue;
          boxByTrack.set(t, { qty: basis.pieces, perbox: basis.totalCbm / basis.pieces, total: basis.totalCbm });
        }
        if (batch.length < 1000) break;
      }
      const out: Array<Record<string, unknown>> = [];
      for (const rows of ctx.groups.values()) {
        for (const r of rows) {
          if (r.famountcount !== "1" || r.famount <= 1 || r.fvolume <= 0) continue;
          const box = boxByTrack.get(r.ftrackingchn);
          if (!box || box.qty !== r.famount) continue;
          const looksPerBox = Math.abs(r.fvolume - box.perbox) <= Math.max(0.0005, box.perbox * 0.02);
          const clearlyUnderTotal = r.fvolume < box.total * 0.9;
          if (looksPerBox && clearlyUnderTotal) {
            out.push({
              id: r.id, tracking: r.ftrackingchn, userid: r.userid, fstatus: r.fstatus,
              fvolume: r.fvolume, trueTotal: Number(box.total.toFixed(6)), famount: r.famount,
            });
          }
        }
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "awaiting_payment_zero_price",
    title: "รอชำระเงิน (5) แต่ราคา ฿0 — เก็บเงินขาด",
    severity: "red",
    why: "แถวไม่ได้วัด/ไม่มีเรทถูกแจ้งหนี้ 'ยอดค้าง 0.00' → ลูกค้าจ่าย ฿0 = เงินหาย (Fix C 07-13 กันขาเข้าแล้ว — ตัวนี้จับของค้าง/หลุด)",
    action: "ตั้งเรท/วัดขนาด → re-price ก่อนเก็บเงิน (แถวเครดิตดูวงเงินประกอบ)",
    run: async (_admin, ctx) => {
      const out = ctx.fwd
        .filter((r) => r.fstatus === "5" && r.ftotalprice <= 0 && r.paydeposit !== "1")
        .map((r) => ({ id: r.id, tracking: r.ftrackingchn, userid: r.userid, weight: r.fweight, credit: r.fcredit }));
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "double_billed",
    title: "เก็บเงินซ้ำ: แถว/ชิปเม้นเดียว อยู่บน >1 ใบแจ้งหนี้ active",
    severity: "red",
    why: "PR107 1780555730 — กล่องบิลบน FRI2606-00013 + แถวรวมบิลแยกบน FRI2606-00024 (จ่ายแล้ว) = ของชุดเดียวเก็บ 2 ใบ",
    action: "บัญชี void ใบที่ซ้ำก่อนมีการตามเก็บ — ห้าม auto (เงิน frozen)",
    run: async (admin, ctx) => {
      const { data: items, error: itErr } = await admin
        .from("tb_forwarder_invoice_item")
        .select("invoice_id, forwarder_id")
        .limit(5000);
      if (itErr) throw new Error(`${itErr.code} ${itErr.message}`);
      const invIds = [...new Set((items ?? []).map((i) => (i as { invoice_id: number }).invoice_id))];
      const active = new Set<number>();
      for (let i = 0; i < invIds.length; i += 200) {
        const { data: invs, error: invErr } = await admin
          .from("tb_forwarder_invoice")
          .select("id, status")
          .in("id", invIds.slice(i, i + 200));
        if (invErr) throw new Error(`${invErr.code} ${invErr.message}`);
        for (const v of (invs ?? []) as Array<{ id: number; status: string | null }>) {
          if (str(v.status) !== "cancelled") active.add(v.id);
        }
      }
      const rowInvs = new Map<number, Set<number>>();
      for (const it of (items ?? []) as Array<{ invoice_id: number; forwarder_id: number }>) {
        if (!active.has(it.invoice_id)) continue;
        const s = rowInvs.get(it.forwarder_id) ?? new Set<number>();
        s.add(it.invoice_id);
        rowInvs.set(it.forwarder_id, s);
      }
      const out: Array<Record<string, unknown>> = [];
      // (a) one ROW on >1 active invoice
      for (const [fid, invs] of rowInvs) {
        if (invs.size > 1) out.push({ kind: "row", forwarderId: fid, invoices: [...invs] });
      }
      // (b) one SHIPMENT (base) covered by >1 active invoice — the cross-shape
      //     double-bill (aggregate on one bill · its boxes on another).
      const idToRow = new Map(ctx.fwd.map((r) => [r.id, r]));
      const baseInvs = new Map<string, Set<number>>();
      for (const [fid, invs] of rowInvs) {
        const row = idToRow.get(fid);
        if (!row?.ftrackingchn) continue;
        const b = baseOf(row.ftrackingchn);
        const s = baseInvs.get(b) ?? new Set<number>();
        for (const v of invs) s.add(v);
        baseInvs.set(b, s);
      }
      for (const [base, invs] of baseInvs) {
        if (invs.size <= 1) continue;
        // CALIBRATION (first prod run 2026-07-18): a base on >1 invoice is NOT
        // always a double-bill — 60527103087 = two DIFFERENT lots (bare 48pcs/624kg
        // + "-2" 12pcs/156kg) legitimately billed apart. The true double-bill
        // signature is the AGGREGATE-COVERS-BOXES overlap (1780555730: bare 104kg
        // ≈ Σ boxes 104kg billed separately). Flag only that overlap shape.
        const rows = ctx.groups.get(base) ?? [];
        const bare = rows.find((r) => suffixOf(r.ftrackingchn) === 0);
        const sufs = rows.filter((r) => suffixOf(r.ftrackingchn) > 0);
        if (!bare || sufs.length === 0) continue;
        const sufW = sufs.reduce((s, r) => s + r.fweight, 0);
        const overlap = bare.fweight > 0 && Math.abs(bare.fweight - sufW) / Math.max(bare.fweight, sufW) <= 0.1;
        if (overlap) out.push({ kind: "shipment", base, invoices: [...invs], bareWeight: bare.fweight, boxWeight: sufW });
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "credit_unsettled_after_paid",
    title: "ใบแจ้งหนี้จ่ายแล้ว แต่เครดิตยังค้าง (fcredit=1)",
    severity: "red",
    why: "Fix D 07-13 — จ่ายบิลเครดิตแล้ว order ค้าง fcredit → AR-aging นับผี + วงเงินลูกค้าไม่คืน (เครดิตไม่ซิงค์)",
    action: "ตรวจ markBillingRunPaid credit-settle log → เคลียร์ fcredit + ลด tb_credit ตาม canonical (actions/credit.ts)",
    run: async (admin, ctx) => {
      const { data: paidInvs, error: pErr } = await admin
        .from("tb_forwarder_invoice")
        .select("id, doc_no")
        .eq("status", "paid")
        .limit(1000);
      if (pErr) throw new Error(`${pErr.code} ${pErr.message}`);
      const paidIds = (paidInvs ?? []).map((v) => (v as { id: number }).id);
      if (paidIds.length === 0) return { count: 0, sample: [] };
      const fids = new Set<number>();
      for (let i = 0; i < paidIds.length; i += 200) {
        const { data: items, error: iErr } = await admin
          .from("tb_forwarder_invoice_item")
          .select("forwarder_id")
          .in("invoice_id", paidIds.slice(i, i + 200));
        if (iErr) throw new Error(`${iErr.code} ${iErr.message}`);
        for (const it of (items ?? []) as Array<{ forwarder_id: number }>) fids.add(it.forwarder_id);
      }
      const idToRow = new Map(ctx.fwd.map((r) => [r.id, r]));
      const out: Array<Record<string, unknown>> = [];
      for (const fid of fids) {
        const row = idToRow.get(fid);
        if (row && row.fcredit === "1") out.push({ forwarderId: fid, tracking: row.ftrackingchn, userid: row.userid });
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "group_cost_ratio",
    title: "cost ต่อชิปเม้นเกินเรทตู้ (cost มั่ว/เบิ้ล)",
    severity: "warn",
    why: "07-18 garbage cost (weight×rate หลุด · Σ−฿267k) + sibling แบก cost ทั้งชิปเม้นซ้ำ ×N → กำไรต่อตู้ติดลบปลอม",
    action: "recompute round2(Σfvolume × เรทตู้) — cost เป็นเงินภายใน (ไม่กระทบบิลลูกค้า) · ดู scripts/fix-garbage-momo-cost pattern",
    run: async (_admin, ctx) => {
      // Cost is SHIPMENT-level (anchor-only) → the invariant is the GROUP ratio,
      // never per-row (a split anchor's own cost/CBM is high BY DESIGN).
      const RATE: Record<string, number> = { "1": 4700, "2": 2500 };
      const TOL = 1.35;
      const out: Array<Record<string, unknown>> = [];
      for (const [base, rows] of ctx.groups) {
        const cost = rows.reduce((s, r) => s + r.fcosttotalprice, 0);
        // Σ row-TOTAL CBM (famountcount rule · quantities.ts SOT) — raw fvolume on a
        // per-box row under-sums ×famount → the ratio false-flags a correct cost.
        const vol = rows.reduce((s, r) => s + totalCbmOf(r), 0);
        if (!(cost > 0) || !(vol > 0)) continue;
        // Derive the mode from the container CODE (the SOT · GZS/YWS=sea "2" · GZE/YWE/EK=road
        // "1"), NOT the stored ftransporttype — a stale ftransporttype='2' on a GZE(road) tู้
        // used to false-flag a legit 4,700 road cost as "cost มั่ว". Fall back to the stored
        // field only when the code carries no mode token. TTW rates (อี้อู 2600/5300) sit inside
        // the 1.35× tolerance of MOMO 2500/4700, so no warehouse-specific rate is needed here.
        const modes = [...new Set(rows.map((r) => transportModeFromCabinetName(r.fcabinetnumber) ?? r.ftransporttype).filter(Boolean))];
        const rate = Math.max(...modes.map((t) => RATE[t] ?? 4700), 2500);
        const ratio = cost / vol;
        if (ratio > rate * TOL) {
          out.push({ base, userid: rows[0].userid, cost: Math.round(cost * 100) / 100, cbm: vol.toFixed(4), ratio: Math.round(ratio), rate });
        }
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "arrived_status_stuck",
    title: "ของถึงไทยแล้ว (fdatetothai) แต่สถานะค้าง <4 เกิน 3 วัน",
    severity: "warn",
    why: "สถานะไม่เดิน = ลูกค้าเห็น 'กำลังส่งมาไทย' ทั้งที่ของถึงแล้ว → ไม่ถูกตั้งราคา/แจ้งหนี้/จัดส่งต่อ (คลาสเดียวกับ P22314)",
    action: "โกดังยิงรับเข้าไทย (arrive-th scan) หรือตรวจว่าทำไม scan ไม่ flip (ดู transition matrix)",
    run: async (_admin, ctx) => {
      const cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const out = ctx.fwd
        .filter((r) => {
          if (DEAD_FSTATUS.has(r.fstatus)) return false;
          if (!["1", "2", "3"].includes(r.fstatus)) return false;
          const d = r.fdatetothai;
          return d && d !== "0000-00-00" && d.slice(0, 10) <= cutoff;
        })
        .map((r) => ({ id: r.id, tracking: r.ftrackingchn, userid: r.userid, fstatus: r.fstatus, arrived: r.fdatetothai }));
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "dispatch_blocked_g6",
    title: "เตรียมส่ง (6) + paydeposit=1 → หายจากคิวมอบงานคนขับ (G6)",
    severity: "info",
    why: "legacy paydeposit gate ตัดแถวนี้ออกจากคิวจัดรถ — advance-paid rows ค้างไม่ถูกส่ง (G6 · รอ owner เคาะ semantic)",
    action: "ถ้าแถวควรออกรถ: เคลียร์ paydeposit ผ่านหน้าแอดมิน หรือรอ G6 resolution",
    run: async (_admin, ctx) => {
      const out = ctx.fwd
        .filter((r) => r.fstatus === "6" && r.paydeposit === "1")
        .map((r) => ({ id: r.id, tracking: r.ftrackingchn, userid: r.userid }));
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "empty_bare_headers",
    title: "แถวหัวเปล่า (0kg/0กล่อง) ซ้อนแถวกล่อง",
    severity: "info",
    why: "re-key header ที่ไม่มีข้อมูล — display ตัดออกแล้ว (countableGroupMembers) แต่เป็นขยะข้อมูล + สถานะแถวผีอาจค้าง",
    action: "cron absorb (empty-bare swap) เก็บเองเมื่อ unbilled — ถ้าค้างนาน ดู flag reason",
    run: async (_admin, ctx) => {
      const out: Array<Record<string, unknown>> = [];
      for (const [base, rows] of ctx.groups) {
        const bare = rows.find((r) => suffixOf(r.ftrackingchn) === 0);
        const sufs = rows.filter((r) => suffixOf(r.ftrackingchn) > 0);
        if (!bare || sufs.length === 0) continue;
        if (bare.fweight <= 0 && bare.famount <= 0 && bare.ftotalprice <= 0) {
          out.push({ base, userid: bare.userid, bareId: bare.id, sufs: sufs.length });
        }
      }
      return { count: out.length, sample: cap(out) };
    },
  },
  {
    id: "shop_status_drift",
    title: "ฝากสั่งซื้อสถานะค้าง ทั้งที่ของนำเข้าถึงไทยแล้ว",
    severity: "warn",
    why: "PR999/P22314/P22328 คลาส — shop order ค้าง 4/40 ทั้งที่ forwarder เดินไปแล้ว (trigger 0235 ควร re-derive · drift = trigger หลุด)",
    action: "ตรวจ trigger advance_shop_order_on_forwarder_arrival + รัน recompute-shop-order-status script",
    run: async (admin, ctx) => {
      const { data: heads, error: hErr } = await admin
        .from("tb_header_order")
        .select("hno, hstatus")
        .in("hstatus", ["4", "40"])
        .limit(500);
      if (hErr) throw new Error(`${hErr.code} ${hErr.message}`);
      const hnos = (heads ?? []).map((h) => (h as { hno: string }).hno);
      if (hnos.length === 0) return { count: 0, sample: [] };
      const byTracking = new Map<string, FwdRow[]>();
      for (const r of ctx.fwd) {
        if (!r.ftrackingchn || DEAD_FSTATUS.has(r.fstatus)) continue;
        byTracking.set(r.ftrackingchn, [...(byTracking.get(r.ftrackingchn) ?? []), r]);
        const b = baseOf(r.ftrackingchn);
        if (b !== r.ftrackingchn) byTracking.set(b, [...(byTracking.get(b) ?? []), r]);
      }
      const out: Array<Record<string, unknown>> = [];
      for (let i = 0; i < hnos.length; i += 200) {
        const { data: orders, error: oErr } = await admin
          .from("tb_order")
          .select("hno, ctrackingnumber")
          .in("hno", hnos.slice(i, i + 200))
          .neq("ctrackingnumber", "");
        if (oErr) throw new Error(`${oErr.code} ${oErr.message}`);
        const byHno = new Map<string, string[]>();
        for (const o of (orders ?? []) as Array<{ hno: string; ctrackingnumber: string }>) {
          byHno.set(o.hno, [...(byHno.get(o.hno) ?? []), str(o.ctrackingnumber)]);
        }
        for (const [hno, tracks] of byHno) {
          if (tracks.length === 0) continue;
          const matched = tracks.map((t) => byTracking.get(t) ?? []).filter((m) => m.length > 0);
          if (matched.length !== tracks.length) continue; // some tracking not in system → not judgeable
          // Conservative: EVERY linked forwarder already arrived TH (≥4) → the shop
          // order should have completed ('5') long ago.
          const allArrived = matched.every((rows) => rows.every((r) => Number(r.fstatus) >= 4));
          if (allArrived) out.push({ hno, tracks: tracks.length });
        }
      }
      return { count: out.length, sample: cap(out) };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export type DataHealthReport = {
  ranAt: string;
  results: HealthCheckResult[];
  redCount: number;
  warnCount: number;
  infoCount: number;
  /** true = every red check is clean (warn/info may have rows). */
  green: boolean;
};

/** Pure — summarise results (unit-tested). */
export function summarizeHealth(results: HealthCheckResult[], ranAt: string): DataHealthReport {
  const failing = (sev: HealthSeverity) => results.filter((r) => r.severity === sev && !r.ok).length;
  const redCount = failing("red");
  return {
    ranAt,
    results,
    redCount,
    warnCount: failing("warn"),
    infoCount: failing("info"),
    green: redCount === 0,
  };
}

export async function runDataHealthChecks(admin: SupabaseClient): Promise<DataHealthReport> {
  const ranAt = new Date().toISOString();
  let ctx: HealthContext;
  try {
    ctx = await loadContext(admin);
  } catch (e) {
    // The shared scan failed → EVERY check reports the failure (fail-visible).
    const msg = e instanceof Error ? e.message : String(e);
    const results = CHECKS.map((c) => ({
      id: c.id, title: c.title, severity: c.severity, why: c.why, action: c.action,
      ok: false, count: 0, sample: [], error: `context: ${msg}`,
    }));
    return summarizeHealth(results, ranAt);
  }
  const results: HealthCheckResult[] = [];
  for (const c of CHECKS) {
    try {
      const { count, sample } = await c.run(admin, ctx);
      results.push({
        id: c.id, title: c.title, severity: c.severity, why: c.why, action: c.action,
        ok: count === 0, count, sample,
      });
    } catch (e) {
      results.push({
        id: c.id, title: c.title, severity: c.severity, why: c.why, action: c.action,
        ok: false, count: 0, sample: [], error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return summarizeHealth(results, ranAt);
}
