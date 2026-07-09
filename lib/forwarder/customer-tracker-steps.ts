/**
 * Customer ฝากนำเข้า tracker — the 8-step timeline state machine (PURE · testable).
 *
 * Extracted from app/[locale]/(protected)/service-import/[fNo]/page.tsx so the
 * step logic can be unit-tested (no customer login needed to verify it).
 *
 * tb_forwarder.fstatus carries TWO dimensions on one column: a PHYSICAL journey
 * (1-4: รอเข้าโกดังจีน / ถึงโกดังจีน / กำลังส่งมาไทย / สินค้าถึงไทย) AND a
 * money/dispatch tail (5-7: รอชำระ / เตรียมส่ง / กำลังจัดส่ง / ส่งแล้ว). A CREDIT
 * order is flipped to fstatus=6 at credit-grant BEFORE the goods physically
 * arrive — so the PHYSICAL steps are driven by the real fdatestatusN stamp
 * (the warehouse scan), NOT the fstatus integer, so nothing paints "สินค้าถึงไทย"
 * as done before it truly arrives (the 2026-06-14 date-driven fix).
 *
 * @see app/[locale]/(protected)/service-import/[fNo]/page.tsx — the customer tracker UI
 * @see lib/forwarder/customer-tracker-steps.test.ts               — the unit tests
 */

export type StepState = "" | "visited" | "active";

export type PhysicalStamps = {
  s2: string | null; // fdatestatus2 — สินค้าถึงโกดังจีน
  s3: string | null; // fdatestatus3 — กำลังส่งมาไทย (departed China / in transit)
  s4: string | null; // fdatestatus4 — สินค้าถึงไทย (arrived Thailand)
};

/**
 * Is this timestamp a REAL stamp — not a null / empty / legacy MySQL zero-date
 * sentinel? Drives the PHYSICAL journey so a credit order flipped to fstatus=6
 * BEFORE the goods arrive doesn't paint "สินค้าถึงไทย" as done.
 */
export function hasRealStamp(ts: string | null): boolean {
  if (!ts) return false;
  const s = ts.trim();
  if (s === "" || s.startsWith("0000-00-00")) return false;
  return !isNaN(new Date(s.replace(" ", "T")).getTime());
}

/**
 * The 8-step tracker state. Indices 0..7 → step 1..6 / step 6.1 / step 7
 * (รอเข้าโกดังจีน / ถึงโกดังจีน / กำลังส่งมาไทย / สินค้าถึงไทย / รอชำระเงิน /
 *  เตรียมส่ง / กำลังจัดส่ง / ส่งแล้ว).
 */
export function computeSteps(
  fStatus: string | null,
  fidDriver: 0 | 1,
  stamps: PhysicalStamps,
): StepState[] {
  const s = Number(fStatus);
  const p2 = hasRealStamp(stamps.s2);
  const p3 = hasRealStamp(stamps.s3);
  const p4 = hasRealStamp(stamps.s4);

  const out: StepState[] = ["", "", "", "", "", "", "", ""];
  // Step 1 (รอเข้าโกดังจีน) — the entry state; "visited" once any later
  // milestone is reached (a real stamp OR the money/dispatch phase), else "active".
  const reachedBeyondStep1 = p2 || p3 || p4 || s >= 5;
  out[0] = reachedBeyondStep1 ? "visited" : "active";
  // Each PHYSICAL milestone with a real stamp is "visited" — it physically happened.
  out[1] = p2 ? "visited" : "";
  out[2] = p3 ? "visited" : "";
  out[3] = p4 ? "visited" : "";

  // While the goods are still PHYSICALLY in transit (no money/dispatch phase yet ·
  // fstatus < 5), the ACTIVE step = the CURRENT PHASE the goods are IN = the
  // HIGHEST-stamped physical step whose next milestone is un-reached — NOT the
  // next un-stamped step.
  //
  // 🐛 BUG FIX (owner/ภูม 2026-07-08 · PR207 / order 52304): fstatus=3 with
  // fdatestatus3 stamped + fdatestatus4=null was lighting step 4 "สินค้าถึงไทย"
  // as active — the customer read that as "arrived in Thailand" and complained,
  // while the goods were still กำลังส่งมาไทย (the status pill + the admin timeline
  // BOTH correctly showed step 3). Now the active head is the phase the goods are
  // actually in: step 4 only when it truly ARRIVED (p4), else step 3 while in
  // transit, else step 2 at the China warehouse.
  if (s < 5) {
    if (p4) out[3] = "active";              // ถึงไทยแล้ว (arrived · awaiting the money phase)
    else if (p3) out[2] = "active";         // กำลังส่งมาไทย (in transit)  ← the reported bug
    else if (p2) out[1] = "active";         // ถึงโกดังจีนแล้ว (at the China warehouse)
    else if (out[0] !== "active") out[1] = "active"; // reached-beyond w/o a stamp → next is step 2
    return out;                             // dispatch tail stays blank while in transit
  }
  // Money/dispatch phase (fstatus ≥ 5) — the physical steps are visited/blank
  // above; the active head is a dispatch step.
  return finalizeMoneySteps(out, s, fidDriver);
}

/**
 * Money/dispatch tail (indices 4..7 = step 5 / 6 / 6.1 / 7) — keyed off fstatus
 * (the dispatch dimension, not the physical journey). Only reached for fstatus ≥ 5.
 * A driver assignment (fidDriver=1) at fstatus=6 advances to the "กำลังจัดส่ง" head.
 */
function finalizeMoneySteps(out: StepState[], s: number, fidDriver: 0 | 1): StepState[] {
  if (s === 5) {
    out[4] = "active";
  } else if (s === 6) {
    out[4] = "visited";
    if (fidDriver === 1) {
      out[5] = "visited";
      out[6] = "active";
    } else {
      out[5] = "active";
    }
  } else if (s >= 7) {
    out[4] = "visited";
    out[5] = "visited";
    out[6] = "visited";
    out[7] = "active";
  }
  return out;
}
