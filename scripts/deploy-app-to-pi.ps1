<#
.SYNOPSIS
  Builds techsales-app and deploys the static bundle to the Pi, served at
  https://demotechsales.rubarajan.dev.

.DESCRIPTION
  Companion to deploy-api-to-pi.ps1. Unlike that script this one ships the
  WORKING TREE, not `git archive HEAD` -- a frontend build is reproducible from
  source and there is no value in refusing to preview uncommitted UI work.

  Steps:
    1. npm run build (uses techsales-app/.env.production, which pins
       VITE_API_BASE_URL at the public gateway)
    2. Assert the gateway URL is actually baked into the bundle -- if the env
       file loses precedence the app silently falls back to a relative /api and
       aims requests at this static host, which serves no API
    3. tar dist/ -> SCP to the Pi -> replace /var/www/demotechsales.rubarajan.dev
    4. Verify the public URL, including an SPA deep link

  The hosting itself (nginx vhost on 127.0.0.1:8091, cloudflared ingress) is
  configured once on the Pi and is not touched here.

  The app talks to https://api.rubarajan.dev/techsales/api cross-origin, so the
  API's CORS_ORIGIN must admit this origin. Deploy the API separately.

.PARAMETER SkipBuild
  Reuse the existing dist/ instead of rebuilding.

.EXAMPLE
  powershell -File scripts/deploy-app-to-pi.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path "$PSScriptRoot/.."
$appDir   = Join-Path $repoRoot 'techsales-app'
$distDir  = Join-Path $appDir 'dist'
$sshPath  = Join-Path $repoRoot 'SSHDetails.md'
$webRoot  = '/var/www/demotechsales.rubarajan.dev'
$siteUrl  = 'https://demotechsales.rubarajan.dev'
$apiUrl   = 'https://api.rubarajan.dev/techsales/api'

if (-not (Test-Path $sshPath)) {
  throw "SSHDetails.md not found at $sshPath -- needed for Pi credentials."
}

# ---- 1. Credentials (same format as deploy-api-to-pi.ps1) -----------------
$sshLines = Get-Content $sshPath
$sshLine  = $sshLines | Where-Object { $_ -match '^\s*ssh\s+' } | Select-Object -First 1
if (-not $sshLine -or $sshLine -notmatch 'ssh\s+([^@]+)@(\S+)') {
  throw "Couldn't parse ``ssh user@host`` from line 1 of SSHDetails.md."
}
$piUser = $matches[1]
$piHost = $matches[2]
$piPassword = ($sshLines | Where-Object { $_ -and $_ -notmatch '^\s*ssh\s+' } | Select-Object -First 1).Trim()
if (-not $piPassword) {
  throw "Couldn't find Pi password (non-empty second line) in SSHDetails.md."
}

# ---- 2. Build --------------------------------------------------------------
if (-not $SkipBuild) {
  Push-Location $appDir
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
  } finally {
    Pop-Location
  }
  Write-Host '  [OK] built'
}

if (-not (Test-Path (Join-Path $distDir 'index.html'))) {
  throw "No dist/index.html at $distDir -- build did not produce a bundle."
}

# The failure this guards against is silent at runtime: a bundle built without
# VITE_API_BASE_URL falls back to a relative `/api`, so every request lands on
# nginx, /health quietly returns nothing, and the app renders with the AI
# copilot and dialer simply missing. Cheaper to catch here.
$baked = Select-String -Path (Join-Path $distDir 'assets/*.js') -Pattern $apiUrl -SimpleMatch -List
if (-not $baked) {
  throw "Bundle does not contain $apiUrl. Check techsales-app/.env.production is present and won the env precedence."
}
Write-Host "  [OK] bundle points at $apiUrl"

# ---- 3. Ship ---------------------------------------------------------------
$tarPath = Join-Path $env:TEMP 'techsales-app-dist.tar.gz'
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
Push-Location $distDir
try {
  tar -czf $tarPath .
  if ($LASTEXITCODE -ne 0) { throw 'tar failed.' }
} finally {
  Pop-Location
}
Write-Host "  [OK] packed -> $tarPath"

Import-Module Posh-SSH -ErrorAction Stop
$pw = ConvertTo-SecureString $piPassword -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($piUser, $pw)

Set-SCPItem -ComputerName $piHost -Credential $cred -AcceptKey `
  -Path $tarPath -Destination '/tmp' | Out-Null
Write-Host '  [OK] uploaded to Pi:/tmp'

$sess = New-SSHSession -ComputerName $piHost -Credential $cred -AcceptKey -ConnectionTimeout 15
function Invoke-Pi([string]$cmd, [int]$timeout = 300) {
  $res = Invoke-SSHCommand -SessionId $sess.SessionId -Command $cmd -TimeOut $timeout
  if ($res.ExitStatus -ne 0) {
    throw "Pi command failed (exit $($res.ExitStatus)): $cmd`n$($res.Output -join "`n")`n$($res.Error -join "`n")"
  }
  return ($res.Output -join "`n").Trim()
}

# Non-tty SSH exec channel, so sudo must take the password on stdin. Feeding a
# single `sh -c` keeps any pipeline inside $cmd intact -- rewriting each `sudo`
# occurrence inline (as deploy-api-to-pi.ps1 does) corrupts piped commands.
function Invoke-PiSudo([string]$cmd, [int]$timeout = 300) {
  $enc = $cmd.Replace("'", "'\''")
  $res = Invoke-SSHCommand -SessionId $sess.SessionId `
    -Command "echo '$piPassword' | sudo -S -p '' sh -c '$enc'" -TimeOut $timeout
  if ($res.ExitStatus -ne 0) {
    throw "Pi sudo command failed (exit $($res.ExitStatus)): $cmd`n$($res.Output -join "`n")`n$($res.Error -join "`n")"
  }
  return ($res.Output -join "`n").Trim()
}

try {
  # Unpack somewhere writable without sudo, prove the bundle is intact, and only
  # then swap it in -- a half-extracted tarball is never what the site serves.
  # /var/www itself is root-owned, so the swap needs sudo even though the site
  # directory does not.
  $stage = '/tmp/demotechsales-deploy'
  Invoke-Pi "rm -rf $stage && mkdir -p $stage"
  Invoke-Pi "tar -xzf /tmp/techsales-app-dist.tar.gz -C $stage"
  Invoke-Pi "test -f $stage/index.html && test -d $stage/assets"
  Invoke-PiSudo "rm -rf ${webRoot}.old; mv $webRoot ${webRoot}.old && mv $stage $webRoot && rm -rf ${webRoot}.old"
  Invoke-PiSudo "chown -R root:root $webRoot && chmod -R a+rX $webRoot"
  Invoke-Pi "rm -f /tmp/techsales-app-dist.tar.gz"
  Write-Host '  [OK] swapped into place'
  Write-Host "  [OK] $(Invoke-Pi "ls -1 $webRoot | tr '\n' ' '")"
} finally {
  Remove-SSHSession -SessionId $sess.SessionId | Out-Null
}

# ---- 4. Verify from the outside -------------------------------------------
Start-Sleep -Seconds 2
foreach ($path in @('/', '/admin/supervision/CA123')) {
  try {
    $r = Invoke-WebRequest "$siteUrl$path" -TimeoutSec 30 -UseBasicParsing
    Write-Host "  [OK] $($r.StatusCode) $siteUrl$path"
  } catch {
    Write-Host "  [WARN] $siteUrl$path -> $($_.Exception.Message)"
  }
}

Write-Host ''
Write-Host "Deploy complete: $siteUrl"
