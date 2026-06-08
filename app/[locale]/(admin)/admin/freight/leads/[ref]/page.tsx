import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LeadTriageClient } from "./lead-triage-client";

/**
 * /admin/freight/leads/[ref] — RFQ lead detail + triage.
 *
 * Shows the full inbound `freight_quote` (singular) RFQ payload, then a triage
 * panel (status select + note · assign · convert-to-quote). Convert seeds a
 * DRAFT `freight_quotes` (plural) quotation and routes the salesperson to the
 * existing /admin/freight/quotes/[id] editor.
 *
 * [ref] is the public AX-YYYY-NNNNN ref (also accepts a uuid id as fallback).
 * Roles: super, ops, sales_admin.
 */

export const dynamic = "force-dynamic";

const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];
const STATUS_LABEL: Record<LeadStatus, string> = {
  new:       "ใหม่",
  contacted: "ติดต่อแล้ว",
  quoted:    "เสนอราคาแล้ว",
  won:       "ปิดการขาย",
  lost:      "ไม่สำเร็จ",
  spam:      "สแปม",
};
const STATUS_BADGE: Record<LeadStatus, string> = {
  new:       "bg-amber-50 text-amber-700 border-amber-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  quoted:    "bg-purple-50 text-purple-700 border-purple-200",
  won:       "bg-green-50 text-green-700 border-green-200",
  lost:      "bg-red-50 text-red-700 border-red-200",
  spam:      "bg-gray-100 text-gray-500 border-gray-200",
};

const SERVICE_LABEL: Record<string, string> = {
  import:    "นำเข้า",
  export:    "ส่งออก",
  customs:   "ออกใบขน",
  nondoc:    "ฝากสั่ง/ไม่รับเอกสาร",
  clearance: "เคลียร์ด่าน",
};
const TRANSPORT_LABEL: Record<string, string> = { sea: "เรือ", air: "แอร์", truck: "รถ" };
const CONTACT_PREF_LABEL: Record<string, string> = { form: "ฟอร์ม", call: "โทรกลับ", line: "LINE" };
const CUSTOMER_TYPE_LABEL: Record<string, string> = { person: "บุคคลธรรมดา", company: "นิติบุคคล" };

type LeadRow = {
  id: string;
  ref: string;
  status: string;
  customer_type: string;
  service: string;
  transport: string | null;
  incoterm: string | null;
  load_type: string | null;
  container_size: string | null;
  carrier: string | null;
  origin: string | null;
  destination: string | null;
  product: string | null;
  goods_value_usd: number | null;
  cbm: number | null;
  weight_kg: number | null;
  addons: unknown;
  est_total_thb: number | null;
  contact_name: string;
  contact_phone: string;
  contact_line: string | null;
  contact_email: string | null;
  contact_pref: string;
  note: string | null;
  assigned_admin_id: string | null;
  profile_id: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <span className="text-sm text-right break-words">{value}</span>
    </div>
  );
}

export default async function AdminFreightLeadDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  await requireAdmin(["super", "ops", "sales_admin"]);
  const { ref } = await params;
  const decoded = decodeURIComponent(ref).trim();

  const admin = createAdminClient();

  // Look up by ref first, then by uuid id.
  const isUuid = /^[0-9a-f-]{36}$/i.test(decoded);
  const { data: lead, error } = await admin
    .from("freight_quote")
    .select("*")
    .eq(isUuid ? "id" : "ref", decoded)
    .maybeSingle<LeadRow>();
  if (error) {
    console.error(`[freight lead detail] failed`, { code: error.code, message: error.message });
    throw new Error(`Failed to load freight_quote (${error.code ?? "unknown"}): ${error.message}`);
  }
  if (!lead) notFound();

  const statusLabel = STATUS_LABEL[(lead.status as LeadStatus)] ?? lead.status;
  const statusBadge = STATUS_BADGE[(lead.status as LeadStatus)] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const addons = Array.isArray(lead.addons) ? (lead.addons as string[]) : [];

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/freight/leads" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ RFQ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            RFQ <span className="font-mono">{lead.ref}</span>
          </h1>
          <p className="text-xs text-muted">
            รับเข้า {new Date(lead.created_at).toLocaleString("th-TH")}
            {lead.contact_pref === "call" && <> · <span className="text-red-600 font-medium">⚡ ลูกค้าขอให้โทรกลับ</span></>}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge}`}>
          {statusLabel}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Contact */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-2">ผู้ติดต่อ</h2>
          <Field label="ชื่อ" value={lead.contact_name} />
          <Field label="เบอร์โทร" value={<span className="font-mono">{lead.contact_phone}</span>} />
          <Field label="LINE" value={lead.contact_line} />
          <Field label="อีเมล" value={lead.contact_email} />
          <Field label="ช่องทางติดต่อกลับ" value={CONTACT_PREF_LABEL[lead.contact_pref] ?? lead.contact_pref} />
          <Field label="ประเภทลูกค้า" value={CUSTOMER_TYPE_LABEL[lead.customer_type] ?? lead.customer_type} />
          <Field label="สมาชิก" value={lead.profile_id ? "เข้าสู่ระบบ (มีบัญชี)" : "ผู้เยี่ยมชม (ยังไม่มีบัญชี)"} />
        </section>

        {/* Logistics */}
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5">
          <h2 className="font-bold text-sm mb-2">รายละเอียดงาน</h2>
          <Field label="บริการ" value={SERVICE_LABEL[lead.service] ?? lead.service} />
          <Field label="ขนส่ง" value={lead.transport ? TRANSPORT_LABEL[lead.transport] ?? lead.transport : null} />
          <Field label="Incoterm" value={lead.incoterm ? <span className="font-mono">{lead.incoterm}</span> : null} />
          <Field label="FCL/LCL" value={lead.load_type} />
          <Field label="ขนาดตู้" value={lead.container_size} />
          <Field label="สายเรือ/Carrier" value={lead.carrier} />
          <Field label="ต้นทาง" value={lead.origin} />
          <Field label="ปลายทาง" value={lead.destination} />
          <Field label="สินค้า" value={lead.product} />
          <Field label="มูลค่าสินค้า (USD)" value={lead.goods_value_usd != null ? `$${Number(lead.goods_value_usd).toLocaleString()}` : null} />
          <Field label="ปริมาตร (CBM)" value={lead.cbm != null ? String(lead.cbm) : null} />
          <Field label="น้ำหนัก (kg)" value={lead.weight_kg != null ? String(lead.weight_kg) : null} />
          <Field label="ประมาณการ (ลูกค้าเห็น)" value={lead.est_total_thb != null ? `฿${Number(lead.est_total_thb).toLocaleString("th-TH")}` : null} />
          {addons.length > 0 && <Field label="บริการเสริม" value={addons.join(", ")} />}
        </section>
      </div>

      {/* Customer note */}
      {lead.note && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-1">บันทึก / ประวัติการติดตาม</h2>
          <p className="text-xs whitespace-pre-line">{lead.note}</p>
        </section>
      )}

      {/* Triage panel (client) */}
      <LeadTriageClient
        leadRef={lead.ref}
        status={lead.status}
        assignedAdminId={lead.assigned_admin_id}
      />
    </main>
  );
}
