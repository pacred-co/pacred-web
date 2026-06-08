# 👥 Pacred — Team & Permissions

> **CANONICAL** — single source of truth for roles, branches, and merge policy.
> ทุกไฟล์ MD ที่กล่าวถึง team/role/branch ต้อง link มาที่นี่ ห้าม duplicate

Last updated: 2026-06-09 — team & branch model clarified (4 contributors · current branch mapping · the owner is not a code contributor).

---

## 0. The team — four contributors + the owner

Pacred's codebase is built by **four** contributors. The owner sets direction and reviews the output; he does not commit code.

| | Role | Branch |
|---|---|---|
| **เดฟ** (dave) | Project Lead & Integrator — owns the integration branch, merges everyone's work, gates the release to production. Executes the build on the owner's behalf. | `dave-pacred` |
| **ภูม** (Poom) | Backend · Admin back-office · Accounting / PEAK | `Poom-pacred` |
| **ปอน** (podeng) | Frontend · Customer-portal UI · SEO / Marketing | `InwPond007` |
| **ก๊อต** (got) | Senior Advisor & Production Watcher — reviews `main` production alongside เดฟ and takes on delegated tasks (partner APIs, infra, releases). | `main` review + assigned |

**Owner — founder & CEO.** Sets the product direction, reviews output, and makes the business calls. He is **not** a code contributor; เดฟ is his working counterpart on the codebase, and the single live integration branch is `dave-pacred`.

> **Naming note for sync hand-offs.** Because เดฟ works on the owner's behalf, pull/sync hand-offs between contributors can blur who is being addressed. For the record: the only code contributors are the four above, and `dave-pacred` is the one integration branch — don't treat any other name as a separate committer.

---

## 1. Roles & scope

