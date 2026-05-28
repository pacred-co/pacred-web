# Load all generated .sql files into prod Supabase via psql.
# Run after `node _extract.mjs all` has produced the *.sql files.
#
# USAGE:
#   $env:PGPASSWORD = "<the prod postgres password>"
#   ./_load-all.ps1

$ErrorActionPreference = "Stop"

$PG_URL = "postgresql://postgres.yzljakczhwrpbxflnmco@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

if (-not $env:PGPASSWORD) {
  Write-Error "set `$env:PGPASSWORD first"
  exit 1
}

Set-Location $PSScriptRoot

# Smallest first — if one fails the others are unaffected.
foreach ($table in @("tb_history", "tb_history_key", "tb_web_hs")) {
  $files = Get-ChildItem -Filter "$table-part-*.sql" | Sort-Object Name
  foreach ($f in $files) {
    $sizeMB = [math]::Round($f.Length / 1MB, 2)
    Write-Host "=== loading $($f.Name) ($sizeMB MB) ==="
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & psql $PG_URL -v ON_ERROR_STOP=1 -f $f.FullName
    if ($LASTEXITCODE -ne 0) {
      Write-Error "psql failed on $($f.Name) — STOP and investigate"
      exit 1
    }
    Write-Host "    done in $($sw.Elapsed.TotalSeconds) sec"
  }
}

Write-Host ""
Write-Host "All chunks loaded. Now run the sequence resets:"
Write-Host @"

SELECT setval('public.tb_history_id_seq',     (SELECT MAX(id) FROM public.tb_history));
SELECT setval('public.tb_history_key_id_seq', (SELECT MAX(id) FROM public.tb_history_key));
SELECT setval('public.tb_web_hs_id_seq',      (SELECT MAX(id) FROM public.tb_web_hs));
"@
