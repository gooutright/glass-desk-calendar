param([switch]$AppOnly)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot -Parent
$build = Join-Path $root 'build'
$app = Join-Path $build 'app'
$dist = Join-Path $root 'dist'
$packages = Join-Path $root 'packages'
foreach ($dir in $build,$app,$dist,$packages,(Join-Path $app 'web')) { [void][IO.Directory]::CreateDirectory($dir) }
function Expand-Tool($name,$url,$sha,$marker) {
    $archive = Join-Path $packages ($name + '.zip')
    $folder = Join-Path $packages $name
    if (!(Test-Path -LiteralPath $archive)) {
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile "$archive.download"
        if ((Get-FileHash "$archive.download").Hash -ne $sha) { throw "Unexpected SHA-256 for $name" }
        Move-Item -LiteralPath "$archive.download" -Destination $archive -Force
    }
    if ((Get-FileHash $archive).Hash -ne $sha) { throw "Cached archive has an unexpected SHA-256: $name" }
    if (!(Test-Path -LiteralPath (Join-Path $folder $marker))) { [IO.Compression.ZipFile]::ExtractToDirectory($archive,$folder) }
    return $folder
}
$sdk = Expand-Tool 'webview2' 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4314.35/microsoft.web.webview2.1.0.4314.35.nupkg' '90778DEB1B77E36292828B4B5833C9255C27533F40E0DDD55891AE718944EDC4' 'lib/net462/Microsoft.Web.WebView2.Wpf.dll'
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
$icon = Join-Path $build 'calendar.ico'
& (Join-Path $PSScriptRoot 'icon.ps1') -Path $icon
$references = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.Xaml.dll') | ForEach-Object { Join-Path $framework $_ }
$references += @('WindowsBase.dll','PresentationCore.dll','PresentationFramework.dll') | ForEach-Object { Join-Path $framework ('WPF/'+$_) }
$references += @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.Wpf.dll') | ForEach-Object { Join-Path $sdk ('lib/net462/'+$_) }
$arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+','/utf8output','/codepage:65001',"/win32icon:$icon",('/win32manifest:'+(Join-Path $root 'windows/app.manifest')),('/out:'+(Join-Path $app 'GlassDeskCalendar.exe')))
$arguments += $references | ForEach-Object { "/reference:$_" }
$arguments += (Get-ChildItem -LiteralPath (Join-Path $root 'windows') -Filter '*.cs').FullName
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw "C# compilation failed ($LASTEXITCODE)" }
foreach ($name in 'Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.Wpf.dll') { Copy-Item -LiteralPath (Join-Path $sdk "lib/net462/$name") -Destination $app -Force }
Copy-Item -LiteralPath (Join-Path $sdk 'runtimes/win-x64/native/WebView2Loader.dll'),(Join-Path $root 'windows/GlassDeskCalendar.exe.config') -Destination $app -Force
foreach ($name in 'LICENSE','NOTICE') { Copy-Item -LiteralPath (Join-Path $sdk "$name.txt") -Destination (Join-Path $app "WebView2-$name.txt") -Force }
[void][IO.Directory]::CreateDirectory((Join-Path $app 'web/vendor'))
foreach ($name in 'index.html','calendar.css','desktop.css','calendar.js','projects.css','projects.js','folder-layout.js','dock.html','note-format.css','rich-note.js','vendor/quill.js','vendor/quill.core.css','vendor/Quill-LICENSE.txt','vendor/quill.js.LICENSE.txt') {
    Copy-Item -LiteralPath (Join-Path $root "web/$name") -Destination (Join-Path $app "web/$name") -Force
}
if ($AppOnly) { Write-Output (Join-Path $app 'GlassDeskCalendar.exe'); return }

$wix = Expand-Tool 'wix314' 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip' '6AC824E1642D6F7277D0ED7EA09411A508F6116BA6FAE0AA5F2C7DAA2FF43D31' 'candle.exe'
$name = 'GlassDeskCalendar-1.3.1-win-x64'
$object = Join-Path $build 'installer.wixobj'
$installerManifest = Join-Path $root 'packaging/installer.wxs'
& (Join-Path $wix 'candle.exe') -nologo -arch x64 "-dAppDir=$app" "-dIcon=$icon" -out $object $installerManifest
if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed ($LASTEXITCODE)" }
& (Join-Path $wix 'light.exe') -nologo -sval -spdb -out (Join-Path $dist "$name.msi") $object
if ($LASTEXITCODE -ne 0) { throw "MSI linking failed ($LASTEXITCODE)" }
$zip = Join-Path $dist "$name-portable.zip"
$tmp = Join-Path $build 'portable.new.zip'
if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp }
# Both packages use the installer's file list. Local exports or images left in
# the build directory must never become part of a portable download.
$manifest = New-Object System.Xml.XmlDocument
$manifest.Load($installerManifest)
$prefix = '$(var.AppDir)/'
$archive = [IO.Compression.ZipFile]::Open($tmp,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $manifest.SelectNodes('//*[local-name()="File"]')) {
        $source = $file.GetAttribute('Source')
        if (!$source.StartsWith($prefix,[StringComparison]::Ordinal)) { throw "Unexpected installer source: $source" }
        $nameInZip = $source.Substring($prefix.Length).Replace('\','/')
        if ([IO.Path]::IsPathRooted($nameInZip) -or $nameInZip.Split('/') -contains '..') { throw "Invalid package path: $nameInZip" }
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $app $nameInZip), $nameInZip, [IO.Compression.CompressionLevel]::Optimal)
    }
} finally { $archive.Dispose() }
Move-Item -LiteralPath $tmp -Destination $zip -Force
$lines = @("$name.msi","$name-portable.zip") | ForEach-Object {
    (Get-FileHash (Join-Path $dist $_)).Hash.ToLowerInvariant() + '  ' + $_
}
[IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'), ($lines -join "`n") + "`n", [Text.Encoding]::ASCII)
$lines
