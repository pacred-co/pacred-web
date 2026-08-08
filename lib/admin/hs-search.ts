/**
 * hs-search.ts — SOT การค้นหาในคลังพิกัด (HS) · PURE (ไม่มี DB/IO)
 *
 * owner 2026-08-08: *"คลัง HS CODE กำลังจะให้พนักงานมาใช้จริงกันแล้ว … เรื่องชื่อ
 * อ่านดีๆ นะครับ บางทีน้องมาหาคำมันอาจจะกำกวม **หาไม่เจอ** หรืออาจจะ**พิมพ์ผิด**
 * เลยหาไม่เจอ … มันช่วยพนักงานทำงานได้ง่ายขึ้นอีกหลายชีวิตเลยครับ"*
 *
 * ปัญหาจริงที่ทำให้ "มีของแต่หาไม่เจอ" (ดูจากแชทถามพิกัด 2 กลุ่ม ~300 คำถาม):
 *   ① สะกดไทยได้หลายแบบ  สติ๊กเกอร์ / สติกเกอร์ / สติ้กเกอร์ · โช้คอัพ / โช๊คอัพ
 *   ② พิมพ์ผิดจริง        "พวงมาลัยรถยนตร์" (ตร) · "ตลับกุญเเจ" (เเ) · "ฟรอมอี"
 *   ③ เรียกคนละคำ         ลาเบล = ฉลาก = label · พาเลท = พาเรท = pallet
 *   ④ ลำดับคำสลับ         "เครื่องผสมปูน" vs "ปูนเครื่องผสม"
 *   ⑤ พิมพ์แค่บางส่วน      "โซล่า" ควรเจอ "แผงโซลาร์เซลล์"
 *
 * ⇒ ค้นเป็น **3 ชั้น** · แต่ละชั้นบอกจอได้ว่ามาจากชั้นไหน (จอจะได้แยกป้าย
 *    "ตรงคำ" vs "ใกล้เคียง" ไม่ให้พนักงานสับสนว่าอันไหนเป๊ะ):
 *      exact  — เลขพิกัด หรือ ข้อความตรงตัว (หลัง normalize)
 *      token  — ทุกคำในคำค้นโผล่ครบ (ไม่สนลำดับ) หรือคำพ้อง
 *      fuzzy  — ระยะแก้ไข ≤1-2 ตัวอักษร (พิมพ์ผิด) · ใช้เมื่อ 2 ชั้นแรกไม่เจอ
 */

/** สระ/วรรณยุกต์/ไม้ไต่คู้/การันต์ — ตัดทิ้งก่อนเทียบ (คนละสะกดแต่คำเดียวกัน) */
const TH_MARKS = /[ัิ-ฺ็-๎]/g;

/**
 * normalize สำหรับ "หาเจอ" เท่านั้น — ไม่แตะข้อความที่แสดงหรือที่บันทึก.
 * เก็บพฤติกรรมเดิมของหน้าคลัง HS ไว้ครบ (เเ→แ · ตัดวรรณยุกต์ · ตัดตัวคั่น)
 */
