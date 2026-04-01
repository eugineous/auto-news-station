Start-Sleep -Seconds 90
$h = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$h.Add("Authorization", "Bearer ppptvWorker2024")
$h.Add("Content-Type", "application/json")

Invoke-RestMethod -Uri "https://auto-ppp-tv.euginemicah.workers.dev/trigger" -Method POST -Headers $h -TimeoutSec 5 | Out-Null
Write-Host "Worker triggered"

$v = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-video" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "Video: posted=$($v.posted) msg=$($v.message)"
if ($v.video) { Write-Host "  $($v.video.title.Substring(0,70))" }
if ($v.instagram) { Write-Host "  IG=$($v.instagram.success) FB=$($v.facebook.success)" }

Start-Sleep -Seconds 5

$i = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "Image: posted=$($i.posted) skipped=$($i.skipped)"

Start-Sleep -Seconds 5

$c = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-carousel" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "Carousel: posted=$($c.posted) msg=$($c.message)"

$svcKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdHhmcXhvbm9uZmRqbmRqYWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA1NTIyOCwiZXhwIjoyMDkwNjMxMjI4fQ.AokaqBeDzQGYZxOMvsNSuHaCy8Mk721tJPZdyj9yv3E"
$posts = Invoke-RestMethod -Uri "https://xptxfqxononfdjndjalx.supabase.co/rest/v1/posts?select=title,posted_at,post_type,ig_success,fb_success&order=posted_at.desc&limit=5" -Headers @{"Authorization" = "Bearer $svcKey"; "apikey" = $svcKey }
Write-Host "`nSupabase posts: $($posts.Count)"
$posts | ForEach-Object { Write-Host "  [$($_.post_type)] IG=$($_.ig_success) FB=$($_.fb_success) - $($_.title.Substring(0,[Math]::Min(55,$_.title.Length)))" }
