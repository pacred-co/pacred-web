/**
 * "บรรทัดนี้เก็บเงินแทนพี่น้องที่ไม่ได้อยู่บนเอกสาร" — ตัวตัดสินที่เดียว.
 *
 * owner 2026-07-24 (จาก FRI2607-00071 / ใบเสร็จ 15200 / forwarder 52305):
 * *"ยอดเก็บเงินเขามาถูกตรงแล้ว แต่นายแจงรายละเอียดของชิปเม้น แทรคกิ้ง จำนวนสินค้า
 * ที่ลูกค้าได้รับจริงๆ ไม่ตรงกันนะครับ"*
 *
 * ── อาการ ────────────────────────────────────────────────────────────────
 * ชิปเม้น `800206224068` (PR079) แตกเป็น 8 แถว รวม **13 กล่อง · 249 kg · ฿4,980**
 * ตอนวางบิล เครื่องคิดเงินคิดเป็น "ทั้งชิปเม้น" ถูกต้อง → เขียนบรรทัดเดียว
 * `forwarder_id = 52305` (แถว anchor) `amount_thb = ฿4,980` ✅ เงินถูก
 * แต่ตัวเรนเดอร์เอกสารอ่าน **แถว anchor แถวเดียว** → พิมพ์ "3 กล่อง · 46.50 kg"
 * ⇒ ลูกค้าจ่าย ฿4,980 แต่บนกระดาษเห็นแค่ 3 กล่อง (หายไป 10 กล่อง / 7 แทรคกิ้ง)
 *
 * ── ทำไมแก้ตรงนี้ถึงซ่อมเอกสารเก่าได้ด้วย ────────────────────────────────
 * `amount_thb` = เงิน **แช่ไว้บนบรรทัด** (frozen · ไม่ถูกคิดใหม่) แต่ กล่อง/น้ำหนัก/คิว
 * **เรนเดอร์สด** จาก tb_forwarder → แก้ตัวเรนเดอร์ = ใบเก่าที่จ่ายไปแล้วก็แจงถูกทันที
 * **โดยไม่แตะเงินสักบาท** (ห้ามแตะ — ใบจ่ายแล้ว/ใบเสร็จ frozen ตามกฎ G1)
 *
 * ── กติกา fold (แคบ · fail-CLOSED) ───────────────────────────────────────
 * ยุบเป็น "ทั้งชิปเม้น" ก็ต่อเมื่อครบ 3 ข้อ:
 *   1. ครอบครัวนี้มีหลายแถวใน DB (`familyRows > 1`)
 *   2. บนเอกสารใบนี้มีแถวของครอบครัวนี้ **แถวเดียว** (พี่น้องไม่ได้ถูกแจงแยก)
 *   3. ยอดบนบรรทัด > ยอดของแถวตัวเอง (พิสูจน์ว่ามันเก็บเงินแทนพี่น้องจริง)
 * ถ้าเอกสารแจงพี่น้องครบอยู่แล้ว (290/291 บรรทัดบน prod) → **ไม่แตะ** แต่ละบรรทัด
 * พิมพ์ค่าของตัวเองเหมือนเดิมเป๊ะ = zero regression.
 */

/** ตัดท้าย `-N` / `-N/M` → เลขชิปเม้น (คอนเวนชันเดียวกับทั้งระบบ). */
export function baseTrackingOf(tracking: string | null | undefined): string {
  return (tracking ?? "").trim().replace(/-\d+(\/\d+)?$/, "");
}

export type CoverageRow = {
  id: number;
  ftrackingchn: string;
  /** จำนวนกล่อง */
  famount: number;
  /** น้ำหนักรวมของแถว (kg) */
  fweight: number;
  /** คิวรวมของแถว — ผู้เรียกต้องผ่าน totalCbmOf มาแล้ว (กฎ famountcount) */
  totalCbm: number;
  /** ค่าขนส่งของแถวเอง — ใช้พิสูจน์ว่าบรรทัดเก็บเงินเกินตัวเอง */
  freight: number;
};

export type CoverageInput = {
  /** บรรทัดบนเอกสาร: forwarder id + ยอดที่แช่ไว้ */
  lines: Array<{ forwarderId: number; amountThb: number }>;
  /** แถวของบรรทัดเหล่านั้น (จาก tb_forwarder) */
  lineRows: Map<number, CoverageRow>;
  /** ทุกแถวในครอบครัว keyed by base — รวมแถวที่ไม่ได้อยู่บนเอกสาร */
  familyByBase: Map<string, CoverageRow[]>;
};

