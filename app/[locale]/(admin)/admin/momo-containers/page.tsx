/**
 * /admin/momo-containers — MOMO sync/ingest workspace (ภูม 2026-07-14 · rework).
 *
 * พี่ป๊อป/ภูม: หน้านี้ = ตรวจข้อมูลก่อน "นำเข้าระบบ" — ทั้ง MOMO API และ packing list.
 * ข้อมูลมาเป็น "รายแทรคกิ้งลูกค้า" → ตารางยึด **แทรคกิ้ง = 1 แถว** (แบบ Import Track
 * ในหน้า /sync) ไม่ใช่ยึดตู้. ตรวจแต่ละแทรค (PR/น้ำหนัก/คิว/ขนส่ง/ประเภท) → กดปุ่ม
 * "นำเข้าระบบ" (พรีวิว+ยืนยัน) → INSERT ลง tb_forwarder (wrap commitMomoRowToForwarder).
 *
 * Server side: อ่าน momo_import_tracks (committed + pending · per tracking) + prefill
 * PR จาก MOMO member_code + validate tb_users. กดเลขตู้ → หน้า detail (เก็บไว้).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { momoTypeToProductType } from "@/lib/admin/momo-live-discovery-plan";
import { deriveMomoMemberCode, baseTrackingOf, aggregateTrackDetailMetrics } from "@/lib/admin/momo-raw-helpers";
import { deriveMomoBoxConsistency, type BoxConsistencyInput } from "@/lib/admin/momo-box-consistency";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import type { PackingUploadSnapshot } from "@/actions/admin/momo-packing-history";
import { MomoIngestClient, type IngestTrack, type IngestBoxRow, type MissingParcel } from "./momo-containers-client";
import { MomoGuideButton } from "./momo-guide-button";

export const dynamic = "force-dynamic";

// owner 2026-07-20 "ยุบให้เหลือ hub + แพคกิ้งลิส" — drift (iTAM ตาย) + review (ซ้ำ
// กับ hub นี้) ถูก retire เป็น redirect แล้ว; เหลือเครื่องมือที่ใช้จริง 3 ปุ่ม.
// owner 2026-07-21 "ทำปุ่มทางเข้าไปหน้า MOMO Live ให้ที · อยู่ในหน้าเดียวของเรานั่นแหละ
// แค่เพิ่มปุ่มทางเข้า" — MOMO Live = เว็บของ MOMO เอง (momocargo.com) ที่พนักงานเปิดไป
// ดู/ชั่งของจริงฝั่งจีน. หน้า /admin/api-forwarder-momo/live ภายในถูกยุบเข้า hub นี้แล้ว
// (2026-07-20) จึงลิงก์ออกเว็บนอกตรงๆ · เปิดแท็บใหม่ (พนักงานไม่เสียหน้าตรวจตู้ที่ค้างอยู่).
const MOMO_LIVE_URL = "https://www.momocargo.com/";
const HUB_LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: "/admin/api-forwarder-momo/sync", label: "📥 Sync จาก MOMO API" },
  { href: "/admin/api-forwarder-momo/packing-upload", label: "📦 อัพ packing list (จาก MOMO)" },
  { href: "/admin/api-forwarder-momo/manual", label: "✍️ เพิ่มงานเอง (manual)" },
  { href: MOMO_LIVE_URL, label: "🌐 เปิด MOMO Live (เว็บ MOMO)", external: true },
];

/** momo_box_detail rows → the display box sub-rows (sorted by box number · per-box TOTAL
 *  metrics). Only a genuinely multi-box tracking (>1) expands; single-box stays 1 row. */
function displayBoxesOf(boxes: BoxConsistencyInput[] | undefined): IngestBoxRow[] {
  if (!boxes || boxes.length <= 1) return [];
  const suffix = (t: string) => { const m = /-(\d+)/.exec(t); return m ? Number(m[1]) : 0; };
  return [...boxes]
    .sort((a, b) => (suffix(a.boxTracking) - suffix(b.boxTracking)) || a.boxTracking.localeCompare(b.boxTracking))
    .map((b) => {
      const q = Math.max(1, Math.round(Number(b.quantity) || 1));
      return {
        tracking: b.boxTracking,
        weight: Number(((Number(b.weightKgPerPiece) || 0) * q).toFixed(2)),
        cbm: Number(((Number(b.cbmPerPiece) || 0) * q).toFixed(6)),
        w: Number(b.width) || 0, l: Number(b.length) || 0, h: Number(b.height) || 0, qty: q,
      };
    });
}

