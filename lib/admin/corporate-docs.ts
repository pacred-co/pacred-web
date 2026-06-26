/**
 * Corporate-doc shared types + pure parser (owner 2026-06-26).
 *
 * Lives OUTSIDE actions/admin/customer-profile.ts because that file is
 * `"use server"` — which may only export async functions. The doc-type
 * constant + the pure parser + the types are imported by both the server
 * actions and the client/server UI (profile-sections.tsx · legacy-view.tsx).
 */

export const CORPORATE_DOC_TYPES = ["vat", "affidavit", "director_id", "other"] as const;
export type CorporateDocType = (typeof CORPORATE_DOC_TYPES)[number];
export type CorporateDoc = { type: CorporateDocType; key: string; name: string; at: string };

/** Tolerant parse of tb_corporate.corporate_docs (jsonb array, or a string, or null). */
export function parseCorporateDocs(raw: unknown): CorporateDoc[] {
  if (!raw) return [];
  let arr: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (d): d is CorporateDoc =>
      !!d && typeof d === "object" &&
      typeof (d as CorporateDoc).key === "string" && (d as CorporateDoc).key.trim() !== "" &&
      (CORPORATE_DOC_TYPES as readonly string[]).includes((d as CorporateDoc).type),
  );
}
