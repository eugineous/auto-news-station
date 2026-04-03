with open('cloudflare/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''        // Fallback: scrape the public Facebook page HTML
        const r = await fetch("https://www.facebook.com/MutembeiTV/videos", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) return json({ videos: [], count: 0, error: "FB page fetch failed: " + r.status });
        const html = await r.text();

        // Extract video IDs from the page HTML
        const videoIdRegex = /"video_id":"(\\d{10,})"/g;
        const videoUrlRegex = /\\/videos\\/(\\d{10,})/g;
        const seenIds = new Set();
        let match;

        while ((match = videoIdRegex.exec(html)) !== null) {
          if (!seenIds.has(match[1])) {
            seenIds.add(match[1]);
            videos.push({
              id: "mutembei:" + match[1],
              title: "Mutembei TV Video",
              url: "https://www.facebook.com/MutembeiTV/videos/" + match[1],
              directVideoUrl: null,
              thumbnail: "",
              publishedAt: new Date().toISOString(),
              sourceName: "Mutembei TV",
              sourceType: "facebook",
              category: "ENTERTAINMENT",
              playCount: 0,
            });
          }
        }
        while ((match = videoUrlRegex.exec(html)) !== null) {
          if (!seenIds.has(match[1])) {
            seenIds.add(match[1]);
            videos.push({
              id: "mutembei:" + match[1],
              title: "Mutembei TV Video",
              url: "https://www.facebook.com/MutembeiTV/videos/" + match[1],
              directVideoUrl: null,
              thumbnail: "",
              publishedAt: new Date().toISOString(),
              sourceName: "Mutembei TV",
              sourceType: "facebook",
              category: "ENTERTAINMENT",
              playCount: 0,
            });
          }
        }

        return json({ videos: videos.slice(0, 25), count: Math.min(videos.length, 25), source: "html-scrape" });'''

new = '''        // Fallback: use Facebook Graph API with page token to get MutembeiTV videos
        // The page token must have pages_read_engagement permission
        // Try fetching via page ID search first
        const searchRes = await fetch(
          "https://graph.facebook.com/v19.0/search?q=MutembeiTV&type=page&fields=id,name&access_token=" + fbToken,
          { signal: AbortSignal.timeout(8000) }
        ).catch(() => null);

        let mutembeiPageId = "MutembeiTV";
        if (searchRes && searchRes.ok) {
          const sd = await searchRes.json().catch(() => ({}));
          const page = (sd.data || []).find(p => p.name && p.name.toLowerCase().includes("mutembei"));
          if (page) mutembeiPageId = page.id;
        }

        // Try fetching videos with the resolved page ID
        const vidRes = await fetch(
          "https://graph.facebook.com/v19.0/" + mutembeiPageId + "/videos?fields=id,title,description,source,created_time&limit=25&access_token=" + fbToken,
          { signal: AbortSignal.timeout(10000) }
        ).catch(() => null);

        if (vidRes && vidRes.ok) {
          const vd = await vidRes.json().catch(() => ({}));
          for (const v of (vd.data || [])) {
            const ageHours = (Date.now() - new Date(v.created_time).getTime()) / 3600000;
            if (ageHours > 72) continue;
            videos.push({
              id: "mutembei:" + v.id,
              title: v.title || v.description || "Mutembei TV Video",
              url: "https://www.facebook.com/MutembeiTV/videos/" + v.id,
              directVideoUrl: v.source || null,
              thumbnail: "",
              publishedAt: new Date(v.created_time).toISOString(),
              sourceName: "Mutembei TV",
              sourceType: v.source ? "direct-mp4" : "facebook",
              category: "ENTERTAINMENT",
              playCount: 0,
            });
          }
        }

        if (videos.length === 0) {
          return json({ videos: [], count: 0, error: "No videos found - token may lack pages_read_engagement permission for MutembeiTV" });
        }

        return json({ videos: videos.slice(0, 25), count: Math.min(videos.length, 25), source: "graph-api-search" });'''

if old in content:
    content = content.replace(old, new)
    with open('cloudflare/worker.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed MutembeiTV endpoint')
else:
    print('ERROR: old string not found')
    # Find approximate location
    idx = content.find('Fallback: scrape the public Facebook page HTML')
    print(f'Fallback text found at: {idx}')
