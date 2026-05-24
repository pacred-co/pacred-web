/**
 * Zod schemas for search-history server actions (G8 — D1 customer-backend
 * gap #8). Locks the input contract for actions/search.ts so the route
 * handler + any future UI dropdown both validate against the same shape.
 *
 * Source of truth: supabase/migrations/0102_search_history.sql
 *   - query        — 1-500 chars, trimmed
 *   - source       — optional text (free-form provider tag)
 *   - result_count — optional non-negative int
 */

import { z } from "zod";

/**
 * Whitelist of source tags currently emitted by the codebase. Kept open
 * (z.string()) at the DB layer so new search surfaces don't need a
 * migration, but the validator restricts to the known set so a typo at
 * the call-site fails fast in tests.
 */
export const SEARCH_SOURCES = [
  "china-search.keyword",
  "china-search.url",
  "china-search.url-detail",
] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];

export const saveSearchQuerySchema = z.object({
  query:       z.string().trim().min(1, "query is required").max(500, "query too long"),
  source:      z.string().trim().min(1).max(100).optional().nullable(),
  resultCount: z.number().int().min(0).optional().nullable(),
});
export type SaveSearchQueryInput = z.infer<typeof saveSearchQuerySchema>;

export const getMyRecentSearchesSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});
export type GetMyRecentSearchesInput = z.infer<typeof getMyRecentSearchesSchema>;
