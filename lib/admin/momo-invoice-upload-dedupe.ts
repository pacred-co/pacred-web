/**
 * ประวัติอัพใบวางบิล MOMO — กติกา "ไฟล์เดิมไม่เก็บซ้ำ · ไฟล์เปลี่ยนต้องเก็บ" (owner 2026-07-30).
 *
 * owner (verbatim): *"ประวัติอัพ ถ้าเป็นเลขที่ใบซ้ำใบเดิม ก็โชว์แค่อันเดียวพอครับ ไฟล์เดียวกัน
 *   เปลืองพื้นที่ครับ คืออัพมาดูได้แหละ แต่ไม่ได้เซฟ แต่ถ้าไม่เหมือนกัน หรือมีอัพเดทข้อมูล
 *   เปลี่ยนไป ต้อง[เก็บ]"*
 *
 * ── ทำไมต้องเป็น "แฮชของเนื้อไฟล์" ─────────────────────────────────────────
 * ตัวชี้ขาดว่า "ไฟล์เดียวกัน" ต้องเป็นเนื้อไฟล์ ไม่ใช่:
 *   · **ชื่อไฟล์** — พนักงานเซฟจากเมลแล้วได้ `INV (1).pdf` / เปลี่ยนชื่อเองเป็นปกติ
 *     → ไฟล์เดียวกันจะถูกนับเป็นคนละไฟล์ = เก็บซ้ำต่อไปเหมือนเดิม (แก้ไม่ตรงจุด)
 *   · **ขนาดไฟล์** — PDF ที่ MOMO ออกใหม่มีโอกาสขนาดเท่าเดิมได้ (เปลี่ยนแค่ตัวเลขในบรรทัด)
 *     → จะกลืน "ใบที่ข้อมูลเปลี่ยน" ทิ้ง ซึ่งเป็นสิ่งที่ owner สั่งให้ **เก็บ** (เสียประวัติเงิน)
 * แฮช sha256 ตอบทั้ง 2 ข้อพร้อมกัน: เนื้อเหมือน = เหมือน · ต่างแม้ไบต์เดียว = ต่าง.
 *
 * ── ทำไม fail-open (ไม่รู้แฮช = เก็บ) ────────────────────────────────────
 * ทุกทางที่ตอบไม่ได้ (วางข้อความ ไม่มีไฟล์ / ใบไม่มีเลขที่ / คอลัมน์ยังไม่ถูก migrate)
 * เลือก **เก็บ** เสมอ. เพราะพลาดคนละทางกันไม่เท่ากัน — เก็บเกิน = เปลืองพื้นที่นิดเดียว
 * (สิ่งที่ owner บ่น) แต่ข้ามผิด = **ประวัติเงินหายถาวร** (สิ่งที่กู้คืนไม่ได้).
 *
 * PURE — ไม่มี I/O ไม่มี DB ไม่มีนาฬิกา. ใช้ร่วมกัน 2 ฝั่ง: ฝั่ง server ตัดสินว่าจะเก็บไหม
 * (actions/admin/momo-invoice-history.ts) · ฝั่งจอจัดกลุ่มเวอร์ชัน (invoice-history-panel.tsx)
 * → กติกาเดียวกันทั้ง 2 ฝั่ง drift ไม่ได้.
 */

/** แถวประวัติเท่าที่การตัดสินใจ dedupe ต้องรู้ (ตัวจริงมีมากกว่านี้). */
export type UploadDedupeCandidate = {
  id: number;
  invoiceNo: string | null;
  fileHash: string | null;
};

export type UploadDedupeDecision =
  | {
      /** ไฟล์เดิมของใบเดิม — ไม่เก็บแถวใหม่ ไม่อัพไฟล์ซ้ำ · ชี้กลับไปที่แถวเดิม. */
      action: "skip";
      existingId: number;
    }
  | {
      /** ของใหม่ (หรือตัดสินไม่ได้) — เก็บตามปกติ · `revision` = เป็นครั้งที่เท่าไรของเลขใบนี้. */
      action: "insert";
      revision: number;
    };

/**
 * เก็บหรือไม่เก็บ — ตัวตัดสินที่เดียว.
 *
 * @param invoiceNo  เลขที่ใบที่แกะได้ (null = แกะไม่เจอ → จัดกลุ่มไม่ได้ → เก็บ)
 * @param fileHash   sha256 ของไฟล์ (null = วางข้อความ / คอลัมน์ยังไม่มี → เทียบไม่ได้ → เก็บ)
 * @param existing   แถวประวัติที่มีอยู่แล้ว (ทั้งหมด หรือเฉพาะของเลขใบนี้ ก็ได้ — กรองซ้ำในนี้)
 */
export function decideInvoiceUploadDedupe(input: {
  invoiceNo: string | null;
  fileHash: string | null;
  existing: readonly UploadDedupeCandidate[];
}): UploadDedupeDecision {
  const invoiceNo = norm(input.invoiceNo);
  const fileHash = norm(input.fileHash);

  // ตัดสินไม่ได้ → เก็บ (fail-open · ดูหัวไฟล์). revision 1 = "ครั้งแรกเท่าที่นับได้"
  if (!invoiceNo || !fileHash) return { action: "insert", revision: 1 };

  const sameInvoice = input.existing.filter((r) => norm(r.invoiceNo) === invoiceNo);
  const twin = sameInvoice.find((r) => norm(r.fileHash) === fileHash);
  if (twin) return { action: "skip", existingId: twin.id };

  // เลขใบเดิมแต่ไฟล์ต่าง = MOMO ออกใบใหม่/ข้อมูลเปลี่ยน → เก็บเป็นเวอร์ชันถัดไป
  return { action: "insert", revision: sameInvoice.length + 1 };
}

