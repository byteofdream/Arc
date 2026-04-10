Param(
  [string]$BuildType = "Release"
)

$ErrorActionPreference = "Stop"

Write-Host "== Arc IDE Windows release build =="

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
  throw "cmake is required"
}

$root = Resolve-Path "$PSScriptRoot/.."
$buildDir = Join-Path $root "build-win"
$outDir = Join-Path $root "website/downloads/v0.1.0/windows"

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

cmake -S $root -B $buildDir -G "Ninja" -DCMAKE_BUILD_TYPE=$BuildType
cmake --build $buildDir -j

$exe = Join-Path $buildDir "arc-mini-ide.exe"
if (-not (Test-Path $exe)) {
  throw "Expected executable not found: $exe"
}

Copy-Item $exe (Join-Path $outDir "arc-mini-ide.exe") -Force
Compress-Archive -Path (Join-Path $outDir "arc-mini-ide.exe") -DestinationPath (Join-Path $root "website/downloads/arc-mini-ide-v0.1.0-windows-x64.zip") -Force

Write-Host "Done. Output:"
Write-Host " - website/downloads/arc-mini-ide-v0.1.0-windows-x64.zip"
