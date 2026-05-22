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
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  userid:        string;
  username:      string | null;
  userlastname:  string | null;
  usertel:       string | null;
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
  const isAdminOverride = roles.includes("super") || roles.includes("ops");

  const admin = createAdminClient();

  // Resolve the caller's legacy userid (tb_users.userid) via their
  // profiles.member_code. The driver role uses this for self-filtering;
  // ops/super may override with ?driver=PR####.
  const supabase = await createClient();
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("member_code, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null; first_name: string | null; last_name: string | null }>();
  const myUserid = myProfile?.member_code ?? null;
  const myName   = `${myProfile?.first_name ?? ""} ${myProfile?.last_name ?? ""}`.trim();

  // Decide which driver's queue to render.
  //   driver role  → always own (ignore ?driver= to prevent peeking at peers)
  //   ops/super    → ?driver= if present, else ALL drivers
  const filterDriver = !isAdminOverride
    ? (myUserid ?? null)
    : (sp.driver?.trim() || null);

  // 1. Load matching batches (tb_forwarder_driver). Batch carries the
  //    driver's userid (fdadminid) and the "expired" status; the item
  //    rows beneath carry the individual delivery status.
  let batchQuery = admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdname, fdadminid, fdstatus")
    .order("fddate", { ascending: false })
    .limit(200);
  if (filterDriver) batchQuery = batchQuery.eq("fdadminid", filterDriver);
  const { data: batchRows } = await batchQuery;
  const batches = (batchRows ?? []) as Batch[];
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const batchIds  = batches.map((b) => b.id);

  // Empty state — short-circuit if no batches at all.
  if (batchIds.length === 0) {
    return renderShell({
      tab, filterDriver, isAdminOverride, myName, myUserid,
      counters: { pending: 0, loaded: 0, done: 0 },
      driverDirectory: isAdminOverride ? await loadDriverDirectory(admin) : [],
      cards: [],
    });
  }

  // 2. Load items belonging to those batches.
  const { data: itemRows } = await admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fid, fdistatus, fdipictureon, fdipictureoff")
    .in("fdid", batchIds);
  const items = (itemRows ?? []) as Item[];

  // 3. Load matching forwarders for the address + customer info.
  // Cast via `unknown` because the generated Supabase types model
  // tb_forwarder's column-projection as a generic-error union when the
  // page-level select uses the long comma string (same pattern used in
  // /admin/forwarders/[fNo]/page.tsx · renderLegacyForwarderView).
  const forwarderIds = Array.from(new Set(items.map((i) => i.fid)));
  let forwarders: Forwarder[] = [];
  if (forwarderIds.length > 0) {
    const { data: fRows } = await admin
      .from("tb_forwarder")
      .select(
        "id, fidorco, fstatus, fcabinetnumber, ftotalprice, fweight, fvolume, " +
        "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
        "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2, fnote",
      )
      .in("id", forwarderIds);
    forwarders = (fRows ?? []) as unknown as Forwarder[];
  }
  const forwarderById = new Map(forwarders.map((f) => [f.id, f]));

  // 4. Counter tallies (across ALL fetched items, before tab filter).
  const counters = items.reduce(
    (acc, it) => {
      if (it.fdistatus === "") acc.pending++;
      else if (it.fdistatus === "1") acc.loaded++;
      else if (it.fdistatus === "2" || it.fdistatus === "3") acc.done++;
      return acc;
    },
    { pending: 0, loaded: 0, done: 0 },
  );

  // 5. Filter by tab.
  const tabFiltered = items.filter((it) => {
    if (tab === "all")     return true;
    if (tab === "pending") return it.fdistatus === "";
    if (tab === "loaded")  return it.fdistatus === "1";
    if (tab === "done")    return it.fdistatus === "2" || it.fdistatus === "3";
    return true;
  });

  // 6. Materialise card rows (item + batch + forwarder), most-recent-batch
  //    first.
  const cards = tabFiltered
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
  const { data: batchAdminRows } = await admin
    .from("tb_forwarder_driver")
    .select("fdadminid")
    .order("fddate", { ascending: false })
    .limit(500);
  const adminIds = Array.from(new Set((batchAdminRows ?? []).map((r) => (r as { fdadminid: string }).fdadminid))).filter(Boolean);
  if (adminIds.length === 0) return [];

  const { data: userRows } = await admin
    .from("tb_users")
    .select("userid, username, userlastname, usertel")
    .in("userid", adminIds);
  const users = (userRows ?? []) as DriverUser[];
  const byId  = new Map(users.map((u) => [u.userid, u]));
  return adminIds.map((id) => {
    const u = byId.get(id);
    const name = `${u?.username ?? ""} ${u?.userlastname ?? ""}`.trim();
    return { userid: id, label: name ? `${id} · ${name}` : id };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Shell — header + tabs + cards. Pulled out so the empty-batches path
// can short-circuit without losing the chrome.
// ─────────────────────────────────────────────────────────────────────
function renderShell(props: {
  tab:              TabKey;
  filterDriver:     string | null;
  isAdminOverride:  boolean;
  myName:           string;
  myUserid:         string | null;
  counters:         { pending: number; loaded: number; done: number };
  driverDirectory:  { userid: string; label: string }[];
  cards:            { item: Item; batch: Batch; forwarder: Forwarder }[];
}) {
  const { tab, filterDriver, isAdminOverride, myName, myUserid, counters, driverDirectory, cards } = props;
  const today = new Date().toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="px-4 py-5 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-widest text-primary-500">DRIVER · งานวันนี้</p>
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
              <Card item={c.item} batch={c.batch} forwarder={c.forwarder} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-muted pt-3">
        Wave 10 · อ่านจาก legacy <code className="rounded bg-surface-alt px-1">tb_forwarder_driver_item</code> ·
        อัพโหลดรูปขึ้นรถ / ลงรถ → Wave 11
      </p>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// One delivery card. Mobile-first — full-width on phone, never wider
// than the 768px container above. Tap targets ≥ 48px. Body ≥ 16px.
// ─────────────────────────────────────────────────────────────────────
function Card({ item, batch, forwarder }: { item: Item; batch: Batch; forwarder: Forwarder }) {
  const fNo        = forwarder.fidorco ?? `#${forwarder.id}`;
  const customer   = `${forwarder.faddressname ?? ""} ${forwarder.faddresslastname ?? ""}`.trim() || "—";
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
      {/* Top row: F-no + status badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href={`/admin/forwarders/${encodeURIComponent(fNo)}`}
          className="font-mono text-base font-bold text-primary-600 hover:underline"
        >
          {fNo}
        </Link>
        <div className="flex items-center gap-1.5 flex-wrap">
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

      {/* Customer + phone */}
      <div className="space-y-1">
        <p className="text-base font-semibold">{customer}</p>
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

      {/* Address */}
      {fullAddr && (
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

      {/* Batch context (small text) */}
      <p className="text-[11px] text-muted">
        รอบ #{batch.id}
        {batch.fdname ? ` · ${batch.fdname}` : ""}
        {batch.fddate ? ` · ${new Date(batch.fddate).toLocaleDateString("th-TH")}` : ""}
      </p>

      {/* Action buttons */}
      <DriverItemActionButtons itemId={item.id} status={item.fdistatus} />
    </div>
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
