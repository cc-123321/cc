# Storm Action - CLI build script (ASCII only, robust to PowerShell 5.1/7 encoding)
# Usage (run from project root or anywhere):
#   powershell -ExecutionPolicy Bypass -File tools/build.ps1 [-Platform web-mobile|wechatgame|bytedance-minigame]
param(
    [string]$Platform = "web-mobile",
    [string]$Orientation = "landscape"
)

# Resolve project root from this script's location (no hard-coded CJK literals)
$proj   = Split-Path -Parent $PSScriptRoot
$exe    = "D:\CocosCreator-v3.8.8-win-121518\CocosCreator.exe"
$log    = Join-Path $proj "build.log"
$scene  = "f6a0e2b1-8c4d-4e5f-9a2b-3d4e5f6a7b8c"

Remove-Item $log -ErrorAction SilentlyContinue

# Pass args via cmd /c with file redirect (avoids GUI-app stdout pipe EPIPE)
$argStr = "--project ""$proj"" --build ""platform=$Platform;debug=true;startScene=$scene;orientation=$Orientation"" > ""$log"" 2>&1"
$cmd = "`"$exe`" $argStr"
cmd /c $cmd
$code = $LASTEXITCODE
Write-Output "exit=$code"
if (Test-Path $log) { Get-Content $log -Tail 8 }
