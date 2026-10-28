# One-time setup for a local MongoDB on Windows so this project (Prisma) can use it.
# Prisma needs MongoDB to run as a replica set. This script:
#   1. finds mongod.cfg of the installed MongoDB service,
#   2. turns on   replication: replSetName: rs0   (a backup of the file is kept),
#   3. restarts the MongoDB service,
#   4. runs rs.initiate() once with mongosh.
# Run it from setup-local-mongodb.bat (double-click), which asks for administrator rights.

$ErrorActionPreference = 'Stop'

function Done($msg, $code) { Write-Host ""; Write-Host $msg; Write-Host ""; if (-not $env:CI) { Read-Host 'Press Enter to close' }; exit $code }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Done 'Please run setup-local-mongodb.bat (it asks for administrator rights).' 1 }

# 1. Find the MongoDB service and its config file.
$svc = Get-CimInstance Win32_Service | Where-Object { $_.Name -like 'MongoDB*' } | Select-Object -First 1
if (-not $svc) { Done 'MongoDB service not found. Install MongoDB Community Server with "Install MongoD as a Service" ticked, then run this again.' 1 }
Write-Host "MongoDB service: $($svc.Name)"

$cfg = $null
if ($svc.PathName -match '--config\s+"?([^"]+\.cfg)"?') { $cfg = $Matches[1] }
if (-not $cfg -or -not (Test-Path $cfg)) {
  $cfg = Get-ChildItem 'C:\Program Files\MongoDB\Server\*\bin\mongod.cfg' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $cfg) { Done 'mongod.cfg not found under C:\Program Files\MongoDB\Server.' 1 }
Write-Host "Config file:     $cfg"

# 2. Enable the replica set.
$text = Get-Content -Raw -Path $cfg
if ($text -match '(?m)^\s*replSetName\s*:') {
  Write-Host 'Replica set is already enabled in mongod.cfg.'
} else {
  Copy-Item $cfg "$cfg.bak" -Force
  if ($text -match '(?m)^#\s*replication:\s*$') {
    $text = [regex]::Replace($text, '(?m)^#\s*replication:\s*$', "replication:`r`n  replSetName: rs0")
  } elseif ($text -match '(?m)^replication:\s*$') {
    $text = [regex]::Replace($text, '(?m)^replication:\s*$', "replication:`r`n  replSetName: rs0")
  } else {
    $text = $text.TrimEnd() + "`r`n`r`nreplication:`r`n  replSetName: rs0`r`n"
  }
  [IO.File]::WriteAllText($cfg, $text, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Enabled replica set rs0 (backup: $cfg.bak)."
}

# 3. Restart MongoDB.
Write-Host 'Restarting MongoDB...'
Restart-Service -Name $svc.Name -Force
Start-Sleep -Seconds 3

# 4. Initialise the replica set once.
$mongosh = Get-Command mongosh -ErrorAction SilentlyContinue
if (-not $mongosh) {
  $found = Get-ChildItem 'C:\Program Files\mongosh\mongosh.exe', "$env:LOCALAPPDATA\Programs\mongosh\mongosh.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $mongosh = $found.FullName } else { $mongosh = $null }
} else { $mongosh = $mongosh.Source }
if (-not $mongosh) { Done 'mongosh not found. Install it from https://www.mongodb.com/try/download/shell and run this again.' 1 }

$js = "try { print(rs.status().ok) } catch (e) { print(rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }).ok) }"
$ok = $null
for ($i = 0; $i -lt 10; $i++) {
  try { $ok = (& $mongosh --quiet --eval $js 2>$null | Select-Object -Last 1) } catch { $ok = $null }
  if ("$ok".Trim() -eq '1') { break }
  Start-Sleep -Seconds 2
}
if ("$ok".Trim() -ne '1') { Done 'Could not start the replica set. Open mongosh and run: rs.status()  — then send the output.' 1 }

Done 'MongoDB is ready. Now run in the project folder:  npm run db:deploy   then   npm run db:seed   then   npm run dev' 0
