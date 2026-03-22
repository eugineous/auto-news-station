"use client";
import { useState, useEffect, useCallback } from "react";

const R="#E50914",PK="#FF007A",BK="#141414",DK="#1a1a1a",CD="#242424",BR="#333",MT="#888",WH="#fff",GR="#46d369",WN="#f87171",BL="#1877f2";
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
  const[copied,setCopied]=useState<string|null>(null);

  function copyText(text:string,label:string){
    navigator.clipboard.writeText(text).then(()=>{setCopied(label);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});
  }

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

  const css=`
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
    html,body{height:100%}
    body{background:#141414;color:#fff;font-family:'Inter',system-ui,sans-serif}
    input,button,textarea{font-family:inherit}
    input::placeholder,textarea::placeholder{color:#888}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-track{background:#1a1a1a}
    ::-webkit-scrollbar-thumb{background:#444;border-radius:4px}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    .card{background:#242424;border-radius:12px;border:1px solid #333}
    .btn{border:none;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .15s}
    .btn:disabled{opacity:.4;cursor:not-allowed}
    .btn-red{background:#E50914;color:#fff}
    .btn-red:hover:not(:disabled){opacity:.85}
    .btn-ghost{background:none;border:1px solid #333;color:#888;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer}
    .btn-ghost:hover{border-color:#666;color:#fff}
    .nav-item{display:flex;align-items:center;gap:12px;padding:11px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;color:#888;transition:all .15s;border:none;background:none;width:100%;text-align:left}
    .nav-item:hover{background:#2a2a2a;color:#fff}
    .nav-item.active{background:#2a2a2a;color:#fff;border-left:3px solid #E50914;padding-left:13px}
    .tag{border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700}
    .video-frame{width:100%;aspect-ratio:16/9;border:none;border-radius:8px;background:#000;display:block}
    @media(max-width:767px){
      .sidebar{display:none!important}
      .mobile-nav{display:flex!important}
      .main-wrap{padding-bottom:68px!important}
      .top-bar{display:flex!important}
      .desk-head{display:none!important}
    }
    @media(min-width:768px){
      .sidebar{display:flex!important}
      .mobile-nav{display:none!important}
      .top-bar{display:none!important}
      .desk-head{display:flex!important}
    }
  `;

  const isVideo=preview?.scraped?.isVideo;
  const embedUrl=preview?.scraped?.videoEmbedUrl;
  const videoTypeLabel=preview?.scraped?.type==="youtube"?"YouTube":preview?.scraped?.type==="tiktok"?"TikTok":preview?.scraped?.type==="instagram"?"Instagram Reel":"Video";

  const PostTab=()=>(
    <div style={{maxWidth:640,margin:"0 auto",animation:"fadeIn .25s ease"}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,color:"#888",letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Post from any URL</div>
        <div style={{display:"flex",gap:8}}>
          <input
            style={{flex:1,background:"#1e1e1e",border:"1px solid #333",borderRadius:8,padding:"12px 14px",color:"#fff",fontSize:15,outline:"none"}}
            placeholder="Article / YouTube / TikTok / Instagram / Twitter URL…"
            value={url} onChange={e=>setUrl(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!preview&&!needsManual&&doPreview()}
          />
          {!preview&&!needsManual&&(
            <button className="btn btn-red" onClick={()=>doPreview()} disabled={prevLoading||!url.trim()} style={{whiteSpace:"nowrap",minWidth:96}}>
              {prevLoading?"⏳…":"🔍 Preview"}
            </button>
          )}
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,color:"#888",letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Category</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {CATS.map(c=>(
            <button key={c} onClick={()=>setCat(c)}
              style={{background:cat===c?"#FF007A":"#2a2a2a",color:"#fff",border:"1px solid "+(cat===c?"#FF007A":"#333"),borderRadius:20,padding:"5px 13px",fontSize:12,cursor:"pointer",fontWeight:cat===c?700:400}}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {err&&<div style={{background:"#2d0000",border:"1px solid #f87171",borderRadius:8,padding:"11px 14px",color:"#f87171",fontSize:13,marginBottom:12}}>⚠ {err}</div>}
      {ok&&<div style={{background:"#002d10",border:"1px solid #46d369",borderRadius:8,padding:"11px 14px",color:"#46d369",fontSize:13,marginBottom:12}}>{ok}</div>}

      {needsManual&&(
        <div className="card" style={{padding:"16px",marginBottom:12,animation:"fadeIn .25s ease",borderColor:"#FF007A44"}}>
          <div style={{fontSize:13,color:"#FF007A",fontWeight:700,marginBottom:4}}>📸 Instagram URL detected</div>
          <div style={{fontSize:12,color:"#888",marginBottom:14}}>Instagram blocks scraping. Enter the post title and caption to continue.</div>
          <input style={{width:"100%",background:"#1e1e1e",border:"1px solid #333",borderRadius:8,padding:"10px 12px",color:"#fff",fontSize:14,outline:"none",marginBottom:10}}
            placeholder="Post title (e.g. Sauti Sol drops new album)" value={igTitle} onChange={e=>setIgTitle(e.target.value)}/>
          <textarea style={{width:"100%",background:"#1e1e1e",border:"1px solid #333",borderRadius:8,padding:"10px 12px",color:"#fff",fontSize:13,outline:"none",resize:"vertical",minHeight:80,marginBottom:12}}
            placeholder="Paste the caption or describe what the post is about…" value={igCaption} onChange={e=>setIgCaption(e.target.value)}/>
          <button className="btn btn-red" onClick={()=>doPreview(igTitle,igCaption)} disabled={prevLoading||!igTitle.trim()||!igCaption.trim()} style={{width:"100%"}}>
            {prevLoading?"⏳ Generating…":"🔍 Generate Preview"}
          </button>
        </div>
      )}

      {preview&&(
        <div className="card" style={{overflow:"hidden",animation:"fadeIn .25s ease"}}>
          {/* Video embed player */}
          {isVideo&&embedUrl&&(
            <div style={{background:"#000",position:"relative"}}>
              {showPlayer
                ?<iframe src={embedUrl} className="video-frame" allowFullScreen allow="autoplay; encrypted-media" style={{aspectRatio:preview.scraped.type==="tiktok"?"9/16":"16/9"}}/>
                :<div style={{position:"relative",cursor:"pointer"}} onClick={()=>setShowPlayer(true)}>
                  {preview.imageBase64&&<img src={preview.imageBase64} alt="" style={{width:"100%",aspectRatio:"16/9",objectFit:"cover",display:"block",opacity:.7}}/>}
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
                    <div style={{width:64,height:64,borderRadius:"50%",background:"rgba(229,9,20,.9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>▶</div>
                    <div style={{fontSize:12,color:"#fff",background:"rgba(0,0,0,.6)",padding:"4px 10px",borderRadius:20}}>Play {videoTypeLabel}</div>
                  </div>
                </div>
              }
            </div>
          )}
          {/* Thumbnail for non-video or video without embed */}
          {(!isVideo||!embedUrl)&&preview.imageBase64&&(
            <div style={{cursor:"zoom-in"}} onClick={()=>setLightbox(true)}>
              <img src={preview.imageBase64} alt="" style={{width:"100%",aspectRatio:"4/5",objectFit:"cover",display:"block"}}/>
            </div>
          )}
          <div style={{padding:"14px 16px"}}>
            <div style={{fontSize:15,fontWeight:700,lineHeight:1.3,marginBottom:6}}>{preview.ai.clickbaitTitle}</div>
            <div style={{fontSize:12,color:"#888",lineHeight:1.5,marginBottom:10,whiteSpace:"pre-line"}}>{preview.ai.caption}</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
              <span className="tag" style={{background:"#FF007A",color:"#fff"}}>{preview.category}</span>
              <span style={{fontSize:12,color:"#888"}}>{preview.scraped.sourceName}</span>
              {isVideo&&<span className="tag" style={{background:"#E50914",color:"#fff"}}>📹 VIDEO</span>}
            </div>
            {isVideo&&<div style={{fontSize:11,marginBottom:12,padding:"8px 10px",background:"#1e1e1e",borderRadius:6,color:preview.scraped.videoUrl?"#46d369":"#f87171"}}>
              {preview.scraped.videoUrl?"✅ Video ready — will post as Reel to IG + video to FB":"⚠ Video download unavailable — will post branded thumbnail as image"}
            </div>}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              <button className="btn-ghost" onClick={()=>copyText(url.trim(),"link")} style={{fontSize:12,padding:"6px 12px"}}>
                {copied==="link"?"✓ Copied":"📋 Copy Link"}
              </button>
              <button className="btn-ghost" onClick={()=>copyText(preview.ai.caption,"caption")} style={{fontSize:12,padding:"6px 12px"}}>
                {copied==="caption"?"✓ Copied":"📋 Copy Caption"}
              </button>
              <button className="btn-ghost" onClick={()=>copyText(preview.ai.clickbaitTitle,"title")} style={{fontSize:12,padding:"6px 12px"}}>
                {copied==="title"?"✓ Copied":"📋 Copy Title"}
              </button>
              {preview.scraped.videoUrl&&<button className="btn-ghost" onClick={()=>copyText(preview.scraped.videoUrl!,"video")} style={{fontSize:12,padding:"6px 12px"}}>
                {copied==="video"?"✓ Copied":"📋 Copy Video URL"}
              </button>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost" onClick={()=>{setPreview(null);setOk(null);setNeedsManual(false);setShowPlayer(false);}} style={{flex:1}}>✕ Clear</button>
              <button className="btn btn-red" onClick={doPost} disabled={posting} style={{flex:2}}>
                {posting?"⏳ Posting…":isVideo&&preview.scraped.videoUrl?"📹 Post Video to IG + FB":"📤 Post to IG + FB"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const LogTab=()=>(
    <div style={{animation:"fadeIn .25s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:11,color:"#888",letterSpacing:1,textTransform:"uppercase"}}>Post Log ({log.length})</div>
        <button className="btn-ghost" onClick={fetchLog}>↻ Refresh</button>
      </div>
      {logLoading&&<div style={{color:"#888",fontSize:13,textAlign:"center",padding:40}}>Loading…</div>}
      {!logLoading&&log.length===0&&<div style={{color:"#888",fontSize:13,textAlign:"center",padding:40}}>No posts yet</div>}
      <div style={{display:"grid",gap:10}}>
        {log.slice().reverse().map(entry=>{
          const igKey=entry.articleId+"_instagram",fbKey=entry.articleId+"_facebook";
          const igR=retries[igKey],fbR=retries[fbKey];
          return(
            <div key={entry.articleId} className="card" style={{padding:"13px 15px"}}>
              <div style={{fontSize:14,fontWeight:700,lineHeight:1.3,marginBottom:7}}>{entry.title}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:9,alignItems:"center"}}>
                <span className="tag" style={{background:"#FF007A",color:"#fff"}}>{entry.category}</span>
                {entry.isBreaking&&<span className="tag" style={{background:"#E50914",color:"#fff"}}>BREAKING</span>}
                {entry.manualPost&&<span className="tag" style={{background:"#444",color:"#fff"}}>MANUAL</span>}
                {entry.sourceType&&["youtube","tiktok","instagram"].includes(entry.sourceType)&&<span className="tag" style={{background:"#333",color:"#888"}}>📹</span>}
                <span style={{fontSize:11,color:"#888"}}>{ago(entry.postedAt)}</span>
                {entry.url&&<button onClick={()=>copyText(entry.url,"log_"+entry.articleId)} style={{background:"none",border:"1px solid #333",borderRadius:4,padding:"1px 8px",fontSize:11,color:"#888",cursor:"pointer"}}>{copied===("log_"+entry.articleId)?"✓":"📋"}</button>}
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"#888"}}>IG:</span>
                  {entry.instagram.success?<span style={{fontSize:12,color:"#46d369"}}>✓</span>
                    :igR?.done?<span style={{fontSize:12,color:"#46d369"}}>✓ retried</span>
                    :<button onClick={()=>doRetry(entry,"instagram")} disabled={igR?.loading}
                      style={{background:igR?.loading?"#555":"#f87171",color:"#fff",border:"none",borderRadius:6,padding:"3px 10px",fontSize:12,cursor:igR?.loading?"not-allowed":"pointer",fontWeight:700}}>
                      {igR?.loading?"…":"↺ IG"}
                    </button>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"#888"}}>FB:</span>
                  {entry.facebook.success?<span style={{fontSize:12,color:"#46d369"}}>✓</span>
                    :fbR?.done?<span style={{fontSize:12,color:"#46d369"}}>✓ retried</span>
                    :<button onClick={()=>doRetry(entry,"facebook")} disabled={fbR?.loading}
                      style={{background:fbR?.loading?"#555":"#f87171",color:"#fff",border:"none",borderRadius:6,padding:"3px 10px",fontSize:12,cursor:fbR?.loading?"not-allowed":"pointer",fontWeight:700}}>
                      {fbR?.loading?"…":"↺ FB"}
                    </button>}
                </div>
              </div>
              {(igR?.error||fbR?.error)&&<div style={{fontSize:11,color:"#f87171",marginTop:5}}>{igR?.error||fbR?.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const StatsTab=()=>(
    <div style={{animation:"fadeIn .25s ease"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {([["Today",todayCount,"#E50914"],["Total",successCount,"#46d369"],["IG",igCount,"#FF007A"],["FB",fbCount,"#1877f2"]] as const).map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:"18px 16px"}}>
            <div style={{fontSize:40,fontWeight:800,color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:12,color:"#888",marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{padding:"14px 16px",marginBottom:14}}>
        <div style={{fontSize:11,color:"#888",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>By Category</div>
        {CATS.filter(c=>catCounts[c]>0).map(c=>(
          <div key={c} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
            <div style={{fontSize:12,color:"#888",width:88,flexShrink:0}}>{c}</div>
            <div style={{flex:1,background:"#333",borderRadius:4,height:6}}>
              <div style={{width:`${Math.round(catCounts[c]/maxCat*100)}%`,background:"#FF007A",borderRadius:4,height:6,transition:"width .4s"}}/>
            </div>
            <div style={{fontSize:12,color:"#888",width:18,textAlign:"right"}}>{catCounts[c]}</div>
          </div>
        ))}
        {CATS.every(c=>catCounts[c]===0)&&<div style={{color:"#888",fontSize:13}}>No data yet</div>}
      </div>
      <div className="card" style={{padding:"14px 16px"}}>
        <div style={{fontSize:11,color:"#888",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Config</div>
        {[["Schedule","Every 30 min"],["Peak Hours","6am–11pm EAT"],["Daily Cap","6/day"],["Per Run","1 post"],["Dedup","Cloudflare KV"],["Filter","Kenya only"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #333",fontSize:13}}>
            <span style={{color:"#888"}}>{k}</span><span style={{fontWeight:600}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const navItems=[
    {id:"post" as const,icon:"📤",label:"Post"},
    {id:"log" as const,icon:"📋",label:"Feed",badge:log.length},
    {id:"stats" as const,icon:"📊",label:"Stats"},
  ];

  return(
    <div style={{minHeight:"100dvh",background:"#141414",display:"flex",flexDirection:"column"}}>
      <style>{css}</style>
      <div className="top-bar" style={{display:"none",background:"#1a1a1a",borderBottom:"1px solid #333",padding:"13px 16px",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#E50914",animation:"pulse 1.5s infinite"}}/>
          <span style={{fontSize:20,fontWeight:800,letterSpacing:1}}>PPP<span style={{color:"#FF007A"}}>TV</span></span>
          <span style={{fontSize:11,color:"#888",letterSpacing:1}}>AUTO</span>
        </div>
        <span style={{fontSize:12,color:"#888"}}>{todayCount}/6 today</span>
      </div>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <aside className="sidebar" style={{display:"none",width:220,background:"#1a1a1a",borderRight:"1px solid #333",flexDirection:"column",position:"sticky",top:0,height:"100dvh",flexShrink:0}}>
          <div style={{padding:"22px 18px 18px",borderBottom:"1px solid #333"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <div style={{width:9,height:9,borderRadius:"50%",background:"#E50914",animation:"pulse 1.5s infinite"}}/>
              <span style={{fontSize:22,fontWeight:800,letterSpacing:1}}>PPP<span style={{color:"#FF007A"}}>TV</span></span>
            </div>
            <div style={{fontSize:10,color:"#888",letterSpacing:2,paddingLeft:17}}>AUTO POSTER</div>
          </div>
          <nav style={{padding:"10px",flex:1}}>
            {navItems.map(n=>(
              <button key={n.id} className={`nav-item${tab===n.id?" active":""}`} onClick={()=>setTab(n.id)}>
                <span style={{fontSize:17}}>{n.icon}</span>
                <span>{n.label}</span>
                {n.badge&&n.badge>0&&<span style={{marginLeft:"auto",background:"#E50914",borderRadius:10,padding:"1px 6px",fontSize:11}}>{n.badge}</span>}
              </button>
            ))}
          </nav>
          <div style={{padding:"14px 18px",borderTop:"1px solid #333",fontSize:12,color:"#888"}}>
            <div style={{marginBottom:3}}>{todayCount}/6 today</div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#46d369"}}/>
              <span>Live</span>
            </div>
          </div>
        </aside>
        <main className="main-wrap" style={{flex:1,overflowY:"auto",padding:"20px 16px"}}>
          <div className="desk-head" style={{display:"none",alignItems:"center",justifyContent:"space-between",marginBottom:24,paddingBottom:18,borderBottom:"1px solid #333"}}>
            <div>
              <h1 style={{fontSize:20,fontWeight:800,margin:0}}>{navItems.find(n=>n.id===tab)?.label}</h1>
              <div style={{fontSize:12,color:"#888",marginTop:2}}>PPP TV Kenya Auto Poster</div>
            </div>
            <span style={{fontSize:13,color:"#888"}}>{todayCount}/6 today</span>
          </div>
          {tab==="post"&&<PostTab/>}
          {tab==="log"&&<LogTab/>}
          {tab==="stats"&&<StatsTab/>}
          <div style={{height:20}}/>
        </main>
      </div>
      <nav className="mobile-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"#1a1a1a",borderTop:"1px solid #333",zIndex:50}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)}
            style={{flex:1,padding:"10px 0 8px",background:"none",border:"none",color:tab===n.id?"#fff":"#888",fontSize:11,fontWeight:tab===n.id?700:400,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,borderTop:tab===n.id?"2px solid #E50914":"2px solid transparent"}}>
            <span style={{fontSize:20}}>{n.icon}</span>
            <span>{n.label}{n.badge&&n.badge>0?<span style={{background:"#E50914",borderRadius:10,padding:"0 5px",fontSize:10,marginLeft:3}}>{n.badge}</span>:null}</span>
          </button>
        ))}
      </nav>
      {lightbox&&preview?.imageBase64&&(
        <div onClick={()=>setLightbox(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.95)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={preview.imageBase64} alt="" style={{maxWidth:"95vw",maxHeight:"90dvh",borderRadius:8,objectFit:"contain"}}/>
        </div>
      )}
    </div>
  );
}
