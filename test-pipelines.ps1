$h = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$h.Add("Authorization", "Bearer ppptvWorker2024")
$h.Add("Content-Type", "application/json")

Write-Host "=== Video Pipeline ==="
$v = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-video" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "posted=$($v.posted) message=$($v.message)"
if ($v.video) { Write-Host "VIDEO: $($v.video.title.Substring(0,80))" }
if ($v.instagram) { Write-Host "IG=$($v.instagram.success) FB=$($v.facebook.success)" }

Start-Sleep -Seconds 8

Write-Host "`n=== Image Pipeline ==="
$i = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "posted=$($i.posted) skipped=$($i.skipped) errors=$($i.errors.Count)"

Start-Sleep -Seconds 8

Write-Host "`n=== Carousel Pipeline ==="
$c = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-carousel" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "posted=$($c.posted) message=$($c.message)"

Write-Host "`n=== Supabase Posts ==="
$svcKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdHhmcXhvbm9uZmRqbmRqYWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA1NTIyOCwiZXhwIjoyMDkwNjMxMjI4fQ.AokaqBeDzQGYZxOMvsNSuHaCy8Mk721tJPZdyj9yv3E"
$posts = Invoke-RestMethod -Uri "https://xptxfqxononfdjndjalx.supabase.co/rest/v1/posts?select=title,posted_at&order=posted_at.desc&limit=3" -Headers @{"Authorization" = "Bearer $svcKey"; "apikey" = $svcKey }
Write-Host "Posts in Supabase: $($posts.Count)"
$posts | ForEach-Object { Write-Host "  $($_.posted_at) - $($_.title.Substring(0,60))" }