export default async function MomoContainersPage() {
  await requireAdmin(["super", "ops", "warehouse"]);
  const admin = createAdminClient();

  // Every MOMO-synced tracking (committed + pending), newest-sync first.
  // weight_kg/cbm/quantity = the container_closed AGGREGATE (Σ of the shipment's
  // boxes) — the SAME values commitMomoRowCore values the row from; show these so
  // the grid matches what will be billed (fall back to first-box raw when empty).
  const { data: rowsRaw, error } = await admin
    .from("momo_import_tracks")
    .select(
      "id, momo_tracking_no, momo_container_no, container_batch_no, momo_sack_no, shipment_status, phase, admin_status_text, raw, weight_kg, cbm, quantity, committed_at, committed_forwarder_id, commit_userid, last_synced_at",
    )
    .order("last_synced_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("[momo-containers ingest list] failed", { code: error.code, message: error.message });
  }

  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const intermediate = (rowsRaw ?? []).map((row) => {
    const raw = row.raw as Record<string, unknown> | null;
    const str = (k: string): string | null =>
      raw && typeof raw === "object" && typeof raw[k] === "string" ? (raw[k] as string) : null;
    const numFromRaw = (k: string): number => (raw && typeof raw === "object" ? num(raw[k]) : 0);

    const userGroupRaw = str("user_group");
    const userCodeRaw = str("user_code");
    const guessedUserId =
      userGroupRaw && userCodeRaw ? deriveMomoMemberCode(userGroupRaw, userCodeRaw) : null;

    // column-first, raw-fallback (mirror commitMomoRowCore's valuation).
    const colW = num(row.weight_kg);
    const colV = num(row.cbm);
    const colQ = num(row.quantity);

    const images: string[] =
      raw && typeof raw === "object" && Array.isArray(raw.images)
        ? raw.images.filter((u): u is string => typeof u === "string" && u.length > 0)
        : [];

    return {
      id: row.id as string,
      tracking: row.momo_tracking_no ?? null,
      container: (row.container_batch_no as string | null) ?? null, // real cabinet (GZS/GZE)
      transport: resolveTransportMode((row.container_batch_no as string | null) ?? "", null),
      routingBatch: row.momo_container_no ?? null,                   // MOMO routing batch (audit)
      sack: row.momo_sack_no ?? null,
      status: row.shipment_status ?? null,
      phase: row.phase ?? null,
      adminStatusText: (row.admin_status_text as string | null) ?? null,
      guessedUserId,
      // packing-list (Shipment Report) columns MOMO DOES feed — the grid mirrors
      // แต้ม's sheet layout (owner ปอน 2026-07-14 · CANON in lib/admin/taem-reconcile-parser).
      smDate: str("created_date"),        // C "SM Date" — วันที่ MOMO รับเข้าโกดัง
      userCode: userCodeRaw,              // I "Code" — รหัสลูกค้าฝั่ง MOMO (ที่ derive เป็น PR)
      cgNo: str("CG_NO"),                 // T "CG." — เลข CG ของ MOMO
      // V "Service fee." — MOMO ส่งมาเป็น extra_cost (ค่าตีลังไม้/ค่าใช้จ่ายเพิ่ม · extractCrateFromMomoRaw)
      serviceFee: raw && typeof raw === "object" && raw.extra_cost != null ? num(raw.extra_cost) : null,
      guessedShipBy: str("ship_by"),
      guessedProductType: momoTypeToProductType(str("type")),
      momoType: str("type") || null, // raw MOMO type — labels stay distinct (อย. ≠ น้ำยา)
      qty: colQ > 0 ? colQ : (numFromRaw("quantity") || null),
      weightKg: colW > 0 ? colW : numFromRaw("kg"),
      cbm: colV > 0 ? colV : numFromRaw("cbm"),
      width: numFromRaw("width"),
      length: numFromRaw("length"),
      height: numFromRaw("height"),
      images,
      committed: !!row.committed_at,
      committedForwarderId: (row.committed_forwarder_id as number | null) ?? null,
      commitUserId: (row.commit_userid as string | null) ?? null,
      committedAt: (row.committed_at as string | null) ?? null,
      lastSyncedAt: row.last_synced_at ?? null,
    };
  });

  // Bulk pre-validate guessed PRs against tb_users (so the grid shows
  // "ไม่มีในระบบ" before the admin clicks import — bug 2a lesson from review).
  const candidateIds = Array.from(
    new Set(
      intermediate
        .map((r) => r.guessedUserId)
        .filter((v): v is string => typeof v === "string" && /^PR\d+$/i.test(v))
        .map((v) => v.toUpperCase()),
    ),
  );
  let knownUserIds = new Set<string>();
  if (candidateIds.length > 0) {
    const { data: existingUsers, error: usersErr } = await admin
      .from("tb_users")
      .select("userID")
      .in("userID", candidateIds);
    if (usersErr) console.error("[momo-containers tb_users pre-validate] failed", usersErr);
    else if (existingUsers)
      knownUserIds = new Set(
        (existingUsers as Array<{ userID: string | null }>)
          .map((u) => u.userID)
          .filter((v): v is string => !!v),
      );
  }

  // ตู้ทั้งหมดที่โผล่ในลิสต์ — ใช้ร่วมกัน 2 อย่างข้างล่าง (packing match + ETD/ETA)
  const containers = [...new Set(intermediate.map((r) => r.container).filter((c): c is string => !!c))];

  // Packing-list match (Slice 2 · ภูม) — เทียบ API vs Packing ต่อแทรค. Load the latest
  // packing upload for each container present, aggregate the snapshot rows by base
  // tracking → a map. weight_kg above is the SHIPMENT aggregate (same basis the
  // packing baseTracking uses), so the compare in the client is apples-to-apples.
  const packingByBase = new Map<string, { weight: number | null; cbm: number | null; boxes: number | null; code: string | null; container: string }>();
  if (containers.length > 0) {
    const { data: pkUploads, error: pkErr } = await admin
      .from("momo_packing_upload")
      .select("container_no, parsed_snapshot, uploaded_at")
      .in("container_no", containers)
      .order("uploaded_at", { ascending: false })
      .limit(500);
    if (pkErr) console.error("[momo-containers packing load] failed", { code: pkErr.code, message: pkErr.message });
    const seenContainer = new Set<string>();
    for (const up of (pkUploads ?? []) as Array<{ container_no: string | null; parsed_snapshot: unknown }>) {
      const cab = (up.container_no ?? "").trim();
      if (cab && seenContainer.has(cab)) continue; // ordered desc → first per container = latest
      if (cab) seenContainer.add(cab);
      const snap = (up.parsed_snapshot as PackingUploadSnapshot | null) ?? null;
      for (const row of snap?.rows ?? []) {
        const b = baseTrackingOf(row.baseTracking ?? "");
        if (!b || packingByBase.has(b)) continue; // latest upload wins
        packingByBase.set(b, { weight: row.weight, cbm: row.cbm, boxes: row.boxes, code: row.code, container: cab });
      }
    }
  }

  // ETD/ETA (cols Y/Z ของ packing list · ปอน) — MOMO API ไม่ส่งมาต่อแทรค · เก็บอยู่ระดับ "ตู้"
  // จากไฟล์ packing list ของแต้ม (taem_container_etd_eta · mig 0195 · แต้ม-primary).
  // ว่างจนกว่าจะอัพ packing list ของตู้นั้น → fail-soft (ตารางไม่พังถ้า query มีปัญหา).
  const etaByCabinet = new Map<string, { etd: string | null; eta: string | null }>();
  if (containers.length > 0) {
    const { data: etaRows, error: etaErr } = await admin
      .from("taem_container_etd_eta")
      .select("container_no, etd, eta")
      .in("container_no", containers);
    if (etaErr) console.error("[momo-containers etd/eta] failed", { code: etaErr.code, message: etaErr.message });
    else
      for (const row of (etaRows ?? []) as Array<{ container_no: string; etd: string | null; eta: string | null }>)
        etaByCabinet.set(row.container_no, { etd: row.etd, eta: row.eta });
  }

  // MOMO Live match (เฟส B) — the closed-container manifest (track_details) is the
  // MOST complete source: it lists every parcel MOMO knows, even ones the API feed
  // dropped. Read the CACHED momo_container_closed (cron pulls Live ~ทุก 5 นาที) →
  // aggregate track_details by base tracking (Σ across split parcels · reuse the
  // proven helper) → a base→{kg,cbm} map. Fast (DB read, no scrape) + apples-to-apples.
  const liveByBase = new Map<string, { weight: number | null; cbm: number | null }>();
  {
    const { data: ccRows, error: ccErr } = await admin
      .from("momo_container_closed")
      .select("raw")
      .order("last_synced_at", { ascending: false })
      .limit(400);
    if (ccErr) console.error("[momo-containers live load] failed", { code: ccErr.code, message: ccErr.message });
    for (const cc of (ccRows ?? []) as Array<{ raw: unknown }>) {
      const td = cc.raw && typeof cc.raw === "object" ? (cc.raw as Record<string, unknown>).track_details : null;
      const agg = aggregateTrackDetailMetrics(Array.isArray(td) ? td : []);
      for (const [key, m] of Object.entries(agg)) {
        if (key !== baseTrackingOf(key)) continue; // keep only the base/aggregate entries (Σ)
        if (liveByBase.has(key)) continue; // ordered desc → latest container-close wins
        liveByBase.set(key, { weight: m.kg || null, cbm: m.cbm || null });
      }
    }
  }

  // ── box_detail load — SHARED by the 🚩 "MOMO มั่ว" flag AND the box-row expansion
  // (owner/ภูม 2026-07-15: กางกล่องย่อยของ MOMO ออกเป็นแถวจริงใต้แถวหลัก ให้ตรงกับ MOMO Live
  // 1:1 — ตรวจง่าย + พิสูจน์ว่าดึง Live มาถูก). Loaded ONCE, chunked (avoid a huge IN list). ──
  const allBases = [...new Set(intermediate.map((r) => (r.tracking ? baseTrackingOf(r.tracking) : "")).filter(Boolean))];
  const boxesByBase = new Map<string, BoxConsistencyInput[]>();
  // ── LIVE truth per base (owner 2026-07-19 "ทำไม Live ตรงกว่า · ใครมานั่งเช็ค") ──
  // The import/track API feed goes STALE once a parcel advances (MOMO drops it), but
  // momo_box_detail is refreshed from the MOMO **Live web boards** — it knows the
  // CURRENT container / member-code / status. Collect it here and use it as the
  // FALLBACK for staging blanks so the page reconciles automatically (no human
  // cross-checking the Live page).
  const liveMetaByBase = new Map<string, { container: string; memberCode: string; statusText: string }>();
  {
    const CHUNK = 300;
    for (let i = 0; i < allBases.length; i += CHUNK) {
      const slice = allBases.slice(i, i + CHUNK);
      const { data: bd, error: bdErr } = await admin
        .from("momo_box_detail")
        .select("base_tracking, box_tracking, weight_kg, cbm, width, length, height, quantity, container_name, member_code, status_text")
        .in("base_tracking", slice);
      if (bdErr) { console.error("[momo-containers box_detail] failed", { code: bdErr.code, message: bdErr.message }); continue; }
      for (const r of (bd ?? []) as Array<Record<string, number | string | null>>) {
        const b = String(r.base_tracking ?? "").trim();
        if (!b) continue;
        const arr = boxesByBase.get(b) ?? [];
        arr.push({
          boxTracking: String(r.box_tracking ?? "").trim(),
          weightKgPerPiece: num(r.weight_kg), cbmPerPiece: num(r.cbm),
          width: num(r.width), length: num(r.length), height: num(r.height), quantity: num(r.quantity),
        });
        boxesByBase.set(b, arr);
        // live meta — first non-empty value per base wins (rows share the shipment's values)
        const lm = liveMetaByBase.get(b) ?? { container: "", memberCode: "", statusText: "" };
        if (!lm.container && r.container_name) lm.container = String(r.container_name).trim();
        if (!lm.memberCode && r.member_code) lm.memberCode = String(r.member_code).trim();
        if (!lm.statusText && r.status_text) lm.statusText = String(r.status_text).trim();
        liveMetaByBase.set(b, lm);
      }
    }
  }

  // 🚩 "MOMO มั่ว" (owner/ภูม 2026-07-15) — a base whose momo_box_detail (>1 box)
  // contradicts its MOMO aggregate weight/คิว AND whose dims can't reconcile → the
  // auto box-split refuses it → the row needs a real แต้ม packing list. Already-split
  // shipments (a base with sibling tb_forwarder rows) are SKIPPED — they're resolved,
  // and the split reduces the anchor weight so a naive compare would false-flag them.
  // See lib/admin/momo-box-consistency.ts (mirrors planBoxRowSplit).
  const garbageByBase = new Map<string, IngestTrack["momoGarbage"]>();
  if (allBases.length > 0 && boxesByBase.size > 0) {
    {
      // Load the tb_forwarder rows for these bases (BARE + "<base>-N" siblings) so we can
      // (a) DETECT a split — a base with >1 row was already split → resolved → skip — and
      // (b) use the BARE aggregate's fweight/fvolume as the reference (the value that will
      // be BILLED), consistent with the detail page + the robust reconcile. This is
      // SUFFIX-based (robust) not cabinet-scoped: box-split siblings can sit in an
      // uncabineted / different cabinet than the ingest row's container_batch_no, so a
      // cabinet-scoped count under-detects splits and mass over-flags (verified DEV: 105
      // vs a true 1). Chunked `.or()` keeps each URL bounded.
      const rowCountByBase = new Map<string, number>();
      const bareByBase = new Map<string, { w: number; c: number }>();
      const OR_CHUNK = 40;
      for (let i = 0; i < allBases.length; i += OR_CHUNK) {
        const slice = allBases.slice(i, i + OR_CHUNK);
        const orFilter = slice.flatMap((b) => [`ftrackingchn.eq.${b}`, `ftrackingchn.like.${b}-*`]).join(",");
        const { data: fw, error: fwErr } = await admin
          .from("tb_forwarder").select("ftrackingchn, fweight, fvolume").or(orFilter).limit(6000);
        if (fwErr) { console.error("[momo-containers split-detect] failed", { code: fwErr.code, message: fwErr.message }); continue; }
        for (const r of (fw ?? []) as Array<{ ftrackingchn: string | null; fweight: number | string | null; fvolume: number | string | null }>) {
          const ftk = (r.ftrackingchn ?? "").trim();
          const b = baseTrackingOf(ftk);
          if (!b) continue;
          rowCountByBase.set(b, (rowCountByBase.get(b) ?? 0) + 1);
          if (ftk === b) bareByBase.set(b, { w: num(r.fweight), c: num(r.fvolume) }); // the bare aggregate row
        }
      }
      // fallback aggregate for a PENDING base (no tb_forwarder row yet) = the MOMO ingest value.
      const momoAggByBase = new Map<string, { w: number; c: number }>();
      for (const r of intermediate) {
        const b = r.tracking ? baseTrackingOf(r.tracking) : "";
        if (b && !momoAggByBase.has(b)) momoAggByBase.set(b, { w: r.weightKg, c: r.cbm });
      }
      for (const [b, boxes] of boxesByBase) {
        if (boxes.length <= 1) continue;
        if ((rowCountByBase.get(b) ?? 0) > 1) continue; // already split (>1 tb_forwarder row) → skip
        const agg = bareByBase.get(b) ?? momoAggByBase.get(b);
        if (!agg) continue;
        const v = deriveMomoBoxConsistency({ fweight: agg.w, fvolume: agg.c }, boxes);
        if (v.garbage && v.reason) {
          garbageByBase.set(b, {
            reason: v.reason, boxCount: v.boxCount,
            boxWeightSum: v.boxWeightSum, aggWeight: v.aggWeight, boxCbmSum: v.boxCbmSum, aggCbm: v.aggCbm,
          });
        }
      }
    }
  }

  const tracks: IngestTrack[] = intermediate.map((r) => {
    const base = r.tracking ? baseTrackingOf(r.tracking) : "";
    const pk = base ? packingByBase.get(base) : undefined;
    const lv = base ? liveByBase.get(base) : undefined;
    // LIVE fallback (see liveMetaByBase above): staging blanks fill from the Live
    // web-board truth — container ("ยังไม่เข้าตู้ปิด" that Live already assigned),
    // PR ("MOMO ไม่ส่ง PR" rows whose Live board carries the member code).
    const lm = base ? liveMetaByBase.get(base) : undefined;
    const mergedContainer = r.container || (lm?.container ?? null);
    const mergedUserId = r.guessedUserId || (lm?.memberCode ? lm.memberCode.toUpperCase() : null);
    return {
      ...r,
      container: mergedContainer,
      // ── transport re-derive (owner 2026-07-20 "ตู้มา GZS ทำไมยังขึ้นรถ") ──
      // the early mapping derived mode from container_batch_no which is NULL for
      // Live-merged rows → defaulted "1" รถ even when ship_by=ship. SOT order:
      // ชื่อตู้ชนะเสมอ (GZS/YWS/SEA=เรือ · GZE/YWE/EK=รถ · GZA/YWA/AIR=อากาศ ·
      // cabinet-transport) → else MOMO ship_by → else รถ.
      transport: resolveTransportMode(
        mergedContainer ?? "",
        r.guessedShipBy === "ship" ? "2" : r.guessedShipBy === "air" ? "3" : r.guessedShipBy === "car" ? "1" : null,
      ),
      guessedUserId: mergedUserId,
      userIdValid: mergedUserId == null ? null : knownUserIds.has(mergedUserId.toUpperCase()),
      hasPacking: !!pk,
      packingWeight: pk?.weight ?? null,
      packingCbm: pk?.cbm ?? null,
      packingBoxes: pk?.boxes ?? null,
      hasLive: !!lv,
      liveWeight: lv?.weight ?? null,
      liveCbm: lv?.cbm ?? null,
      momoGarbage: base ? garbageByBase.get(base) ?? null : null,
      boxes: displayBoxesOf(base ? boxesByBase.get(base) : undefined),
      etd: (mergedContainer && etaByCabinet.get(mergedContainer)?.etd) || null,
      eta: (mergedContainer && etaByCabinet.get(mergedContainer)?.eta) || null,
    };
  });

  // เฟส C — พัสดุขาด: bases in the packing list but NOT in the MOMO API feed
  // (MOMO API drops advanced parcels · the ฿294k recovery). Packing carries the PR
  // (member code) + cabinet + weight/cbm → enough to CREATE via the proven, guarded
  // addMissingMomoParcel. Live-only-missing (no PR) is out of scope here (→ /drift page).
  const apiBases = new Set(intermediate.map((r) => (r.tracking ? baseTrackingOf(r.tracking) : "")).filter(Boolean));
  const missing: MissingParcel[] = [];
  for (const [base, pk] of packingByBase) {
    if (apiBases.has(base) || !pk.container) continue;
    missing.push({
      tracking: base,
      cabinet: pk.container,
      code: pk.code,
      weight: pk.weight,
      cbm: pk.cbm,
      boxes: pk.boxes,
      inLive: liveByBase.has(base),
    });
  }
  missing.sort((a, b) => a.cabinet.localeCompare(b.cabinet));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-5">
      <header className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">ADMIN · MOMO · sync / นำเข้าระบบ</div>
        <h1 className="text-2xl font-bold">MOMO — ตรวจข้อมูล + นำเข้าระบบ (รายแทรคกิ้ง)</h1>
        <p className="text-sm text-muted leading-relaxed">
          ข้อมูลจาก <strong>MOMO API</strong> (และ packing list) มาเป็น <strong>รายแทรคกิ้งลูกค้า</strong> —
          ตรวจแต่ละแทรค (PR / น้ำหนัก / คิว / ขนส่ง / ประเภท) ให้ถูกก่อน แล้วกด{" "}
          <strong>&quot;นำเข้าระบบ&quot;</strong> (พรีวิว + ยืนยันอีกครั้ง) เพื่อดึงเข้าระบบบิล (tb_forwarder).
          {" "}กดเลขตู้เพื่อดูรายละเอียดทั้งตู้.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {HUB_LINKS.map((l) =>
            // external (MOMO's own site) → plain <a target=_blank>; the i18n <Link>
            // would prefix the locale onto an absolute URL. rel=noreferrer keeps our
            // admin URL out of their referer log.
            l.external ? (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                title="เปิดเว็บ MOMO (ดู/ชั่งของจริงฝั่งจีน) ในแท็บใหม่ — หน้าตรวจตู้ที่ค้างอยู่ไม่หาย"
                className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm hover:bg-sky-100">
                {l.label} ↗
              </a>
            ) : (
              <Link key={l.href} href={l.href}
                className="rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-surface-alt">
                {l.label}
              </Link>
            ),
          )}
          <MomoGuideButton />
        </div>
      </header>

      <MomoIngestClient tracks={tracks} missing={missing} loadError={error?.message ?? null} />
    </div>
  );
}
