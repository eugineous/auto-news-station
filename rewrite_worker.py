with open('cloudflare/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('// -- /fetch-videos')
end = content.find('// -- /resolve-dailymotion')

new_block = r"""// -- /fetch-videos -- Fetches videos from TikTok + Reddit + Dailymotion
    if (url.pathname === "/fetch-videos" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const videos = [];

        // TikTok via TikWM user feed (best quality, full audio)
        const TIKTOK_ACCOUNTS = [
          { u: "citizen.digital",       cat: "ENTERTAINMENT" },
          { u: "tukokenya",             cat: "ENTERTAINMENT" },
          { u: "ntvkenya",              cat: "ENTERTAINMENT" },
          { u: "spmbuzz",               cat: "CELEBRITY"     },
          { u: "pulselive_ke",          cat: "ENTERTAINMENT" },
          { u: "ghafla",                cat: "CELEBRITY"     },
          { u: "kenya.news.arena",      cat: "ENTERTAINMENT" },
          { u: "thenewsguyke",          cat: "ENTERTAINMENT" },
          { u: "sheyii_given",          cat: "ENTERTAINMENT" },
          { u: "urbannewsgang",         cat: "ENTERTAINMENT" },
          { u: "bongotrending",         cat: "ENTERTAINMENT" },
          { u: "tanzaniaentertainment", cat: "ENTERTAINMENT" },
          { u: "harmonize_tz",          cat: "MUSIC"         },
          { u: "zuchu_official",        cat: "MUSIC"         },
          { u: "nbs_television",        cat: "ENTERTAINMENT" },
          { u: "ntvuganda",             cat: "ENTERTAINMENT" },
          { u: "bellanaija",            cat: "CELEBRITY"     },
          { u: "pulse.nigeria",         cat: "ENTERTAINMENT" },
          { u: "instablog9ja",          cat: "CELEBRITY"     },
          { u: "tmz",                   cat: "CELEBRITY"     },
          { u: "theshaderoom",          cat: "CELEBRITY"     },
          { u: "enews",                 cat: "CELEBRITY"     },
          { u: "complex",               cat: "MUSIC"         },
          { u: "hotnewhiphop",          cat: "MUSIC"         },
          { u: "billboard",             cat: "MUSIC"         },
          { u: "espn",                  cat: "SPORTS"        },
          { u: "skysportsnews",         cat: "SPORTS"        },
          { u: "goal",                  cat: "SPORTS"        },
          { u: "bleacherreport",        cat: "SPORTS"        },
          { u: "variety",               cat: "TV & FILM"     },
          { u: "aljazeeraenglish",      cat: "ENTERTAINMENT" },
          { u: "bbcnews",               cat: "ENTERTAINMENT" },
          { u: "cnn",                   cat: "ENTERTAINMENT" },
          { u: "dylan.page",            cat: "ENTERTAINMENT" },
          { u: "fabrizioromano",        cat: "SPORTS"        },
        ];
        const selected = [...TIKTOK_ACCOUNTS].sort(() => Math.random() - 0.5).slice(0, 12);
        await Promise.allSettled(selected.map(async ({ u, cat }) => {
          try {
            const body = new URLSearchParams({ unique_id: u, count: "10", cursor: "0" });
            const r = await fetch("https://www.tikwm.com/api/user/posts", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" },
              body: body.toString(),
              signal: AbortSignal.timeout(10000),
            });
            if (!r.ok) return;
            const data = await r.json();
            if (data.code !== 0 || !data.data?.videos?.length) return;
            for (const v of data.data.videos.slice(0, 5)) {
              const title = v.title || v.desc || "";
              if (!title || v.is_ad) continue;
              const ageHours = (Date.now() - v.create_time * 1000) / 3600000;
              if (ageHours > 72) continue;
              const directUrl = v.hdplay || v.play || v.wmplay || null;
              if (!directUrl) continue;
              videos.push({
                id: "tiktok:" + (v.video_id || v.id),
                title: title.slice(0, 200),
                url: "https://www.tiktok.com/@" + u + "/video/" + (v.video_id || v.id),
                directVideoUrl: directUrl,
                thumbnail: v.cover || v.origin_cover || "",
                publishedAt: new Date(v.create_time * 1000).toISOString(),
                sourceName: "@" + u,
                sourceType: "direct-mp4",
                category: cat,
                playCount: v.play_count || 0,
              });
            }
          } catch {}
        }));

        // Reddit native videos -- full audio, direct MP4 (reliable fallback)
        const REDDIT_FEEDS = [
          { url: "https://www.reddit.com/r/nextfuckinglevel/new.json?limit=25", name: "r/NextLevel",     cat: "ENTERTAINMENT" },
          { url: "https://www.reddit.com/r/videos/new.json?limit=25",           name: "r/Videos",        cat: "ENTERTAINMENT" },
          { url: "https://www.reddit.com/r/sports/new.json?limit=25",           name: "r/Sports",        cat: "SPORTS"        },
          { url: "https://www.reddit.com/r/Music/new.json?limit=25",            name: "r/Music",         cat: "MUSIC"         },
          { url: "https://www.reddit.com/r/entertainment/new.json?limit=25",    name: "r/Entertainment", cat: "ENTERTAINMENT" },
          { url: "https://www.reddit.com/r/soccer/new.json?limit=25",           name: "r/Soccer",        cat: "SPORTS"        },
          { url: "https://www.reddit.com/r/nba/new.json?limit=25",              name: "r/NBA",           cat: "SPORTS"        },
          { url: "https://www.reddit.com/r/funny/new.json?limit=25",            name: "r/Funny",         cat: "COMEDY"        },
          { url: "https://www.reddit.com/r/Damnthatsinteresting/new.json?limit=25", name: "r/Damn",      cat: "ENTERTAINMENT" },
          { url: "https://www.reddit.com/r/BeAmazed/new.json?limit=25",         name: "r/BeAmazed",      cat: "ENTERTAINMENT" },
        ];
        await Promise.allSettled(REDDIT_FEEDS.map(async feed => {
          try {
            const r = await fetch(feed.url, {
              headers: { "User-Agent": "PPPTVBot/2.0 (entertainment aggregator)" },
              signal: AbortSignal.timeout(8000),
            });
            if (!r.ok) return;
            const data = await r.json();
            const posts = data?.data?.children || [];
            for (const post of posts) {
              const p = post.data;
              if (!p.is_video || !p.media?.reddit_video?.fallback_url) continue;
              const ageHours = (Date.now() - p.created_utc * 1000) / 3600000;
              if (ageHours > 48) continue;
              videos.push({
                id: "reddit:" + p.id,
                title: p.title,
                url: p.media.reddit_video.fallback_url,
                directVideoUrl: p.media.reddit_video.fallback_url,
                thumbnail: p.thumbnail?.startsWith("http") ? p.thumbnail : "",
                publishedAt: new Date(p.created_utc * 1000).toISOString(),
                sourceName: feed.name,
                sourceType: "reddit",
                category: feed.cat,
                playCount: p.score || 0,
              });
            }
          } catch {}
        }));

        // Dailymotion RSS fallback (resolved separately)
        const DM_FEEDS = [
          { url: "https://www.dailymotion.com/rss/tag/kenya+entertainment", name: "Dailymotion Kenya",   cat: "ENTERTAINMENT" },
          { url: "https://www.dailymotion.com/rss/tag/africa+music",        name: "Africa Music DM",     cat: "MUSIC"         },
          { url: "https://www.dailymotion.com/rss/tag/celebrity+gossip",    name: "Celebrity Gossip DM", cat: "CELEBRITY"     },
          { url: "https://www.dailymotion.com/rss/tag/viral+video",         name: "Viral Videos DM",     cat: "ENTERTAINMENT" },
          { url: "https://www.dailymotion.com/rss/tag/music+video",         name: "Music Videos DM",     cat: "MUSIC"         },
          { url: "https://www.dailymotion.com/rss/tag/sports+highlights",   name: "Sports Highlights DM",cat: "SPORTS"        },
          { url: "https://www.dailymotion.com/rss/tag/bongo+music",         name: "Bongo Music DM",      cat: "MUSIC"         },
          { url: "https://www.dailymotion.com/rss/tag/tanzania",            name: "Tanzania DM",         cat: "ENTERTAINMENT" },
          { url: "https://www.dailymotion.com/rss/tag/east+africa",         name: "East Africa DM",      cat: "ENTERTAINMENT" },
          { url: "https://www.dailymotion.com/rss/tag/nollywood",           name: "Nollywood DM",        cat: "TV & FILM"     },
          { url: "https://www.dailymotion.com/rss/tag/afrobeats",           name: "Afrobeats DM",        cat: "MUSIC"         },
          { url: "https://www.dailymotion.com/rss/tag/football+highlights", name: "Football DM",         cat: "SPORTS"        },
        ];
        await Promise.allSettled(DM_FEEDS.map(async feed => {
          try {
            const r = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" }, signal: AbortSignal.timeout(8000) });
            if (!r.ok) return;
            const xml = await r.text();
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(xml)) !== null) {
              const e = match[1];
              const title = (e.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || e.match(/<title>(.*?)<\/title>/) || [])[1] || "";
              const link = (e.match(/<link>(.*?)<\/link>/) || [])[1] || "";
              const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
              const thumbnail = (e.match(/url="([^"]+\.(?:jpg|jpeg|png))"/) || [])[1] || "";
              const videoId = link.match(/video\/([a-z0-9]+)/i)?.[1] || "";
              if (!title || !link || !videoId) continue;
              const cleanTitle = title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
              const isJunk = /s\d+e\d+|season \d+|episode \d+|full episode|full movie|watch online|free download/i.test(cleanTitle);
              if (isJunk) continue;
              const ageHours = pubDate ? (Date.now() - new Date(pubDate).getTime()) / 3600000 : 0;
              if (ageHours > 72) continue;
              videos.push({ id: "dm:" + videoId, title: cleanTitle, url: link, directVideoUrl: null, thumbnail, publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(), sourceName: feed.name, sourceType: "dailymotion", category: feed.cat, playCount: 0 });
            }
          } catch {}
        }));

        return json({ videos, count: videos.length });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    """

new_content = content[:start] + new_block + content[end:]
with open('cloudflare/worker.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('Done, length:', len(new_content))
