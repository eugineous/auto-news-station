$svcKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdHhmcXhvbm9uZmRqbmRqYWx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA1NTIyOCwiZXhwIjoyMDkwNjMxMjI4fQ.AokaqBeDzQGYZxOMvsNSuHaCy8Mk721tJPZdyj9yv3E"
$headers = @{"Authorization"="Bearer $svcKey"; "apikey"=$svcKey}

# Count seen articles
$r = Invoke-RestMethod "https://xptxfqxononfdjndjalx.supabase.co/rest/v1/seen_articles?select=count" -Headers ($headers + @{"Prefer"="count=exact"}) -TimeoutSec 10
Write-Host "Seen articles count: $($r)"

# Count posts
$p = Invoke-RestMethod "https://xptxfqxononfdjndjalx.supabase.co/rest/v1/posts?select=id,post_type,posted_at&order=posted_at.desc&limit=10" -Headers $headers -TimeoutSec 10
Write-Host "Recent posts: $($p.Count)"
$p | ForEach-Object { Write-Host "  [$($_.post_type)] $($_.posted_at)" }
