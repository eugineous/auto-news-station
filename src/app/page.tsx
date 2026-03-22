"use client";
import { useState, useEffect, useRef } from "react";

const RED    = "#E50914";
const PINK   = "#FF007A";
const BLACK  = "#141414";
const DARK   = "#1f1f1f";
const CARD   = "#2a2a2a";
const BORDER = "#333333";
const MUTED  = "#808080";
const WHITE  = "#ffffff";
const GREEN  = "#46d369";
const WARN   = "#f87171";

interface PostLogEntry {
  articleId: string; title: string; url: string; category: string;
  sourceType?: string; manualPost?: boolean;
  instagram: { success: boolean; postId?: string; error?: string };
  facebook:  { success: boolean; postId?: string; error?: string };
  postedAt: string; isBreaking?: boolean;
}
interface RetryState { loading: boolean; done?: boolean; error?: string; }
interface UrlPreview {
  scraped: { type: string; title: string; description: string; imageUrl: string; sourceName: string };
  ai: { clickbaitTitle: string; caption: string };
  category: string; imageBase64: string;
}

const CATS = ["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];
const TYPE_LABEL: Record<string,string> = {
  youtube:"▶ YouTube", tiktok:"♪ TikTok", twitter:"𝕏 Twitter",
  instagram:"◎ IG", article:"�� Article", unknown:"🔗 Link",
};

export default function Home() {
  const [tab, setTab]           = useState<"post"|"log"|"stats">("post");
  const [postLog, setPostLog]   = useState<PostLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [urlInput, setUrlInput]     = useState("");
  const [urlCat, setUrlCat]         = useState("AUTO");
  const [preview, setPreview]       = useState<UrlPreview|null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlPosting, setUrlPosting] = useState(false);
  const [urlError, setUrlError]     = useState<string|null>(null);
  const [urlSuccess, setUrlSuccess] = useState<string|null>(null);
  const [lightbox, setLightbox]     = useState(false);
  const [retries, setRetries]       = useState<Record<string,RetryState>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLog();
    const t = setInterval(fetchLog, 60000);
    return () => clearInterval(t);
  }, []);

  async function fetchLog() {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) { const d = await r.json(); setPostLog(d.log || []); }
    } catch {}
    finally { setLogLoading(false); }
  }

  function ago(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "now"; if (m < 60) return m+"m";
    const h = Math.floor(m/60); if (h < 24) return h+"h";
    return Math.floor(h/24)+"d";
  }

  async function doPreview() {
    if (!urlInput.trim()) return;
    setUrlLoading(true); setUrlError(null); setPreview(null); setUrlSuccess(null);
    try {
      const r = await fetch("/api/preview-url", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ url:urlInput.trim(), category: urlCat==="AUTO"?undefined:urlCat }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error||"Preview failed");
      setPreview(d);
    } catch(e:any) { setUrlError(e.message); }
    finally { setUrlLoading(false); }
  }

  async function doPost() {
    if (!preview) return;
    setUrlPosting(true); setUrlError(null); setUrlSuccess(null);
    try {
      const r = await fetch("/api/post-from-url-proxy", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ url:urlInput.trim(), category: urlCat==="AUTO"?undefined:urlCat }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error||"Post failed");
      const ig = d.instagram?.success, fb = d.facebook?.success;
      setUrlSuccess((ig&&fb)?"Posted to IG + FB":ig?"Posted to IG only":fb?"Posted to FB only":"Failed on both");
      if (ig||fb) { setUrlInput(""); setPreview(null); setTimeout(fetchLog,2000); }
    } catch(e:any) { setUrlError(e.message); }
    finally { setUrlPosting(false); }
  }

  async function doRetry(entry: PostLogEntry, platform: "instagram"|"facebook") {
    const key = entry.articleId+"_"+platform;
    setRetries(s=>({...s,[key]:{loading:true}}));
    try {
      const r = await fetch("/api/retry-post", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ articleId:entry.articleId, title:entry.title, caption:entry.title, articleUrl:entry.url, category:entry.category, platform }),
      });
      const d = await r.json();
      const ok = platform==="instagram"?d.instagram?.success:d.facebook?.success;
      setRetries(s=>({...s,[key]:{loading:false,done:ok,error:ok?undefined:(d.error||"Failed")}}));
      if (ok) setTimeout(fetchLog,1500);
    } catch(e:any) { setRetries(s=>({...s,[key]:{loading:false,error:e.message}})); }
  }

  const todayCount = postLog.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString()).length;
  const successCount = postLog.filter(p=>p.instagram.success||p.facebook.success).length;
