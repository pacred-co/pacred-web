/**
 * momo-container-truth.ts — "สรุปพัสดุนี้อยู่ตู้ไหนกันแน่" (owner 2026-07-29)
 *
 * owner: *"ตอนตรวจต้นทุน momo ขึ้นเลขตู้ไม่ตรงแปลกๆ สรุปมันอยู่ตู้ไหนกันแน่ครับ
 *  ในแพคกิ้งลิส มีไหมครับ อยู่ในตู้ไหนครับ มันควรจะเชื่อมโยง ประมวลผลกัน และ
 *  map match กันได้และถูกต้องจริงๆไปเลยครับ"*
 *
 * ══ ปัญหา ══
 * MOMO ส่งเลข "ตู้" มาให้เรา **2 ชั้นที่ไม่ใช่เลขตู้จริง**:
 *   • `momo_import_tracks.momo_container_no` = **รอบขนส่งของ MOMO**
 *     (`PR20260708-SEA01` · `PR20260716-EK01`) — ไม่ใช่เลขตู้ที่บัญชี/ลูกค้าใช้
 *   • `momo_import_tracks.container_batch_no` = เลขตู้จริง แต่ **null เกือบทั้งหมด**
 * เลขตู้จริง (`GZS260710-1`) มาทาง **แพคกิ้งลิสต่อตู้** (ไฟล์ xlsx ที่บัญชีอัพ →
 * `momo_packing_upload.parsed_snapshot`) ซึ่งบอกยอด **ต่อ base-tracking ต่อตู้**
 * (กล่อง · น้ำหนัก · คิว · จำนวนแถวย่อย).
 *
 * ผลคือ: ตอน commit เราประทับ `fcabinetnumber` **ค่าเดียวให้ทั้งครอบครัว** →
 * ชิปเม้นที่ MOMO แยกส่ง 2-3 ตู้ (พบจริง 6 ชิปเม้น / 50 แถว) ติดตู้ผิด →
 * ใบวางบิล MOMO ที่ระบุตู้จริงเลย "ขัดกับระบบ" → บล็อกการบันทึกต้นทุน +
 * กำไรรายตู้เพี้ยน (ตู้หนึ่งบวมด้วยของอีกตู้).
 *
 * ══ กฎจับคู่ (พิสูจน์กับ prod แล้ว 6/6 เคส · 15/15 กลุ่ม ไม่มีชนกันเลย) ══
 *   1) จัดกลุ่มแถวย่อยของ base เดียวกันตาม `momo_container_no` — MOMO จัดกลุ่ม
 *      ของตัวเองไว้แล้ว = "แถวพวกนี้ไปด้วยกัน" (เชื่อได้ ต่างจากเลขตู้ที่ null)
 *   2) เทียบแต่ละกลุ่มกับบรรทัดในแพคกิ้งลิสของ base เดียวกัน ด้วย 3 ค่า
 *      (จำนวนแถวย่อย · Σ น้ำหนัก · Σ คิว) — ตรงเป๊ะระดับทศนิยม
 *   3) จับได้ตัวเดียว = ตู้นั้นแน่นอน · จับได้หลายตัว/ไม่ได้เลย = **ไม่เดา**
 *      (คืน reason ให้คนตัดสิน — ห้ามประทับเลขตู้แบบมั่ว = เงินผิดเงียบ)
 *
 * PURE — ไม่แตะ DB/เงิน. ตัวเรียกเป็นคนอ่าน DB มาป้อน + เป็นคนเขียน
 * (สคริปต์ data-fix / หน้าจอ reconcile) โดยผ่าน `cabinetWriteGuard` ตามเดิม.
 */

/** ยอดต่อ base-tracking ต่อตู้ ที่อ่านมาจากแพคกิ้งลิส (parsed_snapshot.rows). */
export type PackingContainerLine = {
  /** เลขตู้จริง — มาจากไฟล์แพคกิ้งลิสของตู้นั้น */
  cabinet: string;
  boxes: number;
  weightKg: number;
  cbm: number;
  /** จำนวนแถวย่อยที่ MOMO แจงไว้ใต้ base นี้ในตู้นี้ */
  subCount: number;
  /** เลข CG ตัวแรกของบรรทัด (ข้อมูลอ้างอิง ไม่ใช่กุญแจจับคู่ — ช่วงมันคาบเกี่ยวกัน) */
  cg?: string | null;
};

/** แถวย่อยใน staging MOMO (1 แถว = 1 แถวใน tb_forwarder หลัง commit). */
export type StagingSubRow = {
  momoTrackingNo: string;
  /** รอบขนส่งของ MOMO — กุญแจจัดกลุ่ม (ไม่ใช่เลขตู้) */
  momoContainerNo: string | null;
  /** เลขตู้จริงถ้า MOMO ส่งมา (ส่วนใหญ่ null) */
  containerBatchNo?: string | null;
  weightKg: number;
  cbm: number;
  quantity: number;
  /** tb_forwarder.id ที่ commit แล้ว (null = ยังไม่เข้าระบบ) */
  committedForwarderId: number | null;
};

