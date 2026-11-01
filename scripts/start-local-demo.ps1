param([Parameter(Mandatory=$true)][string]$ComputerIp)
$ErrorActionPreference='Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $workspaceRoot
function Test-LocalPort([int]$Port){
 $client=[Net.Sockets.TcpClient]::new()
 try { $pending=$client.ConnectAsync('127.0.0.1',$Port);if(-not $pending.Wait(1000)){return $false};return $client.Connected } catch {return $false} finally {$client.Dispose()}
}
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw 'Install Node.js 22 LTS first, then reopen PowerShell.'}
if(-not(Test-Path node_modules)){& npm.cmd ci;if($LASTEXITCODE -ne 0){throw 'Dependency installation failed'}}
& node scripts/prepare-local-device.mjs $ComputerIp
if($LASTEXITCODE -ne 0){throw 'Device configuration failed'}
if(-not(Test-LocalPort 55432)){
 $databaseServer=Join-Path $workspaceRoot 'tmp\qa\node_modules\@embedded-postgres\windows-x64\native\bin\postgres.exe'
 if(-not(Test-Path -LiteralPath $databaseServer)-or -not(Test-Path -LiteralPath '.local-db\PG_VERSION')){throw 'The workspace local PostgreSQL runtime is missing. See docs/LOCAL_WIFI_START_HERE.md for the PostgreSQL/Docker alternative.'}
 Start-Process -FilePath $databaseServer -ArgumentList '-D .local-db -h 127.0.0.1 -p 55432' -WorkingDirectory $workspaceRoot -WindowStyle Hidden -RedirectStandardOutput tmp\local-db.out.log -RedirectStandardError tmp\local-db.err.log
 for($attempt=0;$attempt -lt 15 -and -not(Test-LocalPort 55432);$attempt++){Start-Sleep -Seconds 1}
 if(-not(Test-LocalPort 55432)){throw 'PostgreSQL did not start. Inspect tmp/local-db.err.log.'}
}
if(Test-LocalPort 3000){throw 'An app is already using port 3000. Stop the existing AquaTrace terminal with Ctrl+C, then rerun this command.'}
& npm.cmd run db:migrate
if($LASTEXITCODE -ne 0){throw 'Database migration failed'}
& npx.cmd tsx --env-file=.env scripts/setup-local-demo.ts
if($LASTEXITCODE -ne 0){throw 'Local account/device setup failed'}
Write-Host 'Open http://localhost:3000/admin/login on this laptop.'
Write-Host 'Keep this terminal open. Do not run demo:stream when using physical S04.'
& npm.cmd run dev
