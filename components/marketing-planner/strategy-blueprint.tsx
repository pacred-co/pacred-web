"use client";

/**
 * "แผนการตลาด" (Strategy Blueprint) — the north-star view (ปอน 2026-07-01).
 * Lays out the whole Pacred MKT framework as a readable map AND shows where we
 * are in it: how many contents serve each goal/pillar/channel, craft adoption,
 * the metric-by-goal reference, the team, and the service roadmap. Each block
 * links to its Settings editor so the plan itself can be extended/adjusted.
 */
import { ArrowRight, BarChart3, Layers, Megaphone, Plus, Rocket, Settings2, Share2, Sparkles, Target, Users2 } from "lucide-react";
import type { ContentItem, SettingGroup } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { countByField, notArchived } from "@/lib/marketing-planner/analytics";
import { SectionCard, Tag } from "./ui";

const FLOW = [
  { n: 1, title: "เป้าหมาย", desc: "คอนเทนต์นี้ทำเพื่ออะไร", icon: Target },
  { n: 2, title: "คอนเทนต์", desc: "เลือกเสาหลัก + ประเภท", icon: Layers },
  { n: 3, title: "องค์ประกอบ", desc: "Hook · Story · Proof · CTA", icon: Sparkles },
  { n: 4, title: "ขยายผล", desc: "SEO · Ads · CRM · Influencer", icon: Share2 },
  { n: 5, title: "วัดผล", desc: "Reach → เชื่อใจ → ทัก → ปิดการขาย", icon: BarChart3 },
];

const METRIC_REF: [string, string][] = [
  ["ให้คนรู้จัก", "Reach · View · Impression"],
  ["ให้คนเชื่อใจ", "Comment · Share · Save · Review"],
  ["ให้คนค้นหาเจอ", "Keyword Ranking · Organic Traffic"],
  ["ให้คนทัก", "LINE Add · Inbox · Call Conversion"],
  ["ให้ลูกค้าเก่ากลับมา", "Broadcast CTR · โทรกลับ"],
  ["ให้คนพูดถึงเรา", "Backlink · Mention · Influencer"],
];

const CRAFT_ELEMENTS = ["Hook", "Pain Point", "Context", "Story Telling", "Proof", "Authority", "Visual", "Organic Selling", "Branding", "ESG", "Contact", "CTA", "SEO Keyword"];

const NEXT_TEAMS = [
  "ทีม อย./มอก./เกษตร/ประมง (S2)",
  "ทีม ส่งออก (S3)",
  "ทีม รัชชิ่ง/ตีลังไม้/ฟูมิเกชัน/ลมควัน (S3)",
];

function craftFilled(c: ContentItem): number {
  return [c.hook, c.painPoint, c.context, c.storyTelling, c.proof, c.authority, c.visual, c.organicSelling, c.branding, c.esg, c.contact, c.cta, c.keyword].filter((x) => x && x.trim()).length;
}

function ManageBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-primary-700 hover:bg-primary-50">
      <Settings2 className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/15">
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: color || "#B30000" }} />
    </div>
  );
}

