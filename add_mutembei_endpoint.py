with open('cloudflare/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add the /fetch-mutembei endpoint before /resolve-dailymotion
insert_before = '// -- /resolve-dailymotion'

new_endpoint = r"""// -- /fetch-mutembei -- Scrapes MutembeiTV Facebook page for videos
    if (url.pathname === "/fetch-mutembei" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const videos = [];

        // Try Facebook Graph API first (if token available in env)
        const fbToken = env.FACEBOOK_ACCESS_TOKEN;
        if (fbToken) {
          try {
            const r = await fetch(
              "https://graph.facebook.com/v19.0/MutembeiTV/videos?fields=id,title,description,source,created_time,thumbnails&limit=25&access_token=" + fbToken,
              { signal: AbortSignal.timeout(10000) }
            );
            if (r.ok) {
              const data = await r.json();
              for (const v of (data.data || [])) {
                const ageHours = (Date.now() - new Date(v.created_time).getTime()) / 3600000;
                if (ageHours > 72) continue;
                videos.push({
                  id: "mutembei:" + v.id,
                  title: v.title || v.description || "Mutembei TV Video",
                  url: "https://www.facebook.com/MutembeiTV/videos/" + v.id,
                  directVideoUrl: v.source || null,
                  thumbnail: v.thumbnails?.data?.[0]?.uri || "",
                  publishedAt: new Date(v.created_time).toISOString(),
                  sourceName: "Mutembei TV",
                  sourceType: "direct-mp4",
                  category: "ENTERTAINMENT",
                  playCount: 0,
                });
              }
              if (videos.length > 0) return json({ videos, count: videos.length, source: "graph-api" });
            }
          } catch {}
        }

        // Fallback: scrape the public Facebook page HTML
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
        const videoIdRegex = /"video_id":"(\d{10,})"/g;
        const videoUrlRegex = /\/videos\/(\d{10,})/g;
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

        return json({ videos: videos.slice(0, 25), count: Math.min(videos.length, 25), source: "html-scrape" });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    """

content = content.replace(insert_before, new_endpoint + insert_before)

with open('cloudflare/worker.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done, length:', len(content))
