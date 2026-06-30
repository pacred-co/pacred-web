import "server-only";
// Client-safe types + the MOMO_LIVE_STATUSES const live in ./types (no
// "server-only") so a "use client" component (e.g. the /live mirror) can import
// them without dragging this server-only module into the browser bundle.
import { MOMO_LIVE_STATUSES, type MomoLiveStatus, type MomoLiveParcel } from "./types";
export { MOMO_LIVE_STATUSES };
export type { MomoLiveStatus, MomoLiveParcel };

/**
 * MOMO web (momocargo.com) server-side client — 2026-06-29 (ภูม · login-replication).
 *
 * WHY THIS EXISTS
 * ──────────────
 * MOMO's partner token (`MOMO_API_TOKEN`) only exposes 3 GET endpoints, and the
 * `import/track` feed DROPS parcels once they advance past the first status
 * (the "ตู้หาย" problem). MOMO's OWN web (momocargo.com) — logged in as the
 * Pacred master account — sees EVERY parcel, all statuses, WITH the customer
 * member code. This client logs in to MOMO's internal API the same way the web
 * does, so Pacred can (a) mirror that richer data into the admin and (b) fill
 * the missing member codes on the "พัสดุที่ขาด" page.
 *
 * 🔒 COST IS NEVER FETCHED. The MOMO row carries internal price/cost fields
 * (sell_price · thb_price · yuan_price · exchange_rate · service_price ·
 * ship_price · total_real_price_*). This client NORMALISES every parcel to a
 * SAFE shape (`MomoLiveParcel`) that contains ONLY operational fields
 * (tracking · member · kg · cbm · dims · container · status · image). The cost
 * fields never cross this boundary, so they can't leak to staff — by
 * construction, not by role-gating. (Owner: "บางข้อมูล เช่นเรทต้นทุน ไม่ควรให้
 * พนักงานเห็น".)
 *
 * REVERSE-ENGINEERED API CONTRACT (api.momocargo.com:5000 · NestJS · JWT)
 * ──────────────────────────────────────────────────────────────────────
 *   LOGIN   POST /api/auth/login
 *           body { username, password, os:"web" }  → 201 { data:{ token } }
 *   LIST    GET  /api/shop_orders/user/get/order/list/v2/{page}/{size}/all/{status}/all/asc/all
 *           → { data: ShopOrder[] }   (auth: Authorization: Bearer <token>)
 *   status values: waiting · arrival_kodang · sending_thai · wait_pay · sending · done
 *   DATA PATH: order.cn_tracks[].vendor_tracks[] = the individual parcels:
 *     { tracking, cn_usercode (=PR member), kg, cbm, width, length, height,
 *       quantity, container_name (=cabinet), container_code, container_no,
 *       status, status_date{}, ship_by, cn_image[] }
 *
 * AUTH: master credentials in env — `MOMO_WEB_USER` + `MOMO_WEB_PASS`
 * (never committed; set in .env.local locally + Vercel in prod). The JWT is
 * cached in-process and refreshed on expiry / 401.
 */

const BASE = "https://api.momocargo.com:5000";

const COMMON_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.momocargo.com",
  Referer: "https://www.momocargo.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36",
};

// (MOMO_LIVE_STATUSES + MomoLiveStatus + MomoLiveParcel are imported & re-exported
//  from ./types above — client-safe so the /live mirror can use them.)

// ── In-process JWT cache (per server instance) ──────────────────────────
let cachedToken: string | null = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 45 * 60 * 1000; // refresh well before MOMO expiry

class MomoWebError extends Error {}

export function isMomoWebConfigured(): boolean {
  return Boolean(process.env.MOMO_WEB_USER && process.env.MOMO_WEB_PASS);
}

async function login(): Promise<string> {
  const username = process.env.MOMO_WEB_USER;
  const password = process.env.MOMO_WEB_PASS;
  if (!username || !password) {
    throw new MomoWebError("MOMO_WEB_USER / MOMO_WEB_PASS ยังไม่ได้ตั้งใน env");
  }
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, os: "web" }),
  });
  if (!r.ok) {
    throw new MomoWebError(`MOMO login ล้มเหลว (${r.status}) — เช็ค user/pass หรือ MOMO เปลี่ยน login`);
  }
  const j = (await r.json().catch(() => null)) as { data?: { token?: string } } | null;
  const tok = j?.data?.token;
  if (!tok) throw new MomoWebError("MOMO login: ไม่เจอ token ใน response");
  cachedToken = tok;
  cachedAt = Date.now();
  return tok;
}

async function getToken(force = false): Promise<string> {
  if (!force && cachedToken && Date.now() - cachedAt < TOKEN_TTL_MS) return cachedToken;
  return login();
}

async function authedGet(path: string): Promise<unknown> {
  // MOMO signals an expired/invalid token TWO ways: HTTP 401/403, OR — the
  // sneaky one — HTTP 200 with a body `{ status:false, auth:false, ... }`. The
  // MOMO session also behaves single-use-ish: a fresh login elsewhere (another
  // tab, a cron, a dev probe) can invalidate OUR cached token, so the server
  // would otherwise silently get `auth:false` → an empty list → "พบ 0 พัสดุ".
  // On EITHER signal: drop the cache, re-login, retry once. Persistent failure
  // THROWS (so the page shows a real error, never a silent empty).
  for (let attempt = 0; attempt < 2; attempt++) {
    const tok = await getToken(attempt > 0);
    const r = await fetch(`${BASE}${path}`, {
      headers: { ...COMMON_HEADERS, Authorization: `Bearer ${tok}` },
    });
    if (r.status === 401 || r.status === 403) {
      cachedToken = null;
      continue;
    }
    if (!r.ok) throw new MomoWebError(`MOMO GET ${path} → ${r.status}`);
    const body = (await r.json().catch(() => null)) as { auth?: unknown } | null;
    if (body && typeof body === "object" && body.auth === false) {
      cachedToken = null; // 200 + auth:false → token rejected → refresh + retry
      continue;
    }
    return body;
  }
  throw new MomoWebError(`MOMO GET ${path} — auth ถูกปฏิเสธหลัง refresh (MOMO อาจ rotate session)`);
}

