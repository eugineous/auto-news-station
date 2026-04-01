Start-Sleep -Seconds 90
$h = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$h.Add("Authorization", "Bearer ppptvWorker2024")
$h.Add("Content-Type", "application/json")

Write-Host "=== Image Pipeline ==="
$i = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "posted=$($i.posted) skipped=$($i.skipped) errors=$($i.errors.Count)"

Start-Sleep -Seconds 8

Write-Host "=== Video Pipeline ==="
$v = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-video" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "posted=$($v.posted) msg=$($v.message)"
if ($v.video) { Write-Host "  VIDEO: $($v.video.title.Substring(0,70))" }
if ($v.instagram) { Write-Host "  IG=$($v.instagram.success) FB=$($v.facebook.success)" }

Start-Sleep -Seconds 8

Write-Host "=== Carousel Pipeline ==="
$c = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-carousel" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "posted=$($c.posted) msg=$($c.message)"

Write-Host "=== Supabase Posts ==="
$svcKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdHhmcXhvbm9uZmRqbmRqYWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA1NTIyOCwiZXhwIjoyMDkwNjMxMjI4fQ.AokaqBeDzQGYZxOMvsNSuHaCy8Mk721tJPZdyj9yv3E"
$posts = Invoke-RestMethod -Uri "https://xptxfqxononfdjndjalx.supabase.co/rest/v1/posts?select=title,posted_at,post_type&order=posted_at.desc&limit=5" -Headers @{"Authorization" = "Bearer $svcKey"; "apikey" = $svcKey }
Write-Host "Posts in Supabase: $($posts.Count)"
$posts | ForEach-Object { Write-Host "  [$($_.post_type)] $($_.posted_at) - $($_.title.Substring(0,[Math]::Min(60,$_.title.Length)))" }
