/**
 * container-eta-estimate.ts — ETD/ETA **ประมาณการ** ต่อตู้ (owner 2026-08-07)
 *
 * owner: *"มันเป็นวันประมาณการ ไม่ใช่วันเฟิมแบบ ATD/ATA ประมาณการได้เลยครับ —
 * อิงจากเลขตู้คือวันที่ปิดตู้ ปกติปิดตู้แล้วก็ออกมาเลย ดีเลย์ไม่เกินวันสองวัน …
 * ส่วนถึงแบบประมาณการ ก็ดู data เก่าเทียบเลยว่าเคยวิ่งเท่าไร ดูเลขตู้ที่เท่าไหร่
 * แทรคกิ้งแรกที่ยิงเข้ามาของตู้นั้นคือวันที่เท่าไร ให้ย้อนกลับไปวันนึง เพราะเราช้า
 * วันนึงก่อนตู้ถึง โกดังเราต้องรอเขาลงของก่อนแล้วถึงจะไปเอาของมายิงได้"*
 *
 * ตาราง `taem_container_etd_eta` (mig 0195) = ของจริงจากแต้ม/iTAM แต่ **prod มี 0 แถว
 * ทั้ง 80 ตู้** (ไม่เคยมีใครป้อน) → คอลัมน์ ETD/ETA/T-T บนรายงานตู้ว่างมาตลอด.
 * ตัวนี้เติมช่องว่างนั้นด้วย **ประมาณการที่วัดจากของจริง** จนกว่าจะมีฟีดจริง —
 * ของจริงมาเมื่อไหร่ **ชนะเสมอ** (caller เรียก estimate เฉพาะตอนไม่มีของจริง).
 *
 * ── สูตร ─────────────────────────────────────────────────────────────────────
 *   ETD ≈ วันปิดตู้ = วันที่ฝังอยู่ในชื่อตู้ (GZS2607**23**-1 → 2026-07-23)
 *   ETA ≈ ETD + จำนวนวันเดินทาง (มัธยฐานของเส้นทางนั้น)
 *
 * ⚠️ **ห้ามใช้ค่านี้แทน `fdatecontainerclose`** — พิสูจน์กับ prod แล้วว่าวันในชื่อตู้
 * ตรงกับวันปิดตู้ที่เก็บไว้แค่ **5 จาก 20 ตู้** (ต่างกัน 1-8 วัน). สำหรับ "ประมาณการ
 * วันออก" คลาดเคลื่อนระดับนั้นรับได้ (owner: "ดีเลย์ไม่เกินวันสองวัน") แต่สำหรับ
 * ช่อง "วันที่ปิดตู้" ที่เป็นข้อเท็จจริง = เขียนทับไม่ได้เด็ดขาด.
 *
 * PURE — ไม่มี DB/IO. ตัววัดจากประวัติจริงอยู่ที่ `container-eta-loader.ts`.
 */

/** เส้นทาง = โกดังต้นทาง + โหมด · เช่น GZE (กวางโจว-รถ) · GZS (กวางโจว-เรือ) · YWS (อี้อู-เรือ) */
export type ContainerRoute = string;

/**
 * จำนวนวันเดินทาง (มัธยฐาน) วัดจาก prod 2026-08-07 · 53 ตู้ที่ยิงรับแล้ว:
 *   GZE 19 ตู้ · 3-9 วัน · มัธยฐาน 5   (เฉลี่ย 5.4)
 *   GZS 32 ตู้ · 11-43 วัน · มัธยฐาน 18 (เฉลี่ย 19.3)
 *   YWS  2 ตู้ · 19-25 วัน · มัธยฐาน 25 (เฉลี่ย 22)
 * ใช้เป็น **ค่าสำรอง** เมื่อประวัติสดมีตัวอย่างน้อยเกินไป (< MIN_SAMPLES).
 * เส้นทางที่ไม่เคยมีข้อมูลเลย (เช่น YWE อี้อู-รถ) = **ไม่อยู่ในตารางนี้โดยตั้งใจ**
 * → คืน null = จอโชว์ "—" (ไม่กุตัวเลขให้เส้นทางที่ไม่เคยวิ่ง).
 */
export const MEASURED_TRANSIT_DAYS: Readonly<Record<ContainerRoute, number>> = {
  GZE: 5,
  GZS: 18,
  YWS: 25,
};

/** ต้องมีอย่างน้อยกี่ตู้ถึงจะเชื่อมัธยฐานสด (น้อยกว่านี้ = ใช้ค่าที่วัดไว้) */
export const MIN_SAMPLES = 3;

/** เพดานกันค่าเพี้ยน — ตู้ที่วิ่งเกินนี้ = ข้อมูลผิด ไม่เอามาคิดมัธยฐาน */
export const MAX_PLAUSIBLE_DAYS = 90;

const CAB_RX = /^(GZ|YW)([SEA])(\d{6})-\d+$/;

/** เส้นทางของตู้ เช่น "GZS260723-1" → "GZS" · ชื่อไม่เข้ารูป = null */
export function routeOfCabinet(cab: string | null | undefined): ContainerRoute | null {
  const m = CAB_RX.exec((cab ?? "").trim().toUpperCase());
  return m ? `${m[1]}${m[2]}` : null;
}

