/**
 * dimension-audit-verdict.ts — ตัวตัดสิน "ใครแก้ขนาด/คิว เมื่อไร แล้วมันเสียหายไหม"
 * (owner 2026-08-03: "เอา audit log ที่มีคนไปเปลี่ยนขนาดมาขึ้นบอกเลยครับ ใครและเมื่อไร
 *  จะได้ไปสอบถามกันถูกคนครับว่าเพราะอะไร แนะ กันทุจริต ได้ด้วยครับ").
 *
 * PURE — ไม่มี DB / IO / server import. จอเรียกตัวนี้ตัวเดียวเพื่อสรุปผล ห้ามคอมโพเนนต์
 * คิดกฎเอง (ไม่งั้นป้ายเตือนบนจอกับสิ่งที่ตรวจสอบจริงจะ drift กัน).
 *
 * ─── ทำไมถึงต้องมี ───────────────────────────────────────────────────────────
 * `admin_audit_log` action `tb_forwarder.update_dimensions` บันทึกทุกครั้งที่มีคน
 * กด "บันทึก" บนฟอร์มขนาด — แต่ prod บอกว่า **แก้ 1,661 ครั้ง / 14 คน / 482 แถว
 * ในขณะที่คิวเปลี่ยนจริงแค่ 104 ครั้ง** (ที่เหลือคือกดเซฟซ้ำค่าเดิม). ถ้าเอา
 * "จำนวนครั้ง" ดิบๆ ไปโชว์ = ตกใจฟรี + หาตัวจริงไม่เจอ → ต้องแยก
 * "เปลี่ยนค่าจริง" ออกจาก "กดเซฟซ้ำ" ก่อนเสมอ.
 *
 * เคสจริงที่เป็นต้นเรื่อง (fid 52447 · `1783582423-23` · PR179 · 28 กล่อง):
 *   31/07 07:47  ขวัญเรือน  83×60×30 → 82×59×29   คิว 4.1832 → 0.1403
 *   31/07 08:07  ขวัญเรือน  82×59×29 → 82×59×29   คิว 0.1403 → 3.9284
 * MOMO วัด/เก็บเงินเราที่ **4.1832 คิว** แต่ระบบเราเหลือ **3.9284** ⇒ เก็บลูกค้าขาด.
 *
 * ─── กฎการตัดสิน (severity) ─────────────────────────────────────────────────
 *   alert  = คิวปัจจุบัน "ต่ำกว่า" ที่ MOMO วัด เกิน CBM_TOLERANCE
 *            **และ** มีการแก้ที่ทำให้คิวลดลงจริง  ⇒ เก็บลูกค้าต่ำกว่าที่จ่าย MOMO
 *   watch  = มีการแก้ที่คิวเปลี่ยนจริง แต่ยังตรงกับ MOMO (หรือยังไม่มีเลข MOMO เทียบ)
 *   ok     = ไม่เคยมีการเปลี่ยนคิว/ขนาดจริงเลย (กดเซฟซ้ำล้วน หรือไม่เคยแก้)
 *
 * ⚠️ ไม่มีเลข MOMO (momoCbm = null) → **ห้ามเป็น alert เด็ดขาด** — เราไม่มีหลักฐาน
 * เทียบ จะกล่าวหาใครไม่ได้ (ทั้งไฟล์นี้เป็น READ-ONLY ไม่แตะข้อมูล/เงินอยู่แล้ว).
 *
 * ⚠️ `currentCbm` ที่ส่งเข้ามาต้องเป็น **คิวรวมของแถว** (ผ่าน totalCbmOf ตาม
 * famountcount SOT) เพื่อเทียบกับ `momo_import_tracks.cbm` ที่เป็นยอดรวมของแถว
 * เหมือนกัน — ห้ามส่ง fvolume ดิบของแถว per-box มาเทียบตรงๆ (จะเพี้ยน ×จำนวนกล่อง).
 */

/** ค่าขนาด/คิว ณ ช่วงเวลาหนึ่ง (ก่อน หรือ หลัง การแก้) */
export type DimensionSnapshot = {
  /** กว้าง (ซม.) */
  width: number;
  /** ยาว (ซม.) */
  length: number;
  /** สูง (ซม.) */
  height: number;
  /** คิว (fvolume ตามที่เขียนลงคอลัมน์จริง — ดิบ ไม่คูณกล่อง) */
  cbm: number;
};

/** หนึ่งบรรทัดของประวัติ = การกด "บันทึก" หนึ่งครั้ง */
export type DimensionAuditEntry = {
  /** created_at ของ admin_audit_log (UTC ISO — จอต้อง render ผ่าน formatThaiDateTime) */
  at: string;
  /** ชื่อ-นามสกุลคนแก้ (จาก profiles) — "" ถ้าหาไม่เจอ */
  adminName: string;
  /** ล็อกอิน เช่น "admin_ploy" (จาก admin_contact_extras.legacy_admin_id) — "" ถ้าไม่มี */
  adminLogin: string;
  before: DimensionSnapshot;
  after: DimensionSnapshot;
  /** ขนาดหรือคิวเปลี่ยนจริงไหม (false = กดเซฟซ้ำค่าเดิม) */
  changed: boolean;
  /** คิว after − before (บวก = เพิ่ม · ลบ = หด) */
  cbmDelta: number;
};

