param([string]$Mode = "playpause")
$ErrorActionPreference = "Stop"
$sig = @'
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
'@
$k = Add-Type -MemberDefinition $sig -Name "RahulMedia" -Namespace "RahulNative" -PassThru
switch ($Mode.ToLower()) {
  "next" { $vk = 0xB0 }
  "prev" { $vk = 0xB1 }
  "stop" { $vk = 0xB2 }
  default { $vk = 0xB3 }
}
$k::keybd_event([byte]$vk, 0, 0, [System.UIntPtr]::Zero)
$k::keybd_event([byte]$vk, 0, 2, [System.UIntPtr]::Zero)
"ok"
