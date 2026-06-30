/**
 * Container JOURNEY timeline — pure builder (G4 · owner "อุดจุดบอด" · 2026-06-30).
 *
 * The recurring staff/customer question is "ตู้นี้ถึงไหนแล้ว?" — the Momo+Pacred
 * status-chase chats are full of "ตู้ GZS… ด่านจีนยังไม่ปล่อย / กองปราบสแกน / ถึง
 * แหลมฉบัง / ตรวจปล่อย / โกดังนครปฐม". report-cnt shows the container as ONE status
 * pill, but never the JOURNEY (which stage, on which date, what's stuck). This pure
 * function folds the container's tb_forwarder rows + ETD/ETA into an ordered stage
 * strip so the detail page can render a vertical timeline.
 *
 * ⚠️ PLAIN module (NOT "use server"): a "use server" file may only export async
 *    functions — a const/type export there fails `next build` at "collect page data".
 *    The const STAGES table + the builder live here; the page imports them.
 *
 * READ-ONLY: this module only derives display state from already-fetched rows; it
 * has no DB client, no mutation. Server-only-dependency-free → unit-testable.
 *
 * ── Stage → data mapping (which date stamp feeds each stage) ──────────────────
 * The journey threads the legacy fstatus axis (1→7) + the per-tracking date stamps
 * (fdatestatusN) + the แต้ม/MOMO ETD/ETA. A container's stage date = the
 * representative (latest non-empty) stamp across its trackings.
 *
 *   1 close   ปิดตู้ · ออกจากจีน        ← fdatecontainerclose (+ ETD as estimate)
 *   2 transit ออกจากจีน · กำลังมาไทย     ← fdatestatus3 (กำลังส่งมาไทย · fstatus 3)
 *   3 arrive  ถึงท่าไทย (ETA)            ← ETA only (no real "arrived-port" stamp today = GAP)
 *   4 customs ตรวจปล่อย / ติดด่าน        ← NO DB stamp today (= GAP · chat-driven · derived stuck cue)
 *   5 godown  ถึงโกดังไทย (นครปฐม)       ← fdatestatus4 (warehouse arrival scan · fstatus 4)
 *   6 ready   เตรียมส่ง / รอชำระ          ← fdatestatus6 (paid→ready) || fdatestatus5 (รอชำระ)
 *   7 deliver กระจาย · ส่งลูกค้าแล้ว      ← fdatestatus7 (driver completed · fstatus 7)
 *
 * Honest gaps (NO date is fabricated — these render "รอข้อมูล" when empty):
 *   - "ถึงท่าไทย" only ever shows the ETA *estimate* (we have no real port-arrival
 *     event feed). Marked estimate so staff don't read it as confirmed.
 *   - "ตรวจปล่อย / ติดด่าน" has NO structured source — the customs-clearance event
 *     lives only in the China-ops WeChat chats. The timeline never claims a date
 *     here; it only flags a STUCK container (ETA passed but not yet at โกดัง).
 */

import {
  resolveTransportMode,
  type TransportMode,
} from "@/lib/forwarder/cabinet-transport";

/** The minimum a tb_forwarder row needs to place it on the journey. */
export type JourneyForwarderRow = {
  fstatus: string | null;
  fdatecontainerclose: string | null;
  fdatestatus2: string | null;
  fdatestatus3: string | null;
  fdatestatus4: string | null;
  fdatestatus5: string | null;
  fdatestatus6: string | null;
  fdatestatus7: string | null;
};

/** Stable stage ids (also the render order). */
export type JourneyStageId =
  | "close"
  | "transit"
  | "arrive"
  | "customs"
  | "godown"
  | "ready"
  | "deliver";

/** Per-stage rendered state. */
export type JourneyStageState = "done" | "current" | "pending" | "no_data";

export type JourneyStage = {
  id: JourneyStageId;
  /** Short Thai title shown on the stage node. */
  title: string;
  /** One-line plain-Thai meaning (where the staff/customer reads "what this is"). */
  detail: string;
  /** The resolved date for this stage (yyyy-mm-dd) or null when no source has it. */
  date: string | null;
  /**
   * True when the only value we have is an ESTIMATE (ETA), not a confirmed event.
   * The UI marks it "(ประมาณ)" so it isn't read as a real arrival.
   */
  isEstimate: boolean;
  state: JourneyStageState;
  /** Emoji marker for at-a-glance scanning (§0g). */
  icon: string;
};

