$ErrorActionPreference = "SilentlyContinue"
$lines = netsh wlan show interfaces 2>$null
$state = ($lines | Select-String -Pattern '^\s*State\s*:' | Select-Object -First 1).ToString()
$ssid = ($lines | Select-String -Pattern '^\s*SSID\s*:' | Select-Object -First 1).ToString()
$sig = ($lines | Select-String -Pattern '^\s*Signal\s*:' | Select-Object -First 1).ToString()
$name = ($lines | Select-String -Pattern '^\s*Name\s*:' | Select-Object -First 1).ToString()
$out = @{
  state = ($state -replace '^[^:]*:\s*', '').Trim()
  ssid = ($ssid -replace '^[^:]*:\s*', '').Trim()
  signal = ($sig -replace '^[^:]*:\s*', '').Trim()
  iface = ($name -replace '^[^:]*:\s*', '').Trim()
}
$out | ConvertTo-Json -Compress
