$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'MusicParty'
$frontend = Join-Path $root 'music-party'

function Wait-ForService($url, $process, $seconds, $name) {
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(2)
    try {
        for ($i = 0; $i -lt $seconds; $i++) {
            $process.Refresh()
            if ($process.HasExited) {
                throw "$name stopped before it became ready."
            }
            try {
                $response = $client.GetAsync($url).GetAwaiter().GetResult()
                $response.Dispose()
                Write-Host "$name is ready."
                return
            }
            catch {
                Start-Sleep -Seconds 1
            }
        }
        throw "$name did not become ready within $seconds seconds."
    }
    finally {
        $client.Dispose()
    }
}

$cookiePath = Join-Path $env:LOCALAPPDATA 'MusicPartyLauncher\owner-cookie.bin'
$cookieEntropy = [Text.Encoding]::UTF8.GetBytes('MusicPartyLauncher.OwnerCookie.v1')
$cookiePtr = [IntPtr]::Zero
$cookieBytes = $null
if (Test-Path -LiteralPath $cookiePath) {
    try {
        $cookieBytes = [Security.Cryptography.ProtectedData]::Unprotect(
            [IO.File]::ReadAllBytes($cookiePath), $cookieEntropy,
            [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $cookie = [Text.Encoding]::UTF8.GetString($cookieBytes)
    }
    catch {
        Write-Warning 'Saved Cookie could not be decrypted; enter it again.'
    }
}
if ([string]::IsNullOrWhiteSpace($cookie)) {
    $secureCookie = Read-Host 'Enter your NetEase Cloud Music Cookie (input is hidden)' -AsSecureString
    $cookiePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCookie)
    $cookie = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($cookiePtr)
}
$processes = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

try {
    $env:MusicApi__NeteaseCloudMusic__Enabled = 'true'
    $env:MusicApi__NeteaseCloudMusic__ApiServerUrl = 'http://127.0.0.1:3002'
    $env:MusicApi__NeteaseCloudMusic__Cookie = $cookie
    $env:MusicApi__QQMusic__Enabled = 'false'
    $env:MusicApi__Bilibili__Enabled = 'false'
    $env:FrontEndUrl = 'http://127.0.0.1:3001'
    $env:ASPNETCORE_URLS = 'http://127.0.0.1:5000'
    $env:PORT = '3002'

    $netease = Start-Process -FilePath 'npx.cmd' -ArgumentList '--yes NeteaseCloudMusicApi@latest' -WorkingDirectory $root -PassThru
    $processes.Add($netease)
    Wait-ForService 'http://127.0.0.1:3002' $netease 180 'NetEase API'

    $web = Start-Process -FilePath 'pnpm.cmd' -ArgumentList 'start -- --hostname 127.0.0.1 --port 3001' -WorkingDirectory $frontend -PassThru
    $processes.Add($web)
    Wait-ForService 'http://127.0.0.1:3001' $web 60 'MusicParty frontend'

    $api = Start-Process -FilePath 'dotnet.exe' -ArgumentList 'run --configuration Release --no-build --no-launch-profile' -WorkingDirectory $backend -PassThru
    $processes.Add($api)
    Wait-ForService 'http://127.0.0.1:5000/Api/MusicServices' $api 90 'MusicParty backend'

    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($cookiePath)) | Out-Null
    $protectedCookie = [Security.Cryptography.ProtectedData]::Protect(
        [Text.Encoding]::UTF8.GetBytes($cookie), $cookieEntropy,
        [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($cookiePath, $protectedCookie)

    Write-Host 'MusicParty is listening at http://127.0.0.1:5000.'
    Write-Host 'Point your SakuraFrp HTTP tunnel to 127.0.0.1:5000. Keep this window open; press Enter here to stop MusicParty.'
    Read-Host | Out-Null
}
finally {
    foreach ($process in $processes) {
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item Env:MusicApi__NeteaseCloudMusic__Cookie -ErrorAction SilentlyContinue
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
    Remove-Item Env:ASPNETCORE_URLS -ErrorAction SilentlyContinue
    Remove-Item Env:FrontEndUrl -ErrorAction SilentlyContinue
    Remove-Item Env:MusicApi__NeteaseCloudMusic__ApiServerUrl -ErrorAction SilentlyContinue
    Remove-Item Env:MusicApi__NeteaseCloudMusic__Enabled -ErrorAction SilentlyContinue
    Remove-Item Env:MusicApi__QQMusic__Enabled -ErrorAction SilentlyContinue
    Remove-Item Env:MusicApi__Bilibili__Enabled -ErrorAction SilentlyContinue
    if ($cookiePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($cookiePtr) }
    if ($null -ne $cookieBytes) { [Array]::Clear($cookieBytes, 0, $cookieBytes.Length) }
    $cookie = $null
}
