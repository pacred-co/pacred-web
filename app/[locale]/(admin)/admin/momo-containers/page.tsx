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
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import type { PackingUploadSnapshot } from "@/actions/admin/momo-packing-history";
import { MomoIngestClient, type IngestTrack, type MissingParcel } from "./momo-containers-client";

export const dynamic = "force-dynamic";

const HUB_LINKS: { href: string; label: string }[] = [
  { href: "/admin/api-forwarder-momo/sync", label: "📥 Sync จาก MOMO API" },
  { href: "/admin/api-forwarder-momo/packing-upload", label: "📦 อัพ packing list" },
  { href: "/admin/api-forwarder-momo/drift", label: "🔴 คิว drift (แทร็กหาย)" },
  { href: "/admin/api-forwarder-momo/review", label: "✅ review / commit (เดิม)" },
];

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

  const tracks: IngestTrack[] = intermediate.map((r) => {
    const base = r.tracking ? baseTrackingOf(r.tracking) : "";
    const pk = base ? packingByBase.get(base) : undefined;
    const lv = base ? liveByBase.get(base) : undefined;
    return {
      ...r,
      userIdValid: r.guessedUserId == null ? null : knownUserIds.has(r.guessedUserId.toUpperCase()),
      hasPacking: !!pk,
      packingWeight: pk?.weight ?? null,
      packingCbm: pk?.cbm ?? null,
      packingBoxes: pk?.boxes ?? null,
      hasLive: !!lv,
      liveWeight: lv?.weight ?? null,
      liveCbm: lv?.cbm ?? null,
      etd: (r.container && etaByCabinet.get(r.container)?.etd) || null,
      eta: (r.container && etaByCabinet.get(r.container)?.eta) || null,
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
          {HUB_LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className="rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-surface-alt">
              {l.label}
            </Link>
          ))}
        </div>
      </header>

      {/* คู่มือใช้งาน — พับเก็บได้ (owner ภูม: "อนาคตอาจไม่ใช่ภูมิที่ดึงข้อมูล คนอื่นมาทำต่อจะได้เข้าใจ") */}
      <details className="rounded-2xl border border-sky-200 bg-sky-50/50 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-500/5">
        <summary className="cursor-pointer select-none text-sm font-bold text-sky-800 dark:text-sky-300">
          📖 วิธีใช้งานหน้านี้ (สำหรับผู้ที่เพิ่งเริ่มทำ) — คลิกเพื่อดูขั้นตอน
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-foreground/90 marker:font-bold marker:text-sky-600">
          <li>
            <strong>หน้านี้ทำอะไร:</strong> รวมข้อมูลจาก <strong>MOMO API</strong> + <strong>packing list (แต้ม)</strong> +
            <strong> MOMO Live</strong> มาเป็น &quot;รายแทรคกิ้งลูกค้า&quot; (1 แถว = 1 แทรค) → ตรวจ/แก้ให้ถูก →
            กด &quot;นำเข้าระบบ&quot; เพื่อสร้างรายการบิล (tb_forwarder).
          </li>
          <li>
            <strong>แท็บด้านบน:</strong> 🟡 ยังไม่เข้าระบบ = รอนำเข้า · ✅ เข้าระบบแล้ว · ❗ ไม่ตรง (Packing/Live) =
            ข้อมูล API ไม่ตรงกับ packing/Live (ต้องตรวจ) · ทั้งหมด. ตัวเลข = จำนวนรายการ.
          </li>
          <li>
            <strong>คอลัมน์สำคัญ:</strong> <strong>Code</strong> = PR ลูกค้า · <strong>Tracking</strong> = เลขแทรค ·
            <strong> Total Wt / Total Vol</strong> = น้ำหนัก/คิวรวม (<strong className="text-rose-600">ค่าที่ใช้คิดเงิน</strong>) ·
            <strong> W/L/H</strong> = ขนาดกล่อง · <strong>Status</strong> = สถานะ MOMO.
          </li>
          <li>
            <strong>เทียบ 3 ทาง</strong> (ใต้ Total Wt/Vol): บรรทัดบน = MOMO API ·{" "}
            <strong className="text-emerald-700">📦</strong> = packing list ·{" "}
            <strong className="text-sky-700">🟢</strong> = MOMO Live · <strong className="text-emerald-600">✓</strong> ตรง ·{" "}
            <strong className="text-rose-600">⚠</strong> ไม่ตรง (รวมดูที่แท็บ ❗ ไม่ตรง).
          </li>
          <li>
            <strong>ตรวจ PR ให้ถูก:</strong> คลิกรูปป้ายเพื่อดู PR บนกล่อง · ป้าย <span className="text-emerald-700 font-semibold">พบในระบบ</span> = PR ใช้ได้ ·{" "}
            <span className="text-red-700 font-semibold">ไม่มีในระบบ</span> = ต้องแก้ PR ก่อน (ข้อ 6).
          </li>
          <li>
            <strong>แก้ข้อมูลที่ MOMO ส่งผิด:</strong> คลิกค่าที่มีดินสอ <span className="text-amber-600">✎</span> เพื่อแก้ได้ทันที —
            <strong> น้ำหนัก · คิว · จำนวน · ขนาด W/L/H · PR</strong> (พิมพ์เช่น <code>PR545</code>) → กด Enter หรือ ✓ บันทึก.
            ⚠️ แก้ได้เฉพาะแถว <strong>&quot;ยังไม่เข้าระบบ&quot;</strong> เท่านั้น (เข้าระบบแล้ว = แก้ไม่ได้ เพื่อกันบิลเพี้ยน).
          </li>
          <li>
            <strong>ข้อมูลขาด? กด 🔄 ดึง Live เดี๋ยวนี้:</strong> จะพรีวิวรายการที่ยังไม่ครบ → ยืนยัน → MOMO เว็บเติม
            น้ำหนัก/คิว/เลขตู้ ที่ยังว่างให้อัตโนมัติ (ไม่ทับค่าที่มีอยู่ · ข้ามรายการที่วางบิลแล้ว).
          </li>
          <li>
            <strong>นำเข้าระบบ:</strong> ติ๊ก ☑ หน้ารายการที่ตรวจแล้ว (ติ๊กหัวตาราง = เลือกทั้งหน้า) → กดปุ่ม
            <strong> &quot;นำเข้าระบบ&quot;</strong> → พรีวิวข้อมูลครบ ตรวจอีกที → ยืนยัน. รายการจะกลายเป็น
            <strong> เข้าระบบแล้ว</strong> + มีลิงก์ไปใบนำเข้า (#เลข).
          </li>
          <li>
            <strong>พัสดุขาด</strong> (ถ้ามี · แถบแดงใต้ตาราง): พัสดุที่ packing มีแต่ MOMO API ไม่ส่ง → กด
            <strong> &quot;ดึงเข้าระบบ&quot;</strong> ระบบสร้างบิลให้ (กันซ้ำ + คิดราคาอัตโนมัติ).
          </li>
          <li>
            <strong>เครื่องมือ:</strong> ช่องค้นหา (แทรค/PR/เลขตู้) · <strong>⇅</strong> คลิกหัวคอลัมน์ = เรียง ·
            <strong> ⋮⋮</strong> ลากหัวคอลัมน์ = ย้ายตำแหน่ง · <strong>↺ คอลัมน์</strong> = รีเซ็ต ·
            <strong> Copy / Excel</strong> = ส่งออก · คลิก <strong>Container Name</strong> = ดูรายละเอียดทั้งตู้.
          </li>
        </ol>
      </details>

      <MomoIngestClient tracks={tracks} missing={missing} loadError={error?.message ?? null} />
    </div>
  );
}
