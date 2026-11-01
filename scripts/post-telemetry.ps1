param([string]$BaseUrl = $env:APP_URL, [string]$DeviceId = 'S04')
# The secret is read from environment, never embedded in the command or file.
$deviceSecret = [Environment]::GetEnvironmentVariable("DEVICE_KEY_$DeviceId")
if (-not $deviceSecret) { throw "Set DEVICE_KEY_$DeviceId in this terminal first." }
$payload = @{ deviceId=$DeviceId; timestamp=[DateTime]::UtcNow.ToString('o'); turbidityNtu=4.8; tdsPpm=215.4; temperatureC=22.6; raw=@{turbidityAdc=1840;tdsAdc=1260}; firmwareVersion='1.0.0' } | ConvertTo-Json
Invoke-RestMethod -Uri "$BaseUrl/api/telemetry" -Method Post -ContentType 'application/json' -Headers @{'X-Device-Key'=$deviceSecret} -Body $payload