export type LineCoverage = {
  /** พิมพ์ค่าไหนบนเอกสาร */
  famount: number;
  fweight: number;
  totalCbm: number;
  /** ค่าขนส่งที่ควรโชว์ (ทั้งชิปเม้นเมื่อ fold) */
  freight: number;
  /** ยุบเป็นทั้งชิปเม้นหรือเปล่า */
  folded: boolean;
  /** แทรคกิ้งพี่น้องที่บรรทัดนี้เก็บเงินแทน (ไม่รวมตัวมันเอง) — โชว์ใต้เลขแทรคกิ้ง */
  coveredTrackings: string[];
};

/** ตัดสินทีละบรรทัดว่าพิมพ์ค่าของตัวเอง หรือค่าทั้งชิปเม้น. */
export function resolveLineCoverage(input: CoverageInput): Map<number, LineCoverage> {
  const { lines, lineRows, familyByBase } = input;

  // มีแถวของครอบครัวไหนอยู่บนเอกสารนี้กี่แถว
  const onDocByBase = new Map<string, number>();
  for (const l of lines) {
    const row = lineRows.get(l.forwarderId);
    if (!row) continue;
    const base = baseTrackingOf(row.ftrackingchn);
    onDocByBase.set(base, (onDocByBase.get(base) ?? 0) + 1);
  }

  const out = new Map<number, LineCoverage>();
  for (const l of lines) {
    const row = lineRows.get(l.forwarderId);
    if (!row) continue;
    const base = baseTrackingOf(row.ftrackingchn);
    const fam = familyByBase.get(base) ?? [];

    const own: LineCoverage = {
      famount: row.famount,
      fweight: row.fweight,
      totalCbm: row.totalCbm,
      freight: row.freight,
      folded: false,
      coveredTrackings: [],
    };

    // เงื่อนไข fold — ครบทั้ง 3 เท่านั้น (ห้ามเดา)
    const familyHasMore = fam.length > 1;
    const aloneOnDoc = (onDocByBase.get(base) ?? 0) === 1;
    // ยอมเศษ 2% กันเคสปัดสตางค์ — ต้อง "เกินจริง" ไม่ใช่เท่ากัน
    const billsBeyondSelf = l.amountThb > row.freight * 1.02;

    if (!(familyHasMore && aloneOnDoc && billsBeyondSelf)) {
      out.set(l.forwarderId, own);
      continue;
    }

    const sum = (pick: (r: CoverageRow) => number) => fam.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
    out.set(l.forwarderId, {
      famount: sum((r) => r.famount),
      fweight: sum((r) => r.fweight),
      totalCbm: sum((r) => r.totalCbm),
      freight: sum((r) => r.freight),
      folded: true,
      coveredTrackings: fam
        .filter((r) => r.id !== row.id)
        .map((r) => r.ftrackingchn)
        .sort(),
    });
  }
  return out;
}

/**
 * ตัวตัดสินสำหรับ **ใบเสร็จ** — ยอดต่อบรรทัดของใบเสร็จ *ไม่ได้แช่ไว้* (คิดสดจากคอลัมน์ราคา
 * ของแต่ละแถว) จึงใช้เกณฑ์ "ยอดบนบรรทัดเกินตัวเอง" ไม่ได้. ใช้ **ยอดรวมของเอกสาร** แทน:
 * ยุบก็ต่อเมื่อการยุบทำให้เอกสาร **กระทบยอดได้ดีขึ้น** และ **ไม่ล้นยอดที่เก็บจริง**.
 *
 * เคสจริง FRC2607-00024 (PR079): ramount ฿6,444.81 แต่ Σ บรรทัดที่แจง = ฿2,459.91
 * → ขาด ฿3,984.90 เพราะพี่น้อง 7 แถวของ 800206224068 ไม่ได้ถูกแจง.
 *
 * @param docTotal ยอดรวมที่เก็บจริงบนเอกสาร (ก่อนหัก ณ ที่จ่าย — ผู้เรียกส่ง gross มา)
 * @param lineTotalOf ยอดต่อบรรทัดตามที่เอกสารคิด (สูตรของใบเสร็จเอง) จากแถวหนึ่งๆ
 */
