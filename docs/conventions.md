# 📐 Pacred — Code & Workflow Conventions

> **CANONICAL** — single source of truth for code style, naming, and commit format.

Last updated: 2026-05-18 · See also: [`team.md`](team.md) · [`env.md`](env.md)

---

## 1. Language & Framework

- **Next.js 16.2.6** App Router (server components by default) — see [`/AGENTS.md`](/AGENTS.md) for breaking changes from training data
- **React 19.2.4** — use hooks; no class components
- **TypeScript 5** strict mode — no `any` (use `unknown` + type narrow), no implicit returns
- **Tailwind CSS v4** with `@theme inline` in [`app/globals.css`](/app/globals.css) — no `tailwind.config.js`
- **next-intl ^4.11.1** — i18n via namespace + `messages/{th,en}.json`
- **Zod ^4** — validate every server action input

---

## 2. File & folder structure

```
app/[locale]/
├─ (public)/                  # no auth — landing pages, services, FAQ — ปอน owns
├─ (auth)/                    # login/register/forgot-password — ภูม owns
├─ (protected)/               # customer portal — auth required — ภูม owns
├─ (admin)/admin/             # admin back office — admin role required — ภูม owns
└─ complete-profile/          # auth required, allows incomplete profiles
app/auth/                     # OAuth callback + signout (no locale)
app/api/                      # route handlers

actions/                      # Server Actions ("use server")
├─ <feature>.ts               # customer-facing
└─ admin/<feature>.ts         # admin-only

lib/
├─ auth/, supabase/, sms/, notifications/, china-search/, forwarder/, validators/, utils/
└─ ...

components/
├─ sections/                  # full-width page sections — ปอน owns
├─ ui/                        # primitives — ปอน owns
├─ admin/                     # admin-specific UI — ภูม owns
├─ booking/, knowledge/, icons/  # feature-specific

supabase/migrations/          # numbered NNNN_<name>.sql — lead-only
messages/                     # th.json + en.json — ปอน owns
docs/                         # markdown handbook — lead-only
public/                       # static assets — ปอน owns
```

---

## 3. Naming

| Type | Style | Example |
|---|---|---|
| Files (tsx/ts) | kebab-case | `service-order.ts`, `update-form.tsx` |
| React components | PascalCase | `<ServiceCarousel />`, `<NavBar />` |
| Functions | camelCase | `getCurrentUser`, `addCartItem` |
| Server actions | camelCase + intent verb | `signIn`, `placeServiceOrder`, `adminUpdateForwarder` |
| Types/Interfaces | PascalCase | `ChinaProductDetail`, `CalcResult` |
| Constants | SCREAMING_SNAKE | `BARCODE_FORMATS`, `PAYMENT_DUE_HOURS` |
| DB tables | snake_case plural | `service_orders`, `cart_items` |
| DB columns | snake_case | `total_thb`, `profile_id` |
| Migration files | `NNNN_<topic>.sql` | `0007_wallet.sql`, `0019_hr_recruitment.sql` |
| i18n keys | dotted namespace.camelCase | `nav.home`, `serviceOrder.addedToast` |
| Route paths | kebab-case | `/service-order/add`, `/admin/yuan-payments` |
| Env vars | SCREAMING_SNAKE with prefix | `PACRED_RCGROUP_API_URL`, `THAIBULKSMS_API_KEY` |

---

## 4. Server Action response shape

ทุก server action ต้อง return shape นี้ — never throw to client:

```ts
type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
```

ใช้ `AdminActionResult` (from `actions/admin/common.ts`) สำหรับ admin actions.

**Pattern:**
```ts
"use server";

export async function adminUpdateForwarder(input: Input): Promise<AdminActionResult> {
  // 1. Zod validate
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  // 2. withAdmin wrapper (auth + audit context)
  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // 3. Fetch existing for audit
    const { data: before } = await admin.from("...").select("...").eq("...", id).maybeSingle();
    if (!before) return { ok: false, error: "not_found" };

    // 4. Mutate
    const { error } = await admin.from("...").update({...}).eq("id", id);
    if (error) return { ok: false, error: error.message };

    // 5. Audit log
    await logAdminAction(adminId, "<action>", "<target_type>", id, { before, after: {...} });

    // 6. Customer notification (if applicable)
    void sendNotification(profileId, { category: "...", title: "...", body: "..." });

    // 7. Cache invalidation
    revalidatePath("/admin/...");
    return { ok: true };
  });
}
```

---

## 5. Commit message format

```
<type>(<scope>): <short summary in lowercase>

<optional body — explain why, not what>

<optional footer — breaking changes, refs>

Co-Authored-By: <name> <email>
```

### Types

