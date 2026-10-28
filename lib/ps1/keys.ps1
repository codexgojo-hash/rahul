param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Keys)
$ErrorActionPreference = "Stop"
$joined = ($Keys -join " ")
if ($joined -notmatch '^[\^%+a-zA-Z0-9{}~()\.\s]+$') { throw "key pattern rejected" }
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait($joined)
"ok"
