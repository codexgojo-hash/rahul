# RAHUL — remove autostart
$ErrorActionPreference = "SilentlyContinue"
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup "RAHUL.lnk"
if (Test-Path $lnk) {
  Remove-Item $lnk -Force
  Write-Host "  removed: $lnk" -ForegroundColor Yellow
} else {
  Write-Host "  no autostart shortcut found" -ForegroundColor DarkGray
}
$vbs = Join-Path $PSScriptRoot "rahul-run.vbs"
if (Test-Path $vbs) { Remove-Item $vbs -Force }
Write-Host "  RAHUL will not start with Windows anymore." -ForegroundColor Green
