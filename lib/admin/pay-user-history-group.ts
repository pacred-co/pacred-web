/**
 * จ่ายเงินแทนลูกค้า — ตัวจัดกลุ่ม "รอบชำระ" (PURE · display-only · ไม่มี DB · ไม่มีเงิน).
 *
 * รูปทรงข้อมูล (legacy pay-users.php + adminPay*WithTopUp — ห้ามเดาใหม่):
 *   1 การชำระ = แถวหัว type='1' (สลิป + **ยอดรวมที่ลูกค้าโอนจริง** · reforder2 ว่าง)
 *   + ลูก type='2'/'4' หลายแถว (reforder=เลขออเดอร์ · reforder2=<id แถวหัว> · ไม่มีสลิป).
 * หน้า LIST ดึงเฉพาะลูก (type IN 2,4) → เดิม 1 การโอนโชว์ 6 แถว = owner:
 * "ยังแยกเป็นแทรกกิ้ง แทนที่จะกรุปเป็นงาน ชิปเม้นๆ หรือ เป็นรอบชำระ".
 *
 * ตัวนี้ตัดสินว่าแถวของหน้าปัจจุบันควร render เป็นอะไร:
 *   • group  — ลูกที่ reforder2 ชี้หัว type='1' ที่หาเจอ → ยุบเหลือแถวเดียวต่อรอบชำระ
 *              (children = ชุดเต็มจาก sibling-fetch แม้บางตัวคร่อมไปอยู่หน้าอื่น)
 *   • single — แถวเดี่ยวแบบเดิม (ไม่มี reforder2 · หัวหาไม่เจอ/ไม่ใช่ type='1' · หรือ
 *              ดึงชุดลูกไม่สำเร็จ [brokenHeaderIds] — ชุดไม่ครบห้ามกรุ๊ป กันคำเตือน Σ มั่ว)
 *
 * กันกรุ๊ปโผล่ซ้ำข้ามหน้า (ลูกชุดเดียวกันคร่อม page boundary):
 *   • ไม่มีคำค้น → กรุ๊ปโผล่เฉพาะหน้าที่มี "ลูกใหม่สุดของทั้งชุด" (sibling-fetch ใช้ filter
 *     ชุดเดียวกับ query หลัก จึงเทียบได้เป๊ะ) — ไม่ซ้ำ ไม่หาย เด็ดขาด.
 *   • มีคำค้น → เทียบชุด eligible แบบเป๊ะไม่ได้ (ilike + wildcard `%`/`_` จำลองใน JS
 *     ไม่ตรง 100%) → โผล่ที่หน้าแรกที่เจอลูกแมตช์; ลูกแมตช์หลายตัวคร่อมหน้า = กรุ๊ปโผล่
 *     ครบทั้งสองหน้า (ยอมรับ — กันงานหายสำคัญกว่ากันโผล่ซ้ำ · display-only).
 */

/** แถวดิบ tb_wallet_hs เท่าที่หน้า history ใช้ (คอลัมน์ lowercase ตามตารางจริง). */
export type PayUserHsRow = {
  id: number;
  date: string | null;
  userid: string | null;
  amount: number | string | null;
  type: string | null;
  status: string | null;
  reforder: string | null;
  reforder2: number | string | null;
  adminidcrate: string | null;
};

export type PayUserHistoryPlanEntry =
  | { kind: "single"; row: PayUserHsRow }
  | { kind: "group"; headerId: number; header: PayUserHsRow; children: PayUserHsRow[] };

/** id แถวหัวรอบชำระจาก reforder2 (bigint/string ปนกันในข้อมูลเก่า) — ไม่ใช่เลขหัว → null. */
export function walletHeaderIdOf(row: Pick<PayUserHsRow, "reforder2">): number | null {
  const text = String(row.reforder2 ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ใหม่สุดก่อน — date desc แล้ว id desc (ลูกชุดเดียวกันเขียนเวลาเดียวกัน → id ชี้ขาด). */
function newestFirst(a: PayUserHsRow, b: PayUserHsRow): number {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) return da > db ? -1 : 1;
  return Number(b.id) - Number(a.id);
}

export function planPayUserHistoryEntries(args: {
  /** แถวของหน้าปัจจุบัน ตามลำดับ query (date desc, id desc). */
  pageRows: PayUserHsRow[];
  /** แถวหัวที่ resolve มา (จะถูกกรองเหลือเฉพาะ type='1' ในนี้). */
  headers: PayUserHsRow[];
  /** ลูกทุกแถวของหัวเหล่านั้น (ชุดเต็ม — เผื่อลูกคร่อมหน้า). */
  siblings: PayUserHsRow[];
  /** หัวที่ดึงชุดลูกไม่สำเร็จ → ห้ามกรุ๊ป (render เดี่ยวแบบเดิม). */
  brokenHeaderIds?: Iterable<number>;
  /** true = query หลักมีเงื่อนไขค้นหา (ilike) — ใช้โหมดกันหายแทนโหมดกันซ้ำ. */
  hasQuery: boolean;
}): PayUserHistoryPlanEntry[] {
  const { pageRows, headers, siblings, hasQuery } = args;
  const broken = new Set<number>(args.brokenHeaderIds ?? []);

  // หัวที่ใช้ได้ = type='1' เท่านั้น (reforder2 ยุคเก่าอาจชี้อย่างอื่น → ไม่กรุ๊ป)
  const headerById = new Map<number, PayUserHsRow>();
  for (const h of headers) {
    if (String(h.type ?? "") === "1") headerById.set(Number(h.id), h);
  }

  // รวมลูกต่อหัว (แถวหน้านี้ ∪ sibling-fetch · dedup ด้วย id)
  const childrenByHid = new Map<number, Map<number, PayUserHsRow>>();
  const addChild = (r: PayUserHsRow) => {
    const hid = walletHeaderIdOf(r);
    if (hid == null || broken.has(hid) || !headerById.has(hid)) return;
    const m = childrenByHid.get(hid) ?? new Map<number, PayUserHsRow>();
    m.set(Number(r.id), r);
    childrenByHid.set(hid, m);
  };
  for (const r of pageRows) addChild(r);
  for (const r of siblings) addChild(r);

  const pageIds = new Set(pageRows.map((r) => Number(r.id)));
  const emitted = new Set<number>();
  const entries: PayUserHistoryPlanEntry[] = [];

  for (const r of pageRows) {
    const hid = walletHeaderIdOf(r);
    const groupable = hid != null && !broken.has(hid) && headerById.has(hid);
    if (!groupable || hid == null) {
      entries.push({ kind: "single", row: r });
      continue;
    }
    if (emitted.has(hid)) continue; // ลูกตัวถัดไปของชุดที่ render ไปแล้วบนหน้านี้

    const children = [...(childrenByHid.get(hid)?.values() ?? [r])].sort(newestFirst);
    if (!hasQuery) {
      // ลูกใหม่สุดของทั้งชุดไม่อยู่หน้านี้ = ชุดนี้ render ไปแล้วบนหน้าก่อนหน้า (ใหม่กว่า) → ข้าม
      const anchor = children[0];
      if (anchor && !pageIds.has(Number(anchor.id))) continue;
    }

    emitted.add(hid);
    entries.push({ kind: "group", headerId: hid, header: headerById.get(hid)!, children });
  }

  return entries;
}
