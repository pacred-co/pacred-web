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
 * แจกเป็นหลายบรรทัดก็ต่อเมื่อครบ 3 ข้อ:
 *   1. ครอบครัวนี้มีหลายแถวใน DB (`familyRows > 1`)
 *   2. บนเอกสารใบนี้มีแถวของครอบครัวนี้ **แถวเดียว** (พี่น้องไม่ได้ถูกแจงแยก)
 *   3. ยอดบนบรรทัด > ยอดของแถวตัวเอง (พิสูจน์ว่ามันเก็บเงินแทนพี่น้องจริง)
 * ถ้าเอกสารแจงพี่น้องครบอยู่แล้ว (290/291 บรรทัดบน prod) → **ไม่แตะ** แต่ละบรรทัด
 * พิมพ์ค่าของตัวเองเหมือนเดิมเป๊ะ = zero regression.
 *
 * ── 🔴 รอบ 3: แจงแยก ไม่ใช่ยุบ (owner 2026-07-24) ────────────────────────
 * *"มันต้องแจงตามแทรคกิ้งเลยไหมครับ ไม่เห็นเหมือนรายการเพื่อนๆ อื่นๆ เลยครับ"*
 * รอบก่อนผมยุบเป็นบรรทัดเดียวเขียนว่า "รวม 8 กล่องย่อย" — **ผิดแนว** เพราะบนใบ
 * เดียวกันนั้น ชิปเม้น 760235240370 ถูกแจงเป็น 3 บรรทัดแยกอยู่แล้ว (แถว 3·6·7)
 * → เอกสารต้องมี **1 บรรทัด = 1 แทรคกิ้ง** เหมือนกันหมด ไม่ใช่บางชิปเม้นยุบ บางอันแจง
 * (หน้าตรวจตู้ก็แจง 8 แถว + "รวม 8 แทรคกิง 13" อยู่แล้ว = เอกสารต้องตรงกับที่พนักงานเห็น)
 *
 * เงินยังแช่เท่าเดิม: ยอดที่แช่บนบรรทัด (amount_thb) ถูก **แบ่งตามค่าขนส่งของแต่ละแถว**
 * แล้วโยนเศษสตางค์ไว้แถวสุดท้าย → **Σ บรรทัดที่พิมพ์ = ยอดที่แช่ เป๊ะถึงสตางค์เสมอ**
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
  /** ค่าขนส่งของแถวเอง — ใช้ทั้งพิสูจน์ว่าบรรทัดเก็บเงินเกินตัวเอง และเป็นสัดส่วนแบ่งยอด */
  freight: number;
};

/** บรรทัดที่จะพิมพ์จริงบนเอกสาร (1 บรรทัด = 1 แทรคกิ้ง). */
export type DocLine = {
  /** id ของบรรทัดต้นทาง (ใช้เป็น key + ลิงก์กลับออเดอร์) */
  sourceLineId: number;
  /** แถว forwarder ที่บรรทัดนี้แทน */
  row: CoverageRow;
  /** ยอดที่พิมพ์ในคอลัมน์จำนวนเงิน — Σ ของกลุ่มเดียวกัน = ยอดที่แช่ไว้เป๊ะ */
  amountThb: number;
  /** บรรทัดนี้ถูกแตกออกมาจากบรรทัดที่เก็บเงินรวมหรือเปล่า (ใช้ debug/ตรวจ) */
  expanded: boolean;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * แบ่งยอดที่แช่ไว้ให้แต่ละแทรคกิ้งตามสัดส่วนค่าขนส่ง — เศษสตางค์ไปแถวสุดท้าย
 * เพื่อให้ Σ = ยอดเดิมเป๊ะเสมอ (บัญชีกระทบยอดได้).
 */
function allocate(amountThb: number, rows: CoverageRow[]): number[] {
  const base = rows.reduce((s, r) => s + r.freight, 0);
  if (!(base > 0)) {
    // ไม่มีสัดส่วนให้ยึด → เฉลี่ยเท่ากัน เศษไว้แถวสุดท้าย
    const each = r2(amountThb / rows.length);
    const out = rows.map(() => each);
    out[out.length - 1] = r2(amountThb - each * (rows.length - 1));
    return out;
  }
  const out = rows.map((r) => r2((amountThb * r.freight) / base));
  out[out.length - 1] = r2(amountThb - out.slice(0, -1).reduce((s, n) => s + n, 0));
  return out;
}

/**
 * แปลง "บรรทัดที่เก็บไว้ในฐานข้อมูล" → "บรรทัดที่พิมพ์บนเอกสาร".
 * ปกติ 1:1 · บรรทัดที่เก็บเงินแทนทั้งชิปเม้นจะถูกแตกเป็น 1 บรรทัดต่อแทรคกิ้ง.
 */
export function expandDocLines(input: {
  lines: Array<{ id: number; forwarderId: number; amountThb: number }>;
  lineRows: Map<number, CoverageRow>;
  familyByBase: Map<string, CoverageRow[]>;
}): DocLine[] {
  const { lines, lineRows, familyByBase } = input;

  const onDocByBase = new Map<string, number>();
  for (const l of lines) {
    const r = lineRows.get(l.forwarderId);
    if (!r) continue;
    const b = baseTrackingOf(r.ftrackingchn);
    onDocByBase.set(b, (onDocByBase.get(b) ?? 0) + 1);
  }

  const out: DocLine[] = [];
  for (const l of lines) {
    const row = lineRows.get(l.forwarderId);
    if (!row) continue;
    const base = baseTrackingOf(row.ftrackingchn);
    const fam = familyByBase.get(base) ?? [];

    const expandable =
      fam.length > 1 &&
      (onDocByBase.get(base) ?? 0) === 1 &&
      l.amountThb > row.freight * 1.02;   // เกินเศษปัด = เก็บแทนพี่น้องจริง

    if (!expandable) {
      out.push({ sourceLineId: l.id, row, amountThb: l.amountThb, expanded: false });
      continue;
    }
    // เรียงตามเลขท้าย (ตัวหลักมาก่อน) ให้ตรงลำดับที่หน้าตรวจตู้แสดง
    const sorted = [...fam].sort((a, b2) => {
      const n = (t: string) => {
        const m = /-(\d+)(?:\/\d+)?$/.exec(t);
        return m ? Number(m[1]) : 0;
      };
      return n(a.ftrackingchn) - n(b2.ftrackingchn);
    });
    const amounts = allocate(l.amountThb, sorted);
    sorted.forEach((r, i) => {
      out.push({ sourceLineId: l.id, row: r, amountThb: amounts[i]!, expanded: true });
    });
  }
  return out;
}
