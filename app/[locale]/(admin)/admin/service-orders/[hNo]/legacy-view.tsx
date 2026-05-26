/**
 * /admin/service-orders/[hNo] — legacy fallback view (Wave 7 fix · 2026-05-21 night).
 *
 * Without this fallback every click from the `/admin` dashboard "shop1/shop2/
 * shop4" tab → `/admin/service-orders/[hNo]` 404'd because the rebuilt
 * `service_orders` table is empty on prod (the real data lives in
 * `tb_header_order` after the D1 pivot · ~ thousands of rows per customer).
 *
 * Same pattern as `forwarders/[fNo]/page.tsx` legacy fallback. Read-only.
 * Wave 8 will layer status-update + bill-to-override on top.
 *
 * Verified prod schema 2026-05-21 via REST:
 *   tb_header_order(id, hno, htitle, hcover, hcount, hdate, hdate*, hstatus,
 *                   htransporttype, htotalpricechn, htotalpriceuser,
 *                   hshippingservice, hshippingchn, hrate, hcostall, hcostallth,
 *                   hnote, hnoteuser, hshipby, hfreeshipping,
 *                   haddressname, haddresslastname, haddressno, haddresssubdistrict,
 *                   haddressdistrict, haddressprovince, haddresszipcode,
 *                   haddressnote, haddresstel, userid, paymethod, crate)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import SpawnForwarderForm from "./spawn-form";
import { buildSpawnRows } from "./spawn-utils";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้าแล้ว",
  "4": "รอร้านจีนจัดส่ง",
  "5": "สำเร็จ",
  "6": "ออเดอร์ที่ยกเลิก",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-orange-100 text-orange-700 border-orange-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "5": "bg-green-100 text-green-700 border-green-200",
  "6": "bg-gray-100 text-gray-600 border-gray-200",
};
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

type HRow = {
  id: number;
  hno: string;
  htitle: string | null;
  hcover: string | null;
  hcount: number | null;
  hdate: string | null;
  hdatepayment: string | null;
  hstatus: string | null;
  htransporttype: string | null;
  htotalpricechn: number | null;
  htotalpriceuser: number | null;
  hshippingservice: number | null;
  hshippingchn: number | null;
  hrate: number | null;
  hcostall: number | null;
  hcostallth: number | null;
  hnote: string | null;
  hnoteuser: string | null;
  hshipby: string | null;
  hfreeshipping: string | null;
  haddressname: string | null;
  haddresslastname: string | null;
  haddressno: string | null;
  haddresssubdistrict: string | null;
  haddressdistrict: string | null;
  haddressprovince: string | null;
  haddresszipcode: string | null;
  haddresstel: string | null;
  haddressnote: string | null;
  userid: string;
  paymethod: string | null;
  crate: string | null;
};
type URow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  useremail: string | null;
};

export async function renderLegacyServiceOrderView(hno: string) {
  const admin = createAdminClient();
  const { data: rowRaw, error: rowRawErr } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,htitle,hcover,hcount,hdate,hdatepayment,hstatus,htransporttype,htotalpricechn,htotalpriceuser,hshippingservice,hshippingchn,hrate,hcostall,hcostallth,hnote,hnoteuser,hshipby,hfreeshipping,haddressname,haddresslastname,haddressno,haddresssubdistrict,haddressdistrict,haddressprovince,haddresszipcode,haddresstel,haddressnote,userid,paymethod,crate",
    )
    .eq("hno", hno)
    .maybeSingle();
  if (rowRawErr) {
    console.error(`[tb_header_order lookup] failed`, { code: rowRawErr.code, message: rowRawErr.message, details: rowRawErr.details, hint: rowRawErr.hint });
    throw new Error(`Failed to load tb_header_order (${rowRawErr.code ?? "unknown"}): ${rowRawErr.message}`);
  }
  if (!rowRaw) return null;
  const r = rowRaw as unknown as HRow;

  const { data: userRaw, error: userRawErr } = await admin
    .from("tb_users")
    .select("userid,username,userlastname,usertel,useremail")
    .eq("userid", r.userid)
    .maybeSingle();
  if (userRawErr) {
    console.error(`[tb_users list] failed`, { code: userRawErr.code, message: userRawErr.message });
  }
  const u = userRaw as unknown as URow | null;

  // Wave 21 P0 · Task #106 — load tb_order line items for the spawn form.
  // Same pattern as the rebuilt-path branch in page.tsx; expansion lives
  // in spawn-utils.buildSpawnRows so server + client share the contract.
  const { data: trackingItems, error: trackingErr } = await admin
    .from("tb_order")
    .select("cnameshop, cshippingnumber, ctrackingnumber")
    .eq("hno", r.hno)
    .limit(200);
  if (trackingErr) {
    console.error(`[tb_order spawn list legacy-view] failed`, {
      code: trackingErr.code, message: trackingErr.message,
    });
  }
  const spawnRows = buildSpawnRows(trackingItems ?? []);

  const customerName = `${u?.username ?? ""} ${u?.userlastname ?? ""}`.trim() || "—";
  const status = r.hstatus ?? "1";
  const transport = r.htransporttype ?? "";
  const addr = [
    r.haddressno,
    r.haddresssubdistrict,
    r.haddressdistrict,
    r.haddressprovince,
    r.haddresszipcode,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="p-6 lg:p-8 max-w-4xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ฝากสั่งซื้อ</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">{r.hno}</h1>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABEL[status] ?? `status ${status}`}
            </span>
            {transport ? (
              <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs">
                {TRANSPORT_LABEL[transport] ?? `mode ${transport}`}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted mt-1">
            Wave 7 read-only · status mutate + items list → Wave 8
          </p>
        </div>
        <Link href="/admin/service-orders" className="text-xs text-primary-600 hover:underline">
          ← รายการฝากสั่ง
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <KV label="ลูกค้า" value={`${customerName} (${r.userid})`} />
        <KV label="โทร · อีเมล" value={`${u?.usertel ?? "-"} · ${u?.useremail ?? "-"}`} />
        <KV label="สินค้า" value={r.htitle ?? "-"} />
        <KV label="จำนวน" value={String(r.hcount ?? 0)} mono />
        <KV
          label="ยอด CNY"
          value={`¥${Number(r.htotalpricechn ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV
          label="ยอด THB"
          value={`฿${Number(r.htotalpriceuser ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV label="เรท" value={String(r.hrate ?? 0)} mono />
        <KV label="วันที่สร้าง" value={r.hdate ? new Date(r.hdate).toLocaleString("th-TH") : "-"} />
        <KV
          label="วันที่ชำระ"
          value={r.hdatepayment ? new Date(r.hdatepayment).toLocaleString("th-TH") : "-"}
        />
        {r.hshipby ? <KV label="ขนส่ง" value={r.hshipby} /> : null}
        {r.hfreeshipping === "1" ? <KV label="ขนส่งฟรี" value="ใช่" /> : null}
        {r.crate === "1" ? <KV label="ตีลังไม้" value="ใช่" /> : null}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <p className="text-xs font-semibold text-muted">ที่อยู่จัดส่ง</p>
        <KV label="ผู้รับ" value={`${r.haddressname ?? ""} ${r.haddresslastname ?? ""}`.trim() || "-"} />
        <KV label="โทร" value={r.haddresstel ?? "-"} />
        <KV label="ที่อยู่" value={addr || "-"} />
        {r.haddressnote ? <KV label="หมายเหตุที่อยู่" value={r.haddressnote} /> : null}
      </div>

      {(r.hnote || r.hnoteuser) && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
          {r.hnote ? <KV label="หมายเหตุแอดมิน" value={r.hnote} /> : null}
          {r.hnoteuser ? <KV label="หมายเหตุลูกค้า" value={r.hnoteuser} /> : null}
        </div>
      )}

      {r.hcover ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <p className="text-xs font-semibold text-muted mb-2">รูปสินค้า</p>
          <a
            href={r.hcover}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.hcover} alt={r.htitle ?? "สินค้า"} className="max-w-full max-h-[480px]" />
          </a>
        </div>
      ) : null}

      {/* Wave 21 P0 · Task #106 — shop→forwarder auto-spawn. Mirrors legacy
          `pcs-admin/include/pages/shops/update/update4.php` L88-116. */}
      <SpawnForwarderForm
        hNo={r.hno}
        rows={spawnRows}
        defaultShipBy={r.hshipby ?? undefined}
        defaultTransportType={r.htransporttype ?? undefined}
      />

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/service-orders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายการ
        </Link>
        <Link
          href={`/admin/customers/${encodeURIComponent(r.userid)}`}
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ดูโปรไฟล์ลูกค้า →
        </Link>
      </div>
    </main>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
