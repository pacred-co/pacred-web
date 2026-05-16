import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

/**
 * /admin/warehouse/qa-inspections/[id] — V-E10 detail.
 *
 * Read-only header (outcome is immutable) + waived metadata + photo gallery.
 * Photos are private; we generate signed URLs (60s) for thumbs.
 *
 * (Update flow for notes-only mutation is exposed via updateQaInspectionNotes
 * server action but UI for it is deferred — V1 inspections are usually
 * complete at creation; corrections happen by recording a new inspection.)
 */

export const dynamic = "force-dynamic";

const OUTCOME_BADGE: Record<string, string> = {
  pass:       "bg-green-50 text-green-700 border-green-200",
  fail_minor: "bg-yellow-50 text-yellow-700 border-yellow-200",
  fail_major: "bg-red-50 text-red-700 border-red-200",
  waived:     "bg-gray-50 text-gray-600 border-gray-200",
};
const OUTCOME_LABEL: Record<string, string> = {
  pass:       "✅ ผ่าน",
  fail_minor: "⚠️ ผิดเล็กน้อย",
  fail_major: "🚨 ผิดสำคัญ",
  waived:     "ℹ️ ยกเว้น",
};
const DAMAGE_LABEL: Record<string, string> = {
  none:      "ไม่มี",
  cosmetic:  "เล็กน้อย (cosmetic)",
  partial:   "บางส่วน (partial)",
  total:     "เสียทั้งหมด (total)",
};

type Detail = {
  id:                    string;
  inspection_no:         string;
  cargo_shipment_id:     string | null;
  outcome:               "pass" | "fail_minor" | "fail_major" | "waived";
  damage_level:          string | null;
  missing_items:         number;
  notes:                 string | null;
  photo_paths:           string[];
  waived_reason:         string | null;
  waived_at:             string | null;
  inspected_at:          string;
  customer_notified_at:  string | null;
  cargo_shipment: {
    id:            string;
    shipment_code: string;
    status:        string;
    profile: {
      member_code: string | null;
      first_name:  string | null;
      last_name:   string | null;
    } | null;
  } | null;
};

export default async function AdminQaInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting", "warehouse"]);
  const { id } = await params;
  const admin = createAdminClient();

  const { data: raw } = await admin
    .from("freight_qa_inspections")
    .select(`
      id, inspection_no, cargo_shipment_id, outcome, damage_level, missing_items,
      notes, photo_paths, waived_reason, waived_at, inspected_at, customer_notified_at,
      cargo_shipment:cargo_shipments!cargo_shipment_id (
        id, shipment_code, status,
        profile:profiles!profile_id ( member_code, first_name, last_name )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (!raw) notFound();

  // Normalise FK joins. Cast through unknown — Supabase typing inconsistently
  // returns arrays even for FK→one relationships.
  type CS = NonNullable<Detail["cargo_shipment"]>;
  const csRaw = raw.cargo_shipment as unknown as CS | CS[] | null;
  const cs    = Array.isArray(csRaw) ? csRaw[0] ?? null : csRaw;
  const prof  = cs && Array.isArray(cs.profile) ? cs.profile[0] ?? null : cs?.profile ?? null;
  const it: Detail = {
    ...raw,
    photo_paths:    Array.isArray(raw.photo_paths) ? raw.photo_paths : [],
    cargo_shipment: cs ? { ...cs, profile: prof } : null,
  } as Detail;

  // Signed URLs for private bucket — 60s TTL is plenty for a page render.
  const signedUrls: Record<string, string> = {};
  if (it.photo_paths.length > 0) {
    const { data: urls } = await admin.storage
      .from("qa-inspection-photos")
      .createSignedUrls(it.photo_paths, 60);
    (urls ?? []).forEach((u, idx) => {
      const p = it.photo_paths[idx];
      if (p && u.signedUrl) signedUrls[p] = u.signedUrl;
    });
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/warehouse/qa-inspections" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            ใบตรวจ <span className="font-mono">{it.inspection_no}</span>
          </h1>
          <p className="text-xs text-muted">
            ตรวจเมื่อ {new Date(it.inspected_at).toLocaleString("th-TH")}
            {it.customer_notified_at && (
              <> · 📤 แจ้งลูกค้าเมื่อ {new Date(it.customer_notified_at).toLocaleString("th-TH")}</>
            )}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${OUTCOME_BADGE[it.outcome]}`}>
          {OUTCOME_LABEL[it.outcome]}
        </span>
      </div>

      {/* Shipment + customer */}
      {it.cargo_shipment && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
          <h2 className="font-bold text-sm mb-2">Shipment</h2>
          <p className="text-sm">
            <span className="font-mono">{it.cargo_shipment.shipment_code}</span>{" "}
            <span className="text-xs text-muted">({it.cargo_shipment.status})</span>
          </p>
          <p className="text-xs text-muted">
            ลูกค้า: <span className="font-mono">{it.cargo_shipment.profile?.member_code}</span>{" "}
            · {it.cargo_shipment.profile?.first_name} {it.cargo_shipment.profile?.last_name}
          </p>
        </section>
      )}

      {/* Inspection details */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-2">
        <h2 className="font-bold text-sm mb-2">รายละเอียดการตรวจ</h2>
        <p className="text-sm">
          ความเสียหาย: <strong>{it.damage_level ? DAMAGE_LABEL[it.damage_level] : "—"}</strong>
        </p>
        <p className="text-sm">
          ของขาด: <strong>{it.missing_items}</strong> ชิ้น
        </p>
        {it.notes && (
          <div className="mt-2 rounded-lg bg-surface-alt/40 p-3">
            <p className="text-xs text-muted mb-1">บันทึก</p>
            <p className="text-sm whitespace-pre-line">{it.notes}</p>
          </div>
        )}
      </section>

      {/* Waived metadata */}
      {it.outcome === "waived" && it.waived_reason && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-1">
          <h2 className="font-bold text-sm mb-1 text-red-800">⚠️ ยกเว้น (waived)</h2>
          <p className="text-sm">เหตุผล: {it.waived_reason}</p>
          {it.waived_at && (
            <p className="text-xs text-red-700">เมื่อ {new Date(it.waived_at).toLocaleString("th-TH")}</p>
          )}
        </section>
      )}

      {/* Photo gallery */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">รูปประกอบ ({it.photo_paths.length})</h2>
        {it.photo_paths.length === 0 ? (
          <p className="text-xs text-muted">ไม่มีรูปประกอบ</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {it.photo_paths.map((p) => (
              <a
                key={p}
                href={signedUrls[p] ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-border bg-surface-alt hover:opacity-90"
              >
                {signedUrls[p] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signedUrls[p]} alt="QA photo" className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center text-xs text-muted">
                    (signed URL unavailable)
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
