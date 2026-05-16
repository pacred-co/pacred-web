import { notFound } from "next/navigation";
import { getForwarderByNo } from "@/actions/forwarder";
import { getMyTaxInvoiceForOrder } from "@/actions/tax-invoices";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { TaxInvoiceRequestPanel } from "@/components/tax-invoice-request-panel";
import { CONTACT, ADDRESSES } from "@/components/seo/site";

/**
 * Print-ready receipt view. No NavBar/sidebar/footer — just the body.
 * Customer (or admin) opens this and hits Ctrl+P to save as PDF.
 * Phase H ships this as HTML; later we can swap to @react-pdf/renderer
 * for a true PDF endpoint.
 */
export default async function ForwarderReceiptPage({ params }: { params: Promise<{ fNo: string }> }) {
  const { fNo } = await params;
  const res = await getForwarderByNo(fNo);
  if (!res.ok || !res.data) notFound();
  const f = res.data;

  // T-P4 G2b: existing tax invoice (if any) + buyer-info pre-population
  // from the customer's profile + corporate row. RLS scopes both.
  const taxInv = await getMyTaxInvoiceForOrder("forwarder", fNo);
  const existingInvoice = taxInv.ok ? taxInv.data : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let companyName    = "";
  let companyAddress = "";
  let buyerTaxId     = "";
  let buyerName      = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, account_type, company_name, tax_id")
      .eq("id", user.id)
      .maybeSingle<{
        first_name: string | null;
        last_name:  string | null;
        account_type: "personal" | "juristic" | null;
        company_name: string | null;
        tax_id:       string | null;
      }>();
    buyerName = profile?.company_name
      ?? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    buyerTaxId = profile?.tax_id ?? "";
    companyName = profile?.company_name ?? "";

    if (profile?.account_type === "juristic") {
      const { data: corp } = await supabase
        .from("corporate")
        .select("company_name, tax_id, company_address")
        .eq("profile_id", user.id)
        .maybeSingle<{
          company_name:    string | null;
          tax_id:          string | null;
          company_address: string | null;
        }>();
      if (corp) {
        if (corp.company_name)    { buyerName = corp.company_name; companyName = corp.company_name; }
        if (corp.tax_id)          buyerTaxId = corp.tax_id;
        if (corp.company_address) companyAddress = corp.company_address;
      }
    }
  }
  void companyName; // referenced in case of future juristic-only branch
  const isEligible = buyerTaxId.replace(/\D/g, "").length === 13;
  const isPaid     = f.status === "delivered";

  // U2-4: post-delivery cost adjustments (D/O fee · gateway · weight rebill).
  // RLS scopes to profile_id automatically — customer sees only their own.
  type CostAdjRow = {
    id:         string;
    kind:       string;
    amount_thb: number;
    note:       string | null;
    status:     string;
    created_at: string;
    paid_at:    string | null;
  };
  const { data: costAdjRaw } = await supabase
    .from("forwarder_cost_adjustments")
    .select("id, kind, amount_thb, note, status, created_at, paid_at")
    .eq("forwarder_id", f.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .returns<CostAdjRow[]>();

  // V-A6: WHT info banner (juristic customer who withholds tax — see ADR-0015).
  // RLS allows the customer to read OWN withholding_tax_entries row.
  const { data: whtRow } = await supabase
    .from("withholding_tax_entries")
    .select("cert_status, wht_rate_pct, wht_amount_thb, net_expected_thb, gross_invoice_thb")
    .eq("forwarder_f_no", f.f_no ?? fNo)
    .maybeSingle<{
      cert_status:        "pending" | "received" | "waived";
      wht_rate_pct:       number;
      wht_amount_thb:     number;
      net_expected_thb:   number;
      gross_invoice_thb:  number;
    }>();
  const costAdjustments = costAdjRaw ?? [];
  const totalUnpaidExtra = costAdjustments
    .filter((r) => r.status === "unpaid")
    .reduce((sum, r) => sum + Number(r.amount_thb), 0);
  const COST_ADJ_LABEL: Record<string, string> = {
    do_fee:        "ค่า D/O",
    gateway_fee:   "ค่า gateway",
    weight_rebill: "ค่าน้ำหนักเพิ่ม",
    customs_extra: "ค่าศุลกากรเพิ่ม",
    other:         "อื่นๆ",
  };

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Print-only styles + auto-print on load (optional) */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { padding: 0; margin: 0; }
        }
        @page { size: A4; margin: 1.5cm; }
      `}</style>

      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <a
          href={`/api/pdf/forwarder/${f.f_no}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow"
        >
          ดาวน์โหลด PDF
        </a>
        <PrintButton />
      </div>

      <main className="mx-auto max-w-[800px] p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <h1 className="text-3xl font-black text-primary-700">Pacred</h1>
            <p className="text-xs">{ADDRESSES.office.full}</p>
            <p className="text-xs">โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.email}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold">ใบแจ้งหนี้ฝากนำเข้า</h2>
            <p className="font-mono text-lg">{f.f_no}</p>
            <p className="text-xs text-gray-600">วันที่: {new Date(f.created_at).toLocaleDateString("th-TH")}</p>
          </div>
        </div>

        {/* Customer — V-C2: bill_to_name_override wins over default ship-to name */}
        <section>
          <h3 className="font-bold mb-2 text-sm">ผู้รับ:</h3>
          <p className="text-sm">
            {f.bill_to_name_override?.trim() || `${f.ship_first_name ?? ""} ${f.ship_last_name ?? ""}`.trim() || "—"}
          </p>
          <p className="text-xs">📞 {f.ship_phone}{f.ship_phone2 ? ` / ${f.ship_phone2}` : ""}</p>
          <p className="text-xs">
            {f.ship_address_line} ต.{f.ship_sub_district} อ.{f.ship_district} จ.{f.ship_province} {f.ship_postal_code}
          </p>
        </section>

        {/* Shipment table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">รายการ</th>
              <th className="border border-gray-300 px-3 py-2 text-right">จำนวน</th>
              <th className="border border-gray-300 px-3 py-2 text-right">หน่วย</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-3 py-2">
                ฝากนำเข้าจาก {f.source_warehouse === "yiwu" ? "อี้อู" : "กวางโจว"} — {f.transport_type === "truck" ? "ทางรถ" : f.transport_type === "ship" ? "ทางเรือ" : "ทางอากาศ"}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right">{f.box_count} กล่อง</td>
              <td className="border border-gray-300 px-3 py-2 text-right">
                {Number(f.weight_kg).toFixed(2)} kg / {Number(f.volume_cbm).toFixed(3)} cbm
              </td>
            </tr>
            {f.items.map((it) => (
              <tr key={it.id}>
                <td className="border border-gray-300 px-3 py-2">{it.product_name}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">× {it.product_qty}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">
                  {it.weight_per_item_kg ? `${Number(it.weight_per_item_kg).toFixed(2)} kg/box` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Price breakdown */}
        <section className="border-t-2 border-black pt-3">
          <table className="w-full text-sm">
            <tbody>
              <Row label="ค่าขนส่ง (subtotal)"   value={Number(f.transport_price)} />
              <Row label="ค่าบริการ Pacred"       value={Number(f.service_fee)} />
              {f.crate                  && <Row label="ค่าตีลังไม้" value={Number(f.crate_price)} />}
              {f.qc                     && <Row label="ค่า QC"      value={Number(f.qc_price)} />}
              {f.domestic_china_thb > 0 && <Row label="ค่าขนส่งในจีน" value={Number(f.domestic_china_thb)} />}
              {f.thailand_delivery_thb > 0 && <Row label="ค่าขนส่งในไทย" value={Number(f.thailand_delivery_thb)} />}
              {f.other_price > 0        && <Row label="ค่าอื่นๆ"   value={Number(f.other_price)} />}
              <tr className="border-t-2 border-black font-bold text-base">
                <td className="py-2">ยอดรวมทั้งสิ้น</td>
                <td className="text-right font-mono">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
              {whtRow && (
                <>
                  <tr className="text-sm">
                    <td className="py-1 text-amber-700">
                      หัก ภาษี ณ ที่จ่าย {Number(whtRow.wht_rate_pct)}%
                    </td>
                    <td className="text-right font-mono text-amber-700">
                      −฿{Number(whtRow.wht_amount_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-t border-black font-bold text-base">
                    <td className="py-1">ลูกค้าโอนสุทธิ (Net)</td>
                    <td className="text-right font-mono text-primary-700">
                      ฿{Number(whtRow.net_expected_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </section>

        {/* V-A6: WHT info banner — juristic customer who withholds tax.
            Visible on screen + print. Tells the customer THIS is the amount to
            transfer, and reminds them to send the 50 ทวิ cert. */}
        {whtRow && (
          <section className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-2 text-sm">
            <h3 className="font-bold text-amber-900">📋 สำหรับลูกค้านิติบุคคล (มีหัก ณ ที่จ่าย)</h3>
            <p className="text-amber-900">
              ยอดในใบเสร็จ (Gross) ฿{Number(whtRow.gross_invoice_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              {" — "}
              หัก ณ ที่จ่าย {Number(whtRow.wht_rate_pct)}% (฿{Number(whtRow.wht_amount_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}){" — "}
              <strong>โอนสุทธิ ฿{Number(whtRow.net_expected_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong>
            </p>
            {whtRow.cert_status === "pending" && (
              <p className="text-xs text-amber-800">
                ⚠️ กรุณาส่งหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ให้ Pacred — มิเช่นนั้นจะออกใบกำกับภาษีให้ไม่ได้
              </p>
            )}
            {whtRow.cert_status === "received" && (
              <p className="text-xs text-green-700">✅ ได้รับใบ 50 ทวิ ครบแล้ว — สามารถออกใบกำกับภาษีได้</p>
            )}
            {whtRow.cert_status === "waived" && (
              <p className="text-xs text-gray-700">ℹ️ ใบ 50 ทวิ ได้รับการยกเว้น (Pacred รับเป็นค่าใช้จ่าย)</p>
            )}
          </section>
        )}

        {/* U2-4: post-delivery cost adjustments (hidden on print — admin-issued) */}
        {costAdjustments.length > 0 && (
          <section className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-sm">ค่าใช้จ่ายเพิ่มเติม</h3>
              {totalUnpaidExtra > 0 && (
                <span className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  ค้างชำระ ฿{totalUnpaidExtra.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <ul className="text-xs space-y-1">
              {costAdjustments.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 border-b border-amber-200 pb-1 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium">{COST_ADJ_LABEL[r.kind] ?? r.kind}</p>
                    {r.note && <p className="text-amber-900/70 text-[10px]">📝 {r.note}</p>}
                    <p className="text-[10px] text-amber-900/60">
                      {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      {r.paid_at && (
                        <> · ชำระเมื่อ {new Date(r.paid_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-medium">
                      ฿{Number(r.amount_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-block mt-0.5 rounded-full border px-2 py-0.5 text-[10px] ${
                      r.status === "paid"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-amber-100 text-amber-800 border-amber-300"
                    }`}>
                      {r.status === "paid" ? "ชำระแล้ว" : "รอชำระ"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {totalUnpaidExtra > 0 && (
              <p className="text-[11px] text-amber-800 pt-1 border-t border-amber-300">
                💬 กรุณาติดต่อทีมงานเพื่อชำระค่าใช้จ่ายเพิ่มเติม (LINE @pacred / โทร {CONTACT.phoneCompanyDisplay})
              </p>
            )}
          </section>
        )}

        {/* T-P4 G2b: tax invoice request panel (hidden on print) */}
        {isPaid && (
          <TaxInvoiceRequestPanel
            orderType="forwarder"
            orderId={f.f_no ?? fNo}
            defaults={{
              name:    buyerName,
              address: companyAddress,
              taxId:   buyerTaxId,
            }}
            existing={existingInvoice}
            eligible={isEligible}
          />
        )}

        {/* Footer */}
        <div className="border-t border-gray-300 pt-3 text-[10px] text-gray-600">
          <p>• เอกสารนี้ออกโดย Pacred โดยอัตโนมัติจากระบบ — ไม่ต้องเซ็นกำกับ</p>
          <p>• สำหรับสอบถามเพิ่มเติม โทร {CONTACT.phoneCompanyDisplay} / LINE @pacred</p>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className="py-1">{label}</td>
      <td className="text-right font-mono">฿{value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
    </tr>
  );
}
