"use client";
import { useState, useEffect, useRef, useCallback } from "react";

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
  instagram:"◎ IG", article:"📰 Article", unknown:"🔗 Link",
};

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now"; if (m < 60) return m+"m";
  const h = Math.floor(m/60); if (h < 24) return h+"h";
  return Math.floor(h/24)+"d";
}

export default function Home() {
  const [tab, setTab]               = useState<"post"|"log"|"stats">("post");
  const [postLog, setPostLog]       = useState<PostLogEntry[]>([]);
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

  const fetchLog = useCallback(async () => {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) { const d = await r.json(); setPostLog(d.log || []); }
    } catch {}
    finally { setLogLoading(false); }
  }, []);

  useEffect(() => {
    fetchLog();
    const t = setInterval(fetchLog, 60000);
    return () => clearInterval(t);
  }, [fetchLog]);

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
      setUrlSuccess((ig&&fb)?"✅ Posted to IG + FB":ig?"✅ Posted to IG only":fb?"✅ Posted to FB only":"❌ Failed on both");
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

  const todayCount  = postLog.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString()).length;
  const successCount = postLog.filter(p=>p.instagram.success||p.facebook.success).length;
  const catCounts   = CATS.reduce((acc,c)=>({...acc,[c]:postLog.filter(p=>p.category===c).length}),{} as Record<string,number>);
  const maxCat      = Math.max(1,...Object.values(catCounts));

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    shell:   { minHeight:"100dvh", maxWidth:480, margin:"0 auto", background:BLACK, color:WHITE, fontFamily:"'Inter',system-ui,sans-serif", display:"flex", flexDirection:"column" as const, position:"relative" as const },
    header:  { background:DARK, borderBottom:`1px solid ${BORDER}`, padding:"14px 16px 10px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky" as const, top:0, zIndex:50 },
    logo:    { display:"flex", alignItems:"center", gap:6 },
    dot:     { width:8, height:8, borderRadius:"50%", background:RED, animation:"pulse 1.5s infinite" },
    live:    { fontSize:11, color:MUTED, letterSpacing:1 },
    brand:   { fontSize:20, fontWeight:800, letterSpacing:1 },
    brandPink:{ color:PINK },
    scroll:  { flex:1, overflowY:"auto" as const, paddingBottom:80 },
    nav:     { position:"fixed" as const, bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:DARK, borderTop:`1px solid ${BORDER}`, display:"flex", zIndex:50 },
    navBtn:  (active:boolean)=>({ flex:1, padding:"12px 0 10px", background:"none", border:"none", color:active?WHITE:MUTED, fontSize:11, fontWeight:active?700:400, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", gap:3, borderTop:active?`2px solid ${RED}`:"2px solid transparent" }),
    section: { padding:"16px 16px 0" },
    label:   { fontSize:11, color:MUTED, letterSpacing:1, marginBottom:6, textTransform:"uppercase" as const },
    input:   { width:"100%", background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:"12px 14px", color:WHITE, fontSize:15, outline:"none", boxSizing:"border-box" as const },
    btn:     (color:string,disabled?:boolean)=>({ background:disabled?"#333":color, color:WHITE, border:"none", borderRadius:8, padding:"13px 0", fontSize:15, fontWeight:700, cursor:disabled?"not-allowed":"pointer", width:"100%", opacity:disabled?0.6:1 }),
    pills:   { display:"flex", gap:6, flexWrap:"wrap" as const, marginBottom:12 },
    pill:    (active:boolean)=>({ background:active?PINK:"#333", color:WHITE, border:"none", borderRadius:20, padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:active?700:400 }),
    card:    { background:CARD, borderRadius:10, overflow:"hidden", marginBottom:12 },
    cardImg: { width:"100%", aspectRatio:"16/9", objectFit:"cover" as const, display:"block" },
    cardBody:{ padding:"12px 14px" },
    cardTitle:{ fontSize:15, fontWeight:700, lineHeight:1.3, marginBottom:6 },
    cardMeta:{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const },
    badge:   (color:string)=>({ background:color, color:WHITE, borderRadius:4, padding:"2px 7px", fontSize:11, fontWeight:700 }),
    retryBtn:(ok?:boolean,loading?:boolean)=>({ background:ok?GREEN:loading?"#555":WARN, color:WHITE, border:"none", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:loading?"not-allowed":"pointer", fontWeight:700 }),
    statCard:{ background:CARD, borderRadius:10, padding:"16px", marginBottom:12, display:"flex", flexDirection:"column" as const, gap:4 },
    bigNum:  { fontSize:42, fontWeight:800, lineHeight:1 },
    statLbl: { fontSize:12, color:MUTED },
    barRow:  { display:"flex", alignItems:"center", gap:8, marginBottom:8 },
    barLabel:{ fontSize:11, color:MUTED, width:80, flexShrink:0 },
    barTrack:{ flex:1, background:"#333", borderRadius:4, height:8 },
    barFill: (pct:number)=>({ width:`${pct}%`, background:PINK, borderRadius:4, height:8, transition:"width 0.4s" }),
    barCount:{ fontSize:11, color:MUTED, width:20, textAlign:"right" as const },
    err:     { background:"#3a0000", border:`1px solid ${WARN}`, borderRadius:8, padding:"10px 14px", color:WARN, fontSize:13, marginTop:10 },
    ok:      { background:"#003a10", border:`1px solid ${GREEN}`, borderRadius:8, padding:"10px 14px", color:GREEN, fontSize:13, marginTop:10 },
    divider: { height:1, background:BORDER, margin:"16px 0" },
    row2:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 },
  };

  // ── Tab: Post ────────────────────────────────────────────────────────────────
  const PostTab = (
    <div style={S.scroll}>
      <div style={S.section}>
        <div style={S.label}>Post from URL</div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input ref={inputRef} style={{...S.input,flex:1}} placeholder="Paste article / YouTube / TikTok URL…"
            value={urlInput} onChange={e=>setUrlInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!preview&&doPreview()} />
        </div>
        <div style={S.label}>Category</div>
        <div style={S.pills}>
          {CATS.map(c=>(
            <button key={c} style={S.pill(urlCat===c)} onClick={()=>setUrlCat(c)}>{c}</button>
          ))}
        </div>
        {!preview && (
          <button style={S.btn(RED, urlLoading||!urlInput.trim())} onClick={doPreview} disabled={urlLoading||!urlInput.trim()}>
            {urlLoading?"⏳ Fetching preview…":"🔍 Preview"}
          </button>
        )}
        {urlError && <div style={S.err}>⚠ {urlError}</div>}
        {urlSuccess && <div style={S.ok}>{urlSuccess}</div>}
      </div>

      {preview && (
        <div style={{...S.section, paddingTop:14}}>
          <div style={S.label}>Preview</div>
          <div style={S.card}>
            {preview.imageBase64 && (
              <div style={{position:"relative",cursor:"zoom-in"}} onClick={()=>setLightbox(true)}>
                <img src={preview.imageBase64} alt="" style={S.cardImg} />
                <div style={{position:"absolute",bottom:6,right:8,background:"rgba(0,0,0,0.6)",borderRadius:4,padding:"2px 7px",fontSize:11,color:WHITE}}>
                  {TYPE_LABEL[preview.scraped.type]||"🔗"}
                </div>
              </div>
            )}
            <div style={S.cardBody}>
              <div style={S.cardTitle}>{preview.ai.clickbaitTitle}</div>
              <div style={{fontSize:12,color:MUTED,marginBottom:8,lineHeight:1.4}}>{preview.ai.caption.slice(0,120)}…</div>
              <div style={S.cardMeta}>
                <span style={S.badge(PINK)}>{preview.category}</span>
                <span style={{fontSize:11,color:MUTED}}>{preview.scraped.sourceName}</span>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={{...S.btn("#444"),flex:1}} onClick={()=>{setPreview(null);setUrlSuccess(null);}}>✕ Clear</button>
            <button style={{...S.btn(RED,urlPosting),flex:2}} onClick={doPost} disabled={urlPosting}>
              {urlPosting?"⏳ Posting…":"📤 Post to IG + FB"}
            </button>
          </div>
        </div>
      )}

      {lightbox && preview?.imageBase64 && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setLightbox(false)}>
          <img src={preview.imageBase64} alt="" style={{maxWidth:"95vw",maxHeight:"90dvh",borderRadius:8,objectFit:"contain"}} />
        </div>
      )}
    </div>
  );

  // ── Tab: Log ─────────────────────────────────────────────────────────────────
  const LogTab = (
    <div style={S.scroll}>
      <div style={S.section}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={S.label}>Post Log</div>
          <button style={{background:"none",border:`1px solid ${BORDER}`,color:MUTED,borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer"}} onClick={fetchLog}>↻ Refresh</button>
        </div>
        {logLoading && <div style={{color:MUTED,fontSize:13,textAlign:"center",padding:24}}>Loading…</div>}
        {!logLoading && postLog.length===0 && <div style={{color:MUTED,fontSize:13,textAlign:"center",padding:24}}>No posts yet</div>}
        {postLog.slice().reverse().map(entry=>{
          const igKey = entry.articleId+"_instagram";
          const fbKey = entry.articleId+"_facebook";
          const igR = retries[igKey], fbR = retries[fbKey];
          return (
            <div key={entry.articleId} style={S.card}>
              <div style={S.cardBody}>
                <div style={{...S.cardTitle,fontSize:13}}>{entry.title}</div>
                <div style={{...S.cardMeta,marginBottom:8}}>
                  <span style={S.badge(PINK)}>{entry.category}</span>
                  {entry.isBreaking && <span style={S.badge(RED)}>BREAKING</span>}
                  {entry.manualPost && <span style={S.badge("#555")}>MANUAL</span>}
                  <span style={{fontSize:11,color:MUTED}}>{ago(entry.postedAt)}</span>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                  {/* Instagram */}
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontSize:11,color:MUTED}}>IG:</span>
                    {entry.instagram.success
                      ? <span style={{fontSize:11,color:GREEN}}>✓ {entry.instagram.postId?.slice(-6)}</span>
                      : igR?.done
                        ? <span style={{fontSize:11,color:GREEN}}>✓ retried</span>
                        : <button style={S.retryBtn(false,igR?.loading)} disabled={igR?.loading} onClick={()=>doRetry(entry,"instagram")}>
                            {igR?.loading?"…":"↺ IG"}
                          </button>
                    }
                  </div>
                  {/* Facebook */}
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontSize:11,color:MUTED}}>FB:</span>
                    {entry.facebook.success
                      ? <span style={{fontSize:11,color:GREEN}}>✓ {entry.facebook.postId?.slice(-6)}</span>
                      : fbR?.done
                        ? <span style={{fontSize:11,color:GREEN}}>✓ retried</span>
                        : <button style={S.retryBtn(false,fbR?.loading)} disabled={fbR?.loading} onClick={()=>doRetry(entry,"facebook")}>
                            {fbR?.loading?"…":"↺ FB"}
                          </button>
                    }
                  </div>
                </div>
                {(igR?.error||fbR?.error) && <div style={{fontSize:11,color:WARN,marginTop:4}}>{igR?.error||fbR?.error}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Tab: Stats ───────────────────────────────────────────────────────────────
  const StatsTab = (
    <div style={S.scroll}>
      <div style={S.section}>
        <div style={S.row2}>
          <div style={S.statCard}>
            <div style={{...S.bigNum,color:RED}}>{todayCount}</div>
            <div style={S.statLbl}>Today</div>
          </div>
          <div style={S.statCard}>
            <div style={{...S.bigNum,color:GREEN}}>{successCount}</div>
            <div style={S.statLbl}>Total Success</div>
          </div>
          <div style={S.statCard}>
            <div style={{...S.bigNum,color:PINK}}>{postLog.filter(p=>p.instagram.success).length}</div>
            <div style={S.statLbl}>IG Posts</div>
          </div>
          <div style={S.statCard}>
            <div style={{...S.bigNum,color:"#1877f2"}}>{postLog.filter(p=>p.facebook.success).length}</div>
            <div style={S.statLbl}>FB Posts</div>
          </div>
        </div>

        <div style={S.divider}/>
        <div style={{...S.label,marginBottom:12}}>By Category</div>
        {CATS.filter(c=>catCounts[c]>0).map(c=>(
          <div key={c} style={S.barRow}>
            <div style={S.barLabel}>{c.slice(0,10)}</div>
            <div style={S.barTrack}><div style={S.barFill(Math.round(catCounts[c]/maxCat*100))}/></div>
            <div style={S.barCount}>{catCounts[c]}</div>
          </div>
        ))}

        <div style={S.divider}/>
        <div style={{...S.label,marginBottom:12}}>Config</div>
        {[
          ["Schedule","Every 30 min"],
          ["Peak Hours","6am – 11pm EAT"],
          ["Daily Cap","8 posts/day"],
          ["Max per Run","2 posts"],
          ["Dedup","Cloudflare KV"],
          ["Filter","Kenya only"],
        ].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:13}}>
            <span style={{color:MUTED}}>{k}</span>
            <span style={{fontWeight:600}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={S.shell}>
      <style>{
        `@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        body{margin:0;background:${BLACK}}
        input::placeholder{color:${MUTED}}
        ::-webkit-scrollbar{width:0}`
      }</style>

      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>
          <div style={S.dot}/>
          <span style={S.brand}>PPP<span style={S.brandPink}>TV</span></span>
          <span style={S.live}>LIVE</span>
        </div>
        <div style={{fontSize:12,color:MUTED}}>{todayCount}/8 today</div>
      </div>

      {/* Tab content */}
      {tab==="post"  && PostTab}
      {tab==="log"   && LogTab}
      {tab==="stats" && StatsTab}

      {/* Bottom nav */}
      <nav style={S.nav}>
        <button style={S.navBtn(tab==="post")}  onClick={()=>setTab("post")}>
          <span style={{fontSize:20}}>📤</span>Post
        </button>
        <button style={S.navBtn(tab==="log")}   onClick={()=>setTab("log")}>
          <span style={{fontSize:20}}>📋</span>
          <span style={{display:"flex",alignItems:"center",gap:3}}>Feed{postLog.length>0&&<span style={{background:RED,borderRadius:10,padding:"0 5px",fontSize:10,lineHeight:"16px"}}>{postLog.length}</span>}</span>
        </button>
        <button style={S.navBtn(tab==="stats")} onClick={()=>setTab("stats")}>
          <span style={{fontSize:20}}>📊</span>Stats
        </button>
      </nav>
    </div>
  );
}