export type DimensionAuditSeverity = "ok" | "watch" | "alert";

export type DimensionAuditSummary = {
  /** จำนวนครั้งที่กดบันทึกทั้งหมด (รวมกดซ้ำค่าเดิม) */
  totalEdits: number;
  /** จำนวนครั้งที่ค่าเปลี่ยนจริง */
  realChanges: number;
  /** ครั้งล่าสุดที่ค่าเปลี่ยนจริง (null = ไม่เคยเปลี่ยน) */
  lastRealChange: DimensionAuditEntry | null;
  /** ผลรวมคิวที่ถูกหดลง (นับเฉพาะครั้งที่ delta ติดลบ · เป็นค่าบวกเสมอ) */
  cbmReducedTotal: number;
  /** คิวรวมของแถวตอนนี้ (ที่ส่งเข้ามา) */
  currentCbm: number | null;
  /** คิวที่ MOMO วัด/เก็บเงินเรา (null = ไม่มีแถว staging เทียบ) */
  momoCbm: number | null;
  /** momoCbm − currentCbm — บวก = เราเก็บลูกค้าบนคิวที่น้อยกว่าที่จ่าย MOMO */
  cbmShortfall: number;
  /** ประเมินเงินที่เก็บขาด = cbmShortfall × เรทขาย ฿/คิว (null = ไม่รู้เรท) */
  shortfallThb: number | null;
  /** คิวปัจจุบันต่างจาก MOMO เกิน tolerance ไหม (ทั้งสองทิศ) */
  divergesFromMomo: boolean;
  severity: DimensionAuditSeverity;
  /** ข้อความไทยพร้อมแสดงบนจอ */
  messageTh: string;
};

/**
 * ความคลาดเคลื่อนที่ยอมให้ตอนเทียบคิว (คิว). 0.005 = ครึ่งของทศนิยมตำแหน่งที่ 2 —
 * กันเศษปัดจากการ round ระหว่างทางไม่ให้กลายเป็นข้อกล่าวหา.
 */
export const CBM_TOLERANCE = 0.005;

/** ความคลาดเคลื่อนตอนเทียบว่า "ค่าเปลี่ยนจริงไหม" — เล็กกว่า tolerance ข้างบนมาก */
const EQ_EPSILON = 1e-6;

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const same = (a: number, b: number): boolean => Math.abs(a - b) <= EQ_EPSILON;

/** "4.1832" — คิวโชว์ 4 ตำแหน่ง (ตรงกับที่ MOMO/แพคกิ้งลิสรายงาน) */
function fmtCbm(n: number): string {
  return n.toFixed(4);
}