export type ContainerJourney = {
  container: string;
  transportMode: TransportMode;
  stages: JourneyStage[];
  /** The most-advanced stage reached (by date / fstatus) — the "ถึงไหนแล้ว" answer. */
  currentStageId: JourneyStageId;
  /** A short Thai sentence answering "ตู้นี้ถึงไหนแล้ว". */
  headline: string;
  /**
   * Stuck/held flag: the ETA has passed but the container has NOT reached the TH
   * warehouse (no fdatestatus4 across its trackings). The classic "ติดด่าน / ตรวจ
   * ปล่อยช้า" case the chats describe. daysOverdue = days since ETA (when computable).
   */
  isStuck: boolean;
  daysOverdue: number | null;
};

/** Stage metadata (title + meaning + icon) — order = render order. */
const STAGE_META: Record<JourneyStageId, { title: string; detail: string; icon: string }> = {
  close:   { title: "ปิดตู้ · ออกจากจีน",     detail: "ตู้ปิดที่โกดังจีนแล้ว และออกเดินทาง (ETD = วันออกโดยประมาณ)", icon: "📦" },
  transit: { title: "กำลังส่งมาไทย",          detail: "ตู้กำลังเดินทางมาไทย (ทางเรือ/รถ/อากาศ)",                    icon: "🚢" },
  arrive:  { title: "ถึงท่าไทย",              detail: "ตู้ถึงท่า/ด่านไทยโดยประมาณ (ETA) — ยังไม่มี event ยืนยันจริง",  icon: "🛬" },
  customs: { title: "ตรวจปล่อย / ติดด่าน",     detail: "ผ่านพิธีการศุลกากร — สถานะนี้รู้จากแชทจีน (ยังไม่มีข้อมูลในระบบ)", icon: "🛂" },
  godown:  { title: "ถึงโกดังไทย (นครปฐม)",    detail: "ของยิงเข้าโกดังไทยแล้ว (สแกนรับเข้าโกดัง)",                   icon: "🏬" },
  ready:   { title: "เตรียมส่ง / รอชำระ",       detail: "พร้อมจัดส่ง — รอลูกค้าชำระ/จัดรถคนขับ",                       icon: "🧾" },
  deliver: { title: "ส่งลูกค้าแล้ว",            detail: "กระจาย/ส่งถึงลูกค้าเรียบร้อย",                                 icon: "✅" },
};

const STAGE_ORDER: JourneyStageId[] = [
  "close", "transit", "arrive", "customs", "godown", "ready", "deliver",
];

/** Normalize a timestamp/date to yyyy-mm-dd (UI shows date only); "" → null. */
function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, 10);
}

