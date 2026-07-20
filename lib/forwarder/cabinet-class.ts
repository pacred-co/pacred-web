/**
 * cabinet-class.ts — THE cabinet-id tier classifier (owner 2026-07-20).
 *
 * The physical tier (owner-taught · จำให้ขึ้นใจ):
 *
 *   ตู้ (container)  ⊃  กระสอบ (sack)  ⊃  ชิปเม้น (base tracking)  ⊃  แทรคกิ้ง (-N/M)  ⊃  กล่อง (CG)
 *
 * 🔄 owner 2026-07-20 (SUPERSEDES the same-day first reading that treated TTW
 * "Packing ID" labels as batch-not-container): **TTW/อี้อู container ids follow
 * TTW's OWN pattern and are used AS-SENT.**
 *
 *   - "Packing ID: SEA0625-8211YW"  = เลขตู้จริง ("ถูกแล้วครับ ให้ยึดใช้เลขตู้ตามนี้
 *     แบบเขาได้เลยครับ")
 *   - ใบปิดตู้ header "เลขที่ตู้ 0717-7072 YW SEA อี้อู" = เลขตู้จริง
 *
 * NEVER relabel a TTW container to a GZS-style name we invent — "ไม่เอาตามที่คิดเอง
 * แล้วครับ เอาตามแพทเทิน อี้อู ที่ทาง TTW ส่งมาเลย จะได้ไม่งงกับคนทำงานและหน้างาน".
 *
 * What is still NOT a ตู้ (refused by the write guard):
 *
 *   - กระสอบ (sack)       `CBX260719-EK10` — a sack INSIDE a container (MOMO tier)
 *   - MOMO routing batch  `PR20260720-SEA01` · `MO20260523-SEA02` · `PCS20260704-EK01`
 *                         — the system-written ⏳ placeholder ("รอ MOMO ผูกเลขตู้จริง");
 *                         staff must never key one in by hand.
 *
 * This file is the SINGLE classifier — every fcabinetnumber WRITE path routes
 * through `cabinetWriteGuard`. Related (narrower) helpers that predate it:
 *   - lib/integrations/momo-web/live-cabinet-plan.ts `isRealContainerCode` (GZ* allow-list · MOMO Live lane only)
 *   - lib/admin/momo-container-resolve.ts `isMomoRoutingPlaceholder` (PR/MO/PCS batch)
 * Keep their behavior in lockstep with the patterns here.
 *
 * Pure + client-safe (no server imports).
 */

export type CabinetIdKind = "empty" | "container" | "sack" | "batch" | "other";

/** กระสอบ — CBX-prefixed sack ids (CBX260719-EK10 · CBX260717-SEA07). */
const SACK_RX = /^CBX/i;

/** MOMO routing-batch placeholder — PR/MO/PCS + YYYYMMDD + -SEA/EK/AIR + digits.
 *  System-written ⏳ value only; never a valid manual entry. */
const ROUTING_BATCH_RX = /^(PR|MO|PCS)\d{8}-(SEA|EK|AIR)\d+$/i;

/** Real container shapes we can positively recognise:
 *   - MOMO กวางโจว GZS/GZE/GZA (incl. TTW-era GZ…-T/-NT) + TTW อี้อู YWS/YWE/YWA
 *   - TTW packing-id style `SEA0625-8211YW` / `EK0625-…` (mode + MMDD + dash)
 *   - TTW ใบปิดตู้ style `0717-7072 YW SEA` (digits-digits + YW + mode)
 *  Anything else (legacy KY/ISO codes …) classifies "other" and stays allowed. */
const CONTAINER_RX = /^(GZS|GZE|GZA|YWS|YWE|YWA)/i;
const TTW_PACKING_ID_RX = /^(SEA|EK|AIR)\d{3,6}-/i;
const TTW_CLOSE_LIST_RX = /^\d{3,4}-\d{3,4}\s*YW\b/i;

export function classifyCabinetId(id: string | null | undefined): CabinetIdKind {
  const v = (id ?? "").trim();
  if (!v) return "empty";
  if (SACK_RX.test(v)) return "sack";
  if (ROUTING_BATCH_RX.test(v)) return "batch";
  if (CONTAINER_RX.test(v) || TTW_PACKING_ID_RX.test(v) || TTW_CLOSE_LIST_RX.test(v)) return "container";
  return "other";
}

/** True when the id is definitely NOT a ตู้ (sack or MOMO routing placeholder) —
 *  must never be manually written into fcabinetnumber. "other" stays allowed. */
export function isNonContainerCabinetId(id: string | null | undefined): boolean {
  const k = classifyCabinetId(id);
  return k === "sack" || k === "batch";
}

/** True when the id positively matches a known real-container pattern. */
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
 *   1. sack / MOMO-routing-placeholder id → refuse for EVERYONE incl. god
 *      (a sack lives INSIDE a ตู้; a placeholder is system-written only).
 *   2. fcabinet_locked → refuse (god may override the lock — mig 0150).
 *
 * TTW/อี้อู container ids (SEA0625-8211YW · 0717-7072 YW SEA · YW*)
 * pass — they are the real ตู้ per TTW's own pattern (owner 2026-07-20).
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
        `ระบบจะผูกเลขตู้จริงให้เองเมื่อปิดตู้ (ห้ามคีย์เลขกระสอบลงช่องตู้)`,
    };
  }
  if (kind === "batch") {
    return {
      ok: false,
      reason:
        `"${next}" เป็นรหัสรอบจัดส่งของระบบ (placeholder ระหว่างรอ MOMO ปิดตู้/ผูกเลขตู้) — ` +
        `ห้ามคีย์เอง ระบบจะผูกเลขตู้จริงให้เมื่อปิดตู้`,
    };
  }

  if (input.locked && !input.isGod) {
    return {
      ok: false,
      reason:
        "เลขตู้ของรายการนี้ถูกล็อกโดยระบบ (fcabinet_locked) — " +
        "ถ้าจำเป็นต้องแก้จริง ให้ Ultra Admin เป็นผู้แก้",
    };
  }

  return { ok: true };
}
