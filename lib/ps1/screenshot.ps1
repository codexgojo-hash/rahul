param([string]$Out)
$ErrorActionPreference = "Stop"
$signature = @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
try { Add-Type -MemberDefinition $signature -Name "RahulDpi" -Namespace "RahulNative" -PassThru | Out-Null } catch {}
try { [RahulNative.RahulDpi]::SetProcessDPIAware() } catch {}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($v.Width, $v.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($v.Left, $v.Top, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"$($v.Width)x$($v.Height)"
