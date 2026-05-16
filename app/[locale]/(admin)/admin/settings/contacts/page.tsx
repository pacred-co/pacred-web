import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ORG_CONTACT_KINDS, ORG_CONTACT_KIND_LABEL, type OrgContactKind } from "@/lib/validators/org-contact";
import { ContactsManager } from "./contacts-manager";

/**
 * /admin/settings/contacts — V-G5 admin CRUD for org_contacts.
 *
 * Tabs per kind (domain / email / line_oa / phone / wechat / social / address).
 * Active tab = ?kind=email (default).
 *
 * V1 = backend management only. Customer-side reads still use the constants
 * in components/seo/site.ts; integration is deferred to V-G5.1 (after the
 * owner populates the table on staging + verifies it renders correctly).
 *
 * Per port-spec admin-polish-bundle.md §V-G5.
 */

export const dynamic = "force-dynamic";

type OrgContactRow = {
  id:             string;
  kind:           OrgContactKind;
  label:          string;
  value:          string;
  department:     string | null;
  is_active:      boolean;
  display_order:  number;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
};

type SP = { kind?: string };

export default async function AdminOrgContactsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const sp = await searchParams;
  const activeKind: OrgContactKind = (
    ORG_CONTACT_KINDS as readonly string[]
  ).includes(sp.kind ?? "")
    ? (sp.kind as OrgContactKind)
    : "email";

  const admin = createAdminClient();
  const { data: rowsRaw } = await admin
    .from("org_contacts")
    .select("id, kind, label, value, department, is_active, display_order, notes, created_at, updated_at")
    .eq("kind", activeKind)
    .order("display_order", { ascending: true })
    .order("label", { ascending: true });
  const rows = (rowsRaw ?? []) as OrgContactRow[];

  // Counts per kind for tab badges.
  const counts: Record<OrgContactKind, number> = {} as Record<OrgContactKind, number>;
  for (const k of ORG_CONTACT_KINDS) counts[k] = 0;
  const { data: countRows } = await admin
    .from("org_contacts")
    .select("kind");
  for (const r of (countRows ?? []) as Array<{ kind: OrgContactKind }>) {
    counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · SETTINGS</p>
        <h1 className="mt-1 text-2xl font-bold">ข้อมูลติดต่อองค์กร</h1>
        <p className="text-xs text-muted mt-1">
          จัดการอีเมล/เบอร์/LINE/Social/ที่อยู่ของบริษัท. ทุกคนเห็น (รายการที่ active=true) — กระทบ landing/footer/หน้า contact หลัง wire customer-side (V-G5.1).
        </p>
      </header>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {ORG_CONTACT_KINDS.map((k) => (
          <Link
            key={k}
            href={`/admin/settings/contacts?kind=${k}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              k === activeKind
                ? "bg-primary-600 text-white"
                : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
            }`}
          >
            {ORG_CONTACT_KIND_LABEL[k]}
            <span className={`ml-1.5 text-[10px] ${k === activeKind ? "text-white/80" : "text-muted"}`}>
              ({counts[k]})
            </span>
          </Link>
        ))}
      </nav>

      <ContactsManager kind={activeKind} initialRows={rows} />
    </main>
  );
}
