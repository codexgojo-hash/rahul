# RAHUL — one-time autostart installer
# Adds a shortcut to the current user's Startup folder so RAHUL wakes up with Windows.
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server.js"
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Host "node.exe PATH me nahi mila. Node 18+ install karo, phir dobara chalao." -ForegroundColor Red
  exit 1
}
$node = $nodeCmd.Source

Write-Host "`n  RAHUL :: autostart install`n" -ForegroundColor Green
Write-Host "  root : $root"
Write-Host "  node : $node"

$vbs = Join-Path $PSScriptRoot "rahul-run.vbs"
$lines = @(
  'Set sh = CreateObject("WScript.Shell")',
  ('sh.CurrentDirectory = "' + $root + '"'),
  ('sh.Run """' + $node + '"" ""' + $server + '"" --silent", 0, False')
)
Set-Content -Path $vbs -Value $lines -Encoding ASCII

$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup "RAHUL.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = "wscript.exe"
$sc.Arguments = '"' + $vbs + '"'
$sc.WorkingDirectory = $root
$sc.Description = "RAHUL - calm AI for this PC"
$sc.IconLocation = "shell32.dll,14"
$sc.Save()

Write-Host "  link : $lnk" -ForegroundColor DarkGray
Write-Host "`n  Done. Agli baar Windows login par RAHUL khud start hoga.`n" -ForegroundColor Green
Write-Host "  Open karo: http://127.0.0.1:8787/`n" -ForegroundColor Cyan