/**
 * วันปิดตู้ตามชื่อตู้ → ISO `YYYY-MM-DD` (ใช้เป็น **ETD ประมาณการ**).
 * `260723` = ปี 26 (2026) เดือน 07 วัน 23 — ชุดเลขเดียวกับที่รายงานกำไรรายเดือนใช้.
 * วันที่ไม่มีจริง (เช่น 260732) = null (ห้ามเดา).
 */
export function etdFromCabinetName(cab: string | null | undefined): string | null {
  const m = CAB_RX.exec((cab ?? "").trim().toUpperCase());
  if (!m) return null;
  const yy = m[3].slice(0, 2), mm = m[3].slice(2, 4), dd = m[3].slice(4, 6);
  const iso = `20${yy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // ยืนยันว่าปฏิทินมีวันนั้นจริง (กัน 02-30 กลายเป็น 03-02)
  return d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** บวกวันบนปฏิทิน ISO (UTC ล้วน — กัน timezone เลื่อนวัน · learning 2026-07-28) */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid_iso:${iso}`);
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return d.toISOString().slice(0, 10);
}

/** มัธยฐาน (คู่ = ตัวล่างของคู่กลาง — เลือกอนุรักษ์นิยม ไม่ปัดขึ้น) */
export function medianDays(values: number[]): number | null {
  const s = values.filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_PLAUSIBLE_DAYS).sort((a, b) => a - b);
  if (s.length === 0) return null;
  return s[Math.floor((s.length - 1) / 2)];
}

/**
 * จำนวนวันเดินทางของเส้นทางนี้ — ประวัติสดชนะถ้ามีตัวอย่างพอ · ไม่พอใช้ค่าที่วัดไว้ ·
 * ไม่มีทั้งคู่ = null (จอโชว์ "—").
 */
export function transitDaysFor(
  route: ContainerRoute | null,
  historyByRoute?: Readonly<Record<string, number[]>>,
): number | null {
  if (!route) return null;
  const hist = historyByRoute?.[route] ?? [];
  const usable = hist.filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_PLAUSIBLE_DAYS);
  if (usable.length >= MIN_SAMPLES) return medianDays(usable);
  return MEASURED_TRANSIT_DAYS[route] ?? null;
}

export type EtaEstimate = {
  /** ETD ประมาณการ (= วันปิดตู้ตามชื่อตู้) */
  etd: string | null;
  /** ETA ประมาณการ (= etd + transitDays) */
  eta: string | null;
  transitDays: number | null;
  route: ContainerRoute | null;
  /** จำนวนตู้ในประวัติที่ใช้คิด (0 = ใช้ค่าที่วัดไว้ตายตัว) */
  sampleSize: number;
  /** true เสมอ — ตัวเตือนบนจอว่านี่คือ "ประมาณการ" ไม่ใช่ ATD/ATA */
  estimated: true;
};

/** ประมาณการ ETD/ETA ของตู้หนึ่ง (ชื่อตู้ไม่เข้ารูป/ไม่รู้เส้นทาง = คืน null ทุกช่อง) */
export function estimateContainerEta(
  cab: string | null | undefined,
  historyByRoute?: Readonly<Record<string, number[]>>,
): EtaEstimate {
  const route = routeOfCabinet(cab);
  const etd = etdFromCabinetName(cab);
  const transitDays = transitDaysFor(route, historyByRoute);
  const hist = (route && historyByRoute?.[route]) || [];
  const sampleSize = hist.filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_PLAUSIBLE_DAYS).length;
  return {
    etd,
    eta: etd && transitDays != null ? addDaysIso(etd, transitDays) : null,
    transitDays,
    route,
    sampleSize: sampleSize >= MIN_SAMPLES ? sampleSize : 0,
    estimated: true,
  };
}

/**
 * วันเดินทางจริงของตู้ที่ถึงแล้ว — ใช้สร้างประวัติ.
 * `firstScanIso` = แทรคกิ้งแรกที่ยิงรับเข้าโกดังไทย (MIN fdatestatus4) ·
 * **−1 วัน** ตามที่ owner อธิบาย (โกดังเราต้องรอเขาลงของก่อน 1 วัน ถึงจะไปเอามายิงได้)
 * → ได้วันที่ตู้ถึงจริง. คืน null ถ้าคำนวณไม่ได้หรือค่าไม่สมเหตุผล.
 */
export function actualTransitDays(cab: string, firstScanIso: string | null | undefined): number | null {
  const etd = etdFromCabinetName(cab);
  const scan = (firstScanIso ?? "").slice(0, 10);
  if (!etd || !/^\d{4}-\d{2}-\d{2}$/.test(scan)) return null;
  const arrival = addDaysIso(scan, -1);
  const days = Math.round(
    (new Date(`${arrival}T00:00:00Z`).getTime() - new Date(`${etd}T00:00:00Z`).getTime()) / 86_400_000,
  );
  return days > 0 && days <= MAX_PLAUSIBLE_DAYS ? days : null;
}
