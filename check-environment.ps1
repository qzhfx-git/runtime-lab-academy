$ErrorActionPreference = 'Stop'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw 'Install Node.js 22 or newer from https://nodejs.org/ and reopen this terminal.' }
$nodeMajor = [int]((& node -p 'process.versions.node.split(".")[0]'))
if ($nodeMajor -lt 22) { throw 'Node.js 22 or newer is required.' }
$compilerPath = $env:CPP_COMPILER
if (-not $compilerPath) {
    if (Test-Path -LiteralPath 'C:\msys64\ucrt64\bin\g++.exe') { $compilerPath = 'C:\msys64\ucrt64\bin\g++.exe' }
    else { $gccCmd = Get-Command g++ -ErrorAction SilentlyContinue; if ($gccCmd) { $compilerPath = $gccCmd.Source } }
}
if (-not $compilerPath) { throw 'Install MSYS2 UCRT64 GCC. See README.md, or set CPP_COMPILER to g++.exe.' }
$env:CPP_COMPILER = $compilerPath
$env:PATH = (Split-Path -Parent $compilerPath) + ';' + $env:PATH
$probeFolder = Join-Path $env:TEMP ('runtime-lab-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeFolder | Out-Null
$probeSource = Join-Path $probeFolder 'probe.cpp'
$probeBinary = Join-Path $probeFolder 'probe.exe'
@'
#include <thread>
#include <latch>
#include <atomic>
#include <concepts>
#include <iostream>
template<class T> concept Number = std::integral<T>;
int main(){static_assert(Number<int>); std::atomic<int> n=0; std::latch l(1);std::jthread t([&]{++n;l.count_down();});l.wait();t.join();std::cout<<n;return n==1?0:1;}
'@ | Set-Content -LiteralPath $probeSource -Encoding utf8
& $compilerPath '-std=c++20' '-pthread' $probeSource '-o' $probeBinary
if ($LASTEXITCODE -ne 0) { throw 'C++20 compilation failed. Update GCC and check README.md.' }
& $probeBinary
if ($LASTEXITCODE -ne 0) { throw 'C++20 thread runtime check failed.' }
Write-Host "`nNode.js and C++20 threads are ready. Probe files: $probeFolder"
