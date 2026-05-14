"use client";

import { useEffect } from "react";
import { getVariantClient, type ExperimentKey } from "@/lib/experiments";
import { trackExperimentExposure } from "@/lib/analytics";

/**
 * Renders nothing — exists only to fire `trackExperimentExposure(key, variant)`
 * once per mount. Drop into any page where an experiment is "active" in the
 * registry to log exposures to GTM + Clarity even before the variant changes
 * any UI.
 *
 * Server-side variant is unknown at render (cookie not visible to SSR for
 * first-visit users); we read it client-side via `getVariantClient`. On
 * first paint of a new visitor the cookie is set by `proxy.ts` middleware
 * but isn't visible to `document.cookie` until the response cookie reaches
 * the browser — `useEffect` runs after that, so exposure tracking is
 * reliable on the second-and-onward render in the same session.
 *
 * Usage:
 *   <ExperimentBeacon experimentKey="home_hero_cta" />
 */
export function ExperimentBeacon<K extends ExperimentKey>({
  experimentKey,
}: {
  experimentKey: K;
}) {
  useEffect(() => {
    const variant = getVariantClient(experimentKey);
    if (variant) {
      trackExperimentExposure(experimentKey, variant);
    }
  }, [experimentKey]);

  return null;
}
