"use client";
import { useState, useEffect, useCallback } from "react";

const PINK = "#FF007A", RED = "#E50914";
const CATS_FILTER = ["ALL","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];
const CATS_POST = ["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];
const CAT_COLOR: Record<string,string> = {
  CELEBRITY:"#FF007A",NEWS:"#FF007A",POLITICS:"#FF007A",FASHION:"#FF007A",
  MUSIC:"#FF6B00","TV & FILM":"#3b82f6",MOVIES:"#3b82f6",
  SPORTS:"#00CFFF",TECHNOLOGY:"#FFE600",BUSINESS:"#FFD700",AWARDS:"#FFD700",
  ENTERTAINMENT:"#9B30FF",EVENTS:"#22C55E","EAST AFRICA":"#F97316",GENERAL:"#E50914",
};
const cc = (cat: string) => CAT_COLOR[cat?.toUpperCase()] ?? RED;

interface LogEntry {
  articleId:string;title:string;url:string;category:string;
  manualPost?:boolean;isBreaking?:boolean;
  instagram:{success:boolean;postId?:string;error?:string};
  facebook:{success:boolean;postId?:string;error?:string};
  postedAt:string;
}
interface Preview {
  scraped:{type:string;title:string;description:string;imageUrl:string;sourceName:string;isVideo?:boolean;videoEmbedUrl?:string|null;videoUrl?:string|null};
  ai:{clickbaitTitle:string;caption:string};
  category:string;imageBase64:string;
}
interface Retry{loading:boolean;done?:boolean;error?:string}

function ago(iso:string){
  const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if(m<1)return"just now";if(m<60)return m+"m ago";
  const h=Math.floor(m/60);if(h<24)return h+"h ago";
  return Math.floor(h/24)+"d ago";
}
function Spin(){return <span style={{display:"inline-block",width:13,height:13,border:"2px solid rgba(255,255,255,.25)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;}

function PostCard({entry,onRetry,retries}:{entry:LogEntry;onRetry:(e:LogEntry,p:"instagram"|"facebook")=>void;retries:Record<string,Retry>}){
  const [hov,setHov]=useState(false);
  const igOk=entry.instagram.success||retries[entry.articleId+"_instagram"]?.done;
  const fbOk=entry.facebook.success||retries[entry.articleId+"_facebook"]?.done;
  const accent=cc(entry.category);
  return(
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{flexShrink:0,width:160,borderRadius:8,overflow:"hidden",background:"#1a1a1a",border:"1px solid #2a2a2a",transition:"transform .2s,box-shadow .2s",transform:hov?"scale(1.05)":"scale(1)",boxShadow:hov?"0 12px 40px rgba(0,0,0,.8)":"none",cursor:"pointer",position:"relative"}}>
      <div style={{width:"100%",aspectRatio:"4/5",background:"linear-gradient(135deg,#1a1a1a,#0a0a0a)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:accent}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6,padding:"16px 10px 10px"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:11,color:accent,letterSpacing:2,textTransform:"uppercase"}}>{entry.category}</div>
          <div style={{fontSize:10,color:"#666",textAlign:"center",lineHeight:1.4}}>{entry.title.slice(0,60)}{entry.title.length>60?"...":""}</div>
        </div>
        <div style={{position:"absolute",top:8,right:6,display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end",zIndex:3}}>
          {entry.isBreaking&&<span style={{background:RED,color:"#fff",fontSize:8,fontWeight:800,padding:"2px 5px",borderRadius:3}}>BREAKING</span>}
          {entry.manualPost&&<span style={{background:"#2a2a2a",color:"#888",fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:3}}>MANUAL</span>}
        </div>
        {hov&&(!igOk||!fbOk)&&(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:10,zIndex:10}}>
            {!igOk&&<button onClick={e=>{e.stopPropagation();onRetry(entry,"instagram");}} disabled={retries[entry.articleId+"_instagram"]?.loading} style={{background:PINK,color:"#fff",border:"none",borderRadius:5,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>{retries[entry.articleId+"_instagram"]?.loading?"...":"Retry IG"}</button>}
            {!fbOk&&<button onClick={e=>{e.stopPropagation();onRetry(entry,"facebook");}} disabled={retries[entry.articleId+"_facebook"]?.loading} style={{background:"#1877f2",color:"#fff",border:"none",borderRadius:5,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>{retries[entry.articleId+"_facebook"]?.loading?"...":"Retry FB"}</button>}
          </div>
        )}
      </div>
      <div style={{padding:"8px 10px"}}>
        <div style={{fontSize:11,color:"#ccc",lineHeight:1.4,marginBottom:5,fontWeight:500}}>{entry.title.slice(0,55)}{entry.title.length>55?"...":""}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color:"#888"}}>{ago(entry.postedAt)}</span>
          <div style={{display:"flex",gap:4}}>
            <span style={{fontSize:10,color:igOk?"#4ade80":"#f87171"}}>IG{igOk?"v":"x"}</span>
            <span style={{fontSize:10,color:fbOk?"#4ade80":"#f87171"}}>FB{fbOk?"v":"x"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickPost({onSuccess}:{onSuccess:()=>void}){
  const [url,setUrl]=useState("");const [cat,setCat]=useState("AUTO");
  const [preview,setPreview]=useState<Preview|null>(null);
  const [prevLoading,setPrevLoading]=useState(false);const [posting,setPosting]=useState(false);
  const [err,setErr]=useState<string|null>(null);const [ok,setOk]=useState<string|null>(null);
  const [needsManual,setNeedsManual]=useState(false);
  const [igTitle,setIgTitle]=useState("");const [igCaption,setIgCaption]=useState("");
  const [lightbox,setLightbox]=useState(false);const [copied,setCopied]=useState<string|null>(null);
  useEffect(()=>{setNeedsManual(false);setIgTitle("");setIgCaption("");setErr(null);setPreview(null);setOk(null);},[url]);
  async function doPreview(ot?:string,oc?:string){
    if(!url.trim())return;
    setPrevLoading(true);setErr(null);setPreview(null);setOk(null);
    try{
      const body:Record<string,string>={url:url.trim()};
      if(cat!=="AUTO")body.category=cat;if(ot)body.manualTitle=ot;if(oc)body.manualCaption=oc;
      const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(d.error==="INSTAGRAM_MANUAL"){setNeedsManual(true);setPrevLoading(false);return;}
      if(!r.ok||d.error)throw new Error(d.error||"Preview failed");
      setNeedsManual(false);setPreview(d);
    }catch(e:any){setErr(e.message);}finally{setPrevLoading(false);}
  }
  async function doPost(){
    if(!preview)return;
    setPosting(true);setErr(null);setOk(null);
    try{
      const body:Record<string,string>={url:url.trim()};
      if(cat!=="AUTO")body.category=cat;
      if(needsManual&&igTitle)body.manualTitle=igTitle;
      if(needsManual&&igCaption)body.manualCaption=igCaption;
      const r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok||d.error)throw new Error(d.error||"Post failed");
      const ig=d.instagram?.success,fb=d.facebook?.success;
      setOk((ig&&fb)?"Posted to IG + FB":ig?"Posted to IG only":fb?"Posted to FB only":"Both failed");
      if(ig||fb){setUrl("");setPreview(null);setNeedsManual(false);setTimeout(onSuccess,1500);}
    }catch(e:any){setErr(e.message);}finally{setPosting(false);}
  }
  function copy(text:string,k:string){navigator.clipboard.writeText(text).then(()=>{setCopied(k);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});}
  const inp:React.CSSProperties={width:"100%",background:"#1a1a1a",border:"1px solid #333",borderRadius:6,padding:"11px 14px",color:"#e5e5e5",fontSize:14,outline:"none"};
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input style={{...inp,flex:1}} placeholder="Paste article / YouTube / TikTok URL..." value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doPreview()}/>
        <button onClick={()=>doPreview()} disabled={!url.trim()||prevLoading} style={{background:RED,color:"#fff",border:"none",borderRadius:6,padding:"11px 18px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:(!url.trim()||prevLoading)?.4:1,whiteSpace:"nowrap"}}>{prevLoading?<Spin/>:"Preview"}</button>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {CATS_POST.map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${cat===c?RED:"#2a2a2a"}`,background:cat===c?RED:"#1a1a1a",color:cat===c?"#fff":"#666",transition:"all .15s"}}>{c}</button>)}
      </div>
      {needsManual&&(
        <div style={{background:"#1a0a0a",border:"1px solid #3a1a1a",borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{fontSize:11,color:PINK,marginBottom:10,fontWeight:700}}>Instagram - enter manually</div>
          <input style={{...inp,marginBottom:8}} placeholder="Headline..." value={igTitle} onChange={e=>setIgTitle(e.target.value)}/>
          <textarea style={{...inp,resize:"vertical",minHeight:80}} placeholder="Caption..." value={igCaption} onChange={e=>setIgCaption(e.target.value)}/>
          <button onClick={()=>doPreview(igTitle,igCaption)} disabled={!igTitle||!igCaption||prevLoading} style={{marginTop:10,width:"100%",background:PINK,color:"#fff",border:"none",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{prevLoading?<Spin/>:"Generate Preview"}</button>
        </div>
      )}
      {err&&<div style={{background:"#1a0808",border:"1px solid #3a1a1a",borderRadius:6,padding:"10px 14px",color:"#f87171",fontSize:13,marginBottom:12}}>{err}</div>}
      {ok&&<div style={{background:"#081a08",border:"1px solid #1a3a1a",borderRadius:6,padding:"10px 14px",color:"#4ade80",fontSize:13,marginBottom:12}}>{ok}</div>}
      {preview&&(
        <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,overflow:"hidden"}}>
          <div style={{cursor:"zoom-in"}} onClick={()=>setLightbox(true)}>
            <img src={preview.imageBase64} alt="" style={{width:"100%",display:"block",aspectRatio:"4/5",objectFit:"cover"}}/>
          </div>
          <div style={{padding:16}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,lineHeight:1.2,marginBottom:8,letterSpacing:.5}}>{preview.ai.clickbaitTitle}</div>
            <div style={{fontSize:13,color:"#777",lineHeight:1.65,marginBottom:14,whiteSpace:"pre-line"}}>{preview.ai.caption}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              <span style={{background:RED,color:"#fff",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700}}>{preview.category}</span>
              <button onClick={()=>copy(preview.ai.clickbaitTitle,"t")} style={{background:"none",border:"1px solid #333",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#aaa",cursor:"pointer"}}>{copied==="t"?"Copied":"Copy Title"}</button>
              <button onClick={()=>copy(preview.ai.caption,"c")} style={{background:"none",border:"1px solid #333",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#aaa",cursor:"pointer"}}>{copied==="c"?"Copied":"Copy Caption"}</button>
            </div>
            <button onClick={doPost} disabled={posting} style={{width:"100%",background:RED,color:"#fff",border:"none",borderRadius:6,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:posting?.5:1}}>{posting?<Spin/>:"Post to Instagram + Facebook"}</button>
          </div>
        </div>
      )}
      {lightbox&&preview?.imageBase64&&(
        <div onClick={()=>setLightbox(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.97)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={preview.imageBase64} alt="" style={{maxWidth:"95vw",maxHeight:"90dvh",borderRadius:8,objectFit:"contain"}}/>
        </div>
      )}
    </div>
  );
}

export default function Dashboard(){
  const [log,setLog]=useState<LogEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [retries,setRetries]=useState<Record<string,Retry>>({});
  const [tab,setTab]=useState<"feed"|"post"|"stats">("feed");
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("ALL");
  const [filterPlatform,setFilterPlatform]=useState<"all"|"ig"|"fb"|"failed">("all");
  const [nextIn,setNextIn]=useState("~10 min");
  const [toast,setToast]=useState<{msg:string;type:"ok"|"err"}|null>(null);

  const fetchLog=useCallback(async()=>{
    try{const r=await fetch("/api/post-log");if(r.ok){const d=await r.json();setLog(d.log||[]);}}
    catch{}finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    fetchLog();
    let es:EventSource,rt:ReturnType<typeof setTimeout>;
    function connect(){
      es=new EventSource("/api/events");
      es.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.type==="log"&&Array.isArray(d.log)){setLog(d.log);setLoading(false);}}catch{}};
      es.onerror=()=>{es.close();rt=setTimeout(connect,5000);};
    }
    connect();
    const t=setInterval(fetchLog,60000);
    return()=>{es?.close();clearTimeout(rt);clearInterval(t);};
  },[fetchLog]);

  useEffect(()=>{
    const tick=()=>{
      const now=new Date();const next=new Date(now);
      next.setMinutes(Math.ceil(now.getMinutes()/10)*10,0,0);
      const diff=Math.max(0,Math.floor((next.getTime()-now.getTime())/1000));
      setNextIn(`${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,"0")}`);
    };
    tick();const t=setInterval(tick,1000);return()=>clearInterval(t);
  },[]);

  async function doRetry(entry:LogEntry,platform:"instagram"|"facebook"){
    const key=entry.articleId+"_"+platform;
    setRetries(s=>({...s,[key]:{loading:true}}));
    try{
      const r=await fetch("/api/retry-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({articleId:entry.articleId,title:entry.title,caption:entry.title,articleUrl:entry.url,category:entry.category,platform})});
      const d=await r.json();
      const success=platform==="instagram"?d.instagram?.success:d.facebook?.success;
      setRetries(s=>({...s,[key]:{loading:false,done:success,error:success?undefined:(d.error||"Failed")}}));
      if(success){setToast({msg:`Retried ${platform}`,type:"ok"});setTimeout(fetchLog,1500);}
      else setToast({msg:d.error||"Retry failed",type:"err"});
    }catch(e:any){setRetries(s=>({...s,[key]:{loading:false,error:e.message}}));setToast({msg:e.message,type:"err"});}
  }

  const sorted=[...log].sort((a,b)=>new Date(b.postedAt).getTime()-new Date(a.postedAt).getTime());
  const latest=sorted[0]??null;
  const todayCount=sorted.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString()).length;
  const catColor=latest?cc(latest.category):RED;

  const filtered=sorted.filter(e=>{
    if(search&&!e.title.toLowerCase().includes(search.toLowerCase())&&!e.category.toLowerCase().includes(search.toLowerCase()))return false;
    if(filterCat!=="ALL"&&e.category!==filterCat)return false;
    if(filterPlatform==="ig"&&!e.instagram.success)return false;
    if(filterPlatform==="fb"&&!e.facebook.success)return false;
    if(filterPlatform==="failed"&&(e.instagram.success||e.facebook.success))return false;
    return true;
  });

  const byCat=CATS_FILTER.slice(1).reduce((acc,cat)=>{
    const entries=sorted.filter(e=>e.category===cat);
    if(entries.length>0)acc[cat]=entries;
    return acc;
  },{} as Record<string,LogEntry[]>);

  return(
    <div style={{minHeight:"100dvh",background:"#141414",color:"#e5e5e5",fontFamily:"Inter,system-ui,sans-serif"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade{animation:fadeIn .2s ease}
        .scroll-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none}
        .scroll-row::-webkit-scrollbar{display:none}
        input,button,select,textarea{font-family:inherit}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
      `}</style>

      <div style={{position:"relative",minHeight:260,background:"linear-gradient(135deg,#0a0a0a 0%,#1a0a0a 50%,#0a0a14 100%)",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 20% 50%,rgba(229,9,20,.07) 0%,transparent 50%),radial-gradient(circle at 80% 20%,rgba(255,0,122,.05) 0%,transparent 50%)"}}/>
        <div style={{position:"relative",padding:"36px 28px 28px",maxWidth:720}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:RED,animation:"pulse 1.5s infinite"}}/>
            <span style={{fontSize:10,color:"#555",letterSpacing:3,textTransform:"uppercase",fontWeight:700}}>PPP TV Live Auto-Poster</span>
            <span style={{fontSize:10,color:"#333"}}>|</span>
            <span style={{fontSize:10,color:"#444"}}>Next post {nextIn}</span>
          </div>
          {latest?(
            <>
              <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <span style={{background:catColor,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:4,letterSpacing:1,textTransform:"uppercase"}}>{latest.category}</span>
                {latest.isBreaking&&<span style={{background:RED,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:4}}>BREAKING</span>}
              </div>
              <h1 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(26px,4vw,46px)",lineHeight:1.05,letterSpacing:1,marginBottom:12,color:"#fff"}}>{latest.title}</h1>
              <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"#aaa"}}>{ago(latest.postedAt)}</span>
                <span style={{fontSize:12,color:latest.instagram.success?"#4ade80":"#f87171"}}>{latest.instagram.success?"v":"x"} Instagram</span>
                <span style={{fontSize:12,color:latest.facebook.success?"#4ade80":"#f87171"}}>{latest.facebook.success?"v":"x"} Facebook</span>
                {latest.url&&<a href={latest.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#aaa",textDecoration:"none",border:"1px solid #333",borderRadius:4,padding:"3px 10px"}}>Source</a>}
              </div>
            </>
          ):(
            <div>
              <h1 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:40,letterSpacing:2,color:"#aaa",marginBottom:8}}>No posts yet</h1>
              <p style={{fontSize:13,color:"#555"}}>Auto-poster will publish the first article soon.</p>
            </div>
          )}
        </div>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:60,background:"linear-gradient(to top,#141414,transparent)"}}/>
      </div>

      <div style={{borderBottom:"1px solid #1f1f1f",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",background:"#141414",position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex"}}>
          {(["feed","post","stats"] as const).map(v=>(
            <button key={v} onClick={()=>setTab(v)} style={{background:"none",border:"none",color:tab===v?"#fff":"#555",fontSize:13,fontWeight:tab===v?700:500,cursor:"pointer",padding:"14px 16px",borderBottom:`2px solid ${tab===v?RED:"transparent"}`,transition:"all .15s",textTransform:"capitalize"}}>
              {v==="feed"?"Feed":v==="post"?"Post":"Stats"}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:11,color:"#555"}}>{todayCount} today</span>
          <button onClick={async()=>{await fetch("/api/auth",{method:"DELETE"});window.location.href="/login";}} style={{background:"none",border:"none",fontSize:11,color:"#555",cursor:"pointer"}}>Sign out</button>
        </div>
      </div>

      <div style={{padding:"24px",maxWidth:1200,margin:"0 auto"}}>

        {tab==="feed"&&(
          <div className="fade">
            <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search posts..." style={{flex:1,minWidth:180,maxWidth:300,background:"#1a1a1a",border:"1px solid #333",borderRadius:6,padding:"9px 12px",color:"#e5e5e5",fontSize:13,outline:"none"}}/>
              <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{background:"#1a1a1a",border:"1px solid #333",borderRadius:6,padding:"9px 12px",color:"#e5e5e5",fontSize:13,outline:"none"}}>
                {CATS_FILTER.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{display:"flex",gap:4}}>
                {(["all","ig","fb","failed"] as const).map(f=>(
                  <button key={f} onClick={()=>setFilterPlatform(f)} style={{padding:"7px 12px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${filterPlatform===f?RED:"#333"}`,background:filterPlatform===f?RED:"#1a1a1a",color:filterPlatform===f?"#fff":"#aaa",transition:"all .15s",textTransform:"uppercase"}}>
                    {f==="all"?"All":f==="ig"?"IG":f==="fb"?"FB":"Failed"}
                  </button>
                ))}
              </div>
              <button onClick={fetchLog} style={{background:"none",border:"1px solid #333",borderRadius:6,padding:"7px 12px",fontSize:11,color:"#aaa",cursor:"pointer"}}>Refresh</button>
            </div>
            {loading?(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                {Array.from({length:8}).map((_,i)=><div key={i} style={{height:260,borderRadius:8,background:"#1a1a1a",animation:"pulse 1.5s infinite"}}/>)}
              </div>
            ):(search||filterCat!=="ALL"||filterPlatform!=="all")?(
              <div>
                <div style={{fontSize:11,color:"#555",marginBottom:12}}>{filtered.length} results</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                  {filtered.map(e=><PostCard key={e.articleId} entry={e} onRetry={doRetry} retries={retries}/>)}
                </div>
                {filtered.length===0&&<div style={{textAlign:"center",padding:60,color:"#555",fontSize:14}}>No posts match your filters</div>}
              </div>
            ):(
              <div>
                {sorted.length>0&&(
                  <div style={{marginBottom:32}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                      <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1}}>Recently Posted</h2>
                      <span style={{fontSize:11,color:"#555"}}>{sorted.length} posts</span>
                    </div>
                    <div className="scroll-row">{sorted.slice(0,20).map(e=><PostCard key={e.articleId} entry={e} onRetry={doRetry} retries={retries}/>)}</div>
                  </div>
                )}
                {Object.entries(byCat).map(([cat,entries])=>(
                  <div key={cat} style={{marginBottom:32}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                      <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,color:cc(cat)}}>{cat}</h2>
                      <span style={{fontSize:11,color:"#555"}}>{entries.length}</span>
                    </div>
                    <div className="scroll-row">{entries.map(e=><PostCard key={e.articleId} entry={e} onRetry={doRetry} retries={retries}/>)}</div>
                  </div>
                ))}
                {sorted.length===0&&<div style={{textAlign:"center",padding:80,color:"#555",fontSize:14}}>No posts yet</div>}
              </div>
            )}
          </div>
        )}

        {tab==="post"&&(
          <div className="fade" style={{maxWidth:560}}>
            <div style={{marginBottom:20}}>
              <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:1,marginBottom:4}}>Quick Post</h2>
              <p style={{fontSize:12,color:"#555"}}>Paste any URL and post to IG + FB instantly.</p>
            </div>
            <QuickPost onSuccess={()=>{fetchLog();setTab("feed");setToast({msg:"Posted!",type:"ok"});}}/>
          </div>
        )}

        {tab==="stats"&&(
          <div className="fade">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:20}}>
              {[
                {label:"Today",value:todayCount,color:RED},
                {label:"Total",value:sorted.filter(p=>p.instagram.success||p.facebook.success).length,color:"#fff"},
                {label:"Instagram",value:sorted.filter(p=>p.instagram.success).length,color:"#E1306C"},
                {label:"Facebook",value:sorted.filter(p=>p.facebook.success).length,color:"#1877f2"},
                {label:"Failed",value:sorted.filter(p=>!p.instagram.success&&!p.facebook.success).length,color:"#f87171"},
              ].map(s=>(
                <div key={s.label} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"18px 16px"}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:40,color:s.color,lineHeight:1,letterSpacing:1}}>{s.value}</div>
                  <div style={{fontSize:10,color:"#aaa",marginTop:4,letterSpacing:2,fontWeight:700,textTransform:"uppercase"}}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"16px 18px"}}>
                <div style={{fontSize:10,color:"#555",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>By Category</div>
                {(()=>{
                  const counts=CATS_FILTER.slice(1).reduce((a,c)=>({...a,[c]:sorted.filter(p=>p.category===c).length}),{} as Record<string,number>);
                  const max=Math.max(1,...Object.values(counts));
                  return CATS_FILTER.slice(1).filter(c=>counts[c]>0).map(c=>(
                    <div key={c} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div style={{fontSize:11,color:"#555",width:80,flexShrink:0}}>{c}</div>
                      <div style={{flex:1,background:"#111",borderRadius:2,height:4}}>
                        <div style={{width:`${Math.round(counts[c]/max*100)}%`,background:cc(c),borderRadius:2,height:4,transition:"width .4s"}}/>
                      </div>
                      <div style={{fontSize:11,color:"#444",width:20,textAlign:"right"}}>{counts[c]}</div>
                    </div>
                  ));
                })()}
                {sorted.length===0&&<div style={{color:"#333",fontSize:12}}>No data yet</div>}
              </div>
              <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"16px 18px"}}>
                <div style={{fontSize:10,color:"#555",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>System Config</div>
                {[["Schedule","Every 10 min"],["Hours","24/7"],["Daily Cap","None"],["Per Run","1 post"],["Dedup","Cloudflare KV"],["AI","Gemini + NVIDIA"],["Image","1080x1350 JPEG"],["Source","PPP TV Worker"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1f1f1f",fontSize:12}}>
                    <span style={{color:"#555"}}>{k}</span>
                    <span style={{fontWeight:600,color:"#e5e5e5"}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {toast&&(
        <div onClick={()=>setToast(null)} style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="ok"?"#0d2a0d":"#2a0d0d",border:`1px solid ${toast.type==="ok"?"#1a4a1a":"#4a1a1a"}`,color:toast.type==="ok"?"#4ade80":"#f87171",padding:"12px 20px",borderRadius:8,fontSize:13,fontWeight:600,zIndex:300,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
          {toast.type==="ok"?"v ":"x "}{toast.msg}
        </div>
      )}
    </div>
  );
}
