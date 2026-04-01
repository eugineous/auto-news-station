"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Shell from "../shell";

const R="#E50914", PK="#FF007A", GR="#4ade80", AM="#f59e0b";
const CYAN="#22d3ee", PURPLE="#a855f7", BLUE="#3b82f6", ORANGE="#f97316";

const CAT:Record<string,{bg:string;text:string}> = {
  CELEBRITY:{bg:"#FF007A",text:"#fff"},POLITICS:{bg:"#FF007A",text:"#fff"},NEWS:{bg:"#E50914",text:"#fff"},
  FASHION:{bg:"#ec4899",text:"#fff"},MUSIC:{bg:"#a855f7",text:"#fff"},ENTERTAINMENT:{bg:"#a855f7",text:"#fff"},
  "TV & FILM":{bg:"#f59e0b",text:"#000"},MOVIES:{bg:"#f59e0b",text:"#000"},LIFESTYLE:{bg:"#14b8a6",text:"#fff"},
  HEALTH:{bg:"#10b981",text:"#fff"},EVENTS:{bg:"#10b981",text:"#fff"},"EAST AFRICA":{bg:"#06b6d4",text:"#000"},
  TECHNOLOGY:{bg:"#06b6d4",text:"#000"},COMEDY:{bg:"#eab308",text:"#000"},AWARDS:{bg:"#eab308",text:"#000"},
  INFLUENCERS:{bg:"#f97316",text:"#fff"},SPORTS:{bg:"#3b82f6",text:"#fff"},SCIENCE:{bg:"#3b82f6",text:"#fff"},
  BUSINESS:{bg:"#FFD700",text:"#000"},GENERAL:{bg:"#E50914",text:"#fff"},
};
const cc=(c:string)=>CAT[c?.toUpperCase()]??{bg:"#E50914",text:"#fff"};

interface Post{articleId:string;title:string;url:string;category:string;manualPost?:boolean;isBreaking?:boolean;postType?:string;sourceName?:string;instagram:{success:boolean;postId?:string;error?:string};facebook:{success:boolean;postId?:string;error?:string};postedAt:string;}
interface Retry{loading:boolean;done?:boolean;error?:string}

function ago(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";}
function Spin(){return <span style={{display:"inline-block",width:13,height:13,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;}
function Pill({cat}:{cat:string}){const{bg,text}=cc(cat);return <span style={{background:bg,color:text,fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:20,letterSpacing:.5,textTransform:"uppercase" as const,whiteSpace:"nowrap" as const}}>{cat}</span>;}

// ── 1. Live EAT clock ─────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Nairobi" }));
      setDate(now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" }));
    };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign: "right" as const }}>
      <div style={{ fontFamily: "monospace", fontSize: 22, color: R, letterSpacing: 2, fontWeight: 700, lineHeight: 1 }}>{time}</div>
      <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{date} · EAT</div>
    </div>
  );
}

