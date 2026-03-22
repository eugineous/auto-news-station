"use client";
import { useState, useEffect, useCallback } from "react";

const R="#E50914",PK="#FF007A",BG="#141414",SB="#0f0f0f",SRF="#1a1a1a",CD="#242424",BR="#2a2a2a",MT="#888",WH="#fff",GR="#46d369",WN="#f87171",BL="#1877f2";
const CATS=["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];

interface LogEntry{articleId:string;title:string;url:string;category:string;sourceType?:string;manualPost?:boolean;instagram:{success:boolean;postId?:string;error?:string};facebook:{success:boolean;postId?:string;error?:string};postedAt:string;isBreaking?:boolean}
interface ScrapedInfo{type:string;title:string;description:string;imageUrl:string;sourceName:string;isVideo?:boolean;videoEmbedUrl?:string|null;videoUrl?:string|null}
interface Preview{scraped:ScrapedInfo;ai:{clickbaitTitle:string;caption:string};category:string;imageBase64:string}
interface Retry{loading:boolean;done?:boolean;error?:string}

function ago(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"now";if(m<60)return m+"m";const h=Math.floor(m/60);if(h<24)return h+"h";return Math.floor(h/24)+"d"}
function isIG(u:string){return/instagram\.com/.test(u)}

export default function Home(){
  const[tab,setTab]=useState<"post"|"log"|"stats">("post");
  const[log,setLog]=useState<LogEntry[]>([]);
  const[logLoading,setLogLoading]=useState(true);
  const[url,setUrl]=useState("");
  const[cat,setCat]=useState("AUTO");
  const[preview,setPreview]=useState<Preview|null>(null);
  const[prevLoading,setPrevLoading]=useState(false);
  const[posting,setPosting]=useState(false);
  const[err,setErr]=useState<string|null>(null);
  const[ok,setOk]=useState<string|null>(null);
  const[lightbox,setLightbox]=useState(false);
  const[retries,setRetries]=useState<Record<string,Retry>>({});
  const[igTitle,setIgTitle]=useState("");
  const[igCaption,setIgCaption]=useState("");
  const[needsManual,setNeedsManual]=useState(false);
  const[showPlayer,setShowPlayer]=useState(false);

  const fetchLog=useCallback(async()=>{
    try{const r=await fetch("/api/post-log");if(r.ok){const d=await r.json();setLog(d.log||[]);}}catch{}finally{setLogLoading(false);}
  },[]);

  useEffect(()=>{fetchLog();const t=setInterval(fetchLog,60000);return()=>clearInterval(t);},[fetchLog]);
  useEffect(()=>{setNeedsManual(false);setIgTitle("");setIgCaption("");setErr(null);setPreview(null);setOk(null);setShowPlayer(false);},[url]);

  async function doPreview(overrideTitle?:string,overrideCaption?:string){
    if(!url.trim())return;
    setPrevLoading(true);setErr(null);setPreview(null);setOk(null);setShowPlayer(false);
    try{
      const body:Record<string,string>={url:url.trim()};
      if(cat!=="AUTO")body.category=cat;
      if(overrideTitle)body.manualTitle=overrideTitle;
      if(overrideCaption)body.manualCaption=overrideCaption;
      const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(d.error==="INSTAGRAM_MANUAL"){setNeedsManual(true);setPrevLoading(false);return;}
      if(!r.ok||d.error)throw new Error(d.error||"Preview failed");
      setNeedsManual(false);setPreview(d);
    }catch(e:any){setErr(e.message);}
    finally{setPrevLoading(false);}
  }

  async function doPost(){
    if(!preview)return;
    setPosting(true);setErr(null);setOk(null);
    try{
      const body:Record<string,string>={url:url.trim()};
      if(cat!=="AUTO")body.category=cat;
      if(isIG(url)&&igTitle)body.manualTitle=igTitle;
      if(isIG(url)&&igCaption)body.manualCaption=igCaption;
      const r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok||d.error)throw new Error(d.error||"Post failed");
      const ig=d.instagram?.success,fb=d.facebook?.success;
      setOk((ig&&fb)?"✅ Posted to IG + FB":ig?"✅ IG only":fb?"✅ FB only":"❌ Both failed — "+((d.instagram?.error||d.facebook?.error)||"unknown"));
      if(ig||fb){setUrl("");setPreview(null);setNeedsManual(false);setTimeout(fetchLog,2000);}
    }catch(e:any){setErr(e.message);}
    finally{setPosting(false);}
  }

  async function doRetry(entry:LogEntry,platform:"instagram"|"facebook"){
    const key=entry.articleId+"_"+platform;
    setRetries(s=>({...s,[key]:{loading:true}}));
    try{
      const r=await fetch("/api/retry-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({articleId:entry.articleId,title:entry.title,caption:entry.title,articleUrl:entry.url,category:entry.category,platform})});
      const d=await r.json();
      const success=platform==="instagram"?d.instagram?.success:d.facebook?.success;
      setRetries(s=>({...s,[key]:{loading:false,done:success,error:success?undefined:(d.error||"Failed")}}));
      if(success)setTimeout(fetchLog,1500);
    }catch(e:any){setRetries(s=>({...s,[key]:{loading:false,error:e.message}}));}
  }

  const todayCount=log.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString()).length;
  const successCount=log.filter(p=>p.instagram.success||p.facebook.success).length;
  const igCount=log.filter(p=>p.instagram.success).length;
  const fbCount=log.filter(p=>p.facebook.success).length;
  const catCounts=CATS.reduce((a,c)=>({...a,[c]:log.filter(p=>p.category===c).length}),{} as Record<string,number>);
  const maxCat=Math.max(1,...Object.values(catCounts));
  const isVideo=preview?.scraped?.isVideo;
  const embedUrl=preview?.scraped?.videoEmbedUrl;
  const videoTypeLabel=preview?.scraped?.type==="youtube"?"YouTube":preview?.scraped?.type==="tiktok"?"TikTok":preview?.scraped?.type==="instagram"?"Instagram Reel":"Video";

  const css=`
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
    html,body{height:100%}
    body{background:#141414;color:#fff;font-family:'Inter',system-ui,sans-serif}
    input,button,textarea,select{font-family:inherit}
    input::placeholder,textarea::placeholder{color:#666}
    ::-webkit-scrollbar{width:5px}
    ::-webkit-scrollbar-track{background:#0f0f0f}
    ::-webkit-scrollbar-thumb{background:#333;border-radius:4px}
    ::-webkit-scrollbar-thumb:hover{background:#555}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
    .fade{animation:fadeIn .3s ease}
    .card{background:#1e1e1e;border-radius:10px;border:1px solid #2a2a2a;transition:border-color .2s}
    .card:hover{border-color:#3a3a3a}
    .btn{border:none;border-radius:8px;padding:11px 20px;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.3px}
    .btn:disabled{opacity:.4;cursor:not-allowed}
    .btn-red{background:#E50914;color:#fff}
    .btn-red:hover:not(:disabled){background:#c8000f}
    .btn-pink{background:#FF007A;color:#fff}
    .btn-pink:hover:not(:disabled){background:#d4006a}
    .btn-ghost{background:transparent;border:1px solid #333;color:#888;border-radius:8px;padding:9px 16px;font-size:13px;cursor:pointer;transition:all .15s}
    .btn-ghost:hover{border-color:#555;color:#ccc;background:#1e1e1e}
    .input{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;color:#fff;font-size:14px;outline:none;transition:border-color .2s;width:100%}
    .input:focus{border-color:#E50914}
    .tag{border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;letter-spacing:.5px}
    .cat-pill{border-radius:20px;padding:5px 14px;font-size:12px;cursor:pointer;border:1px solid #2a2a2a;transition:all .15s;font-weight:500}
    .cat-pill:hover{border-color:#555}
    .stat-card{background:linear-gradient(135deg,#1e1e1e 0%,#242424 100%);border-radius:12px;border:1px solid #2a2a2a;padding:20px;position:relative;overflow:hidden}
    .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
    .stat-red::before{background:#E50914}
    .stat-green::before{background:#46d369}
    .stat-pink::before{background:#FF007A}
    .stat-blue::before{background:#1877f2}
    .nav-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;color:#888;transition:all .2s;border:none;background:none;width:100%;text-align:left;position:relative}
    .nav-item:hover{background:#1e1e1e;color:#ccc}
    .nav-item.active{background:#1e1e1e;color:#fff}
    .nav-item.active::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:60%;background:#E50914;border-radius:0 3px 3px 0}
    .log-row{background:#1a1a1a;border-radius:10px;border:1px solid #252525;padding:14px 16px;transition:border-color .2s}
    .log-row:hover{border-color:#333}
    .video-frame{width:100%;aspect-ratio:16/9;border:none;border-radius:8px;background:#000;display:block}
    .section-label{font-size:11px;color:#666;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;font-weight:600}
    .divider{border:none;border-top:1px solid #222;margin:0}
    /* Desktop sidebar layout */
    @media(min-width:768px){
      .sidebar{display:flex!important}
      .mobile-nav{display:none!important}
      .top-bar-mobile{display:none!important}
      .desk-header{display:flex!important}
      .main-content{padding:28px 32px!important}
      .post-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
      .post-left{min-width:0}
      .post-right{min-width:0}
      .stats-grid{grid-template-columns:repeat(4,1fr)!important}
      .log-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    }
    /* Mobile layout */
    @media(max-width:767px){
      .sidebar{display:none!important}
      .mobile-nav{display:flex!important}
      .top-bar-mobile{display:flex!important}
      .desk-header{display:none!important}
      .main-content{padding:16px!important;padding-bottom:76px!important}
      .post-grid{display:block}
      .post-right{margin-top:16px}
      .stats-grid{grid-template-columns:1fr 1fr!important}
    }
  `;

  // ── Sub-components ──────────────────────────────────────────────────────
  const PostPanel=()=>(
    <div className="post-grid fade">
      {/* LEFT: URL input + preview */}
      <div className="post-left">
        <div className="section-label">Post from any URL</div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <input className="input" placeholder="Article / YouTube / TikTok / Instagram URL…"
            value={url} onChange={e=>setUrl(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!preview&&!needsManual&&doPreview()}
            style={{flex:1}}/>
          {!preview&&!needsManual&&(
            <button className="btn btn-red" onClick={()=>doPreview()} disabled={prevLoading||!url.trim()} style={{whiteSpace:"nowrap",minWidth:100}}>
              {prevLoading?"⏳…":"🔍 Preview"}
            </button>
          )}
        </div>

        {err&&<div style={{background:"#1a0000",border:"1px solid #f87171",borderRadius:8,padding:"11px 14px",color:"#f87171",fontSize:13,marginBottom:12}}>⚠ {err}</div>}
        {ok&&<div style={{background:"#001a0a",border:"1px solid #46d369",borderRadius:8,padding:"11px 14px",color:"#46d369",fontSize:13,marginBottom:12}}>{ok}</div>}

        {needsManual&&(
          <div className="card fade" style={{padding:16,marginBottom:12,borderColor:"#FF007A44"}}>
            <div style={{fontSize:13,color:"#FF007A",fontWeight:700,marginBottom:4}}>📸 Instagram URL detected</div>
            <div style={{fontSize:12,color:"#666",marginBottom:14}}>Instagram blocks scraping. Enter the post title and caption to continue.</div>
            <input className="input" placeholder="Post title (e.g. Sauti Sol drops new album)" value={igTitle} onChange={e=>setIgTitle(e.target.value)} style={{marginBottom:10}}/>
            <textarea className="input" placeholder="Paste the caption or describe what the post is about…" value={igCaption} onChange={e=>setIgCaption(e.target.value)} style={{resize:"vertical",minHeight:80,marginBottom:12}}/>
            <button className="btn btn-red" onClick={()=>doPreview(igTitle,igCaption)} disabled={prevLoading||!igTitle.trim()||!igCaption.trim()} style={{width:"100%"}}>
              {prevLoading?"⏳ Generating…":"🔍 Generate Preview"}
            </button>
          </div>
        )}

        {preview&&(
          <div className="card fade" style={{overflow:"hidden"}}>
            {isVideo&&embedUrl?(
              <div style={{background:"#000",position:"relative"}}>
                {showPlayer
                  ?<iframe src={embedUrl} className="video-frame" allowFullScreen allow="autoplay; encrypted-media" style={{aspectRatio:preview.scraped.type==="tiktok"?"9/16":"16/9"}}/>
                  :<div style={{position:"relative",cursor:"pointer"}} onClick={()=>setShowPlayer(true)}>
                    {preview.imageBase64&&<img src={preview.imageBase64} alt="" style={{width:"100%",aspectRatio:"16/9",objectFit:"cover",display:"block",opacity:.65}}/>}
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
                      <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(229,9,20,.9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>▶</div>
                      <div style={{fontSize:12,color:"#fff",background:"rgba(0,0,0,.6)",padding:"4px 12px",borderRadius:20}}>Play {videoTypeLabel}</div>
                    </div>
                  </div>
                }
              </div>
            ):(
              preview.imageBase64&&(
                <div style={{cursor:"zoom-in"}} onClick={()=>setLightbox(true)}>
                  <img src={preview.imageBase64} alt="" style={{width:"100%",aspectRatio:"4/3",objectFit:"cover",display:"block"}}/>
                </div>
              )
            )}
            <div style={{padding:"16px"}}>
              <div style={{fontSize:16,fontWeight:800,lineHeight:1.3,marginBottom:8}}>{preview.ai.clickbaitTitle}</div>
              <div style={{fontSize:13,color:"#888",lineHeight:1.6,marginBottom:12}}>{preview.ai.caption.slice(0,220)}…</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
                <span className="tag" style={{background:"#FF007A",color:"#fff"}}>{preview.category}</span>
                <span style={{fontSize:12,color:"#666"}}>{preview.scraped.sourceName}</span>
                {isVideo&&<span className="tag" style={{background:"#E50914",color:"#fff"}}>📹 VIDEO</span>}
              </div>
              {isVideo&&<div style={{fontSize:11,color:"#666",marginBottom:12,padding:"8px 10px",background:"#141414",borderRadius:6,border:"1px solid #222"}}>
                {preview.scraped.videoUrl?"✅ Direct video URL found — will post as actual video":"⚠ No direct video URL — will post thumbnail + link"}
              </div>}
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" onClick={()=>{setPreview(null);setOk(null);setNeedsManual(false);setShowPlayer(false);}} style={{flex:1}}>✕ Clear</button>
                <button className="btn btn-red" onClick={doPost} disabled={posting} style={{flex:2}}>
                  {posting?"⏳ Posting…":isVideo&&preview.scraped.videoUrl?"📹 Post Video":"📤 Post to IG + FB"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Category picker */}
      <div className="post-right">
        <div className="section-label">Category</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {CATS.map(c=>(
            <button key={c} className="cat-pill" onClick={()=>setCat(c)}
              style={{background:cat===c?"#FF007A":"#1a1a1a",color:cat===c?"#fff":"#888",borderColor:cat===c?"#FF007A":"#2a2a2a",fontWeight:cat===c?700:400}}>
              {c}
            </button>
          ))}
        </div>
        <div style={{marginTop:24,padding:"16px",background:"#1a1a1a",borderRadius:10,border:"1px solid #222"}}>
          <div className="section-label" style={{marginBottom:12}}>System Status</div>
          {[["Schedule","Every 30 min"],["Peak Hours","6am–11pm EAT"],["Daily Cap","6/day"],["Per Run","1 post"],["Filter","Kenya only"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1e1e1e",fontSize:13}}>
              <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:600,color:"#ccc"}}>{v}</span>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:12}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#46d369",animation:"pulse 2s infinite"}}/>
            <span style={{fontSize:12,color:"#46d369",fontWeight:600}}>Live — {todayCount}/6 today</span>
          </div>
        </div>
      </div>
    </div>
  );

  const LogPanel=()=>(
    <div className="fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:18,fontWeight:800}}>Post Feed</div>
          <div style={{fontSize:12,color:"#666",marginTop:2}}>{log.length} total posts</div>
        </div>
        <button className="btn-ghost" onClick={fetchLog}>↻ Refresh</button>
      </div>
      {logLoading&&<div style={{color:"#666",fontSize:13,textAlign:"center",padding:60}}>Loading…</div>}
      {!logLoading&&log.length===0&&<div style={{color:"#666",fontSize:13,textAlign:"center",padding:60}}>No posts yet</div>}
      <div className="log-grid" style={{display:"grid",gap:10}}>
        {log.slice().reverse().map(entry=>{
          const igKey=entry.articleId+"_instagram",fbKey=entry.articleId+"_facebook";
          const igR=retries[igKey],fbR=retries[fbKey];
          const bothOk=entry.instagram.success&&entry.facebook.success;
          const anyOk=entry.instagram.success||entry.facebook.success;
          return(
            <div key={entry.articleId} className="log-row">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700,lineHeight:1.35,flex:1}}>{entry.title}</div>
                <div style={{fontSize:11,color:"#555",flexShrink:0,marginTop:2}}>{ago(entry.postedAt)}</div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
                <span className="tag" style={{background:"#FF007A22",color:"#FF007A",border:"1px solid #FF007A44"}}>{entry.category}</span>
                {entry.isBreaking&&<span className="tag" style={{background:"#E5091422",color:"#E50914",border:"1px solid #E5091444"}}>BREAKING</span>}
                {entry.manualPost&&<span className="tag" style={{background:"#33333366",color:"#888"}}>MANUAL</span>}
                {entry.sourceType&&["youtube","tiktok","instagram"].includes(entry.sourceType)&&<span className="tag" style={{background:"#1e1e1e",color:"#666"}}>📹</span>}
                <div style={{marginLeft:"auto",width:8,height:8,borderRadius:"50%",background:bothOk?"#46d369":anyOk?"#f59e0b":"#f87171",flexShrink:0}}/>
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"#555"}}>IG:</span>
                  {entry.instagram.success?<span style={{fontSize:12,color:"#46d369",fontWeight:700}}>✓</span>
                    :igR?.done?<span style={{fontSize:12,color:"#46d369"}}>✓ retried</span>
                    :<button onClick={()=>doRetry(entry,"instagram")} disabled={igR?.loading}
                      style={{background:igR?.loading?"#333":"#2d0000",color:igR?.loading?"#666":"#f87171",border:"1px solid "+(igR?.loading?"#333":"#f8717144"),borderRadius:6,padding:"3px 10px",fontSize:12,cursor:igR?.loading?"not-allowed":"pointer",fontWeight:700}}>
                      {igR?.loading?"…":"↺ IG"}
                    </button>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"#555"}}>FB:</span>
                  {entry.facebook.success?<span style={{fontSize:12,color:"#46d369",fontWeight:700}}>✓</span>
                    :fbR?.done?<span style={{fontSize:12,color:"#46d369"}}>✓ retried</span>
                    :<button onClick={()=>doRetry(entry,"facebook")} disabled={fbR?.loading}
                      style={{background:fbR?.loading?"#333":"#001020",color:fbR?.loading?"#666":"#60a5fa",border:"1px solid "+(fbR?.loading?"#333":"#60a5fa44"),borderRadius:6,padding:"3px 10px",fontSize:12,cursor:fbR?.loading?"not-allowed":"pointer",fontWeight:700}}>
                      {fbR?.loading?"…":"↺ FB"}
                    </button>}
                </div>
              </div>
              {(igR?.error||fbR?.error)&&<div style={{fontSize:11,color:"#f87171",marginTop:6}}>{igR?.error||fbR?.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const StatsPanel=()=>(
    <div className="fade">
      <div style={{marginBottom:20}}>
        <div style={{fontSize:18,fontWeight:800}}>Analytics</div>
        <div style={{fontSize:12,color:"#666",marginTop:2}}>PPP TV Kenya Auto Poster</div>
      </div>
      <div className="stats-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:24}}>
        {([["Today",todayCount,"stat-red","#E50914"],["Total",successCount,"stat-green","#46d369"],["Instagram",igCount,"stat-pink","#FF007A"],["Facebook",fbCount,"stat-blue","#1877f2"]] as const).map(([l,v,cls,c])=>(
          <div key={l} className={`stat-card ${cls}`}>
            <div style={{fontSize:42,fontWeight:900,color:c,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{v}</div>
            <div style={{fontSize:12,color:"#666",marginTop:6,fontWeight:500}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gap:14}}>
        <div className="card" style={{padding:"18px 20px"}}>
          <div className="section-label">Posts by Category</div>
          {CATS.filter(c=>catCounts[c]>0).length===0&&<div style={{color:"#555",fontSize:13}}>No data yet</div>}
          {CATS.filter(c=>catCounts[c]>0).map(c=>(
            <div key={c} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{fontSize:12,color:"#888",width:90,flexShrink:0}}>{c}</div>
              <div style={{flex:1,background:"#222",borderRadius:4,height:6,overflow:"hidden"}}>
                <div style={{width:`${Math.round(catCounts[c]/maxCat*100)}%`,background:"linear-gradient(90deg,#FF007A,#E50914)",borderRadius:4,height:6,transition:"width .5s ease"}}/>
              </div>
              <div style={{fontSize:12,color:"#666",width:20,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{catCounts[c]}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{padding:"18px 20px"}}>
          <div className="section-label">System Config</div>
          {[["Schedule","Every 30 min"],["Peak Hours","6am–11pm EAT"],["Daily Cap","6/day"],["Per Run","1 post"],["Dedup","Cloudflare KV"],["Filter","Kenya only"],["Platforms","Instagram + Facebook"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #1e1e1e",fontSize:13}}>
              <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:600,color:"#ccc"}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const navItems=[
    {id:"post" as const,icon:"📤",label:"Post"},
    {id:"log" as const,icon:"📋",label:"Feed",badge:log.length},
    {id:"stats" as const,icon:"📊",label:"Stats"},
  ];

  const tabTitle=navItems.find(n=>n.id===tab)?.label||"";

  return(
    <div style={{minHeight:"100dvh",background:"#141414",display:"flex",flexDirection:"column"}}>
      <style>{css}</style>

      {/* ── Mobile top bar ── */}
      <div className="top-bar-mobile" style={{display:"none",background:"#0f0f0f",borderBottom:"1px solid #1e1e1e",padding:"14px 16px",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50,backdropFilter:"blur(10px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#E50914",animation:"pulse 1.5s infinite"}}/>
          <span style={{fontSize:21,fontWeight:900,letterSpacing:.5}}>PPP<span style={{color:"#FF007A"}}>TV</span></span>
          <span style={{fontSize:10,color:"#555",letterSpacing:2,fontWeight:600}}>AUTO</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:"#555"}}>{todayCount}/6</span>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#46d369"}}/>
        </div>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* ── Desktop Sidebar ── */}
        <aside className="sidebar" style={{display:"none",width:240,background:"#0f0f0f",borderRight:"1px solid #1e1e1e",flexDirection:"column",position:"sticky",top:0,height:"100dvh",flexShrink:0}}>
          {/* Logo */}
          <div style={{padding:"24px 20px 20px",borderBottom:"1px solid #1e1e1e"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:"#E50914",animation:"pulse 1.5s infinite",flexShrink:0}}/>
              <span style={{fontSize:26,fontWeight:900,letterSpacing:.5}}>PPP<span style={{color:"#FF007A"}}>TV</span></span>
            </div>
            <div style={{fontSize:10,color:"#444",letterSpacing:2,fontWeight:700,paddingLeft:20}}>AUTO POSTER</div>
          </div>

          {/* Nav */}
          <nav style={{padding:"12px 10px",flex:1}}>
            <div style={{fontSize:10,color:"#333",letterSpacing:2,fontWeight:700,padding:"8px 14px 6px",textTransform:"uppercase"}}>Menu</div>
            {navItems.map(n=>(
              <button key={n.id} className={`nav-item${tab===n.id?" active":""}`} onClick={()=>setTab(n.id)}>
                <span style={{fontSize:18}}>{n.icon}</span>
                <span>{n.label}</span>
                {n.badge&&n.badge>0&&<span style={{marginLeft:"auto",background:"#E50914",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700}}>{n.badge}</span>}
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div style={{padding:"16px 20px",borderTop:"1px solid #1e1e1e"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#46d369",animation:"pulse 2s infinite"}}/>
              <span style={{fontSize:12,color:"#46d369",fontWeight:600}}>Live</span>
            </div>
            <div style={{fontSize:12,color:"#444"}}>{todayCount}/6 posts today</div>
            <div style={{fontSize:11,color:"#333",marginTop:2}}>PPP TV Kenya</div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main style={{flex:1,overflowY:"auto",minWidth:0}}>
          <div className="main-content" style={{padding:"20px 16px",maxWidth:1100,margin:"0 auto"}}>
            {/* Desktop page header */}
            <div className="desk-header" style={{display:"none",alignItems:"center",justifyContent:"space-between",marginBottom:28,paddingBottom:20,borderBottom:"1px solid #1e1e1e"}}>
              <div>
                <h1 style={{fontSize:24,fontWeight:900,margin:0,letterSpacing:-.3}}>{tabTitle}</h1>
                <div style={{fontSize:13,color:"#555",marginTop:3}}>PPP TV Kenya — Auto Social Poster</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:13,color:"#555"}}>{todayCount}/6 today</span>
                <div style={{display:"flex",alignItems:"center",gap:6,background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:20,padding:"6px 12px"}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:"#46d369",animation:"pulse 2s infinite"}}/>
                  <span style={{fontSize:12,color:"#46d369",fontWeight:600}}>Live</span>
                </div>
              </div>
            </div>

            {tab==="post"&&<PostPanel/>}
            {tab==="log"&&<LogPanel/>}
            {tab==="stats"&&<StatsPanel/>}
            <div style={{height:24}}/>
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="mobile-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"#0f0f0f",borderTop:"1px solid #1e1e1e",zIndex:50,backdropFilter:"blur(10px)"}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)}
            style={{flex:1,padding:"10px 0 8px",background:"none",border:"none",color:tab===n.id?"#fff":"#555",fontSize:10,fontWeight:tab===n.id?700:400,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,borderTop:tab===n.id?"2px solid #E50914":"2px solid transparent",transition:"all .15s"}}>
            <span style={{fontSize:22}}>{n.icon}</span>
            <span style={{letterSpacing:.5}}>{n.label}{n.badge&&n.badge>0?<span style={{background:"#E50914",borderRadius:10,padding:"0 5px",fontSize:9,marginLeft:3,fontWeight:700}}>{n.badge}</span>:null}</span>
          </button>
        ))}
      </nav>

      {/* Lightbox */}
      {lightbox&&preview?.imageBase64&&(
        <div onClick={()=>setLightbox(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.96)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={preview.imageBase64} alt="" style={{maxWidth:"95vw",maxHeight:"90dvh",borderRadius:10,objectFit:"contain"}}/>
        </div>
      )}
    </div>
  );
}
