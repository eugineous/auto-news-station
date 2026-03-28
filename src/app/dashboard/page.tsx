"use client";
import { useState, useEffect, useCallback } from "react";
const R="#E50914",PK="#FF007A";
const CAT:Record<string,{bg:string;text:string}> = {CELEBRITY:{bg:"#FF007A",text:"#fff"},POLITICS:{bg:"#FF007A",text:"#fff"},NEWS:{bg:"#FF007A",text:"#fff"},FASHION:{bg:"#ec4899",text:"#fff"},MUSIC:{bg:"#a855f7",text:"#fff"},ENTERTAINMENT:{bg:"#a855f7",text:"#fff"},"TV & FILM":{bg:"#f59e0b",text:"#000"},MOVIES:{bg:"#f59e0b",text:"#000"},LIFESTYLE:{bg:"#14b8a6",text:"#fff"},HEALTH:{bg:"#10b981",text:"#fff"},EVENTS:{bg:"#10b981",text:"#fff"},"EAST AFRICA":{bg:"#06b6d4",text:"#000"},TECHNOLOGY:{bg:"#06b6d4",text:"#000"},COMEDY:{bg:"#eab308",text:"#000"},AWARDS:{bg:"#eab308",text:"#000"},INFLUENCERS:{bg:"#f97316",text:"#fff"},SPORTS:{bg:"#3b82f6",text:"#fff"},SCIENCE:{bg:"#3b82f6",text:"#fff"},BUSINESS:{bg:"#FFD700",text:"#000"},GENERAL:{bg:"#E50914",text:"#fff"}};
const cc=(c:string)=>CAT[c?.toUpperCase()]??{bg:"#E50914",text:"#fff"};
const CATS=["CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL","SPORTS","BUSINESS","POLITICS","TECHNOLOGY","HEALTH","SCIENCE","LIFESTYLE","COMEDY","INFLUENCERS"];
const CATS_POST=["AUTO",...CATS];
interface Post{articleId:string;title:string;url:string;category:string;manualPost?:boolean;isBreaking?:boolean;instagram:{success:boolean;postId?:string;error?:string};facebook:{success:boolean;postId?:string;error?:string};postedAt:string;}
interface FeedItem{slug:string;title:string;excerpt:string;category:string;sourceName:string;sourceUrl:string;publishedAt:string;articleUrl:string;imageUrl:string;imageUrlDirect:string;}
interface Preview{scraped:{type:string;title:string;description:string;imageUrl:string;sourceName:string;isVideo?:boolean;videoEmbedUrl?:string|null};ai:{clickbaitTitle:string;caption:string};category:string;imageBase64:string;}
interface Retry{loading:boolean;done?:boolean;error?:string}
function ago(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";}
function Spin(){return <span style={{display:"inline-block",width:13,height:13,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;}
function Pill({cat}:{cat:string}){const {bg,text}=cc(cat);return <span style={{background:bg,color:text,fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:20,letterSpacing:.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{cat}</span>;}
export default function Dashboard(){
  const [posts,setPosts]=useState<Post[]>([]);
  const [loading,setLoading]=useState(true);
  const [retries,setRetries]=useState<Record<string,Retry>>({});
  const [section,setSection]=useState<"overview"|"feed"|"compose"|"failures"|"analytics"|"settings">("overview");
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("ALL");
  const [filterPlatform,setFilterPlatform]=useState<"all"|"ig"|"fb"|"failed">("all");
  const [nextIn,setNextIn]=useState("~10 min");
  const [toast,setToast]=useState<{msg:string;type:"ok"|"err"}|null>(null);
  const fetchPosts=useCallback(async()=>{try{const r=await fetch("/api/post-log");if(r.ok){const d=await r.json();setPosts(d.log||[]);}}catch{}finally{setLoading(false);};},[]);
  useEffect(()=>{fetchPosts();let es:EventSource,rt:ReturnType<typeof setTimeout>;function connect(){es=new EventSource("/api/events");es.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.type==="log"&&Array.isArray(d.log)){setPosts(d.log);setLoading(false);}}catch{}};es.onerror=()=>{es.close();rt=setTimeout(connect,5000);};}connect();const t=setInterval(fetchPosts,60000);return()=>{es?.close();clearTimeout(rt);clearInterval(t);};},[fetchPosts]);
  useEffect(()=>{const tick=()=>{const now=new Date();const next=new Date(now);next.setMinutes(Math.ceil(now.getMinutes()/10)*10,0,0);const diff=Math.max(0,Math.floor((next.getTime()-now.getTime())/1000));setNextIn(`${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,"0")}`);};tick();const t=setInterval(tick,1000);return()=>clearInterval(t);},[]);
  async function doRetry(p:Post,platform:"instagram"|"facebook"){const key=p.articleId+"_"+platform;setRetries(s=>({...s,[key]:{loading:true}}));try{const r=await fetch("/api/retry-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({articleId:p.articleId,title:p.title,caption:p.title,articleUrl:p.url,category:p.category,platform})});const d=await r.json();const ok=platform==="instagram"?d.instagram?.success:d.facebook?.success;setRetries(s=>({...s,[key]:{loading:false,done:ok,error:ok?undefined:(d.error||"Failed")}}));if(ok){setToast({msg:"Retried "+platform+" OK",type:"ok"});setTimeout(fetchPosts,1500);}else setToast({msg:d.error||"Retry failed",type:"err"});}catch(e:any){setRetries(s=>({...s,[key]:{loading:false,error:e.message}}));setToast({msg:e.message,type:"err"});}}
  const sorted=[...posts].sort((a,b)=>new Date(b.postedAt).getTime()-new Date(a.postedAt).getTime());
  const latest=sorted[0]??null;
  const todayCount=sorted.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString()).length;
  const failCount=sorted.filter(p=>!p.instagram.success&&!p.facebook.success).length;
  const filtered=sorted.filter(e=>{if(search&&!e.title.toLowerCase().includes(search.toLowerCase())&&!e.category.toLowerCase().includes(search.toLowerCase()))return false;if(filterCat!=="ALL"&&e.category!==filterCat)return false;if(filterPlatform==="ig"&&!e.instagram.success)return false;if(filterPlatform==="fb"&&!e.facebook.success)return false;if(filterPlatform==="failed"&&(e.instagram.success||e.facebook.success))return false;return true;});
  const byCat=CATS.reduce((acc,cat)=>{const entries=sorted.filter(e=>e.category===cat);if(entries.length>0)acc[cat]=entries;return acc;},{} as Record<string,Post[]>);
  const NAV=[{id:"overview",icon:"⚡",label:"Overview"},{id:"feed",icon:"📡",label:"Live Feed"},{id:"compose",icon:"✏️",label:"Compose"},{id:"failures",icon:"⚠️",label:"Failures",alert:failCount>0},{id:"analytics",icon:"📊",label:"Analytics"},{id:"settings",icon:"⚙️",label:"Settings"}] as const;
  const inp:React.CSSProperties={width:"100%",background:"#111",border:"1px solid #2a2a2a",borderRadius:6,padding:"10px 12px",color:"#e5e5e5",fontSize:13,outline:"none",fontFamily:"inherit"};
  return <div style={{minHeight:"100dvh",background:"#0d0d0d",color:"#e5e5e5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}}>
    <style>{`*{box-sizing:border-box;margin:0;padding:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fadeIn .2s ease}.scroll-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none}.scroll-row::-webkit-scrollbar{display:none}input,button,select,textarea{font-family:inherit}::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}@media(max-width:767px){.sidebar{display:none!important}.mobile-nav{display:flex!important}.main{padding-bottom:72px!important}}@media(min-width:768px){.sidebar{display:flex!important}.mobile-nav{display:none!important}}`}</style>
    <aside className="sidebar" style={{width:220,background:"#0a0a0a",borderRight:"1px solid #1f1f1f",display:"none",flexDirection:"column",height:"100dvh",position:"sticky",top:0,flexShrink:0}}>
      <div style={{padding:"20px 16px 16px",borderBottom:"1px solid #1f1f1f"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><div style={{width:8,height:8,borderRadius:"50%",background:R,animation:"pulse 1.5s infinite"}}/><span style={{fontFamily:"Bebas Neue,sans-serif",fontSize:24,letterSpacing:2,lineHeight:1}}>PPP<span style={{color:R}}>TV</span></span></div><div style={{fontSize:9,color:"#444",letterSpacing:3,paddingLeft:16,textTransform:"uppercase",fontWeight:700}}>Command Center</div></div>
      <nav style={{flex:1,padding:"10px 8px",overflowY:"auto"}}>{NAV.map(n=><button key={n.id} onClick={()=>setSection(n.id as any)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:8,background:section===n.id?"#1f1f1f":"none",border:"none",color:section===n.id?"#fff":"#666",fontSize:13,fontWeight:section===n.id?700:500,cursor:"pointer",textAlign:"left",transition:"all .15s",borderLeft:section===n.id?`3px solid ${R}`:"3px solid transparent"}}><span style={{fontSize:16,width:20,textAlign:"center"}}>{n.icon}</span><span style={{flex:1}}>{n.label}</span>{(n as any).alert&&<span style={{width:7,height:7,borderRadius:"50%",background:"#f87171",flexShrink:0}}/>}</button>)}</nav>
      <div style={{padding:"12px 10px",borderTop:"1px solid #1f1f1f"}}><div style={{fontSize:11,color:"#444",marginBottom:6,textAlign:"center"}}>Next: <span style={{color:"#888",fontFamily:"monospace"}}>{nextIn}</span></div><div style={{fontSize:11,color:"#444",marginBottom:10,textAlign:"center"}}>{todayCount} posts today</div><button onClick={async()=>{await fetch("/api/auth",{method:"DELETE"});window.location.href="/login";}} style={{width:"100%",background:"none",border:"1px solid #2a2a2a",borderRadius:6,padding:"7px",fontSize:11,color:"#555",cursor:"pointer"}}>Sign Out</button></div>
    </aside>
    <div className="main" style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflowY:"auto"}}>
      <div style={{background:"rgba(13,13,13,0.95)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1f1f1f",padding:"0 20px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:R,animation:"pulse 1.5s infinite"}}/><span style={{fontFamily:"Bebas Neue,sans-serif",fontSize:18,letterSpacing:2}}>PPP<span style={{color:R}}>TV</span></span><span style={{fontSize:10,color:"#444",letterSpacing:2,textTransform:"uppercase",fontWeight:700}}>Cockpit</span></div><span style={{fontSize:11,color:"#444",fontFamily:"monospace"}}>Next: {nextIn}</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>{failCount>0&&<span style={{background:"#2a0a0a",border:"1px solid #4a1a1a",color:"#f87171",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>{failCount} failed</span>}<span style={{fontSize:11,color:"#555"}}>{todayCount} today</span><button onClick={fetchPosts} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#555",cursor:"pointer"}}>↻</button></div>
      </div>
      {section==="overview"&&<div style={{position:"relative",minHeight:200,background:"linear-gradient(135deg,#0a0a0a,#1a0a0a)",overflow:"hidden",borderBottom:"1px solid #1f1f1f"}}><div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 20% 50%,rgba(229,9,20,.07) 0%,transparent 50%)"}}/>
        <div style={{position:"relative",padding:"24px 24px 20px",maxWidth:700}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{width:7,height:7,borderRadius:"50%",background:R,animation:"pulse 1.5s infinite"}}/><span style={{fontSize:10,color:"#555",letterSpacing:3,textTransform:"uppercase",fontWeight:700}}>Live Auto-Poster</span><span style={{fontSize:10,color:"#333"}}>·</span><span style={{fontSize:10,color:"#444"}}>Next post {nextIn}</span></div>
          {latest?<><div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}><Pill cat={latest.category}/>{latest.isBreaking&&<span style={{background:R,color:"#fff",fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:3}}>BREAKING</span>}</div><h1 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:"clamp(20px,3.5vw,40px)",lineHeight:1.05,letterSpacing:1,marginBottom:8,color:"#fff"}}>{latest.title}</h1><div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:12,color:"#aaa"}}>{ago(latest.postedAt)}</span><span style={{fontSize:12,color:latest.instagram.success?"#4ade80":"#f87171"}}>{latest.instagram.success?"✓":"✗"} Instagram</span><span style={{fontSize:12,color:latest.facebook.success?"#4ade80":"#f87171"}}>{latest.facebook.success?"✓":"✗"} Facebook</span>{latest.url&&<a href={latest.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#aaa",textDecoration:"none",border:"1px solid #333",borderRadius:4,padding:"3px 10px"}}>Source ↗</a>}</div></>:<div><h1 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:34,letterSpacing:2,color:"#aaa",marginBottom:6}}>No posts yet</h1><p style={{fontSize:13,color:"#555"}}>Auto-poster will publish the first article soon.</p></div>}
        </div>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:40,background:"linear-gradient(to top,#0d0d0d,transparent)"}}/>
      </div>}
      <div style={{padding:"20px 24px",maxWidth:1200,margin:"0 auto",width:"100%"}}>
        {section==="overview"&&<div className="fade">
          <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search posts..." style={{flex:1,minWidth:180,maxWidth:280,background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"8px 12px",color:"#e5e5e5",fontSize:13,outline:"none"}}/>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"8px 12px",color:"#e5e5e5",fontSize:13,outline:"none"}}><option value="ALL">All Categories</option>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
            <div style={{display:"flex",gap:4}}>{(["all","ig","fb","failed"] as const).map(f=><button key={f} onClick={()=>setFilterPlatform(f)} style={{padding:"6px 10px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${filterPlatform===f?R:"#2a2a2a"}`,background:filterPlatform===f?R:"#1a1a1a",color:filterPlatform===f?"#fff":"#666",transition:"all .15s",textTransform:"uppercase"}}>{f==="all"?"All":f==="ig"?"IG":f==="fb"?"FB":"Failed"}</button>)}</div>
            <button onClick={fetchPosts} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,padding:"6px 12px",fontSize:11,color:"#666",cursor:"pointer"}}>↻ Refresh</button>
          </div>
          {loading?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>{Array.from({length:8}).map((_,i)=><div key={i} style={{height:260,borderRadius:8,background:"#1a1a1a",animation:"pulse 1.5s infinite"}}/>)}</div>
          :(search||filterCat!=="ALL"||filterPlatform!=="all")?<div><div style={{fontSize:11,color:"#555",marginBottom:12}}>{filtered.length} results</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>{filtered.map(p=><PostCard key={p.articleId} p={p} onRetry={doRetry} retries={retries}/>)}</div>{filtered.length===0&&<div style={{textAlign:"center",padding:60,color:"#555",fontSize:14}}>No posts match your filters</div>}</div>
          :<div>{sorted.length>0&&<div style={{marginBottom:32}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:20,letterSpacing:1}}>Recently Posted</h2><span style={{fontSize:11,color:"#555"}}>{sorted.length} total</span></div><div className="scroll-row">{sorted.slice(0,20).map(p=><PostCard key={p.articleId} p={p} onRetry={doRetry} retries={retries}/>)}</div></div>}{Object.entries(byCat).map(([cat,entries])=><div key={cat} style={{marginBottom:32}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:20,letterSpacing:1,color:cc(cat).bg}}>{cat}</h2><span style={{fontSize:11,color:"#555"}}>{entries.length}</span></div><div className="scroll-row">{entries.map(p=><PostCard key={p.articleId} p={p} onRetry={doRetry} retries={retries}/>)}</div></div>)}{sorted.length===0&&<div style={{textAlign:"center",padding:80,color:"#555",fontSize:14}}>No posts yet</div>}</div>}
        </div>}
        {section==="feed"&&<FeedSection onPost={()=>{fetchPosts();setToast({msg:"Posted!",type:"ok"});}}/>}
        {section==="compose"&&<ComposeSection onSuccess={()=>{fetchPosts();setSection("overview");setToast({msg:"Posted!",type:"ok"});}}/>}
        {section==="failures"&&<FailuresSection posts={sorted} onRetry={doRetry} retries={retries}/>}
        {section==="analytics"&&<AnalyticsSection posts={sorted} nextIn={nextIn}/>}
        {section==="settings"&&<SettingsSection onTrigger={()=>setToast({msg:"Pipeline triggered!",type:"ok"})}/>}
      </div>
    </div>
    <nav className="mobile-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"rgba(10,10,10,0.97)",backdropFilter:"blur(12px)",borderTop:"1px solid #1f1f1f",zIndex:50}}>
      {NAV.map(n=><button key={n.id} onClick={()=>setSection(n.id as any)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 0",background:"none",border:"none",color:section===n.id?R:"#555",cursor:"pointer",fontSize:9,letterSpacing:1,fontWeight:700,textTransform:"uppercase",position:"relative"}}><span style={{fontSize:18}}>{n.icon}</span><span>{n.id==="overview"?"Home":n.id==="feed"?"Feed":n.id==="compose"?"Post":n.id==="failures"?"Fails":n.id==="analytics"?"Stats":"Config"}</span>{(n as any).alert&&<span style={{position:"absolute",top:8,right:"calc(50% - 14px)",width:6,height:6,borderRadius:"50%",background:"#f87171"}}/>}</button>)}
    </nav>
    {toast&&<div onClick={()=>setToast(null)} style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:toast.type==="ok"?"#0d2a0d":"#2a0d0d",border:`1px solid ${toast.type==="ok"?"#1a4a1a":"#4a1a1a"}`,color:toast.type==="ok"?"#4ade80":"#f87171",padding:"12px 20px",borderRadius:8,fontSize:13,fontWeight:600,zIndex:300,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>{toast.type==="ok"?"✓ ":"✗ "}{toast.msg}</div>}
  </div>;
}

function PostCard({p,onRetry,retries}:{p:Post;onRetry:(p:Post,pl:"instagram"|"facebook")=>void;retries:Record<string,Retry>}){
  const [hov,setHov]=useState(false);
  const igOk=p.instagram.success||retries[p.articleId+"_instagram"]?.done;
  const fbOk=p.facebook.success||retries[p.articleId+"_facebook"]?.done;
  const {bg}=cc(p.category);
  return <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{flexShrink:0,width:160,borderRadius:8,overflow:"hidden",background:"#1a1a1a",border:"1px solid #2a2a2a",transition:"transform .2s,box-shadow .2s",transform:hov?"scale(1.05)":"scale(1)",boxShadow:hov?"0 12px 40px rgba(0,0,0,.8)":"none",cursor:"pointer",position:"relative"}}>
    <div style={{width:"100%",aspectRatio:"4/5",background:"linear-gradient(135deg,#1a1a1a,#0a0a0a)",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:bg}}/>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6,padding:"16px 10px 10px"}}>
        <Pill cat={p.category}/>
        <div style={{fontSize:10,color:"#666",textAlign:"center",lineHeight:1.4}}>{p.title.slice(0,60)}{p.title.length>60?"...":""}</div>
      </div>
      <div style={{position:"absolute",top:8,right:6,display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end",zIndex:3}}>
        {p.isBreaking&&<span style={{background:"#E50914",color:"#fff",fontSize:8,fontWeight:800,padding:"2px 5px",borderRadius:3}}>BREAKING</span>}
        {p.manualPost&&<span style={{background:"#2a2a2a",color:"#888",fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:3}}>MANUAL</span>}
      </div>
      {hov&&(!igOk||!fbOk)&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.88)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:10,zIndex:10}}>
        {!igOk&&<button onClick={e=>{e.stopPropagation();onRetry(p,"instagram");}} disabled={retries[p.articleId+"_instagram"]?.loading} style={{background:"#FF007A",color:"#fff",border:"none",borderRadius:5,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>{retries[p.articleId+"_instagram"]?.loading?<Spin/>:"Retry IG"}</button>}
        {!fbOk&&<button onClick={e=>{e.stopPropagation();onRetry(p,"facebook");}} disabled={retries[p.articleId+"_facebook"]?.loading} style={{background:"#1877f2",color:"#fff",border:"none",borderRadius:5,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>{retries[p.articleId+"_facebook"]?.loading?<Spin/>:"Retry FB"}</button>}
      </div>}
    </div>
    <div style={{padding:"8px 10px"}}>
      <div style={{fontSize:11,color:"#ccc",lineHeight:1.4,marginBottom:5,fontWeight:500}}>{p.title.slice(0,55)}{p.title.length>55?"...":""}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:10,color:"#888"}}>{ago(p.postedAt)}</span><div style={{display:"flex",gap:4}}><span style={{fontSize:10,color:igOk?"#4ade80":"#f87171"}}>IG{igOk?"✓":"✗"}</span><span style={{fontSize:10,color:fbOk?"#4ade80":"#f87171"}}>FB{fbOk?"✓":"✗"}</span></div></div>
    </div>
  </div>;
}

function FeedSection({onPost}:{onPost:()=>void}){
  const [items,setItems]=useState<FeedItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [posting,setPosting]=useState<string|null>(null);
  const [done,setDone]=useState<Record<string,boolean>>({});
  const [errs,setErrs]=useState<Record<string,string>>({});
  useEffect(()=>{fetch("https://ppp-tv-worker.euginemicah.workers.dev/feed?limit=20").then(r=>r.json()).then(d=>setItems(d.articles||[])).catch(()=>{}).finally(()=>setLoading(false));},[]);
  async function postItem(item:FeedItem){
    setPosting(item.slug);
    try{const r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.articleUrl||item.sourceUrl,category:item.category})});const d=await r.json();if(d.instagram?.success||d.facebook?.success){setDone(s=>({...s,[item.slug]:true}));onPost();}else setErrs(s=>({...s,[item.slug]:d.error||"Failed"}));}
    catch(e:any){setErrs(s=>({...s,[item.slug]:e.message}));}finally{setPosting(null);}
  }
  return <div><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Live Feed</h2><p style={{fontSize:12,color:"#555"}}>Latest articles from PPP TV — post any of them manually right now.</p></div>
    {loading?<div style={{color:"#555",padding:40,textAlign:"center"}}>Loading feed...</div>:!items.length?<div style={{color:"#555",padding:40,textAlign:"center"}}>No articles in feed</div>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}>{items.map(item=>{const {bg,text}=cc(item.category);const isDone=done[item.slug];const isErr=errs[item.slug];return <div key={item.slug} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
      {item.imageUrlDirect&&<img src={item.imageUrlDirect} alt="" style={{width:72,height:54,objectFit:"cover",borderRadius:4,flexShrink:0}}/>}
      <div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}><span style={{background:bg,color:text,fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:20,letterSpacing:.5,textTransform:"uppercase"}}>{item.category}</span><span style={{fontSize:10,color:"#555"}}>{item.sourceName}</span><span style={{fontSize:10,color:"#444"}}>{ago(item.publishedAt)}</span></div><div style={{fontSize:13,color:"#e5e5e5",fontWeight:600,lineHeight:1.4,marginBottom:4}}>{item.title}</div><div style={{fontSize:11,color:"#666",lineHeight:1.5}}>{item.excerpt?.slice(0,120)}{(item.excerpt?.length||0)>120?"...":""}</div>{isErr&&<div style={{fontSize:11,color:"#f87171",marginTop:4}}>{isErr}</div>}</div>
      <div style={{flexShrink:0}}>{isDone?<span style={{fontSize:11,color:"#4ade80",fontWeight:700}}>✓ Posted</span>:<button onClick={()=>postItem(item)} disabled={posting===item.slug} style={{background:"#E50914",color:"#fff",border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:posting===item.slug?.5:1,whiteSpace:"nowrap"}}>{posting===item.slug?<Spin/>:"Post Now"}</button>}</div>
    </div>;})}
    </div>}
  </div>;
}

