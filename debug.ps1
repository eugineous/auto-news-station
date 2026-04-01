# Test TikWM
$body = "keywords=nairobi&count=5&cursor=0"
$r = Invoke-RestMethod -Uri "https://www.tikwm.com/api/feed/search" -Method POST -ContentType "application/x-www-form-urlencoded" -Body $body -TimeoutSec 10
Write-Host "TikWM nairobi: code=$($r.code) videos=$($r.data.videos.Count)"

$body2 = "keywords=celebrity+news&count=5&cursor=0"
$r2 = Invoke-RestMethod -Uri "https://www.tikwm.com/api/feed/search" -Method POST -ContentType "application/x-www-form-urlencoded" -Body $body2 -TimeoutSec 10
Write-Host "TikWM celebrity news: code=$($r2.code) videos=$($r2.data.videos.Count)"
if ($r2.data.videos.Count -gt 0) {
    $v = $r2.data.videos[0]
    Write-Host "First video: $($v.title.Substring(0,60))"
    Write-Host "play url: $($v.play.Substring(0,60))"
}

# Test Reddit gallery
$rg = Invoke-RestMethod -Uri "https://www.reddit.com/r/popculturechat/hot.json?limit=25" -Headers @{"User-Agent" = "PPPTVBot/2.0" } -TimeoutSec 10
$galleries = $rg.data.children | Where-Object { $_.data.is_gallery -eq $true }
Write-Host "`nReddit popculturechat galleries: $($galleries.Count)"
if ($galleries.Count -gt 0) {
    $g = $galleries[0].data
    Write-Host "Title: $($g.title)"
    $keys = $g.media_metadata.PSObject.Properties.Name
    Write-Host "Images: $($keys.Count)"
    $first = $g.media_metadata.($keys[0])
    Write-Host "First image status: $($first.status) type: $($first.e)"
    Write-Host "URL: $($first.s.u.Substring(0,80))"
}