export function normalizeHs(v: string | null | undefined): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/เเ/g, "แ")              // สระเอ 2 ตัว = แ (พิมพ์ผิดที่เจอบ่อยสุดในแชท)
    .replace(TH_MARKS, "")
    .replace(/[\s.\-_/,()[\]{}"'·|+]/g, "");
}

/** ตัวเลขล้วน — เทียบพิกัดข้ามรูปแบบ ("4202.29" ต้องเจอ "42022900") */
export function digitsOnly(v: string | null | undefined): string {
  return String(v ?? "").replace(/[^\d]/g, "");
}

/**
 * คำพ้อง/คำที่พนักงานเรียกสลับกัน — เก็บจากแชทจริง.
 * ทุกคำในกลุ่มเดียวกันค้นแทนกันได้ (normalize แล้วทั้งคู่).
 * เพิ่มกลุ่มใหม่ได้เรื่อยๆ เมื่อเจอเคส "หาไม่เจอ" หน้างาน.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["สติกเกอร์", "สติ๊กเกอร์", "สติ้กเกอร์", "sticker", "ลาเบล", "เลเบล", "ฉลาก", "label"],
  ["พาเลท", "พาเรท", "แพเลท", "pallet", "pallets"],
  ["โช้คอัพ", "โช๊คอัพ", "โช้ค", "damper", "doorcloser", "โช๊ค"],
  ["โซลาร์เซลล์", "โซล่าเซลล์", "โซล่าเซล", "แผงโซลาร์", "solarpanel", "solarcell"],
  ["พวงมาลัย", "พวงมาลัยรถยนตร์", "พวงมาลัยรถยนต์", "steeringwheel"],
  ["ทรายแมว", "catlitter", "เบนทอไนต์", "bentonite", "tofucatlitter"],
  ["เครื่องผสม", "เครื่องปั่นผสม", "มิกเซอร์", "mixer", "ไม้พาย", "mixingpaddle"],
  ["กระดาษ", "paper", "กระดาษคราฟ", "kraftpaper"],
  ["ปั๊มติ๊ก", "fuelpump", "ปั๊มน้ำมัน", "ปั้มติ๊ก"],
  ["คอยล์", "ignitioncoil", "คอยจุดระเบิด"],
  ["ฮู้ด", "hood", "ฮูด", "ดูดควัน", "fumehood"],
  ["เฟอร์นิเจอร์", "furniture", "เฟอนิเจอร์", "เฟอร์นิ"],
  ["อะไหล่รถ", "ส่วนประกอบรถ", "caraccessories", "carparts", "อุปกรณ์ตกแต่งรถ"],
  ["มอเตอร์", "motor", "มอตเตอร์"],
  ["เสื้อ", "เสื้อผ้า", "garment", "apparel", "clothes"],
  ["ท่อ", "tube", "pipe", "hose", "สายยาง"],
  ["ตู้แช่", "freezer", "refrigerator", "ตู้เย็น", "ตู้แช่แข็ง"],
  ["ประตู", "door", "บานประตู", "doorcore"],
  ["ล้อขัด", "ใยขัด", "syntheticfiber", "สก๊อตไบร์ท", "สก๊อตไบรท์"],
  ["กระเบื้องยาง", "pvcfloor", "floorcovering", "spc", "กระเบื้อง"],
];

const SYN_INDEX: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const g of SYNONYM_GROUPS) {
    const norm = g.map((w) => normalizeHs(w)).filter(Boolean);
    for (const w of norm) m.set(w, norm);
  }
  return m;
})();

/** ทุกคำที่ใช้แทนคำนี้ได้ (รวมตัวมันเอง) */
export function expandSynonyms(token: string): string[] {
  const n = normalizeHs(token);
  return SYN_INDEX.get(n) ?? [n];
}

/** ระยะแก้ไข (Levenshtein) แบบตัดจบเร็วเมื่อเกินเพดาน — คำค้นสั้น ถูกกว่าคำนวณเต็ม */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;   // ทั้งแถวเกินเพดานแล้ว = ไม่มีทางกลับมาต่ำ
    prev = cur;
  }
  return prev[b.length];
}

