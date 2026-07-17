/**
 * เลน D — "และที่เหลืออยู่ทั้งหมด" (owner 2026-07-17)
 *
 * 🔴 READ-ONLY. SELECT เท่านั้น. ไม่มี UPDATE/INSERT/DELETE ในไฟล์นี้เลย.
 *    หน้าที่ = **ยืนยันเลขจาก prod สดใหม่** ไม่ลอกจาก doc + หาของค้างที่ยังไม่มีใครรู้.
 *
 * ทำไมต้องนับใหม่ ไม่เชื่อ doc:
 *   `backfill-inventory-2026-07-17.md` เขียนก่อน commit 7c62bf41 ("ล้างคิว 160 ·
 *   backfill 9 แถว") → ตัวเลข D1/B1 ใน doc **ตกยุคแล้ว**. doc เองก็เตือนไว้ว่า
 *   momo_box_detail ถูก cron เขียนตลอด → เทียบ "ของเรา(ครบ)" กับ "MOMO(กำลังมา)"
 *   = ได้ส่วนต่างหลอก (F6a false positive) → **ทุกข้อที่เทียบ MOMO ต้องเช็ค
 *   "box_detail แตกครบหรือยัง" ก่อน ไม่งั้นข้าม ไม่ใช่ flag**.
 *
 * นิยาม (ยึด source เดิม · ห้ามคิดเอง):
 *   - gate ค่าส่งไทย  = mirror `lib/forwarder/domestic-shipping.ts`
 *                       (PCS รับเอง / PRF+PCSF เหมาๆ / paymethod='2' COD → ไม่ต้องมี)
 *   - gate คิวตรวจสอบ = `lib/admin/report-cnt-add-check-gate.ts` → fstatus='4' เป๊ะ
 *   - ตัวชี้ขาดคิว/นน. = **dims เท่านั้น** (ห้ามใช้ความหนาแน่น — ของหนักเกิน 1,000 kg/คิว ได้จริง)
 *   - เรทต้นทุน MOMO   = GZS/SEA=เรือ 2,500 · GZE/EK=รถ 4,700 (mig 0260)
 *
 * RUN: node scripts/cleanup-remaining-2026-07-17.mjs
 */
import pg from "pg";

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

