param([switch]$SkipArchive)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -Raw -LiteralPath (Join-Path $root 'VERSION')).Trim()
if ($version -notmatch '^[a-zA-Z0-9.-]+$') { throw 'Invalid release version.' }
$name = "better-music-party-$version-windows-x64"
$output = Join-Path $root 'artifacts'
$stage = Join-Path $output ('build-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$source = Join-Path $stage 'source'
$package = Join-Path $stage $name
foreach ($directory in @($source, $package)) { New-Item -ItemType Directory -Path $directory | Out-Null }

# Only source-controlled files and intended untracked source files enter the build.
# Never copy a running room, its data directory, or its existing build output.
Push-Location $root
try {
    $files = @(git ls-files --cached --others --exclude-standard | Sort-Object -Unique)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate release source files.' }
    foreach ($file in $files) {
        if ($file -match '^(\.idea/|artifacts/)' -or $file -match '(^|/)(bin|obj|node_modules|publish[^/]*|\.next[^/]*|data|keys)/' -or $file -match '(cookie\.txt|users\.dat|\.bin|\.log|\.pdb)$') { continue }
        $destination = Join-Path $source $file
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $root $file) -Destination $destination
    }
} finally { Pop-Location }

$previousDist = $env:MUSICPARTY_DIST_DIR
$previousStandalone = $env:MUSICPARTY_STANDALONE
try {
    Remove-Item Env:MUSICPARTY_DIST_DIR -ErrorAction SilentlyContinue
    $env:MUSICPARTY_STANDALONE = '1'
    Push-Location (Join-Path $source 'music-party')
    try {
        'node-linker=hoisted' | Set-Content -LiteralPath '.npmrc' -Encoding ASCII
        # A flat dependency tree lets Next standalone build on Windows without symlink privileges.
        & pnpm.cmd install --frozen-lockfile --node-linker=hoisted
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        & node.exe 'node_modules/next/dist/bin/next' build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
} finally {
    $env:MUSICPARTY_DIST_DIR = $previousDist
    $env:MUSICPARTY_STANDALONE = $previousStandalone
}

$web = Join-Path $package 'web'
New-Item -ItemType Directory -Path $web | Out-Null
Get-ChildItem -LiteralPath (Join-Path $source 'music-party/.next/standalone') -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $web -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $source 'music-party/.next/static') -Destination (Join-Path $web '.next/static') -Recurse
Copy-Item -LiteralPath (Join-Path $source 'music-party/public') -Destination (Join-Path $web 'public') -Recurse

& dotnet.exe publish (Join-Path $source 'MusicParty/MusicParty.csproj') -c Release -r win-x64 --self-contained true -o (Join-Path $package 'backend') -p:DebugType=None -p:DebugSymbols=false -clp:ErrorsOnly
if ($LASTEXITCODE -ne 0) { throw 'Backend publish failed.' }
& dotnet.exe publish (Join-Path $source 'MusicPartyLauncher/MusicPartyLauncher.csproj') -c Release -r win-x64 --self-contained true -o $package -p:AssemblyName=BetterMusicParty -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -clp:ErrorsOnly
if ($LASTEXITCODE -ne 0) { throw 'Launcher publish failed.' }

$runtime = Join-Path $package 'runtime'
New-Item -ItemType Directory -Path $runtime | Out-Null
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $runtime 'node.exe')
& node.exe (Join-Path $PSScriptRoot 'collect-licenses.cjs') (Join-Path $source 'music-party/node_modules') (Join-Path $runtime 'frontend-licenses')
if ($LASTEXITCODE -ne 0) { throw 'Frontend license collection failed.' }
$nodeVersion = & node.exe --version
Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $runtime 'LICENSE-node.txt')
$dotnetRoot = Split-Path (Get-Command dotnet.exe).Source -Parent
foreach ($license in @('LICENSE.txt','ThirdPartyNotices.txt')) {
    if (Test-Path -LiteralPath (Join-Path $dotnetRoot $license)) { Copy-Item -LiteralPath (Join-Path $dotnetRoot $license) -Destination (Join-Path $runtime "dotnet-$license") }
}

$netease = Join-Path $package 'netease'
New-Item -ItemType Directory -Path $netease | Out-Null
'{"name":"better-music-party-netease","version":"1.0.0-beta.1","private":true,"dependencies":{"NeteaseCloudMusicApi":"4.32.0"}}' | Set-Content -LiteralPath (Join-Path $netease 'package.json') -Encoding UTF8
& npm.cmd install --prefix $netease --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'NetEase API packaging failed.' }

@{name='Better Music Party';version=$version;platform='win-x64';node=$nodeVersion;netease='4.32.0'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $package 'release.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $source 'README.md'),(Join-Path $source 'CHANGELOG.md') -Destination $package

# Build-only metadata contains absolute build-machine paths and is not used at runtime.
Get-ChildItem -LiteralPath $web -Recurse -File | Where-Object { $_.Name -like '*.nft.json' -or $_.Name -eq 'trace' } | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
$requiredFiles = Join-Path $web '.next/required-server-files.json'
if (Test-Path -LiteralPath $requiredFiles) {
    $metadata = Get-Content -Raw -LiteralPath $requiredFiles | ConvertFrom-Json
    $metadata.appDir = '.'
    if ($metadata.config.PSObject.Properties['outputFileTracingRoot']) { $metadata.config.outputFileTracingRoot = '.' }
    if ($metadata.config.experimental -and $metadata.config.experimental.PSObject.Properties['outputFileTracingRoot']) { $metadata.config.experimental.outputFileTracingRoot = '.' }
    $metadata | ConvertTo-Json -Depth 100 -Compress | Set-Content -LiteralPath $requiredFiles -Encoding UTF8
}
$serverFile = Join-Path $web 'server.js'
$server = Get-Content -Raw -LiteralPath $serverFile
$server = [regex]::Replace($server, '"outputFileTracingRoot":"(?:[^"\\]|\\.)*"', '"outputFileTracingRoot":"."')
$server = $server.Replace('server.listen(currentPort, (err) => {', "server.listen(currentPort, process.env.HOSTNAME || '127.0.0.1', (err) => {")
Set-Content -LiteralPath $serverFile -Value $server -Encoding UTF8

if (!(Test-Path -LiteralPath (Join-Path $package 'BetterMusicParty.exe')) -or !(Test-Path -LiteralPath (Join-Path $package 'web/.next/BUILD_ID'))) { throw 'Release layout is incomplete.' }
if (!$SkipArchive) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = Join-Path $output "$name.zip"
    if (Test-Path -LiteralPath $zip) { throw 'Release archive already exists. Move it aside before rebuilding.' }
    [IO.Compression.ZipFile]::CreateFromDirectory($package, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
    $checksum = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    "$checksum  $name.zip" | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ASCII
}
Write-Output "Package: $package"
Write-Output "Artifacts: $output"
