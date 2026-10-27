param([string]$SiteOrigin = 'https://qzhfx.dainty-ridge-8852.chatgpt.site')
$ErrorActionPreference = 'Stop'
$env:LAB_SITE_ORIGIN = $SiteOrigin
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'check-environment.ps1')
& node (Join-Path $PSScriptRoot 'bridge.mjs')
