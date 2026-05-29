#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# เดฟ resume — Project Lead / Integrator
# ─────────────────────────────────────────────────────────────
# Resume Claude Code session ที่บ้าน · หรือเครื่องใหม่ · หรือ session ใหม่
# Usage:  bash scripts/setup-dave.sh
# ─────────────────────────────────────────────────────────────

set -e

echo "🟢 เดฟ resume — Project Lead / Integrator"
echo ""
echo "🗺  2-Repo architecture (post-2026-05-28 ดึก-2):"
echo "   • pacred-web         → main + dave-pacred + InwPond007 + podeng"
echo "   • pacred-admin-next  → main + admin                              ← NEW"
echo ""

# ─── 1. pacred-web sync ───
echo "🟢 (1/4) pacred-web sync (worktree)..."
git fetch origin --prune

# show branch state
echo "    Branch state:"
git rev-list --left-right --count HEAD...origin/main 2>/dev/null | awk '{printf "      HEAD vs origin/main: %s ahead / %s behind\n", $1, $2}'
git rev-list --left-right --count origin/main...origin/dave-pacred 2>/dev/null | awk '{printf "      main vs dave-pacred: %s/%s (ควร 0/0)\n", $1, $2}'
git rev-list --left-right --count origin/main...origin/InwPond007 2>/dev/null | awk '{printf "      main vs InwPond007: %s/%s (ปอน's lane)\n", $1, $2}'
git rev-list --left-right --count origin/main...origin/Poom-pacred 2>/dev/null | awk '{printf "      main vs Poom-pacred: %s/%s (ภูม dormant — ย้ายไป pacred-admin-next แล้ว)\n", $1, $2}'
echo ""

# ─── 2. pacred-admin-next sync ───
echo "🟢 (2/4) pacred-admin-next sync (sibling clone)..."
ADMIN_REPO="${PACRED_ADMIN_REPO:-../../../../pacred-admin-next}"
if [ ! -d "$ADMIN_REPO/.git" ]; then
  ADMIN_REPO="$HOME/pacred-admin-next"
fi
if [ ! -d "$ADMIN_REPO/.git" ]; then
  ADMIN_REPO="/c/Users/Admin/pacred-admin-next"
fi

if [ -d "$ADMIN_REPO/.git" ]; then
  echo "    Found at: $ADMIN_REPO"
  git -C "$ADMIN_REPO" fetch origin --prune
  echo "    Branch state:"
  git -C "$ADMIN_REPO" rev-list --left-right --count origin/main...origin/admin 2>/dev/null | awk '{printf "      main vs admin: %s/%s (ภูม's lane)\n", $1, $2}'
else
  echo "    ⚠️  ไม่เจอ pacred-admin-next — clone ก่อน:"
  echo "       cd \$HOME (หรือ C:\\Users\\Admin)"
  echo "       git clone https://github.com/pacred-co/pacred-admin-next"
fi
echo ""

# ─── 3. CLAUDE.md briefing ───
echo "🟢 (3/4) เปิด docs สำคัญ:"
echo "    • head -120 CLAUDE.md                                          # latest direction"
echo "    • cat docs/team-2026-05-28-2repo-workflow.md                   # 2-repo workflow"
echo "    • cat docs/audit/poom-wave-25-merge-audit-2026-05-28.md        # surgical-merge playbook"
echo "    • cat docs/audit/fidelity-auth-screens-2026-05-28.md           # 4 LOAD-BEARING gaps"
echo "    • ls docs/audit/b4-click-through-cluster-*.md                  # 10 P0 + 33 P1 audit"
echo ""

# ─── 4. Dev servers ───
echo "🟢 (4/4) Dev servers (เลือกตามที่ทำ):"
echo "    # pacred-web (port 3000)"
echo "    cd pacred-web && git checkout dave-pacred && pnpm dev"
echo ""
echo "    # pacred-admin-next (port 3001)"
echo "    cd \$HOME/pacred-admin-next && git checkout admin && pnpm dev --port 3001"
echo ""

echo "─────────────────────────────────────────"
echo "✅ Resume เสร็จ"
echo "─────────────────────────────────────────"
echo ""
echo "🎯 Pickup options (ดู CLAUDE.md top section):"
echo "   A. Soft-launch sprint (8-11 วัน · ปลาย 5-8 มิย.):"
echo "      • 3 BIG P0 cluster D (search rewrite + 5 reports + containers-hs)"
echo "      • 4 LOAD-BEARING fidelity gaps (login remember-me + register channel=8 + forgot-password)"
echo "      • ก๊อต coord: S3 rotate + CRON_SECRET + API switchover"
echo ""
echo "   B. ภูม coordination:"
echo "      • Pull cross-repo migrations (pacred-web → pacred-admin-next types regen)"
echo "      • Review ภูม's admin pages 1:1 (Pacred infra alignment check)"
echo ""
echo "   C. P1 backlog (33 items) from B-4 audit"
echo "      • docs/audit/b4-click-through-cluster-{a,b,c,d}-2026-05-28.md"
echo ""
echo "   D. camelCase batch 2b (tb_forwarder ~177 renames · page-by-page approach)"
echo ""
echo "💡 Resume command for Claude Code (พิมพ์ใน new session):"
cat <<'PROMPT'

   "resume เดฟ session · 2-repo architecture · main = a9482d71+ · pacred-admin-next/admin = ก๊อต baseline
    ปอน lane: pacred-web/InwPond007 (member portal)
    ภูม lane: pacred-admin-next/admin (246 admin pages 1:1)
    pickup: <choose A/B/C/D from setup-dave.sh output>"

PROMPT