/** Latest (max) non-null date across the container's rows for a given column. */
function latestDate(rows: JourneyForwarderRow[], pick: (r: JourneyForwarderRow) => string | null): string | null {
  let best: string | null = null;
  for (const r of rows) {
    const d = dateOnly(pick(r));
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

/** Highest (max) fstatus across the container's rows = the most-advanced tracking. */
function maxFstatus(rows: JourneyForwarderRow[]): number {
  let max = 0;
  for (const r of rows) {
    const n = Number((r.fstatus ?? "").trim());
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function todayYmd(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + "T00:00:00Z").getTime();
  const b = new Date(toYmd + "T00:00:00Z").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Build the container journey from its tb_forwarder rows + ETD/ETA.
 *
 * @param container  the cabinet code (fcabinetnumber report-cnt groups by)
 * @param storedTransportType  firstRow.ftransporttype (fallback when the name has no token)
 * @param rows       the container's tb_forwarder rows (only the journey columns needed)
 * @param etd        แต้ม-primary / MOMO-fallback ETD (yyyy-mm-dd | null)
 * @param eta        แต้ม-primary / MOMO-fallback ETA (yyyy-mm-dd | null)
 * @param now        injected for deterministic tests (defaults to new Date())
 */
export function buildContainerJourney(
  container: string,
  storedTransportType: string | null,
  rows: JourneyForwarderRow[],
  etd: string | null,
  eta: string | null,
  now: Date = new Date(),
): ContainerJourney {
  const transportMode = resolveTransportMode(container, storedTransportType);
  const etdYmd = dateOnly(etd);
  const etaYmd = dateOnly(eta);

  // Per-stage source date (the latest stamp across the container's trackings).
  const closeDate   = latestDate(rows, (r) => r.fdatecontainerclose) ?? etdYmd;
  const transitDate = latestDate(rows, (r) => r.fdatestatus3);
  const godownDate  = latestDate(rows, (r) => r.fdatestatus4);
  // ready = paid→ready (fdatestatus6) preferred; else waiting-payment (fdatestatus5)
  const readyDate   = latestDate(rows, (r) => r.fdatestatus6) ?? latestDate(rows, (r) => r.fdatestatus5);
  const deliverDate = latestDate(rows, (r) => r.fdatestatus7);

  const fmax = maxFstatus(rows);
  const reachedGodown = !!godownDate || fmax >= 4;

  // ── Stuck detection ──
  // The classic "ติดด่าน / ตรวจปล่อยช้า": ETA has passed but the container hasn't
  // reached the TH warehouse (no godown date · fmax < 4). daysOverdue = days since ETA.
  const today = todayYmd(now);
  let isStuck = false;
  let daysOverdue: number | null = null;
  if (etaYmd && !reachedGodown) {
    const over = daysBetween(etaYmd, today);
    if (over > 0) {
      isStuck = true;
      daysOverdue = over;
    }
  }

  // Raw per-stage dates (customs has no structured source → always null = honest gap).
  const stageDate: Record<JourneyStageId, string | null> = {
    close:   closeDate,
    transit: transitDate,
    arrive:  etaYmd,        // ESTIMATE only
    customs: null,          // GAP — chat-driven, never a fabricated date
    godown:  godownDate,
    ready:   readyDate,
    deliver: deliverDate,
  };
  const stageIsEstimate: Record<JourneyStageId, boolean> = {
    close: false, transit: false,
    arrive: true,    // ETA = estimate
    customs: false, godown: false, ready: false, deliver: false,
  };

  // Determine the "current" stage = the LAST stage that is reached (has a real date,
  // OR for customs/arrive a derived reach), then everything after is pending.
  // A stage counts as reached when:
  //   - it has a concrete date (close/transit/godown/ready/deliver), OR
  //   - arrive: ETA exists AND (the date is in the past OR a later stage is reached), OR
  //   - customs: the container reached godown (it must have cleared customs to get there).
  const reached: Record<JourneyStageId, boolean> = {
    close:   !!closeDate || fmax >= 1,
    transit: !!transitDate || fmax >= 3,
    arrive:  (!!etaYmd && etaYmd <= today) || reachedGodown,
    customs: reachedGodown,
    godown:  reachedGodown,
    ready:   !!readyDate || fmax >= 6,
    deliver: !!deliverDate || fmax >= 7,
  };

  // current = the highest-index reached stage.
  let currentIndex = 0;
  STAGE_ORDER.forEach((id, i) => {
    if (reached[id]) currentIndex = i;
  });
  const currentStageId = STAGE_ORDER[currentIndex];

  const stages: JourneyStage[] = STAGE_ORDER.map((id, i) => {
    const meta = STAGE_META[id];
    const date = stageDate[id];
    let state: JourneyStageState;
    if (i < currentIndex) {
      state = reached[id] ? "done" : (date ? "done" : "no_data");
    } else if (i === currentIndex) {
      state = "current";
    } else {
      state = "pending";
    }
    // customs is special: when not reached it's a known gap, not a normal pending.
    if (id === "customs" && !reached.customs) {
      state = i <= currentIndex ? "no_data" : "pending";
    }
    return {
      id,
      title: meta.title,
      detail: meta.detail,
      date,
      isEstimate: stageIsEstimate[id],
      state,
      icon: meta.icon,
    };
  });

  // Headline — the short "ถึงไหนแล้ว" answer.
  const cur = STAGE_META[currentStageId];
  let headline: string;
  if (isStuck) {
    headline = `⚠️ ตู้ค้าง — ครบกำหนดถึงไทย (ETA ${etaYmd}) แล้ว ${daysOverdue} วัน แต่ยังไม่เข้าโกดัง (อาจติดด่าน/ตรวจปล่อยช้า)`;
  } else if (currentStageId === "deliver") {
    headline = `ตู้นี้ส่งถึงลูกค้าเรียบร้อยแล้ว`;
  } else {
    headline = `ตู้นี้อยู่ขั้นตอน: ${cur.title}`;
  }

  return {
    container,
    transportMode,
    stages,
    currentStageId,
    headline,
    isStuck,
    daysOverdue,
  };
}