export function StrategyBlueprint({ onGoSettings, onCreate }: { onGoSettings: (group: SettingGroup) => void; onCreate: () => void }) {
  const { contents, byGroup, users, userColor } = usePlanner();
  const live = notArchived(contents);

  const goals = byGroup("marketingGoal");
  const pillars = byGroup("contentPillar");
  const channels = byGroup("channel");
  const statuses = byGroup("status");
  const services = byGroup("service");
  const doneIds = new Set(statuses.filter((s) => s.meta && s.meta.isDone).map((s) => s.id));

  const goalCount = new Map(countByField(live, "marketingGoalId").map((x) => [x.id, x.count]));
  const pillarCount = new Map(countByField(live, "contentPillarId").map((x) => [x.id, x.count]));
  const publishedByGoal = (gid: string) => live.filter((c) => c.marketingGoalId === gid && c.statusId && doneIds.has(c.statusId)).length;

  const channelCount = new Map<string, number>();
  for (const c of live) for (const id of c.channelIds ?? []) channelCount.set(id, (channelCount.get(id) ?? 0) + 1);

  const total = live.length;
  const publishedTotal = live.filter((c) => c.statusId && doneIds.has(c.statusId)).length;
  const maxGoal = Math.max(1, ...goals.map((g) => goalCount.get(g.id) ?? 0));
  const maxPillar = Math.max(1, ...pillars.map((p) => pillarCount.get(p.id) ?? 0));
  const avgCraft = total ? Math.round((live.reduce((s, c) => s + craftFilled(c), 0) / total / 13) * 100) : 0;
  const goalsCovered = goals.filter((g) => (goalCount.get(g.id) ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Where are we — top progress strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:bg-surface">
          <p className="text-[11px] text-muted">คอนเทนต์ทั้งหมด</p>
          <p className="mt-0.5 text-2xl font-black text-foreground">{total}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:bg-surface">
          <p className="text-[11px] text-muted">ลงแล้ว</p>
          <p className="mt-0.5 text-2xl font-black text-green-700">{publishedTotal}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:bg-surface">
          <p className="text-[11px] text-muted">เป้าหมายที่มีคอนเทนต์</p>
          <p className="mt-0.5 text-2xl font-black text-primary-700">{goalsCovered}/{goals.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:bg-surface">
          <p className="text-[11px] text-muted">องค์ประกอบครบเฉลี่ย</p>
          <p className="mt-0.5 text-2xl font-black text-foreground">{avgCraft}%</p>
        </div>
      </div>

      {/* The plan flow */}
      <SectionCard title="ลูปการตลาด Pacred — เราทำคอนเทนต์ตามนี้">
        <div className="flex flex-wrap items-stretch gap-2">
          {FLOW.map((s, i) => {
            const I = s.icon;
            return (
              <div key={s.n} className="flex items-center gap-2">
                <div className="flex min-w-[150px] flex-1 items-start gap-2 rounded-xl border border-border bg-primary-50/30 p-2.5 dark:bg-primary-900/10">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white"><I className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-foreground">{s.n}. {s.title}</p>
                    <p className="text-[11px] leading-snug text-muted">{s.desc}</p>
                  </div>
                </div>
                {i < FLOW.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted sm:block" />}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Goals coverage */}
      <SectionCard
        title={<span className="inline-flex items-center gap-1.5"><Target className="h-4 w-4 text-primary-600" /> เป้าหมายการตลาด (เราอยู่จุดไหน)</span>}
        actions={<ManageBtn label="จัดการเป้าหมาย" onClick={() => onGoSettings("marketingGoal")} />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {goals.map((g) => {
            const cnt = goalCount.get(g.id) ?? 0;
            const pub = publishedByGoal(g.id);
            return (
              <div key={g.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />{g.name}</span>
                  <span className="text-[12px] text-muted">{cnt} ชิ้น · ลงแล้ว {pub}</span>
                </div>
                {g.description && <p className="mt-1 text-[11px] leading-snug text-muted">{g.description}</p>}
                <div className="mt-2"><Bar value={cnt} max={maxGoal} color={g.color} /></div>
                {cnt === 0 && <p className="mt-1 text-[11px] font-medium text-orange-600">⚠ ยังไม่มีคอนเทนต์เพื่อเป้าหมายนี้</p>}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Pillars coverage */}
      <SectionCard
        title={<span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4 text-primary-600" /> เสาหลักคอนเทนต์ (Pillar)</span>}
        actions={<ManageBtn label="จัดการเสาหลัก" onClick={() => onGoSettings("contentPillar")} />}
      >
        <div className="space-y-1.5">
          {pillars.map((p) => {
            const cnt = pillarCount.get(p.id) ?? 0;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-[12px] font-medium text-foreground" title={p.description}>{p.name}</span>
                <div className="flex-1"><Bar value={cnt} max={maxPillar} color={p.color} /></div>
                <span className="w-10 shrink-0 text-right text-[12px] font-semibold text-foreground">{cnt}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Channels */}
      <SectionCard
        title={<span className="inline-flex items-center gap-1.5"><Share2 className="h-4 w-4 text-primary-600" /> ช่องทางขยายผล (ใช้ไปแล้วแค่ไหน)</span>}
        actions={<ManageBtn label="จัดการช่องทาง" onClick={() => onGoSettings("channel")} />}
      >
        <div className="flex flex-wrap gap-1.5">
          {channels.map((ch) => {
            const cnt = channelCount.get(ch.id) ?? 0;
            return <Tag key={ch.id} color={cnt > 0 ? ch.color : "#cbd5e1"} label={`${ch.name} · ${cnt}`} />;
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">ระบบขยายผล: ค้นหา (SEO/Local/AI) · เร่งโต (Ads/Remarketing) · ภายนอก (Backlink/PR/Influencer/Podcast) · ลูกค้าเก่า (CRM/Broadcast/Referral/Loyalty)</p>
      </SectionCard>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Craft reference */}
        <SectionCard title={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary-600" /> องค์ประกอบคอนเทนต์ (เช็กลิสต์)</span>}>
          <div className="flex flex-wrap gap-1.5">
            {CRAFT_ELEMENTS.map((e) => <span key={e} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground">{e}</span>)}
          </div>
          <p className="mt-2 text-[11px] text-muted">เฉลี่ยคอนเทนต์ใส่องค์ประกอบครบ {avgCraft}% — ใส่ครบยิ่งคอนเทนต์แข็งแรง</p>
        </SectionCard>

        {/* Metric by goal */}
        <SectionCard title={<span className="inline-flex items-center gap-1.5"><BarChart3 className="h-4 w-4 text-primary-600" /> วัดผลตามเป้าหมาย</span>}>
          <div className="space-y-1">
            {METRIC_REF.map(([goal, metrics]) => (
              <div key={goal} className="flex items-baseline justify-between gap-2 border-b border-border py-1 last:border-0">
                <span className="shrink-0 text-[12px] font-medium text-foreground">{goal}</span>
                <span className="text-right text-[11px] text-muted">{metrics}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Team */}
        <SectionCard title={<span className="inline-flex items-center gap-1.5"><Users2 className="h-4 w-4 text-primary-600" /> ทีม &amp; หน้าที่ <span className="text-[11px] font-normal text-muted">(จาก admin ในระบบ)</span></span>}>
          <ul className="space-y-1.5">
            {users.length === 0 && <li className="text-[12px] text-muted">ยังไม่มีรายชื่อทีม — เพิ่ม admin ที่ /admin/admins</li>}
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: userColor(u.id) }}>{u.name.charAt(0)}</span>
                <span className="text-[13px] font-medium text-foreground">{u.name}</span>
                <span className="truncate text-[11px] text-muted">{u.role ?? ""}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Service roadmap */}
        <SectionCard
          title={<span className="inline-flex items-center gap-1.5"><Rocket className="h-4 w-4 text-primary-600" /> บริการ & โรดแมป</span>}
          actions={<ManageBtn label="จัดการบริการ" onClick={() => onGoSettings("service")} />}
        >
          <div className="flex flex-wrap gap-1.5">
            {services.map((s) => <Tag key={s.id} color={s.color} label={s.name} />)}
          </div>
          <p className="mt-2 text-[11px] font-semibold text-foreground">ทีมที่ต้องมี (ขยายบริการ):</p>
          <ul className="mt-0.5 space-y-0.5">
            {NEXT_TEAMS.map((t) => <li key={t} className="text-[11px] text-muted">• {t}</li>)}
          </ul>
        </SectionCard>
      </div>

      {/* CTA */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 p-4 dark:bg-primary-900/10">
        <div className="inline-flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary-600" />
          <p className="text-[13px] font-medium text-foreground">พร้อมลุยตามแผนแล้ว? เริ่มจากเป้าหมายที่ยังไม่มีคอนเทนต์</p>
        </div>
        <button type="button" onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-700">
          <Plus className="h-4 w-4" /> สร้างคอนเทนต์
        </button>
      </div>
    </div>
  );
}