export type MatchOutcome =
  | { kind: "matched"; cabinet: string; how: "exact" | "weight_only" | "momo_batch_no" }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "no_packing" }
  | { kind: "unmatched" };

export type BatchGroupResult = {
  /** รอบขนส่ง MOMO ที่ใช้จัดกลุ่ม ("" = MOMO ไม่ส่งมา) */
  momoContainerNo: string;
  rows: number;
  weightKg: number;
  cbm: number;
  quantity: number;
  forwarderIds: number[];
  outcome: MatchOutcome;
};

export type ContainerTruth = {
  baseTracking: string;
  /** ตู้ที่แพคกิ้งลิสบอกว่ามี base นี้ */
  packingCabinets: string[];
  groups: BatchGroupResult[];
  /** true = แพคกิ้งบอกว่าของ base นี้กระจายหลายตู้จริง */
  isMultiContainer: boolean;
  /** fid → เลขตู้ที่ควรเป็น (เฉพาะที่จับคู่ได้แน่นอน) */
  assignments: Map<number, string>;
  /** กลุ่มที่จับคู่ไม่ได้/ชนกัน = ต้องให้คนดู */
  unresolvedGroups: BatchGroupResult[];
};

const WEIGHT_TOL = 0.6; // kg — MOMO ปัดเศษต่างกันเล็กน้อยระหว่างไฟล์กับ API
const CBM_TOL = 0.02;   // คิว

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** ตัด suffix กล่อง `-N` / `-N/M` ออกให้เหลือ base tracking. */
export function baseOfTracking(tracking: string | null | undefined): string {
  return String(tracking ?? "").trim().replace(/-\d+(\/\d+)?$/, "");
}

/**
 * จัดกลุ่มแถวย่อยตามรอบขนส่งของ MOMO — ขั้นแรกของการจับคู่.
 * แถวที่ MOMO ไม่ส่งรอบมา (null) รวมเป็นกลุ่ม "" ก้อนเดียว (จับคู่ยากกว่า
 * แต่ยังมีโอกาสถ้าน้ำหนักตรงบรรทัดเดียว).
 */
export function groupStagingByMomoBatch(rows: StagingSubRow[]): BatchGroupResult[] {
  const map = new Map<string, BatchGroupResult>();
  for (const r of rows) {
    const key = String(r.momoContainerNo ?? "").trim();
    const g = map.get(key) ?? {
      momoContainerNo: key, rows: 0, weightKg: 0, cbm: 0, quantity: 0,
      forwarderIds: [], outcome: { kind: "unmatched" } as MatchOutcome,
    };
    g.rows += 1;
    g.weightKg += Number(r.weightKg) || 0;
    g.cbm += Number(r.cbm) || 0;
    g.quantity += Number(r.quantity) || 0;
    if (typeof r.committedForwarderId === "number" && r.committedForwarderId > 0) {
      g.forwarderIds.push(r.committedForwarderId);
    }
    map.set(key, g);
  }
  for (const g of map.values()) {
    g.weightKg = round4(g.weightKg);
    g.cbm = round4(g.cbm);
  }
  return [...map.values()];
}

/**
 * ตัดสินว่าแต่ละกลุ่มอยู่ตู้ไหน.
 *
 * ลำดับความเชื่อ (แข็ง → อ่อน · หยุดที่ตัวแรกที่ชี้ตัวเดียว):
 *   1. `container_batch_no` ที่ MOMO ส่งมาเอง **และ** ตรงกับตู้ที่แพคกิ้งลิสมี base นี้
 *   2. แพคกิ้ง: จำนวนแถวย่อย + น้ำหนัก + คิว ตรงกัน (กุญแจหลัก)
 *   3. แพคกิ้ง: น้ำหนัก+คิว ตรงกัน (ยอมให้จำนวนแถวต่าง — MOMO แตกกล่องกลางทาง)
 * ถ้ายังชี้ได้หลายตู้ = `ambiguous` · ไม่มีบรรทัดตรงเลย = `unmatched` — **ไม่เดา**.
 *
 * ⚠️ กันเคสตู้ตัวเดียว: ถ้าแพคกิ้งบอก base นี้อยู่ตู้เดียว ทุกกลุ่ม → ตู้นั้น
 * (ไม่ต้องเทียบน้ำหนัก) เพราะไม่มีทางเลือกอื่นให้ผิด.
 */
