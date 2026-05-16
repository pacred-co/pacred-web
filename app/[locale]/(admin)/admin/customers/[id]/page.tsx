import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AssignRepForm } from "./assign-rep";
import { CustomerActions } from "./customer-actions";

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [
    { data: profile }, { data: corporate }, { data: addresses }, { data: wallet }, { data: repProfiles },
    { data: customRatesUser }, { data: customRatesHs },
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", id).maybeSingle(),
    admin.from("corporate").select("*").eq("profile_id", id).maybeSingle(),
    admin.from("addresses").select("*").eq("profile_id", id).is("deleted_at", null),
    admin.from("wallet").select("balance, cashback_balance, credit_balance").eq("profile_id", id).maybeSingle(),
    // List active admins with sales_admin or super role (with their contact)
    admin.from("admins")
      .select(`profile_id, role, profile:profiles!profile_id ( member_code, first_name, last_name, phone ), contact:admin_contact_extras!profile_id ( display_name, direct_phone )`)
      .in("role", ["sales_admin", "super"])
      .eq("is_active", true),
    // LP-1c surface: custom rate overrides on this customer
    admin.from("rate_custom_user")
      .select("id, source_warehouse, transport_type, product_type, basis, rate, updated_at")
      .eq("profile_id", id)
      .order("updated_at", { ascending: false })
      .limit(10),
    admin.from("rate_custom_hs")
      .select("id, hs_code, source_warehouse, transport_type, product_type, basis, rate, rate_before, updated_at")
      .eq("profile_id", id)
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  if (!profile) notFound();
  type Profile = typeof profile & {
    member_code: string | null;
    account_type: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    customer_group: string;
    register_with: string | null;
    referral_channel: string | null;
    recommended_by: string | null;
    line_user_id: string | null;
    line_id: string | null;
    facebook_url: string | null;
    sex: string | null;
    birthday: string | null;
    last_login_at: string | null;
    created_at: string;
  };
  type Corporate = {
    tax_id: string;
    company_name: string;
    company_address: string | null;
    status: string;
  };
  type Address = {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    is_default: boolean;
    address_line: string;
    sub_district: string;
    district: string;
    province: string;
    postal_code: string;
  };
  type Wallet = { balance: number; cashback_balance: number; credit_balance: number };

  type CustomUserRate = { id: string; source_warehouse: string; transport_type: string; product_type: string; basis: string; rate: number; updated_at: string };
  type CustomHsRate   = { id: string; hs_code: string; source_warehouse: string; transport_type: string; product_type: string; basis: string; rate: number; rate_before: number | null; updated_at: string };

  const p   = profile as Profile;
  const c   = (corporate as Corporate | null) ?? null;
  const a   = (addresses as Address[] | null) ?? [];
  const w   = (wallet as Wallet | null) ?? { balance: 0, cashback_balance: 0, credit_balance: 0 };
  const cu  = ((customRatesUser ?? []) as CustomUserRate[]);
  const ch  = ((customRatesHs   ?? []) as CustomHsRate[]);
  const displayName = p.account_type === "juristic" && p.company_name
    ? p.company_name
    : `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "ลูกค้า";

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ลูกค้า</p>
          <h1 className="mt-1 text-2xl font-bold">{displayName}</h1>
          <p className="text-sm text-muted font-mono">{p.member_code}</p>
        </div>
        <Link href="/admin/customers" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับ
        </Link>
      </div>

      {/* Wallet quick view */}
      <section className="grid sm:grid-cols-3 gap-3">
        <WalletCard label="กระเป๋า" value={w.balance} tone="primary" />
        <WalletCard label="Cashback" value={w.cashback_balance} tone="orange" />
        <WalletCard label="เครดิต" value={w.credit_balance} tone="blue" />
      </section>

      {/* Approve / Suspend / Edit */}
      <CustomerActions
        id={p.id}
        status={p.status}
        firstName={p.first_name}
        lastName={p.last_name}
        email={p.email}
        phone={p.phone}
        customerGroup={p.customer_group}
        sex={p.sex}
        birthday={p.birthday}
        lineId={p.line_id}
        recommendedBy={p.recommended_by}
      />

      {/* Convert to juristic (only relevant while account_type='personal') */}
      {p.account_type === "personal" && (
        <Link
          href={`/admin/customers/${p.id}/convert-to-juristic`}
          className="block rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-amber-900">เปลี่ยนเป็นบัญชีนิติบุคคล →</p>
              <p className="text-xs text-amber-800/80 mt-0.5">
                ใช้เมื่อลูกค้าเปิดบริษัทและต้องการให้ใบเสร็จออกในชื่อบริษัท — wallet + history เดิมจะตามไป
              </p>
            </div>
            <span className="text-xs font-mono uppercase text-amber-700">PERSONAL → JURISTIC</span>
          </div>
        </Link>
      )}

      {/* Assign sales rep */}
      <AssignRepForm
        customerId={p.id}
        currentRepId={(p as { sales_admin_id?: string | null }).sales_admin_id ?? null}
        reps={(() => {
          type RepRow = {
            profile_id: string;
            profile: { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null }[] | null;
            contact: { display_name: string | null; direct_phone: string | null } | { display_name: string | null; direct_phone: string | null }[] | null;
          };
          const seen = new Set<string>();
          const out: { profile_id: string; display: string }[] = [];
          for (const r of (repProfiles ?? []) as RepRow[]) {
            if (seen.has(r.profile_id)) continue;
            seen.add(r.profile_id);
            const prof    = Array.isArray(r.profile) ? r.profile[0] : r.profile;
            const contact = Array.isArray(r.contact) ? r.contact[0] : r.contact;
            const name    = contact?.display_name ?? `${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim() ?? "—";
            const phone   = contact?.direct_phone ?? prof?.phone ?? "—";
            out.push({ profile_id: r.profile_id, display: `${name} · ${prof?.member_code ?? ""} · ${phone}` });
          }
          return out;
        })()}
      />

      {/* Transfer sales rep (P-9) — only meaningful AFTER an initial assign;
          hidden when sales_admin_id IS NULL so admins assign first via the
          form above, then transfer later if the rep needs to change. */}
      {(p as { sales_admin_id?: string | null }).sales_admin_id && (
        <Link
          href={`/admin/customers/${p.id}/transfer-rep`}
          className="block rounded-2xl border border-blue-300 bg-blue-50 px-5 py-4 hover:bg-blue-100 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-blue-900">โอนทีมขายผู้ดูแล →</p>
              <p className="text-xs text-blue-800/80 mt-0.5">
                เปลี่ยน sales rep เจ้าของลูกค้าคนนี้ — บันทึก audit log + แจ้งทั้ง rep เก่าและใหม่
              </p>
            </div>
            <span className="text-xs font-mono uppercase text-blue-700">TRANSFER REP</span>
          </div>
        </Link>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="ข้อมูลส่วนตัว">
          <Row label="ประเภท" value={p.account_type === "juristic" ? "นิติบุคคล" : "บุคคล"} />
          <Row label="สถานะ" value={p.status} />
          <Row label="เบอร์" value={p.phone ?? "—"} />
          <Row label="อีเมล" value={p.email ?? "—"} />
          <Row label="กลุ่มลูกค้า" value={p.customer_group} />
          <Row label="สมัครผ่าน" value={p.register_with ?? "—"} />
          <Row label="ช่อง" value={p.referral_channel ?? "—"} />
          <Row label="แนะนำโดย" value={p.recommended_by ?? "—"} />
          <Row label="เพศ" value={p.sex ?? "—"} />
          <Row label="วันเกิด" value={p.birthday ?? "—"} />
          <Row label="LINE" value={p.line_id ?? "—"} />
          <Row label="LINE userId (push)" value={p.line_user_id ?? "—"} />
          <Row label="ล็อกอินล่าสุด" value={p.last_login_at ? new Date(p.last_login_at).toLocaleString("th-TH") : "—"} />
          <Row label="สมัครเมื่อ" value={new Date(p.created_at).toLocaleString("th-TH")} />
        </Section>

        {c && (
          <Section title="ข้อมูลบริษัท">
            <Row label="เลขผู้เสียภาษี" value={c.tax_id} />
            <Row label="ชื่อบริษัท" value={c.company_name} />
            <Row label="สถานะ" value={c.status} />
            {c.company_address && <Row label="ที่อยู่บริษัท" value={c.company_address} multiline />}
          </Section>
        )}
      </div>

      <Section title={`ที่อยู่จัดส่ง (${a.length})`}>
        {a.length === 0 ? (
          <p className="text-sm text-muted">ไม่มีที่อยู่</p>
        ) : (
          <ul className="divide-y divide-border">
            {a.map((ad) => (
              <li key={ad.id} className="py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ad.first_name} {ad.last_name}</span>
                  {ad.is_default && <span className="rounded-full bg-primary-500 text-white px-2 py-0.5 text-[10px]">หลัก</span>}
                </div>
                <p className="text-xs text-muted">📞 {ad.phone}</p>
                <p className="text-xs">{ad.address_line} ต.{ad.sub_district} อ.{ad.district} จ.{ad.province} {ad.postal_code}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* LP-1c: custom rate overrides on this customer */}
      {(cu.length > 0 || ch.length > 0) && (
        <Section title={`🏷️ Custom rates (${cu.length + ch.length})`}>
          {cu.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted">Per-customer flat ({cu.length})</p>
                {p.member_code && (
                  <Link href={`/admin/rates/custom-user?member=${encodeURIComponent(p.member_code)}`} className="text-xs text-primary-600 hover:underline">
                    จัดการทั้งหมด →
                  </Link>
                )}
              </div>
              <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                {cu.slice(0, 5).map((r) => (
                  <li key={r.id} className="font-mono flex justify-between border-b border-border/50 py-1">
                    <span>{r.source_warehouse}/{r.transport_type}/{r.product_type}/{r.basis}</span>
                    <span className="font-bold">฿{Number(r.rate).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
              {cu.length > 5 && <p className="text-[10px] text-muted">…และอีก {cu.length - 5} แถว</p>}
            </div>
          )}
          {ch.length > 0 && (
            <div className="space-y-1 mt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted">Per-customer + HS ({ch.length})</p>
                {p.member_code && (
                  <Link href={`/admin/rates/custom-hs?member=${encodeURIComponent(p.member_code)}`} className="text-xs text-primary-600 hover:underline">
                    จัดการทั้งหมด →
                  </Link>
                )}
              </div>
              <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                {ch.slice(0, 5).map((r) => (
                  <li key={r.id} className="font-mono flex justify-between border-b border-border/50 py-1">
                    <span>HS {r.hs_code} · {r.source_warehouse}/{r.transport_type}/{r.product_type}/{r.basis}</span>
                    <span className="font-bold">฿{Number(r.rate).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
              {ch.length > 5 && <p className="text-[10px] text-muted">…และอีก {ch.length - 5} แถว</p>}
            </div>
          )}
        </Section>
      )}
    </main>
  );
}

function WalletCard({ label, value, tone }: { label: string; value: number; tone: "primary" | "orange" | "blue" }) {
  const tones = {
    primary: "from-primary-500/10 to-primary-500/0 border-primary-500/30",
    orange:  "from-orange-500/10 to-orange-500/0 border-orange-500/30",
    blue:    "from-blue-500/10 to-blue-500/0 border-blue-500/30",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${tones} p-4`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold font-mono">฿{Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-1">
      <h3 className="font-bold text-sm mb-2">{title}</h3>
      {children}
    </div>
  );
}
function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={`text-sm ${multiline ? "" : "flex justify-between gap-3"}`}>
      <span className="text-muted">{label}</span>
      <span className={`${multiline ? "block whitespace-pre-wrap" : "font-medium"}`}>{value}</span>
    </div>
  );
}