// ── 3. Platform health pill ───────────────────────────────────────────────────
function PlatformHealth({ igOk, fbOk }: { igOk: boolean; fbOk: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[{ label: "IG API", ok: igOk, color: "#E1306C" }, { label: "FB API", ok: fbOk, color: "#1877f2" }].map(p => (
        <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 5, background: "#0f0f0f", border: `1px solid ${p.ok ? p.color + "44" : "#f8717144"}`, borderRadius: 20, padding: "4px 10px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.ok ? p.color : "#f87171", display: "inline-block", animation: p.ok ? "pulse 2s infinite" : "none" }} />
          <span style={{ fontSize: 10, color: p.ok ? p.color : "#f87171", fontWeight: 700 }}>{p.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── 5. AI pipeline status ─────────────────────────────────────────────────────
function AIPipelineStatus() {
  const systems = [
    { label: "Gemini AI", status: "Active", ok: true },
    { label: "Auto-Poster", status: "LIVE", ok: true },
    { label: "CF Cron", status: "10 min", ok: true },
    { label: "R2 Storage", status: "Online", ok: true },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
      {systems.map(s => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, background: "#0f0f0f", border: `1px solid ${s.ok ? "#1a3a1a" : "#3a1a1a"}`, borderRadius: 6, padding: "4px 10px" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.ok ? GR : "#f87171", display: "inline-block" }} />
          <span style={{ fontSize: 10, color: "#555" }}>{s.label}</span>
          <span style={{ fontSize: 10, color: s.ok ? GR : "#f87171", fontWeight: 700 }}>{s.status}</span>
        </div>
      ))}
    </div>
  );
}

// ── 8. Emergency post button ──────────────────────────────────────────────────
function EmergencyPost({ onTrigger, triggering }: { onTrigger: () => void; triggering: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={onTrigger} disabled={triggering} style={{ background: triggering ? "#1a0a0a" : `linear-gradient(135deg,${R},#c00)`, color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 13, fontWeight: 800, cursor: triggering ? "not-allowed" : "pointer", letterSpacing: 1, textTransform: "uppercase" as const, boxShadow: triggering ? "none" : `0 4px 20px rgba(229,9,20,.4)`, display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" }}>
        {triggering ? <><Spin /> Triggering…</> : "🚀 Post Now"}
      </button>
      <Link href="/composer" style={{ background: "#0f0f0f", color: "#e5e5e5", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: .5, textTransform: "uppercase" as const, textDecoration: "none", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" as const }}>
        ✏️ Compose
      </Link>
    </div>
  );
}

// ── 6. Category breakdown bar ─────────────────────────────────────────────────
function CategoryBreakdown({ posts }: { posts: Post[] }) {
  const counts = posts.reduce<Record<string,number>>((a,p) => { a[p.category]=(a[p.category]||0)+1; return a; }, {});
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = sorted[0]?.[1] || 1;
  return (
    <div style={{ display:"flex", flexDirection:"column" as const, gap:6 }}>
      {sorted.map(([cat,n]) => {
        const {bg} = cc(cat);
        return (
          <div key={cat} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:9, color:"#555", width:80, textAlign:"right" as const, textTransform:"uppercase" as const, letterSpacing:1, flexShrink:0 }}>{cat}</span>
            <div style={{ flex:1, height:6, background:"#1a1a1a", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(n/max)*100}%`, background:bg, borderRadius:3, transition:"width .4s" }} />
            </div>
            <span style={{ fontSize:10, color:"#555", width:20, textAlign:"right" as const, flexShrink:0 }}>{n}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 7. Streak counter ─────────────────────────────────────────────────────────
function StreakCounter({ posts }: { posts: Post[] }) {
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = d.toDateString();
    if (!posts.some(p => new Date(p.postedAt).toDateString() === ds)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return (
    <div style={{ textAlign:"center" as const }}>
      <div style={{ fontFamily:"Bebas Neue,sans-serif", fontSize:36, color: streak>=7?GR:streak>=3?AM:R, lineHeight:1 }}>{streak}</div>
      <div style={{ fontSize:9, color:"#444", letterSpacing:2, textTransform:"uppercase" as const, marginTop:3 }}>Day Streak 🔥</div>
    </div>
  );
}

// ── 9. Live post ticker ───────────────────────────────────────────────────────
function LiveTicker({ posts }: { posts: Post[] }) {
  const recent = posts.slice(0, 20);
  return (
    <div style={{ overflow:"hidden", position:"relative" as const, height:28 }}>
      <div style={{ display:"flex", gap:24, animation:"ticker 30s linear infinite", whiteSpace:"nowrap" as const, alignItems:"center", height:"100%" }}>
        {[...recent, ...recent].map((p,i) => {
          const {bg,text} = cc(p.category);
          return (
            <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, color:"#888", flexShrink:0 }}>
              <span style={{ background:bg, color:text, fontSize:8, fontWeight:800, padding:"1px 5px", borderRadius:3, textTransform:"uppercase" as const }}>{p.category}</span>
              {p.title?.slice(0,50)}{(p.title?.length||0)>50?"…":""}
              <span style={{ color:"#333", fontSize:10 }}>{ago(p.postedAt)}</span>
              <span style={{ color:"#222" }}>·</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── 12. Top performing category ───────────────────────────────────────────────
function TopCategory({ posts }: { posts: Post[] }) {
  const week = posts.filter(p => Date.now() - new Date(p.postedAt).getTime() < 7*24*3600*1000);
  const counts = week.reduce<Record<string,number>>((a,p)=>{ a[p.category]=(a[p.category]||0)+1; return a; },{});
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  if (!top) return <div style={{fontSize:11,color:"#333"}}>No data yet</div>;
  const {bg,text} = cc(top[0]);
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <span style={{background:bg,color:text,fontSize:11,fontWeight:800,padding:"4px 12px",borderRadius:20,textTransform:"uppercase" as const,letterSpacing:1}}>{top[0]}</span>
      <div>
        <div style={{fontSize:18,fontFamily:"Bebas Neue,sans-serif",color:"#fff",lineHeight:1}}>{top[1]} posts</div>
        <div style={{fontSize:10,color:"#444"}}>this week</div>
      </div>
    </div>
  );
}

// ── 13. Batch retry all failures ──────────────────────────────────────────────
function BatchRetry({ posts, onDone }: { posts: Post[]; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const failed = posts.filter(p => !p.instagram.success || !p.facebook.success);
  async function retryAll() {
    setRunning(true);
    for (const p of failed.slice(0,5)) {
      const platform = !p.instagram.success ? "instagram" : "facebook";
      try {
        await fetch("/api/retry-post", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({articleId:p.articleId,title:p.title,caption:p.title,articleUrl:p.url,category:p.category,platform}) });
      } catch {}
      await new Promise(r=>setTimeout(r,2000));
    }
    setRunning(false); setDone(true); onDone();
    setTimeout(()=>setDone(false), 3000);
  }
  if (!failed.length) return null;
  return (
    <button onClick={retryAll} disabled={running||done} style={{background:done?GR:running?"#1a1a1a":"#f8717122",border:`1px solid ${done?GR+"44":"#f8717144"}`,color:done?GR:"#f87171",borderRadius:7,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:running||done?"default":"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap" as const}}>
      {running?<><Spin/>Retrying {failed.length}…</>:done?"✓ All retried":`⚡ Retry All (${Math.min(failed.length,5)})`}
    </button>
  );
}

// ── 14. Story counter ─────────────────────────────────────────────────────────
function StoryCounter({ posts }: { posts: Post[] }) {
  const today = posts.filter(p => new Date(p.postedAt).toDateString() === new Date().toDateString());
  const stories = today.filter(p => (p as any).igStory?.success || (p as any).fbStory?.success).length;
  return (
    <div style={{textAlign:"center" as const}}>
      <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:28,color:PURPLE,lineHeight:1}}>{stories}</div>
      <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,marginTop:3}}>Stories Today</div>
    </div>
  );
}

// ── 15. System alerts panel ───────────────────────────────────────────────────
function SystemAlerts({ posts }: { posts: Post[] }) {
  const recent24 = posts.filter(p => Date.now() - new Date(p.postedAt).getTime() < 24*3600*1000);
  const igFails = recent24.filter(p => !p.instagram.success);
  const fbFails = recent24.filter(p => !p.facebook.success);
  const alerts = [
    igFails.length > 3 && { level:"warn", msg:`${igFails.length} IG failures in last 24h — check token` },
    fbFails.length > 3 && { level:"warn", msg:`${fbFails.length} FB failures in last 24h` },
    recent24.length === 0 && { level:"error", msg:"No posts in last 24 hours — pipeline may be stuck" },
    recent24.length > 0 && igFails.length === 0 && fbFails.length === 0 && { level:"ok", msg:"All systems nominal — no failures in 24h" },
  ].filter(Boolean) as {level:string;msg:string}[];
  return (
    <div style={{display:"flex",flexDirection:"column" as const,gap:5}}>
      {alerts.map((a,i) => (
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:a.level==="ok"?"#051305":a.level==="warn"?"#130d00":"#130505",border:`1px solid ${a.level==="ok"?"#1a3a1a":a.level==="warn"?"#3a2a00":"#3a1010"}`,borderRadius:6,padding:"7px 12px"}}>
          <span style={{fontSize:12}}>{a.level==="ok"?"✓":a.level==="warn"?"⚠":"✗"}</span>
          <span style={{fontSize:11,color:a.level==="ok"?GR:a.level==="warn"?AM:"#f87171"}}>{a.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [retries, setRetries] = useState<Record<string,Retry>>({});
  const [nextIn, setNextIn] = useState("--:--");
  const [toast, setToast] = useState<{msg:string;type:"ok"|"err"}|null>(null);
  const [triggering, setTriggering] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchPosts = useCallback(async () => {
    try { const r = await fetch("/api/post-log"); if (r.ok) { const d = await r.json(); setPosts(d.log||[]); } }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPosts(); const t = setInterval(fetchPosts, 20000); return () => clearInterval(t); }, [fetchPosts]);

  useEffect(() => {
    const tick = () => {
      const now = new Date(), next = new Date(now);
      next.setMinutes(Math.ceil(now.getMinutes()/10)*10, 0, 0);
      if (next.getTime()===now.getTime()) next.setMinutes(next.getMinutes()+10);
      const diff = Math.max(0, Math.floor((next.getTime()-now.getTime())/1000));
      setNextIn(`${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,"0")}`);
    };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);

  async function doRetry(p:Post, platform:"instagram"|"facebook") {
    const key = p.articleId+"_"+platform;
    setRetries(s=>({...s,[key]:{loading:true}}));
    try {
      const r = await fetch("/api/retry-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({articleId:p.articleId,title:p.title,caption:p.title,articleUrl:p.url,category:p.category,platform})});
      const d = await r.json();
      const ok = platform==="instagram"?d.instagram?.success:d.facebook?.success;
      setRetries(s=>({...s,[key]:{loading:false,done:ok,error:ok?undefined:(d.error||"Failed")}}));
      if (ok) { showToast("Retried "+platform+" ✓","ok"); setTimeout(fetchPosts,1500); }
      else showToast(d.error||"Retry failed","err");
    } catch(e:any) { setRetries(s=>({...s,[key]:{loading:false,error:e.message}})); showToast(e.message,"err"); }
  }

  async function triggerNow() {
    setTriggering(true);
    try { await fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger"); showToast("Pipeline triggered!","ok"); setTimeout(fetchPosts,15000); }
    catch(e:any) { showToast("Trigger failed: "+e.message,"err"); }
    finally { setTriggering(false); }
  }

  async function clearCache() {
    setClearing(true);
    try { const r = await fetch("https://auto-ppp-tv.euginemicah.workers.dev/clear-cache",{method:"POST",headers:{Authorization:"Bearer ppptvWorker2024"}}); const d = await r.json(); showToast(`Cleared ${d.cleared||0} seen articles`,"ok"); }
    catch(e:any) { showToast("Clear failed: "+e.message,"err"); }
    finally { setClearing(false); }
  }

  function showToast(msg:string, type:"ok"|"err") { setToast({msg,type}); setTimeout(()=>setToast(null),4000); }

  const sorted = [...posts].sort((a,b)=>new Date(b.postedAt).getTime()-new Date(a.postedAt).getTime());
  const today = sorted.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString());
  const todayCount = today.length;
  const igOkToday = today.filter(p=>p.instagram.success).length;
  const fbOkToday = today.filter(p=>p.facebook.success).length;
  const failCount = sorted.filter(p=>!p.instagram.success&&!p.facebook.success).length;
  const successRate = sorted.length>0?Math.round(sorted.filter(p=>p.instagram.success||p.facebook.success).length/sorted.length*100):0;
  // 2. Post velocity: posts in last hour
  const velocity = sorted.filter(p=>Date.now()-new Date(p.postedAt).getTime()<3600*1000).length;
  // 4. Breaking news alert
  const breaking = sorted.find(p=>p.isBreaking && Date.now()-new Date(p.postedAt).getTime()<3600*1000);
  // 10. Video posts today
  const videoToday = today.filter(p=>p.postType==="video").length;
  // 11. Last post time
  const lastPost = sorted[0]?.postedAt;
  // Platform health (simple heuristic: recent success rate)
  const recentIgOk = sorted.slice(0,10).filter(p=>p.instagram.success).length >= 5;
  const recentFbOk = sorted.slice(0,10).filter(p=>p.facebook.success).length >= 5;

  return (
    <Shell>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .fade{animation:fadeIn .25s ease}
        .kpi{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:10px;padding:14px 16px;transition:border-color .2s}
        .kpi:hover{border-color:#2a2a2a}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px}
        input,button,select,textarea{font-family:inherit}
      `}</style>
      <div style={{padding:"20px 24px 80px",maxWidth:1400,margin:"0 auto"}}>

        {/* ── Row 0: Header ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:9,height:9,borderRadius:"50%",background:R,animation:"pulse 2s infinite",boxShadow:`0 0 10px ${R}`}}/>
            <span style={{fontFamily:"Bebas Neue,sans-serif",fontSize:26,letterSpacing:3}}>Command Centre</span>
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#0f0f0f",border:"1px solid #1a1a1a",borderRadius:20,padding:"4px 12px"}}>
              <span style={{fontFamily:"monospace",fontSize:13,color:R,letterSpacing:1,fontWeight:700}}>{nextIn}</span>
              <span style={{fontSize:10,color:"#444"}}>next post</span>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" as const}}>
            <LiveClock/>
            <button onClick={fetchPosts} style={{background:"none",border:"1px solid #1a1a1a",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#444",cursor:"pointer"}}>↻</button>
          </div>
        </div>

        {/* ── 4. Breaking news alert ── */}
        {breaking && (
          <div style={{background:"#1a0000",border:`1px solid ${R}66`,borderRadius:8,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,animation:"blink 2s infinite"}}>
            <span style={{background:R,color:"#fff",fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:3,letterSpacing:1,flexShrink:0}}>🔴 BREAKING</span>
            <span style={{fontSize:12,color:"#ffaaaa",fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{breaking.title}</span>
            <span style={{fontSize:10,color:"#555",flexShrink:0}}>{ago(breaking.postedAt)}</span>
          </div>
        )}

        {/* ── 9. Live ticker ── */}
        {sorted.length > 0 && (
          <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:8,padding:"6px 14px",marginBottom:14,overflow:"hidden"}}>
            <LiveTicker posts={sorted}/>
          </div>
        )}

        {/* ── 15. System alerts ── */}
        <div style={{marginBottom:14}}><SystemAlerts posts={sorted}/></div>

        {/* ── Row 1: KPI grid ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:14}}>
          {[
            {label:"Posts Today",value:todayCount,color:"#fff",sub:"published",icon:"📰"},
            {label:"Instagram",value:igOkToday,color:"#E1306C",sub:"posted today",icon:"📸"},
            {label:"Facebook",value:fbOkToday,color:"#1877f2",sub:"posted today",icon:"👥"},
            {label:"Videos",value:videoToday,color:PURPLE,sub:"today",icon:"🎬"},
            {label:"Success Rate",value:successRate+"%",color:successRate>80?GR:successRate>50?AM:"#f87171",sub:"all time",icon:"📈"},
            {label:"Failures",value:failCount,color:failCount>0?"#f87171":"#333",sub:failCount>0?"need retry":"all clear",icon:failCount>0?"⚠️":"✓"},
            {label:"Velocity",value:velocity+"/hr",color:CYAN,sub:"last hour",icon:"⚡"},
            {label:"Next Post",value:nextIn,color:R,sub:"countdown",icon:"⏱",mono:true},
          ].map(k=>(
            <div key={k.label} className="kpi" style={{position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:8,right:10,fontSize:16,opacity:.12}}>{k.icon}</div>
              <div style={{fontSize:8,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,fontWeight:700,marginBottom:5}}>{k.label}</div>
              <div style={{fontFamily:(k as any).mono?"monospace":"Bebas Neue,sans-serif",fontSize:28,color:k.color,lineHeight:1,letterSpacing:1}}>{k.value}</div>
              <div style={{fontSize:9,color:"#333",marginTop:3}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Row 2: Main content ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14,marginBottom:14}}>

          {/* Latest post hero */}
          <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 80% 50%,rgba(229,9,20,.04) 0%,transparent 60%)",pointerEvents:"none"}}/>
            <div style={{fontSize:9,color:"#444",letterSpacing:3,textTransform:"uppercase" as const,fontWeight:700,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:R,animation:"pulse 2s infinite"}}/>
              Last Published
              {lastPost && <span style={{color:"#333",fontWeight:400,letterSpacing:1}}>{ago(lastPost)}</span>}
            </div>
            {sorted[0]?(
              <>
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap" as const,alignItems:"center"}}>
                  <Pill cat={sorted[0].category}/>
                  {sorted[0].isBreaking&&<span style={{background:R,color:"#fff",fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:3}}>BREAKING</span>}
                  {sorted[0].postType==="video"&&<span style={{background:PURPLE+"33",color:PURPLE,fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:3}}>VIDEO</span>}
                </div>
                <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:"clamp(16px,2.5vw,28px)",lineHeight:1.1,letterSpacing:1,marginBottom:10,color:"#fff"}}>{sorted[0].title}</div>
                <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap" as const}}>
                  <span style={{fontSize:11,color:sorted[0].instagram.success?"#4ade80":"#f87171",fontWeight:700}}>{sorted[0].instagram.success?"✓":"✗"} Instagram</span>
                  <span style={{fontSize:11,color:sorted[0].facebook.success?"#4ade80":"#f87171",fontWeight:700}}>{sorted[0].facebook.success?"✓":"✗"} Facebook</span>
                  {sorted[0].url&&<a href={sorted[0].url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#444",textDecoration:"none",border:"1px solid #222",borderRadius:4,padding:"3px 10px",marginLeft:"auto"}}>Source ↗</a>}
                </div>
              </>
            ):(
              <div style={{padding:"20px 0",color:"#333",fontSize:13}}>No posts yet — trigger the pipeline to start.</div>
            )}
          </div>

          {/* Right panel */}
          <div style={{display:"flex",flexDirection:"column" as const,gap:10}}>
            <EmergencyPost onTrigger={triggerNow} triggering={triggering}/>
            <button onClick={clearCache} disabled={clearing} style={{background:"#0a0a0a",color:"#555",border:"1px solid #1a1a1a",borderRadius:8,padding:"10px",fontSize:11,fontWeight:600,cursor:clearing?"not-allowed":"pointer"}}>
              {clearing?<><Spin/> Clearing…</>:"🗑 Clear Seen Cache"}
            </button>
            {/* 3. Platform health */}
            <div className="kpi"><div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,marginBottom:8}}>Platform Health</div><PlatformHealth igOk={recentIgOk} fbOk={recentFbOk}/></div>
            {/* 5. AI status */}
            <div className="kpi"><div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,marginBottom:8}}>AI Pipeline</div><AIPipelineStatus/></div>
          </div>
        </div>

        {/* ── Row 3: Analytics row ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
          {/* 6. Category breakdown */}
          <div className="kpi">
            <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,fontWeight:700,marginBottom:10}}>Today's Categories</div>
            <CategoryBreakdown posts={today}/>
          </div>
          {/* 7+14. Streak + Stories */}
          <div className="kpi" style={{display:"flex",flexDirection:"column" as const,gap:14,justifyContent:"center",alignItems:"center"}}>
            <StreakCounter posts={sorted}/>
            <div style={{width:"100%",height:1,background:"#1a1a1a"}}/>
            <StoryCounter posts={sorted}/>
          </div>
          {/* 12. Top category */}
          <div className="kpi">
            <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,fontWeight:700,marginBottom:10}}>Top Category This Week</div>
            <TopCategory posts={sorted}/>
            <div style={{marginTop:14}}>
              <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,marginBottom:8}}>Quick Links</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                {[{href:"/trends",label:"🧠 Trends"},{href:"/competitors",label:"📡 Rivals"},{href:"/factory",label:"🏭 Factory"},{href:"/intelligence",label:"🎯 Insights"}].map(l=>(
                  <Link key={l.href} href={l.href} style={{background:"#111",border:"1px solid #222",color:"#888",borderRadius:5,padding:"4px 8px",fontSize:10,textDecoration:"none",fontWeight:600}}>{l.label}</Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 4: Failures + retry ── */}
        {failCount > 0 && (
          <div style={{background:"#0d0505",border:"1px solid #2a1010",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:10,color:"#f87171",letterSpacing:2,textTransform:"uppercase" as const,fontWeight:700}}>⚠ {failCount} Failures</div>
              <BatchRetry posts={sorted} onDone={fetchPosts}/>
            </div>
            <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
              {sorted.filter(p=>!p.instagram.success||!p.facebook.success).slice(0,5).map(p=>(
                <div key={p.articleId} style={{display:"flex",gap:8,alignItems:"center"}}>
                  <Pill cat={p.category}/>
                  <span style={{flex:1,fontSize:12,color:"#888",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{p.title}</span>
                  <span style={{fontSize:10,color:"#444",flexShrink:0}}>{ago(p.postedAt)}</span>
                  {!p.instagram.success&&<button onClick={()=>doRetry(p,"instagram")} disabled={retries[p.articleId+"_instagram"]?.loading} style={{background:PK,color:"#fff",border:"none",borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>{retries[p.articleId+"_instagram"]?.loading?<Spin/>:"Retry IG"}</button>}
                  {!p.facebook.success&&<button onClick={()=>doRetry(p,"facebook")} disabled={retries[p.articleId+"_facebook"]?.loading} style={{background:"#1877f2",color:"#fff",border:"none",borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>{retries[p.articleId+"_facebook"]?.loading?<Spin/>:"Retry FB"}</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Row 5: Recent posts stream ── */}
        <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #141414",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:10,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,fontWeight:700}}>Recent Posts</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#333"}}>{sorted.length} total</span>
              <Link href="/analytics" style={{fontSize:10,color:"#555",textDecoration:"none",border:"1px solid #222",borderRadius:4,padding:"2px 8px"}}>Full Analytics →</Link>
            </div>
          </div>
          {loading?(
            <div style={{padding:40,textAlign:"center",color:"#333"}}><Spin/></div>
          ):(
            <div style={{maxHeight:400,overflowY:"auto"}}>
              {sorted.slice(0,20).map((p,i)=>{
                const {bg}=cc(p.category);
                const igOk=p.instagram.success||retries[p.articleId+"_instagram"]?.done;
                const fbOk=p.facebook.success||retries[p.articleId+"_facebook"]?.done;
                return (
                  <div key={p.articleId} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 16px",borderBottom:i<19?"1px solid #0f0f0f":"none"}}
                    onMouseEnter={e=>(e.currentTarget.style.background="#0f0f0f")}
                    onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <div style={{width:3,height:32,borderRadius:2,background:bg,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,marginBottom:2}}>{p.title}</div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <Pill cat={p.category}/>
                        {p.postType==="video"&&<span style={{fontSize:8,color:PURPLE,fontWeight:800}}>VIDEO</span>}
                        {p.isBreaking&&<span style={{fontSize:8,color:R,fontWeight:800}}>BREAKING</span>}
                        <span style={{fontSize:10,color:"#444"}}>{ago(p.postedAt)}</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                      <span style={{fontSize:10,color:igOk?"#4ade80":"#f87171",fontWeight:700}}>IG{igOk?"✓":"✗"}</span>
                      <span style={{fontSize:10,color:fbOk?"#4ade80":"#f87171",fontWeight:700}}>FB{fbOk?"✓":"✗"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {toast&&(
        <div onClick={()=>setToast(null)} style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:toast.type==="ok"?"#071a07":"#1a0707",border:`1px solid ${toast.type==="ok"?"#1a3a1a":"#3a1a1a"}`,color:toast.type==="ok"?"#4ade80":"#f87171",padding:"12px 20px",borderRadius:8,fontSize:13,fontWeight:600,zIndex:300,cursor:"pointer",whiteSpace:"nowrap" as const,boxShadow:"0 8px 40px rgba(0,0,0,.8)"}}>
          {toast.type==="ok"?"✓ ":"✗ "}{toast.msg}
        </div>
      )}
    </Shell>
  );
}
