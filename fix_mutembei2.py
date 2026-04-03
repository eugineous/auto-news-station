with open('cloudflare/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_start = '// -- /fetch-mutembei -- Scrapes MutembeiTV Facebook page for videos'
old_end = '// -- /resolve-dailymotion'

start_idx = content.find(old_start)
end_idx = content.find(old_end)

if start_idx < 0 or end_idx < 0:
    print(f'ERROR: markers not found. start={start_idx} end={end_idx}')
    exit(1)

new_block = r"""// -- /fetch-mutembei -- Scrapes MutembeiTV Facebook page for videos (no token needed)
    if (url.pathname === "/fetch-mutembei" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const videos = [];

        // Scrape MutembeiTV Facebook videos page using mobile user agent
        // Mobile FB returns simpler HTML with video data embedded
        const PAGES_TO_TRY = [
          "https://m.facebook.com/MutembeiTV/videos",
          "https://www.facebook.com/MutembeiTV/videos",
        ];

        let html = "";
        for (const pageUrl of PAGES_TO_TRY) {
          try {
            const r = await fetch(pageUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
              },
              signal: AbortSignal.timeout(15000),
              redirect: "follow",
            });
            if (r.ok) { html = await r.text(); break; }
          } catch {}
        }

        if (!html) return json({ videos: [], count: 0, error: "Could not fetch Facebook page" });

        // Extract video IDs from multiple patterns in the HTML
        const seenIds = new Set();

        // Pattern 1: video_id in JSON
        const p1 = /"video_id"\s*:\s*"(\d{10,})"/g;
        // Pattern 2: /videos/NNN in URLs
        const p2 = /\/videos\/(\d{10,})/g;
        // Pattern 3: story_fbid=NNN
        const p3 = /story_fbid=(\d{10,})/g;
        // Pattern 4: "id":"NNN" near video context
        const p4 = /"id"\s*:\s*"(\d{15,})"/g;

        for (const regex of [p1, p2, p3, p4]) {
          let m;
          while ((m = regex.exec(html)) !== null) {
            const id = m[1];
            if (!seenIds.has(id) && id.length >= 10) {
              seenIds.add(id);
              videos.push({
                id: "mutembei:" + id,
                title: "Mutembei TV Video",
                url: "https://www.facebook.com/MutembeiTV/videos/" + id,
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
        }

        return json({ videos: videos.slice(0, 20), count: Math.min(videos.length, 20), htmlLen: html.length });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    """

new_content = content[:start_idx] + new_block + content[end_idx:]
with open('cloudflare/worker.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
print(f'Done. Length: {len(new_content)}')
