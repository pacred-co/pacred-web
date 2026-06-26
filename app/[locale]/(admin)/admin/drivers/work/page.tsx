/**
 * /admin/drivers/work — mobile driver work-list (Wave 10).
 *
 * The page drivers open on their phone to see "งานที่ต้องส่งวันนี้".
 * Faithful port of `pcs-admin/forwarder-driver-w.php` against the legacy
 * `tb_forwarder_driver_item` + `tb_forwarder_driver` + `tb_forwarder`
 * tables (the only tables with live data on prod — the rebuilt-era
 * `forwarder_driver` table behind /admin/driver-runs is empty).
 *
 * Schema reminder (verified prod via 0081_pcs_legacy_schema.sql lines
 * 1973-2018):
 *   - `tb_forwarder_driver`         id, fddate, fdname, fdadminid (= tb_users.userid),
 *                                   fdadmincreator, fdstatus '1'|'2'|'3', fdamount
 *   - `tb_forwarder_driver_item`    id, fdid (FK→tb_forwarder_driver.id),
 *                                   fid  (FK→tb_forwarder.id), fdistatus '' / '1' / '2' / '3',
 *                                   fdipictureon, fdipictureoff
 *   - `tb_forwarder`                see migration 0081 line 1598 — address cols
 *                                   are `faddressname` / `faddresslastname` /
 *                                   `faddressno` / `faddresssubdistrict` /
 *                                   `faddressdistrict` / `faddressprovince` /
 *                                   `faddresszipcode` / `faddresstel`
 *                                   (NOT `haddress*` — that was a typo in the
 *                                   Wave-10 brief).
 *
 * fdistatus legend:
 *   ''   ยังไม่ขึ้นรถ (default — empty string)
 *   '1'  ขึ้นรถแล้ว / กำลังส่ง
 *   '2'  ส่งสำเร็จ
 *   '3'  ส่งไม่ได้ / หมดเวลา
 *
 * Filtering:
 *   - `driver` role → page auto-filters to the caller's own batches
 *                     (joins tb_forwarder_driver.fdadminid = profiles.member_code)
 *   - `ops`/`super` → see ALL drivers + a `?driver=PR####` selector
 *
 * Mobile-first design (docs/mobile-first-playbook.md):
 *   - Card-per-row (NO table). Cards stack vertically on phone.
 *   - Tap targets ≥ 48px (the two action buttons are min-h-[48px]).
 *   - Body text ≥ 16px (text-base).
 *   - No horizontal scroll at 360px width.
 *   - Phone number renders as a `tel:` link.
 *
 * Wave 11 backlog:
 *   - Photo upload on "ขึ้นรถ" / "ส่งสำเร็จ" → write fdipictureon / fdipictureoff
 *   - Add fdinote column to the schema for the "ส่งไม่ได้" reason
 *   - Wire a driver-runs deep-link to one batch (the `fdid`) for ops
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { DriverItemActionButtons } from "./action-buttons";

export const dynamic = "force-dynamic";

type TabKey = "all" | "pending" | "loaded" | "done";

const TAB_LABEL: Record<TabKey, string> = {
  all:     "ทั้งหมด",
  pending: "ยังไม่ขึ้นรถ",
  loaded:  "กำลังส่ง",
  done:    "เสร็จ",
};

const STATUS_LABEL: Record<string, string> = {
  "":  "ยังไม่ขึ้นรถ",
  "1": "กำลังส่ง",
  "2": "ส่งสำเร็จ",
  "3": "ส่งไม่ได้",
};

const STATUS_CLS: Record<string, string> = {
  "":  "bg-gray-100 text-gray-700 border-gray-200",
  "1": "bg-blue-100 text-blue-700 border-blue-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};

const F_STATUS_LABEL: Record<string, string> = {
  "1":"รอเข้าโกดังจีน","2":"ถึงโกดังจีนแล้ว","3":"กำลังส่งมาไทย","4":"ถึงไทยแล้ว",
  "5":"รอชำระเงิน","6":"เตรียมส่ง","7":"ส่งแล้ว","99":"พิเศษ",
};

type Item = {
  id:           number;
  fdid:         number;
  fid:          number;
  fdistatus:    string;
  fdipictureon: string | null;
  fdipictureoff: string | null;
  fdinote:      string | null;  // 0213: เหตุผล "ส่งไม่ได้" (โชว์คาแถว)
};

type Batch = {
  id:           number;
  fddate:       string | null;
  fdname:       string | null;
  fdadminid:    string;
  fdstatus:     string;
};

type Forwarder = {
  id:                   number;
  fidorco:              string | null;
  fstatus:              string;
  userid:               string | null;
  ftrackingchn:         string | null;
  fcabinetnumber:       string | null;
  ftotalprice:          number | null;
  fweight:              number | null;
  fvolume:              number | null;
  faddressname:         string | null;
  faddresslastname:     string | null;
  faddressno:           string | null;
  faddresssubdistrict:  string | null;
  faddressdistrict:     string | null;
  faddressprovince:     string | null;
  faddresszipcode:      string | null;
  faddresstel:          string | null;
  faddresstel2:         string | null;
  fnote:                string | null;
};

type DriverUser = {
  userID:        string;
  userName:      string | null;
  userLastName:  string | null;
  userTel:       string | null;
};

export default async function DriverWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; driver?: string }>;
}) {
  // Driver role is the primary intended audience; ops/super see everything
  // for oversight + to demo / help when a driver is stuck.
  const { user, roles } = await requireAdmin(["driver", "ops", "super"]);
  const sp     = await searchParams;
  const tab    = (["all","pending","loaded","done"].includes(sp.tab ?? "") ? sp.tab : "all") as TabKey;
  const isAdminOverride = isGodRole(roles) || roles.includes("ops");

  const admin = createAdminClient();

  // Resolve the caller's legacy userid (tb_users.userid) via their
  // profiles.member_code. The driver role uses this for self-filtering;
  // ops/super may override with ?driver=PR####.
  const supabase = await createClient();
  const { data: myProfile, error: myProfileErr } = await supabase
    .from("profiles")
    .select("member_code, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null; first_name: string | null; last_name: string | null }>();
  if (myProfileErr) {
    console.error(`[profiles list] failed`, { code: myProfileErr.code, message: myProfileErr.message });
  }
  const myUserid = myProfile?.member_code ?? null;
  const myName   = `${myProfile?.first_name ?? ""} ${myProfile?.last_name ?? ""}`.trim();

  // Decide which driver's queue to render.
  //   driver role  → always own (ignore ?driver= to prevent peeking at peers)
  //   ops/super    → ?driver= if present, else ALL drivers
  const filterDriver = !isAdminOverride
    ? (myUserid ?? null)
    : (sp.driver?.trim() || null);

  // ─── BUG-FIX 2026-05-23 (ภูม flagged · screenshots) ─────────────────
  // The previous flow loaded the 200 most-recent batches by fddate then
  // counted items WITHIN that batch window. Result: "ทั้งหมด" view (no
  // driver filter) saw 0 pending because the global last-200-batches
  // window was full of recent COMPLETED batches; per-driver view saw 1
  // pending because that driver's 200 batches reached back far enough to
  // include their stale pending one (Dec 2025).
  //
  // New flow:
  //   1. If driver filter active → resolve fdadminid → batch_ids first
  //      (limit 5000 — enough to cover most drivers' full history)
  //   2. Count pending + loaded + done DIRECTLY via tb_forwarder_driver_item
  //      with fdistatus filter (counts are accurate; pending is small;
  //      done is bounded by table size = 11k items). Apply driver batch_ids
  //      filter via .in("fdid", batchIds).
  //   3. Load CARDS for the active tab only — apply fdistatus filter at
  //      the SQL level + sort by id DESC (newest item first), limit 200.
  //   4. Resolve batches + forwarders for ONLY the items we're displaying.
  //
  // Performance: 3 count queries (head:true, indexed) + 1 item query
  // (filtered) + 2 join queries (small in-list). Same wall-clock as
  // before · fixes the global-pending-count blindspot.
  // ────────────────────────────────────────────────────────────────────

  // 1. If filtering by driver, fetch ALL their batch ids first (no 200-batch
  //    window — pending items from old batches must still count).
  let driverBatchIds: number[] | null = null;
  if (filterDriver) {
    const { data: dbatches, error: dbatchesErr } = await admin
      .from("tb_forwarder_driver")
      .select("id")
      .eq("fdadminid", filterDriver)
      .order("fddate", { ascending: false })
      .limit(5000);
    if (dbatchesErr) {
      console.error(`[tb_forwarder_driver list] failed`, { code: dbatchesErr.code, message: dbatchesErr.message });
    }
    driverBatchIds = ((dbatches ?? []) as { id: number }[]).map((b) => b.id);
    if (driverBatchIds.length === 0) {
      return renderShell({
        tab, filterDriver, isAdminOverride, myName, myUserid,
        counters: { pending: 0, loaded: 0, done: 0 },
        driverDirectory: isAdminOverride ? await loadDriverDirectory(admin) : [],
        cards: [],
      });
    }
  }

  // 2. Count items by status directly (accurate global counts).
  // PostgREST quirk: `.eq("fdistatus", "")` matches the empty-string rows
  // legacy uses for "ยังไม่ขึ้นรถ"; some rows may instead have NULL ·
  // include both via .or() so the count doesn't undershoot.
  const baseCount = () => {
    const q = admin
      .from("tb_forwarder_driver_item")
      .select("id", { count: "exact", head: true });
    return driverBatchIds ? q.in("fdid", driverBatchIds) : q;
  };
  const [
    { count: pendingCount },
    { count: loadedCount },
    { count: doneCount },
  ] = await Promise.all([
    baseCount().or("fdistatus.eq.,fdistatus.is.null"),
    baseCount().eq("fdistatus", "1"),
    baseCount().in("fdistatus", ["2", "3"]),
  ]);

  const counters = {
    pending: pendingCount ?? 0,
    loaded:  loadedCount  ?? 0,
    done:    doneCount    ?? 0,
  };

  // 3. Load CARDS for the active tab — apply status filter + driver-batch
  //    filter at the SQL layer, limit 200 for the display window.
  let itemQ = admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fid, fdistatus, fdipictureon, fdipictureoff, fdinote")
    .order("id", { ascending: false })
    .limit(200);
  if (tab === "pending")     itemQ = itemQ.or("fdistatus.eq.,fdistatus.is.null");
  else if (tab === "loaded") itemQ = itemQ.eq("fdistatus", "1");
  else if (tab === "done")   itemQ = itemQ.in("fdistatus", ["2", "3"]);
  // "all" tab: surface the OPEN work first (pending + loaded) — done items
  // crowd out the urgent ones if we don't filter. Operator on the "all"
  // tab cares about "what's still on the road" + a peek at recently done.
  else                       itemQ = itemQ.or("fdistatus.eq.,fdistatus.is.null,fdistatus.eq.1");
  if (driverBatchIds) itemQ = itemQ.in("fdid", driverBatchIds);
  const { data: itemRows, error: itemRowsErr } = await itemQ;
  if (itemRowsErr) {
    console.error(`[tb_forwarder_driver_item list] failed`, { code: itemRowsErr.code, message: itemRowsErr.message });
  }
  const items = (itemRows ?? []) as Item[];

  // 4. Load matching batches + forwarders only for those items.
  const itemBatchIds = Array.from(new Set(items.map((i) => i.fdid)));
  const itemFwdIds   = Array.from(new Set(items.map((i) => i.fid)));

  const [batchRes, fwdRes] = await Promise.all([
    itemBatchIds.length > 0
      ? admin
          .from("tb_forwarder_driver")
          .select("id, fddate, fdname, fdadminid, fdstatus")
          .in("id", itemBatchIds)
      : Promise.resolve({ data: [] as Batch[] }),
    itemFwdIds.length > 0
      ? admin
          .from("tb_forwarder")
          .select(
            "id, fidorco, fstatus, userid, ftrackingchn, fcabinetnumber, ftotalprice, fweight, fvolume, " +
            "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
            "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2, fnote",
          )
          .in("id", itemFwdIds)
      : Promise.resolve({ data: [] as Forwarder[] }),
  ]);

  const batches = ((batchRes.data ?? []) as Batch[]);
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const forwarders = (fwdRes.data ?? []) as unknown as Forwarder[];
  const forwarderById = new Map(forwarders.map((f) => [f.id, f]));

  // Resolve the CUSTOMER name for each parcel's userid (legacy links by
  // `userid` TEXT, not an FK → one tb_users .in() lookup · same pattern as
  // loadDriverDirectory below). The driver must see WHOSE parcel it is
  // (PR + name + tracking), not just an order number. CAMELCASE cols.
  const custIds = Array.from(
    new Set(forwarders.map((f) => (f.userid ?? "").trim()).filter(Boolean)),
  );
  const customerNameById = new Map<string, string>();
  if (custIds.length > 0) {
    const { data: custRows, error: custErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", custIds);
    if (custErr) {
      console.error(`[drivers/work] customer name lookup failed`, { code: custErr.code, message: custErr.message });
    }
    for (const u of (custRows ?? []) as { userID: string; userName: string | null; userLastName: string | null }[]) {
      const name = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim();
      if (name) customerNameById.set(u.userID, name);
    }
  }

  // 5. Materialise card rows (item + batch + forwarder).
  const baseCards = items
    .map((it) => {
      const batch = batchById.get(it.fdid);
      const fwd   = forwarderById.get(it.fid);
      if (!batch || !fwd) return null;
      return { item: it, batch, forwarder: fwd };
    })
    .filter((c): c is { item: Item; batch: Batch; forwarder: Forwarder } => c !== null)
    .sort((a, b) => {
      const ad = a.batch.fddate ? Date.parse(a.batch.fddate) : 0;
      const bd = b.batch.fddate ? Date.parse(b.batch.fddate) : 0;
      return bd - ad;
    });

  // 6. Resolve signed URLs for the uploaded photos (Wave 12-B).
  //    Bucket is private; render-time signed URLs (1 hour) are cheap to
  //    mint here in parallel and let us pass plain <img src> to the
  //    Card. Only generates URLs for items that have an uploaded photo.
  const cards = await Promise.all(
    baseCards.map(async (c) => {
      const [onUrl, offUrl] = await Promise.all([
        c.item.fdipictureon  ? getSignedBucketUrl("forwarder-covers", c.item.fdipictureon)  : Promise.resolve(null),
        c.item.fdipictureoff ? getSignedBucketUrl("forwarder-covers", c.item.fdipictureoff) : Promise.resolve(null),
      ]);
      const customerName = customerNameById.get((c.forwarder.userid ?? "").trim()) ?? "—";
      return { ...c, photoOnUrl: onUrl, photoOffUrl: offUrl, customerName };
    }),
  );

  const driverDirectory = isAdminOverride ? await loadDriverDirectory(admin) : [];

  return renderShell({
    tab, filterDriver, isAdminOverride, myName, myUserid,
    counters, driverDirectory, cards,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Driver directory — for the ops/super driver-picker dropdown. Lists
// distinct fdadminid values from tb_forwarder_driver, joined to tb_users
// for the display name. Lightweight: scans only the last 200 batches'
// distinct admin ids (same window as the main query).
// ─────────────────────────────────────────────────────────────────────
async function loadDriverDirectory(admin: ReturnType<typeof createAdminClient>) {
  const { data: batchAdminRows, error: batchAdminRowsErr } = await admin
    .from("tb_forwarder_driver")
    .select("fdadminid")
    .order("fddate", { ascending: false })
    .limit(500);
  if (batchAdminRowsErr) {
    console.error(`[tb_forwarder_driver list] failed`, { code: batchAdminRowsErr.code, message: batchAdminRowsErr.message });
  }
  const adminIds = Array.from(new Set((batchAdminRows ?? []).map((r) => (r as { fdadminid: string }).fdadminid))).filter(Boolean);
  if (adminIds.length === 0) return [];

  const { data: userRows, error: userRowsErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel")
    .in("userID", adminIds);
  if (userRowsErr) {
    console.error(`[tb_users list] failed`, { code: userRowsErr.code, message: userRowsErr.message });
  }
  const users = (userRows ?? []) as DriverUser[];
  const byId  = new Map(users.map((u) => [u.userID, u]));
  return adminIds.map((id) => {
    const u = byId.get(id);
    const name = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim();
    return { userid: id, label: name ? `${id} · ${name}` : id };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Shell — header + tabs + cards. Pulled out so the empty-batches path
// can short-circuit without losing the chrome.
// ─────────────────────────────────────────────────────────────────────
type CardData = {
  item:         Item;
  batch:        Batch;
  forwarder:    Forwarder;
  photoOnUrl:   string | null;
  photoOffUrl:  string | null;
  customerName: string;
};

function renderShell(props: {
  tab:              TabKey;
  filterDriver:     string | null;
  isAdminOverride:  boolean;
  myName:           string;
  myUserid:         string | null;
  counters:         { pending: number; loaded: number; done: number };
  driverDirectory:  { userid: string; label: string }[];
  cards:            CardData[];
}) {
  const { tab, filterDriver, isAdminOverride, myName, myUserid, counters, driverDirectory, cards } = props;
  const today = new Date().toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="px-4 py-5 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-widest text-primary-600">DRIVER · งานวันนี้</p>
        <h1 className="text-2xl font-bold leading-tight">
          {isAdminOverride && filterDriver
            ? `งานของ ${filterDriver}`
            : isAdminOverride
              ? "งานคนขับ (ทั้งระบบ)"
              : (myName || "งานของฉัน")}
        </h1>
        <p className="text-sm text-muted">{today}</p>
        {!isAdminOverride && !myUserid && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mt-2">
            ⚠️ ไม่พบ member_code ในบัญชีคุณ — ติดต่อ admin เพื่อจับคู่กับรหัสพนักงาน (tb_users.userid)
          </p>
        )}
      </div>

      {/* Counter chips */}
      <div className="grid grid-cols-3 gap-2">
        <Counter label="รอขึ้นรถ" value={counters.pending} tone="gray" />
        <Counter label="กำลังส่ง"   value={counters.loaded}  tone="blue" />
        <Counter label="เสร็จ"      value={counters.done}    tone="green" />
      </div>

      {/* Driver picker (ops/super only) */}
      {isAdminOverride && driverDirectory.length > 0 && (
        <form method="GET" className="rounded-xl border border-border bg-white p-3 space-y-2">
          <label className="text-xs text-muted block">เลือกคนขับ:</label>
          <select
            name="driver"
            defaultValue={filterDriver ?? ""}
            className="w-full text-base rounded-md border border-border bg-white px-3 py-2.5 min-h-[44px]"
          >
            <option value="">— ทุกคน —</option>
            {driverDirectory.map((d) => (
              <option key={d.userid} value={d.userid}>{d.label}</option>
            ))}
          </select>
          {/* preserve current tab */}
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <button
            type="submit"
            className="w-full rounded-md bg-primary-500 text-white text-base font-semibold px-3 py-2.5 min-h-[44px] hover:bg-primary-600"
          >
            กรองตามคนขับ
          </button>
        </form>
      )}

      {/* Tab strip — mobile-scrollable. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="inline-flex gap-2 min-w-full">
          {(Object.keys(TAB_LABEL) as TabKey[]).map((k) => {
            const params = new URLSearchParams();
            if (k !== "all") params.set("tab", k);
            if (isAdminOverride && filterDriver) params.set("driver", filterDriver);
            const href = `/admin/drivers/work${params.toString() ? `?${params.toString()}` : ""}`;
            const active = k === tab;
            return (
              <Link
                key={k}
                href={href}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm min-h-[40px] inline-flex items-center ${
                  active
                    ? "bg-primary-500 text-white border-primary-500"
                    : "bg-white border-border text-foreground hover:bg-surface-alt"
                }`}
              >
                {TAB_LABEL[k]}
                {k === "pending" && counters.pending > 0 && ` (${counters.pending})`}
                {k === "loaded"  && counters.loaded  > 0 && ` (${counters.loaded})`}
                {k === "done"    && counters.done    > 0 && ` (${counters.done})`}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Card list */}
      {cards.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center">
          <p className="text-sm text-muted">ไม่มีงานในหมวดนี้</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((c) => (
            <li key={c.item.id}>
              <Card
                item={c.item}
                batch={c.batch}
                forwarder={c.forwarder}
                customerName={c.customerName}
                photoOnUrl={c.photoOnUrl}
                photoOffUrl={c.photoOffUrl}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted pt-3">
        Wave 12-B · อ่านจาก legacy <code className="rounded bg-surface-alt px-1">tb_forwarder_driver_item</code> ·
        อัปโหลดรูป ขึ้นรถ / ส่งสำเร็จ พร้อมใช้งาน
      </p>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// One delivery card. Mobile-first — full-width on phone, never wider
// than the 768px container above. Tap targets ≥ 48px. Body ≥ 16px.
//
// Wave 12-B: shows uploaded photos as click-to-zoom thumbnails. The
// thumbnails use a <details>/<summary> "lightbox" — native, no JS state,
// and works inside a Server Component. Clicking the thumbnail expands
// the full image inline; clicking again collapses.
// ─────────────────────────────────────────────────────────────────────
// A delivery row left on the warehouse self-pickup placeholder
// ("รับที่โกดัง Pacred" — the legacy MOMO/commit default) has no real
// recipient/address. The card already leads with the customer (PR + name), so
// show "ยังไม่ระบุที่อยู่" instead of the placeholder + hide the warehouse address.
function isWarehousePlaceholder(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return n === "" || /รับ.*โกดัง|รับเอง|pacred/i.test(n);
}

function Card({
  item,
  batch,
  forwarder,
  customerName,
  photoOnUrl,
  photoOffUrl,
}: {
  item: Item;
  batch: Batch;
  forwarder: Forwarder;
  customerName: string;
  photoOnUrl: string | null;
  photoOffUrl: string | null;
}) {
  const fNo        = forwarder.fidorco ?? `#${forwarder.id}`;
  const pr         = (forwarder.userid ?? "").trim();
  const tracking   = (forwarder.ftrackingchn ?? "").trim();
  const recipient  = `${forwarder.faddressname ?? ""} ${forwarder.faddresslastname ?? ""}`.trim();
  const noRealAddress = isWarehousePlaceholder(forwarder.faddressname);
  const fullAddr   = [
    forwarder.faddressno,
    forwarder.faddresssubdistrict ? `ต.${forwarder.faddresssubdistrict}` : null,
    forwarder.faddressdistrict    ? `อ.${forwarder.faddressdistrict}` : null,
    forwarder.faddressprovince    ? `จ.${forwarder.faddressprovince}` : null,
    forwarder.faddresszipcode,
  ].filter(Boolean).join(" ");
  const phone1     = forwarder.faddresstel  ?? null;
  const phone2     = forwarder.faddresstel2 ?? null;

  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
      {/* Top row: WHOSE parcel (PR + customer name) leads · status badge right.
          The driver identifies the parcel by the customer, not the order #. */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {pr && (
              <span className="font-mono text-base font-bold text-primary-600">{pr}</span>
            )}
            <span className="text-lg font-bold leading-tight">{customerName}</span>
          </div>
          {tracking && (
            <p className="text-base font-mono text-foreground/90 mt-0.5 break-all">
              📦 {tracking}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLS[item.fdistatus] ?? STATUS_CLS[""]}`}>
            {STATUS_LABEL[item.fdistatus] ?? `?${item.fdistatus}?`}
          </span>
          {F_STATUS_LABEL[forwarder.fstatus] && (
            <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-xs text-muted">
              {F_STATUS_LABEL[forwarder.fstatus]}
            </span>
          )}
        </div>
      </div>

      {/* ส่งไม่ได้ — เหตุผลที่คนขับบันทึก (0213 fdinote) */}
      {item.fdistatus === "3" && item.fdinote && (
        <p className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-sm text-rose-800">
          ⚠️ ส่งไม่ได้: {item.fdinote}
        </p>
      )}

      {/* Recipient (the name on the delivery label) + phone */}
      <div className="space-y-1">
        {noRealAddress ? (
          <p className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-sm text-amber-800">
            ⚠️ ยังไม่ระบุที่อยู่จัดส่ง — รับเองที่โกดัง / รอเซล–ลูกค้ากรอก
          </p>
        ) : recipient ? (
          <p className="text-base text-foreground">
            <span className="text-muted">ผู้รับ:</span> {recipient}
          </p>
        ) : null}
        {phone1 && phone1 !== "-" && (
          <a
            href={`tel:${phone1}`}
            className="inline-flex items-center gap-1 text-base text-primary-600 hover:underline min-h-[28px]"
          >
            📞 {phone1}
          </a>
        )}
        {phone2 && phone2 !== "-" && phone2 !== phone1 && (
          <>
            <span className="text-xs text-muted"> · </span>
            <a
              href={`tel:${phone2}`}
              className="inline-flex items-center gap-1 text-base text-primary-600 hover:underline min-h-[28px]"
            >
              📞 {phone2}
            </a>
          </>
        )}
      </div>

      {/* Address — hidden when it's the warehouse self-pickup placeholder */}
      {!noRealAddress && fullAddr && (
        <p className="text-base leading-relaxed text-foreground">
          📍 {fullAddr}
        </p>
      )}

      {/* Meta row: container + weight + price */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm pt-2 border-t border-border/50">
        {forwarder.fcabinetnumber && (
          <>
            <dt className="text-muted">ตู้</dt>
            <dd className="font-mono">{forwarder.fcabinetnumber}</dd>
          </>
        )}
        {forwarder.fweight != null && (
          <>
            <dt className="text-muted">น้ำหนัก</dt>
            <dd className="font-mono">{Number(forwarder.fweight).toFixed(2)} kg</dd>
          </>
        )}
        {forwarder.fvolume != null && (
          <>
            <dt className="text-muted">ปริมาตร</dt>
            <dd className="font-mono">{Number(forwarder.fvolume).toFixed(3)} cbm</dd>
          </>
        )}
        {forwarder.ftotalprice != null && (
          <>
            <dt className="text-muted">รวม (THB)</dt>
            <dd className="font-mono">฿{Number(forwarder.ftotalprice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</dd>
          </>
        )}
      </dl>

      {/* Driver-side note (rare; admins may flag a special instruction) */}
      {forwarder.fnote && (
        <p className="text-sm bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          📝 {forwarder.fnote}
        </p>
      )}

      {/* Batch context + order # (small / secondary — the driver leads with the
          customer above; the order number stays reachable here). */}
      <p className="text-[11px] text-muted">
        <Link href={`/admin/forwarders/${forwarder.id}`} className="font-mono text-primary-600/80 hover:underline">
          {fNo}
        </Link>
        {` · รอบ #${batch.id}`}
        {batch.fdname ? ` · ${batch.fdname}` : ""}
        {batch.fddate ? ` · ${new Date(batch.fddate).toLocaleDateString("th-TH")}` : ""}
      </p>

      {/* Uploaded photos (Wave 12-B) — collapsed lightbox via native <details> */}
      {(photoOnUrl || photoOffUrl) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {photoOnUrl && (
            <PhotoThumb url={photoOnUrl} label="📦 รูปตอนขึ้นรถ" tone="blue" />
          )}
          {photoOffUrl && (
            <PhotoThumb url={photoOffUrl} label="✅ รูปตอนส่ง" tone="green" />
          )}
        </div>
      )}

      {/* Action buttons */}
      <DriverItemActionButtons itemId={item.id} status={item.fdistatus} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PhotoThumb — small clickable chip + thumbnail. Uses native <details>
// so the expand/collapse needs zero client JS (the page is otherwise
// a pure Server Component except for the action buttons).
//
// Closed state = 64×64 thumbnail + label chip (tap target ≥ 44px high).
// Open state   = full-width image up to 600px tall + caption.
// ─────────────────────────────────────────────────────────────────────
function PhotoThumb({
  url, label, tone,
}: { url: string; label: string; tone: "blue" | "green" }) {
  const chipCls =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-green-200 bg-green-50 text-green-700";

  return (
    <details className="group">
      <summary className={`flex items-center gap-2 cursor-pointer list-none rounded-lg border px-2 py-1.5 min-h-[44px] ${chipCls}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="w-10 h-10 object-cover rounded border border-border"
          loading="lazy"
        />
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted ml-auto group-open:hidden">แตะเพื่อขยาย</span>
        <span className="text-xs text-muted ml-auto hidden group-open:inline">ย่อ</span>
      </summary>
      <div className="mt-2 rounded-lg border border-border bg-gray-50 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="w-full h-auto max-h-[600px] object-contain"
          loading="lazy"
        />
        <p className="text-xs text-muted text-center py-1.5 px-2 border-t border-border">{label}</p>
      </div>
    </details>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: "gray" | "blue" | "green" }) {
  const toneClass =
    tone === "blue"  ? "bg-blue-50 text-blue-800 border-blue-200" :
    tone === "green" ? "bg-green-50 text-green-800 border-green-200" :
                       "bg-gray-50 text-gray-800 border-gray-200";
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${toneClass}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}
