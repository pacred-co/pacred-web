/**
 * /admin/barcode/gateway
 *
 * Faithful port of legacy `member/pcs-admin/gateway.php` (213L) — the
 * "routing brain" that scanner / mobile pages POST into after a barcode
 * read. Receives `?type=&device=&tracking=` and either:
 *   - redirects to /admin/forwarders/<id> (1 match) — the equivalent of
 *     legacy `forwarder/update/<ID>`
 *   - renders a "ไม่พบรายการ" 2-second auto-redirect back to the scanner
 *   - renders a short ambiguity-list when >1 rows share the tracking
 *
 * Query params (verbatim from legacy gateway.php):
 *   type   = "all" | "4" | "6" | "from"   (the workflow stage)
 *           all  — generic search → forwarder detail with ?barcodeF=<t>
 *           4    — เข้าโกดัง        → forwarder detail with ?barcode=<t>&action=save#form4
 *           6    — เตรียมส่ง        → forwarder detail with #form6 (status guard happens in detail page)
 *           from — ปริ้น           → legacy went to /printAll/?print=1&id[]=<id>;
 *                                     no /admin/printAll yet, fall back to forwarder detail
 *   device = "scanner" | "mobile"          (controls fallback URL on 0 matches)
 *   tracking = the scanned tracking string (matched against fTrackingCHN)
 *
 * Phase B (D1, ADR-0017): the legacy logic-loop is preserved exactly —
 * SweetAlert prompts in case "6" are deferred to a follow-up wave; this
 * page does the routing without the prompt (status-aware redirect goes
 * to the detail page anyway, and the detail page already shows status).
 */
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type GatewayType = "all" | "4" | "6" | "from";
type Device = "scanner" | "mobile";

type SearchParams = {
  type?: string;
  device?: string;
  tracking?: string;
};

type ForwarderRow = {
  id: number;
  fdate: string | null;
  famount: number | null;
  fstatus: string | null;
};

// Map (type, device) → the scanner URL we bounce back to on 0 matches.
// Legacy used barcode-{c|d}-{all|import|prepare|from}; new URLs follow
// /admin/barcode/{cargo|driver}/{all|from|import|prepare}.
function fallbackScannerUrl(type: GatewayType, device: Device): string {
  const group = device === "scanner" ? "driver" : "cargo";
  const tab: Record<GatewayType, "all" | "from" | "import" | "prepare"> = {
    all:    "all",
    "4":    "import",
    "6":    "prepare",
    from:   "from",
  };
  return `/admin/barcode/${group}/${tab[type]}`;
}

// Map (type, tracking) → the detail-page URL on a unique hit.
// Legacy `forwarder/update/<ID>` becomes `/admin/forwarders/<ID>` here.
function detailUrlFor(type: GatewayType, id: number, tracking: string): string {
  const enc = encodeURIComponent(tracking);
  switch (type) {
    case "all":
      return `/admin/forwarders/${id}?barcodeF=${enc}`;
    case "4":
      return `/admin/forwarders/${id}?barcode=${enc}&action=save#form4`;
    case "6":
      // Legacy popped a SweetAlert that branched to /forwarder/update/<ID>
      // or back to scanner; we send straight to the detail anchored at #form6.
      return `/admin/forwarders/${id}#form6`;
    case "from":
      // Legacy went to /printAll/?print=1&id[]=<ID>. /admin/printAll isn't
      // ported yet — drop a Wave-3 TODO and route to the detail with the
      // tracking marker so a human can hit "พิมพ์" from the detail page.
      return `/admin/forwarders/${id}?barcodeF=${enc}&print=1`;
  }
}

function NotFoundPanel({ tracking, fallbackHref }: { tracking: string; fallbackHref: string }) {
  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto">
      <meta httpEquiv="refresh" content={`2;url=${fallbackHref}`} />
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-2xl font-bold text-red-700">ไม่พบรายการ</h2>
        <p className="mt-2 text-sm text-red-700">
          Tracking:&nbsp;<span className="font-mono">{tracking}</span>
        </p>
        <p className="mt-4 text-xs text-muted">
          กำลังพากลับไปหน้าสแกนใน 2 วินาที…
        </p>
        <Link
          href={fallbackHref}
          className="inline-block mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          กลับไปสแกน
        </Link>
      </div>
    </main>
  );
}