export function resolveReceiptLineCoverage(input: {
  lines: Array<{ forwarderId: number }>;
  lineRows: Map<number, CoverageRow>;
  familyByBase: Map<string, CoverageRow[]>;
  docTotal: number;
  lineTotalOf: (row: CoverageRow) => number;
}): Map<number, LineCoverage> {
  const { lines, lineRows, familyByBase, docTotal, lineTotalOf } = input;

  const onDocByBase = new Map<string, number>();
  for (const l of lines) {
    const r = lineRows.get(l.forwarderId);
    if (!r) continue;
    const b = baseTrackingOf(r.ftrackingchn);
    onDocByBase.set(b, (onDocByBase.get(b) ?? 0) + 1);
  }

  // Σ ถ้าพิมพ์ค่าของตัวเองล้วน (สภาพปัจจุบัน)
  let sumOwn = 0;
  for (const l of lines) {
    const r = lineRows.get(l.forwarderId);
    if (r) sumOwn += lineTotalOf(r);
  }

  // ผู้สมัคร fold: ครอบครัวหลายแถว + อยู่บนเอกสารแถวเดียว
  const candidates = new Set<number>();
  let sumFolded = sumOwn;
  for (const l of lines) {
    const r = lineRows.get(l.forwarderId);
    if (!r) continue;
    const b = baseTrackingOf(r.ftrackingchn);
    const fam = familyByBase.get(b) ?? [];
    if (fam.length > 1 && (onDocByBase.get(b) ?? 0) === 1) {
      candidates.add(l.forwarderId);
      sumFolded += fam.reduce((s, x) => s + lineTotalOf(x), 0) - lineTotalOf(r);
    }
  }

  // fail-CLOSED: ยุบก็ต่อเมื่อ (ก) ตอนนี้แจงขาดจริง (ข) ยุบแล้วไม่ล้นยอดที่เก็บ
  const shortNow = docTotal > 0 && sumOwn < docTotal * 0.99;
  const foldFits = docTotal > 0 && sumFolded <= docTotal * 1.02;
  const doFold = shortNow && foldFits && candidates.size > 0;

  const out = new Map<number, LineCoverage>();
  for (const l of lines) {
    const r = lineRows.get(l.forwarderId);
    if (!r) continue;
    const b = baseTrackingOf(r.ftrackingchn);
    const fam = familyByBase.get(b) ?? [];
    if (!doFold || !candidates.has(l.forwarderId)) {
      out.set(l.forwarderId, {
        famount: r.famount, fweight: r.fweight, totalCbm: r.totalCbm,
        freight: r.freight, folded: false, coveredTrackings: [],
      });
      continue;
    }
    const sum = (pick: (x: CoverageRow) => number) => fam.reduce((s, x) => s + (Number(pick(x)) || 0), 0);
    out.set(l.forwarderId, {
      famount: sum((x) => x.famount),
      fweight: sum((x) => x.fweight),
      totalCbm: sum((x) => x.totalCbm),
      freight: sum((x) => x.freight),
      folded: true,
      coveredTrackings: fam.filter((x) => x.id !== r.id).map((x) => x.ftrackingchn).sort(),
    });
  }
  return out;
}

/**
 * ย่อรายการแทรคกิ้งพี่น้องให้ "คนอ่านออก" บนเอกสาร.
 *
 * 🔴 owner 2026-07-24 (รอบ 2): *"ได้ดูไหมครับเนี่ยว่าทำอะไรออกมา ให้เอาเอกสาร
 * ไปส่งสภาพนี้หรอครับ"* — รอบแรกผมพิมพ์เลขเต็มทั้ง 7 ตัว ในคอลัมน์แคบ ผลคือ
 * เลขฐานซ้ำ 7 รอบ (84 ตัวอักษรขยะ) + `break-all` ตัดกลางตัวเลข ("800↵206224068-3")
 * = เอกสารส่งลูกค้าที่อ่านไม่รู้เรื่อง.
 *
 * ตัดเลขฐานที่ซ้ำออก เหลือแต่ท้าย แล้วยุบเลขที่ติดกันเป็นช่วง:
 *   -2 -3 -4 -5 -6 -7 -8        → "รวม 8 กล่องย่อย: -2 ถึง -8"
 *   -2 -3 -7                    → "รวม 4 กล่องย่อย: -2 ถึง -3, -7"
 *   ท้ายไม่ใช่ตัวเลข (คนละแบบ)  → ขึ้นเลขเต็ม (ไม่เดา)
 *
 * @param total จำนวนแทรคกิ้งทั้งชิปเม้น (รวมตัวหลัก) — ใช้บอก "รวม N"
 */
export function formatCoveredTrackings(base: string, covered: string[], total: number): string {
  if (covered.length === 0) return "";
  const label = `รวม ${total} กล่องย่อย`;

  const sfx = covered.map((t) => (t.startsWith(base) ? t.slice(base.length) : t));
  const nums = sfx.map((s) => {
    const m = /^-(\d+)(?:\/\d+)?$/.exec(s);
    return m ? Number(m[1]) : Number.NaN;
  });
  // มีตัวที่ไม่ใช่รูป -N → ไม่ยุบ พิมพ์ท้ายที่มีตามจริง (ยังตัดเลขฐานซ้ำออกให้)
  if (nums.some((n) => !Number.isFinite(n))) return `${label}: ${sfx.join(", ")}`;

  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0]!;
  let prev = start;
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? `-${start}` : `-${start} ถึง -${prev}`);
    start = n;
    prev = n;
  }
  parts.push(start === prev ? `-${start}` : `-${start} ถึง -${prev}`);
  return `${label}: ${parts.join(", ")}`;
}
