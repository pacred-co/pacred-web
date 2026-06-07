import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportContactMessagesAll } from "@/actions/admin/export/contact-messages";
import { ContactMessageActions } from "./actions-cell";

// CSV columns mirror the <thead> 1:1 (with the joined sender profile fields
// split out for the export).
const CSV_COLS: CsvCol[] = [
  { key: "created_at", label: "วันที่" },
  { key: "name", label: "ผู้ส่ง" },
  { key: "member_code", label: "รหัสสมาชิก" },
  { key: "sender_profile", label: "ชื่อโปรไฟล์" },
  { key: "contact", label: "ติดต่อ" },
  { key: "subject", label: "หัวข้อ" },
  { key: "message", label: "ข้อความ" },
  { key: "status", label: "สถานะ" },
  { key: "source_url", label: "ที่มา (URL)" },
  { key: "ip", label: "IP" },
];

const STATUS_BADGE: Record<string, string> = {
  new:     "bg-blue-50 text-blue-700 border-blue-200",
  read:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  replied: "bg-green-50 text-green-700 border-green-200",
  closed:  "bg-gray-50 text-gray-600 border-gray-200",
};

const STATUS_LABEL: Record<string, string> = {
  new:     "ใหม่",
  read:    "อ่านแล้ว",
  replied: "ตอบกลับแล้ว",
  closed:  "ปิดเรื่อง",
};

type ProfileShape = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
};

