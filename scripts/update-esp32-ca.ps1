$certificateResponse = Invoke-WebRequest -Uri 'https://pki.goog/roots.pem'
$certificates = if ($certificateResponse.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($certificateResponse.Content) } else { [string]$certificateResponse.Content }
if (-not $certificates.Contains('-----BEGIN CERTIFICATE-----') -or $certificates.Contains(')PEM"')) { throw 'Unexpected root certificate download. Do not use it.' }
$target = Join-Path $PSScriptRoot '..\firmware\aquatrace_tds_demo\root_ca.h'
$header = "#pragma once`n// Google Trust Services roots, downloaded from https://pki.goog/roots.pem`nconst char GOOGLE_ROOT_CA[] PROGMEM = R`"PEM(`n$certificates`n)PEM`";`n"
[IO.File]::WriteAllText([IO.Path]::GetFullPath($target), $header, [Text.Encoding]::ASCII)
Write-Host 'Updated firmware/aquatrace_tds_demo/root_ca.h from Google Trust Services. Reflash to apply.'
