<#
.SYNOPSIS
  Publishes techsales-api to the standalone public repo
  https://github.com/Rubaraj/TechSalesAPI

.DESCRIPTION
  TechSalesApp is the source of truth. TechSalesAPI is a one-way publication
  mirror for sharing the backend — nothing is ever edited there directly.

  Steps:
    1. Assert a clean working tree (git archive ships COMMITTED code only)
    2. Clone the mirror, wipe its tree (keeping .git)
    3. git archive HEAD techsales-api -> staging (tracked files ONLY, so
       .env / node_modules / dist / data-runtime cannot leak)
    4. Copy the API-specific root docs into docs/
    5. Overlay publish/api-mirror/overlay/* (standalone README etc.)
    6. Run publish/api-mirror/transform.mjs (drops monorepo-only scripts,
       rewrites cross-repo links)
    7. Verification gates: no secrets, no internal hosts, npm ci + build
    8. Commit and push

  Gate failures abort BEFORE anything is pushed.

.PARAMETER SkipBuild
  Skip the npm ci + build gate (faster; use only for docs-only changes).

.PARAMETER DryRun
  Do everything except commit and push. Leaves the staging dir for inspection.

.EXAMPLE
  powershell -File scripts/publish-api-mirror.ps1
  powershell -File scripts/publish-api-mirror.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot  = Resolve-Path "$PSScriptRoot/.."
$mirrorUrl = 'https://github.com/Rubaraj/TechSalesAPI.git'
$stage     = Join-Path $env:TEMP 'techsales-api-mirror'

# API-specific docs that live at the monorepo root and travel with the API.
$docs = @(
  'BACKEND_VM_SETUP.md',
  'MONGODB_BACKEND_PLAN.md',
  'AI_BACKEND_PLAN.md',
  'DATABRICKS_MIGRATION_PLAN.md',
  'DATABRICKS_DEPLOYMENT_GUIDE.md',
  'architecture-option-a-databricks-vector-search.md',
  'architecture-option-b-qdrant-vector-db.md'
)

Push-Location $repoRoot
try {
  # ---- 1. Clean tree -------------------------------------------------------
  if (git status --porcelain) {
    throw 'Working tree is dirty. `git archive HEAD` ships committed code only — commit first.'
  }
  $sourceSha = (git rev-parse --short HEAD).Trim()
  Write-Host "  [OK] source is clean at $sourceSha"

  # ---- 2. Clone the mirror, wipe the tree, keep .git ----------------------
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  git clone --quiet $mirrorUrl $stage
  if ($LASTEXITCODE -ne 0) { throw "git clone $mirrorUrl failed." }
  Get-ChildItem -LiteralPath $stage -Force |
    Where-Object { $_.Name -ne '.git' } |
    Remove-Item -Recurse -Force
  Write-Host '  [OK] mirror cloned, tree wiped'

  # ---- 3. Extract tracked API files ---------------------------------------
  # --strip-components=1 drops the leading techsales-api/ so the API sits at root.
  $tar = Join-Path $env:TEMP 'techsales-api-archive.tar'
  git archive --format=tar -o $tar HEAD techsales-api
  if ($LASTEXITCODE -ne 0) { throw 'git archive failed.' }
  tar -xf $tar -C $stage --strip-components=1
  if ($LASTEXITCODE -ne 0) { throw 'tar extract failed.' }
  Remove-Item $tar -Force
  Write-Host '  [OK] extracted tracked API files'

  # ---- 4. Docs -------------------------------------------------------------
  $docsDir = Join-Path $stage 'docs'
  New-Item -ItemType Directory -Force -Path $docsDir | Out-Null
  foreach ($d in $docs) {
    $src = Join-Path $repoRoot $d
    if (-not (Test-Path $src)) { throw "Doc not found: $d" }
    Copy-Item $src $docsDir
  }
  Write-Host "  [OK] copied $($docs.Count) docs"

  # ---- 5. Overlay ----------------------------------------------------------
  $overlay = Join-Path $repoRoot 'publish/api-mirror/overlay'
  Copy-Item "$overlay/*" $stage -Recurse -Force
  Write-Host '  [OK] overlay applied'

  # ---- 6. Transform --------------------------------------------------------
  node (Join-Path $repoRoot 'publish/api-mirror/transform.mjs') $stage
  if ($LASTEXITCODE -ne 0) { throw 'transform.mjs failed — see misses above.' }

  # ---- 7. Gates ------------------------------------------------------------
  Write-Host ''
  Write-Host 'Verification gates:'

  if (Test-Path (Join-Path $stage '.env')) { throw 'GATE FAILED: .env present in mirror.' }
  Write-Host '  [PASS] no .env'

  # Scan the staged tree, excluding .git and package-lock.json.
  $scan = Get-ChildItem -LiteralPath $stage -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.Name -ne 'package-lock.json' }

  $secretRx = 'sk-[A-Za-z0-9]{2,}-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|\bAC[0-9a-f]{32}\b|\bSK[0-9a-f]{32}\b|\bAP[0-9a-f]{32}\b|BEGIN .*PRIVATE KEY|ghp_[A-Za-z0-9]{30,}'
  $hits = $scan | Select-String -Pattern $secretRx -List
  if ($hits) {
    $hits | ForEach-Object { Write-Host "    $($_.Path):$($_.LineNumber)" }
    throw 'GATE FAILED: secret-shaped strings found.'
  }
  Write-Host '  [PASS] no secret-shaped strings'

  $hostRx = '192\.168\.|piadmin|mongodb\+srv://'
  $hits = $scan |
    Where-Object { $_.Name -ne '.gitignore' } |
    Select-String -Pattern $hostRx -List
  if ($hits) {
    $hits | ForEach-Object { Write-Host "    $($_.Path):$($_.LineNumber)" }
    throw 'GATE FAILED: internal host / credential filename disclosure found.'
  }
  Write-Host '  [PASS] no internal-host disclosure'

  if (-not $SkipBuild) {
    Push-Location $stage
    try {
      # NOTE: do NOT redirect stderr (2>&1) from npm here. In Windows
      # PowerShell 5.1 that wraps each stderr line in an ErrorRecord
      # (NativeCommandError), which trips $ErrorActionPreference='Stop' even
      # when npm exits 0 — npm writes deprecation warnings to stderr routinely.
      # Check $LASTEXITCODE instead.
      $ErrorActionPreference = 'Continue'
      npm ci --no-audit --no-fund | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'GATE FAILED: npm ci failed in the mirror.' }
      npm run build | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'GATE FAILED: npm run build failed in the mirror.' }
      $ErrorActionPreference = 'Stop'
    } finally { Pop-Location }
    # Build output and deps are gitignored, but remove them so `git status` is honest.
    Remove-Item -Recurse -Force (Join-Path $stage 'dist'), (Join-Path $stage 'node_modules') -ErrorAction SilentlyContinue
    Write-Host '  [PASS] npm ci + build'
  } else {
    Write-Host '  [SKIP] build gate (-SkipBuild)'
  }

  # ---- 8. Commit + push ----------------------------------------------------
  Push-Location $stage
  try {
    git add -A
    if (-not (git status --porcelain)) {
      Write-Host ''
      Write-Host 'Mirror is already up to date — nothing to publish.'
      return
    }

    Write-Host ''
    Write-Host 'Changes to publish:'
    git diff --cached --stat | Select-Object -Last 20 | ForEach-Object { Write-Host "    $_" }

    if ($DryRun) {
      Write-Host ''
      Write-Host "DryRun: not committing. Staged mirror is at $stage"
      return
    }

    git commit --quiet -m "Sync from source at $sourceSha"
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
    git push --quiet origin main
    if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }
  } finally { Pop-Location }

  Write-Host ''
  Write-Host 'Published: https://github.com/Rubaraj/TechSalesAPI'
} finally {
  Pop-Location
}