export default async function AdminContactMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);
  const admin = createAdminClient();

  let q = admin
    .from("contact_messages")
    .select(`
      id, profile_id, name, contact, subject, message, status,
      source_url, user_agent, ip, created_at, updated_at,
      profile:profiles!profile_id ( member_code, first_name, last_name )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (sp.status) q = q.eq("status", sp.status);

  const { data, error, count } = await q;
  if (error) {
    console.error(`[contact_messages list] failed`, { code: error.code, message: error.message });
  }
  type RawRow = Omit<NonNullable<typeof data>[number], "profile"> & {
    profile: ProfileShape | ProfileShape[] | null;
  };
  const rows = ((data ?? []) as unknown as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  // CSV rows for the visible page (mirrors the table columns; profile split out).
  const csvRows: CsvRow[] = rows.map((r) => ({
    created_at: (r.created_at ?? "").slice(0, 10),
    name: r.name ?? "",
    member_code: r.profile?.member_code ?? "",
    sender_profile: r.profile
      ? `${r.profile.first_name ?? ""} ${r.profile.last_name ?? ""}`.trim()
      : r.profile_id === null
        ? "guest"
        : "",
    contact: r.contact ?? "",
    subject: r.subject ?? "",
    message: r.message ?? "",
    status: STATUS_LABEL[r.status] ?? r.status,
    source_url: r.source_url ?? "",
    ip: r.ip ?? "",
  }));

  // Counts per status (separate query for the chip badges)
  const { data: counts, error: countsErr } = await admin
    .from("contact_messages")
    .select("status");
  if (countsErr) {
    console.error(`[contact_messages list] failed`, { code: countsErr.code, message: countsErr.message });
  }
  const tally = (counts ?? []).reduce<Record<string, number>>((acc, r) => {
    const s = (r as { status: string }).status;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // IC-1 — batch-fetch the work_item id per contact_message so each row
  // can flag "has a chat thread" (work-item detail page surfaces the
  // <WorkItemThread> — no per-row contact-message detail page exists yet).
  const contactIds = rows.map((r) => r.id);
  const workItemByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: wiRaw, error: wiRawErr } = await admin
      .from("work_items")
      .select("id, entity_ref")
      .eq("entity_type", "contact_message")
      .in("entity_ref", contactIds);
    if (wiRawErr) {
      console.error(`[work_items list] failed`, { code: wiRawErr.code, message: wiRawErr.message });
    }
    for (const w of (wiRaw ?? []) as Array<{ id: string; entity_ref: string }>) {
      if (!workItemByContact.has(w.entity_ref)) workItemByContact.set(w.entity_ref, w.id);
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">ข้อความติดต่อจากเว็บไซต์</h1>
          <p className="mt-1 text-sm text-muted">
            ฟอร์มติดต่อจากหน้า /contact — รับเรื่อง ตอบกลับ ปิดเคส
          </p>
        </div>
        <CsvButton
          rows={csvRows}
          cols={CSV_COLS}
          filename="contact-messages.csv"
          fetchAll={async () => {
            "use server";
            return exportContactMessagesAll({ status: sp.status });
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={!sp.status} href="/admin/contact-messages">
          ทั้งหมด ({(counts ?? []).length})
        </Chip>
        {(["new", "read", "replied", "closed"] as const).map((s) => (
          <Chip
            key={s}
            active={sp.status === s}
            href={`/admin/contact-messages?status=${s}`}
          >
            {STATUS_LABEL[s]} ({tally[s] ?? 0})
          </Chip>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีข้อความ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">ผู้ส่ง</th>
                  <th className="px-4 py-3">ติดต่อ</th>
                  <th className="px-4 py-3">หัวข้อ + ข้อความ</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{r.name}</div>
                      {r.profile && (
                        <div className="mt-0.5 text-muted">
                          <span className="font-mono">{r.profile.member_code ?? "—"}</span>
                          {r.profile.first_name && (
                            <> · {r.profile.first_name} {r.profile.last_name ?? ""}</>
                          )}
                        </div>
                      )}
                      {!r.profile && r.profile_id === null && (
                        <div className="mt-0.5 text-[10px] text-muted italic">guest</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <ContactLink contact={r.contact} />
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[420px]">
                      {r.subject && (
                        <div className="font-semibold mb-1">{r.subject}</div>
                      )}
                      <details className="group">
                        <summary className="cursor-pointer text-muted">
                          {r.message.slice(0, 140)}
                          {r.message.length > 140 && (
                            <span className="text-primary-500 ml-1 group-open:hidden">
                              ...อ่านต่อ
                            </span>
                          )}
                        </summary>
                        <div className="mt-2 whitespace-pre-wrap text-foreground rounded border border-border bg-surface-alt/30 p-2">
                          {r.message}
                        </div>
                      </details>
                      {(r.source_url || r.ip) && (
                        <div className="mt-1.5 text-[10px] text-muted/70 space-y-0.5">
                          {r.source_url && <div>📎 {r.source_url}</div>}
                          {r.ip && <div>🌐 {r.ip}</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          STATUS_BADGE[r.status] ?? "bg-gray-50 border-gray-200"
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ContactMessageActions id={r.id} status={r.status} />
                      {workItemByContact.has(r.id) && (
                        <p className="mt-1 text-[10px] text-primary-600 font-medium" title="งานนี้มี internal chat thread — เปิดจากกระดานงานหรือหน้ารายละเอียดที่เชื่อมโยง">
                          💬 มีแชทภายใน
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={count ?? 0}
        basePath="/admin/contact-messages"
        params={{ status: sp.status }}
      />
    </main>
  );
}

function Chip({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white border-border hover:bg-surface-alt"
      }`}
    >
      {children}
    </Link>
  );
}

function ContactLink({ contact }: { contact: string }) {
  const trimmed = contact.trim();
  // Email: contains @
  if (trimmed.includes("@")) {
    return (
      <a
        href={`mailto:${trimmed}`}
        className="text-primary-600 hover:underline break-all"
      >
        ✉️ {trimmed}
      </a>
    );
  }
  // Phone-ish: digits + maybe + - ()
  const digitsOnly = trimmed.replace(/[^\d+]/g, "");
  if (digitsOnly.length >= 8) {
    return (
      <a
        href={`tel:${digitsOnly}`}
        className="text-primary-600 hover:underline whitespace-nowrap"
      >
        📞 {trimmed}
      </a>
    );
  }
  return <span className="text-muted break-all">{trimmed}</span>;
}
