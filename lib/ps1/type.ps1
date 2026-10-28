param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Text)
$ErrorActionPreference = "Stop"
$joined = ($Text -join " ")
$escaped = $joined -replace '\{', '{{' -replace '\}', '}}' -replace '\+', '{+}' -replace '\^', '{^}' -replace '%', '{%}' -replace '~', '{~}' -replace '\(', '{(}' -replace '\)', '{)}'
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 120
[System.Windows.Forms.SendKeys]::SendWait($escaped)
"ok"
