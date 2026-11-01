# Creates a server-source zip containing no .env files or completed firmware secrets.
# Run from the AquaTrace project directory, before uploading to Cloud Shell.
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$names = @('app','components','lib','prisma','public','scripts','tests','package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','postcss.config.mjs','eslint.config.mjs','Dockerfile','.dockerignore','.gcloudignore','cloudbuild.yaml')
$inputs = $names | ForEach-Object { Join-Path $sourceRoot $_ }
$archive = Join-Path $sourceRoot 'aquatrace-cloudrun.zip'
Compress-Archive -LiteralPath $inputs -DestinationPath $archive -Force
Write-Host "Server source packaged at $archive (no .env or firmware secrets)."
