$subs = @("popculturechat", "MusicAlbumArt", "SquaredCircle", "entertainment", "Music", "hiphopimages", "AfricanMusic", "Kenya", "nba", "soccer", "PublicFreakout", "nextfuckinglevel")
foreach ($sub in $subs) {
    try {
        $r = Invoke-RestMethod -Uri "https://www.reddit.com/r/$sub/hot.json?limit=25" -Headers @{"User-Agent" = "PPPTVBot/2.0" } -TimeoutSec 8
        $count = ($r.data.children | Where-Object { $_.data.is_gallery -eq $true }).Count
        Write-Host "$sub : $count galleries"
    }
    catch { Write-Host "$sub : ERROR" }
}