const norm = (v: string | null | undefined): string => (v ?? "").trim();

/** แถวประวัติเท่าที่การจัดกลุ่ม/เทียบเวอร์ชันบนจอต้องรู้. */
export type UploadGroupRow = {
  id: number;
  invoiceNo: string | null;
  uploadedAt: string;
  lineCount: number;
  subTotal: number | null;
  linesTotal: number | null;
  reconciles: boolean | null;
};

export type UploadGroup<T extends UploadGroupRow> = {
  /** คีย์ของกลุ่ม (เลขที่ใบ · แถวที่ไม่มีเลขใบ = กลุ่มของตัวเอง). */
  key: string;
  invoiceNo: string | null;
  /** เวอร์ชันล่าสุด (ใหม่สุด) — แถวเดียวที่โชว์เป็นหัวกลุ่ม. */
  latest: T;
  /** เวอร์ชันเก่ากว่า ใหม่→เก่า (ว่าง = ใบนี้อัพครั้งเดียว). */
  older: T[];
  /** จำนวนครั้งที่อัพใบนี้ (นับ latest ด้วย). */
  revisions: number;
};

/**
 * จัดกลุ่มประวัติตามเลขที่ใบ → **1 ใบ = 1 แถวบนจอ** (owner: "โชว์แค่อันเดียวพอ")
 * โดยยังกางดูเวอร์ชันเก่าได้.
 *
 * · ลำดับกลุ่มยึด "ใบที่อัพล่าสุดมาก่อน" ตาม input ที่เรียงมาแล้ว (ใหม่→เก่า) — ไม่ re-sort
 *   ทั้งชุดเอง เพื่อไม่ให้ลำดับบนจอต่างจากลำดับที่ query สั่งไว้
 * · แถวที่ **ไม่มีเลขที่ใบ** จับกลุ่มไม่ได้ (ไม่รู้ว่าเป็นใบเดียวกันไหม) → แยกเป็นกลุ่มละแถว
 *   ห้ามยุบรวมเป็นกลุ่ม "ไม่มีเลข" เดียว เพราะนั่นคือการเดาว่ามันคือใบเดียวกัน
 */
export function groupUploadsByInvoiceNo<T extends UploadGroupRow>(rows: readonly T[]): UploadGroup<T>[] {
  const out: UploadGroup<T>[] = [];
  const byKey = new Map<string, UploadGroup<T>>();

  for (const r of rows) {
    const invoiceNo = norm(r.invoiceNo) || null;
    if (!invoiceNo) {
      out.push({ key: `id:${r.id}`, invoiceNo: null, latest: r, older: [], revisions: 1 });
      continue;
    }
    const key = `inv:${invoiceNo}`;
    const g = byKey.get(key);
    if (!g) {
      const created: UploadGroup<T> = { key, invoiceNo, latest: r, older: [], revisions: 1 };
      byKey.set(key, created);
      out.push(created);
      continue;
    }
    g.older.push(r);
    g.revisions += 1;
  }

  return out;
}

/**
 * "อะไรเปลี่ยนไป" ระหว่าง 2 เวอร์ชันของใบเดียวกัน — บรรทัดสั้นๆ ให้บัญชีเห็นทันทีว่า
 * MOMO แก้อะไรมา โดยไม่ต้องเปิดทั้ง 2 ใบมาเทียบเอง.
 *
 * เทียบเฉพาะ 3 อย่างที่ **เปลี่ยนแล้วมีผลกับเงิน**: จำนวนบรรทัด · ยอด Sub-total บนใบ ·
 * Σ ตรง Sub-total ไหม. คืน null เมื่อ 3 อย่างนี้เท่าเดิม (ไฟล์ต่างแต่สาระเท่าเดิม เช่น
 * MOMO พิมพ์ใหม่ — ยังเก็บไว้ตามคำสั่ง owner แต่ไม่ต้องอวดว่า "เปลี่ยน" ทั้งที่ยอดเท่าเดิม).
 *
 * @param older เวอร์ชันเก่ากว่า · @param newer เวอร์ชันใหม่กว่า
 */
export function describeUploadRevisionDiff(older: UploadGroupRow, newer: UploadGroupRow): string | null {
  const parts: string[] = [];

  if (older.lineCount !== newer.lineCount) {
    parts.push(`บรรทัด ${older.lineCount} → ${newer.lineCount}`);
  }
  if (!sameMoney(older.subTotal, newer.subTotal)) {
    parts.push(`Sub-total ${money(older.subTotal)} → ${money(newer.subTotal)}`);
  }
  if (older.reconciles !== newer.reconciles) {
    parts.push(`ยอดตรงกับใบ ${tick(older.reconciles)} → ${tick(newer.reconciles)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** ต่างกันเกิน 1 สตางค์ = ต่างจริง (กัน float noise มาโชว์เป็น "ยอดเปลี่ยน"). */
const sameMoney = (a: number | null, b: number | null): boolean => {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 0.005;
};

const money = (v: number | null): string =>
  v == null ? "—" : `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const tick = (v: boolean | null): string => (v === true ? "✓" : v === false ? "✗" : "—");
