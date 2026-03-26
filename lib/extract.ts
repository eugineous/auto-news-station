import { extract } from "@extractus/article-extractor";

type ExtractResult = {
  content?: string | null;
  title?: string | null;
  image?: string | null;
  author?: string | null;
  published?: string | null;
};

export async function fetchReadable(url: string): Promise<ExtractResult | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "PPP-TV/1.0" } });
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const html = await res.text();
    const data = await extract(url, { html } as unknown as Record<string, unknown>);
    return data;
  } catch (err) {
    console.error("extractor failed", url, err);
    return null;
  }
}
