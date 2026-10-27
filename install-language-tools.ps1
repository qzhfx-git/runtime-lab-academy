$ErrorActionPreference = 'Stop'
# Portable, pinned official release. No administrator rights or PATH changes required.
$toolsFolder = Join-Path $PSScriptRoot '.runtime\tools'
$clangdBinary = Join-Path $toolsFolder 'clangd_23.1.0\bin\clangd.exe'
if (Test-Path -LiteralPath $clangdBinary) { & $clangdBinary --version; exit $LASTEXITCODE }
New-Item -ItemType Directory -Path $toolsFolder -Force | Out-Null
$archiveFile = Join-Path $toolsFolder 'clangd-windows-23.1.0.zip'
Write-Host 'Downloading official clangd 23.1.0...'
Invoke-WebRequest 'https://github.com/clangd/clangd/releases/download/23.1.0/clangd-windows-23.1.0.zip' -OutFile $archiveFile
$sha256 = '23412a240756a162e7b98a282f36aa2a23a88db5ce16a0cbc4fef7253768c810'
if ((Get-FileHash -LiteralPath $archiveFile -Algorithm SHA256).Hash.ToLower() -ne $sha256) { throw 'clangd checksum mismatch. Installation stopped.' }
Expand-Archive -LiteralPath $archiveFile -DestinationPath $toolsFolder -Force
& $clangdBinary --version
if ($LASTEXITCODE -ne 0) { throw 'clangd startup check failed.' }
Write-Host 'C++ language tools are ready. Return to the editor and click reconnect.'
