"use client";
import { useState, useEffect, useCallback, useRef } from "react";
const R="#E50914",PK="#FF007A",GR="#4ade80",AM="#f59e0b";
const CAT:Record<string,{bg:string;text:string}> = {
  CELEBRITY:{bg:"#FF007A",text:"#fff"},POLITICS:{bg:"#FF007A",text:"#fff"},NEWS:{bg:"#FF007A",text:"#fff"},
  FASHION:{bg:"#ec4899",text:"#fff"},MUSIC:{bg:"#a855f7",text:"#fff"},ENTERTAINMENT:{bg:"#a855f7",text:"#fff"},
  "TV & FILM":{bg:"#f59e0b",text:"#000"},MOVIES:{bg:"#f59e0b",text:"#000"},LIFESTYLE:{bg:"#14b8a6",text:"#fff"},
  HEALTH:{bg:"#10b981",text:"#fff"},EVENTS:{bg:"#10b981",text:"#fff"},"EAST AFRICA":{bg:"#06b6d4",text:"#000"},
  TECHNOLOGY:{bg:"#06b6d4",text:"#000"},COMEDY:{bg:"#eab308",text:"#000"},AWARDS:{bg:"#eab308",text:"#000"},
  INFLUENCERS:{bg:"#f97316",text:"#fff"},SPORTS:{bg:"#3b82f6",text:"#fff"},SCIENCE:{bg:"#3b82f6",text:"#fff"},
  BUSINESS:{bg:"#FFD700",text:"#000"},GENERAL:{bg:"#E50914",text:"#fff"},
};
const cc=(c:string)=>CAT[c?.toUpperCase()]??{bg:"#E50914",text:"#fff"};
const CATS=["CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL","SPORTS","BUSINESS","POLITICS","TECHNOLOGY","HEALTH","SCIENCE","LIFESTYLE","COMEDY","INFLUENCERS"];
interface Post{articleId:string;title:string;url:string;category:string;manualPost?:boolean;isBreaking?:boolean;instagram:{success:boolean;postId?:string;error?:string};facebook:{success:boolean;postId?:string;error?:string};postedAt:string;}
interface FeedItem{slug:string;title:string;excerpt:string;category:string;sourceName:string;sourceUrl:string;publishedAt:string;articleUrl:string;imageUrl:string;imageUrlDirect:string;}
interface Preview{scraped:{type:string;title:string;description:string;imageUrl:string;sourceName:string;isVideo?:boolean;videoEmbedUrl?:string|null;videoUrl?:string|null};ai:{clickbaitTitle:string;caption:string};category:string;imageBase64:string;}
interface Retry{loading:boolean;done?:boolean;error?:string}
interface SourceStat{src:string;cat:string;ok:number;fail:number;total:number;}
interface SourceToggle{src:string;enabled:boolean;}
function ago(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";}
function Spin(){return <span style={{display:"inline-block",width:13,height:13,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;}
function Pill({cat}:{cat:string}){const {bg,text}=cc(cat);return <span style={{background:bg,color:text,fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:20,letterSpacing:.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{cat}</span>;}

function SourceHealth({stats,toggles,onToggle}:{stats:SourceStat[],toggles:Record<string,boolean>,onToggle:(src:string)=>void}) {
  return <div className="kpi-card" style={{flex:1,minWidth:280}}>
    <div style={{fontSize:11,color:"#666",marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Source health</div>
    <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto",paddingRight:4}}>
      {stats.slice(0,12).map((r)=>{
        const {bg,text}=cc(r.cat);
        const rate=r.total?Math.round(r.ok/r.total*100):0;
        const enabled = toggles[r.src] ?? true;
        return <div key={r.src} style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>onToggle(r.src)} style={{background:bg,color:text,fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:14,letterSpacing:.5,minWidth:68,textAlign:"center",border:"none",cursor:"pointer",opacity:enabled?1:0.4}}>
            {enabled?"ON":"OFF"} · {r.cat}
          </button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:"#ddd",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.src}</div>
            <div style={{fontSize:10,color:"#555"}}>{r.ok}/{r.total} ok</div>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:rate>=99?"#4ade80":rate>=80?"#fbbf24":"#f97316"}}>{rate}%</div>
        </div>;
      })}
      {!stats.length&&<div style={{fontSize:11,color:"#555"}}>No data yet</div>}
    </div>
  </div>;
}

export default function Dashboard(){
  const [posts,setPosts]=useState<Post[]>([]);
  const [loading,setLoading]=useState(true);
  const [retries,setRetries]=useState<Record<string,Retry>>({});
  const [section,setSection]=useState<"cockpit"|"feed"|"compose"|"failures"|"analytics"|"settings">("cockpit");
  const [nextIn,setNextIn]=useState("--:--");
  const [toast,setToast]=useState<{msg:string;type:"ok"|"err"}|null>(null);
  const [triggering,setTriggering]=useState(false);
  const [clearing,setClearing]=useState(false);
  const [sourceStats,setSourceStats]=useState<SourceStat[]>([]);
  const [sourceToggles,setSourceToggles]=useState<Record<string,boolean>>({});

  const fetchPosts=useCallback(async()=>{
    try{const r=await fetch("/api/post-log");if(r.ok){const d=await r.json();setPosts(d.log||[]);}}
    catch{}finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    fetchPosts();
    const t=setInterval(fetchPosts,30000);
    return()=>clearInterval(t);
  },[fetchPosts]);

  useEffect(()=>{
    const tick=()=>{
      const now=new Date();
      const next=new Date(now);
      next.setMinutes(Math.ceil(now.getMinutes()/10)*10,0,0);
      if(next.getTime()===now.getTime())next.setMinutes(next.getMinutes()+10);
      const diff=Math.max(0,Math.floor((next.getTime()-now.getTime())/1000));
      setNextIn(`${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,"0")}`);
    };
    tick();const t=setInterval(tick,1000);return()=>clearInterval(t);
  },[]);

  // Build source stats whenever posts change
  useEffect(()=>{
  const stats=posts.reduce<Record<string,{ok:number;fail:number;cat:string}>>((acc,p)=>{
    const src=(p as any).sourceName||"Unknown";
    const cat=p.category||"GENERAL";
    const ok=(p.instagram?.success||p.facebook?.success)?1:0;
    const fail=ok?0:1;
    acc[src]=acc[src]||{ok:0,fail:0,cat};
    acc[src].ok+=ok;acc[src].fail+=fail;
    return acc;
  },{});
  const arr=Object.entries(stats).map(([src,v])=>({src,cat:v.cat,total:v.ok+v.fail,ok:v.ok,fail:v.fail}))
    .sort((a,b)=>b.total-a.total)
    .slice(0,40);
  setSourceStats(arr);
  },[posts]);

  async function doRetry(p:Post,platform:"instagram"|"facebook"){
    const key=p.articleId+"_"+platform;
    setRetries(s=>({...s,[key]:{loading:true}}));
    try{
      const r=await fetch("/api/retry-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({articleId:p.articleId,title:p.title,caption:p.title,articleUrl:p.url,category:p.category,platform})});
      const d=await r.json();
      const ok=platform==="instagram"?d.instagram?.success:d.facebook?.success;
      setRetries(s=>({...s,[key]:{loading:false,done:ok,error:ok?undefined:(d.error||"Failed")}}));
      if(ok){showToast("Retried "+platform+" ✓","ok");setTimeout(fetchPosts,1500);}
      else showToast(d.error||"Retry failed","err");
    }catch(e:any){setRetries(s=>({...s,[key]:{loading:false,error:e.message}}));showToast(e.message,"err");}
  }

  async function triggerNow(){
    setTriggering(true);
    try{
      await fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger");
      showToast("Pipeline triggered — post incoming","ok");
      setTimeout(fetchPosts,15000);
    }catch(e:any){showToast("Trigger failed: "+e.message,"err");}
    finally{setTriggering(false);}
  }

  async function clearCache(){
    setClearing(true);
    try{
      const r=await fetch("https://auto-ppp-tv.euginemicah.workers.dev/clear-cache",{method:"POST",headers:{Authorization:"Bearer ppptvWorker2024"}});
      const d=await r.json();
      showToast(`Cleared ${d.cleared||0} seen articles`,"ok");
    }catch(e:any){showToast("Clear failed: "+e.message,"err");}
    finally{setClearing(false);}
  }

  function showToast(msg:string,type:"ok"|"err"){setToast({msg,type});setTimeout(()=>setToast(null),4000);}

  const sorted=[...posts].sort((a,b)=>new Date(b.postedAt).getTime()-new Date(a.postedAt).getTime());
  const latest=sorted[0]??null;
  const todayPosts=sorted.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString());
  const todayCount=todayPosts.length;
  const igOkToday=todayPosts.filter(p=>p.instagram.success).length;
  const fbOkToday=todayPosts.filter(p=>p.facebook.success).length;
  const failCount=sorted.filter(p=>!p.instagram.success&&!p.facebook.success).length;
  const successRate=sorted.length>0?Math.round(sorted.filter(p=>p.instagram.success||p.facebook.success).length/sorted.length*100):0;

  const NAV=[
    {id:"cockpit",icon:"⚡",label:"Cockpit"},
    {id:"feed",icon:"📡",label:"Live Feed"},
    {id:"compose",icon:"✏️",label:"Compose"},
    {id:"failures",icon:"⚠️",label:"Failures",alert:failCount>0},
    {id:"analytics",icon:"📊",label:"Analytics"},
    {id:"settings",icon:"⚙️",label:"Settings"},
  ] as const;

  return (
    <div style={{minHeight:"100dvh",background:"#080808",color:"#e5e5e5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        .fade{animation:fadeIn .25s ease}
        .scroll-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none}
        .scroll-row::-webkit-scrollbar{display:none}
        input,button,select,textarea{font-family:inherit}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px}
        .kpi-card{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:10px;padding:16px 18px;transition:border-color .2s}
        .kpi-card:hover{border-color:#2a2a2a}
        .nav-btn{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:8px;background:none;border:none;cursor:pointer;text-align:left;transition:all .15s;border-left:3px solid transparent;font-size:13px}
        .nav-btn:hover{background:#111;color:#ccc!important}
        .post-row{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:8px;padding:12px 14px;display:flex;gap:12px;align-items:center;transition:border-color .15s}
        .post-row:hover{border-color:#2a2a2a}
        @media(max-width:767px){.sidebar{display:none!important}.mobile-nav{display:flex!important}.main-content{padding-bottom:72px!important}}
        @media(min-width:768px){.sidebar{display:flex!important}.mobile-nav{display:none!important}}
      `}</style>

      {/* ── Sidebar ── */}
      <aside className="sidebar" style={{width:220,background:"#050505",borderRight:"1px solid #141414",display:"none",flexDirection:"column",height:"100dvh",position:"sticky",top:0,flexShrink:0}}>
        <div style={{padding:"20px 16px 16px",borderBottom:"1px solid #141414"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:R,animation:"pulse 2s infinite",boxShadow:`0 0 8px ${R}`}}/>
            <span style={{fontFamily:"Bebas Neue,sans-serif",fontSize:26,letterSpacing:3,lineHeight:1}}>PPP<span style={{color:R}}>TV</span></span>
          </div>
          <div style={{fontSize:9,color:"#333",letterSpacing:4,paddingLeft:16,textTransform:"uppercase",fontWeight:700}}>Command Center</div>
        </div>

        <nav style={{flex:1,padding:"12px 8px",overflowY:"auto"}}>
          {NAV.map(n=>(
            <button key={n.id} className="nav-btn" onClick={()=>setSection(n.id as any)}
              style={{color:section===n.id?"#fff":"#555",fontWeight:section===n.id?700:400,background:section===n.id?"#141414":"none",borderLeft:`3px solid ${section===n.id?R:"transparent"}`}}>
              <span style={{fontSize:16,width:20,textAlign:"center"}}>{n.icon}</span>
              <span style={{flex:1}}>{n.label}</span>
              {(n as any).alert&&<span style={{width:7,height:7,borderRadius:"50%",background:"#f87171",animation:"blink 1.5s infinite",flexShrink:0}}/>}
            </button>
          ))}
        </nav>

        <div style={{padding:"14px 12px",borderTop:"1px solid #141414"}}>
          {/* Next post countdown */}
          <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
            <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Next Post</div>
            <div style={{fontFamily:"monospace",fontSize:22,color:R,letterSpacing:2,fontWeight:700}}>{nextIn}</div>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            <div style={{flex:1,background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:6,padding:"8px",textAlign:"center"}}>
              <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,color:"#fff",lineHeight:1}}>{todayCount}</div>
              <div style={{fontSize:9,color:"#444",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Today</div>
            </div>
            <div style={{flex:1,background:"#0a0a0a",border:`1px solid ${failCount>0?"#3a1a1a":"#1a1a1a"}`,borderRadius:6,padding:"8px",textAlign:"center"}}>
              <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,color:failCount>0?"#f87171":"#555",lineHeight:1}}>{failCount}</div>
              <div style={{fontSize:9,color:"#444",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Failed</div>
            </div>
          </div>
          <button onClick={async()=>{await fetch("/api/auth",{method:"DELETE"});window.location.href="/login";}}
            style={{width:"100%",background:"none",border:"1px solid #1a1a1a",borderRadius:6,padding:"7px",fontSize:11,color:"#444",cursor:"pointer"}}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-content" style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflowY:"auto"}}>

        {/* Top bar */}
        <div style={{background:"rgba(8,8,8,0.96)",backdropFilter:"blur(16px)",borderBottom:"1px solid #141414",padding:"0 20px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:30}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:R,animation:"pulse 2s infinite",boxShadow:`0 0 6px ${R}`}}/>
              <span style={{fontFamily:"Bebas Neue,sans-serif",fontSize:17,letterSpacing:2}}>PPP<span style={{color:R}}>TV</span></span>
              <span style={{fontSize:9,color:"#333",letterSpacing:3,textTransform:"uppercase",fontWeight:700}}>Cockpit</span>
            </div>
            <div style={{height:16,width:1,background:"#1a1a1a"}}/>
            <span style={{fontFamily:"monospace",fontSize:12,color:R,letterSpacing:1}}>{nextIn}</span>
            <span style={{fontSize:11,color:"#333"}}>next post</span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {failCount>0&&(
              <button onClick={()=>setSection("failures")} style={{background:"#1a0808",border:"1px solid #3a1a1a",color:"#f87171",fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,cursor:"pointer",animation:"blink 2s infinite"}}>
                ⚠ {failCount} failed
              </button>
            )}
            <span style={{fontSize:11,color:"#444",fontFamily:"monospace"}}>{todayCount} posts today</span>
            <button onClick={fetchPosts} style={{background:"none",border:"1px solid #1a1a1a",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#444",cursor:"pointer"}}>↻</button>
          </div>
        </div>

        <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto",width:"100%"}}>

          {/* ══ COCKPIT OVERVIEW ══ */}
          {section==="cockpit"&&<CockpitSection posts={sorted} loading={loading} nextIn={nextIn} todayCount={todayCount} igOkToday={igOkToday} fbOkToday={fbOkToday} failCount={failCount} successRate={successRate} retries={retries} onRetry={doRetry} onTrigger={triggerNow} triggering={triggering} onClear={clearCache} clearing={clearing} onPost={()=>{fetchPosts();showToast("Posted!","ok");}} onCompose={()=>setSection("compose")}/>}
          {section==="feed"&&<FeedSection posts={posts} toggles={sourceToggles} onToggle={(src)=>setSourceToggles(s=>({...s,[src]:!(s[src]??true)}))} onPost={()=>{fetchPosts();showToast("Posted!","ok");}}/>}
          {section==="compose"&&<ComposeSection onSuccess={()=>{fetchPosts();setSection("cockpit");showToast("Posted!","ok");}}/>}
          {section==="failures"&&<FailuresSection posts={sorted} onRetry={doRetry} retries={retries}/>}
          {section==="analytics"&&<AnalyticsSection posts={sorted} nextIn={nextIn}/>}
          {section==="settings"&&<SettingsSection onTrigger={()=>showToast("Pipeline triggered!","ok")}/>}
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="mobile-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"rgba(5,5,5,0.98)",backdropFilter:"blur(16px)",borderTop:"1px solid #141414",zIndex:50}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setSection(n.id as any)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 0",background:"none",border:"none",color:section===n.id?R:"#444",cursor:"pointer",fontSize:9,letterSpacing:1,fontWeight:700,textTransform:"uppercase",position:"relative"}}>
            <span style={{fontSize:18}}>{n.icon}</span>
            <span>{n.id==="cockpit"?"Home":n.id==="feed"?"Feed":n.id==="compose"?"Post":n.id==="failures"?"Fails":n.id==="analytics"?"Stats":"Config"}</span>
            {(n as any).alert&&<span style={{position:"absolute",top:8,right:"calc(50% - 14px)",width:6,height:6,borderRadius:"50%",background:"#f87171",animation:"blink 1.5s infinite"}}/>}
          </button>
        ))}
      </nav>

      {toast&&(
        <div onClick={()=>setToast(null)} style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:toast.type==="ok"?"#071a07":"#1a0707",border:`1px solid ${toast.type==="ok"?"#1a3a1a":"#3a1a1a"}`,color:toast.type==="ok"?"#4ade80":"#f87171",padding:"12px 20px",borderRadius:8,fontSize:13,fontWeight:600,zIndex:300,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 8px 40px rgba(0,0,0,.8)",animation:"fadeIn .2s ease"}}>
          {toast.type==="ok"?"✓ ":"✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ══ COCKPIT SECTION — the real deal ══════════════════════════════════════════
function CockpitSection({posts,loading,nextIn,todayCount,igOkToday,fbOkToday,failCount,successRate,retries,onRetry,onTrigger,triggering,onClear,clearing,onPost,onCompose}:{
  posts:Post[];loading:boolean;nextIn:string;todayCount:number;igOkToday:number;fbOkToday:number;failCount:number;successRate:number;retries:Record<string,Retry>;onRetry:(p:Post,pl:"instagram"|"facebook")=>void;onTrigger:()=>void;triggering:boolean;onClear:()=>void;clearing:boolean;onPost:()=>void;onCompose:()=>void;
}){
  const latest=posts[0]??null;
  const recentFailed=posts.filter(p=>!p.instagram.success||!p.facebook.success).slice(0,3);
  const recent=posts.slice(0,12);

  return (
    <div className="fade">
      {/* ── Row 1: KPI tiles ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
        {[
          {label:"Posts Today",value:todayCount,color:"#fff",sub:"articles published",icon:"📰"},
          {label:"Instagram",value:igOkToday,color:"#E1306C",sub:"posted today",icon:"📸"},
          {label:"Facebook",value:fbOkToday,color:"#1877f2",sub:"posted today",icon:"👥"},
          {label:"Success Rate",value:successRate+"%",color:successRate>80?GR:successRate>50?AM:"#f87171",sub:"all time",icon:"📈"},
          {label:"Failures",value:failCount,color:failCount>0?"#f87171":"#333",sub:failCount>0?"need retry":"all clear",icon:failCount>0?"⚠️":"✓"},
          {label:"Next Post",value:nextIn,color:R,sub:"countdown",icon:"⏱",mono:true},
        ].map(k=>(
          <div key={k.label} className="kpi-card" style={{position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:10,right:12,fontSize:18,opacity:.15}}>{k.icon}</div>
            <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>{k.label}</div>
            <div style={{fontFamily:(k as any).mono?"monospace":"Bebas Neue,sans-serif",fontSize:32,color:k.color,lineHeight:1,letterSpacing:1,marginBottom:4}}>{k.value}</div>
            <div style={{fontSize:10,color:"#333"}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Latest post hero + Quick actions ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:12,marginBottom:16}}>

        {/* Latest post */}
        <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:"20px 22px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 80% 50%,rgba(229,9,20,.04) 0%,transparent 60%)",pointerEvents:"none"}}/>
          <div style={{fontSize:9,color:"#444",letterSpacing:3,textTransform:"uppercase",fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:R,animation:"pulse 2s infinite"}}/>
            Last Published
          </div>
          {latest?(
            <>
              <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                <Pill cat={latest.category}/>
                {latest.isBreaking&&<span style={{background:R,color:"#fff",fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:3,letterSpacing:1}}>BREAKING</span>}
                {latest.manualPost&&<span style={{background:"#1a1a1a",color:"#555",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:3}}>MANUAL</span>}
                <span style={{fontSize:11,color:"#444",marginLeft:"auto"}}>{ago(latest.postedAt)}</span>
              </div>
              <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:"clamp(18px,2.5vw,32px)",lineHeight:1.1,letterSpacing:1,marginBottom:12,color:"#fff"}}>{latest.title}</div>
              <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,color:latest.instagram.success?"#4ade80":"#f87171",fontWeight:700}}>
                    {latest.instagram.success?"✓":"✗"} Instagram
                  </span>
                  {!latest.instagram.success&&!retries[latest.articleId+"_instagram"]?.done&&(
                    <button onClick={()=>onRetry(latest,"instagram")} disabled={retries[latest.articleId+"_instagram"]?.loading}
                      style={{background:"#FF007A",color:"#fff",border:"none",borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                      {retries[latest.articleId+"_instagram"]?.loading?<Spin/>:"Retry"}
                    </button>
                  )}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,color:latest.facebook.success?"#4ade80":"#f87171",fontWeight:700}}>
                    {latest.facebook.success?"✓":"✗"} Facebook
                  </span>
                  {!latest.facebook.success&&!retries[latest.articleId+"_facebook"]?.done&&(
                    <button onClick={()=>onRetry(latest,"facebook")} disabled={retries[latest.articleId+"_facebook"]?.loading}
                      style={{background:"#1877f2",color:"#fff",border:"none",borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                      {retries[latest.articleId+"_facebook"]?.loading?<Spin/>:"Retry"}
                    </button>
                  )}
                </div>
                {latest.url&&<a href={latest.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#444",textDecoration:"none",border:"1px solid #222",borderRadius:4,padding:"3px 10px",marginLeft:"auto"}}>Source ↗</a>}
              </div>
            </>
          ):(
            <div style={{padding:"20px 0"}}>
              <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:28,color:"#333",marginBottom:6}}>No posts yet</div>
              <div style={{fontSize:13,color:"#333"}}>Trigger the pipeline to publish the first article.</div>
            </div>
          )}
        </div>

        {/* Quick actions panel */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={onTrigger} disabled={triggering}
            style={{background:triggering?"#1a0a0a":`linear-gradient(135deg,${R},#c00)`,color:"#fff",border:"none",borderRadius:10,padding:"16px",fontSize:13,fontWeight:800,cursor:triggering?"not-allowed":"pointer",letterSpacing:1,textTransform:"uppercase",transition:"all .2s",boxShadow:triggering?"none":`0 4px 20px rgba(229,9,20,.3)`}}>
            {triggering?<><Spin/> Triggering…</>:"🚀 Post Now"}
          </button>
          <button onClick={onCompose}
            style={{background:"#0f0f0f",color:"#e5e5e5",border:"1px solid #2a2a2a",borderRadius:10,padding:"14px",fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:.5,textTransform:"uppercase",transition:"all .2s"}}>
            ✏️ Compose Post
          </button>
          <button onClick={onClear} disabled={clearing}
            style={{background:"#0a0a0a",color:"#555",border:"1px solid #1a1a1a",borderRadius:10,padding:"12px",fontSize:12,fontWeight:600,cursor:clearing?"not-allowed":"pointer",transition:"all .2s"}}>
            {clearing?<><Spin/> Clearing…</>:"🗑 Clear Seen Cache"}
          </button>
          {/* System health */}
          <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:10,padding:"14px",flex:1}}>
            <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>System</div>
            {[
              {label:"Auto-Poster",status:"LIVE",ok:true},
              {label:"Cloudflare Cron",status:"10 min",ok:true},
              {label:"AI (Gemini)",status:"Active",ok:true},
              {label:"AI (NVIDIA)",status:"Active",ok:true},
            ].map(s=>(
              <div key={s.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #111"}}>
                <span style={{fontSize:11,color:"#555"}}>{s.label}</span>
                <span style={{fontSize:10,color:s.ok?GR:"#f87171",fontWeight:700,letterSpacing:.5}}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: Failures alert (if any) ── */}
      {recentFailed.length>0&&(
        <div style={{background:"#0d0505",border:"1px solid #2a1010",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:10,color:"#f87171",letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:10}}>⚠ {recentFailed.length} Recent Failure{recentFailed.length!==1?"s":""}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {recentFailed.map(p=>{
              const igFailed=!p.instagram.success&&!retries[p.articleId+"_instagram"]?.done;
              const fbFailed=!p.facebook.success&&!retries[p.articleId+"_facebook"]?.done;
              return (
                <div key={p.articleId} style={{display:"flex",gap:10,alignItems:"center"}}>
                  <Pill cat={p.category}/>
                  <span style={{flex:1,fontSize:12,color:"#888",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</span>
                  <span style={{fontSize:10,color:"#444",flexShrink:0}}>{ago(p.postedAt)}</span>
                  {igFailed&&<button onClick={()=>onRetry(p,"instagram")} disabled={retries[p.articleId+"_instagram"]?.loading} style={{background:"#FF007A",color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>{retries[p.articleId+"_instagram"]?.loading?<Spin/>:"Retry IG"}</button>}
                  {fbFailed&&<button onClick={()=>onRetry(p,"facebook")} disabled={retries[p.articleId+"_facebook"]?.loading} style={{background:"#1877f2",color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>{retries[p.articleId+"_facebook"]?.loading?<Spin/>:"Retry FB"}</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Row 4: Recent posts stream ── */}
      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #141414",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:10,color:"#444",letterSpacing:2,textTransform:"uppercase",fontWeight:700}}>Recent Posts</div>
          <span style={{fontSize:11,color:"#333"}}>{posts.length} total</span>
        </div>
        {loading?(
          <div style={{padding:"40px",textAlign:"center",color:"#333",fontSize:13}}>Loading…</div>
        ):(
          <div style={{maxHeight:420,overflowY:"auto"}}>
            {recent.length===0&&<div style={{padding:"40px",textAlign:"center",color:"#333",fontSize:13}}>No posts yet</div>}
            {recent.map((p,i)=>{
              const igOk=p.instagram.success||retries[p.articleId+"_instagram"]?.done;
              const fbOk=p.facebook.success||retries[p.articleId+"_facebook"]?.done;
              const {bg}=cc(p.category);
              return (
                <div key={p.articleId} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 18px",borderBottom:i<recent.length-1?"1px solid #0f0f0f":"none",transition:"background .15s"}}
                  onMouseEnter={e=>(e.currentTarget.style.background="#0f0f0f")}
                  onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                  <div style={{width:3,height:36,borderRadius:2,background:bg,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{p.title}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <Pill cat={p.category}/>
                      <span style={{fontSize:10,color:"#444"}}>{ago(p.postedAt)}</span>
                      {p.isBreaking&&<span style={{fontSize:8,color:R,fontWeight:800,letterSpacing:1}}>BREAKING</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    <span style={{fontSize:10,color:igOk?"#4ade80":"#f87171",fontWeight:700}}>IG{igOk?"✓":"✗"}</span>
                    <span style={{fontSize:10,color:fbOk?"#4ade80":"#f87171",fontWeight:700}}>FB{fbOk?"✓":"✗"}</span>
                    {(!igOk||!fbOk)&&(
                      <button onClick={()=>{if(!igOk)onRetry(p,"instagram");else onRetry(p,"facebook");}}
                        style={{background:"#1a1a1a",border:"1px solid #2a2a2a",color:"#888",borderRadius:4,padding:"3px 8px",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({p,onRetry,retries}:{p:Post;onRetry:(p:Post,pl:"instagram"|"facebook")=>void;retries:Record<string,Retry>}){
  const [hov,setHov]=useState(false);
  const igOk=p.instagram.success||retries[p.articleId+"_instagram"]?.done;
  const fbOk=p.facebook.success||retries[p.articleId+"_facebook"]?.done;
  const {bg}=cc(p.category);
  return <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{flexShrink:0,width:160,borderRadius:8,overflow:"hidden",background:"#0f0f0f",border:"1px solid #1a1a1a",transition:"transform .2s,box-shadow .2s,border-color .2s",transform:hov?"scale(1.04)":"scale(1)",boxShadow:hov?"0 12px 40px rgba(0,0,0,.9)":"none",borderColor:hov?"#2a2a2a":"#1a1a1a",cursor:"pointer",position:"relative"}}>
    <div style={{width:"100%",aspectRatio:"4/5",background:"linear-gradient(135deg,#111,#080808)",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:bg}}/>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6,padding:"16px 10px 10px"}}>
        <Pill cat={p.category}/>
        <div style={{fontSize:10,color:"#555",textAlign:"center",lineHeight:1.4}}>{p.title.slice(0,60)}{p.title.length>60?"...":""}</div>
      </div>
      <div style={{position:"absolute",top:8,right:6,display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end",zIndex:3}}>
        {p.isBreaking&&<span style={{background:R,color:"#fff",fontSize:8,fontWeight:800,padding:"2px 5px",borderRadius:3}}>BREAKING</span>}
        {p.manualPost&&<span style={{background:"#1a1a1a",color:"#555",fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:3}}>MANUAL</span>}
      </div>
      {hov&&(!igOk||!fbOk)&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:10,zIndex:10}}>
        {!igOk&&<button onClick={e=>{e.stopPropagation();onRetry(p,"instagram");}} disabled={retries[p.articleId+"_instagram"]?.loading} style={{background:"#FF007A",color:"#fff",border:"none",borderRadius:5,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>{retries[p.articleId+"_instagram"]?.loading?<Spin/>:"Retry IG"}</button>}
        {!fbOk&&<button onClick={e=>{e.stopPropagation();onRetry(p,"facebook");}} disabled={retries[p.articleId+"_facebook"]?.loading} style={{background:"#1877f2",color:"#fff",border:"none",borderRadius:5,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>{retries[p.articleId+"_facebook"]?.loading?<Spin/>:"Retry FB"}</button>}
      </div>}
    </div>
    <div style={{padding:"8px 10px"}}>
      <div style={{fontSize:11,color:"#aaa",lineHeight:1.4,marginBottom:5,fontWeight:500}}>{p.title.slice(0,55)}{p.title.length>55?"...":""}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:10,color:"#444"}}>{ago(p.postedAt)}</span><div style={{display:"flex",gap:4}}><span style={{fontSize:10,color:igOk?"#4ade80":"#f87171"}}>IG{igOk?"✓":"✗"}</span><span style={{fontSize:10,color:fbOk?"#4ade80":"#f87171"}}>FB{fbOk?"✓":"✗"}</span></div></div>
    </div>
  </div>;
}

type FeedSectionProps={onPost:()=>void;posts:Post[];toggles:Record<string,boolean>;onToggle:(src:string)=>void};
function FeedSection({onPost,posts,toggles,onToggle}:FeedSectionProps){
  const [items,setItems]=useState<FeedItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [posting,setPosting]=useState<string|null>(null);
  const [done,setDone]=useState<Record<string,boolean>>({});
  const [errs,setErrs]=useState<Record<string,string>>({});
  useEffect(()=>{fetch("https://ppp-tv-worker.euginemicah.workers.dev/feed?limit=30").then(r=>r.json()).then(d=>setItems(d.articles||[])).catch(()=>{}).finally(()=>setLoading(false));},[]);
  async function postItem(item:FeedItem){
    setPosting(item.slug);
    try{const r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.articleUrl||item.sourceUrl,category:item.category})});const d=await r.json();if(d.instagram?.success||d.facebook?.success){setDone(s=>({...s,[item.slug]:true}));onPost();}else setErrs(s=>({...s,[item.slug]:d.error||"Failed"}));}
    catch(e:any){setErrs(s=>({...s,[item.slug]:e.message}));}finally{setPosting(null);}
  }
  // Aggregate success/failure by source
  const stats=posts.reduce<Record<string,{total:number;ok:number;fail:number}>>((acc,p)=>{
    const key=`${p.category}|${(p as any).sourceName ?? ""}`;
    const ok=(p.instagram?.success||p.facebook?.success)?1:0;
    const fail=ok?0:1;
    acc[key]=acc[key]||{total:0,ok:0,fail:0};
    acc[key].total++;acc[key].ok+=ok;acc[key].fail+=fail;
    return acc;
  },{});
  const statRows=Object.entries(stats).map(([k,v])=>{
    const parts=k.split("|");return {cat:parts[0],src:parts[1]||"Unknown",...v,rate:v.total?Math.round(v.ok/v.total*100):0};
  }).sort((a,b)=>b.total-a.total).slice(0,12);

  const overallRate=posts.length?Math.round(posts.filter(p=>p.instagram.success||p.facebook.success).length/posts.length*100):0;

  return <div className="fade">
    <div style={{marginBottom:16}}>
      <h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Live Feed + Source Health</h2>
      <p style={{fontSize:12,color:"#444"}}>Monitor RSS/TikTok intake and post from the live feed.</p>
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <div className="kpi-card" style={{minWidth:180}}>
          <div style={{fontSize:11,color:"#666",marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Overall success</div>
          <div style={{fontSize:26,fontWeight:800,color:overallRate>=99?"#4ade80":"#fbbf24"}}>{overallRate}%</div>
          <div style={{fontSize:11,color:"#444"}}>{posts.length} total posts</div>
        </div>
        <SourceHealth stats={statRows} toggles={toggles} onToggle={onToggle}/>
      </div>
    <div style={{marginBottom:16}}><h3 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:18,letterSpacing:1,marginBottom:4}}>Live Feed</h3><p style={{fontSize:12,color:"#444"}}>Latest articles from PPP TV — post any right now.</p></div>
    {loading?<div style={{color:"#333",padding:40,textAlign:"center"}}>Loading feed…</div>:!items.length?<div style={{color:"#333",padding:40,textAlign:"center"}}>No articles in feed</div>:
    <div style={{display:"flex",flexDirection:"column",gap:6}}>{items.map(item=>{const {bg,text}=cc(item.category);const isDone=done[item.slug];const isErr=errs[item.slug];return <div key={item.slug} className="post-row">
      {item.imageUrlDirect&&<img src={item.imageUrlDirect} alt="" style={{width:64,height:48,objectFit:"cover",borderRadius:4,flexShrink:0}}/>}
      <div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:5,flexWrap:"wrap"}}><span style={{background:bg,color:text,fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:20,letterSpacing:.5,textTransform:"uppercase"}}>{item.category}</span><span style={{fontSize:10,color:"#444"}}>{item.sourceName}</span><span style={{fontSize:10,color:"#333"}}>{ago(item.publishedAt)}</span></div><div style={{fontSize:13,color:"#ccc",fontWeight:600,lineHeight:1.4,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>{isErr&&<div style={{fontSize:10,color:"#f87171",marginTop:3}}>{isErr}</div>}</div>
      <div style={{flexShrink:0}}>{isDone?<span style={{fontSize:11,color:"#4ade80",fontWeight:700}}>✓ Posted</span>:<button onClick={()=>postItem(item)} disabled={posting===item.slug} style={{background:R,color:"#fff",border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:posting===item.slug?.5:1,whiteSpace:"nowrap"}}>{posting===item.slug?<Spin/>:"Post Now"}</button>}</div>
    </div>;})}
    </div>}
  </div>;
}

function ComposeSection({onSuccess}:{onSuccess:()=>void}){
  const [url,setUrl]=useState("");const [cat,setCat]=useState("AUTO");const [preview,setPreview]=useState<Preview|null>(null);const [loading,setLoading]=useState(false);const [posting,setPosting]=useState(false);const [refining,setRefining]=useState(false);const [err,setErr]=useState<string|null>(null);const [ok,setOk]=useState<string|null>(null);const [lightbox,setLightbox]=useState(false);const [copied,setCopied]=useState<string|null>(null);const [editTitle,setEditTitle]=useState("");const [editCaption,setEditCaption]=useState("");const [editing,setEditing]=useState(false);
  const [igManual,setIgManual]=useState(false);const [igManualTitle,setIgManualTitle]=useState("");const [igManualCaption,setIgManualCaption]=useState("");
  // Live thumbnail state
  const [ratio,setRatio]=useState("4:5");
  const [thumbSrc,setThumbSrc]=useState<string|null>(null);
  const [thumbLoading,setThumbLoading]=useState(false);
  const thumbDebounce=useRef<ReturnType<typeof setTimeout>|null>(null);

  const RATIOS=[
    {key:"4:5",label:"4:5",sub:"IG Feed"},
    {key:"1:1",label:"1:1",sub:"Square"},
    {key:"9:16",label:"9:16",sub:"Story"},
    {key:"16:9",label:"16:9",sub:"Wide"},
    {key:"4:3",label:"4:3",sub:"Classic"},
  ];

  // Regenerate thumbnail whenever title, category, ratio, or imageUrl changes
  useEffect(()=>{
    if(!preview)return;
    const title=editTitle||preview.ai.clickbaitTitle;
    const imageUrl=preview.scraped.imageUrl||"";
    const category=cat!=="AUTO"?cat:preview.category;
    if(thumbDebounce.current)clearTimeout(thumbDebounce.current);
    thumbDebounce.current=setTimeout(()=>{
      setThumbLoading(true);
      const params=new URLSearchParams({title,category,imageUrl,ratio});
      const src=`/api/preview-image?${params}`;
      const img=new Image();
      img.onload=()=>{setThumbSrc(src);setThumbLoading(false);};
      img.onerror=()=>{setThumbLoading(false);};
      img.src=src;
    },600);
  },[editTitle,cat,ratio,preview]);

  // Aspect ratio for display
  const ratioStyle:Record<string,string>={"4:5":"4/5","1:1":"1/1","9:16":"9/16","16:9":"16/9","4:3":"4/3"};

  useEffect(()=>{setErr(null);setPreview(null);setOk(null);setEditing(false);setIgManual(false);setIgManualTitle("");setIgManualCaption("");setThumbSrc(null);},[url]);
  useEffect(()=>{if(preview){setEditTitle(preview.ai.clickbaitTitle);setEditCaption(preview.ai.caption);setThumbSrc(preview.imageBase64);}},[preview]);
  async function doPreview(manualTitle?:string,manualCaption?:string){if(!url.trim())return;setLoading(true);setErr(null);setPreview(null);setOk(null);setThumbSrc(null);try{const body:Record<string,string>={url:url.trim()};if(cat!=="AUTO")body.category=cat;if(manualTitle)body.manualTitle=manualTitle;if(manualCaption)body.manualCaption=manualCaption;const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(d.error==="INSTAGRAM_MANUAL"){setIgManual(true);setLoading(false);return;}if(!r.ok||d.error)throw new Error(d.error||"Preview failed");setIgManual(false);setPreview(d);}catch(e:any){setErr(e.message);}finally{setLoading(false);}}
  async function doRefine(){if(!url.trim()||!preview)return;setRefining(true);try{const body:Record<string,string>={url:url.trim()};if(cat!=="AUTO")body.category=cat;const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||"Refine failed");setEditTitle(d.ai.clickbaitTitle);setEditCaption(d.ai.caption);setPreview(d);}catch(e:any){setErr(e.message);}finally{setRefining(false);}}
  async function doPost(){
    if(!preview)return;setPosting(true);setErr(null);setOk(null);
    try{
      const title=editTitle||preview.ai.clickbaitTitle;const caption=editCaption||preview.ai.caption;
      const isVideo=preview.scraped.isVideo&&preview.scraped.videoUrl;
      let r:Response={ok:true} as Response,d:any={};
      if(isVideo){
        // Step 1: Resolve to a direct MP4 URL first
        const resolveRes=await fetch("/api/resolve-video",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:preview.scraped.videoUrl})});
        const resolveData=await resolveRes.json();
        if(!resolveRes.ok||!resolveData.success||!resolveData.videoUrl){
          throw new Error(resolveData.error||"Could not extract video from this URL. Try the Composer instead.");
        }
        // Step 2: Post via SSE stream — do NOT call .json() on this response
        const videoResp=await fetch("/api/post-video",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:resolveData.videoUrl,headline:title,caption,category:cat!=="AUTO"?cat:(preview.category||"GENERAL")})});
        if(!videoResp.ok||!videoResp.body)throw new Error("Post request failed: HTTP "+videoResp.status);
        const reader=videoResp.body.getReader();
        const decoder=new TextDecoder();
        let buf="";
        let finalEvt:any=null;
        while(true){
          const{done,value}=await reader.read();
          if(done)break;
          buf+=decoder.decode(value,{stream:true});
          const lines=buf.split("\n");
          buf=lines.pop()||"";
          for(const line of lines){
            if(!line.startsWith("data: "))continue;
            try{const evt=JSON.parse(line.slice(6));if(evt.done)finalEvt=evt;}catch{}
          }
        }
        if(!finalEvt)throw new Error("Stream ended without a result");
        d=finalEvt;
        r={ok:true} as Response;
      }else{
        const body:Record<string,string>={url:url.trim(),manualTitle:title,manualCaption:caption,imageBase64:preview.imageBase64};
        if(cat!=="AUTO")body.category=cat;
        r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        d=await r.json();
      }
      if(!r.ok||d.error)throw new Error(d.error||"Post failed");
      const ig=d.instagram?.success,fb=d.facebook?.success;
      if(!ig&&!fb)throw new Error(`IG: ${d.instagram?.error||"unknown"} | FB: ${d.facebook?.error||"unknown"}`);
      setOk((ig&&fb)?"✓ Posted to IG + FB":ig?"✓ Posted to IG (FB: "+(d.facebook?.error||"failed")+")":"✓ Posted to FB (IG: "+(d.instagram?.error||"failed")+")");
      if(ig||fb){setUrl("");setPreview(null);setTimeout(onSuccess,1500);}
    }catch(e:any){setErr(e.message);}finally{setPosting(false);}
  }
  function copy(text:string,k:string){navigator.clipboard.writeText(text).then(()=>{setCopied(k);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});}
  const inp:React.CSSProperties={width:"100%",background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:6,padding:"10px 12px",color:"#e5e5e5",fontSize:13,outline:"none",fontFamily:"inherit"};
  return <div className="fade" style={{maxWidth:580}}>
    <div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Compose</h2><p style={{fontSize:12,color:"#444"}}>Paste any URL, preview with AI, edit if needed, then post.</p></div>
    <div style={{display:"flex",gap:8,marginBottom:12}}><input style={{...inp,flex:1}} placeholder="Paste article / YouTube / TikTok / Instagram URL…" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doPreview()}/><button onClick={()=>doPreview()} disabled={!url.trim()||loading} style={{background:R,color:"#fff",border:"none",borderRadius:6,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:(!url.trim()||loading)?.4:1,whiteSpace:"nowrap"}}>{loading?<Spin/>:"Preview"}</button></div>
    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{["AUTO",...CATS].map(c=>{const {bg,text}=cc(c);return <button key={c} onClick={()=>setCat(c)} style={{padding:"4px 10px",borderRadius:20,fontSize:10,fontWeight:600,cursor:"pointer",border:`1px solid ${cat===c?bg:"#1a1a1a"}`,background:cat===c?bg:"#0a0a0a",color:cat===c?text:"#555",transition:"all .15s"}}>{c}</button>;})}</div>
    {igManual&&<div style={{background:"#0d0a00",border:"1px solid #2a2000",borderRadius:8,padding:"14px 16px",marginBottom:12}}>
      <div style={{fontSize:12,color:"#fbbf24",fontWeight:700,marginBottom:10}}>📸 Instagram blocked auto-scraping — enter details manually</div>
      <input value={igManualTitle} onChange={e=>setIgManualTitle(e.target.value)} placeholder="Post title or description…" style={{...inp,marginBottom:8}}/>
      <textarea value={igManualCaption} onChange={e=>setIgManualCaption(e.target.value)} rows={3} placeholder="Caption or context (optional)…" style={{...inp,resize:"vertical",marginBottom:10}}/>
      <button onClick={()=>doPreview(igManualTitle,igManualCaption)} disabled={!igManualTitle.trim()||loading} style={{background:R,color:"#fff",border:"none",borderRadius:6,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:!igManualTitle.trim()?.4:1}}>{loading?<Spin/>:"Generate Preview"}</button>
    </div>}
    {err&&<div style={{background:"#0d0505",border:"1px solid #2a1010",borderRadius:6,padding:"10px 14px",color:"#f87171",fontSize:13,marginBottom:12}}>{err}</div>}
    {ok&&<div style={{background:"#050d05",border:"1px solid #102a10",borderRadius:6,padding:"10px 14px",color:"#4ade80",fontSize:13,marginBottom:12}}>{ok}</div>}
    {preview&&<div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:10,overflow:"hidden"}}>
      {/* Ratio selector */}
      <div style={{padding:"12px 16px 0",display:"flex",gap:6,alignItems:"center"}}>
        <span style={{fontSize:10,color:"#444",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginRight:4}}>Ratio</span>
        {RATIOS.map(r=>(
          <button key={r.key} onClick={()=>setRatio(r.key)}
            style={{padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${ratio===r.key?"#FF007A":"#222"}`,background:ratio===r.key?"#FF007A":"#111",color:ratio===r.key?"#fff":"#555",transition:"all .15s",lineHeight:1}}>
            <div>{r.label}</div>
            <div style={{fontSize:9,fontWeight:400,opacity:.7}}>{r.sub}</div>
          </button>
        ))}
      </div>
      {/* Thumbnail */}
      <div style={{cursor:"zoom-in",position:"relative",margin:"12px 16px 0"}} onClick={()=>setLightbox(true)}>
        {thumbLoading&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,borderRadius:6}}><Spin/></div>}
        <img src={thumbSrc||preview.imageBase64} alt="" style={{width:"100%",display:"block",aspectRatio:ratioStyle[ratio]||"4/5",objectFit:"cover",borderRadius:6,transition:"opacity .2s",opacity:thumbLoading?.5:1}}/>
      </div>
      <div style={{padding:16}}>
        {editing?<><input value={editTitle} onChange={e=>setEditTitle(e.target.value)} style={{...inp,marginBottom:8,fontFamily:"Bebas Neue,sans-serif",fontSize:18,letterSpacing:.5}} placeholder="HEADLINE (ALL CAPS)"/><textarea value={editCaption} onChange={e=>setEditCaption(e.target.value)} rows={7} style={{...inp,resize:"vertical",marginBottom:8,lineHeight:1.7}} placeholder="Caption — emojis welcome 😊 No hashtags needed."/><p style={{fontSize:10,color:"#333",marginBottom:10}}>Hashtags go in the first comment automatically.</p><div style={{display:"flex",gap:8,marginBottom:12}}><button onClick={()=>setEditing(false)} style={{background:"#1a1a1a",color:"#888",border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,cursor:"pointer"}}>Done editing</button><button onClick={doRefine} disabled={refining} style={{background:"#0a0a1a",color:"#818cf8",border:"1px solid #1a1a3a",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:refining?.5:1}}>{refining?<Spin/>:"✨ AI Refine"}</button></div></>
        :<><div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:20,lineHeight:1.2,marginBottom:8,letterSpacing:.5}}>{editTitle||preview.ai.clickbaitTitle}</div><div style={{fontSize:13,color:"#666",lineHeight:1.65,marginBottom:12,whiteSpace:"pre-line"}}>{editCaption||preview.ai.caption}</div></>}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}><Pill cat={preview.category}/><button onClick={()=>setEditing(e=>!e)} style={{background:"none",border:"1px solid #222",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#888",cursor:"pointer"}}>Edit</button><button onClick={()=>copy(editTitle||preview.ai.clickbaitTitle,"t")} style={{background:"none",border:"1px solid #222",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#888",cursor:"pointer"}}>{copied==="t"?"Copied":"Copy Title"}</button><button onClick={()=>copy(editCaption||preview.ai.caption,"c")} style={{background:"none",border:"1px solid #222",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#888",cursor:"pointer"}}>{copied==="c"?"Copied":"Copy Caption"}</button></div>
        <button onClick={doPost} disabled={posting} style={{width:"100%",background:R,color:"#fff",border:"none",borderRadius:6,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",opacity:posting?.5:1,boxShadow:posting?"none":`0 4px 20px rgba(229,9,20,.3)`}}>{posting?(preview?.scraped?.isVideo&&preview?.scraped?.videoUrl?<><Spin/> Resolving + staging video (~90s)…</>:<Spin/>):(preview?.scraped?.isVideo&&preview?.scraped?.videoUrl?"🎬 Post Video to IG + FB":"Post to Instagram + Facebook")}</button>
      </div>
    </div>}
    {lightbox&&(thumbSrc||preview?.imageBase64)&&<div onClick={()=>setLightbox(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.98)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}><img src={thumbSrc||preview?.imageBase64||""} alt="" style={{maxWidth:"95vw",maxHeight:"90dvh",borderRadius:8,objectFit:"contain"}}/></div>}
  </div>;
}

function FailuresSection({posts,onRetry,retries}:{posts:Post[];onRetry:(p:Post,pl:"instagram"|"facebook")=>void;retries:Record<string,Retry>}){
  const failed=posts.filter(p=>!p.instagram.success||!p.facebook.success);
  return <div className="fade"><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Failures</h2><p style={{fontSize:12,color:"#444"}}>Posts that failed — retry them here.</p></div>
    {!failed.length?<div style={{textAlign:"center",padding:60,color:"#333"}}><div style={{fontSize:32,marginBottom:8}}>✓</div><div style={{fontSize:14}}>No failures — all posts succeeded</div></div>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}><div style={{fontSize:11,color:"#f87171",marginBottom:8}}>{failed.length} post{failed.length!==1?"s":""} with failures</div>
      {failed.map(p=>{const igFailed=!p.instagram.success&&!retries[p.articleId+"_instagram"]?.done;const fbFailed=!p.facebook.success&&!retries[p.articleId+"_facebook"]?.done;return <div key={p.articleId} style={{background:"#0a0505",border:"1px solid #1a0a0a",borderRadius:8,padding:"12px 14px"}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-start",justifyContent:"space-between"}}>
          <div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap",alignItems:"center"}}><Pill cat={p.category}/><span style={{fontSize:10,color:"#444"}}>{ago(p.postedAt)}</span></div><div style={{fontSize:13,color:"#ccc",fontWeight:600,lineHeight:1.4,marginBottom:6}}>{p.title}</div>{igFailed&&<div style={{fontSize:11,color:"#f87171",marginBottom:3}}>✗ Instagram: {p.instagram.error||"Failed"}</div>}{fbFailed&&<div style={{fontSize:11,color:"#f87171"}}>✗ Facebook: {p.facebook.error||"Failed"}</div>}</div>
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
  return <div className="fade"><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Analytics</h2><p style={{fontSize:12,color:"#444"}}>Performance overview.</p></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:24}}>
      {[{label:"Today",value:today,color:"#fff"},{label:"Total",value:total,color:"#4ade80"},{label:"Both",value:both,color:"#a855f7"},{label:"IG",value:posts.filter(p=>p.instagram.success).length,color:"#E1306C"},{label:"FB",value:posts.filter(p=>p.facebook.success).length,color:"#1877f2"},{label:"Failed",value:failed,color:failed>0?"#f87171":"#333"}].map(s=><div key={s.label} className="kpi-card"><div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:38,color:s.color,lineHeight:1}}>{s.value}</div><div style={{fontSize:10,color:"#444",marginTop:4,letterSpacing:2,fontWeight:700,textTransform:"uppercase"}}>{s.label}</div></div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div className="kpi-card"><div style={{fontSize:10,color:"#444",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>By Category</div>
        {CATS.filter(c=>catCounts[c]>0).map(c=>{const {bg}=cc(c);return <div key={c} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><div style={{fontSize:11,color:"#444",width:90,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c}</div><div style={{flex:1,background:"#111",borderRadius:2,height:4}}><div style={{width:`${Math.round(catCounts[c]/maxCat*100)}%`,background:bg,borderRadius:2,height:4,transition:"width .4s"}}/></div><div style={{fontSize:11,color:"#333",width:20,textAlign:"right"}}>{catCounts[c]}</div></div>;})}
        {posts.length===0&&<div style={{color:"#222",fontSize:12}}>No data yet</div>}
      </div>
      <div className="kpi-card"><div style={{fontSize:10,color:"#444",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>System</div>
        {[["Schedule","Every 10 min"],["Mode","24/7 Auto"],["Next Post",nextIn],["AI Headline","Gemini 2.5 Flash"],["AI Caption","NVIDIA Llama 3.1"],["Image","1080×1350 JPEG"],["Source","PPP TV Worker"],["Cron","Cloudflare Workers"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #111",fontSize:12}}><span style={{color:"#444"}}>{k}</span><span style={{fontWeight:600,color:"#888"}}>{v}</span></div>)}
      </div>
    </div>
  </div>;
}

function SettingsSection({onTrigger}:{onTrigger:()=>void}){
  const [clearing,setClearing]=useState(false);const [clearMsg,setClearMsg]=useState("");const [triggering,setTriggering]=useState(false);
  async function clearCache(){setClearing(true);setClearMsg("");try{const r=await fetch("https://auto-ppp-tv.euginemicah.workers.dev/clear-cache",{method:"POST",headers:{Authorization:"Bearer ppptvWorker2024"}});const d=await r.json();setClearMsg(`Cleared ${d.cleared||0} seen articles`);}catch(e:any){setClearMsg("Error: "+e.message);}finally{setClearing(false);}}
  async function triggerNow(){setTriggering(true);try{await fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger");onTrigger();}catch(e:any){alert("Error: "+e.message);}finally{setTriggering(false);}}
  return <div className="fade"><div style={{marginBottom:16}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>Settings</h2><p style={{fontSize:12,color:"#444"}}>Control the pipeline and manage the system.</p></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div className="kpi-card"><div style={{fontSize:10,color:"#444",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>Quick Actions</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={triggerNow} disabled={triggering} style={{width:"100%",background:R,color:"#fff",border:"none",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:triggering?.5:1,boxShadow:`0 4px 16px rgba(229,9,20,.25)`}}>{triggering?<Spin/>:"🚀 Run Pipeline Now"}</button>
          <button onClick={clearCache} disabled={clearing} style={{width:"100%",background:"#111",color:"#888",border:"1px solid #222",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",opacity:clearing?.5:1}}>{clearing?<Spin/>:"Clear Seen Articles Cache"}</button>
          {clearMsg&&<div style={{fontSize:11,color:"#4ade80"}}>{clearMsg}</div>}
          <a href="https://ppp-tv-site.vercel.app" target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",background:"#0f0f0f",color:"#888",border:"1px solid #1a1a1a",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Open PPP TV Site ↗</a>
          <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",background:"#0f0f0f",color:"#888",border:"1px solid #1a1a1a",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Cloudflare Dashboard ↗</a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",background:"#0f0f0f",color:"#888",border:"1px solid #1a1a1a",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Vercel Dashboard ↗</a>
        </div>
      </div>
      <div className="kpi-card"><div style={{fontSize:10,color:"#444",letterSpacing:2,fontWeight:700,textTransform:"uppercase",marginBottom:14}}>Environment</div>
        {[["Worker","auto-ppp-tv.euginemicah.workers.dev"],["Vercel","auto-news-station.vercel.app"],["PPP TV","ppp-tv-site.vercel.app"],["Cron","*/10 * * * *"],["AI Headline","Gemini 2.5 Flash"],["AI Caption","NVIDIA Llama 3.1 8B"],["Image","1080×1350 JPEG"],["Dedup TTL","30 days"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #111",fontSize:12}}><span style={{color:"#444"}}>{k}</span><span style={{fontWeight:600,color:"#666",fontFamily:"monospace",fontSize:11}}>{v}</span></div>)}
      </div>
    </div>
  </div>;
}
