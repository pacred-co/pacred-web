/**
 * Admin > "สร้างใบเสร็จรายการฝากนำเข้า (Manual Override)" — CREATE RECEIPT page
 *
 * ── HISTORY ───────────────────────────────────────────────────────
 * Wave 28 F3 (2026-05-29) — built as "สร้างใบแจ้งหนี้" (invoice).
 * Wave 29 P0 #206+#208 (2026-05-30) — pivoted to "สร้างใบเสร็จ" (receipt)
 *   per `docs/research/legacy-accounting-billing-workflow.md`. The legacy
 *   PCS Cargo flow never actually wired ใบแจ้งหนี้ — the real revenue path
 *   is a 2-click receipt issue. This page is now the MANUAL OVERRIDE for
 *   the auto-receipt hook in `lib/admin/auto-issue-receipt.ts` (which
 *   fires when admin approves a slip in /admin/wallet).
 *
 * Legacy reference: `pcs-admin/include/pages/hs-forwarder-invoice/add.php`.
 *
 * Server component loads all `fstatus='5'` rows (= eligible — billing was
 * already triggered by /admin/forwarder-check's `adminCallPriceUser`),
 * joins tb_users for customer display, and hands the list to the client
 * form. Filterable by member_code (userid) + optional date window. The
 * actual multi-row selection + "สร้างใบเสร็จ" submit is handled in
 * `add-form.tsx` — multi-checkbox now (one receipt covers N fids per
 * legacy `grenrateReceiptF` model + `add.php` DataTables-Checkboxes).
 *
 * URL parameter: `?mode=manual` (default · only mode supported). Mode is
 * surfaced to the user via a banner in the client form so they know
 * they're in the override flow.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";
import AddInvoiceForm, { type CandidateRow } from "./add-form";

export const dynamic = "force-dynamic";

type SearchParams = {
  userid?: string;
  date_from?: string;
  date_to?: string;
  /** Reserved for future modes — currently only "manual" supported. */
  mode?: string;
};

type RawForwarderRow = {
  id: number;
  userid: string;
  fdate: string | null;
  fstatus: string;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  famount: number | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  // For calcForwarderOutstanding
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  fusercompany: number | string | null;
};

type RawUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
};

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function AddForwarderInvoicePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles issue receipts
  // (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);
  const sp = await searchParams;

  const admin = createAdminClient();

  // ── Load candidate tb_forwarder rows (fstatus='5') ───────
  let q = admin
    .from("tb_forwarder")
    .select(
      "id, userid, fdate, fstatus, ftrackingchn, fcabinetnumber, famount, fweight, fvolume, " +
        "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
        "pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
    )
    .eq("fstatus", "5")
    .order("fdate", { ascending: false, nullsFirst: false })
    .limit(500);

  if (sp.userid && sp.userid.trim()) {
    q = q.ilike("userid", `%${sp.userid.trim()}%`);
  }
  if (sp.date_from) {
    q = q.gte("fdate", sp.date_from);
  }
  if (sp.date_to) {
    q = q.lte("fdate", `${sp.date_to}T23:59:59`);
  }

  const { data: forwarderRows, error: fwErr } = await q;
  if (fwErr) {
    console.error(`[tb_forwarder list] failed`, { code: fwErr.code, message: fwErr.message });
    throw new Error(`Failed to load forwarder candidates: ${fwErr.message}`);
  }
  const forwarders = (forwarderRows ?? []) as unknown as RawForwarderRow[];

  // ── Exclude rows already invoiced (have a tb_receipt_item row) ─
  const allFids = forwarders.map((r) => r.id);
  const alreadyInvoiced = new Set<number>();
  if (allFids.length > 0) {
    const { data: existing, error: exErr } = await admin
      .from("tb_receipt_item")
      .select("fid")
      .in("fid", allFids);
    if (exErr) {
      console.error(`[tb_receipt_item check] failed`, { code: exErr.code, message: exErr.message });
    }
    for (const it of (existing ?? []) as unknown as Array<{ fid: number }>) {
      alreadyInvoiced.add(it.fid);
    }
  }
  const eligible = forwarders.filter((r) => !alreadyInvoiced.has(r.id));

  // ── Join tb_users ────────────────────────────────────────
  const uniqueUserIds = Array.from(new Set(eligible.map((r) => r.userid).filter(Boolean)));
  let usersById = new Map<string, RawUser>();
  if (uniqueUserIds.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, userEmail")
      .in("userID", uniqueUserIds);
    if (userErr) {
      console.error(`[tb_users list] failed`, { code: userErr.code, message: userErr.message });
    }
    usersById = new Map<string, RawUser>(
      ((userRows ?? []) as unknown as RawUser[]).map((u) => [u.userID, u]),
    );
  }

  // ── Company-name map (batched · N+1-free) — juristic customers show the
  //    COMPANY name, not the contact person, in this receipt picker. ─────────
  const corpNames = await fetchCorporateNameMap(admin, uniqueUserIds);

  // ── Materialise candidate rows ───────────────────────────
  const candidates: CandidateRow[] = eligible.map((r) => {
    const u = usersById.get(r.userid);
    const outstanding = calcForwarderOutstanding(r);
    const identity = resolveBillingIdentity({
      userCompany: r.fusercompany != null ? String(r.fusercompany) : null,
      userName: u?.userName ?? null,
      userLastName: u?.userLastName ?? null,
      corp: corpRowFromName(corpNames.get(r.userid)),
    });
    const name = identity.name || r.userid;
    return {
      id:              r.id,
      userid:          r.userid,
      customer:        name,
      fdate:           r.fdate,
      tracking:        r.ftrackingchn,
      cabinetNumber:   r.fcabinetnumber,
      amount:          r.famount ?? 0,
      weight:          toNumber(r.fweight),
      volume:          toNumber(r.fvolume),
      totalPrice:      toNumber(r.ftotalprice),
      transportPrice:  toNumber(r.ftransportprice),
      shippingService: toNumber(r.fshippingservice),
      discount:        toNumber(r.fdiscount),
      outstanding,
    };
  });

  // Default issue date = today
  const issueDateDefault = new Date().toISOString().slice(0, 10);
  // Default due date = today + 7 days
  const dueDateDefault = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className=" px-4 py-6">
        {/* Breadcrumb — 2026-05-30 ภูม flagged #7: was "ใบแจ้งหนี้ ฝากนำเข้า"
            but this page issues ใบเสร็จ (Wave 29 pivot · tb_receipt-backed). */}
        <nav className="text-sm text-slate-500 mb-3">
          <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting/forwarder-invoice" className="hover:text-indigo-700">
            ใบเสร็จ ฝากนำเข้า
          </Link>
          <span className="mx-1">/</span>
          <span className="text-slate-700">สร้างใบเสร็จใหม่ (Manual Override)</span>
        </nav>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              สร้างใบเสร็จรายการฝากนำเข้า
              <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 align-middle">
                Manual Override
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              ระบบจะออกใบเสร็จอัตโนมัติเมื่ออนุมัติสลิป — หน้านี้สำหรับเคส auto fail หรือ batch หลายออเดอร์
            </p>
          </div>
          <Link
            href="/admin/accounting/forwarder-invoice"
            className="text-sm text-slate-600 hover:text-indigo-700"
          >
            ← กลับไปรายการ
          </Link>
        </div>

        {/* Search bar — server-side filter via GET form */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 mb-4">
          <form method="GET" action="/admin/accounting/forwarder-invoice/add" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-slate-600">
              <span>รหัสสมาชิก</span>
              <input
                type="text"
                name="userid"
                defaultValue={sp.userid ?? ""}
                placeholder="PR10899"
                className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm w-56"
              />
            </label>
            <label className="flex flex-col text-xs text-slate-600">
              <span>ตั้งแต่</span>
              <input
                type="date"
                name="date_from"
                defaultValue={sp.date_from ?? ""}
                className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs text-slate-600">
              <span>ถึง</span>
              <input
                type="date"
                name="date_to"
                defaultValue={sp.date_to ?? ""}
                className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
              />
            </label>
            <button
              type="submit"
              className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-800"
            >
              ค้นหา
            </button>
            {(sp.userid || sp.date_from || sp.date_to) && (
              <Link
                href="/admin/accounting/forwarder-invoice/add"
                className="px-3 py-1.5 rounded border border-slate-300 text-sm hover:bg-slate-50 text-slate-600"
              >
                ล้าง
              </Link>
            )}
          </form>
          <p className="mt-3 text-xs text-slate-500">
            แสดงเฉพาะรายการที่สถานะ <span className="font-medium text-amber-700">รอชำระเงิน (fstatus=5)</span> และยังไม่ได้ออกใบเสร็จ
            · เลือก ≥ 1 รายการจากลูกค้ารายเดียวกันเพื่อสร้างใบเสร็จใหม่
            {candidates.length === 500 && " · แสดง 500 รายการแรกเท่านั้น — กรุณาใช้ตัวกรอง"}
          </p>
        </div>

        {/* Client form — multi-row selection + dates + notes + submit */}
        <AddInvoiceForm
          candidates={candidates}
          issueDateDefault={issueDateDefault}
          dueDateDefault={dueDateDefault}
        />
      </div>
    </div>
  );
}
