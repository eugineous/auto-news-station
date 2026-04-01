$h = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$h.Add("Authorization", "Bearer ppptvWorker2024")
$h.Add("Content-Type", "application/json")

Write-Host "=== Video runs ==="
1..3 | ForEach-Object {
    $v = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-video" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
    Write-Host "Run $_ : posted=$($v.posted) msg=$($v.message)"
    if ($v.video) { Write-Host "  $($v.video.title.Substring(0,70)) | IG=$($v.instagram.success) FB=$($v.facebook.success)" }
    Start-Sleep -Seconds 6
}

Write-Host "`n=== Carousel ==="
$c = Invoke-RestMethod -Uri "https://auto-news-station.vercel.app/api/automate-carousel" -Method POST -Headers $h -Body "{}" -TimeoutSec 55
Write-Host "posted=$($c.posted) msg=$($c.message)"

$svcKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdHhmcXhvbm9uZmRqbmRqYWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA1NTIyOCwiZXhwIjoyMDkwNjMxMjI4fQ.AokaqBeDzQGYZxOMvsNSuHaCy8Mk721tJPZdyj9yv3E"
$posts = Invoke-RestMethod -Uri "https://xptxfqxononfdjndjalx.supabase.co/rest/v1/posts?select=title,post_type,ig_success,fb_success&order=posted_at.desc&limit=8" -Headers @{"Authorization" = "Bearer $svcKey"; "apikey" = $svcKey }
Write-Host "`nSupabase ($($posts.Count) posts):"
$posts | ForEach-Object { Write-Host "  [$($_.post_type)] IG=$($_.ig_success) FB=$($_.fb_success) - $($_.title.Substring(0,[Math]::Min(55,$_.title.Length)))" }
