/**
 * CargoThai partner API client — Sprint-7 foundation (Gap #4).
 *
 * Faithful port of legacy `test-api/update-data-cargothai/index.php`.
 * Pulls container + product manifest data from CargoThai's GetContainerV2
 * endpoint into `tb_tmp_forwarder_cargothai` + `tb_tmp_forwarder_item_cargothai`
 * (the tables already exist in 0081/0082).
 *
 * Endpoint:
 *   GET https://cargothai.tech/api/service/GetContainerV2
 *       ?_token=<PACRED_CARGOTHAI_TOKEN>
 *       &Sdate=YYYY-MM-DD&Edate=YYYY-MM-DD
 *       &limit=1000&page=1
 *
 * Auth: a static `_token` query-string parameter (the legacy hardcoded
 * one in plain text — we lift it into an env var so the secret never
 * lives in code). The token is requested from CargoThai ops; bail
 * `not_configured` until it's set.
 *
 * Server-only — uses no Supabase client; the caller (action / cron)
 * does the upsert with the admin client.
 */
import "server-only";
import { logger } from "@/lib/logger";

const DEFAULT_BASE_URL = "https://cargothai.tech/api/service";
const ENDPOINT_GET_CONTAINER_V2 = "/GetContainerV2";

/** A single container row from CargoThai (legacy `tb_tmp_forwarder_cargothai`). */
export type CargoThaiContainer = {
  id:               number | string;
  container_name:   string;
  container_code:   string;
  due_date:         string | null;
  box_total:        number | string | null;
  box_weight:       number | string | null;
  box_cbm:          number | string | null;
  // CargoThai's payload has a typo for one field (`costomer_code`) that
  // the legacy PHP works around; we keep both shapes here.
  costomer_code?:   string | null;
  customer_code?:   string | null;
  order_no:         string | null;
  sm_code:          string;
  sm_date:          string | null;
  manifest_date:    string | null;
  estimated_date:   string | null;
  image_path:       string | null;
  etd:              string | null;
  eta:              string | null;
  re:               string | null;
  created_at:       string | null;
  updated_at:       string | null;
  note:             string | null;
  note_amount:      number | string | null;
  tracking:         string | null;
  transport_name:   string | null;
  transport_code:   string | null;
  warehouse_name:   string | null;
  warehouse_code:   string | null;
  product_list:     CargoThaiProduct[];
};

/** A single product inside a container (legacy `tb_tmp_forwarder_item_cargothai`). */
export type CargoThaiProduct = {
  product_id:               string | number;
  product_name:             string;
  product_tracking:         string | null;
  product_tracking_note:    string | null;
  product_qty:              number | string | null;
  product_width:            number | string | null;
  product_length:           number | string | null;
  product_height:           number | string | null;
  product_weight_per_item:  number | string | null;
  product_weight_all:       number | string | null;
  product_cbm_per_item:     number | string | null;
  product_cbm_all:          number | string | null;
  product_weight_format:    string | null;
  product_type_code:        string | null;
};

/** Discriminated result the caller can branch on. */
export type FetchContainersResult =
  | { ok: true;  containers: CargoThaiContainer[]; page: number; hasMore: boolean }
  | { ok: false; reason: "not_configured" | "invalid_input" | "auth_failed"
                       | "rate_limited" | "network" | "parse_error"
                       | "http_error";
      httpStatus?: number;
      message?: string; };

