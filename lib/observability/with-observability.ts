/**
 * IO-1 Server-Action error wrapper — a capture rail with NO submit
 * button (design doc §6.3, IO-1.6).
 *
 * Wrap a server action so a THROWN error is captured as a
 * platform_incidents row (kind='failed_action') BEFORE it propagates.
 * The staff member sees the action fail exactly as normal; the incident
 * is filed automatically — the "ถ้าเจอก็ส่งเลย" mechanic.
 *
 *   // in actions/foo.ts
 *   export const doFoo = withObservability("doFoo", async (input) => {
 *     ...action body...
 *   });
 *
 * IMPORTANT — this captures THROWN errors only. Most Pacred actions do
 * NOT throw; they return `{ ok: false, error }` (the AdminActionResult
 * convention). Those are handled-and-reported failures, not incidents,
 * and are intentionally NOT captured here — that would flood the table
 * with expected validation rejections. This wrapper is for the
 * unexpected: a null-deref, a DB driver error, a programming bug.
 *
 * Re-throws after capture so the caller's existing error handling
 * (Next.js error boundary, the action's own try/catch) is unchanged.
 *
 * Server-only.
 */

import "server-only";
import { captureIncident } from "./incident-store";
import { logger } from "@/lib/logger";

/**
 * Wrap a server action with automatic incident capture on a thrown
 * error. Generic over the action's args + return type — the wrapped
 * function keeps the exact same signature.
 *
 * @param actionName  a stable label stored in surface_meta.action —
 *                     keep it identifier-like ("adminResolveIncident").
 * @param fn          the action body.
 */
export function withObservability<TArgs extends unknown[], TReturn>(
  actionName: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await fn(...args);
    } catch (err) {
      // Capture, then re-throw. Capture is best-effort — if it fails we
      // still re-throw the ORIGINAL error so behaviour is unchanged.
      try {
        const error = err instanceof Error ? err : new Error(String(err));
        await captureIncident({
          source:  "server",
          kind:    "failed_action",
          message: `[${actionName}] ${error.message}`,
          stack:   error.stack ?? null,
          surfaceMeta: { action: actionName },
        });
      } catch (captureErr) {
        logger.error("observability", "withObservability capture failed", captureErr, {
          action: actionName,
        });
      }
      throw err;
    }
  };
}
