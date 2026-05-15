/**
 * MOMO JMF — typed HTTP client.
 *
 * Wraps fetch() with auth header + base URL + error normalisation.
 *
 * Env vars (per docs/env.md §19):
 *   MOMO_JMF_TOKEN     — Bearer JWT (received 2026-05-16, stored in .env.local)
 *   MOMO_JMF_BASE_URL  — partner base URL (pending ก๊อต MOMO-1 confirmation)
 *
 * In **demo mode** (no env vars set), every method returns a typed
 * "not_configured" error so customer-facing paths degrade gracefully
 * (no thrown exceptions in /service-import/.../container or admin warehouse pages).
 *
 * @see docs/integrations/momo-jmf.md
 */

import type {
  MomoContainerSummary,
  MomoContainerDetail,
  MomoShipmentSummary,
  MomoTrackingEvent,
} from "./types";

export type MomoResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: "not_configured" | "auth_failed" | "not_found" | "parse_error" | "network" | string };

function getConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.MOMO_JMF_BASE_URL;
  const token   = process.env.MOMO_JMF_TOKEN;
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function request<T>(path: string, init?: RequestInit): Promise<MomoResult<T>> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "not_configured" };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${cfg.token}`,
        "Content-Type":  "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "network" };
  }

  if (res.status === 401 || res.status === 403) return { ok: false, error: "auth_failed" };
  if (res.status === 404)                       return { ok: false, error: "not_found" };
  if (!res.ok)                                  return { ok: false, error: `momo_http_${res.status}` };

  const json: unknown = await res.json().catch(() => null);
  if (json === null) return { ok: false, error: "parse_error" };
  return { ok: true, data: json as T };
}

// ─── Public API ───────────────────────────────────────────────────
//
// Endpoint paths below are PLACEHOLDERS based on the legacy cargo-thai
// wire pattern. ก๊อต MOMO-1 confirms the actual paths; if MOMO uses
// /api/v1/containers etc., adjust here.

export async function listContainers(updatedSince?: Date): Promise<MomoResult<MomoContainerSummary[]>> {
  const qs = updatedSince ? `?updated_since=${encodeURIComponent(updatedSince.toISOString())}` : "";
  return request<MomoContainerSummary[]>(`/containers${qs}`);
}

export async function getContainer(code: string): Promise<MomoResult<MomoContainerDetail>> {
  return request<MomoContainerDetail>(`/containers/${encodeURIComponent(code)}`);
}

export async function getContainerManifest(code: string): Promise<MomoResult<MomoShipmentSummary[]>> {
  return request<MomoShipmentSummary[]>(`/containers/${encodeURIComponent(code)}/manifest`);
}

export async function getShipmentTracking(shipmentCode: string): Promise<MomoResult<MomoTrackingEvent[]>> {
  return request<MomoTrackingEvent[]>(`/shipments/${encodeURIComponent(shipmentCode)}/tracking`);
}
