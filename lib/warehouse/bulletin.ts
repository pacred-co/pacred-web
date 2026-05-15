/**
 * U2-1: Daily container bulletin generator (per chat W-1).
 *
 * Per chat audit: staff manually pastes daily summary into MOMO + DOC
 * SHIPPING groups in this format:
 *
 *   DD/MM/YY สรุปรายการ — รวม X ตู้ครับ
 *   #ค้าง
 *   1. [container code] [status / note]
 *   2. ...
 *   ##ใหม่
 *   3. ...
 *
 * This module produces that text from current cargo_containers state.
 *
 * Conventions:
 *   - "ค้าง" = containers in transit / arrived / unloading (not yet closed)
 *   - "ใหม่" = containers that entered the system today (status='packing'
 *              and updated_at within last 24h)
 *   - Date format DD/MM/YY uses Bangkok timezone
 */

// NOTE: no `import "server-only"` here — the function accepts a
// SupabaseClient as a parameter (doesn't construct one or hold secrets),
// so it's safe to import + unit-test in raw tsx. See
// docs/learnings/testing-patterns.md "tsx + server-only incompat".
import type { SupabaseClient } from "@supabase/supabase-js";

const STATUS_LABEL_TH: Record<string, string> = {
  packing:    "กำลังบรรจุ",
  sealed:     "ปิดตู้แล้ว",
  in_transit: "กลางทาง",
  arrived:    "ถึงไทย",
  unloading:  "กำลังลง",
  closed:     "ปิดงาน",
  // Legacy 0016 statuses (containers table) — appear if mixed
  loading:    "กำลังโหลด",
};

const TRANSPORT_EMOJI: Record<string, string> = {
  truck: "🚚",
  sea:   "🚢",
  air:   "✈️",
};

type BulletinRow = {
  code:           string;
  status:         string;
  transport_mode: string | null;
  origin:         string | null;
  destination:    string | null;
  eta:            string | null;
  total_boxes:    number | null;
  total_shipments: number | null;
  updated_at:     string;
  created_at:     string;
};

export type Bulletin = {
  date_label:    string;        // "16/05/26"
  total_count:   number;
  pending_lines: string[];      // ค้าง section
  new_lines:     string[];      // ใหม่ section
  text:          string;        // ready-to-paste full text
};

/** Bangkok-time date in DD/MM/YY format (Buddhist year omitted for chat brevity). */
function bangkokDateLabel(d = new Date()): string {
  // Get YYYY-MM-DD parts in Asia/Bangkok via toLocaleDateString
  const parts = d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).split("-");
  // parts: [YYYY, MM, DD]
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

/** Is the row "new today"? Bangkok-day-aware. */
function isNewToday(row: BulletinRow): boolean {
  const todayBkk = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const createdBkk = new Date(row.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  return createdBkk === todayBkk;
}

/** Format one line per the W-1 chat convention. */
function formatLine(row: BulletinRow, idx: number): string {
  const statusLabel = STATUS_LABEL_TH[row.status] ?? row.status;
  const emoji       = row.transport_mode ? (TRANSPORT_EMOJI[row.transport_mode] ?? "") : "";
  const route       = [row.origin, row.destination].filter(Boolean).join(" → ");
  const etaStr      = row.eta ? ` · ETA ${new Date(row.eta).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" })}` : "";
  const boxes       = row.total_boxes ? ` · ${row.total_boxes} กล่อง` : "";
  const shipCount   = row.total_shipments ? ` · ${row.total_shipments} shipment` : "";

  return `${idx}. ${emoji} ${row.code} — ${statusLabel}${route ? ` (${route})` : ""}${boxes}${shipCount}${etaStr}`;
}

/**
 * Build the full bulletin from cargo_containers.
 * Uses an admin client (service_role) — caller must be admin-gated.
 */
export async function buildDailyBulletin(admin: SupabaseClient): Promise<Bulletin> {
  // Pull all open + recently-closed containers. Filter "open-ish" via status
  // exclusion (closed = retired). Sort by updated_at desc (most-recent activity
  // floats up — matches how staff scans the chat).
  const { data, error } = await admin
    .from("cargo_containers")
    .select("code, status, transport_mode, origin, destination, eta, total_boxes, total_shipments, updated_at, created_at")
    .neq("status", "closed")
    .order("updated_at", { ascending: false })
    .returns<BulletinRow[]>();

  if (error) {
    return {
      date_label:    bangkokDateLabel(),
      total_count:   0,
      pending_lines: [],
      new_lines:     [],
      text:          `${bangkokDateLabel()} สรุปรายการ — โหลดข้อมูลไม่สำเร็จ (${error.message})`,
    };
  }

  const rows = data ?? [];
  const newRows     = rows.filter(isNewToday);
  const pendingRows = rows.filter((r) => !isNewToday(r));

  const dateLabel    = bangkokDateLabel();
  const pendingLines = pendingRows.map((r, i) => formatLine(r, i + 1));
  const newLines     = newRows.map((r, i) => formatLine(r, pendingLines.length + i + 1));

  // Compose final text
  const parts: string[] = [];
  parts.push(`${dateLabel} สรุปรายการ — รวม ${rows.length} ตู้ครับ`);
  if (pendingLines.length > 0) {
    parts.push("");
    parts.push("#ค้าง");
    parts.push(...pendingLines);
  }
  if (newLines.length > 0) {
    parts.push("");
    parts.push("##ใหม่");
    parts.push(...newLines);
  }
  if (rows.length === 0) {
    parts.push("");
    parts.push("(ไม่มีตู้ใน pipeline)");
  }

  return {
    date_label:    dateLabel,
    total_count:   rows.length,
    pending_lines: pendingLines,
    new_lines:     newLines,
    text:          parts.join("\n"),
  };
}
