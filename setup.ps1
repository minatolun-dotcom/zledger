# Zledger - one-command setup for Windows (native PowerShell / Docker Desktop).
#
# Brings up the full Docker stack (db + api + web, plus backup; scheduler
# optional) from source, creates .env, generates a JWT secret, fixes the
# rclone token mount, waits for the API to be healthy, and (optionally) seeds
# demo data.
#
# Usage (run from the Zledger repo root):
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -NoDemo
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -NoBuild
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -WithScheduler
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Help

[CmdletBinding()]
param(
  [switch]$NoDemo,
  [switch]$NoBuild,
  [switch]$WithScheduler,
  [switch]$Help
)

if ($Help) {
  Get-Content $MyInvocation.MyCommand.Definition | Where-Object { $_ -like '#*' } | ForEach-Object { $_.Substring(1).Trim() }
  exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$BUILD = -not $NoBuild
$DemoPrompt = -not $NoDemo
$SCHEDULER = $WithScheduler

Write-Host "============================================="
Write-Host " Zledger setup"
Write-Host "============================================="

# --- locate docker compose (v2 preferred, v1 fallback) ---
$UseV2 = $false
if (docker compose version 2>$null) { $UseV2 = $true }
elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) { $UseV2 = $false }
else {
  Write-Error "ERROR: neither 'docker compose' (v2) nor 'docker-compose' (v1) was found. Install Docker Desktop first."
  exit 1
}

function Invoke-Compose {
  param([string[]]$ComposeArgs)
  if ($UseV2) { docker compose @ComposeArgs }
  else { docker-compose @ComposeArgs }
}

# --- docker daemon reachable ---
if (-not (docker info 2>$null)) {
  Write-Error "ERROR: Docker daemon is not running. Start Docker Desktop and retry."
  exit 1
}

# --- must be run from the repo root ---
if (-not (Test-Path docker-compose.yml) -or -not (Test-Path .env.example)) {
  Write-Error "ERROR: run setup.ps1 from the Zledger repository root."
  exit 1
}

# --- .env ---
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env from .env.example (edit it to override defaults)."
} else {
  Write-Host ".env already exists; keeping your settings."
}

# --- JWT_SECRET: generate only if missing / placeholder ---
$envLines = Get-Content .env
$updated = $false
$newLines = @()
foreach ($line in $envLines) {
  if ($line -match '^JWT_SECRET=(.*)$') {
    $val = $Matches[1]
    if ($val -like 'change-me*' -or $val -eq '') {
      # generate 48 random bytes -> hex
      $bytes = New-Object byte[] 48
      $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
      $rng.GetBytes($bytes)
      $SECRET = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
      $newLines += "JWT_SECRET=$SECRET"
      $updated = $true
    } else {
      $newLines += $line
    }
  } else {
    $newLines += $line
  }
}
if (-not $updated) { $newLines += "JWT_SECRET=$SECRET" }
$newLines | Set-Content .env -Encoding utf8
if ($updated) { Write-Host "Generated a new JWT_SECRET." }
else { Write-Host "JWT_SECRET already set; leaving it unchanged." }

# --- rclone token: compose bind-mounts a FILE, but it currently may be a dir ---
$TokenPath = "config/rclone/token.json"
if (Test-Path $TokenPath -PathType Container) {
  Write-Host "Removing stray directory config/rclone/token.json (compose expects a file)..."
  Remove-Item $TokenPath -Recurse -Force
}
if (-not (Test-Path $TokenPath)) {
  New-Item -ItemType Directory -Force -Path "config/rclone" | Out-Null
  New-Item -ItemType File -Path $TokenPath | Out-Null
  Write-Host "Created placeholder config/rclone/token.json (Google Drive backup stays disabled)."
}

# --- build + start ---
if ($SCHEDULER) {
  Write-Host "Building and starting Zledger (incl. scheduler profile)..."
  if ($BUILD) { Invoke-Compose up -d --build --profile scheduler } else { Invoke-Compose up -d --no-build --profile scheduler }
} else {
  Write-Host "Building and starting Zledger..."
  if ($BUILD) { Invoke-Compose up -d --build } else { Invoke-Compose up -d --no-build }
}

# --- wait for API health ---
Write-Host "Waiting for the API to become healthy (http://localhost:9090/api/health)..."
$HEALTHY = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:9090/api/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $HEALTHY = $true; Write-Host "API is healthy."; break }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $HEALTHY) {
  Write-Error "ERROR: API did not become healthy in time. Check logs: $(if ($UseV2) { 'docker compose logs api' } else { 'docker-compose logs api' })"
  exit 1
}

# --- demo data ---
$SEED = $false
if ($DemoPrompt) {
  $ans = Read-Host "Seed demo data (5 companies + sample vouchers)? [Y/n]"
  if ($ans -match '^(|y|Y|yes|YES)$') { $SEED = $true }
}

if ($SEED) {
  Write-Host "Seeding demo data (this can take a minute)..."
  Invoke-Compose exec -T api python -m scripts.seed_demo_data
  Write-Host "Demo data seeded."
} else {
  Write-Host "Skipping demo data - clean instance (bootstrap admin only)."
}

# --- done ---
$ADMIN_EMAIL = (Get-Content .env | Where-Object { $_ -match '^BOOTSTRAP_ADMIN_EMAIL=' }) -replace '^BOOTSTRAP_ADMIN_EMAIL='
$ADMIN_PASS = (Get-Content .env | Where-Object { $_ -match '^BOOTSTRAP_ADMIN_PASSWORD=' }) -replace '^BOOTSTRAP_ADMIN_PASSWORD='
Write-Host ""
Write-Host "============================================="
Write-Host " Zledger is ready!"
Write-Host "   Web UI:   http://localhost:9090"
Write-Host "   API docs: http://localhost:9090/api/docs"
Write-Host "   Admin:    $ADMIN_EMAIL"
Write-Host "   Password: $ADMIN_PASS"
Write-Host "============================================="
