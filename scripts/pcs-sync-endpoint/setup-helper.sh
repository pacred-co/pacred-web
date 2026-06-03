#!/usr/bin/env bash
# pcs-sync-endpoint/setup-helper.sh — one-stop setup for option D
# Generates a fresh PCS_SYNC_TOKEN, patches the local PHP file with it,
# and prints all 3 things ภูม/ก๊อต need to paste.
#
# Usage:  bash scripts/pcs-sync-endpoint/setup-helper.sh
#
# After running:
#   1. Upload `pacred-sync.php` + `.htaccess` via CoreFTP to /public_html/api/
#   2. Run the printed `vercel env add` commands (or paste in Vercel dashboard)
#   3. Paste the printed migration SQL in Supabase SQL Editor

set -euo pipefail
cd "$(dirname "$0")"

TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TOKEN_FILE="../../.pcs-sync-token-$(date +%Y%m%d).txt"

# Patch PHP locally
sed -i "s|REPLACE_ME_BEFORE_UPLOAD|$TOKEN|g" pacred-sync.php

# Save token to gitignored local file
echo "$TOKEN" > "$TOKEN_FILE"

cat <<EOF

╔══════════════════════════════════════════════════════════════════╗
║  PCS↔Pacred Sync — Setup Token Generated                        ║
╠══════════════════════════════════════════════════════════════════╣
║  Token (64 chars · saved to $(basename "$TOKEN_FILE")):
║  $TOKEN
╚══════════════════════════════════════════════════════════════════╝

✅ pacred-sync.php patched with token (ready to upload)

📤 STEP 1 — Upload via CoreFTP:
   - Double-click D:/REALSHITDATAPCS/vps185.nokhosting.com.coreftp
   - Navigate remote → /public_html/api/  (create folder if missing)
   - Drag-upload these 2 files:
       pacred-sync.php
       .htaccess

🌐 STEP 2 — Set Vercel env (paste in dashboard or use CLI):

   Dashboard: https://vercel.com/pacred-co/pacred-web/settings/environment-variables
   - Add  PCS_SYNC_URL    = https://pcscargo.com/api/pacred-sync.php
   - Add  PCS_SYNC_TOKEN  = (the token above)
   - Environment: All (Production / Preview / Development)
   - Save → Vercel auto-redeploys

   OR via CLI (if logged in):
   vercel env add PCS_SYNC_URL production
   vercel env add PCS_SYNC_TOKEN production

🗄  STEP 3 — Apply migration 0135 in Supabase:
   - Open: https://supabase.com/dashboard/project/yzljakczhwrpbxflnmco/sql/new
   - Paste contents of: supabase/migrations/0135_pcs_sync_state.sql
   - Click Run → "Success. No rows returned"

🧪 STEP 4 — Test:
   - https://pacred.co.th/admin/system/pcs-sync
   - Click "Test endpoint" → should return JSON with rows
   - Click "Trigger sync ตอนนี้" → first batch syncs
   - Re-check /admin/forwarders/51994 → cabinet should be 'GZS260530-1' (was 'PR20260530-SEA01')

Total time: ~8 minutes