| Type | When |
|---|---|
| `feat` | New feature visible to user |
| `fix` | Bug fix |
| `docs` | Docs only (MD, comments) |
| `style` | Whitespace/format, no logic change |
| `refactor` | Code restructure, no behavior change |
| `perf` | Performance improvement |
| `test` | Add/fix tests |
| `chore` | Build/deps/config |
| `merge` | Merge commits (always with `--no-ff`) |
| `cleanup` | Remove dead code/files |

### Scopes (common)

`auth`, `profile`, `address`, `wallet`, `cart`, `service-order`, `service-import`, `service-payment`, `forwarder`, `admin`, `i18n`, `seo`, `landing`, `notifications`, `cron`, `build`, `lint`, `plan`, `deps`, `setup`

### Examples ✅

```
feat(auth): add forgot-password OTP flow
fix(admin): close customer approve audit-log gap
docs(plan): add Part N production-readiness audit
chore(deps): bump next 16.2.6 → 16.2.7
merge: pull origin/podeng into dave — i18n Phase 4a
refactor(forwarder): extract rate engine to lib/forwarder/
```

### Examples ❌
```
update                       ← too vague
fixed bug                    ← no scope
feat: Added thing            ← capitalize, past tense, no scope
WIP: half-done thing         ← never WIP on main/dave
```

---

## 6. Branch naming

| Pattern | When | Example |
|---|---|---|
| `main` | production | `main` |
| `dave` / `podeng` / `Poom` | personal working | `Poom` |
| `claude/<slug>` | Claude Code session (auto) | `claude/jolly-taussig-7132d7` |

Don't create new long-lived branches without lead approval.

---

## 7. i18n keys

- Always add BOTH `messages/th.json` AND `messages/en.json` for every key
- Use namespace per page/section: `serviceOrder.*`, `wallet.*`, `nav.*`
- Camelcase keys: `addedToast`, `placeholder` — NOT snake_case or kebab
- Don't hardcode user-visible strings in JSX — use `useTranslations("namespace")` (client) or `getTranslations("namespace")` (server)
- Numbers/dates: `Intl.NumberFormat("th-TH")` and `Intl.DateTimeFormat("th-TH")`
- Currency: format manually as `${amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿` (no built-in THB locale)

---

## 8. Database migration rules

1. ไฟล์ใหม่: `supabase/migrations/NNNN_<topic>.sql` — NNNN = next sequential number
2. ใช้ `create table if not exists`, `create policy ... if not exists`, `alter table add column if not exists`
3. ทุก mutation table ต้องมี RLS policy (customer-owned: `using (profile_id = auth.uid())`; admin: `using (public.is_admin())`)
4. ทุก table ที่จะ join ต้องมี FK constraint
5. ทุก mutation ต้องมี trigger `set_updated_at()`
6. Index ทุก column ที่ใช้ query บ่อย (status, created_at desc, profile_id)
7. รัน migration: ตาม `supabase/migrations/README.md` (Supabase Dashboard → SQL Editor)
8. หลังเพิ่ม migration: อัพเดท `supabase/migrations/README.md` ตาราง

---

## 9. Auth guards

- `await requireAuth()` — protect customer page
- `await requireAdmin([roles])` — protect admin page (`["super"]`, `["ops"]`, `["accounting"]`, `["sales_admin"]`)
- `await getCurrentUserWithProfile()` — get current user data
- Server actions: wrap mutations in `withAdmin([roles], async ({ adminId }) => {...})` from `actions/admin/common.ts`
- ห้ามใช้ `profiles.role` — ใช้ `is_admin()` หรือ query `admins` table เท่านั้น (per ADR-0002)

---

## 10. Comments policy

- ห้ามเขียน comment ที่ describe WHAT (`// loop through items`) — code อ่านได้แล้ว
- เขียน comment เมื่อมีเหตุผล WHY non-obvious (hidden constraint, workaround, subtle invariant)
- ห้ามอ้าง task/PR/issue ใน code comment (rot ง่าย) — เก็บใน commit message
- JSDoc สำหรับ public exports ที่ใช้นอก module เท่านั้น

---

## 11. UI / Style

### 11.0 Mobile-first (อ่านก่อนแตะ customer surface ทุกครั้ง)

ลูกค้า Pacred ส่วนใหญ่เข้าผ่านมือถือ — **design + test ที่ phone viewport ก่อน** แล้วค่อยขยายขึ้น. ห้าม desktop-first.

