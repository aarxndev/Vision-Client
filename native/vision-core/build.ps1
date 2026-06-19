$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root "src"
$bin = Join-Path $root "bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null

$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) {
  $vcvars = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
}
if (-not (Test-Path $vcvars)) {
  throw "Visual Studio C++ build tools not found."
}

$out = Join-Path $bin "vision-core.exe"

Get-Process -Name "vision-core" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
Remove-Item $out -Force -ErrorAction SilentlyContinue

$sources = "main.cpp core.cpp windivert_engine.cpp target_scan.cpp process_ctl.cpp macros.cpp"
$libs = "user32.lib kernel32.lib ntdll.lib iphlpapi.lib ws2_32.lib"
$clCmd = "cl /nologo /EHsc /O2 /std:c++17 /W3 /Fe:`"$out`" $sources $libs"
$full = "call `"$vcvars`" && cd /d `"$src`" && $clCmd"

cmd.exe /c $full
if ($LASTEXITCODE -ne 0) { throw "vision-core compile failed with exit code $LASTEXITCODE" }
if (-not (Test-Path $out)) { throw "vision-core.exe was not produced at $out" }
Write-Host "Built $out"