// ── helpers ──────────────────────────────────────────────────────────────
const num = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const baht = (n) =>
  num(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r6 = (n) => Number(num(n).toFixed(6));
const baseOf = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
const isSibling = (t) => /-\d+(?:\/\d+)?$/.test((t ?? "").trim());
const piecesOf = (q) => {
  const n = Math.round(num(q));
  return n > 0 ? n : 1;
};
const dimsCbm = (w, l, h) => r6((num(w) * num(l) * num(h)) / 1_000_000);
const relDiff = (a, b) => {
  const d = Math.max(Math.abs(a), Math.abs(b));
  return d < 1e-9 ? 0 : Math.abs(a - b) / d;
};
const costRateOf = (cab) => {
  const s = (cab ?? "").trim().toUpperCase();
  if (s.startsWith("GZS") || s.startsWith("SEA")) return 2500;
  if (s.startsWith("GZE") || s.startsWith("EK")) return 4700;
  return null;
};

/** mirror ของ `isThShippingCostRequired` — ถ้ากฎเปลี่ยนต้อง sync (mjs import .ts ไม่ได้) */
const thShipRequired = (fshipby, payMethod) => {
  const s = (fshipby ?? "").trim().toUpperCase();
  if (s === "PCS") return false; // รับเองที่โกดัง
  if (s === "PCSF" || s === "PRF") return false; // เหมาๆ — ฿100 ขี่บน anchor
  if ((payMethod ?? "").toString().trim() === "2") return false; // COD ปลายทาง
  return true;
};
const thShipMissing = (r, shipmentIsCod) => {
  if (shipmentIsCod) return false;
  if (!thShipRequired(r.fshipby, r.paymethod)) return false;
  return num(r.ftransportprice) <= 0;
};

const hr = (t) => console.log(`\n${"═".repeat(78)}\n${t}\n${"═".repeat(78)}`);
const sub = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 72 - t.length))}`);

async function main() {
  await client.connect();
  console.log("🔗 prod (read-only) · " + new Date().toISOString());

  // ═══════════════════════════════════════════════════════════════════════
  // 1) PR043 · GZS260628-2 — 3 แถวค้าง fstatus=4 แจ้งชำระได้เลยไหม?
  // ═══════════════════════════════════════════════════════════════════════
  hr("1) PR043 · GZS260628-2 — 3 แถวค้าง fstatus=4 · แจ้งชำระผ่านคิวเดิมได้ไหม?");

  const { rows: pr043 } = await client.query(`
    SELECT id, ftrackingchn, userid, fstatus, fcabinetnumber, fshipby, paymethod,
           ftotalprice, ftransportprice, fcosttotalprice, famount, fweight, fvolume
    FROM tb_forwarder
    WHERE fcabinetnumber = 'GZS260628-2'
    ORDER BY id
  `);
  console.log(`ตู้ GZS260628-2 = ${pr043.length} แถว`);
  const byStatus = {};
  for (const r of pr043) byStatus[r.fstatus ?? "∅"] = (byStatus[r.fstatus ?? "∅"] ?? 0) + 1;
  console.log("แยกตามสถานะ:", JSON.stringify(byStatus));

  // COD ระดับชิปเม้น (base tracking เดียวกัน COD → พี่น้อง ฿0 ถูกต้อง)
  const codBases = new Set(
    pr043.filter((r) => (r.paymethod ?? "").toString().trim() === "2").map((r) => baseOf(r.ftrackingchn)),
  );
  const st4 = pr043.filter((r) => (r.fstatus ?? "") === "4");
  sub(`แถว fstatus=4 = ${st4.length} แถว`);
  let pr043Blocked = 0;
  for (const r of st4) {
    const cod = codBases.has(baseOf(r.ftrackingchn));
    const missing = thShipMissing(r, cod);
    if (missing) pr043Blocked++;
    console.log(
      `  fid ${r.id} · ${r.ftrackingchn} · ${r.userid} · ขาย ฿${baht(r.ftotalprice)} · ` +
        `ขนส่ง=${r.fshipby || "∅"} · pay=${r.paymethod || "∅"} · ค่าส่งไทย ฿${baht(r.ftransportprice)} ` +
        `→ ${missing ? "🔴 ติด C2 (ยังไม่ใส่ค่าส่งไทย)" : "🟢 แจ้งชำระได้"}`,
    );
  }
  console.log(
    `\n👉 สรุป: ${st4.length} แถว fstatus=4 · ติด C2 = ${pr043Blocked} · ` +
      `แจ้งชำระได้เลย = ${st4.length - pr043Blocked}`,
  );
  console.log(`   Σ ขาย (fstatus=4) = ฿${baht(st4.reduce((s, r) => s + num(r.ftotalprice), 0))}`);

  // อยู่ในคิวตรวจสอบหรือยัง?
  if (st4.length) {
    const { rows: inQ } = await client.query(
      `SELECT "fID" FROM tb_check_forwarder WHERE "fID"::text = ANY($1::text[])`,
      [st4.map((r) => String(r.id))],
    );
    console.log(`   อยู่ในคิวตรวจสอบแล้ว = ${inQ.length}/${st4.length} แถว`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2) F2 — ไม่มีเลขตู้ แต่สถานะ >= 3 · หาตู้จาก momo_box_detail ได้ไหม?
  // ═══════════════════════════════════════════════════════════════════════
  hr("2) F2 — ไม่มีเลขตู้ แต่สถานะ >= 3 (ของออกจากจีนแล้ว แต่ระบบไม่รู้ว่าอยู่ตู้ไหน)");

  const { rows: noCab } = await client.query(`
    SELECT id, ftrackingchn, userid, fstatus, fshipby, paymethod,
           ftotalprice, ftransportprice, fcosttotalprice, fweight, fvolume
    FROM tb_forwarder
    WHERE COALESCE(NULLIF(TRIM(fcabinetnumber), ''), '') = ''
      AND fstatus IN ('3','4','5','6','7')
    ORDER BY fstatus, id
  `);
  console.log(`พบ ${noCab.length} แถว · Σ ขาย ฿${baht(noCab.reduce((s, r) => s + num(r.ftotalprice), 0))}`);

  // หาตู้จาก momo_box_detail (ทั้ง box_tracking และ base_tracking)
  const tracks = noCab.map((r) => (r.ftrackingchn ?? "").trim()).filter(Boolean);
  const bases = [...new Set(tracks.map(baseOf))];
  const { rows: bdCab } = tracks.length
    ? await client.query(
        `SELECT base_tracking, box_tracking, container_name
         FROM momo_box_detail
         WHERE (box_tracking = ANY($1::text[]) OR base_tracking = ANY($2::text[]))
           AND COALESCE(NULLIF(TRIM(container_name), ''), '') <> ''`,
        [tracks, bases],
      )
    : { rows: [] };

  const cabByTrack = new Map();
  const cabByBase = new Map();
  for (const b of bdCab) {
    if (b.box_tracking) cabByTrack.set(b.box_tracking.trim(), b.container_name.trim());
    if (b.base_tracking) {
      const k = b.base_tracking.trim();
      if (!cabByBase.has(k)) cabByBase.set(k, new Set());
      cabByBase.get(k).add(b.container_name.trim());
    }
  }

  let resolvable = 0;
  let ambiguous = 0;
  let unknown = 0;
  for (const r of noCab) {
    const t = (r.ftrackingchn ?? "").trim();
    const exact = cabByTrack.get(t);
    const viaBase = cabByBase.get(baseOf(t));
    let verdict, detail;
    if (exact) {
      verdict = "🟢 หาตู้ได้";
      detail = `→ ${exact} (match ตรง box_tracking)`;
      resolvable++;
    } else if (viaBase && viaBase.size === 1) {
      verdict = "🟡 หาตู้ได้ (ผ่าน base)";
      detail = `→ ${[...viaBase][0]} (match ผ่าน base_tracking)`;
      resolvable++;
    } else if (viaBase && viaBase.size > 1) {
      verdict = "🔴 ตู้ขัดกัน";
      detail = `→ ${[...viaBase].join(" / ")} (base เดียวอยู่หลายตู้ = ต้องดูรายกล่อง)`;
      ambiguous++;
    } else {
      verdict = "⚪ ไม่มีข้อมูลใน momo_box_detail";
      detail = "→ ตัดสินไม่ได้";
      unknown++;
    }
    console.log(
      `  fid ${r.id} · st=${r.fstatus} · ${t} · ${r.userid} · ฿${baht(r.ftotalprice)} ${verdict} ${detail}`,
    );
  }
  console.log(
    `\n👉 สรุป F2: หาตู้ได้ ${resolvable} · ตู้ขัดกัน ${ambiguous} · ไม่มีข้อมูล ${unknown}`,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // 3) B1 — double-count (นน./คิว คูณ quantity ซ้ำ) · เหลือกี่แถว?
  // ═══════════════════════════════════════════════════════════════════════
  hr("3) B1 — นน./คิว คูณ quantity ซ้ำ · เหลือกี่แถว หลัง backfill 7c62bf41?");

  const { rows: bdAll } = await client.query(`
    SELECT base_tracking, box_tracking, weight_kg, cbm, quantity, width, length, height, container_name
    FROM momo_box_detail
  `);
  const bdByBox = new Map();
  for (const b of bdAll) {
    const k = (b.box_tracking ?? "").trim();
    if (k) bdByBox.set(k, b);
  }
  // นับกล่องต่อ base — ใช้ตรวจว่า "แตกครบหรือยัง" (กัน false positive แบบ F6a)
  const boxesPerBase = new Map();
  for (const b of bdAll) {
    const k = (b.base_tracking ?? "").trim();
    if (!k) continue;
    boxesPerBase.set(k, (boxesPerBase.get(k) ?? 0) + 1);
  }

  const { rows: fwAll } = await client.query(`
    SELECT id, ftrackingchn, userid, fstatus, fcabinetnumber, fweight, fvolume, famount,
           ftotalprice, fcosttotalprice
    FROM tb_forwarder
    WHERE COALESCE(NULLIF(TRIM(ftrackingchn), ''), '') <> ''
  `);

  const dbl = [];
  for (const r of fwAll) {
    const t = (r.ftrackingchn ?? "").trim();
    const b = bdByBox.get(t);
    if (!b) continue;
    const qty = piecesOf(b.quantity);
    if (qty <= 1) continue; // qty=1 → คูณหรือไม่คูณก็เท่ากัน = ชี้ขาดไม่ได้ (ไม่ใช่บัค)
    const dims = dimsCbm(b.width, b.length, b.height);
    if (dims <= 0) continue; // ไม่มี dims = ตัวชี้ขาดหาย → ข้าม (ห้ามเดา)
    const momoCbm = num(b.cbm);
    // ตัวชี้ขาด: cbm ≈ dims → ต่อกล่อง (คูณถูก) · cbm ≈ dims×qty → ยอดรวม (ห้ามคูณ)
    const isPerBox = relDiff(momoCbm, dims) < 0.02;
    const isLineTotal = relDiff(momoCbm, dims * qty) < 0.02;
    if (!isLineTotal || isPerBox) continue; // ชี้ขาดไม่ได้ หรือ ต่อกล่อง = ไม่ใช่เคสนี้

    // MOMO ส่ง "ยอดรวม" → ค่าที่ถูก = ค่าที่ MOMO ส่งมาตรงๆ (ห้ามคูณ)
    const okW = num(b.weight_kg);
    const okV = momoCbm;
    const gotW = num(r.fweight);
    const gotV = num(r.fvolume);
    const wDbl = okW > 0 && relDiff(gotW, okW * qty) < 0.02;
    const vDbl = okV > 0 && relDiff(gotV, okV * qty) < 0.02;
    if (!wDbl && !vDbl) continue; // ซ่อมไปแล้ว หรือไม่ได้คูณซ้ำ
    dbl.push({ r, b, qty, okW, okV, gotW, gotV, wDbl, vDbl });
  }

  if (!dbl.length) {
    console.log("🟢 ไม่เหลือแถวที่คูณซ้ำเลย (backfill 7c62bf41 เก็บครบ)");
  } else {
    console.log(`เหลือ ${dbl.length} แถว:`);
    for (const d of dbl) {
      console.log(
        `  fid ${d.r.id} · ${d.r.ftrackingchn} · ตู้ ${d.r.fcabinetnumber || "∅"} · ${d.r.userid} · st=${d.r.fstatus}`,
      );
      if (d.wDbl) console.log(`      นน. เก็บ ${d.gotW} → ที่ถูก ${d.okW} (× qty ${d.qty})`);
      if (d.vDbl) console.log(`      คิว เก็บ ${d.gotV} → ที่ถูก ${d.okV} (× qty ${d.qty})`);
      console.log(`      ขาย ฿${baht(d.r.ftotalprice)} · ทุน ฿${baht(d.r.fcosttotalprice)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4) P22324 (PR075) — มีแทรคนำเข้าผูกไหม? (ยืนยันซ้ำว่า "ไม่ auto-demote" ถูกแล้ว)
  // ═══════════════════════════════════════════════════════════════════════
  hr("4) P22324 (PR075) — สถานะ '5' แต่กฎ 3 ขั้นว่าอะไร? มีแทรคผูกไหม?");

  const { rows: p22324 } = await client.query(`
    SELECT hno, userid, hstatus, htotalpriceuser, hdateupdate
    FROM tb_header_order WHERE hno = 'P22324'
  `);
  if (!p22324.length) {
    console.log("⚪ ไม่พบ P22324");
  } else {
    const h = p22324[0];
    console.log(
      `P22324 · ${h.userid} · hstatus='${h.hstatus}' · ยอด ฿${baht(h.htotalpriceuser)} · อัพเดต ${h.hdateupdate}`,
    );

    // ทาง 1: reforder
    const { rows: byRef } = await client.query(
      `SELECT id, ftrackingchn, fstatus, fcabinetnumber FROM tb_forwarder WHERE reforder = 'P22324'`,
    );
    // ทาง 2: tb_order.ctrackingnumber → tb_forwarder.ftrackingchn
    const { rows: ord } = await client.query(
      `SELECT id, ctrackingnumber FROM tb_order
       WHERE hno = 'P22324' AND COALESCE(NULLIF(TRIM(ctrackingnumber), ''), '') <> ''`,
    );
    const ordTracks = ord.map((o) => o.ctrackingnumber.trim());
    const { rows: byTrack } = ordTracks.length
      ? await client.query(
          `SELECT id, ftrackingchn, fstatus, fcabinetnumber FROM tb_forwarder
           WHERE ftrackingchn = ANY($1::text[])`,
          [ordTracks],
        )
      : { rows: [] };

    console.log(`  แทรคผ่าน reforder            = ${byRef.length} แถว`);
    console.log(`  tb_order ที่มี ctrackingnumber = ${ord.length} แถว`);
    console.log(`  แทรคผ่าน ctrackingnumber      = ${byTrack.length} แถว`);
    const all = [...byRef, ...byTrack];
    for (const f of all) {
      console.log(`    fid ${f.id} · ${f.ftrackingchn} · st=${f.fstatus} · ตู้ ${f.fcabinetnumber || "∅"}`);
    }
    if (!all.length) {
      console.log(
        `\n👉 ยืนยัน: **ไม่มีแทรคนำเข้าผูกเลยสักแถว** → กฎ 3 ขั้น (deriveShopStatus) ไม่มี input\n` +
          `   → ที่ owner สั่ง "ไม่ auto-demote" **ถูกแล้ว** — ถ้า auto จะเดาสถานะจากของว่าง`,
      );
    } else {
      console.log(`\n⚠️ มีแทรคผูก ${all.length} แถว → กฎ 3 ขั้นตัดสินได้ → ต้องดูซ้ำว่า '5' ถูกไหม`);
    }
    // นับ tb_order ทั้งหมด
    const { rows: ordCnt } = await client.query(
      `SELECT COUNT(*)::int AS n FROM tb_order WHERE hno = 'P22324'`,
    );
    console.log(`  tb_order ทั้งหมดของ P22324 = ${ordCnt[0].n} แถว`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5) หาของค้างที่ยังไม่มีใครรู้
  // ═══════════════════════════════════════════════════════════════════════
  hr("5) ของค้างที่ยังไม่มีใครรู้ (query สดจาก prod)");

  // 5.1 billable แต่ราคาขาย = 0
  sub("5.1 ถึงไทยแล้ว (fstatus>=4) แต่ราคาขาย = 0 → เก็บเงินไม่ได้");
  const { rows: zeroPrice } = await client.query(`
    SELECT id, ftrackingchn, userid, fstatus, fcabinetnumber, fweight, fvolume, fcosttotalprice
    FROM tb_forwarder
    WHERE fstatus IN ('4','5','6','7')
      AND COALESCE(ftotalprice, 0) <= 0
    ORDER BY fstatus, id
  `);
  console.log(`พบ ${zeroPrice.length} แถว`);
  for (const r of zeroPrice.slice(0, 20)) {
    console.log(
      `  fid ${r.id} · st=${r.fstatus} · ${r.ftrackingchn} · ${r.userid} · ตู้ ${r.fcabinetnumber || "∅"} · ` +
        `นน. ${num(r.fweight)} · คิว ${num(r.fvolume)} · ทุน ฿${baht(r.fcosttotalprice)}`,
    );
  }
  if (zeroPrice.length > 20) console.log(`  … อีก ${zeroPrice.length - 20} แถว`);

  // 5.2 คิวตรวจสอบ — ยังสะอาดอยู่ไหม (หลังล้าง 160)
  sub("5.2 คิวตรวจสอบ — ยังสะอาดอยู่ไหม? (gate ใหม่ = fstatus '4' เป๊ะ)");
  const { rows: q } = await client.query(`
    SELECT c."fID", f.fstatus, f.id AS fwd_id, f.ftrackingchn, f.userid,
           f.fshipby, f.paymethod, f.ftransportprice, f.ftotalprice
    FROM tb_check_forwarder c
    LEFT JOIN tb_forwarder f ON f.id::text = c."fID"::text
    ORDER BY c."fID"
  `);
  const qOrphan = q.filter((r) => r.fwd_id == null);
  const qStale = q.filter((r) => r.fwd_id != null && (r.fstatus ?? "") !== "4");
  const qOk = q.filter((r) => r.fwd_id != null && (r.fstatus ?? "") === "4");
  console.log(`คิวทั้งหมด ${q.length} · fstatus=4 ${qOk.length} · ไม่ใช่ '4' ${qStale.length} · orphan ${qOrphan.length}`);
  if (qStale.length) {
    const m = {};
    for (const r of qStale) m[r.fstatus ?? "∅"] = (m[r.fstatus ?? "∅"] ?? 0) + 1;
    console.log(`  🔴 ค้างใหม่:`, JSON.stringify(m), "→ gate รั่ว หรือมีคนใส่เข้ามาใหม่");
  }
  // 8 แถวที่ใช้ได้ — ยังติด C2 อยู่ไหม
  const qCodBases = new Set(
    qOk.filter((r) => (r.paymethod ?? "").toString().trim() === "2").map((r) => baseOf(r.ftrackingchn)),
  );
  let qBlocked = 0;
  for (const r of qOk) {
    const missing = thShipMissing(r, qCodBases.has(baseOf(r.ftrackingchn)));
    if (missing) qBlocked++;
    console.log(
      `  fid ${r.fwd_id} · ${r.ftrackingchn} · ${r.userid} · ฿${baht(r.ftotalprice)} · ` +
        `ขนส่ง=${r.fshipby || "∅"} · ค่าส่งไทย ฿${baht(r.ftransportprice)} → ` +
        `${missing ? "🔴 ติด C2" : "🟢 แจ้งชำระได้"}`,
    );
  }
  console.log(`👉 คิวใช้ได้ ${qOk.length} · ติด C2 ${qBlocked} · พร้อมแจ้งชำระ ${qOk.length - qBlocked}`);

  // 5.3 ตู้ปิดแล้ว แต่มีแถวค้างสถานะต้น
  sub("5.3 ตู้ที่ของถึงไทยแล้ว (มีแถว >=4) แต่ยังมีพี่น้องค้างสถานะต้น (<4)");
  const { rows: cabMix } = await client.query(`
    SELECT fcabinetnumber,
           COUNT(*) FILTER (WHERE fstatus IN ('4','5','6','7'))::int AS arrived,
           COUNT(*) FILTER (WHERE fstatus IN ('1','2','3'))::int     AS in_transit,
           COUNT(*)::int AS total,
           SUM(COALESCE(ftotalprice,0)) FILTER (WHERE fstatus IN ('1','2','3')) AS stuck_thb
    FROM tb_forwarder
    WHERE COALESCE(NULLIF(TRIM(fcabinetnumber), ''), '') <> ''
    GROUP BY fcabinetnumber
    HAVING COUNT(*) FILTER (WHERE fstatus IN ('4','5','6','7')) > 0
       AND COUNT(*) FILTER (WHERE fstatus IN ('1','2','3')) > 0
    ORDER BY 5 DESC NULLS LAST
  `);
  console.log(`พบ ${cabMix.length} ตู้ที่สถานะปนกัน (ตู้เดียวกันควรถึงไทยพร้อมกัน)`);
  for (const c of cabMix) {
    console.log(
      `  ${c.fcabinetnumber} · ถึงไทย ${c.arrived} · ยังค้าง ${c.in_transit}/${c.total} · ` +
        `ขายที่ค้าง ฿${baht(c.stuck_thb)}`,
    );
  }

  // 5.4 บิล/ใบเสร็จ ไม่ sync สถานะ
  sub("5.4 ใบวางบิล paid แล้ว แต่ forwarder ยังไม่ถึง '6'");
  const { rows: billDrift } = await client
    .query(`
      SELECT i.id AS invoice_id, i.doc_no, i.status, i.paid_at,
             f.id AS fwd_id, f.fstatus, f.ftrackingchn, f.userid, f.ftotalprice
      FROM tb_forwarder_invoice i
      JOIN tb_forwarder_invoice_item it ON it.invoice_id = i.id
      JOIN tb_forwarder f ON f.id = it.forwarder_id
      WHERE i.status = 'paid' AND f.fstatus IN ('4','5')
      ORDER BY i.id
    `)
    .catch((e) => {
      console.log(`  ⚠️ query ไม่ผ่าน: ${e.message}`);
      return { rows: [] };
    });
  console.log(`พบ ${billDrift.length} แถว (บิลจ่ายแล้ว แต่แถวยังค้าง 4/5)`);
  for (const b of billDrift.slice(0, 15)) {
    console.log(
      `  บิล ${b.doc_no} (paid ${b.paid_at}) → fid ${b.fwd_id} st=${b.fstatus} · ` +
        `${b.ftrackingchn} · ${b.userid} · ฿${baht(b.ftotalprice)}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5.7 🔴 ของใหม่ที่เจอ session นี้ — ฝากสั่งซื้อ "จุดบอดกล่องแตก"
  // ═══════════════════════════════════════════════════════════════════════
  sub("5.7 🔴 ฝากสั่งซื้อ · จุดบอด MOMO แตกกล่อง (ตัวเชื่อมขาด)");
  console.log(
    `ต้นตอ: tb_order เก็บแทรค **เปล่า** ("999061141707") · MOMO แตกกล่องแล้ว tb_forwarder\n` +
      `เก็บเป็น **-N/M** ("999061141707-1/3") → ตัวจับคู่ทั้ง 2 ฝั่งใช้ **exact match**:\n` +
      `  · TS : lib/admin/shop-order-arrivals.ts:92  .in("ftrackingchn", trackings)\n` +
      `  · SQL: 0259_shop_status_one_rule_both_sides.sql L81/89/185  btrim(f.ftrackingchn) = rs.trk\n` +
      `→ หากันไม่เจอ → กฎเห็น "ยังไม่มีของถึง" → ค้าง '4' ตลอด\n` +
      `(= carryover ที่ CLAUDE.md เขียนไว้ "box-split arrival-scan miss" · ยืนยัน file:line + วงกระทบแล้ว)`,
  );

  const { rows: shopOrd } = await client.query(`
    SELECT DISTINCT o.hno, h.hstatus, h.userid, h.htotalpriceuser,
           o.id AS row_id, o.cnameshop, o.ctitle, TRIM(o.ctrackingnumber) AS tr
    FROM tb_order o JOIN tb_header_order h ON h.hno = o.hno
  `);
  const realRows = shopOrd.filter(
    (r) => (r.cnameshop ?? "").trim() || (r.ctitle ?? "").trim() || (r.tr ?? "").trim(),
  );
  const allTracks = [...new Set(realRows.map((r) => r.tr).filter(Boolean))];
  const { rows: fwMatch } = allTracks.length
    ? await client.query(
        `SELECT id, TRIM(ftrackingchn) AS t, fstatus, fcabinetnumber
         FROM tb_forwarder
         WHERE TRIM(ftrackingchn) = ANY($1::text[])
            OR regexp_replace(TRIM(ftrackingchn),'-[0-9]+(/[0-9]+)?$','') = ANY($1::text[])`,
        [allTracks],
      )
    : { rows: [] };

  const ARRIVED = new Set(["2", "3", "4", "5", "6", "7"]);
  const DONE = new Set(["4", "5", "6", "7"]);
  const matchFor = (tr, exactOnly) =>
    fwMatch.filter((x) =>
      exactOnly ? x.t === tr : x.t === tr || x.t.replace(/-\d+(?:\/\d+)?$/, "") === tr,
    );
  const derive = (rows, exactOnly) => {
    if (!rows.length) return "4";
    const per = rows.map((r) => {
      const m = matchFor(r.tr, exactOnly);
      if (!r.tr || !m.length) return { arrived: false, done: false };
      return {
        arrived: m.every((x) => ARRIVED.has(String(x.fstatus ?? "").trim())),
        done: m.every(
          (x) => (x.fcabinetnumber ?? "").trim() !== "" || DONE.has(String(x.fstatus ?? "").trim()),
        ),
      };
    });
    if (per.every((p) => p.done)) return "5";
    if (per.every((p) => p.arrived)) return "40";
    return "4";
  };

  const byHno = new Map();
  for (const r of realRows) {
    if (!byHno.has(r.hno)) byHno.set(r.hno, []);
    byHno.get(r.hno).push(r);
  }
  const stuck = [];
  const blindOnly = [];
  for (const [hno, rows] of byHno) {
    const h = rows[0];
    const blind = derive(rows, true);
    const aware = derive(rows, false);
    if (blind === aware) continue; // ตัวจับคู่ไม่ได้ทำให้ต่าง → ไม่เกี่ยว
    const cur = String(h.hstatus ?? "").trim();
    const governed = ["3", "4", "40"].includes(cur);
    const rec = { hno, userid: h.userid, cur, blind, aware, governed, thb: num(h.htotalpriceuser) };
    if (aware !== cur && governed) stuck.push(rec);
    else blindOnly.push(rec);
  }
  console.log(`\nออเดอร์ที่ตัวจับคู่ exact ให้ผลต่างจาก sibling-aware = ${stuck.length + blindOnly.length}`);
  for (const r of [...stuck, ...blindOnly]) {
    const verdict =
      r.aware === r.cur
        ? r.governed
          ? "🟢 ตรง"
          : "🟢 ตรง (guard กันไว้ · trigger ไม่แตะ '5'/'6')"
        : `🔴 ค้าง → ควรเป็น '${r.aware}'`;
    console.log(
      `  ${r.hno} · ${r.userid} · เก็บ '${r.cur}' · blind='${r.blind}' · aware='${r.aware}' · ` +
        `฿${baht(r.thb)} ${verdict}`,
    );
  }
  console.log(
    `\n👉 ค้างจริง (ต้องแก้) = ${stuck.length} ออเดอร์ · ฿${baht(stuck.reduce((s, r) => s + r.thb, 0))}`,
  );
  console.log(
    `   ที่เหลือ = กฎให้ผลเท่าเดิมอยู่ดี (มีร้านอื่นยังไม่ส่ง) หรือ guard กันไว้ → **ยังไม่ต้องแตะ**\n` +
      `   ⚠️ แต่จุดบอดยังอยู่ → พอร้านที่เหลือส่งของ จะโผล่เพิ่มเรื่อยๆ`,
  );

  // 5.5 ตู้ที่ยังไม่มีต้นทุนเลย (re-measure A1)
  sub("5.5 ตู้ที่ยังไม่ตั้งต้นทุน (re-measure ยอด A1 วันนี้)");
  const { rows: costGap } = await client.query(`
    SELECT fcabinetnumber,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE COALESCE(fcosttotalprice,0) <= 0)::int AS no_cost,
           SUM(COALESCE(fvolume,0)) FILTER (WHERE COALESCE(fcosttotalprice,0) <= 0) AS cbm_no_cost,
           SUM(COALESCE(ftotalprice,0)) FILTER (WHERE COALESCE(fcosttotalprice,0) <= 0) AS sell_no_cost
    FROM tb_forwarder
    WHERE COALESCE(NULLIF(TRIM(fcabinetnumber), ''), '') <> ''
    GROUP BY fcabinetnumber
    HAVING COUNT(*) FILTER (WHERE COALESCE(fcosttotalprice,0) <= 0) > 0
    ORDER BY 4 DESC
  `);
  let totalNoCost = 0;
  let estCost = 0;
  let sellNoCost = 0;
  let undecodable = 0;
  for (const c of costGap) {
    totalNoCost += c.no_cost;
    sellNoCost += num(c.sell_no_cost);
    const rate = costRateOf(c.fcabinetnumber);
    if (rate == null) undecodable++;
    else estCost += rate * num(c.cbm_no_cost);
  }
  console.log(
    `${costGap.length} ตู้ · ${totalNoCost} แถวยังไม่มีต้นทุน · ขาย ฿${baht(sellNoCost)} · ` +
      `ต้นทุนประเมิน ฿${baht(estCost)} (decode ชนิดตู้ไม่ได้ ${undecodable} ตู้)`,
  );
  const wholeCab = costGap.filter((c) => c.no_cost === c.total);
  console.log(`  ในนั้น = ตู้ที่ไม่มีต้นทุนเลยทั้งตู้ ${wholeCab.length} ตู้`);

  // 5.6 tb_cnt — เคยจ่ายค่าตู้ผ่านระบบไหม (A2)
  sub("5.6 จ่ายค่าตู้ผ่านระบบแล้วหรือยัง (A2)");
  for (const t of ["tb_cnt", "tb_cnt_item"]) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`).catch(() => ({
      rows: [{ n: "?" }],
    }));
    console.log(`  ${t} = ${rows[0].n} แถว`);
  }
  const { rows: cabCount } = await client.query(`
    SELECT COUNT(DISTINCT fcabinetnumber)::int AS n FROM tb_forwarder
    WHERE COALESCE(NULLIF(TRIM(fcabinetnumber), ''), '') <> ''
  `);
  console.log(`  ตู้ทั้งหมดในระบบ = ${cabCount[0].n} ตู้`);

  hr("จบ — READ-ONLY · ไม่มีอะไรถูกเขียน");
  await client.end();
}

main().catch(async (e) => {
  console.error("❌", e);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
