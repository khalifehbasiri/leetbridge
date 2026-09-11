param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [string]$SourceRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourcePath = (Resolve-Path -LiteralPath $SourceRoot).Path
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ZipPath).Path)
try {
    $expected = @('manifest.json')
    foreach ($directory in @('background', 'content', 'github', 'popup')) {
        $expected += Get-ChildItem -LiteralPath (Join-Path $sourcePath $directory) -File -Recurse |
            ForEach-Object { [System.IO.Path]::GetRelativePath($sourcePath, $_.FullName).Replace('\', '/') }
    }
    $expected += @('resources/icon16.png', 'resources/icon32.png', 'resources/icon48.png', 'resources/icon128.png')
    $actual = @($archive.Entries | ForEach-Object FullName)
    if (@(Compare-Object $expected $actual).Count -ne 0) {
        throw 'ZIP contents do not match the runtime file allowlist'
    }
    if (@($actual | Select-Object -Unique).Count -ne $actual.Count) { throw 'Duplicate ZIP entry' }

    foreach ($entry in $archive.Entries) {
        $stream = $entry.Open()
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        try {
            $entryHash = [Convert]::ToHexString($hasher.ComputeHash($stream))
            $sourceHash = (Get-FileHash -LiteralPath (Join-Path $sourcePath $entry.FullName) -Algorithm SHA256).Hash
            if ($entryHash -ne $sourceHash) { throw "ZIP/source mismatch: $($entry.FullName)" }
        } finally { $stream.Dispose(); $hasher.Dispose() }
    }

    $reader = [System.IO.StreamReader]::new($archive.GetEntry('manifest.json').Open())
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($manifest.manifest_version -ne 3) { throw 'Expected Manifest V3' }
    if ($manifest.version -ne '1.0.4') { throw 'Unexpected release version' }
    $entryPoints = @($manifest.background.service_worker, $manifest.action.default_popup)
    $entryPoints += $manifest.content_scripts | ForEach-Object { $_.js }
    $entryPoints += $manifest.icons.PSObject.Properties.Value
    foreach ($path in $entryPoints) {
        if ($path -notin $actual) { throw "Missing manifest entry point: $path" }
    }
    if (@(Compare-Object @('activeTab', 'storage') @($manifest.permissions)).Count -ne 0) {
        throw 'Unexpected permission change'
    }
    foreach ($htmlPath in @('popup/popup.html', 'github/connect.html')) {
        $reader = [System.IO.StreamReader]::new($archive.GetEntry($htmlPath).Open())
        try { $html = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($match in [regex]::Matches($html, '(?:src|href)="([^"#]+)"')) {
            $resource = $match.Groups[1].Value
            if ($resource -match '^[a-z]+:') { continue }
            $resourcePath = [System.IO.Path]::GetFullPath((Join-Path (Split-Path (Join-Path $sourcePath $htmlPath)) $resource))
            $relativePath = [System.IO.Path]::GetRelativePath($sourcePath, $resourcePath).Replace('\', '/')
            if ($relativePath -notin $actual) { throw "Missing HTML resource: $relativePath" }
        }
    }
    [pscustomobject]@{
        version = $manifest.version
        manifestVersion = $manifest.manifest_version
        files = $actual.Count
        everyFileMatchesSource = $true
        manifestAndHtmlResourcesPresent = $true
        permissionsUnchanged = $true
        testsAndCredentialsExcluded = $true
        sha256 = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
    } | ConvertTo-Json
} finally { $archive.Dispose() }
