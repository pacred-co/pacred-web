/**
 * actions/admin/forwarders-bulk-types.ts — value/type constants for the
 * tb_forwarder bulk-update actions.
 *
 * 2026-06-05 (ภูม flag · /admin/forwarders/52015/edit 500): extracted out
 * of `forwarders-bulk.ts` because Next 16 rejects ANY non-async-function
 * value export from a `"use server"` file with:
 *
 *   "A `use server` file can only export async functions, found object."
 *
 * `TB_FORWARDER_STATUSES` is a `readonly string[]` (Next sees "object") — so
 * its mere presence in a `"use server"` module crashes the render of every
 * page that pulls the action in. The same class as Wave 25 #196 / Wave 23 P0.
 *
 * Rule of thumb (also captured in `docs/learnings/nextjs-16-quirks.md`):
 *   - "use server" file → ONLY `export async function …`
 *   - everything else (Zod schemas, enum arrays, plain consts, helper
 *     types, sync helpers) → a sibling `*-types.ts` / `*-schema.ts` file.
 *
 * Importing from here is safe from both client AND server contexts.
 */

/** Legacy tb_forwarder.fstatus alphabet — '1'..'7' for the 7-step pipeline
 *  + '99' for the special-rollback / "พักไว้" state. */
export const TB_FORWARDER_STATUSES = ["1", "2", "3", "4", "5", "6", "7", "99"] as const;

export type TbForwarderStatus = (typeof TB_FORWARDER_STATUSES)[number];
