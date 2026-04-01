$r = Invoke-RestMethod "https://www.reddit.com/r/popculturechat/hot.json?limit=25" -Headers @{"User-Agent"="PPPTVBot/2.0"} -TimeoutSec 10
$galleries = $r.data.children | Where-Object { $_.data.is_gallery -eq $true }
Write-Host "popculturechat galleries: $($galleries.Count)"

$r2 = Invoke-RestMethod "https://www.reddit.com/r/hiphopimages/hot.json?limit=25" -Headers @{"User-Agent"="PPPTVBot/2.0"} -TimeoutSec 10
$g2 = $r2.data.children | Where-Object { $_.data.is_gallery -eq $true }
Write-Host "hiphopimages galleries: $($g2.Count)"

if ($galleries.Count -gt 0) {
    $g = $galleries[0].data
    Write-Host "First gallery title: $($g.title)"
    Write-Host "Images: $($g.media_metadata.PSObject.Properties.Name.Count)"
}