/** พิมพ์ผิดได้กี่ตัว: คำสั้นให้พลาดน้อย (ไม่งั้น "ท่อ" จะไปแมตช์ทุกอย่าง) */
export function fuzzyBudget(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

/** มีคำนี้ (หรือคำพ้อง) อยู่ในข้อความไหม — เทียบแบบ substring หลัง normalize */
function tokenInHaystack(token: string, hay: string): boolean {
  return expandSynonyms(token).some((w) => w.length > 0 && hay.includes(w));
}

/**
 * พิมพ์ผิดแล้วยังพอเดาได้ไหม — เลื่อนหน้าต่างขนาดเท่าคำไปตามข้อความ.
 *
 * 🔴 เดาเฉพาะ **คำที่ผู้ใช้พิมพ์จริง** — ห้ามเดาบนคำพ้องด้วย. คำพ้องคือการบอกว่า
 * "2 คำนี้แทนกันได้" (ต้องเจอแบบตรงตัว) ถ้าเอาไปเดาต่อ ขอบเขตจะบานจนมั่ว:
 * เทสจริงพบว่า ค้น "สติกเกอร์" แล้วลาก พาเลท/โซลาร์เซลล์/พวงมาลัย มาด้วย
 * (เพราะคำพ้อง "ฉลาก"/"ลาเบล" ไปใกล้เคียงกับคำอื่นในแถวพวกนั้น) — พนักงานเห็นแล้วงง
 * และเลิกเชื่อผลค้นหา.
 */
function tokenFuzzyInHaystack(token: string, hay: string): boolean {
  const w = normalizeHs(token);
  const budget = fuzzyBudget(w);
  if (budget === 0 || w.length === 0 || hay.length < w.length - budget) return false;
  const L = w.length;
  for (let i = 0; i + L - budget <= hay.length; i++) {
    for (const len of [L - 1, L, L + 1]) {
      if (len <= 0 || i + len > hay.length) continue;
      if (editDistance(w, hay.slice(i, i + len), budget) <= budget) return true;
    }
  }
  return false;
}

/** แถวในคลังที่เอามาค้น (ไม่ผูกกับ type ของหน้าจอ) */
export type HsSearchable = {
  code: string;
  description?: string | null;
  description_en?: string | null;
  hs_note?: string | null;
  source?: string | null;
  /**
   * ชื่อสินค้าที่เคยใช้เรียกพิกัดนี้ — ตัวช่วยค้นหาหลักของพนักงาน.
   * รับ 2 รูป: object ตาม schema `{th,en,note,src}` (ปกติ) และ string ล้วน
   * (ข้อมูลเก่า/แหล่งอื่น) — ต้องค้นเจอทั้งคู่ ไม่งั้น "มีของแต่หาไม่เจอ" กลับมาอีก.
   */
  product_aliases?: ReadonlyArray<string | { th?: string | null; en?: string | null; note?: string | null }> | null;
};

export type HsMatchKind = "code" | "exact" | "token" | "fuzzy";
export type HsMatch = {
  kind: HsMatchKind;
  /** เตี้ย = ตรงกว่า (ชั้นหยาบ) */
  rank: number;
  /**
   * คะแนนความใกล้ 0..1 (สูง = ใกล้คำที่พิมพ์กว่า) — ใช้เรียงภายในชั้นเดียวกัน
   * owner 2026-08-08: *"ต้องเอาที่ตรงที่สุด ใกล้เคียงที่สุด มาไล่เรียง … ตอนนี้
   * ดูเรียงมาข้ามๆ งง"* — เดิมเรียงตามเลขพิกัดเมื่อชั้นเท่ากัน ทำให้ผลกระโดด.
   */
  score: number;
};

/**
 * ความใกล้ของคำค้นกับ "ชื่อที่สั้นและตรงที่สุด" ในแถวนั้น (0..1).
 * ยึดหลักที่คนอ่านแล้วเข้าใจ: ยิ่งคำที่พิมพ์กินพื้นที่ชื่อมาก = ยิ่งใช่
 *   "สติกเกอร์" ↔ "สติกเกอร์"            → 1.00 (ตรงเป๊ะ)
 *   "สติกเกอร์" ↔ "กระดาษสติ๊กเกอร์"       → ~0.6 (เป็นส่วนหนึ่งของชื่อยาวกว่า)
 *   "สติกเกอร์" ↔ "ฟิล์มติดกระจกสติกเกอร์…" → ต่ำ (ชื่อยาวมาก คำที่พิมพ์เป็นส่วนน้อย)
 */
function closeness(qn: string, fields: string[]): number {
  if (qn === "") return 0;
  let best = 0;
  for (const f of fields) {
    const n = normalizeHs(f);
    if (n === "") continue;
    let sc = 0;
    if (n === qn) sc = 1;                              // ตรงเป๊ะทั้งชื่อ
    else if (n.startsWith(qn)) sc = 0.85 * (qn.length / n.length) + 0.15; // ขึ้นต้นตรง
    else if (n.includes(qn)) sc = 0.70 * (qn.length / n.length);          // อยู่กลางชื่อ
    else {
      const d = editDistance(qn, n, 3);
      if (d <= 3) sc = Math.max(0, 0.5 - d * 0.12);    // ใกล้เคียงทั้งชื่อ
    }
    if (sc > best) best = sc;
    if (best === 1) break;
  }
  return best;
}

/**
 * แถวนี้เข้ากับคำค้นไหม — คืน `null` ถ้าไม่เข้า.
 * ค้นทีละชั้น: เลขพิกัด → ข้อความตรงตัว → ครบทุกคำ/คำพ้อง → พิมพ์ผิด.
 */
export function matchHsRow(row: HsSearchable, query: string): HsMatch | null {
  const q = String(query ?? "").trim();
  if (q === "") return { kind: "exact", rank: 0, score: 0 };

  // ① เลขพิกัด — พนักงานพิมพ์ "4202.29" ต้องเจอแถวที่เก็บเป็น "42022900"
  const qd = digitsOnly(q);
  if (qd.length >= 2) {
    const cd = digitsOnly(row.code);
    if (cd === qd) return { kind: "code", rank: 0, score: 1 };
    // ยิ่งพิมพ์ครบใกล้เลขเต็มเท่าไร ยิ่งอยู่บน (4202 → 42022900 ได้คะแนนน้อยกว่า 420229)
    if (cd.startsWith(qd)) return { kind: "code", rank: 1, score: qd.length / Math.max(cd.length, 1) };
    if (cd.includes(qd)) return { kind: "code", rank: 2, score: 0.5 * (qd.length / Math.max(cd.length, 1)) };
  }
  if (row.code.toLowerCase().includes(q.toLowerCase())) return { kind: "code", rank: 2, score: 0.4 };

  const aliasText = (row.product_aliases ?? []).flatMap((a) =>
    typeof a === "string" ? [a] : [a?.th, a?.en, a?.note],
  );
  const hay = normalizeHs(
    [row.description, row.description_en, row.hs_note, row.source, ...aliasText]
      .filter(Boolean).join(" "),
  );
  if (hay === "") return null;

  // ② ตรงตัวทั้งวลี (หลัง normalize) = มั่นใจสุดในฝั่งข้อความ
  const qn = normalizeHs(q);
  // ชื่อแต่ละอันแยกกัน (ไม่ใช่ทั้งกอง) — จะได้รู้ว่า "ตรงทั้งชื่อ" หรือ "โผล่ในชื่อยาว"
  const nameFields = [row.description, row.description_en, ...aliasText]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");
  if (qn.length >= 2 && hay.includes(qn)) {
    return { kind: "exact", rank: 3, score: closeness(qn, nameFields) };
  }

  // ③ แยกคำ — ทุกคำต้องโผล่ (ไม่สนลำดับ · คำพ้องนับแทนกันได้)
  const tokens = q.split(/[\s,/·|+]+/).map((t) => normalizeHs(t)).filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  if (tokens.every((t) => tokenInHaystack(t, hay))) {
    return { kind: "token", rank: 4, score: closeness(qn, nameFields) };
  }

  // ④ พิมพ์ผิด — ชั้นสุดท้าย (ทุกคำต้องพอเดาได้ ไม่ใช่แค่คำเดียว)
  if (tokens.every((t) => tokenInHaystack(t, hay) || tokenFuzzyInHaystack(t, hay))) {
    return { kind: "fuzzy", rank: 5, score: closeness(qn, nameFields) };
  }
  return null;
}

/** ผลค้นหาเรียงจากตรงสุด → ใกล้เคียงสุด (เสถียร: ตรงกันแล้วเรียงตามเลขพิกัด) */
export function searchHsRows<T extends HsSearchable>(
  rows: readonly T[],
  query: string,
): Array<T & { match: HsMatch }> {
  const out: Array<T & { match: HsMatch }> = [];
  for (const r of rows) {
    const m = matchHsRow(r, query);
    if (m) out.push({ ...r, match: m });
  }
  // ตรงสุด → ใกล้สุด → (เสมอกัน) ชื่อสั้นกว่าอยู่บน (เจาะจงกว่า) → เลขพิกัด (เสถียร)
  const nameLen = (r: HsSearchable) => (r.description ?? r.description_en ?? "").length || 999;
  out.sort((a, b) =>
    a.match.rank - b.match.rank ||
    b.match.score - a.match.score ||
    nameLen(a) - nameLen(b) ||
    a.code.localeCompare(b.code));
  return out;
}
