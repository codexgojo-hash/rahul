param([string]$Mode = "up", [int]$Step = 2)
$ErrorActionPreference = "Stop"
$sig = @'
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
'@
$k = Add-Type -MemberDefinition $sig -Name "RahulVol" -Namespace "RahulNative" -PassThru
function Tap([byte]$vk) {
  $k::keybd_event($vk, 0, 0, [System.UIntPtr]::Zero)
  $k::keybd_event($vk, 0, 2, [System.UIntPtr]::Zero)
}
switch ($Mode.ToLower()) {
  "mute" { Tap 0xAD }
  "down" { for ($i = 0; $i -lt $Step; $i++) { Tap 0xAE } }
  default { for ($i = 0; $i -lt $Step; $i++) { Tap 0xAF } }
}
"ok"
