<#
.SYNOPSIS
  Deploys techsales-api (and the gateway config) to the Pi behind
  https://api.rubarajan.dev. Replaces the old rotate-tunnel.ps1 — the named
  Cloudflare tunnel URL is stable, so nothing rotates anymore.

.DESCRIPTION
  Ships COMMITTED code only (git archive HEAD): commit before deploying.

  Steps:
    1. git archive HEAD (techsales-api/ + gateway/) -> tar.gz
    2. SCP to the Pi (Posh-SSH; creds from gitignored SSHDetails.md)
    3. Pi: extract into /opt/techsales-api (PRESERVES .env and node_modules),
       npm ci, npm run build
    4. Sync gateway/Caddyfile -> /etc/caddy/Caddyfile and
       gateway/index.html -> /srv/api-gateway/, reload caddy
    5. Restart techsales-api service, curl local health, report

  The Pi's /opt/techsales-api/.env is CANONICAL for production and is never
  touched by this script. Add new env keys there manually.

.PARAMETER SkipBuild
  Skip npm ci + build (config-only deploys, e.g. Caddyfile changes).

.EXAMPLE
  powershell -File scripts/deploy-api-to-pi.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path "$PSScriptRoot/.."
$sshPath  = Join-Path $repoRoot 'SSHDetails.md'
$appDir   = '/opt/techsales-api'

if (-not (Test-Path $sshPath)) {
  throw "SSHDetails.md not found at $sshPath -- needed for Pi credentials."
}

# ---- 1. Parse SSH details (same format as the old rotate-tunnel.ps1) ------
$sshLines = Get-Content $sshPath
$sshLine  = $sshLines | Where-Object { $_ -match '^\s*ssh\s+' } | Select-Object -First 1
if (-not $sshLine -or $sshLine -notmatch 'ssh\s+([^@]+)@(\S+)') {
  throw "Couldn't parse `ssh user@host` from line 1 of SSHDetails.md."
}
$piUser = $matches[1]
$piHost = $matches[2]
$piPassword = ($sshLines | Where-Object { $_ -and $_ -notmatch '^\s*ssh\s+' } | Select-Object -First 1).Trim()
if (-not $piPassword) {
  throw "Couldn't find Pi password (non-empty second line) in SSHDetails.md."
}

# ---- 2. Archive committed code -------------------------------------------
$tarPath = Join-Path $env:TEMP 'techsales-deploy.tar.gz'
Push-Location $repoRoot
try {
  git archive --format=tar.gz -o $tarPath HEAD techsales-api gateway
  if ($LASTEXITCODE -ne 0) { throw 'git archive failed (uncommitted-only changes are not shipped).' }
} finally {
  Pop-Location
}
Write-Host "  [OK] archived HEAD -> $tarPath"

# ---- 3. SCP + remote steps ------------------------------------------------
Import-Module Posh-SSH -ErrorAction Stop
$pw = ConvertTo-SecureString $piPassword -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($piUser, $pw)

Set-SCPItem -ComputerName $piHost -Credential $cred -AcceptKey `
  -Path $tarPath -Destination '/tmp' | Out-Null
Write-Host '  [OK] uploaded tarball to Pi:/tmp'

$sess = New-SSHSession -ComputerName $piHost -Credential $cred -AcceptKey -ConnectionTimeout 15
function Invoke-Pi([string]$cmd, [int]$timeout = 600) {
  $res = Invoke-SSHCommand -SessionId $sess.SessionId -Command $cmd -TimeOut $timeout
  if ($res.ExitStatus -ne 0) {
    throw "Pi command failed (exit $($res.ExitStatus)): $cmd`n$($res.Output -join "`n")`n$($res.Error -join "`n")"
  }
  return ($res.Output -join "`n")
}

try {
  # Extract: wipe old src/dist but preserve .env and node_modules.
  Invoke-Pi "sudo mkdir -p $appDir && sudo chown ${piUser}:${piUser} $appDir"
  Invoke-Pi "cd $appDir && find . -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'node_modules' -exec rm -rf {} +"
  Invoke-Pi "tar -xzf /tmp/techsales-deploy.tar.gz -C $appDir --strip-components=1 techsales-api"
  Invoke-Pi "mkdir -p /tmp/gateway-deploy && rm -rf /tmp/gateway-deploy/* && tar -xzf /tmp/techsales-deploy.tar.gz -C /tmp/gateway-deploy --strip-components=1 gateway"
  Write-Host '  [OK] extracted'

  if (-not $SkipBuild) {
    Invoke-Pi "cd $appDir && npm ci --no-audit --no-fund" 900
    Invoke-Pi "cd $appDir && npm run build" 900
    Write-Host '  [OK] npm ci + build'
  }

  # Gateway config + index page.
  Invoke-Pi 'sudo mkdir -p /srv/api-gateway'
  Invoke-Pi 'sudo cp /tmp/gateway-deploy/Caddyfile /etc/caddy/Caddyfile && sudo cp /tmp/gateway-deploy/index.html /srv/api-gateway/index.html'
  Invoke-Pi 'sudo systemctl reload caddy'
  Write-Host '  [OK] gateway config synced, caddy reloaded'

  Invoke-Pi 'sudo systemctl restart techsales-api'
  Start-Sleep -Seconds 4
  $health = Invoke-Pi 'curl -s -m 10 http://localhost:4000/api/health'
  Write-Host "  [OK] techsales-api restarted; health: $health"
  $gwHealth = Invoke-Pi 'curl -s -m 10 http://localhost:8080/techsales/api/health | head -c 120'
  Write-Host "  [OK] via gateway: $gwHealth"
} finally {
  Remove-SSHSession -SessionId $sess.SessionId | Out-Null
}

Write-Host ''
Write-Host 'Deploy complete: https://api.rubarajan.dev/techsales/api/health'
