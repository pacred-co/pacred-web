/**
 * /admin/forwarders/[fNo]/edit — admin "แก้ไขขนาด/น้ำหนัก"
 *
 * Wave 12-C ภาค 2 (2026-05-23) — the follow-up edit flow that fills in
 * dimensions AFTER goods arrive at the China warehouse. Wave 12-C v2
 * (commit d2f5db1) explicitly deferred this ("น้ำหนัก/ปริมาตร ใส่ทีหลัง").
 *
 * Per docs/learnings/pacred-design-philosophy.md + AGENTS.md §0a:
 *   - Legacy `pcs-admin/forwarder.php` $_GET['page']=='edit' = workflow source
 *     (column list · UPDATE shape · per-item crate handling)
 *   - Pacred = OUR Tailwind UI · NEVER copy BS4 markup
 *
 * Why a separate /edit sub-route:
 *   - [fNo]/page.tsx is read-only display
 *   - /edit is bookmarkable, auditable, and the action is intentional
 *   - Banner-style entry from detail page ("✏️ แก้ไขขนาด/น้ำหนัก") for admin
 *
 * Resolution: numeric fNo → tb_forwarder.id · else → tb_forwarder.fidorco.
 * Same pattern as renderLegacyForwarderView in the sibling page.tsx.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminForwarderEditForm, type EditItemRow } from "./edit-form";

export const dynamic = "force-dynamic";

type RawForwarderRow = {
  id:                number;
  fidorco:           string | null;
  fstatus:           string;
  ftransporttype:    string;
  fwarehousechina:   string;
  fwarehousename:    string;
  fcabinetnumber:    string | null;
  ftrackingchn:      string | null;
  ftrackingth:       string | null;
  famount:           number | null;
  fdetail:           string | null;
  fcover:            string | null;
  fweight:           number | string | null;
  fwidth:            number | string | null;
  flength:           number | string | null;
  fheight:           number | string | null;
  fvolume:           number | string | null;
  fproductstype:     string | null;
  frefprice:         string | null;
  fnote:             string | null;
  fnoteuser:         string | null;
  fdate:             string | null;
  fdatestatus2:      string | null;
  fdateadminstatus:  string | null;
  userid:            string;
  faddressname:      string | null;
  faddresslastname:  string | null;
  crate:             string | null;
  pricecrate:        number | string | null;
};

type RawItemRow = {
  id:                       number;
  productname:              string;
  producttracking:          string;
  productqty:               number;
  productwidth:             number | string;
  productlength:            number | string;
  productheight:            number | string;
  productweightperitem:     number | string;
  productweightall:         number | string;
  productcbmperitem:        number | string;
  productcbmall:            number | string;
  chinawoodencratefee:      number | string;
  chinawoodencratefeetype:  string;
};

export default async function AdminForwarderEditPage({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  // Role gate — ops + accounting + super can edit dimensions
  // (ops = warehouse staff who weigh and measure · accounting = double-check
  // before billing · super = catch-all). Matches the spec.
  await requireAdmin(["ops", "accounting", "super"]);

  const { fNo } = await params;
  const admin = createAdminClient();

  // ─── Resolve the row (id numeric, else fidorco) ────────────────────
  const asNumber = Number(fNo);
  const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

  let q = admin
    .from("tb_forwarder")
    .select(
      "id, fidorco, fstatus, ftransporttype, fwarehousechina, fwarehousename, " +
      "fcabinetnumber, ftrackingchn, ftrackingth, famount, fdetail, fcover, " +
      "fweight, fwidth, flength, fheight, fvolume, fproductstype, frefprice, " +
      "fnote, fnoteuser, fdate, fdatestatus2, fdateadminstatus, userid, " +
      "faddressname, faddresslastname, crate, pricecrate",
    )
    .limit(1);
  q = isId ? q.eq("id", asNumber) : q.eq("fidorco", fNo);
  const { data: row } = await q.maybeSingle();
  if (!row) notFound();
  const r = row as unknown as RawForwarderRow;

  // ─── Look up customer name (legacy text id, no FK auto-join) ───────
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userid, username, userlastname, usertel")
    .eq("userid", r.userid)
    .maybeSingle();
  if (userRowErr) {
    console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const u = userRow as unknown as {
    userid: string;
    username: string | null;
    userlastname: string | null;
    usertel: string | null;
  } | null;

  // ─── Load tb_forwarder_item rows for crate per-item entry ──────────
  const { data: itemRowsRaw, error: itemRowsRawErr } = await admin
    .from("tb_forwarder_item")
    .select(
      "id, productname, producttracking, productqty, productwidth, productlength, " +
      "productheight, productweightperitem, productweightall, productcbmperitem, " +
      "productcbmall, chinawoodencratefee, chinawoodencratefeetype",
    )
    .eq("fid", r.id)
    .order("id", { ascending: true })
    .limit(200);
  if (itemRowsRawErr) {
    console.error(`[tb_forwarder_item list] failed`, { code: itemRowsRawErr.code, message: itemRowsRawErr.message });
  }

  const items: EditItemRow[] = ((itemRowsRaw ?? []) as unknown as RawItemRow[]).map((it) => ({
    itemId:           it.id,
    name:             it.productname,
    tracking:         it.producttracking,
    qty:              Number(it.productqty),
    weightPerItem:    Number(it.productweightperitem),
    weightAll:        Number(it.productweightall),
    cbmPerItem:       Number(it.productcbmperitem),
    cbmAll:           Number(it.productcbmall),
    crateFee:         Number(it.chinawoodencratefee),
    crateType:        (it.chinawoodencratefeetype === "2" ? "2" : "1") as "1" | "2",
  }));

  // Status / mode labels for the read-only context strip at the top.
  const STATUS_LABEL: Record<string, string> = {
    "1": "รอเข้าโกดังจีน", "2": "ถึงโกดังจีนแล้ว", "3": "กำลังส่งมาไทย",
    "4": "ถึงไทยแล้ว", "5": "รอชำระเงิน", "6": "เตรียมส่ง", "7": "ส่งแล้ว",
    "99": "พิเศษ",
  };
  const MODE_LABEL: Record<string, string> = { "1": "🚛 รถ", "2": "🚢 เรือ", "3": "✈️ เครื่องบิน" };
  const WAREHOUSE_LABEL: Record<string, string> = {
    "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
    "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
  };

  const customerName = `${u?.username ?? ""} ${u?.userlastname ?? ""}`.trim() || r.userid;
  const slugForLink = r.fidorco ?? String(r.id);

  return (
    <main className="p-4 lg:p-8 max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <Link href={`/admin/forwarders/${slugForLink}`} className="hover:text-primary-600 font-mono">
          {r.fidorco ?? `#${r.id}`}
        </Link>
        <span>›</span>
        <span className="text-foreground font-medium">แก้ไขขนาด/น้ำหนัก</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · ฝากนำเข้า · แก้ไขขนาด/น้ำหนัก
        </p>
        <h1 className="mt-1 text-2xl font-bold font-mono">{r.fidorco ?? `#${r.id}`}</h1>
        <p className="mt-1.5 text-sm text-muted">
          ใส่ขนาด · น้ำหนัก · CBM · ประเภทสินค้า หลังสินค้าเข้าโกดังจีน
        </p>
      </header>

      {/* Wave banner — per design-philosophy §6 (banner deferred sub-features
          + give ภูม a clear status). */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 leading-relaxed">
        <strong>✅ Wave 12-C ภาค 2 — ใหม่:</strong>{" "}
        ฟอร์มแก้ไขขนาด/น้ำหนัก ตามขั้น legacy <code className="rounded bg-emerald-100 px-1">$_GET[&apos;page&apos;]==&apos;edit&apos;</code>
        (อัปเดต <code className="rounded bg-emerald-100 px-1">fweight · fwidth · flength · fheight · fvolume · fproductstype · frefprice · fnote</code>
        + per-item <code className="rounded bg-emerald-100 px-1">chinawoodencratefee*</code>).
        CBM คำนวณอัตโนมัติจากสูตร legacy: (W × L × H) ÷ 1,000,000.
      </div>

      {/* Read-only context strip — let admin see what they're editing */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm grid gap-2 grid-cols-1 sm:grid-cols-2 text-sm">
        <ReadRow label="สถานะปัจจุบัน" value={STATUS_LABEL[r.fstatus] ?? r.fstatus} />
        <ReadRow label="ลูกค้า" value={`${customerName} (${r.userid})`} />
        <ReadRow label="โกดังจีน" value={WAREHOUSE_LABEL[r.fwarehousename] ?? r.fwarehousename} />
        <ReadRow label="ขนส่ง" value={MODE_LABEL[r.ftransporttype] ?? r.ftransporttype} />
        <ReadRow label="Tracking CN" value={r.ftrackingchn || "—"} mono />
        <ReadRow label="หมายเลขตู้" value={r.fcabinetnumber || "—"} mono />
        <ReadRow label="กล่อง" value={`${r.famount ?? 0}`} mono />
        <ReadRow
          label="เข้าโกดังจีน"
          value={r.fdatestatus2 ? new Date(r.fdatestatus2).toLocaleString("th-TH") : "—"}
        />
      </section>

      {/* Form */}
      <AdminForwarderEditForm
        fNo={r.fidorco ?? String(r.id)}
        idNumeric={r.id}
        weightInit={Number(r.fweight ?? 0)}
        widthInit={Number(r.fwidth ?? 0)}
        lengthInit={Number(r.flength ?? 0)}
        heightInit={Number(r.fheight ?? 0)}
        volumeInit={Number(r.fvolume ?? 0)}
        productTypeInit={(r.fproductstype === "1" || r.fproductstype === "2" ||
                          r.fproductstype === "3" || r.fproductstype === "4")
                           ? (r.fproductstype as "1" | "2" | "3" | "4")
                           : "1"}
        refPriceInit={(r.frefprice === "2" ? "2" : "1") as "1" | "2"}
        noteInit={r.fnote ?? ""}
        itemsInit={items}
      />

      {/* Footer */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href={`/admin/forwarders/${slugForLink}`}
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับหน้ารายละเอียด
        </Link>
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากนำเข้า
        </Link>
      </div>
    </main>
  );
}

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
