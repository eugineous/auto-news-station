$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("Authorization", "Bearer ppptvWorker2024")
$headers.Add("Content-Type", "application/json")

Write-Host "=== Video Pipeline ==="
try {
    $v = Invoke-WebRequest -Uri "https://auto-news-station.vercel.app/api/automate-video" -Method POST -Headers $headers -Body "{}" -TimeoutSec 55 -UseBasicParsing
    Write-Host $v.Content
} catch { Write-Host "Error: $($_.Exception.Message)" }

Start-Sleep -Seconds 5

Write-Host "=== Image Pipeline ==="
try {
    $i = Invoke-WebRequest -Uri "https://auto-news-station.vercel.app/api/automate" -Method POST -Headers $headers -Body "{}" -TimeoutSec 55 -UseBasicParsing
    Write-Host $i.Content
} catch { Write-Host "Error: $($_.Exception.Message)" }

Start-Sleep -Seconds 5

Write-Host "=== Carousel Pipeline ==="
try {
    $c = Invoke-WebRequest -Uri "https://auto-news-station.vercel.app/api/automate-carousel" -Method POST -Headers $headers -Body "{}" -TimeoutSec 55 -UseBasicParsing
    Write-Host $c.Content
} catch { Write-Host "Error: $($_.Exception.Message)" }

Write-Host "=== Agent Log ==="
$log = Invoke-RestMethod "https://auto-ppp-tv.euginemicah.workers.dev/agent/log" -Headers $headers
$log.log | Select-Object -First 5 | ForEach-Object { Write-Host "  $($_.ts) [$($_.type)] posted=$($_.posted)" }
