# Publish build/client lên branch gh-pages của repo UnitedChat.
# Mặc định build với base /UnitedChat/ cho GitHub Pages project site.
param(
    [string]$RepoUrl = "https://github.com/ANIGLOBAL/UnitedChat.git",
    [string]$Base = "/UnitedChat/",
    [string]$CommitMessage = "Publish UnitedChat SPA"
)

$ErrorActionPreference = "Stop"
$uiRoot = Split-Path $PSScriptRoot -Parent
$workDir = Join-Path $env:TEMP "opencode\unitedchat-pages-repo"

Push-Location $uiRoot
try {
    $env:UNITEDCHAT_BASE = $Base
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
} finally {
    Remove-Item Env:UNITEDCHAT_BASE -ErrorAction SilentlyContinue
    Pop-Location
}

New-Item -ItemType Directory -Force -Path (Split-Path $workDir) | Out-Null
if (Test-Path $workDir) {
    Remove-Item -Recurse -Force $workDir
}
git clone --single-branch --branch gh-pages $RepoUrl $workDir
if ($LASTEXITCODE -ne 0) {
    New-Item -ItemType Directory -Force -Path $workDir | Out-Null
    git -C $workDir init -b gh-pages
    git -C $workDir remote add origin $RepoUrl
}

Get-ChildItem -LiteralPath $workDir -Force |
    Where-Object { $_.Name -ne ".git" } |
    Remove-Item -Recurse -Force
Copy-Item -Recurse -Force -Path (Join-Path $uiRoot "build\client\*") -Destination $workDir
New-Item -ItemType File -Force -Path (Join-Path $workDir ".nojekyll") | Out-Null

git -C $workDir add -A
git -C $workDir diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git -C $workDir commit -m $CommitMessage
    git -C $workDir push origin gh-pages
    if ($LASTEXITCODE -eq 0) { Write-Output "PUBLISHED gh-pages OK" }
} else {
    Write-Output "No changes to publish."
}
