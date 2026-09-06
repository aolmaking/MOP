# setup-fleet.ps1 — MOP 14-day fleet provisioning (idempotent)
# Usage:  powershell -ExecutionPolicy Bypass -File .\setup-fleet.ps1 [-Fleet C:\mop-fleet]
param([string]$Fleet = "C:\mop-fleet")
$ErrorActionPreference = 'Stop'
$Repo     = Join-Path $Fleet 'repo'
$Origin   = 'https://github.com/aolmaking/MOP.git'
$PgUser   = 'mop_dev'; $PgPass = 'mop_dev_secret'
$Dbs      = @('mop_dev_int','mop_test_w3','mop_test_w2')

function Run($cmd) { Write-Host ">> $cmd" -ForegroundColor Cyan; Invoke-Expression $cmd; if ($LASTEXITCODE -ne 0) { throw "FAILED: $cmd" } }

# 0. Preflight
New-Item -ItemType Directory -Force -Path $Fleet | Out-Null
foreach ($tool in 'git','node','docker') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing tool: $tool" }
}

# 1. Canonical clone
if (-not (Test-Path $Repo)) { Run "git clone $Origin `"$Repo`"" }
Run "git -C `"$Repo`" config safe.directory `"$Repo`""
Run "git -C `"$Repo`" fetch origin"

# 2-3. Worktrees + branches (create only if missing)
if (-not (Test-Path "$Fleet\w-int")) { Run "git -C `"$Repo`" worktree add `"$Fleet\w-int`" -b develop origin/main" }
if (-not (Test-Path "$Fleet\w-a3"))  { Run "git -C `"$Repo`" worktree add `"$Fleet\w-a3`"  -b track/a3-backend origin/main" }
# Seed Codex branch (ignore failure if it already exists remotely)
Run "git -C `"$Repo`" push origin main:refs/heads/track/a2-frontend" 2>$null

# 4. Databases (single Postgres container from repo compose)
Push-Location $Repo
Run "docker compose up -d"
Pop-Location
$pgContainer = (docker ps --format '{{.Names}}' | Where-Object { $_ -match 'postgres' } | Select-Object -First 1)
if (-not $pgContainer) { throw 'No postgres container running' }
foreach ($db in $Dbs) {
  $exists = docker exec $pgContainer psql -U $PgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
  if ($exists -ne '1') { Run "docker exec $pgContainer psql -U $PgUser -d postgres -c `"CREATE DATABASE $db`"" }
  else { Write-Host "DB exists: $db" }
}

# 5. Per-worktree envs (files are gitignored)
@{
  "$Fleet\w-int" = "postgresql://${PgUser}:${PgPass}@localhost:5432/mop_dev_int?schema=public"
  "$Fleet\w-a3"  = "postgresql://${PgUser}:${PgPass}@localhost:5432/mop_test_w3?schema=public"
}.GetEnumerator() | ForEach-Object {
  Set-Content -Path (Join-Path $_.Key '.env') -Value "DATABASE_URL=$($_.Value)" -Encoding ascii
}

# 6. Install + shared build + Prisma client per primary-machine worktree
$env:CI = 'true'   # avoids the interactive pnpm prompt trap documented in CLAUDE.md
foreach ($wt in "$Fleet\w-int", "$Fleet\w-a3") {
  Push-Location $wt
  Run 'corepack pnpm install'
  Run 'corepack pnpm --filter @mop/shared run build'
  Run 'corepack pnpm db:generate'
  Run 'corepack pnpm db:deploy'   # applies migration chain to THIS worktree's DB via its .env
  Pop-Location
}

# 7. Board seed from the repo's own day1 package
$board = Join-Path $Fleet 'board'
New-Item -ItemType Directory -Force -Path (Join-Path $board 'docs') | Out-Null
foreach ($d in 'tasks','claims','status','blockers','reviews','inbox','checkpoints','runs','logs') {
  New-Item -ItemType Directory -Force -Path (Join-Path $board $d) | Out-Null
}
Copy-Item "$Repo\docs\14-day-launch\day1\CONTRACTS-v0.md"      "$board\contracts.md"      -Force
Copy-Item "$Repo\docs\14-day-launch\day1\WAVE-1-TASK-CARDS.md" "$board\current-wave.md"   -Force
Copy-Item "$Repo\docs\14-DAY-LAUNCH-SCOPE.md"                  "$board\master-plan-ref.md"-Force
Copy-Item "$Repo\docs\14-day-launch\DETAILED-EXECUTION-PLAN.md"$board\docs\               -Force
Copy-Item "$Repo\docs\14-day-launch\INVENTORY-EXECUTION-MAP.md"$board\docs\               -Force
Set-Content "$board\decisions.md" @"
# Decision ledger (append-only)
D-001 APPROVED: Strategy B quick-service vertical; Inventory first-class; BILLING=EXTERNAL.
D-002 APPROVED: Agent order swap — Claude=integrator/infra, ox-alpha=backend/domain, Codex=frontend.
D-003 APPROVED: Contracts v0 frozen (contracts.md). Amendments require entry here.
D-004 PRE-AUTHORIZED: Reuse existing permission keys for new endpoints unless manifest addition is approved here.
D-005 PRE-AUTHORIZED: Honesty Harness verdict outranks agent opinions.
"@ -Encoding utf8

Write-Host ''
Write-Host 'Fleet ready:' $Fleet
Write-Host 'Next (manual): start coordinator + A1 in w-int + A3 in w-a3; send Codex its brief.'
