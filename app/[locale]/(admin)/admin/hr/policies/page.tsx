import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, ScrollText, Hash, Calendar, ExternalLink,
  CheckCircle2, ShieldAlert, Users2,
} from "lucide-react";
import { PolicyFormButton, PolicyRowActions } from "./policy-actions";

type Policy = {
  id: string;
  slug: string;
  title: string;
  category: string;
  version: string;
  body: string | null;
  external_url: string | null;
  requires_ack: boolean;
  is_published: boolean;
  published_at: string | null;
  effective_at: string | null;
  expires_at: string | null;
  created_at: string;
};

const CAT_LABEL: Record<string, { label: string; cls: string }> = {
  general:       { label: "ทั่วไป",         cls: "bg-gray-50 text-gray-700 border-gray-200" },
  hr:            { label: "HR",            cls: "bg-purple-50 text-purple-700 border-purple-200" },
  it:            { label: "IT",            cls: "bg-blue-50 text-blue-700 border-blue-200" },
  finance:       { label: "การเงิน",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  operations:    { label: "ปฏิบัติการ",    cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  compliance:    { label: "Compliance",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  safety:        { label: "Safety",       cls: "bg-red-50 text-red-700 border-red-200" },
  data_privacy:  { label: "PDPA",         cls: "bg-pink-50 text-pink-700 border-pink-200" },
};

export default async function AdminHRPoliciesPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [policiesRes, acksRes, activeAdminsRes] = await Promise.all([
    admin.from("policies").select("*").order("created_at", { ascending: false }),
    admin.from("policy_acknowledgments").select("policy_id"),
    admin.from("admins").select("profile_id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const policies = (policiesRes.data ?? []) as Policy[];
  const ackByPolicy = new Map<string, number>();
  for (const a of (acksRes.data ?? []) as Array<{ policy_id: string }>) {
    ackByPolicy.set(a.policy_id, (ackByPolicy.get(a.policy_id) ?? 0) + 1);
  }
  const totalEmployees = activeAdminsRes.count ?? 0;

  const totalPublished = policies.filter((p) => p.is_published).length;
  const totalDrafts    = policies.length - totalPublished;
  const totalReqAck    = policies.filter((p) => p.requires_ack && p.is_published).length;

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">นโยบาย</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <ScrollText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest opacity-80">HR · POLICIES</p>
              <h1 className="text-xl sm:text-2xl font-bold">Library นโยบาย</h1>
              <p className="text-xs opacity-80 mt-0.5">
                ทั้งหมด {policies.length} ฉบับ · เผยแพร่ {totalPublished} · ร่าง {totalDrafts} · บังคับรับทราบ {totalReqAck}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PolicyFormButton buttonLabel="เพิ่มนโยบาย" />
            <Link
              href="/admin/hr"
              className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
            >
              ← HR
            </Link>
          </div>
        </div>
      </div>

      {/* List */}
      {policies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          <ScrollText className="w-12 h-12 mx-auto mb-2 opacity-30" />
          ยังไม่มีนโยบาย — เพิ่มฉบับแรกเลย
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {policies.map((p) => {
            const cat = CAT_LABEL[p.category] ?? CAT_LABEL.general;
            const ackCount = ackByPolicy.get(p.id) ?? 0;
            const ackRatio = totalEmployees > 0 ? Math.round((ackCount / totalEmployees) * 100) : 0;
            const isExpired = p.expires_at && new Date(p.expires_at) < new Date();
            return (
              <article key={p.id} className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm space-y-3 ${p.is_published ? "border-border" : "border-dashed border-amber-200 bg-amber-50/30"} ${isExpired ? "opacity-60" : ""}`}>
                <header>
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cat.cls}`}>{cat.label}</span>
                      {p.requires_ack && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-bold">
                          <ShieldAlert className="w-3 h-3" /> ต้องรับทราบ
                        </span>
                      )}
                      {!p.is_published && (
                        <span className="rounded-full border border-amber-300 bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">ร่าง</span>
                      )}
                      {isExpired && (
                        <span className="rounded-full border border-gray-300 bg-gray-100 text-gray-700 px-2 py-0.5 text-[10px] font-bold">หมดอายุ</span>
                      )}
                    </div>
                  </div>
                  <h2 className="font-bold text-foreground">{p.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1 font-mono"><Hash className="w-3 h-3" /> v{p.version}</span>
                    {p.effective_at && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        เริ่ม {new Date(p.effective_at).toLocaleDateString("th-TH")}
                      </span>
                    )}
                    {p.expires_at && (
                      <span className="inline-flex items-center gap-1">
                        หมด {new Date(p.expires_at).toLocaleDateString("th-TH")}
                      </span>
                    )}
                    {p.external_url && (
                      <a href={p.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                        <ExternalLink className="w-3 h-3" /> เปิดเอกสาร
                      </a>
                    )}
                  </div>
                </header>

                {p.body && (
                  <p className="text-xs text-foreground bg-surface-alt/40 border border-border rounded-lg p-2.5 line-clamp-3 whitespace-pre-wrap">{p.body}</p>
                )}

                {/* Ack stats */}
                {p.requires_ack && p.is_published && (
                  <div className="rounded-lg border border-border bg-surface-alt/30 p-2.5">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-muted inline-flex items-center gap-1">
                        <Users2 className="w-3 h-3" />
                        รับทราบแล้ว <b>{ackCount}</b> / {totalEmployees} คน
                      </span>
                      <span className="font-bold">{ackRatio}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${ackRatio}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                  <span className="text-[10px] text-muted">
                    {p.is_published && p.published_at
                      ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> เผยแพร่ {new Date(p.published_at).toLocaleDateString("th-TH")}</span>
                      : "ยังไม่ได้เผยแพร่"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <PolicyFormButton
                      buttonLabel="แก้"
                      asPencil
                      initial={{
                        id:           p.id,
                        title:        p.title,
                        category:     p.category as never,
                        version:      p.version,
                        body:         p.body ?? "",
                        external_url: p.external_url ?? "",
                        requires_ack: p.requires_ack,
                        is_published: p.is_published,
                        effective_at: p.effective_at ?? "",
                        expires_at:   p.expires_at   ?? "",
                      }}
                    />
                    <PolicyRowActions id={p.id} isPublished={p.is_published} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        นโยบายที่ <b>เผยแพร่</b> + <b>บังคับรับทราบ</b> จะแสดงบน dashboard ของพนักงาน (RLS: published + authenticated) · พนักงาน ack ตัวเองได้
      </div>
    </main>
  );
}
