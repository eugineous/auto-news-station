$BASE = "https://auto-news-station.vercel.app/api/clipper/analyze"
$H = @{"Content-Type"="application/json"; "Authorization"="Bearer ppptvWorker2024"}

$TESTS = @(
  @{ name="Joe Rogan short clip";    url="https://www.youtube.com/watch?v=bqIxCtEveG8" },
  @{ name="TED Talk - Simon Sinek";  url="https://www.youtube.com/watch?v=qp0HIF3SfI4" },
  @{ name="MrBeast video";           url="https://www.youtube.com/watch?v=XY5BgBHFQok" },
  @{ name="Lex Fridman podcast";     url="https://www.youtube.com/watch?v=e0aqqmcharE" },
  @{ name="Andrew Huberman";         url="https://www.youtube.com/watch?v=SwQhKFMxmDY" }
)

foreach ($t in $TESTS) {
  Write-Host "`n=== $($t.name) ===" -ForegroundColor Cyan
  Write-Host "URL: $($t.url)"
  try {
    $body = "{`"url`":`"$($t.url)`"}"
    $r = Invoke-WebRequest -Uri $BASE -Method POST -Headers $H -Body $body -TimeoutSec 65 -UseBasicParsing -ErrorAction Stop
    $json = $r.Content | ConvertFrom-Json
    if ($json.error) {
      Write-Host "FAIL: $($json.error)" -ForegroundColor Red
    } else {
      Write-Host "OK: $($json.clips.Count) clips found | title: $($json.title)" -ForegroundColor Green
      $json.clips | ForEach-Object { Write-Host "  [$($_.startSec)s-$($_.endSec)s] score=$($_.viralScore) | $($_.hook)" }
    }
  } catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Seconds 3
}
