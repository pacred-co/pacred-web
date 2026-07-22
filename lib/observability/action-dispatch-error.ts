/**
 * Server-Action DISPATCH failure classifier + Thai user copy.
 *
 * ── The bug this closes (prod incidents 2026-07-15 → 2026-07-20) ─────────
 *
 * /admin/incidents held 6 live rows all titled
 *   "An unexpected response was received from the server."
 * on six unrelated routes (/admin/drivers/work ×13 · /admin/wallet/pay-user
 * ×2 · /admin/service-orders/…/edit ×2 · /admin/forwarders/52288 ×2 · / ×2 ·
 * /admin/drivers/new · /admin/forwarders/52346).
 *
 * Their stacks prove the shape: EVERY one is the SAME minified frame in the
 * SAME chunk (`chunks/043m4dyfsy24r.js … at I (…:3:743)`) but carries a
 * DIFFERENT `?dpl=dpl_…` deployment id. That frame is Next's server-action
 * reducer — i.e. the failure is in the ACTION DISPATCH TRANSPORT, not in any
 * one route's logic. (The same deployment `dpl_7iTjEmY2…` also produced a
 * ChunkLoadError on /admin/forwarders/52312 four hours earlier — the same
 * deploy-churn family, surfacing through a different door.)
 *
 * It reached the incident board — and blew the page up in the user's face —
 * because ~250 call sites dispatch inside
 *   `startTransition(async () => { const res = await action(); … })`
 * with NO try/catch. When the underlying fetch rejects, React re-throws to
 * the nearest error boundary → white screen + a filed incident, instead of a
 * recoverable inline message.
 *
 * NOTE — the body-size theory is DISPROVEN for this class:
 * `next.config.ts` sets `serverActions.bodySizeLimit: "50mb"`, the driver
 * photo path already downscales to ≈250 KB before submitting, and two of the
 * affected routes (`/` and `/admin/service-orders/…/edit`) upload nothing at
 * all. A shared transport failure is the only explanation that fits all six.
 *
 * ── What this module does ───────────────────────────────────────────────
 *
 * It does NOT suppress the incident globally — a genuine 413 / 500 must stay
 * visible, and `is-transient-abort.ts` deliberately keeps this message OUT of
 * its allow-list. Instead call sites CATCH the throw and render the copy from
 * here, so the surface degrades gracefully and the boundary is never reached.
 *
 * ⚠️ MONEY: pass `mutating: true` for any action that may already have moved
 * money / flipped a status. A dispatch failure is AMBIGUOUS — the request may
 * have reached the server and committed before the response was lost — so the
 * copy for a mutating action must NEVER invite a blind retry.
 *
 * Pure + isomorphic (browser-safe); imported by "use client" components.
 */

import { isTransientAbortError, isChunkLoadError } from "./is-transient-abort";

/**
 * Whole-message shapes Next's server-action client throws when the dispatch
 * itself fails (stale action id after a deploy · an edge/platform response
 * the reducer can't parse · a body rejected before the action ran).
 *
 * Matched on the trimmed, lower-cased message, whole-string only — the same
 * conservative contract as TRANSIENT_ABORT_MESSAGES. A real application error
 * whose text merely CONTAINS one of these is not matched.
 */
const DISPATCH_FAILURE_MESSAGES = new Set([
  "an unexpected response was received from the server.",
  "an unexpected response was received from the server",
]);

/**
 * True when the error came from the Server-Action dispatch transport rather
 * than from our own action body — i.e. the action's `{ ok, error }` contract
 * never got a chance to run.
 *
 * Covers three orthogonal families:
 *   1. the Next reducer's "unexpected response" throw (deploy churn / a
 *      response the reducer could not parse),
 *   2. a cancelled fetch / aborted stream (`isTransientAbortError`),
 *   3. a stale-chunk / dynamic-import failure (`isChunkLoadError`).
 *
 * All three mean the same thing to a call site: "we do not know the server's
 * answer" — which is exactly the decision the caller needs to make.
 */
export function isServerActionDispatchError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const e = error as Error & { name?: string; digest?: string };

  if (isTransientAbortError(e) || isChunkLoadError(e)) return true;

  const msg = (e.message ?? "").trim().toLowerCase();
  if (!msg) return false;
  return DISPATCH_FAILURE_MESSAGES.has(msg);
}

/**
 * Thai, user-facing copy for a caught action-dispatch failure.
 *
 * @param error   the caught value
 * @param opts.mutating
 *   `true`  → the action may have already written (payment · status flip ·
 *             upload). Copy tells staff to RELOAD AND CHECK before retrying —
 *             never "กดใหม่อีกครั้ง", which is how a double-charge happens.
 *   `false` → a pure read/refresh; a plain retry is safe (default).
 *
 * A non-dispatch error (a real bug thrown by our own code) falls through to
 * its own message so we never mask a genuine failure behind generic copy.
 */
export function describeActionDispatchError(
  error: unknown,
  opts: { mutating?: boolean } = {},
): string {
  if (isServerActionDispatchError(error)) {
    return opts.mutating
      ? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — ระบบไม่ทราบผลของรายการนี้แน่ชัด กรุณาโหลดหน้าใหม่แล้วตรวจสอบสถานะก่อน (อย่ากดซ้ำทันที)"
      : "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (อาจมีการอัปเดตระบบ) — กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
  }
  if (error instanceof Error && error.message) return error.message;
  return "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง";
}