export function resolveContainerTruth(
  baseTracking: string,
  packing: PackingContainerLine[],
  staging: StagingSubRow[],
): ContainerTruth {
  const groups = groupStagingByMomoBatch(staging);
  const packingCabinets = [...new Set(packing.map((p) => p.cabinet))].sort();
  const isMultiContainer = packingCabinets.length > 1;

  for (const g of groups) {
    if (packing.length === 0) { g.outcome = { kind: "no_packing" }; continue; }

    // ตู้เดียวในแพคกิ้ง → ไม่มีอะไรให้เลือกผิด
    if (packingCabinets.length === 1) {
      g.outcome = { kind: "matched", cabinet: packingCabinets[0], how: "exact" };
      continue;
    }

    // (1) MOMO ส่งเลขตู้จริงมาเอง + ตู้นั้นอยู่ในแพคกิ้งของ base นี้
    const declared = [...new Set(
      staging
        .filter((r) => String(r.momoContainerNo ?? "").trim() === g.momoContainerNo)
        .map((r) => String(r.containerBatchNo ?? "").trim())
        .filter(Boolean),
    )];
    if (declared.length === 1 && packingCabinets.includes(declared[0])) {
      g.outcome = { kind: "matched", cabinet: declared[0], how: "momo_batch_no" };
      continue;
    }

    // (2) จำนวนแถวย่อย + น้ำหนัก + คิว
    const exact = packing.filter(
      (p) => p.subCount === g.rows && near(p.weightKg, g.weightKg, WEIGHT_TOL) && near(p.cbm, g.cbm, CBM_TOL),
    );
    if (exact.length === 1) {
      g.outcome = { kind: "matched", cabinet: exact[0].cabinet, how: "exact" };
      continue;
    }
    if (exact.length > 1) {
      g.outcome = { kind: "ambiguous", candidates: [...new Set(exact.map((p) => p.cabinet))] };
      continue;
    }

    // (3) น้ำหนัก + คิว (ยอมให้จำนวนแถวต่าง)
    const byMetric = packing.filter(
      (p) => near(p.weightKg, g.weightKg, WEIGHT_TOL) && near(p.cbm, g.cbm, CBM_TOL),
    );
    if (byMetric.length === 1) {
      g.outcome = { kind: "matched", cabinet: byMetric[0].cabinet, how: "weight_only" };
      continue;
    }
    g.outcome = byMetric.length > 1
      ? { kind: "ambiguous", candidates: [...new Set(byMetric.map((p) => p.cabinet))] }
      : { kind: "unmatched" };
  }

  const assignments = new Map<number, string>();
  const unresolvedGroups: BatchGroupResult[] = [];
  for (const g of groups) {
    if (g.outcome.kind === "matched") {
      for (const fid of g.forwarderIds) assignments.set(fid, g.outcome.cabinet);
    } else {
      unresolvedGroups.push(g);
    }
  }

  return { baseTracking, packingCabinets, groups, isMultiContainer, assignments, unresolvedGroups };
}

/** บรรทัดแพคกิ้งลิสหนึ่งแถวจาก `parsed_snapshot.rows` (โครงจาก momo packing parser). */
export type RawPackingSnapshotRow = {
  baseTracking?: string | null;
  boxes?: number | string | null;
  weight?: number | string | null;
  cbm?: number | string | null;
  subCount?: number | string | null;
  cg?: string | null;
  code?: string | null;
};

/**
 * รวมแพคกิ้งลิสหลายไฟล์เป็นแผนที่ base → บรรทัดต่อตู้.
 * ตู้เดียวอัพซ้ำหลายรอบ = **เอาไฟล์ล่าสุดของตู้นั้น** (prod มี GZS260712-1 อัพ 3 รอบ ·
 * GZE260723-1 อัพ 2 ครั้งในนาทีเดียว) — ตัวเรียกต้องส่งมาเรียงใหม่→เก่า
 * แล้วฟังก์ชันนี้จะ **ข้ามไฟล์ที่ตู้ซ้ำ** ให้เอง.
 */
export function buildPackingTruthMap(
  files: Array<{ containerNo: string; rows: RawPackingSnapshotRow[] }>,
): Map<string, PackingContainerLine[]> {
  const seenCabs = new Set<string>();
  const out = new Map<string, PackingContainerLine[]>();
  for (const f of files) {
    const cab = String(f.containerNo ?? "").trim();
    if (!cab || seenCabs.has(cab)) continue; // ตู้ซ้ำ = ไฟล์เก่า ข้าม
    seenCabs.add(cab);
    for (const r of f.rows ?? []) {
      const base = String(r.baseTracking ?? "").trim();
      if (!base) continue;
      const line: PackingContainerLine = {
        cabinet: cab,
        boxes: Number(r.boxes ?? 0) || 0,
        weightKg: Number(r.weight ?? 0) || 0,
        cbm: Number(r.cbm ?? 0) || 0,
        subCount: Number(r.subCount ?? 0) || 0,
        cg: r.cg ?? null,
      };
      out.set(base, [...(out.get(base) ?? []), line]);
    }
  }
  return out;
}
