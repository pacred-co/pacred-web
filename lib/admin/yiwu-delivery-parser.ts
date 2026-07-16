/**
 * Best-effort OCR → Yiwu ใบส่งของ pre-fill (2026-07-16 · ภูม · Phase 3).
 *
 * OCR of a scanned table is inherently noisy, so this is a TYPING-SAVER, never a
 * source of truth: it pre-populates the review grid, the staff CORRECTS every
 * field on screen against the image, and the money is computed server-side from
 * the CORRECTED dims. A misread here can never mis-bill — it just gets edited.
 *
 * What it detects (each independently, fail-soft):
 *   - รหัสลูกค้า (PR…) — the note's Customer ID (regex, reliable).
 *   - 单号 candidates — alphanumeric tokens with ≥1 letter + ≥4 digits (e.g.
 *     X9002653, SEA0625-8211YW) that aren't the header words.
 *   - data rows — any line carrying ≥4 numbers → [weight, L, W, H, CBM] in the
 *     column order of the standard ใบส่งของ (Weight · L · W · H · CBM). The first
 *     small integer is treated as the box count when present.
 */

export type YiwuParsedRow = {
  boxCount: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  cbm: number;
  productType: string;
};

export type YiwuParseResult = {
  memberCode: string | null;   // PR… off the note
  orderNo: string | null;      // best 单号 candidate
  packingId: string | null;    // "เลขที่ตู้/Packing ID" ต้นทาง (e.g. SEA0625-8211YW) — reference, NOT the shipping container
  rows: YiwuParsedRow[];        // best-effort data rows (staff corrects)
};

const HEADER_WORDS =
  /^(tracking|customer|pack|weight|length|width|height|cbm|description|单号|件数|重量|材积|品名|no\.?|item)/i;

// The note's "เลขที่ตู้/Packing ID" is a routing/lot code shaped like SEA0625-8211YW
// (2-4 letters · digits · dash · digits · a 2-letter warehouse suffix). It is NOT a 单号
// (which has no dash + no trailing letters) and NOT the shipping container (GZS…/GZE…,
// whose tail is like `-5T`, a single digit + single letter). Detect it separately so it
// never gets picked as the 单号.
function isPackingId(tok: string): boolean {
  return /^[A-Z]{2,4}\d{2,}-\d{2,}[A-Z]{2}$/i.test(tok);
}

/**
 * Pull the NUMERIC-CELL values out of a line, in order. Only PURE-number tokens
 * count (split on whitespace/`,`/`|`) so the digits embedded in an order code
 * (X9002653) or a description never pollute the dims. A leading `件数`-style
 * integer stays; the alnum codes drop out.
 */
function numbersIn(line: string): number[] {
  const out: number[] = [];
  for (const tok of line.split(/[\s,|]+/)) {
    if (/^\d+(?:\.\d+)?$/.test(tok)) {
      const n = Number(tok);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function isOrderCandidate(tok: string): boolean {
  if (HEADER_WORDS.test(tok)) return false;
  const digits = (tok.match(/\d/g) ?? []).length;
  const letters = (tok.match(/[A-Za-z]/g) ?? []).length;
  return letters >= 1 && digits >= 4 && tok.length >= 5 && tok.length <= 40;
}

const emptyRow = (): YiwuParsedRow => ({
  boxCount: 1, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0, cbm: 0, productType: "",
});

/**
 * Parse an OCR text block into a best-effort pre-fill. NEVER throws — on anything
 * unrecognisable it returns nulls / an empty rows array so the grid starts blank.
 */
export function parseYiwuDeliveryOcr(text: string): YiwuParseResult {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let memberCode: string | null = null;
  let orderNo: string | null = null;
  let packingId: string | null = null;
  const rows: YiwuParsedRow[] = [];

  for (const line of lines) {
    // รหัสลูกค้า — first PR… wins.
    if (!memberCode) {
      const pr = line.match(/\bPR\s?(\d{2,})\b/i);
      if (pr) memberCode = `PR${pr[1]}`;
    }
    // เลขที่ตู้/Packing ID (SEA…YW) + 单号 candidate — capture the packing-id token
    // FIRST so it can't be mistaken for the 单号.
    for (const tok of line.split(/[\s,|]+/)) {
      const clean = tok.replace(/^[^\w-]+|[^\w-]+$/g, "");
      if (!packingId && isPackingId(clean)) packingId = clean.toUpperCase();
      if (!orderNo && isOrderCandidate(clean) && !/^PR\d+$/i.test(clean) && !isPackingId(clean)) orderNo = clean;
    }
    // data row — ≥4 numbers → map to the standard column order.
    const nums = numbersIn(line);
    if (nums.length >= 4) {
      const row = emptyRow();
      // Heuristic: a leading small INTEGER (1–999) is the box count when there
      // are still ≥5 cells left for [weight, L, W, H, CBM]; otherwise every cell
      // is a metric and box count defaults to 1.
      let tail = nums;
      if (Number.isInteger(nums[0]!) && nums[0]! >= 1 && nums[0]! <= 999 && nums.length >= 5) {
        row.boxCount = nums[0]!;
        tail = nums.slice(1);
      }
      row.weightKg = tail[0] ?? 0;
      row.lengthCm = tail[1] ?? 0;
      row.widthCm = tail[2] ?? 0;
      row.heightCm = tail[3] ?? 0;
      row.cbm = tail[4] ?? 0;
      rows.push(row);
    }
  }

  return { memberCode, orderNo, packingId, rows };
}
