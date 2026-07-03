/**
 * Google Keyword Planner CSV → planner keyword rows (ปอน 2026-07-03).
 *
 * The "Keyword Stats" export is UTF-16 LE, TAB-delimited (despite the .csv
 * extension) with TWO preamble lines (title + date range) before the header.
 * This parser takes the ALREADY-DECODED text (the caller sniffs the BOM +
 * TextDecoders it — see readKeywordCsvFile in keyword-import-modal.tsx) and maps
 * it to the planner's keyword shape.
 *
 * Columns are matched BY HEADER NAME, never by fixed index, so a re-ordered or
 * extra-column export still imports. The English headers below are stable even
 * in a Thai-locale export (the localized columns like Competition text are
 * ignored — we read the language-independent "indexed value" instead):
 *   Keyword                       → keyword   (Thai inter-token spaces collapsed)
 *   Avg. monthly searches         → volume
 *   Competition (indexed value)   → difficulty (already 0-100)
 *   Top of page bid (low/high)    → cpc        (midpoint of the range)
 * `tier` (หลัก/รอง/ย่อย) is NOT in the export → derived from volume, editable later.
 */
import type { KeywordTier } from "./types";

export type ParsedKeywordRow = {
  keyword: string;
  volume?: number;
  cpc?: number;
  difficulty?: number;
};

export type ParseResult = {
  rows: ParsedKeywordRow[];
  /** False when the file has no "Keyword" header row (not a Keyword Planner export). */
  headerFound: boolean;
};

const STRIP_BOM = /^﻿/;

/**
 * Collapse the inter-token spaces Google inserts BETWEEN Thai characters
 * ("นำ เข้า สินค้า จีน" → "นำเข้าสินค้าจีน") while leaving spaces around non-Thai
 * text intact ("china import" stays "china import"). The second Thai char is a
 * lookahead (not consumed) so runs of 3+ tokens collapse in a single pass.
 */
export function collapseThaiSpaces(s: string): string {
  return s.replace(/([฀-๿]) +(?=[฀-๿])/g, "$1");
}

/** Parse a numeric cell ("1,500" · "24.24" · "" · "-") → number | undefined. */
function toNum(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const s = raw.replace(/,/g, "").replace(/[^0-9.\-]/g, "").trim();
  if (s === "" || s === "-" || s === ".") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Volume → tier heuristic used to auto-classify imported keywords (ปอน picks
 * only the service on upload; tier isn't in the CSV). Editable per-row after.
 *   ≥ 1,000 searches/mo → primary (หลัก) · ≥ 100 → secondary (รอง) · else longtail (ย่อย)
 */
export function tierFromVolume(volume?: number): KeywordTier {
  if (typeof volume === "number") {
    if (volume >= 1000) return "primary";
    if (volume >= 100) return "secondary";
  }
  return "longtail";
}

export function parseKeywordCsv(text: string): ParseResult {
  const lines = text.replace(STRIP_BOM, "").split(/\r?\n/);

  // Locate the header row by its "Keyword" cell — Google prepends a title +
  // date-range line, so never assume the header is a fixed line number.
  let headerIdx = -1;
  let header: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const cells = lines[i].split("\t").map((c) => c.replace(STRIP_BOM, "").trim());
    if (cells.includes("Keyword")) {
      headerIdx = i;
      header = cells;
      break;
    }
  }
  if (headerIdx < 0) return { rows: [], headerFound: false };

  const col = (re: RegExp): number => header.findIndex((h) => re.test(h));
  const iKw = header.indexOf("Keyword");
  const iVol = col(/^Avg\.?\s*monthly\s*searches$/i);
  const iDiff = col(/^Competition\s*\(indexed value\)$/i);
  const iLo = col(/^Top of page bid\s*\(low range\)$/i);
  const iHi = col(/^Top of page bid\s*\(high range\)$/i);

  const rows: ParsedKeywordRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "") continue;
    const cells = lines[i].split("\t");
    const keyword = collapseThaiSpaces((cells[iKw] ?? "").trim());
    if (!keyword) continue;

    const volume = iVol >= 0 ? toNum(cells[iVol]) : undefined;
    const diff = iDiff >= 0 ? toNum(cells[iDiff]) : undefined;
    const lo = iLo >= 0 ? toNum(cells[iLo]) : undefined;
    const hi = iHi >= 0 ? toNum(cells[iHi]) : undefined;
    const cpc =
      lo != null && hi != null ? Math.round(((lo + hi) / 2) * 100) / 100 : (hi ?? lo);

    rows.push({
      keyword,
      volume: volume != null ? Math.round(volume) : undefined,
      cpc,
      difficulty: diff != null ? Math.round(diff) : undefined,
    });
  }
  return { rows, headerFound: true };
}