function ComposeSection({onSuccess}:{onSuccess:()=>void}){
  const [url,setUrl]=useState("");const [cat,setCat]=useState("AUTO");const [preview,setPreview]=useState<Preview|null>(null);const [loading,setLoading]=useState(false);const [posting,setPosting]=useState(false);const [refining,setRefining]=useState(false);const [err,setErr]=useState<string|null>(null);const [ok,setOk]=useState<string|null>(null);const [lightbox,setLightbox]=useState(false);const [copied,setCopied]=useState<string|null>(null);const [editTitle,setEditTitle]=useState("");const [editCaption,setEditCaption]=useState("");const [editing,setEditing]=useState(false);
  const [igManual,setIgManual]=useState(false);const [igManualTitle,setIgManualTitle]=useState("");const [igManualCaption,setIgManualCaption]=useState("");
  useEffect(()=>{setErr(null);setPreview(null);setOk(null);setEditing(false);setIgManual(false);setIgManualTitle("");setIgManualCaption("");},[url]);
  useEffect(()=>{if(preview){setEditTitle(preview.ai.clickbaitTitle);setEditCaption(preview.ai.caption);}},[preview]);
  async function doPreview(manualTitle?:string,manualCaption?:string){if(!url.trim())return;setLoading(true);setErr(null);setPreview(null);setOk(null);try{const body:Record<string,string>={url:url.trim()};if(cat!=="AUTO")body.category=cat;if(manualTitle)body.manualTitle=manualTitle;if(manualCaption)body.manualCaption=manualCaption;const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(d.error==="INSTAGRAM_MANUAL"){setIgManual(true);setLoading(false);return;}if(!r.ok||d.error)throw new Error(d.error||"Preview failed");setIgManual(false);setPreview(d);}catch(e:any){setErr(e.message);}finally{setLoading(false);}}
  async function doRefine(){if(!url.trim()||!preview)return;setRefining(true);try{const body:Record<string,string>={url:url.trim()};if(cat!=="AUTO")body.category=cat;const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||"Refine failed");setEditTitle(d.ai.clickbaitTitle);setEditCaption(d.ai.caption);setPreview(d);}catch(e:any){setErr(e.message);}finally{setRefining(false);}}
  async function doPost(){
    if(!preview)return;
    setPosting(true);setErr(null);setOk(null);
    try{
      const title=editTitle||preview.ai.clickbaitTitle;
      const caption=editCaption||preview.ai.caption;
      const body:Record<string,string>={
        url:url.trim(),
        manualTitle:title,
        manualCaption:caption,
        imageBase64:preview.imageBase64, // reuse preview image — skip regeneration
      };
      if(cat!=="AUTO")body.category=cat;
      const r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok||d.error)throw new Error(d.error||"Post failed");
      const ig=d.instagram?.success,fb=d.facebook?.success;
      if(!ig&&!fb){
        const igErr=d.instagram?.error||"unknown";
        const fbErr=d.facebook?.error||"unknown";
        throw new Error(`IG: ${igErr} | FB: ${fbErr}`);
      }
      setOk((ig&&fb)?"✓ Posted to IG + FB":ig?"✓ Posted to IG (FB: "+(d.facebook?.error||"failed")+")":"✓ Posted to FB (IG: "+(d.instagram?.error||"failed")+")");
      if(ig||fb){setUrl("");setPreview(null);setTimeout(onSuccess,1500);}
    }catch(e:any){setErr(e.message);}finally{setPosting(false);}
  }
  function copy(text:string,k:string){navigator.clipboard.writeText(text).then(()=>{setCopied(k);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});}
  const inp:React.CSSProperties={width:"100%",background:"#111",border:"1px solid #2a2a2a",borderRadius:6,padding:"10px 12px",color:"#e5e5e5",fontSize:13,outline:"none",fontFamily:"inherit"};
  return <div style={{maxWidth:560}}><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Compose</h2><p style={{fontSize:12,color:"#555"}}>Paste any URL, preview with AI, edit if needed, then post.</p></div>
    <div style={{display:"flex",gap:8,marginBottom:12}}><input style={{...inp,flex:1}} placeholder="Paste article / YouTube / TikTok / Instagram URL..." value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doPreview()}/><button onClick={()=>doPreview()} disabled={!url.trim()||loading} style={{background:"#E50914",color:"#fff",border:"none",borderRadius:6,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:(!url.trim()||loading)?.4:1,whiteSpace:"nowrap"}}>{loading?<Spin/>:"Preview"}</button></div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>{["AUTO",...CATS].map(c=>{const {bg,text}=cc(c);return <button key={c} onClick={()=>setCat(c)} style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${cat===c?bg:"#2a2a2a"}`,background:cat===c?bg:"#1a1a1a",color:cat===c?text:"#666",transition:"all .15s"}}>{c}</button>;})}</div>
    {igManual&&<div style={{background:"#1a1200",border:"1px solid #3a2a00",borderRadius:8,padding:"14px 16px",marginBottom:12}}>
      <div style={{fontSize:12,color:"#fbbf24",fontWeight:700,marginBottom:10}}>📸 Instagram blocked auto-scraping — enter details manually</div>
      <input value={igManualTitle} onChange={e=>setIgManualTitle(e.target.value)} placeholder="Post title or description..." style={{...inp,marginBottom:8}}/>
      <textarea value={igManualCaption} onChange={e=>setIgManualCaption(e.target.value)} rows={3} placeholder="Caption or context (optional)..." style={{...inp,resize:"vertical",marginBottom:10}}/>
      <button onClick={()=>doPreview(igManualTitle,igManualCaption)} disabled={!igManualTitle.trim()||loading} style={{background:"#E50914",color:"#fff",border:"none",borderRadius:6,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:!igManualTitle.trim()?.4:1}}>{loading?<Spin/>:"Generate Preview"}</button>
    </div>}
    {err&&<div style={{background:"#1a0808",border:"1px solid #3a1a1a",borderRadius:6,padding:"10px 14px",color:"#f87171",fontSize:13,marginBottom:12}}>{err}</div>}
    {ok&&<div style={{background:"#081a08",border:"1px solid #1a3a1a",borderRadius:6,padding:"10px 14px",color:"#4ade80",fontSize:13,marginBottom:12}}>{ok}</div>}
    {preview&&<div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,overflow:"hidden"}}>
      <div style={{cursor:"zoom-in"}} onClick={()=>setLightbox(true)}><img src={preview.imageBase64} alt="" style={{width:"100%",display:"block",aspectRatio:"4/5",objectFit:"cover"}}/></div>
      <div style={{padding:16}}>
        {editing?<><input value={editTitle} onChange={e=>setEditTitle(e.target.value)} style={{...inp,marginBottom:8,fontFamily:"Bebas Neue,sans-serif",fontSize:18,letterSpacing:.5}} placeholder="HEADLINE (ALL CAPS)"/><textarea value={editCaption} onChange={e=>setEditCaption(e.target.value)} rows={7} style={{...inp,resize:"vertical",marginBottom:8,lineHeight:1.7}} placeholder="Caption — emojis welcome 😊 No hashtags needed."/><p style={{fontSize:10,color:"#444",marginBottom:10}}>Tip: use emojis freely. Hashtags go in the first comment automatically.</p><div style={{display:"flex",gap:8,marginBottom:12}}><button onClick={()=>setEditing(false)} style={{background:"#2a2a2a",color:"#aaa",border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,cursor:"pointer"}}>Done editing</button><button onClick={doRefine} disabled={refining} style={{background:"#1a1a2a",color:"#818cf8",border:"1px solid #2a2a4a",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:refining?.5:1}}>{refining?<Spin/>:"✨ AI Refine"}</button></div></>
        :<><div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:20,lineHeight:1.2,marginBottom:8,letterSpacing:.5}}>{editTitle||preview.ai.clickbaitTitle}</div><div style={{fontSize:13,color:"#777",lineHeight:1.65,marginBottom:12,whiteSpace:"pre-line"}}>{editCaption||preview.ai.caption}</div></>}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}><Pill cat={preview.category}/><button onClick={()=>setEditing(e=>!e)} style={{background:"none",border:"1px solid #333",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#aaa",cursor:"pointer"}}>Edit</button><button onClick={()=>copy(editTitle||preview.ai.clickbaitTitle,"t")} style={{background:"none",border:"1px solid #333",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#aaa",cursor:"pointer"}}>{copied==="t"?"Copied":"Copy Title"}</button><button onClick={()=>copy(editCaption||preview.ai.caption,"c")} style={{background:"none",border:"1px solid #333",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#aaa",cursor:"pointer"}}>{copied==="c"?"Copied":"Copy Caption"}</button></div>
        <button onClick={doPost} disabled={posting} style={{width:"100%",background:"#E50914",color:"#fff",border:"none",borderRadius:6,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:posting?.5:1}}>{posting?<Spin/>:"Post to Instagram + Facebook"}</button>
      </div>
    </div>}
    {lightbox&&preview?.imageBase64&&<div onClick={()=>setLightbox(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.97)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}><img src={preview.imageBase64} alt="" style={{maxWidth:"95vw",maxHeight:"90dvh",borderRadius:8,objectFit:"contain"}}/></div>}
  </div>;
}

function FailuresSection({posts,onRetry,retries}:{posts:Post[];onRetry:(p:Post,pl:"instagram"|"facebook")=>void;retries:Record<string,Retry>}){
  const failed=posts.filter(p=>!p.instagram.success||!p.facebook.success);
  return <div><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Failures</h2><p style={{fontSize:12,color:"#555"}}>Posts that failed on Instagram or Facebook — retry them here.</p></div>
    {!failed.length?<div style={{textAlign:"center",padding:60,color:"#555"}}><div style={{fontSize:32,marginBottom:8}}>✓</div><div style={{fontSize:14}}>No failures — everything posted successfully</div></div>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}><div style={{fontSize:11,color:"#f87171",marginBottom:8}}>{failed.length} post{failed.length!==1?"s":""} with failures</div>
      {failed.map(p=>{const igFailed=!p.instagram.success&&!retries[p.articleId+"_instagram"]?.done;const fbFailed=!p.facebook.success&&!retries[p.articleId+"_facebook"]?.done;return <div key={p.articleId} style={{background:"#1a0a0a",border:"1px solid #3a1a1a",borderRadius:8,padding:"12px 14px"}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-start",justifyContent:"space-between"}}>
          <div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap",alignItems:"center"}}><Pill cat={p.category}/><span style={{fontSize:10,color:"#555"}}>{ago(p.postedAt)}</span></div><div style={{fontSize:13,color:"#e5e5e5",fontWeight:600,lineHeight:1.4,marginBottom:6}}>{p.title}</div>{igFailed&&<div style={{fontSize:11,color:"#f87171",marginBottom:3}}>✗ Instagram: {p.instagram.error||"Failed"}</div>}{fbFailed&&<div style={{fontSize:11,color:"#f87171"}}>✗ Facebook: {p.facebook.error||"Failed"}</div>}</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>{igFailed&&<button onClick={()=>onRetry(p,"instagram")} disabled={retries[p.articleId+"_instagram"]?.loading} style={{background:"#FF007A",color:"#fff",border:"none",borderRadius:5,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{retries[p.articleId+"_instagram"]?.loading?<Spin/>:"Retry IG"}</button>}{fbFailed&&<button onClick={()=>onRetry(p,"facebook")} disabled={retries[p.articleId+"_facebook"]?.loading} style={{background:"#1877f2",color:"#fff",border:"none",borderRadius:5,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{retries[p.articleId+"_facebook"]?.loading?<Spin/>:"Retry FB"}</button>}</div>
        </div>
      </div>;})}
    </div>}
  </div>;
}

function AnalyticsSection({posts,nextIn}:{posts:Post[];nextIn:string}){
  const today=posts.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString()).length;
  const total=posts.filter(p=>p.instagram.success||p.facebook.success).length;
  const failed=posts.filter(p=>!p.instagram.success&&!p.facebook.success).length;
  const both=posts.filter(p=>p.instagram.success&&p.facebook.success).length;
  const catCounts=CATS.reduce((a,c)=>({...a,[c]:posts.filter(p=>p.category===c).length}),{} as Record<string,number>);
  const maxCat=Math.max(1,...Object.values(catCounts));
  return <div><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Analytics</h2><p style={{fontSize:12,color:"#555"}}>Performance overview and system status.</p></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:24}}>
      {[{label:"Today",value:today,color:"#E50914"},{label:"Total Posted",value:total,color:"#fff"},{label:"Both Platforms",value:both,color:"#4ade80"},{label:"IG",value:posts.filter(p=>p.instagram.success).length,color:"#E1306C"},{label:"FB",value:posts.filter(p=>p.facebook.success).length,color:"#1877f2"},{label:"Failed",value:failed,color:failed>0?"#f87171":"#555"}].map(s=><div key={s.label} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"16px 14px"}}><div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:38,color:s.color,lineHeight:1,letterSpacing:1}}>{s.value}</div><div style={{fontSize:10,color:"#aaa",marginTop:4,letterSpacing:2,fontWeight:700,textTransform:"uppercase"}}>{s.label}</div></div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"16px 18px"}}><div style={{fontSize:10,color:"#555",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>By Category</div>
        {CATS.filter(c=>catCounts[c]>0).map(c=>{const {bg}=cc(c);return <div key={c} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><div style={{fontSize:11,color:"#555",width:90,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c}</div><div style={{flex:1,background:"#111",borderRadius:2,height:4}}><div style={{width:`${Math.round(catCounts[c]/maxCat*100)}%`,background:bg,borderRadius:2,height:4,transition:"width .4s"}}/></div><div style={{fontSize:11,color:"#444",width:20,textAlign:"right"}}>{catCounts[c]}</div></div>;})}
        {posts.length===0&&<div style={{color:"#333",fontSize:12}}>No data yet</div>}
      </div>
      <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"16px 18px"}}><div style={{fontSize:10,color:"#555",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>System Status</div>
        {[["Schedule","Every 10 min"],["Mode","24/7 Autonomous"],["Next Post",nextIn],["Daily Cap","None"],["AI Headline","Gemini 2.5 Flash"],["AI Caption","NVIDIA Llama 3.1"],["Image","1080x1350 JPEG"],["Source","PPP TV Worker"],["Cron","Cloudflare Workers"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1f1f1f",fontSize:12}}><span style={{color:"#555"}}>{k}</span><span style={{fontWeight:600,color:"#e5e5e5"}}>{v}</span></div>)}
      </div>
    </div>
  </div>;
}

function SettingsSection({onTrigger}:{onTrigger:()=>void}){
  const [clearing,setClearing]=useState(false);const [clearMsg,setClearMsg]=useState("");const [triggering,setTriggering]=useState(false);
  async function clearCache(){setClearing(true);setClearMsg("");try{const r=await fetch("https://auto-ppp-tv.euginemicah.workers.dev/clear-cache",{method:"POST",headers:{Authorization:"Bearer ppptvWorker2024"}});const d=await r.json();setClearMsg(`Cleared ${d.cleared||0} seen articles`);}catch(e:any){setClearMsg("Error: "+e.message);}finally{setClearing(false);}}
  async function triggerNow(){setTriggering(true);try{await fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger");onTrigger();}catch(e:any){alert("Error: "+e.message);}finally{setTriggering(false);}}
  return <div><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Settings</h2><p style={{fontSize:12,color:"#555"}}>Control the pipeline, clear caches, and manage the system.</p></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"16px 18px"}}><div style={{fontSize:10,color:"#555",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>Quick Actions</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><button onClick={triggerNow} disabled={triggering} style={{width:"100%",background:"#E50914",color:"#fff",border:"none",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:triggering?.5:1}}>{triggering?<Spin/>:"Run Pipeline Now"}</button></div>
          <div><button onClick={clearCache} disabled={clearing} style={{width:"100%",background:"#2a2a2a",color:"#aaa",border:"1px solid #333",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:clearing?.5:1}}>{clearing?<Spin/>:"Clear Seen Articles Cache"}</button>{clearMsg&&<div style={{fontSize:11,color:"#4ade80",marginTop:6}}>{clearMsg}</div>}</div>
          <a href="https://ppp-tv-site.vercel.app" target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",background:"#1f1f1f",color:"#aaa",border:"1px solid #333",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Open PPP TV Site</a>
          <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",background:"#1f1f1f",color:"#aaa",border:"1px solid #333",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Cloudflare Dashboard</a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",background:"#1f1f1f",color:"#aaa",border:"1px solid #333",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Vercel Dashboard</a>
        </div>
      </div>
      <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"16px 18px"}}><div style={{fontSize:10,color:"#555",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>Environment</div>
        {[["Worker","auto-ppp-tv.euginemicah.workers.dev"],["Vercel","auto-news-station.vercel.app"],["PPP TV","ppp-tv-site.vercel.app"],["Cron","*/10 * * * *"],["AI Headline","Gemini 2.5 Flash"],["AI Caption","NVIDIA Llama 3.1 8B"],["Image","1080x1350 JPEG"],["Dedup TTL","30 days"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1f1f1f",fontSize:12}}><span style={{color:"#555"}}>{k}</span><span style={{fontWeight:600,color:"#e5e5e5",fontFamily:"monospace",fontSize:11}}>{v}</span></div>)}
      </div>
    </div>
  </div>;
}
// deployed 2026-03-27 06:43
