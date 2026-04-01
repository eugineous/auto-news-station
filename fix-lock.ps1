$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("Authorization", "Bearer ppptvWorker2024")
$headers.Add("Content-Type", "application/json")

# Release the pipeline lock
$r = Invoke-WebRequest -Uri "https://auto-ppp-tv.euginemicah.workers.dev/lock/release" -Method POST -Headers $headers -Body '{"key":"pipeline:lock"}' -UseBasicParsing
Write-Host "Lock release: $($r.Content)"

Start-Sleep -Seconds 3

# Fire image pipeline
$i = Invoke-WebRequest -Uri "https://auto-news-station.vercel.app/api/automate" -Method POST -Headers $headers -Body "{}" -TimeoutSec 55 -UseBasicParsing
Write-Host "Image: $($i.Content)"

Start-Sleep -Seconds 5

# Fire video pipeline again
$v = Invoke-WebRequest -Uri "https://auto-news-station.vercel.app/api/automate-video" -Method POST -Headers $headers -Body "{}" -TimeoutSec 55 -UseBasicParsing
Write-Host "Video: $($v.Content)"

Start-Sleep -Seconds 5

# Fire carousel
$c = Invoke-WebRequest -Uri "https://auto-news-station.vercel.app/api/automate-carousel" -Method POST -Headers $headers -Body "{}" -TimeoutSec 55 -UseBasicParsing
Write-Host "Carousel: $($c.Content)"
