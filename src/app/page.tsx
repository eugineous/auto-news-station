"use client";
import { useState, useEffect, useCallback } from "react";

const R="#E50914",PK="#FF007A",BK="#141414",DK="#1a1a1a",CD="#242424",BR="#333",MT="#888",WH="#fff",GR="#46d369",WN="#f87171",BL="#1877f2";
const CATS=["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];

interface LogEntry{articleId:string;title:string;url:string;category:string;sourceType?:string;manualPost?:boolean;instagram:{success:boolean;postId?:string;error?:string};facebook:{success:boolean;postId?:string;error?:string};postedAt:string;isBreaking?:boolean}
interface Preview{scraped:{type:string;title:string;description:string;imageUrl:string;sourceName:string};ai:{clickbaitTitle:string;caption:string};category:string;imageBase64:string}
interface Retry{loading:boolean;done?:boolean;error?:string}

function ago(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"now";if(m<60)return m+"m";const h=Math.floor(m/60);if(h<24)return h+"h";return Math.floor(h/24)+"d"}

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

  const fetchLog=useCallback(async()=>{
    try{const r=await fetch("/api/post-log");if(r.ok){const d=await r.json();setLog(d.log||[]);}}catch{}finally{setLogLoading(false);}
  },[]);

  useEffect(()=>{fetchLog();const t=setInterval(fetchLog,60000);return()=>clearInterval(t);},[fetchLog]);

  async function doPreview(){
    if(!url.trim())return;
    setPrevLoading(true);setErr(null);setPreview(null);setOk(null);
    try{
      const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.trim(),category:cat==="AUTO"?undefined:cat})});
      const d=await r.json();
      if(!r.ok||d.error)throw new Error(d.error||"Preview failed");
      setPreview(d);
    }catch(e:any){setErr(e.message);}
    finally{setPrevLoading(false);}
  }

  async function doPost(){
    if(!preview)return;
    setPosting(true);setErr(null);setOk(null);
    try{
      const r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.trim(),category:cat==="AUTO"?undefined:cat})});
      const d=await r.json();
      if(!r.ok||d.error)throw new Error(d.error||"Post failed");
      const ig=d.instagram?.success,fb=d.facebook?.success;
      setOk((ig&&fb)?"✅ Posted to IG + FB":ig?"✅ IG only":fb?"✅ FB only":"❌ Both failed");
      if(ig||fb){setUrl("");setPreview(null);setTimeout(fetchLog,2000);}
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
    body{background:${BK};color:${WH};font-family:'Inter',system-ui,sans-serif}
    input,button,textarea{font-family:inherit}
    input::placeholder,textarea::placeholder{color:${MT}}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-track{background:#1a1a1a}
    ::-webkit-scrollbar-thumb{background:#444;border-radius:4px}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .card{background:${CD};border-radius:12px;border:1px solid ${BR};transition:border-color .2s}
    .card:hover{border-color:#555}
    .btn-primary{background:${R};color:${WH};border:none;border-radius:8px;padding:12px 24px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .15s,transform .1s}
    .btn-primary:hover:not(:disabled){opacity:.88;transform:translateY(-1px)}
    .btn-primary:disabled{opacity:.45;cursor:not-allowed}
    .btn-ghost{background:none;border:1px solid ${BR};color:${MT};border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;transition:all .15s}
    .btn-ghost:hover{border-color:#666;color:${WH}}
    .nav-item{display:flex;align-items:center;gap:12px;padding:12px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;color:${MT};transition:all .15s;border:none;background:none;width:100%;text-align:left}
    .nav-item:hover{background:#2a2a2a;color:${WH}}
    .nav-item.active{background:#2a2a2a;color:${WH};border-left:3px solid ${R}}
    .stat-card{background:${CD};border-radius:12px;border:1px solid ${BR};padding:20px;display:flex;flex-direction:column;gap:4px}
    .tag{border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;letter-spacing:.5px}
    /* Mobile bottom nav */
    @media(max-width:767px){
      .sidebar{display:none!important}
      .mobile-nav{display:flex!important}
      .main-wrap{padding-bottom:64px!important;padding-left:0!important}
      .top-bar{display:flex!important}
      .desktop-header{display:none!important}
    }
    /* Desktop sidebar */
    @media(min-width:768px){
      .sidebar{display:flex!important}
      .mobile-nav{display:none!important}
      .top-bar{display:none!important}
      .desktop-header{display:flex!important}
    }
  `;

  // ── POST TAB ──────────────────────────────────────────────────────────────
  const PostTab=()=>(
    <div style={{maxWidth:640,margin:"0 auto",animation:"fadeIn .3s ease"}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:MT,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Post from any URL</div>
        <div style={{display:"flex",gap:8}}>
          <input
            style={{flex:1,background:"#1e1e1e",border:`1px solid ${err?"#f87171":BR}`,borderRadius:8,padding:"12px 16px",color:WH,fontSize:15,outline:"none",transition:"border-color .2s"}}
            placeholder="Paste article / YouTube / TikTok / Twitter URL…"
            value={url} onChange={e=>setUrl(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!preview&&doPreview()}
            onFocus={e=>(e.target.style.borderColor=PK)}
            onBlur={e=>(e.target.style.borderColor=err?"#f87171":BR)}
          />
          {!preview&&(
            <button className="btn-primary" onClick={doPreview} disabled={prevLoading||!url.trim()}
              style={{whiteSpace:"nowrap",minWidth:100}}>
              {prevLoading?"⏳ …":"🔍 Preview"}
            </button>
          )}
        </div>
      </div>

      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:MT,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Category</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {CATS.map(c=>(
            <button key={c} onClick={()=>setCat(c)}
              style={{background:cat===c?PK:"#2a2a2a",color:WH,border:`1px solid ${cat===c?PK:BR}`,borderRadius:20,padding:"5px 14px",fontSize:12,cursor:"pointer",fontWeight:cat===c?700:400,transition:"all .15s"}}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {err&&<div style={{background:"#2d0000",border:`1px solid ${WN}`,borderRadius:8,padding:"12px 16px",color:WN,fontSize:13,marginBottom:16}}>⚠ {err}</div>}
      {ok&&<div style={{background:"#002d10",border:`1px solid ${GR}`,borderRadius:8,padding:"12px 16px",color:GR,fontSize:13,marginBottom:16}}>{ok}</div>}

      {preview&&(
        <div className="card" style={{overflow:"hidden",animation:"fadeIn .3s ease"}}>
          {preview.imageBase64&&(
            <div style={{position:"relative",cursor:"zoom-in"}} onClick={()=>setLightbox(true)}>
              <img src={preview.imageBase64} alt="" style={{width:"100%",aspectRatio:"4/5",objectFit:"cover",display:"block"}}/>
              <div style={{position:"absolute",top:12,right:12,background:"rgba(0,0,0,.7)",borderRadius:6,padding:"4px 8px",fontSize:11,color:WH}}>Click to zoom</div>
            </div>
          )}
          <div style={{padding:"16px 20px"}}>
            <div style={{fontSize:16,fontWeight:700,lineHeight:1.3,marginBottom:8}}>{preview.ai.clickbaitTitle}</div>
            <div style={{fontSize:13,color:MT,lineHeight:1.5,marginBottom:12}}>{preview.ai.caption.slice(0,200)}…</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:16}}>
              <span className="tag" style={{background:PK,color:WH}}>{preview.category}</span>
              <span style={{fontSize:12,color:MT}}>{preview.scraped.sourceName}</span>
              <span className="tag" style={{background:"#333",color:MT}}>{preview.scraped.type}</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn-ghost" onClick={()=>{setPreview(null);setOk(null);}} style={{flex:1}}>✕ Clear</button>
              <button className="btn-primary" onClick={doPost} disabled={posting} style={{flex:2}}>
                {posting?"⏳ Posting…":"📤 Post to IG + FB"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── LOG TAB ───────────────────────────────────────────────────────────────
  const LogTab=()=>(
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:11,color:MT,letterSpacing:1,textTransform:"uppercase"}}>Post Log ({log.length})</div>
        <button className="btn-ghost" onClick={fetchLog}>↻ Refresh</button>
      </div>
      {logLoading&&<div style={{color:MT,fontSize:13,textAlign:"center",padding:40}}>Loading…</div>}
      {!logLoading&&log.length===0&&<div style={{color:MT,fontSize:13,textAlign:"center",padding:40}}>No posts yet</div>}
      <div style={{display:"grid",gap:10}}>
        {log.slice().reverse().map(entry=>{
          const igKey=entry.articleId+"_instagram",fbKey=entry.articleId+"_facebook";
          const igR=retries[igKey],fbR=retries[fbKey];
          return(
            <div key={entry.articleId} className="card" style={{padding:"14px 16px"}}>
              <div style={{fontSize:14,fontWeight:700,lineHeight:1.3,marginBottom:8}}>{entry.title}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
                <span className="tag" style={{background:PK,color:WH}}>{entry.category}</span>
                {entry.isBreaking&&<span className="tag" style={{background:R,color:WH}}>BREAKING</span>}
                {entry.manualPost&&<span className="tag" style={{background:"#444",color:WH}}>MANUAL</span>}
                <span style={{fontSize:11,color:MT}}>{ago(entry.postedAt)}</span>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:MT}}>IG:</span>
                  {entry.instagram.success
                    ?<span style={{fontSize:12,color:GR}}>✓ OK</span>
                    :igR?.done?<span style={{fontSize:12,color:GR}}>✓ retried</span>
                    :<button onClick={()=>doRetry(entry,"instagram")} disabled={igR?.loading}
                      style={{background:igR?.loading?"#555":WN,color:WH,border:"none",borderRadius:6,padding:"3px 10px",fontSize:12,cursor:igR?.loading?"not-allowed":"pointer",fontWeight:700}}>
                      {igR?.loading?"…":"↺ IG"}
                    </button>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:MT}}>FB:</span>
                  {entry.facebook.success
                    ?<span style={{fontSize:12,color:GR}}>✓ OK</span>
                    :fbR?.done?<span style={{fontSize:12,color:GR}}>✓ retried</span>
                    :<button onClick={()=>doRetry(entry,"facebook")} disabled={fbR?.loading}
                      style={{background:fbR?.loading?"#555":WN,color:WH,border:"none",borderRadius:6,padding:"3px 10px",fontSize:12,cursor:fbR?.loading?"not-allowed":"pointer",fontWeight:700}}>
                      {fbR?.loading?"…":"↺ FB"}
                    </button>}
                </div>
              </div>
              {(igR?.error||fbR?.error)&&<div style={{fontSize:11,color:WN,marginTop:6}}>{igR?.error||fbR?.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── STATS TAB ─────────────────────────────────────────────────────────────
  const StatsTab=()=>(
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:24}}>
        {([["Today",todayCount,R],["Total",successCount,GR],["IG",igCount,PK],["FB",fbCount,BL]] as const).map(([label,val,color])=>(
          <div key={label} className="stat-card">
            <div style={{fontSize:42,fontWeight:800,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:12,color:MT}}>{label}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{padding:"16px 20px",marginBottom:16}}>
        <div style={{fontSize:11,color:MT,letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>By Category</div>
        {CATS.filter(c=>catCounts[c]>0).map(c=>(
          <div key={c} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{fontSize:12,color:MT,width:90,flexShrink:0}}>{c}</div>
            <div style={{flex:1,background:"#333",borderRadius:4,height:6}}>
              <div style={{width:`${Math.round(catCounts[c]/maxCat*100)}%`,background:PK,borderRadius:4,height:6,transition:"width .4s"}}/>
            </div>
            <div style={{fontSize:12,color:MT,width:20,textAlign:"right"}}>{catCounts[c]}</div>
          </div>
        ))}
        {CATS.every(c=>catCounts[c]===0)&&<div style={{color:MT,fontSize:13}}>No data yet</div>}
      </div>
      <div className="card" style={{padding:"16px 20px"}}>
        <div style={{fontSize:11,color:MT,letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>Config</div>
        {[["Schedule","Every 30 min"],["Peak Hours","6am–11pm EAT"],["Daily Cap","6 posts/day"],["Per Run","1 post"],["Dedup","Cloudflare KV"],["Filter","Kenya only"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${BR}`,fontSize:13}}>
            <span style={{color:MT}}>{k}</span><span style={{fontWeight:600}}>{v}</span>
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
    <div style={{minHeight:"100dvh",background:BK,display:"flex",flexDirection:"column"}}>
      <style>{css}</style>

      {/* ── Mobile top bar ── */}
      <div className="top-bar" style={{display:"none",background:DK,borderBottom:`1px solid ${BR}`,padding:"14px 16px",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:R,animation:"pulse 1.5s infinite"}}/>
          <span style={{fontSize:20,fontWeight:800,letterSpacing:1}}>PPP<span style={{color:PK}}>TV</span></span>
          <span style={{fontSize:11,color:MT,letterSpacing:1}}>AUTO</span>
        </div>
        <span style={{fontSize:12,color:MT}}>{todayCount}/6 today</span>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* ── Desktop sidebar ── */}
        <aside className="sidebar" style={{display:"none",width:240,background:DK,borderRight:`1px solid ${BR}`,flexDirection:"column",position:"sticky",top:0,height:"100dvh",flexShrink:0}}>
          {/* Logo */}
          <div style={{padding:"24px 20px 20px",borderBottom:`1px solid ${BR}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:R,animation:"pulse 1.5s infinite"}}/>
              <span style={{fontSize:24,fontWeight:800,letterSpacing:1}}>PPP<span style={{color:PK}}>TV</span></span>
            </div>
            <div style={{fontSize:11,color:MT,letterSpacing:2,paddingLeft:18}}>AUTO POSTER</div>
          </div>
          {/* Nav */}
          <nav style={{padding:"12px 12px",flex:1}}>
            {navItems.map(n=>(
              <button key={n.id} className={`nav-item${tab===n.id?" active":""}`} onClick={()=>setTab(n.id)}>
                <span style={{fontSize:18}}>{n.icon}</span>
                <span>{n.label}</span>
                {n.badge&&n.badge>0&&<span style={{marginLeft:"auto",background:R,borderRadius:10,padding:"1px 7px",fontSize:11}}>{n.badge}</span>}
              </button>
            ))}
          </nav>
          {/* Footer */}
          <div style={{padding:"16px 20px",borderTop:`1px solid ${BR}`,fontSize:12,color:MT}}>
            <div style={{marginBottom:4}}>{todayCount}/6 posts today</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:GR}}/>
              <span>Live</span>
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="main-wrap" style={{flex:1,overflowY:"auto",padding:"24px",paddingBottom:0}}>
          {/* Desktop header */}
          <div className="desktop-header" style={{display:"none",alignItems:"center",justifyContent:"space-between",marginBottom:28,paddingBottom:20,borderBottom:`1px solid ${BR}`}}>
            <div>
              <h1 style={{fontSize:22,fontWeight:800,margin:0}}>{navItems.find(n=>n.id===tab)?.label}</h1>
              <div style={{fontSize:13,color:MT,marginTop:2}}>PPP TV Kenya Auto Poster</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <span style={{fontSize:13,color:MT}}>{todayCount}/6 today</span>
              <div style={{width:8,height:8,borderRadius:"50%",background:GR}}/>
            </div>
          </div>

          {tab==="post"&&<PostTab/>}
          {tab==="log"&&<LogTab/>}
          {tab==="stats"&&<StatsTab/>}
          <div style={{height:24}}/>
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:DK,borderTop:`1px solid ${BR}`,zIndex:50}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)}
            style={{flex:1,padding:"10px 0 8px",background:"none",border:"none",color:tab===n.id?WH:MT,fontSize:11,fontWeight:tab===n.id?700:400,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,borderTop:tab===n.id?`2px solid ${R}`:"2px solid transparent"}}>
            <span style={{fontSize:20}}>{n.icon}</span>
            <span>{n.label}{n.badge&&n.badge>0?<span style={{background:R,borderRadius:10,padding:"0 5px",fontSize:10,marginLeft:3}}>{n.badge}</span>:null}</span>
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
