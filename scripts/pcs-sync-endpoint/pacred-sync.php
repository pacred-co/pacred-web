<?php
/**
 * pacred-sync.php — Read-only delta endpoint for Pacred (Next.js) to pull
 * recent `tb_forwarder` changes from this PCS server.
 *
 * Deploy location:  pcscargo.com/api/pacred-sync.php
 * Local file path:  /home/<cpanel-user>/public_html/api/pacred-sync.php
 *
 * Pacred Vercel cron (every 10 min) calls:
 *   GET https://pcscargo.com/api/pacred-sync.php?since=<ISO>&limit=500
 *   Header: X-Pacred-Token: <token>
 *
 * Response (200):
 *   { ok: true, now: "<ISO>", since: "<ISO>", count: <int>, rows: [<row>, ...] }
 *
 * Error (401/500):
 *   { ok: false, error: "<message>" }
 *
 * Read-only — no UPDATE / INSERT / DELETE.
 * Token stays server-side; same token must be set in Vercel env as
 * PCS_SYNC_TOKEN.
 *
 * Version: 1.0  |  2026-06-02
 */

// ──────────────────────────────────────────────────────────────
// 1. Config
// ──────────────────────────────────────────────────────────────

// SHARED TOKEN — must match the value set as PCS_SYNC_TOKEN in Vercel.
// Generate a strong random one (≥ 32 chars). Example:
//   php -r "echo bin2hex(random_bytes(32));"
// then paste below + paste same value in Vercel.
//
// SECURITY: do not commit this file with a real token to any public repo.
// Edit the line below before uploading to the PCS server.
$PACRED_SYNC_TOKEN = 'REPLACE_ME_BEFORE_UPLOAD';

// DB credentials — read from the same place legacy PCS does.
require_once __DIR__ . '/../member/config/config.inc.php';
// After this, $conn (mysqli) is available + utf8 + Asia/Bangkok TZ.

// ──────────────────────────────────────────────────────────────
// 2. Output helpers
// ──────────────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