/** "713.44" / "1,234.50" — เงินไทย 2 ตำแหน่ง + คั่นหลักพัน (deterministic ไม่พึ่ง locale) */
function fmtBaht(n: number): string {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${d}`;
}

/** ป้ายชื่อคนแก้ — "ขวัญเรือน บัวหลาง (admin_ploy)" · เหลืออันไหนก็ใช้อันนั้น */
export function describeEditor(entry: Pick<DimensionAuditEntry, "adminName" | "adminLogin">): string {
  const name = entry.adminName.trim();
  const login = entry.adminLogin.trim();
  if (name && login) return `${name} (${login})`;
  if (name) return name;
  if (login) return login;
  return "ไม่ทราบผู้แก้ไข";
}

/**
 * ประกอบหนึ่งบรรทัดประวัติจาก payload ที่อ่านมา — คิด `changed` + `cbmDelta` ให้เลย
 * (loader เรียกตัวนี้ เพื่อให้กฎ "เปลี่ยนจริง" อยู่ที่เดียวและเทสได้).
 *
 * "เปลี่ยนจริง" = กว้าง/ยาว/สูง/คิว ตัวใดตัวหนึ่งต่างจากเดิม — **น้ำหนักไม่นับ**
 * (owner ถามเรื่อง "ขนาด"; น้ำหนักมีสายตรวจของตัวเองอยู่แล้ว).
 */
export function toDimensionAuditEntry(input: {
  at: string;
  adminName?: string | null;
  adminLogin?: string | null;
  before: { width: unknown; length: unknown; height: unknown; cbm: unknown };
  after: { width: unknown; length: unknown; height: unknown; cbm: unknown };
}): DimensionAuditEntry {
  const before: DimensionSnapshot = {
    width: num(input.before.width),
    length: num(input.before.length),
    height: num(input.before.height),
    cbm: num(input.before.cbm),
  };
  const after: DimensionSnapshot = {
    width: num(input.after.width),
    length: num(input.after.length),
    height: num(input.after.height),
    cbm: num(input.after.cbm),
  };
  const changed =
    !same(before.width, after.width) ||
    !same(before.length, after.length) ||
    !same(before.height, after.height) ||
    !same(before.cbm, after.cbm);
  return {
    at: input.at,
    adminName: (input.adminName ?? "").trim(),
    adminLogin: (input.adminLogin ?? "").trim(),
    before,
    after,
    changed,
    cbmDelta: round(after.cbm - before.cbm, 6),
  };
}

/**
 * สรุปผลของทั้งแถว — จอใช้ผลลัพธ์นี้ตัวเดียว (ป้ายเตือน + ข้อความ + ปุ่มกางประวัติ).
 *
 * @param entries    ประวัติของแถวนั้น (เรียงใหม่→เก่า หรือเก่า→ใหม่ ก็ได้ — ตัวนี้เรียงเอง)
 * @param currentCbm คิว "รวมของแถว" ตอนนี้ (ผ่าน totalCbmOf) · null = ไม่รู้
 * @param momoCbm    คิวที่ MOMO วัด (momo_import_tracks.cbm) · null = ไม่มีแถว staging
 * @param cbmSellRate เรทขาย ฿/คิว ของแถวนั้น (จาก engine เดียวกับที่คิดราคา) · null = ไม่รู้
 */
export function summarizeDimensionAudit(
  entries: DimensionAuditEntry[],
  opts: {
    currentCbm?: number | null;
    momoCbm?: number | null;
    cbmSellRate?: number | null;
  } = {},
): DimensionAuditSummary {
  const currentCbm =
    opts.currentCbm != null && Number.isFinite(opts.currentCbm) ? opts.currentCbm : null;
  const momoCbm =
    opts.momoCbm != null && Number.isFinite(opts.momoCbm) && opts.momoCbm > 0 ? opts.momoCbm : null;
  const cbmSellRate =
    opts.cbmSellRate != null && Number.isFinite(opts.cbmSellRate) && opts.cbmSellRate > 0
      ? opts.cbmSellRate
      : null;

  // เรียงใหม่→เก่า (จอโชว์ล่าสุดบนสุด · lastRealChange = ตัวแรกที่ changed)
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const real = sorted.filter((e) => e.changed);
  const lastRealChange = real[0] ?? null;

  const cbmReducedTotal = round(
    real.reduce((s, e) => (e.cbmDelta < 0 ? s + Math.abs(e.cbmDelta) : s), 0),
    6,
  );
  const anyReduction = real.some((e) => e.cbmDelta < 0);

  const cbmShortfall =
    momoCbm != null && currentCbm != null ? round(momoCbm - currentCbm, 6) : 0;
  const divergesFromMomo =
    momoCbm != null && currentCbm != null && Math.abs(momoCbm - currentCbm) > CBM_TOLERANCE;
  // เก็บขาด = คิวเราต่ำกว่า MOMO เท่านั้น (คิวเราสูงกว่า = เก็บเกิน ไม่ใช่เคสนี้)
  const underCharging = cbmShortfall > CBM_TOLERANCE;
  const shortfallThb =
    underCharging && cbmSellRate != null ? round(cbmShortfall * cbmSellRate, 2) : null;

  let severity: DimensionAuditSeverity;
  if (real.length === 0) severity = "ok";
  else if (underCharging && anyReduction) severity = "alert";
  else severity = "watch";

  const lastBy = lastRealChange ? describeEditor(lastRealChange) : "";

  let messageTh: string;
  if (severity === "alert") {
    const head =
      `⚠ คิวถูกแก้ให้เล็กกว่าที่ MOMO วัด ` +
      `(MOMO ${fmtCbm(momoCbm as number)} · ระบบ ${fmtCbm(currentCbm as number)})`;
    messageTh =
      shortfallThb != null
        ? `${head} — เก็บลูกค้าขาด ฿${fmtBaht(shortfallThb)} · แก้ล่าสุดโดย ${lastBy}`
        : `${head} — ต่างกัน ${fmtCbm(cbmShortfall)} คิว · แก้ล่าสุดโดย ${lastBy}`;
  } else if (severity === "watch") {
    const tail =
      momoCbm == null
        ? "ยังไม่มีเลข MOMO ไว้เทียบ"
        : divergesFromMomo
          ? `คิวต่างจาก MOMO ${fmtCbm(Math.abs(cbmShortfall))} คิว (ระบบสูงกว่า)`
          : "ยอดคิวยังตรงกับที่ MOMO วัด";
    messageTh =
      `มีการแก้ขนาด/คิวจริง ${real.length} ครั้ง จากทั้งหมด ${sorted.length} ครั้ง ` +
      `— ล่าสุดโดย ${lastBy} · ${tail}`;
  } else {
    messageTh =
      sorted.length === 0
        ? "ไม่เคยมีการแก้ขนาด"
        : `กดบันทึก ${sorted.length} ครั้ง แต่ค่าไม่เคยเปลี่ยน (กดเซฟซ้ำ)`;
  }

  return {
    totalEdits: sorted.length,
    realChanges: real.length,
    lastRealChange,
    cbmReducedTotal,
    currentCbm,
    momoCbm,
    cbmShortfall,
    shortfallThb,
    divergesFromMomo,
    severity,
    messageTh,
  };
}