type RawVendorTrack = {
  tracking?: unknown;
  cn_usercode?: unknown;
  kg?: unknown;
  cbm?: unknown;
  width?: unknown;
  length?: unknown;
  height?: unknown;
  quantity?: unknown;
  status?: unknown;
  ship_by?: unknown;
  container_name?: unknown;
  container_code?: unknown;
  container_no?: unknown;
  cn_image?: unknown;
  status_date?: unknown;
};
type RawCnTrack = { type?: unknown; vendor_tracks?: RawVendorTrack[] };
type RawOrder = {
  qr_code?: unknown;
  ship_by?: unknown;
  type?: unknown;
  cn_tracks?: RawCnTrack[];
  status?: { status_id?: unknown; status?: unknown; description?: unknown };
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Flatten orders → parcels, keeping ONLY the safe operational fields. */
function flattenOrders(orders: RawOrder[]): MomoLiveParcel[] {
  const out: MomoLiveParcel[] = [];
  for (const order of orders ?? []) {
    const statusText = str(order.status?.description) || str(order.status?.status);
    const statusId = num(order.status?.status_id);
    for (const ct of order.cn_tracks ?? []) {
      for (const vt of ct.vendor_tracks ?? []) {
        const tracking = str(vt.tracking).trim();
        if (!tracking) continue;
        const img = Array.isArray(vt.cn_image) && vt.cn_image[0] ? str(vt.cn_image[0]) : null;
        out.push({
          tracking,
          memberCode: str(vt.cn_usercode).trim().toUpperCase(),
          weightKg: num(vt.kg),
          cbm: num(vt.cbm),
          width: num(vt.width),
          length: num(vt.length),
          height: num(vt.height),
          quantity: num(vt.quantity) || 1,
          containerName: str(vt.container_name),
          containerCode: str(vt.container_code),
          containerNo: str(vt.container_no),
          statusId: num(vt.status) || statusId,
          statusText,
          shipBy: str(vt.ship_by) || str(order.ship_by),
          type: str(ct.type) || str(order.type),
          imageUrl: img,
          qrCode: str(order.qr_code),
          statusDate: (vt.status_date && typeof vt.status_date === "object" ? vt.status_date : {}) as Record<
            string,
            string
          >,
        });
      }
    }
  }
  return out;
}

/** Fetch one status board → normalized parcels (cost-free). */
export async function fetchMomoLiveList(
  status: MomoLiveStatus = "sending_thai",
  size = 200,
): Promise<MomoLiveParcel[]> {
  const j = (await authedGet(
    `/api/shop_orders/user/get/order/list/v2/1/${size}/all/${status}/all/asc/all`,
  )) as { data?: RawOrder[] | { data?: RawOrder[] } };
  // MOMO returns the rows EITHER as a bare array (small pages) OR wrapped in a
  // paginated envelope { data:[...], total_page, current_page, total_data }
  // (larger pages). Handle both.
  const d = j?.data;
  const rows: RawOrder[] = Array.isArray(d)
    ? d
    : Array.isArray((d as { data?: RawOrder[] } | undefined)?.data)
      ? (d as { data: RawOrder[] }).data
      : [];
  return flattenOrders(rows);
}

/**
 * Fetch parcels across MANY statuses (for a full mirror). Best-effort per
 * status (a failing/empty status is skipped, not fatal). Deduped by tracking.
 */
export async function fetchMomoLiveAll(
  statuses: readonly MomoLiveStatus[] = MOMO_LIVE_STATUSES,
  sizePerStatus = 500,
): Promise<MomoLiveParcel[]> {
  const seen = new Set<string>();
  const out: MomoLiveParcel[] = [];
  for (const st of statuses) {
    let parcels: MomoLiveParcel[] = [];
    try {
      parcels = await fetchMomoLiveList(st, sizePerStatus);
    } catch {
      continue;
    }
    for (const p of parcels) {
      if (seen.has(p.tracking)) continue;
      seen.add(p.tracking);
      out.push(p);
    }
  }
  return out;
}

/**
 * Resolve member codes for a set of tracking numbers (for the "พัสดุที่ขาด"
 * auto-fill). Matches by exact tracking AND by base (strip the -i/n split
 * suffix) so a split parcel resolves too. Returns { tracking → memberCode }.
 */
export async function resolveMembersByTracking(
  trackings: string[],
): Promise<Record<string, string>> {
  const baseOf = (t: string) => t.trim().replace(/-\d+(\/\d+)?$/, "");
  const wantExact = new Set(trackings.map((t) => t.trim()));
  const wantBase = new Set(trackings.map((t) => baseOf(t)));
  const map: Record<string, string> = {};
  const all = await fetchMomoLiveAll();
  for (const p of all) {
    if (!p.memberCode) continue;
    if (wantExact.has(p.tracking)) map[p.tracking] = p.memberCode;
    const b = baseOf(p.tracking);
    if (wantBase.has(b) && !map[b]) map[b] = p.memberCode;
  }
  return map;
}
