import "server-only";
import { cookies } from "next/headers";
import {
  EXPERIMENTS,
  VISITOR_COOKIE,
  pickVariant,
  type ExperimentKey,
  type ExperimentVariant,
} from "./experiments";

/**
 * Server-side variant lookup — call from RSC, server actions, or route handlers.
 *
 * Separated from `lib/experiments.ts` because `next/headers` cannot be
 * imported into the middleware edge runtime (where `proxy.ts` needs
 * `pickVariant` + `newVisitorId`). Bundlers fail with "adapterFn is not a
 * function" when `next/headers` ends up in the edge bundle.
 *
 * Falls back to control if the cookie is absent — should only happen on
 * the very first request before `proxy.ts` runs (rare; cookie is set by
 * middleware so the same render has it via `request.cookies.set()`).
 */
export async function getVariantServer<K extends ExperimentKey>(
  key: K,
): Promise<ExperimentVariant<K>> {
  const c = await cookies();
  const visitorId = c.get(VISITOR_COOKIE)?.value;
  if (!visitorId) return EXPERIMENTS[key].variants[0] as ExperimentVariant<K>;
  return pickVariant(key, visitorId);
}