function out_error(int $http, string $msg): void {
    http_response_code($http);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ──────────────────────────────────────────────────────────────
// 3. Auth
// ──────────────────────────────────────────────────────────────

$incomingToken = $_SERVER['HTTP_X_PACRED_TOKEN'] ?? '';
if (!is_string($incomingToken) || $incomingToken === '') {
    out_error(401, 'missing X-Pacred-Token header');
}
if (!hash_equals($PACRED_SYNC_TOKEN, $incomingToken)) {
    out_error(401, 'invalid token');
}
if ($PACRED_SYNC_TOKEN === 'REPLACE_ME_BEFORE_UPLOAD') {
    out_error(500, 'token not configured on PCS server');
}

// ──────────────────────────────────────────────────────────────
// 4. Input validation
// ──────────────────────────────────────────────────────────────

$sinceRaw = $_GET['since'] ?? '';
$limitRaw = $_GET['limit'] ?? '500';

// Validate `since` — must be a parseable ISO date.
// We accept either "2026-06-02T15:20:00+07:00" or "2026-06-02 15:20:00".
$sinceTs = false;
if (is_string($sinceRaw) && $sinceRaw !== '') {
    $sinceTs = strtotime($sinceRaw);
}
if ($sinceTs === false) {
    // First-run safety: default to 24 hours ago.
    $sinceTs = time() - 86400;
}
$sinceMysql = date('Y-m-d H:i:s', $sinceTs);

// Validate `limit` — clamp to [1, 2000].
$limit = (int) $limitRaw;
if ($limit < 1)    $limit = 500;
if ($limit > 2000) $limit = 2000;

// ──────────────────────────────────────────────────────────────
// 5. Query — recent tb_forwarder changes
// ──────────────────────────────────────────────────────────────

// SAFETY: only SELECT. We touch a narrow column set — exactly what Pacred
// merge.ts expects. No PII (no userid/email/phone leaked beyond what
// Pacred already has).
//
// "Recently changed" detection: PCS doesn't have a single updated_at
// column, so we OR-fold the status-transition timestamps + fdate. This
// catches:
//   - new orders (fdate)
//   - status transitions 3→7 (fdatestatus3..7)
//   - container close (fdatecontainerclose)
// Staff manual cabinet/driver edits don't stamp a timestamp directly, but
// they almost always coincide with a fstatus transition (so picked up by
// fdatestatusN). For paranoid catch-up, the cron initially sweeps the
// last 24 hours.
$sinceEsc = mysqli_real_escape_string($conn, $sinceMysql);

$sql = "
    SELECT
        id,
        ftrackingchn,
        fcabinetnumber,
        fstatus,
        DATE_FORMAT(fdate,               '%Y-%m-%d %H:%i:%s') AS fdate,
        DATE_FORMAT(fdatestatus3,        '%Y-%m-%d %H:%i:%s') AS fdatestatus3,
        DATE_FORMAT(fdatestatus4,        '%Y-%m-%d %H:%i:%s') AS fdatestatus4,
        DATE_FORMAT(fdatestatus5,        '%Y-%m-%d %H:%i:%s') AS fdatestatus5,
        DATE_FORMAT(fdatestatus6,        '%Y-%m-%d %H:%i:%s') AS fdatestatus6,
        DATE_FORMAT(fdatestatus7,        '%Y-%m-%d %H:%i:%s') AS fdatestatus7,
        DATE_FORMAT(fdatecontainerclose, '%Y-%m-%d %H:%i:%s') AS fdatecontainerclose,
        fdriverid,
        fnotedriver,
        ftrackingth,
        fweight,
        fvolume,
        famount,
        fwarehousename,
        adminidupdate,
        DATE_FORMAT(
            GREATEST(
                COALESCE(fdate,               '1970-01-01'),
                COALESCE(fdatestatus3,        '1970-01-01'),
                COALESCE(fdatestatus4,        '1970-01-01'),
                COALESCE(fdatestatus5,        '1970-01-01'),
                COALESCE(fdatestatus6,        '1970-01-01'),
                COALESCE(fdatestatus7,        '1970-01-01'),
                COALESCE(fdatecontainerclose, '1970-01-01')
            ),
            '%Y-%m-%d %H:%i:%s'
        ) AS updated_at_pcs
    FROM tb_forwarder
    WHERE
        fdate               >= '$sinceEsc'
        OR fdatestatus3        >= '$sinceEsc'
        OR fdatestatus4        >= '$sinceEsc'
        OR fdatestatus5        >= '$sinceEsc'
        OR fdatestatus6        >= '$sinceEsc'
        OR fdatestatus7        >= '$sinceEsc'
        OR fdatecontainerclose >= '$sinceEsc'
    ORDER BY updated_at_pcs ASC
    LIMIT $limit
";

$result = $conn->query($sql);
if ($result === false) {
    out_error(500, 'query failed: ' . $conn->error);
}

$rows = [];
while ($r = $result->fetch_assoc()) {
    // Normalise numeric strings (PCS returns these as strings).
    $rows[] = [
        'id'                    => (int) $r['id'],
        'ftrackingchn'          => $r['ftrackingchn'],
        'fcabinetnumber'        => $r['fcabinetnumber'],
        'fstatus'               => $r['fstatus'],
        'fdate'                 => $r['fdate'],
        'fdatestatus3'          => $r['fdatestatus3'],
        'fdatestatus4'          => $r['fdatestatus4'],
        'fdatestatus5'          => $r['fdatestatus5'],
        'fdatestatus6'          => $r['fdatestatus6'],
        'fdatestatus7'          => $r['fdatestatus7'],
        'fdatecontainerclose'   => $r['fdatecontainerclose'],
        'fdriverid'             => $r['fdriverid'],
        'fnotedriver'           => $r['fnotedriver'],
        'ftrackingth'           => $r['ftrackingth'],
        'fweight'               => $r['fweight']  !== null ? (float) $r['fweight']  : null,
        'fvolume'               => $r['fvolume']  !== null ? (float) $r['fvolume']  : null,
        'famount'               => $r['famount']  !== null ? (int)   $r['famount']  : null,
        'fwarehousename'        => $r['fwarehousename'],
        'adminidupdate'         => $r['adminidupdate'],
        'updated_at_pcs'        => $r['updated_at_pcs'],
    ];
}

// ──────────────────────────────────────────────────────────────
// 6. Respond
// ──────────────────────────────────────────────────────────────

$nowIso = date('Y-m-d\TH:i:sP'); // ISO 8601 with TZ offset
echo json_encode([
    'ok'    => true,
    'now'   => $nowIso,
    'since' => date('Y-m-d\TH:i:sP', $sinceTs),
    'count' => count($rows),
    'rows'  => $rows,
], JSON_UNESCAPED_UNICODE);
