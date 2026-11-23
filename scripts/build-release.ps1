param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "==> Preparing SoundCloud Desktop Signed Release Build..." -ForegroundColor Cyan

$keyFile = Join-Path $rootDir ".keys\scdesktop.key"
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    if (Test-Path $keyFile) {
        $privateKey = Get-Content $keyFile -Raw
        $env:TAURI_SIGNING_PRIVATE_KEY = $privateKey.Trim()
        Write-Host "==> Loaded private key from .keys/scdesktop.key" -ForegroundColor Green
    } else {
        Write-Warning "No .keys/scdesktop.key found and TAURI_SIGNING_PRIVATE_KEY is not set."
    }
}

Write-Host "==> Compiling frontend assets..." -ForegroundColor Cyan
npm run build

$tauriConfPath = Join-Path $rootDir "src-tauri\tauri.conf.json"
$tauriConf = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
$version = $tauriConf.version
Write-Host "==> Building SoundCloud Desktop release version v$version..." -ForegroundColor Cyan

npx tauri build

$bundleDir = Join-Path $rootDir "src-tauri\target\release\bundle"
$outDir = Join-Path $rootDir "release-dist"
if (Test-Path $outDir) {
    Remove-Item -Recurse -Force $outDir
}
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$manifest = @{
    version = "v$version"
    notes = "SoundCloud Native Desktop v$version release"
    pub_date = $pubDate
    platforms = @{}
}

$nsisDir = Join-Path $bundleDir "nsis"
if (Test-Path $nsisDir) {
    $zipFiles = Get-ChildItem -Path $nsisDir -Filter "*.zip"
    $sigFiles = Get-ChildItem -Path $nsisDir -Filter "*.sig"
    $exeFiles = Get-ChildItem -Path $nsisDir -Filter "*.exe"

    foreach ($file in ($zipFiles + $sigFiles + $exeFiles)) {
        Copy-Item -Path $file.FullName -Destination $outDir -Force
    }

    if ($zipFiles.Count -gt 0) {
        $zipName = $zipFiles[0].Name
        $sigName = "$zipName.sig"
        $sigPath = Join-Path $nsisDir $sigName

        if (Test-Path $sigPath) {
            $sigContent = (Get-Content $sigPath -Raw).Trim()
            $repoUser = if ($env:GITHUB_REPOSITORY_OWNER) { $env:GITHUB_REPOSITORY_OWNER } else { "reinqq" }
            $repoName = if ($env:GITHUB_REPOSITORY_NAME) { $env:GITHUB_REPOSITORY_NAME } else { "scdesktop" }
            $manifest.platforms["windows-x86_64"] = @{
                signature = $sigContent
                url = "https://github.com/$repoUser/$repoName/releases/download/v$version/$zipName"
            }
        }
    }
}

$manifestJson = $manifest | ConvertTo-Json -Depth 5
$manifestPath = Join-Path $outDir "latest.json"
Set-Content -Path $manifestPath -Value $manifestJson -Encoding UTF8

Write-Host "`n==> Signed release package generated in 'release-dist/':" -ForegroundColor Green
Get-ChildItem -Path $outDir | Format-Table Name, Length, LastWriteTime