- **Design + test at a phone viewport FIRST** — 360px (Android ทั่วไป) / 390px (iPhone) — แล้วค่อย scale ขึ้น desktop. ทำกลับด้าน (desktop ก่อน) = layout เพี้ยนบนมือถือ.
- **Tailwind v4 = mobile-first by default:** เขียน utility แบบ **ไม่มี prefix = mobile** แล้วเพิ่ม `sm:` / `md:` / `lg:` สำหรับจอใหญ่ขึ้น — ห้ามทำกลับด้าน (ไม่มี max-width-first).
- **Touch targets ≥ 44px (iOS) / 48px (Android)** สำหรับปุ่ม · ลิงก์ · nav item — `min-h-11 min-w-11` ≈ 44px.
- **Body text ≥ 16px** (`text-base`) — ตัวอักษรเล็กกว่านี้ใน `<input>` ทำให้ iOS zoom-on-focus เด้งเอง.
- **ห้าม horizontal scroll ที่ความกว้างใดๆ** — เลี่ยง fixed pixel width บน layout container; ใช้ `max-w-*` + fluid width (`w-full max-w-md` ไม่ใช่ `w-[420px]`).
- **Primary CTA ต้องอยู่ใน thumb zone** (ครึ่งล่างของ viewport) บนมือถือ — ปุ่มหลักต้องกดถึงด้วยนิ้วโป้ง.
- **Forms:** ตั้ง `type` / `inputMode` ให้มือถือเด้ง keyboard ถูก (`type="tel"` · `type="email"` · `inputMode="numeric"`).
- **Test 3 reference widths ก่อน push** customer surface ใดๆ: **360 · 390 · 1280+**.

📱 Full checklist + รูปแบบ Tailwind ต่อกฎ + pitfalls → [`mobile-first-playbook.md`](mobile-first-playbook.md) (ปอน อ่านก่อนเริ่มงาน frontend).

### 11.1 General

- Theme colors define ใน `@theme inline` ของ `app/globals.css`
- ใช้ Tailwind utility — หลีกเลี่ยง hex hardcode ยกเว้น brand color ของ social provider
- ใช้ `Link` จาก `@/i18n/navigation` แทน `next/link` เสมอ (locale-aware)
- Icons: `lucide-react` (outline style) — ไม่ใช้ Material/Heroicons/อื่น
- Forms: native input + Zod validation ที่ server action; client-side ใช้ `useFormState` หรือ `useTransition`
- Loading state: `useTransition` + disable button + spinner
- Error display: `text-red-600` + border `border-red-200` + bg `bg-red-50`
- Success display: `text-green-700` + similar

---

## 12. Performance / SEO (ปอน scope)

- Public pages ต้องมี `metadata` export — title (50 char), description (155 char), Open Graph
- Pages with NO auth/cookies prerender as static. But a page that renders `<NavBar>` reads cookies → it is dynamic; if it also has `generateStaticParams` it MUST set `export const dynamic = "force-dynamic"` or it 500s in production (`DYNAMIC_SERVER_USAGE` — see [`learnings/nextjs-16-quirks.md`](learnings/nextjs-16-quirks.md))
- Images: ใช้ `next/image` กับ `width`, `height`, `alt` — `priority` สำหรับ above-fold
- `lazy` load all below-fold images
- Lighthouse target: Performance ≥85, SEO 100, Accessibility ≥90, Best Practices ≥90
- ใส่ `sitemap.xml` + `robots.txt` ใน `app/`
- ใส่ structured data (Organization, Service, BreadcrumbList) สำหรับ landing pages

---

## 13. Documentation (.md files)

- **Every `.md` file ≤ 2000 lines — hard cap.** If a file would exceed it, split into a new file (pattern: `docs/PORT_PLAN.md` → archived old parts into `docs/sprints/archive-a-to-n.md`) and cross-link both ways. Agents read docs into a context window — oversized files get truncated mid-content, so anything past the cap is invisible.
- **One canonical home per fact — no duplication.** A piece of information lives in exactly one file; everywhere else links to it. When you edit a doc and spot the same content duplicated in another, delete the copy and leave a link. Dedup what you touch.
- Cross-link generously — every doc that references a concept links to its canonical doc.
- Living docs near the cap (`PORT_PLAN.md` ~1740) — when they approach 2000, archive the oldest sections out before adding new ones.
- See [`/AGENTS.md`](/AGENTS.md) §12 for the agent-behaviour version of this rule.

---

## 14. Pre-deploy verification

- `pnpm verify` + `pnpm build` passing is **necessary, not sufficient** — neither executes a real page render.
- Before any `main`/production deploy: run the **Production smoke gate** — `pnpm build && pnpm start`, then `curl` every new/changed route (must be 200, not 500). Procedure: [`.claude/skills/phase-verify-loop/SKILL.md`](/.claude/skills/phase-verify-loop/SKILL.md) · rationale: [`learnings/ci-and-deploy-gotchas.md`](learnings/ci-and-deploy-gotchas.md).

---

**End of conventions.md** — ถามเดฟถ้าไม่แน่ใจ
