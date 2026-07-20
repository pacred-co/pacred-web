/**
 * cabinet-class.ts — THE cabinet-id tier classifier (owner 2026-07-20).
 *
 * The physical tier (owner-taught · จำให้ขึ้นใจ):
 *
 *   ตู้ (container)  ⊃  กระสอบ (sack)  ⊃  ชิปเม้น (base tracking)  ⊃  แทรคกิ้ง (-N/M)  ⊃  กล่อง (CG)
 *
 * `tb_forwarder.fcabinetnumber` must hold ONLY the ตู้ tier. MOMO/TTW also emit
 * two OTHER id shapes that staff keep keying in from printed box labels:
 *
 *   - กระสอบ (sack)       `CBX260719-EK10`          — a sack INSIDE a container
 *   - รอบแพค/routing batch `PR20260720-SEA01` ·
 *                          `MO20260523-SEA02` ·
 *                          `SEA0625-8211YW`          — a MOMO/TTW batch label
 *                          (the "Packing ID" printed on boxes — the exact string
 *                          that got re-keyed onto 7 LOCKED rows on 2026-07-19/20)
 *
 * Neither is a ตู้. Writing them into fcabinetnumber makes the sack/batch show up
 * at the container tier on รายงานตู้ ("เลขกระสอบหลุดมาแทนที่จะอยู่ในตู้").
 *
 * This file is the SINGLE classifier — every fcabinetnumber WRITE path routes
 * through `cabinetWriteGuard`. Related (narrower) helpers that predate it:
 *   - lib/integrations/momo-web/live-cabinet-plan.ts `isRealContainerCode` (GZ* allow-list)
 *   - lib/admin/momo-container-resolve.ts `isMomoRoutingPlaceholder` (PR/MO/PCS batch)
 * Keep their behavior in lockstep with the patterns here.
 *
 * Pure + client-safe (no server imports).
 */

export type CabinetIdKind = "empty" | "container" | "sack" | "batch" | "other";

/** กระสอบ — CBX-prefixed sack ids (CBX260719-EK10 · CBX260717-SEA07). */
const SACK_RX = /^CBX/i;

/** MOMO routing-batch placeholder — PR/MO/PCS + YYYYMMDD + -SEA/EK/AIR + digits. */
const ROUTING_BATCH_RX = /^(PR|MO|PCS)\d{8}-(SEA|EK|AIR)\d+$/i;

/** TTW/MOMO packing-batch label — SEA/EK/AIR + MMDD-ish digits + dash (SEA0625-8211YW).
 *  A real container NEVER starts with a bare SEA/EK/AIR prefix (those are mode
 *  tokens inside GZS/GZE/YW* codes, or batch labels). */
const PACKING_BATCH_RX = /^(SEA|EK|AIR)\d{3,6}-/i;

/** Real container prefixes — MOMO กวางโจว (GZS/GZE/GZA · incl. TTW-era GZ…-NT)
 *  + TTW อี้อู (YWS/YWE/YWA). Legacy/ISO shapes fall to "other" (allowed). */
const CONTAINER_RX = /^(GZS|GZE|GZA|YWS|YWE|YWA)/i;

export function classifyCabinetId(id: string | null | undefined): CabinetIdKind {
  const v = (id ?? "").trim();
  if (!v) return "empty";
  if (SACK_RX.test(v)) return "sack";
  if (ROUTING_BATCH_RX.test(v) || PACKING_BATCH_RX.test(v)) return "batch";
  if (CONTAINER_RX.test(v)) return "container";
  return "other";
}

/** True when the id is definitely NOT a ตู้ (sack or batch label) — must never
 *  be written into fcabinetnumber. "other" (legacy/ISO codes) stays allowed. */
export function isNonContainerCabinetId(id: string | null | undefined): boolean {
  const k = classifyCabinetId(id);
  return k === "sack" || k === "batch";
}

/** True when the id positively matches a known real-container prefix. */
export function isRealContainerId(id: string | null | undefined): boolean {
  return classifyCabinetId(id) === "container";
}

export type CabinetWriteGuardInput = {
  /** the value about to be written (may be "" = clear) */
  next: string;
  /** the row's current fcabinetnumber */
  current?: string | null;
  /** the row's fcabinet_locked (mig 0150) */
  locked?: boolean | null;
  /** god-role (ultra) may override the LOCK — never the tier check */
  isGod?: boolean;
};

export type CabinetWriteGuardResult = { ok: true } | { ok: false; reason: string };

/**
 * The ONE gate every manual/scan fcabinetnumber write must pass.
 *
 *   1. fcabinet_locked → refuse (god may override the lock — mig 0150 exists
 *      precisely because staff re-key the printed label over a corrected value).
 *   2. sack/batch-shaped id → refuse for EVERYONE incl. god (the 2026-07-20
 *      incident WAS a god-role admin keying the box label).
 */
export function cabinetWriteGuard(input: CabinetWriteGuardInput): CabinetWriteGuardResult {
  const next = input.next.trim();
  const current = (input.current ?? "").trim();
  if (next === current) return { ok: true }; // no-op — callers usually short-circuit first

  const kind = classifyCabinetId(next);
  if (kind === "sack") {
    return {
      ok: false,
      reason:
        `"${next}" เป็นเลขกระสอบ (CBX…) ไม่ใช่เลขตู้ — กระสอบอยู่ภายในตู้อีกชั้น ` +
        `ระบบจะผูกเลขตู้จริงให้เองเมื่อ MOMO ปิดตู้ (ห้ามคีย์เลขกระสอบลงช่องตู้)`,
    };
  }
  if (kind === "batch") {
    return {
      ok: false,
      reason:
        `"${next}" เป็นเลขรอบแพค/Packing ID (ป้ายบนกล่อง) ไม่ใช่เลขตู้จริง — ` +
        `เลขตู้จริงเป็นรูปแบบ GZS/GZE/GZA/YWS/YWE/YWA… ` +
        `ระบบจะผูกเลขตู้จริงให้เองจาก MOMO/packing list`,
    };
  }

  if (input.locked && !input.isGod) {
    return {
      ok: false,
      reason:
        "เลขตู้ของรายการนี้ถูกล็อกโดยระบบ (fcabinet_locked) เพราะเคยถูกคีย์ทับด้วยเลขที่ผิดมาแล้ว — " +
        "ถ้าจำเป็นต้องแก้จริง ให้ Ultra Admin เป็นผู้แก้",
    };
  }

  return { ok: true };
}