function AmbiguityList({
  tracking,
  rows,
  type,
  fallbackHref,
}: {
  tracking: string;
  rows: ForwarderRow[];
  type: GatewayType;
  fallbackHref: string;
}) {
  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-xl font-bold text-amber-800">
          พบรายการที่มีเลข Tracking : <span className="font-mono">{tracking}</span> เหมือนกันมากกว่า 1 รายการ
        </h2>
        <p className="mt-2 text-sm text-amber-800">กรุณาเลือกรายการที่ต้องการ</p>
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border border-amber-200 bg-white p-3">
              <p className="text-xs text-muted">
                วันที่สร้าง : {row.fdate ?? "-"} จำนวนกล่อง {row.famount ?? "-"}
              </p>
              <Link
                href={detailUrlFor(type, row.id, tracking)}
                className="text-primary-600 font-semibold hover:underline"
              >
                รายการฝากนำเข้าเลขที่ #{row.id}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={fallbackHref}
          className="inline-block mt-4 rounded-md border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
        >
          กลับไปสแกนใหม่
        </Link>
      </div>
    </main>
  );
}

function ParamsErrorPanel() {
  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="rounded-2xl border border-border bg-white p-6 text-center">
        <h2 className="text-xl font-bold">พารามิเตอร์ไม่ถูกต้อง</h2>
        <p className="mt-2 text-sm text-muted">
          ต้องระบุ <code>?type=</code>, <code>device=</code>, และ <code>tracking=</code>
        </p>
        <Link
          href="/admin/barcode"
          className="inline-block mt-4 rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-alt"
        >
          กลับไปหน้าสแกน
        </Link>
      </div>
    </main>
  );
}

export default async function BarcodeGatewayPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Gate per the role brief: warehouse + driver staff scan, ops + super
  // run the routing during audits.
  await requireAdmin(["super", "ops", "warehouse", "driver"]);

  const sp = await searchParams;
  const typeRaw = (sp.type ?? "").trim();
  const deviceRaw = (sp.device ?? "").trim();
  const tracking = (sp.tracking ?? "").trim();

  const validTypes: GatewayType[] = ["all", "4", "6", "from"];
  const validDevices: Device[] = ["scanner", "mobile"];

  if (
    !tracking ||
    !validTypes.includes(typeRaw as GatewayType) ||
    !validDevices.includes(deviceRaw as Device)
  ) {
    return <ParamsErrorPanel />;
  }

  const type = typeRaw as GatewayType;
  const device = deviceRaw as Device;
  const fallbackHref = fallbackScannerUrl(type, device);

  const admin = createAdminClient();

  // Legacy SQL — tracking is the unique-ish scanned key; in `case "6"` the
  // legacy also LEFT JOINed tb_forwarder_driver_item / tb_forwarder_driver
  // to surface fdAdminID for the SweetAlert prompt. We skip the join here
  // because the detail-page anchor (#form6) already shows the same info
  // server-side and the prompt is deferred — see Wave-3 TODO above.
  const { data, error } = await admin
    .from("tb_forwarder")
    .select("id, fdate, famount, fstatus")
    .eq("ftrackingchn", tracking)
    .limit(50);

  if (error) {
    return (
      <main className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-xl font-bold text-red-700">เกิดข้อผิดพลาด</h2>
          <p className="mt-2 text-sm text-red-700">{error.message}</p>
          <Link
            href={fallbackHref}
            className="inline-block mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            กลับไปสแกน
          </Link>
        </div>
      </main>
    );
  }

  const rows = (data ?? []) as ForwarderRow[];

  if (rows.length === 0) {
    return <NotFoundPanel tracking={tracking} fallbackHref={fallbackHref} />;
  }

  if (rows.length === 1) {
    redirect(detailUrlFor(type, rows[0].id, tracking));
  }

  return <AmbiguityList tracking={tracking} rows={rows} type={type} fallbackHref={fallbackHref} />;
}
