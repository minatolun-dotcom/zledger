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
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -WithGdrive
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -NoGdrive
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Help

[CmdletBinding()]
param(
  [switch]$NoDemo,
  [switch]$NoBuild,
  [switch]$WithScheduler,
  [switch]$WithGdrive,
  [switch]$NoGdrive,
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
$GdriveAns = $null  # $null=prompt, $true=force yes, $false=force no
if ($WithGdrive) { $GdriveAns = $true }
elseif ($NoGdrive) { $GdriveAns = $false }

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

# --- Google Drive (rclone) backup (optional) ---
function Setup-Gdrive {
  $TokenFile = "config/rclone/token.json"
  $Enable = $false

  if ($null -ne $GdriveAns) { $Enable = $GdriveAns }
  else {
    $ans = Read-Host "Enable Google Drive backups (via rclone in the backup container)? [y/N]"
    if ($ans -match '^(y|Y|yes|YES)$') { $Enable = $true }
  }

  if (-not $Enable) {
    Write-Host "Google Drive backup skipped. To enable later, see config/rclone/README.md"
    return
  }

  Write-Host ""
  Write-Host "rclone and its dependencies are already bundled inside the 'backup' container"
  Write-Host "(backend/backup/Dockerfile -> 'apk add rclone'), so no host install is needed."

  # Reuse an existing token if present.
  $hasToken = (Test-Path $TokenFile) -and ((Get-Item $TokenFile).Length -gt 0) -and ((Get-Content $TokenFile) -match '{')
  if ($hasToken) {
    Write-Host "Existing token found at $TokenFile - reusing it."
  } else {
    Write-Host ""
    Write-Host "Authorize Google Drive. Run this on a machine with a browser"
    Write-Host "(it can be this one, or another machine if this is a headless server):"
    Write-Host ""
    Write-Host "    $(if ($UseV2) { 'docker compose' } else { 'docker-compose' }) run --rm --entrypoint rclone backup authorize gdrive"
    Write-Host ""
    Write-Host "Sign in and grant access; rclone then prints a JSON token."
    Write-Host "Paste that JSON token below (it starts with '{' and ends with '}'):"
    Write-Host ""
    $Token = Read-Host
    if (-not $Token) {
      Write-Host "No token provided - Google Drive backup NOT enabled."
      return
    }
    if ($Token -notmatch '^\s*\{') {
      Write-Error "ERROR: token does not look like JSON (should start with '{'). Aborting."
      exit 1
    }
    Set-Content -Path $TokenFile -Value $Token -Encoding utf8
    Write-Host "Saved token to $TokenFile"
  }

  # Enable in .env
  $envLines = Get-Content .env
  $found = $false
  $newLines = @()
  foreach ($line in $envLines) {
    if ($line -match '^GDRIVE_ENABLED=') { $newLines += "GDRIVE_ENABLED=true"; $found = $true }
    else { $newLines += $line }
  }
  if (-not $found) { $newLines += "GDRIVE_ENABLED=true" }
  $newLines | Set-Content .env -Encoding utf8
  Write-Host "Set GDRIVE_ENABLED=true in .env"

  # Recreate backup so the new env + token are picked up (restart alone won't reload env).
  Write-Host "Recreating backup service to apply Google Drive config..."
  Invoke-Compose up -d backup

  # Best-effort verification
  $REMOTE = ((Get-Content .env | Where-Object { $_ -match '^GDRIVE_REMOTE_PATH=' }) -replace '^GDRIVE_REMOTE_PATH=')
  if (-not $REMOTE) { $REMOTE = "zledger-backups" }
  Write-Host "Verifying Google Drive access (best effort)..."
  Invoke-Compose exec -T backup rclone lsd "gdrive:$REMOTE" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Google Drive connection OK - backups will also upload to gdrive:$REMOTE"
  } else {
    Write-Host "Could not verify (non-fatal). Check '$(if ($UseV2) { 'docker compose' } else { 'docker-compose' }) logs backup' after the next cycle."
  }
}
Setup-Gdrive

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
