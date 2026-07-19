<#
.SYNOPSIS
  Rotates the Cloudflare TryCloudflare tunnel URL across all the places it
  lives: techsales-api/.env, TechSales.config, and the Twilio TwiML App.

.DESCRIPTION
  Run this any time `cf-tunnel-techsales` restarts on the Pi (reboot, manual
  systemctl restart, etc.) and the trycloudflare.com hostname changes.

  Reads secrets from gitignored files only:
    - SSHDetails.md      → Pi username + password (line 1: `ssh user@host`, line 2: password)
    - techsales-api/.env → Twilio Account SID, Auth Token, TwiML App SID
  Never embeds credentials in the script itself.

.PARAMETER RestartApi
  After updating .env and Twilio, kill any node on :4000 and restart
  `npm run dev` in techsales-api/ in a detached background process.

.PARAMETER Force
  Update everything even if the URL hasn't changed (useful for repointing
  after editing Twilio out of band).

.PARAMETER DetectOnly
  Print the current tunnel URL detected from the Pi and exit. No writes.

.EXAMPLE
  pwsh scripts/rotate-tunnel.ps1
  pwsh scripts/rotate-tunnel.ps1 -RestartApi
  pwsh scripts/rotate-tunnel.ps1 -DetectOnly
#>
[CmdletBinding()]
param(
  [switch]$RestartApi,
  [switch]$Force,
  [switch]$DetectOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path "$PSScriptRoot/.."
$envPath  = Join-Path $repoRoot 'techsales-api/.env'
$cfgPath  = Join-Path $repoRoot 'TechSales.config'
$sshPath  = Join-Path $repoRoot 'SSHDetails.md'

if (-not (Test-Path $sshPath)) {
  throw "SSHDetails.md not found at $sshPath -- needed for Pi credentials."
}
if (-not (Test-Path $envPath)) {
  throw "techsales-api/.env not found -- needed for Twilio credentials."
}

# ---- 1. Parse SSH details ------------------------------------------------
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

# ---- 2. SSH to Pi and read current tunnel URL ----------------------------
Import-Module Posh-SSH -ErrorAction Stop
$pw = ConvertTo-SecureString $piPassword -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($piUser, $pw)
$sess = New-SSHSession -ComputerName $piHost -Credential $cred -AcceptKey -ConnectionTimeout 15
try {
  $res = Invoke-SSHCommand -SessionId $sess.SessionId -Command 'grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cf-tunnel.log | tail -1' -TimeOut 30
  $newUrl = ($res.Output -join "`n").Trim()
} finally {
  Remove-SSHSession -SessionId $sess.SessionId | Out-Null
}
if (-not $newUrl) {
  throw "No trycloudflare.com URL found in /tmp/cf-tunnel.log on the Pi. Is cf-tunnel-techsales running?"
}
Write-Host "Pi tunnel URL: $newUrl"

if ($DetectOnly) { exit 0 }

# ---- 3. Compare with current .env value ---------------------------------
$envContent = Get-Content $envPath -Raw
if ($envContent -match '(?m)^PUBLIC_BASE_URL=(\S*)') {
  $oldUrl = $matches[1]
} else {
  $oldUrl = ''
}

if ($oldUrl -eq $newUrl -and -not $Force) {
  Write-Host "PUBLIC_BASE_URL already matches ($oldUrl). Nothing to do."
  Write-Host "Pass -Force to update Twilio anyway."
  exit 0
}
Write-Host "Updating: $oldUrl"
Write-Host "      ->  $newUrl"

# ---- 4. Update techsales-api/.env ---------------------------------------
$envContent = $envContent -replace '(?m)^PUBLIC_BASE_URL=.*', "PUBLIC_BASE_URL=$newUrl"
[System.IO.File]::WriteAllText($envPath, $envContent)
Write-Host "  [OK] techsales-api/.env"

# ---- 5. Update TechSales.config -----------------------------------------
if (Test-Path $cfgPath) {
  $cfg = Get-Content $cfgPath -Raw
  $cfg = $cfg -replace '(?m)^VoiceUrl\s*=.*',       "VoiceUrl = $newUrl/api/twilio/voice"
  $cfg = $cfg -replace '(?m)^StatusCallback\s*=.*', "StatusCallback = $newUrl/api/twilio/status"
  $cfg = $cfg -replace '(?m)^PublicTunnelURL\s*=.*', "PublicTunnelURL = $newUrl"
  [System.IO.File]::WriteAllText($cfgPath, $cfg)
  Write-Host "  [OK] TechSales.config"
}

# ---- 6. Update Twilio TwiML App via REST --------------------------------
$accountSid = if ($envContent -match '(?m)^TWILIO_ACCOUNT_SID=(\S+)')  { $matches[1] } else { '' }
$authToken  = if ($envContent -match '(?m)^TWILIO_AUTH_TOKEN=(\S+)')   { $matches[1] } else { '' }
$appSid     = if ($envContent -match '(?m)^TWILIO_TWIML_APP_SID=(\S+)') { $matches[1] } else { '' }
if (-not ($accountSid -and $authToken -and $appSid)) {
  Write-Warning "Twilio creds missing in .env; skipping Twilio update."
} else {
  $apiUrl = "https://api.twilio.com/2010-04-01/Accounts/$accountSid/Applications/$appSid.json"
  $basic  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${accountSid}:${authToken}"))
  $body   = @{
    VoiceUrl             = "$newUrl/api/twilio/voice"
    VoiceMethod          = 'POST'
    StatusCallback       = "$newUrl/api/twilio/status"
    StatusCallbackMethod = 'POST'
  }
  Invoke-RestMethod -Uri $apiUrl -Method Post -Headers @{ Authorization = "Basic $basic" } -Body $body | Out-Null
  Write-Host "  [OK] Twilio TwiML App $appSid"
}

# ---- 7. Optionally restart the API ---------------------------------------
if ($RestartApi) {
  $listen = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
  if ($listen) {
    # $pid is a read-only automatic variable in PowerShell; use $procId
    foreach ($procId in ($listen.OwningProcess | Sort-Object -Unique)) {
      try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host "  [OK] killed API PID $procId" } catch { }
    }
  }
  $apiDir = Join-Path $repoRoot 'techsales-api'
  Start-Process -FilePath 'npm' -ArgumentList 'run','dev' -WorkingDirectory $apiDir -WindowStyle Hidden
  Write-Host "  [OK] API restarting in background"
}

Write-Host ""
Write-Host "Tunnel rotation complete. Current URL: $newUrl"