export type FetchContainersInput = {
  /** YYYY-MM-DD, inclusive lower bound on the SM date. */
  from?:  string;
  /** YYYY-MM-DD, inclusive upper bound. */
  to?:    string;
  /** Page size (CargoThai uses 1000 in legacy). Capped to 1000 here. */
  limit?: number;
  page?:  number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pull a page of containers from CargoThai. Returns the parsed shape +
 * a best-effort `hasMore` flag (CargoThai doesn't expose a total-rows
 * field, so we infer from `containers.length === limit`).
 *
 * Side-effect-free — the caller upserts into `tb_tmp_forwarder_*`.
 */
export async function fetchContainers(
  input: FetchContainersInput = {},
): Promise<FetchContainersResult> {
  const token = process.env.PACRED_CARGOTHAI_TOKEN;
  if (!token) {
    return { ok: false, reason: "not_configured", message: "PACRED_CARGOTHAI_TOKEN env not set" };
  }

  const base = (process.env.PACRED_CARGOTHAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  // Default to a 1-day window matching the legacy cron behaviour:
  //   Sdate = yesterday, Edate = today.
  const today = new Date();
  const yday  = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const fmt   = (d: Date) => d.toISOString().slice(0, 10);
  const from  = input.from ?? fmt(yday);
  const to    = input.to   ?? fmt(today);

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return { ok: false, reason: "invalid_input", message: "from/to must be YYYY-MM-DD" };
  }
  const limit = Math.min(Math.max(1, input.limit ?? 1000), 1000);
  const page  = Math.max(1, input.page ?? 1);

  const url = `${base}${ENDPOINT_GET_CONTAINER_V2}` +
    `?_token=${encodeURIComponent(token)}` +
    `&Sdate=${from}&Edate=${to}` +
    `&limit=${limit}&page=${page}`;

  try {
    const res = await fetch(url, {
      method:  "GET",
      headers: { Accept: "application/json" },
      cache:   "no-store",
      signal:  AbortSignal.timeout(30_000),  // CargoThai V2 can be slow with limit=1000
    });

    if (res.status === 401 || res.status === 403) {
      logger.warn("cargothai", "auth failed — token revoked or wrong", { status: res.status });
      return { ok: false, reason: "auth_failed", httpStatus: res.status };
    }
    if (res.status === 429) {
      return { ok: false, reason: "rate_limited", httpStatus: 429 };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      logger.warn("cargothai", "non-2xx", { status: res.status, body: body.slice(0, 200) });
      return { ok: false, reason: "http_error", httpStatus: res.status, message: body.slice(0, 200) };
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (err) {
      logger.error("cargothai", "json parse failed", err);
      return { ok: false, reason: "parse_error", message: "non-JSON response" };
    }

    // Shape check — must be `{ data: [...] }` per the legacy probe.
    const data = (parsed as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      return { ok: false, reason: "parse_error", message: "response.data is not an array" };
    }

    // Light validation — we trust the upstream shape but normalise the
    // typo'd `costomer_code` field so the caller can read one canonical key.
    const containers: CargoThaiContainer[] = data.map((row) => {
      const r = row as Partial<CargoThaiContainer>;
      const customer_code = r.customer_code ?? r.costomer_code ?? "";
      return {
        ...(r as CargoThaiContainer),
        customer_code,
      };
    });

    return {
      ok: true,
      containers,
      page,
      hasMore: containers.length >= limit,
    };
  } catch (err) {
    logger.error("cargothai", "fetch threw", err);
    return {
      ok:      false,
      reason:  "network",
      message: err instanceof Error ? err.message : "unknown",
    };
  }
}

/** Helper for sync code — derive `userID` for a row per the legacy fallback
 *  rules (`customer_code` or special-case `NOCODE` / `F` → `FX1`). */
export function normaliseUserId(row: CargoThaiContainer): string {
  const code = (row.customer_code ?? row.costomer_code ?? "").trim();
  if (code === "" || code === "NOCODE" || code === "F") return "FX1";
  return code;
}

/** Parse the legacy SM code into its three parts (sm, userID, hNo)
 *  for upserts that need the split (legacy index.php L79-92). */
export function splitSmCode(smCode: string): { sm: string; hNo: string } {
  const parts = (smCode ?? "").split("-");
  if (parts.length === 3) return { sm: parts[0], hNo: parts[2] };
  if (parts.length === 2) return { sm: parts[0], hNo: "" };
  return { sm: parts[0] ?? "", hNo: "" };
}
