param([string]$Mode = "get", [Parameter(ValueFromRemainingArguments = $true)][string[]]$Text)
$ErrorActionPreference = "Stop"
if ($Mode -eq "get") {
  $c = Get-Clipboard -Raw -ErrorAction SilentlyContinue
  if ($null -eq $c) { "" } else { $c }
} else {
  $joined = ($Text -join " ")
  Set-Clipboard -Value $joined
  "ok"
}