| คน | บทบาท | Branch | สโคปงาน | สิทธิ์ main |
|---|---|---|---|---|
| **เดฟ** | Project Lead / Integrator | `dave-pacred` | integrate all branches · customer-backend + cross-cutting work · gate + release to `main` | ✅ release gate (on owner's go) |
| **ภูม** | Backend / Admin / Accounting | `Poom-pacred` | admin back-office · accounting (PEAK) · advanced backend & workflows | ❌ own branch only → เดฟ integrates |
| **ปอน** | Frontend / UI / SEO | `InwPond007` | landing · public site · customer-portal UI · brand assets · i18n · SEO | ❌ own branch only → เดฟ integrates |
| **ก๊อต** | Senior Advisor / Production Watcher | `main` review + assigned | review · ADRs · partner integrations · infra · delegated tasks | ✅ release gate with เดฟ |

### Scope boundaries
- ✋ **ปอน** focuses the customer-visible frontend; coordinate with เดฟ before touching `actions/`, `lib/`, `supabase/migrations/`, `app/api/`.
- ✋ **ภูม** focuses backend/admin/accounting; if touching `(protected)/*` (customer portal), coordinate with เดฟ first.
- ✋ **ก๊อต ↔ เดฟ** coordinate on admin/infra/partner routes so production work doesn't collide.
- ✋ **Lead-only files** (เดฟ / ก๊อต): `CLAUDE.md`, `AGENTS.md`, `docs/team.md`, `docs/conventions.md`, `docs/env.md`, `package.json`, `.github/`, `next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json`.

ถ้าจำเป็นต้องข้ามขอบเขต — ประสานกับเดฟก่อน

---

## 2. Branch policy (updated 2026-06-09)

| Branch | Owner | Purpose | Status |
|---|---|---|---|
| `main` | release gate (เดฟ + ก๊อต) | Production. Vercel auto-deploys. Advances only on the owner's go. | 🟢 live |
| `dave-pacred` | เดฟ | **The single integration branch.** Everyone's work is merged here; gated, then released to `main`. | 🟢 active |
| `Poom-pacred` | ภูม | Backend / admin / accounting lane → integrated into `dave-pacred` by เดฟ | 🟢 active |
| `InwPond007` | ปอน | Frontend / customer-portal UI / SEO lane → integrated into `dave-pacred` by เดฟ | 🟢 active |
| `claude/*` (local) | (auto worktrees) | Internal Claude Code session worktrees — never bound to a remote, don't push | local-only |

**Integration model.** `dave-pacred` is the trunk. ภูม pushes `Poom-pacred`, ปอน pushes `InwPond007`; เดฟ merges both into `dave-pacred`, runs the gate, and (on the owner's go) promotes `dave-pacred → main`. After a promote, เดฟ may fast-forward the teammate branches back to `dave-pacred` so everyone shares the same base.

> **Push default (current standing rule).** Hold work at `dave-pacred`. Do **not** push to `main` unless the owner explicitly says so, and do **not** push into teammate branches (`Poom-pacred` / `InwPond007`) routinely — distribute only when there's something they genuinely need to pull. End-of-session distribution to all branches happens only when the owner asks to "close the session".

**Customer data state.** Customer images + storage are in Supabase S3 production; the database is the production project. The legacy `tb_*` schema is canonical; the rebuilt-era twin tables are mostly empty and being retired.

**กฎทอง:**
1. ภูม + ปอน commit/push **เฉพาะ branch ตัวเอง** (`Poom-pacred` / `InwPond007`) — ห้าม push เข้า `main` หรือ `dave-pacred` โดยตรง
2. เมื่อ feature/phase เสร็จ → push branch ตัวเอง → แจ้งเดฟให้ integrate
3. เดฟ merge งานทุกคนเข้า `dave-pacred` → verify (lint + typecheck + build) → release เข้า `main` ตามที่เจ้าของสั่ง
4. ห้าม `--force` push ทุก branch ยกเว้น branch ของตัวเองและรู้ว่าทำอะไรอยู่
5. ห้าม `git reset --hard` หรือลบ commit ของคนอื่น

---

## 3. Daily workflow (CORRECTED 2026-05-15 — เดฟ clarified flow)

> **Pacred branch flow:**
> ```
> ปอน (InwPond007) ──┐
>                    ├──► เดฟ integrates into ► dave-pacred (the trunk)
> ภูม  (Poom-pacred)─┘                              │
>                                                   ▼  (on owner's go)
>                                          เดฟ + ก๊อต release ► main (production)
> ```
> **Key:** teammates pull from `dave-pacred` (NOT `main`). `dave-pacred` = the integration trunk; `main` = production, advanced only on the owner's go.

### ⚠️ 3.0. PUSH FREQUENCY RULE (cost discipline — ก๊อต flag 2026-05-15)

> **ก๊อต บอก:** "ไม่อยากให้อัพ git เยอะเพราะเดี๋ยว Vercel มันคิดตัง"
>
> Vercel ทุก push → trigger build (preview deploy ของ branch + production build ถ้า main). Build minutes + bandwidth + function invocations = $$. รอบ commit เยอะ ไม่จำเป็น = สิ้นเปลือง.

**กฎ:**
- 🟢 **Commit ตามใจชอบ — local-only commits ฟรี** (`git commit` only, no `push`)
- 🔴 **Push เฉพาะ "save point" จริง** — ไม่ใช่ทุก commit:
  - จบ feature 1 task ที่ต้องการ checkpoint
  - จบวัน / ก่อนเลิกงาน / ก่อนเดินทาง
  - ก่อนขอ review จาก เดฟ/ก๊อต
  - ก่อน reboot เครื่อง / change worktree (เพื่อ safety)
- 🎯 **Target rate:** ~1-3 push/day/คน (ไม่ใช่ 10-20)
- 🚫 **อย่า push:**
  - "WIP — let me save in case I lose it" (commit local แทน)
  - "fix typo" / "fix lint" หลัง push ใหญ่ (rebase + amend ก่อน push)
  - Doc-only commit ที่จะตามด้วย code commit ใน 5 นาที (รวม batch ก่อน push)

**Local commit pattern (ทำได้ฟรี):**
```bash
# ระหว่างวัน — commit ละเอียดเท่าที่ต้องการ
git add <files> && git commit -m "wip: working on X"
git add <files> && git commit -m "wip: refactor Y"
git add <files> && git commit -m "fix: bug from Y refactor"

# จบ feature / save point — squash เป็น 1-2 commit ที่ meaningful
git rebase -i origin/<my-branch>   # squash WIP commits

# Push 1 ครั้ง
git push origin <my-branch>
```

**Apply to Claude Code automation:** ทุกคำสั่ง "commit + push" ของผม (Claude) — batch เป็น 1 push ต่อ session ถ้าทำได้. ถ้า session ทำหลาย task → commit หลายตัว แต่ push ครั้งเดียวตอน session จบ.

> **เครื่องช่วยเช็ค:** Vercel dashboard → Settings → Usage. ถ้า build minutes > 80% quota = warning. Pro tier 6,000 min/month = ~50 builds/day at 4 min each.

### น้อง (ปอน + ภูม) — ก่อนเริ่มงานทุกครั้ง

```bash
# Step 1: ดึง dave ล่าสุดมาเป็นต้นทาง (NOT main — main is approved-by-ก๊อต only)
git fetch origin
git checkout dave
git pull --ff-only origin dave    # fast-forward only — dave ห้ามมีงาน local แทรก

# Step 2: กลับ branch ตัวเอง + merge dave เข้ามา
git checkout <my-branch>          # podeng หรือ Poom
git status                        # ต้องสะอาด — ถ้ามีไฟล์ค้างให้ commit/stash ก่อน
git pull origin <my-branch>       # ดึง branch ตัวเองล่าสุด
git merge dave                    # รวม dave เข้ามา (รวม main + งานเพื่อนที่เดฟ approve แล้ว)
git push origin <my-branch>
```

→ **ทำไม dave ไม่ใช่ main?** dave = "เดฟ approved" (เร็ว, integration ทันสมัย). main = "ก๊อต approved" (ช้ากว่า, production-stable). น้อง รับงานจาก dave ทันสมัยกว่า + ไม่กระทบ ก๊อต production cycle.

**แนะนำ:** sync ทุกเช้าก่อนเริ่มงาน หรืออย่างน้อย 1 ครั้ง/วัน

### เดฟ — สำหรับ consolidation work

```bash
# จาก dave branch
git checkout dave
git pull origin dave

# Merge งานน้องเข้า dave (เป็น staging)
git fetch origin
git merge origin/podeng   # ถ้ามีงาน ปอน ใหม่
git merge origin/Poom     # ถ้ามีงาน ภูม ใหม่

# Verify (ดู §5 pre-merge checklist)
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build

# ถ้า pass — push dave (NOT main)
git push origin dave

# 🛑 หยุดที่นี่ — ห้าม push เข้า main เอง
# ก๊อต รับ baton ต่อ → review dave + merge → main
```

### ก๊อต — production approval (operates from main)

```bash
git fetch origin
git checkout main
git pull --ff-only origin main

# ดู diff dave→main เพื่อ review สิ่งที่จะ ship
git log main..origin/dave --oneline
git diff main origin/dave --stat

# ถ้า OK — merge dave → main
git merge --ff-only origin/dave   # หรือ no-ff ถ้าต้องการ merge commit
git push origin main
```

**เกณฑ์ approve (ก๊อต gate):**
- pnpm install + lint + test + build pass บน dave (เดฟ verify ไปแล้ว)
- ดู diff: ไม่มี breaking change ที่ไม่ documented
- ADR ใน `docs/decisions/` ถ้ามี architectural change
- Production safety: migration plan, rollback path documented if applicable

### เดฟ bypass — urgent / hotfix only

```bash
# เฉพาะกรณี: production bug + ก๊อต ไม่ available + bug fix verified
git checkout dave && git pull
# (fix + verify)
git push origin dave
git push origin dave:main      # bypass — ขึ้น main ตรง
```

**กฎ bypass:** หลัง bypass — ส่ง LINE แจ้งก๊อตทันที + เขียน reason ใน commit message + log ใน Part P snapshot. ห้ามใช้บ่อย

---

## 4. Pull files from teammate's branch (without merging via main)

ถ้าจะดึงไฟล์จากเพื่อนก่อนเดฟจะ merge เข้า main:

```bash
git status                           # งานตัวเองต้อง clean (commit/stash ก่อน)
git fetch origin
git checkout <my-branch>
git merge origin/<teammate-branch>   # เช่น origin/dave (ปลอดภัยสุด เพราะ dave มีของทุกคน)
git push origin <my-branch>
```

**กฎ:** ถ้าเจอ conflict → หยุด ถามเดฟ/ก๊อตก่อน อย่าแก้เอง

---

## 5. Code Review & Merge to main

### Workflow
1. ปอน/ภูม push branch ตัวเอง
2. แจ้งเดฟ/ก๊อต (ระบุ feature + acceptance ที่ทำ)
3. เดฟ/ก๊อต pull งานเข้า dave → review code + test
4. ถ้าผ่าน → merge เข้า main
5. ถ้าไม่ผ่าน → comment + ส่งกลับให้แก้บน branch ตัวเอง

### Pre-merge checklist (เดฟ/ก๊อตเช็คก่อน merge)
- [ ] `pnpm install --frozen-lockfile` succeeds
- [ ] `pnpm lint` clean (0 errors, 0 warnings)
- [ ] `pnpm build` succeeds
- [ ] (เมื่อมี) `pnpm test` passes
- [ ] Manual smoke test ใน `pnpm dev` ของ feature ใหม่
- [ ] Audit log + RLS check ถ้าเป็น admin action
- [ ] i18n key มีทั้ง th + en (ถ้า touch UI)

### Branch protection (GitHub UI — ก๊อตตั้ง)
- `main` branch: require PR + 1 review จาก CODEOWNER
- ห้าม force-push เข้า main
- ห้ามลบ main

---

## 6. Decision-making

| ระดับ decision | ใครตัดสิน |
|---|---|
| Code style / file structure | เดฟ (ตาม [`conventions.md`](conventions.md)) |
| Architecture / DB schema | เดฟ + ก๊อต (มี ADR ใน `decisions/`) |
| Feature scope / cut features | เดฟ |
| Third-party service / API | เดฟ + Pacred owner |
| Pacred ecosystem direction | Pacred owner + ก๊อต |
| Phase 2 DPX ERP scope | Pacred owner + เดฟ + ก๊อต |
| Emergency hotfix bypass | เดฟ หรือ ก๊อต |

---

## 7. Communication channels

(บอกเดฟถ้าจะเปลี่ยนช่อง)

- **Daily standup:** LINE group (Pacred Dev)
- **Code review:** GitHub PR comments
- **Architecture discussion:** ADR file ใน `docs/decisions/`
- **Bug report (urgent):** LINE → เดฟ
- **Bug report (regular):** GitHub Issue

---

## 8. Onboarding new dev

ทำตามลำดับ:
1. อ่าน [`docs/HANDBOOK.md`](HANDBOOK.md) — ภาพรวม
2. อ่าน [`docs/team.md`](team.md) (ไฟล์นี้) — role + workflow
3. อ่าน [`docs/conventions.md`](conventions.md) — code style + commit format
4. อ่าน [`docs/env.md`](env.md) — env vars ที่ต้องตั้ง
5. อ่าน [`docs/PORT_PLAN.md`](PORT_PLAN.md) Part O (ของตัวเอง O2/O3/O4) + Part P (current snapshot) — งานที่ assign
6. Setup: clone → `pnpm install` → `cp .env.example .env.local` → fill values → `pnpm dev`
7. Test: เปิด `http://localhost:3000` + เปิด `/admin` (need admin role) — ตรวจว่า boot ok
8. Setup Claude Code (ดู §9 ด้านล่าง) — coordinate กับทีมผ่าน docs canonical
9. แจ้งเดฟ/ก๊อต — ทำ task แรกได้

---

## 9. Async collaboration via Claude Code (NEW 2026-05-14)

> **Pattern:** ทุกคนใช้ Claude Code instance ของตัวเอง — coordinate ผ่าน docs canonical (PORT_PLAN.md, team.md, conventions.md) แทน real-time chat. "Shared brain" = repo docs ใน main

### กฎ pattern นี้

1. **ทุกคนทำงานใน branch ของตัวเอง:**
   - ก๊อต operate จาก `main` (review + production watch)
   - เดฟ operate จาก `dave` (consolidation + integration)
   - ภูม operate จาก `Poom`
   - ปอน operate จาก `podeng`

2. **Docs canonical ใน main = single source of truth:**
   - งาน assign → [`docs/PORT_PLAN.md`](PORT_PLAN.md) Part O2 (ภูม) / O3 (ปอน) / O4 (เดฟ) + Part P (latest snapshot)
   - Role/workflow → ไฟล์นี้ (`docs/team.md`)
   - Code style → [`docs/conventions.md`](conventions.md)
   - Env → [`docs/env.md`](env.md)
   - Architecture → [`docs/architecture.md`](architecture.md) + [`docs/decisions/`](decisions/)

3. **Workflow ผ่าน Claude Code (ทำทุกครั้งที่กลับมาทำงาน):**
   ```
   Step 1 (เปิด Claude Code):
     - cd ไปยัง branch ของตัวเอง (~/pacred-web)
     - Sync main เข้า branch ตัวเองตาม §3
     - บอก Claude Code ว่า "เช็คงานใน main แล้วทำใน <ของตัวเอง>"
   
   Step 2 (Claude Code อ่าน docs):
     - Claude Code อ่าน CLAUDE.md → docs/PORT_PLAN.md Part P (latest snapshot) → ส่วน O2/O3/O4 ของตัวเอง
     - แสดง pending tasks + recent state
   
   Step 3 (ทำงาน):
     - Claude Code ช่วย implement tasks ตาม spec ใน PORT_PLAN
     - Lint+TS check + `git commit` LOCAL — ทำได้บ่อยตามใจ (ฟรี)
     - ทำ task ต่อไปได้เลย โดยยังไม่ push
   
   Step 4 (save point — ปลายวัน / จบ batch / ก่อนขอ review):
     - Squash WIP commits ถ้าเยอะเกิน — keep history clean
     - Claude Code อัพเดท PORT_PLAN Part P snapshot ว่าทำอะไรเสร็จ + ที่เหลือ
     - Commit doc update บน branch ตัวเอง
     - `git push origin <branch>` — 1 ครั้งต่อ session (cost discipline §3.0)
   
   Step 5 (เดฟ integrate to dave):
     - เดฟ pull งานทุกคนเข้า dave → verify → push origin/dave (ไม่ขึ้น main!)
   
   Step 6 (ก๊อต approves to main):
     - ก๊อต fetch + review origin/dave
     - ก๊อต merges dave → main → push origin/main (production deploys)
   ```

4. **Etiquette:**
   - **ห้าม edit docs canonical (PORT_PLAN/team.md/conventions.md/env.md) บน branch ตัวเอง** ยกเว้น Part P snapshot ที่อัพเดทสถานะตัวเอง — ที่อื่นเป็น lead-only
   - ถ้าจะเสนอแก้ doc/architecture → propose ใน PR description หรือสร้าง ADR ใน `docs/decisions/`
   - Tag ในcommit message: `docs(port-plan): <name> Sprint X update — <what changed>` เพื่อให้ค้นย้อนได้
   - ถ้า Claude Code ของคุณบอกอะไรขัดกับ Claude Code ของเพื่อน → ดูว่า main มีอะไรใหม่ที่ตัวเองยัง sync ไม่ทัน

5. **เมื่อขัดกัน / decision ต้องการ:**
   - Tag เดฟ ใน LINE → เดฟ decide หรือ escalate ก๊อต
   - ห้าม Claude Code ของน้องตัดสินใจเรื่อง architectural / scope expansion เอง — ถ้า Claude Code ถาม "ควรทำ X หรือ Y?" → ตอบให้ Claude Code ส่งคำถามมาที่เดฟผ่านการ commit doc proposal

6. **Self-directed mode (NEW 2026-05-14 evening):**
   - **เมื่อไหร่:** task ใน PORT_PLAN.md ที่ marked `Decision? = No` หรือ marked `<name> decide` พร้อม recommended default — ลุยได้เลย ไม่ต้องรอ
   - **เมื่อไหร่ห้าม:** task ที่ marked `Decision? = Pacred owner` / `เดฟ + ก๊อต` หรือ scope expansion (เพิ่ม feature นอกเหนือสเปคของ task) → ห้าม implement
   - **กฎทอง:** ถ้าระหว่างทางเจอเรื่อง trade-off ที่ไม่แน่ใจ → ใช้ default ที่ง่ายกว่า + log decision ใน commit message ใต้ "DECISION:" header (เดฟ/ก๊อต ปรับย้อนหลังได้); อย่าหยุดเพื่อรอ
   - **Hand-off rule:** หลังจบ **batch** ของ tasks (ไม่ใช่ทุก task) — `git push origin <branch>` 1 ครั้ง + commit อัพเดท PORT_PLAN Part P snapshot. ระหว่าง batch — `git commit` local-only ฟรี (ดู §3.0 push frequency rule). ทำหลาย task ครบแล้ว push 1 ครั้งจบ
   - **Trigger limit:** ห้ามทำหลาย task ของ Priority 0 พร้อมกัน (lock contention เสี่ยง schema migration); Priority 1+ ทำคู่ขนานได้

### ทำไม pattern นี้ดี

- **Async-friendly:** ไม่ต้อง online พร้อมกัน — sync state ผ่าน docs ใน main
- **Auditable:** ทุก decision อยู่ใน git history
- **Onboarding cheap:** new dev เปิด Claude Code → docs ใน main ตอบทุกอย่างให้
- **AI-native:** Claude Code instance ของแต่ละคน follow docs เดียวกัน → coordinate convergent โดยไม่ต้อง chat

### ข้อจำกัด

- Docs ต้อง up-to-date — ถ้า Part P snapshot stale → Claude Code จะแนะนำผิด → ทุกคนรับผิดชอบอัพเดท snapshot หลังจบ session
- Real-time emergencies (production down, urgent customer issue) → LINE direct ก่อน Claude Code

---

## 10. Daily Integration Cycle (NEW 2026-05-15 — formalised)

> **Why this section exists:** ทีม 4 คน + Claude Code agents ทำงาน async บน 3 branches (`dave` · `podeng` · `Poom`). ถ้าไม่มี cadence ที่ชัดเจน → branches drift → merge conflicts → ภูม/ปอน ทำงานบน stale code. Section นี้ define cadence + ใครทำอะไรเมื่อไร.

### 10.1 The loop (one full cycle = 1 day)

```
┌─────────────────────────────────────────────────────────────────┐
│  Morning (each role, ~5 min)                                    │
│  1. fetch origin                                                │
│  2. pull `main` into own branch (น้อง pull main; เดฟ pull dave)   │
│  3. resolve any merge conflicts (stop + ask if unsure)          │
│  4. read your brief at docs/briefs/<your-name>.md               │
│  5. work T-* emergency tasks                                    │
│                                                                 │
│  During work (each role)                                        │
│  6. commit local often (per session — 5-15 commits OK)          │
│  7. DON'T push every commit (Vercel cost + churn)               │
│                                                                 │
│  Save-point (1-2× per day per role)                             │
│  8. squash WIP if needed                                        │
│  9. push to OWN branch (origin/podeng / origin/Poom / dave)     │
│ 10. notify เดฟ (LINE / commit-message-as-signal)                 │
│                                                                 │
│  Integration window (เดฟ — at least 1× per day)                  │
│ 11. fetch origin                                                │
│ 12. for each น้อง-branch with new commits:                       │
│      a. git log dave..origin/<branch> --stat — read intent       │
│      b. git merge origin/<branch> into dave                     │
│      c. resolve conflicts (in scope-overlap zones)              │
│ 13. verify gates: pnpm lint + tsc + test:unit + audit:all       │
│ 14. fix any failures (or push back to น้อง if their fault)        │
│ 15. push dave                                                   │
│ 16. push dave→main (เดฟ bypass per §3 — ก๊อต async approves)    │
│ 17. (optional) notify team that main has shipped X commits      │
│                                                                 │
│  Loop back to morning the next day                              │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Who pulls from where

| Role | Pulls from | Pushes to | Reason |
|---|---|---|---|
| ปอน | `main` (not dave — dave drifts faster) | `podeng` only | Stable base. main only ships after เดฟ verify |
| ภูม | `main` | `Poom` only | Same |
| เดฟ | `dave` + integrates `podeng`/`Poom` | `dave` then `dave→main` | Staging + production gate |
| ก๊อต | `main` | `main` (own commits) | Senior advisor + production approver |

### 10.3 What to look for during integration review (เดฟ)

When merging `origin/<น้อง-branch>` into `dave`:

1. **Read every commit message first** — `git log dave..origin/<branch>` — establish intent
2. **Check file-stat scope:** are changes in the role's scope per [`team.md`](team.md) §1.3? If out-of-scope → block + ask
3. **i18n parity:** if `messages/*.json` touched, run `pnpm audit:i18n` after merge (must = th == en count)
4. **Hardcoded values:** scan diff for phone numbers / emails / addresses — should import from `components/seo/site.ts`. If found → flag for L-contact-refactor follow-up (don't block — track in PORT_PLAN)
5. **No backend touch from podeng / no frontend touch from Poom** — boundary violation = revert + ask
6. **Test gates pass:** `pnpm lint` + `pnpm exec tsc --noEmit` + `pnpm test:unit` + `pnpm audit:all`
7. **Smoke-test for emergency P0:** if the change touches a Part T cargo-revenue surface (admin workflow / landing / receipt / checkout) → manually click through once. Other changes = trust the gates.

### 10.4 What "ready to push main" means

Every push from dave→main must satisfy:

- [ ] `pnpm verify` (umbrella: lint + tsc + test:unit + audit:all) — exit 0
- [ ] No `--no-verify`, `--no-gpg-sign`, `--force` flags used in merge
- [ ] All commits in the push have descriptive messages (no "wip" / "fix" alone)
- [ ] If schema migration included → migration is forward-only OR rollback documented
- [ ] If env var added → declared in `.env.example` + documented in `docs/env.md`
- [ ] If new feature → has at least one entry in role brief or PORT_PLAN Part T
- [ ] If Part T task progressed → tick off in `docs/PORT_PLAN.md` Part T2 table

### 10.5 Emergency cadence override (Cargo Revenue Sprint 2026-05-15+)

> ⏸️ **HISTORICAL / INACTIVE** — the Cargo Revenue Sprint emergency ended at the **2026-05-17 production launch**. Normal save-point cadence (§3.0 + §10.1) applies now. Kept below for reference; do not follow it unless a new emergency is explicitly declared.

During emergency:
- น้อง push to own branch **end of each work block** (not just end of day) — เดฟ has more chances to integrate
- เดฟ integrate **2× per day** instead of 1× (morning + evening windows)
- เดฟ push main after each integration window (not just save-point) — แต่ละ push = revenue path advances
- ก๊อต async approve in flight (review after-the-fact during integration cycle)

When emergency cleared (Part T checklist 100%) → revert to 10.1 default cadence.

### 10.6 If something breaks

| Symptom | First action | Escalate to |
|---|---|---|
| Merge conflict in scope-overlap file | Stop, ask owner (e.g., contact-sales.tsx → ปอน) | LINE direct |
| Verify gate fails after merge | `git revert` the merge commit, push back to น้อง for fix | LINE direct |
| Build fails on main | เดฟ bypass force-revert main → previous good commit | ก๊อต post-mortem |
| Test fails intermittently | Don't ignore — add to `docs/PORT_PLAN.md` Part T as flaky-test debt | Track + fix during emergency lull |
| Type error from Next 16 update | Read `node_modules/next/dist/docs/` for new API per AGENTS.md | ก๊อต ADR if API change |

---

**End of team.md** — questions ถามเดฟ
