$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)
} catch {
  Start-Process -NoNewWindow -FilePath "rundll32.exe" -ArgumentList "powrprof.dll,SetSuspendState 0,1,0"
}
"ok"
