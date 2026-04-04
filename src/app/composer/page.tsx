"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Shell from "../shell";

const PINK="#FF007A", GREEN="#4ade80", RED="#f87171", PURPLE="#a855f7";
const ORANGE="#f97316", YELLOW="#facc15", CYAN="#22d3ee", BLUE="#3b82f6";

type Tab = "compose" | "studio" | "cockpit" | "sources" | "agent" | "queue";
type PostStatus = "idle" | "posting" | "success" | "error";

const FETCH_OPTS: RequestInit = { credentials: "include" };
const WORKER = "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_AUTH = { Authorization: "Bearer ppptvWorker2024" };

const CATS = ["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL","SPORTS","BUSINESS","POLITICS","TECHNOLOGY","HEALTH","SCIENCE","LIFESTYLE","COMEDY","INFLUENCERS"];
const CAT_COLORS: Record<string,string> = {
  CELEBRITY:"#e1306c",MUSIC:"#a855f7","TV & FILM":"#3b82f6",SPORTS:"#22c55e",
  FASHION:"#f97316",POLITICS:"#ef4444",TECHNOLOGY:"#06b6d4",BUSINESS:"#eab308",
  COMEDY:"#f59e0b",INFLUENCERS:"#ec4899","EAST AFRICA":"#10b981",GENERAL:"#6b7280",
  EVENTS:"#8b5cf6",AWARDS:"#f59e0b",HEALTH:"#14b8a6",SCIENCE:"#6366f1",
  LIFESTYLE:"#f43f5e",AUTO:"#64748b",NEWS:"#ef4444",
};
const PLATFORM_COLOR: Record<string,string> = {
  tiktok:"#ff0050",youtube:"#ff0000",instagram:"#e1306c",twitter:"#1da1f2",
  reddit:"#ff4500",dailymotion:"#0066dc",vimeo:"#1ab7ea",direct:"#888","direct-mp4":"#ff0050",
};
const PLATFORM_ICON: Record<string,string> = {
  tiktok:"🎵",youtube:"▶",instagram:"📸",twitter:"𝕏",reddit:"🔴",
  dailymotion:"🎬",vimeo:"🎞",direct:"🔗","direct-mp4":"🎵",
};

// ── Hashtag optimizer per category ────────────────────────────────────────────
const CAT_HASHTAGS: Record<string,string> = {
  CELEBRITY:"#Celebrity #KenyaCelebrity #PPPTVKenya #Entertainment #Nairobi",
  MUSIC:"#KenyaMusic #AfricanMusic #PPPTVKenya #NewMusic #Bongo",
  "TV & FILM":"#KenyaTV #NairobiEntertainment #PPPTVKenya #Movies #Series",
  SPORTS:"#KenyaSports #HarambeeStars #PPPTVKenya #Football #Sports",
  POLITICS:"#KenyaPolitics #PPPTVKenya #Kenya #Nairobi #KenyaNews",
  TECHNOLOGY:"#KenyaTech #AfricaTech #PPPTVKenya #Innovation #Tech",
  COMEDY:"#KenyaComedy #PPPTVKenya #Funny #Viral #EastAfrica",
  GENERAL:"#Kenya #Nairobi #PPPTVKenya #KenyaNews #EastAfrica",
  NEWS:"#KenyaNews #PPPTVKenya #Breaking #Nairobi #EastAfrica",
};

function ago(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";}
function Spin({size=13}:{size?:number}){return <span style={{display:"inline-block",width:size,height:size,border:"2px solid rgba(255,255,255,.15)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0}}/>;}
function Badge({label,color}:{label:string;color:string}){return <span style={{background:color+"22",color,border:`1px solid ${color}44`,fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:4,textTransform:"uppercase" as const,letterSpacing:1,whiteSpace:"nowrap" as const}}>{label}</span>;}

const inp:React.CSSProperties={width:"100%",background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:7,padding:"11px 13px",color:"#e5e5e5",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
const lbl:React.CSSProperties={display:"block",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,color:"#555",marginBottom:7};

// ── Progress Panel (floating) ─────────────────────────────────────────────────
function ProgressPanel({pct,step,onDismiss}:{pct:number;step:string;onDismiss:()=>void}){
  const done=pct>=100;
  const isErr=step.toLowerCase().startsWith("error");
  const color=isErr?RED:done?GREEN:PINK;
  const STEPS=[
    {label:"Scraping metadata",range:[0,15]},
    {label:"Generating thumbnail",range:[15,25]},
    {label:"Downloading video",range:[25,50]},
    {label:"Staging to R2",range:[50,60]},
    {label:"Staging cover image",range:[60,65]},
    {label:"Instagram processing",range:[65,90]},
    {label:"Facebook upload",range:[90,97]},
    {label:"Done",range:[97,100]},
  ];
  return (
    <div style={{position:"fixed" as const,bottom:80,right:16,width:290,background:"#0d0d0d",border:`1px solid ${color}44`,borderRadius:10,padding:"14px 16px",zIndex:1000,boxShadow:"0 4px 24px rgba(0,0,0,.7)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {!done&&<Spin size={11}/>}
          <span style={{fontSize:11,fontWeight:800,color,letterSpacing:1,textTransform:"uppercase" as const}}>{done?(isErr?"Failed":"Posted ✓"):"Posting…"}</span>
        </div>
        {done&&<button onClick={onDismiss} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:14}}>×</button>}
      </div>
      <div style={{height:4,background:"#1a1a1a",borderRadius:2,marginBottom:10,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:2,transition:"width .4s ease"}}/>
      </div>
      <div style={{display:"flex",flexDirection:"column" as const,gap:4}}>
        {STEPS.map((s,i)=>{
          const active=pct>=s.range[0]&&pct<s.range[1];
          const complete=pct>=s.range[1];
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:7,opacity:complete||active?1:0.3}}>
              <span style={{width:14,height:14,borderRadius:"50%",background:complete?GREEN:active?PINK:"#1a1a1a",border:`1px solid ${complete?GREEN:active?PINK:"#333"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:8,color:"#000"}}>
                {complete?"✓":""}
              </span>
              <span style={{fontSize:10,color:complete?GREEN:active?"#fff":"#444"}}>{s.label}</span>
              {active&&<span style={{fontSize:9,color:PINK,marginLeft:"auto"}}>{pct}%</span>}
            </div>
          );
        })}
      </div>
      <div style={{marginTop:8,fontSize:10,color:"#555",borderTop:"1px solid #1a1a1a",paddingTop:8}}>{step}</div>
    </div>
  );
}

// ── Compose Tab ───────────────────────────────────────────────────────────────
function ComposeTab({initialUrl,onSuccess,onProgress}:{initialUrl?:string;onSuccess:()=>void;onProgress:(pct:number,step:string)=>void}){
  const [url,setUrl]=useState(initialUrl||"");
  const [headline,setHeadline]=useState("");
  const [caption,setCaption]=useState("");
  const [category,setCategory]=useState("GENERAL");
  const [thumbUrl,setThumbUrl]=useState("");
  const [thumbSrc,setThumbSrc]=useState<string|null>(null);
  const [thumbLoading,setThumbLoading]=useState(false);
  const [fetching,setFetching]=useState(false);
  const [refining,setRefining]=useState(false);
  const [status,setStatus]=useState<PostStatus>("idle");
  const [result,setResult]=useState<any>(null);
  const [resolvedVideoUrl,setResolvedVideoUrl]=useState("");
  const [platform,setPlatform]=useState("");
  const [showPlayer,setShowPlayer]=useState(false);
  const [playerError,setPlayerError]=useState(false);
  const [dupWarning,setDupWarning]=useState(false);
  const [igOnly,setIgOnly]=useState(false);
  const [fbOnly,setFbOnly]=useState(false);
  // 12. Platform-specific captions
  const [igCaption,setIgCaption]=useState("");
  const [fbCaption,setFbCaption]=useState("");
  const [splitCaptions,setSplitCaptions]=useState(false);
  // 13. Hashtags
  const [hashtags,setHashtags]=useState("");
  // 14. Video info
  const [videoInfo,setVideoInfo]=useState<{duration?:string;size?:string;title?:string}|null>(null);
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const thumbDebounce=useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(()=>{if(initialUrl){setUrl(initialUrl);doFetch(initialUrl);}},[initialUrl]);

  useEffect(()=>{
    if(!headline.trim()||!thumbUrl)return;
    if(thumbDebounce.current)clearTimeout(thumbDebounce.current);
    thumbDebounce.current=setTimeout(()=>{
      setThumbLoading(true);
      const src=`/api/preview-image?${new URLSearchParams({title:headline,category,imageUrl:thumbUrl})}`;
      const img=new Image();
      img.onload=()=>{setThumbSrc(src);setThumbLoading(false);};
      img.onerror=()=>setThumbLoading(false);
      img.src=src;
    },500);
  },[headline,category,thumbUrl]);

  // 13. Auto-generate hashtags when category changes
  useEffect(()=>{
    setHashtags(CAT_HASHTAGS[category]||CAT_HASHTAGS.GENERAL);
  },[category]);

  useEffect(()=>{
    function onKey(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&canPost)handlePost();}
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  });

  async function doFetch(u?:string){
    const target=(u||url).trim();
    if(!target)return;
    setFetching(true);
    setResolvedVideoUrl("");setPlatform("");setShowPlayer(false);setPlayerError(false);setDupWarning(false);setVideoInfo(null);
    try{
      const[previewRes,resolveRes]=await Promise.all([
        fetch("/api/preview-url",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:target})}),
        fetch("/api/resolve-video",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:target})}),
      ]);
      const preview=await previewRes.json() as any;
      const resolve=await resolveRes.json() as any;
      const img=preview.scraped?.videoThumbnailUrl||preview.scraped?.imageUrl||"";
      if(img)setThumbUrl(img);
      if(preview.ai?.clickbaitTitle)setHeadline(preview.ai.clickbaitTitle.toUpperCase().slice(0,120));
      else if(preview.scraped?.title)setHeadline(preview.scraped.title.toUpperCase().slice(0,120));
      if(preview.ai?.caption){setCaption(preview.ai.caption);setIgCaption(preview.ai.caption);setFbCaption(preview.ai.caption);}
      // Fallback: if AI caption failed but headline is set, use headline as caption so Post button is never stuck disabled
      else{const fb=preview.ai?.clickbaitTitle||preview.scraped?.title||"";if(fb){const fbu=fb.toUpperCase().slice(0,500);setCaption(fbu);setIgCaption(fbu);setFbCaption(fbu);}}
      if(preview.category)setCategory(preview.category);
      if(resolve.success&&resolve.videoUrl){
        setResolvedVideoUrl(resolve.videoUrl);
        setPlatform(resolve.platform||"");
        // 14. Video info from resolver
        if(resolve.title||resolve.filename)setVideoInfo({title:resolve.title,duration:resolve.duration,size:resolve.size});
      }
      // 10. Smart dup check
      try{
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(target)))).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,16);
        const dc=await fetch(WORKER+"/seen/check",{method:"POST",headers:{"Content-Type":"application/json",...WORKER_AUTH},body:JSON.stringify({ids:[hash],titles:[]})});
        const dd=await dc.json() as any;
        if(dd.seen?.length>0)setDupWarning(true);
      }catch{}
    }catch{}
    setFetching(false);
  }

  async function handleRefine(){
    if(!url.trim()||refining)return;
    setRefining(true);
    try{
      const r=await fetch("/api/preview-url",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.trim()})});
      const d=await r.json() as any;
      if(d.ai?.clickbaitTitle)setHeadline(d.ai.clickbaitTitle.toUpperCase().slice(0,120));
      if(d.ai?.caption){setCaption(d.ai.caption);setIgCaption(d.ai.caption);setFbCaption(d.ai.caption);}
    }catch{}
    setRefining(false);
  }

  async function handlePost(){
    if(!url.trim()||!headline.trim()||!caption.trim()||status==="posting")return;
    setStatus("posting");setResult(null);
    const finalCaption=(splitCaptions?igCaption:caption)+"\n\n"+hashtags+`\n\nSource: ${url.trim()}`;
    const finalFbCaption=(splitCaptions?fbCaption:caption)+`\n\nSource: ${url.trim()}`;
    try{
      const resp=await fetch("/api/post-video",{
        ...FETCH_OPTS,method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({url:url.trim(),headline:headline.trim(),caption:finalCaption,fbCaption:finalFbCaption,category,igOnly,fbOnly}),
      });
      if(!resp.ok||!resp.body)throw new Error("Post request failed: HTTP "+resp.status);
      const reader=resp.body.getReader();
      const decoder=new TextDecoder();
      let buf="";
      while(true){
        const{done,value}=await reader.read();
        if(done)break;
        buf+=decoder.decode(value,{stream:true});
        const lines=buf.split("\n");buf=lines.pop()||"";
        for(const line of lines){
          if(!line.startsWith("data: "))continue;
          try{
            const evt=JSON.parse(line.slice(6));
            onProgress(evt.pct,evt.step);
            if(evt.done){
              setResult(evt);setStatus(evt.success?"success":"error");
              if(evt.success){setTimeout(()=>{setUrl("");setHeadline("");setCaption("");setThumbUrl("");setThumbSrc(null);setResolvedVideoUrl("");setStatus("idle");setShowPlayer(false);setVideoInfo(null);onSuccess();},3000);}
            }
          }catch{}
        }
      }
    }catch(e:any){setResult({error:e.message});setStatus("error");}
  }

  const canPost=url.trim()&&headline.trim()&&caption.trim()&&status!=="posting";
  const catColor=CAT_COLORS[category]||"#555";

  return(
    <div style={{display:"flex",flexDirection:"column" as const,gap:16}}>
      {/* URL */}
      <div>
        <label style={lbl}>Video URL <span style={{color:"#333",fontWeight:400,textTransform:"none" as const}}>— TikTok · YouTube · Instagram · Twitter/X · Reddit · .mp4</span></label>
        <div style={{display:"flex",gap:8}}>
          <input value={url} onChange={e=>{setUrl(e.target.value);setResolvedVideoUrl("");setShowPlayer(false);}} onBlur={()=>doFetch()} placeholder="Paste any video URL…" style={{...inp,flex:1,borderColor:dupWarning?ORANGE+"66":"#1a1a1a"}}/>
          <button onClick={()=>doFetch()} disabled={!url.trim()||fetching} style={{background:url.trim()&&!fetching?PINK:"#111",border:"none",color:"#fff",borderRadius:7,padding:"11px 16px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap" as const,display:"flex",alignItems:"center",gap:6}}>
            {fetching?<><Spin/>Fetching…</>:"Fetch"}
          </button>
        </div>
        {dupWarning&&<div style={{marginTop:5,fontSize:10,color:ORANGE}}>⚠ This URL may have already been posted</div>}
        {/* 14. Video info */}
        {videoInfo&&<div style={{marginTop:5,display:"flex",gap:8,alignItems:"center"}}>
          {videoInfo.title&&<span style={{fontSize:10,color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,maxWidth:200}}>{videoInfo.title}</span>}
          {videoInfo.duration&&<Badge label={videoInfo.duration} color="#444"/>}
        </div>}
        {resolvedVideoUrl&&!fetching&&(
          <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" as const}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:GREEN,display:"inline-block"}}/>
            <span style={{fontSize:10,color:GREEN}}>Video ready</span>
            {platform&&<Badge label={(PLATFORM_ICON[platform]||"")+" "+platform} color={PLATFORM_COLOR[platform]||"#888"}/>}
            <button onClick={()=>{setShowPlayer(p=>!p);setPlayerError(false);}} style={{background:showPlayer?"#222":PINK,border:"none",color:"#fff",borderRadius:4,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
              {showPlayer?"▼ Hide":"▶ Preview"}
            </button>
          </div>
        )}
      </div>

      {/* Video player */}
      {showPlayer&&resolvedVideoUrl&&(
        <div style={{borderRadius:10,overflow:"hidden",background:"#000",border:"1px solid #1a1a1a"}}>
          {playerError?(
            <div style={{padding:20,textAlign:"center",color:"#555",fontSize:12}}>Can't play inline — <a href={resolvedVideoUrl} target="_blank" rel="noopener noreferrer" style={{color:PINK}}>open in new tab ↗</a></div>
          ):(
            <video src={`/api/proxy-video?url=${encodeURIComponent(resolvedVideoUrl)}`} controls style={{width:"100%",maxHeight:360,display:"block"}} onError={()=>setPlayerError(true)}/>
          )}
        </div>
      )}

      {/* Category */}
      <div>
        <label style={lbl}>Category</label>
        <div style={{display:"flex",gap:4,flexWrap:"wrap" as const}}>
          {CATS.map(c=>(
            <button key={c} onClick={()=>setCategory(c)} style={{padding:"4px 10px",borderRadius:20,fontSize:10,fontWeight:600,cursor:"pointer",border:`1px solid ${category===c?catColor:"#1a1a1a"}`,background:category===c?catColor+"22":"#0a0a0a",color:category===c?catColor:"#555",transition:"all .15s"}}>{c}</button>
          ))}
        </div>
      </div>

      {/* Headline + thumbnail */}
      <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
            <label style={{...lbl,marginBottom:0}}>Headline</label>
            <button onClick={handleRefine} disabled={!url.trim()||refining} style={{background:"none",border:`1px solid ${PINK}44`,color:PINK,borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              {refining?<><Spin size={9}/>Refining…</>:"✨ AI Refine"}
            </button>
          </div>
          <input value={headline} onChange={e=>setHeadline(e.target.value.toUpperCase())} placeholder="TYPE YOUR HEADLINE IN CAPS" maxLength={120} style={{...inp,textTransform:"uppercase" as const,letterSpacing:1}}/>
          <span style={{fontSize:10,color:"#333",marginTop:4,display:"block"}}>{headline.length}/120</span>
        </div>
        {(thumbUrl||thumbSrc)&&(
          <div style={{flexShrink:0,width:80,position:"relative" as const}}>
            <label style={{...lbl,marginBottom:5}}>Cover</label>
            {thumbLoading&&<div style={{position:"absolute" as const,inset:0,top:22,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,zIndex:2}}><Spin/></div>}
            <img src={thumbSrc||`/api/preview-image?${new URLSearchParams({title:headline||"PPP TV",category,imageUrl:thumbUrl})}`} alt="" style={{width:80,aspectRatio:"4/5",objectFit:"cover",borderRadius:6,display:"block",opacity:thumbLoading?0.3:1}}/>
          </div>
        )}
      </div>

      {/* 12. Platform-specific captions toggle */}
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
          <label style={{...lbl,marginBottom:0}}>Caption</label>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setSplitCaptions(s=>!s)} style={{background:splitCaptions?PURPLE+"22":"none",border:`1px solid ${splitCaptions?PURPLE+"44":"#222"}`,color:splitCaptions?PURPLE:"#555",borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:700,cursor:"pointer"}}>
              {splitCaptions?"📱 Split":"📱 Split Captions"}
            </button>
          </div>
        </div>
        {splitCaptions?(
          <div style={{display:"flex",flexDirection:"column" as const,gap:8}}>
            <div>
              <label style={{...lbl,color:"#E1306C"}}>Instagram Caption</label>
              <textarea value={igCaption} onChange={e=>setIgCaption(e.target.value)} rows={4} style={{...inp,resize:"vertical" as const}}/>
            </div>
            <div>
              <label style={{...lbl,color:"#1877f2"}}>Facebook Caption</label>
              <textarea value={fbCaption} onChange={e=>setFbCaption(e.target.value)} rows={4} style={{...inp,resize:"vertical" as const}}/>
            </div>
          </div>
        ):(
          <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Write your caption…" rows={5} style={{...inp,resize:"vertical" as const}}/>
        )}
      </div>

      {/* 13. Hashtags */}
      <div>
        <label style={lbl}>Hashtags <span style={{color:"#333",fontWeight:400,textTransform:"none" as const}}>(auto-generated, editable)</span></label>
        <input value={hashtags} onChange={e=>setHashtags(e.target.value)} style={{...inp,fontSize:11,color:"#666"}}/>
      </div>

      {/* Platform toggles */}
      <div style={{display:"flex",gap:8}}>
        {[{label:"IG Only",val:igOnly,set:setIgOnly,color:"#E1306C"},{label:"FB Only",val:fbOnly,set:setFbOnly,color:"#1877f2"}].map(p=>(
          <button key={p.label} onClick={()=>p.set(v=>!v)} style={{background:p.val?p.color+"22":"none",border:`1px solid ${p.val?p.color+"44":"#222"}`,color:p.val?p.color:"#555",borderRadius:6,padding:"5px 12px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{p.label}</button>
        ))}
      </div>

      {/* Post button */}
      <button onClick={handlePost} disabled={!canPost} style={{width:"100%",padding:"14px 0",fontSize:13,fontWeight:800,letterSpacing:1,textTransform:"uppercase" as const,color:"#fff",background:canPost?PINK:"#111",border:"none",borderRadius:8,cursor:canPost?"pointer":"not-allowed",opacity:canPost?1:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        {status==="posting"?<><Spin/>Posting to IG + FB (~60s)…</>:"🎬 Post Video to IG + FB"}
      </button>
      <div style={{textAlign:"center" as const,fontSize:10,color:"#333",marginTop:-8}}>Ctrl+Enter to post</div>

      {result&&status!=="idle"&&status!=="posting"&&(
        <div style={{borderRadius:8,padding:"12px 14px",background:status==="success"?"rgba(74,222,128,.06)":"rgba(248,113,113,.06)",border:`1px solid ${status==="success"?GREEN+"44":RED+"44"}`}}>
          {status==="success"?(
            <div style={{display:"flex",flexDirection:"column" as const,gap:4}}>
              <span style={{fontWeight:700,color:GREEN,fontSize:13}}>✓ Posted successfully</span>
              {result.instagram?.success&&<span style={{fontSize:11,color:"#aaa"}}>Instagram ✓ {result.instagram.postId}</span>}
              {result.facebook?.success&&<span style={{fontSize:11,color:"#aaa"}}>Facebook ✓ {result.facebook.postId}</span>}
              {!result.instagram?.success&&<span style={{fontSize:11,color:RED}}>Instagram ✗ {result.instagram?.error}</span>}
              {!result.facebook?.success&&<span style={{fontSize:11,color:RED}}>Facebook ✗ {result.facebook?.error}</span>}
            </div>
          ):<span style={{color:RED,fontSize:13}}>{result.error||"Post failed"}</span>}
        </div>
      )}
    </div>
  );
}

// ── Cockpit Tab — live performance monitor ────────────────────────────────────
function CockpitTab({onCompose}:{onCompose:(url:string)=>void}){
  const [posts,setPosts]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [autoPost,setAutoPost]=useState(false);
  const [autoPosting,setAutoPosting]=useState(false);
  const [lastRefresh,setLastRefresh]=useState<Date|null>(null);
  const [viewMode,setViewMode]=useState<"all"|"video"|"top">("all");
  const [toast,setToast]=useState<{msg:string;type:"ok"|"err"}|null>(null);

  const load=useCallback(async()=>{
    try{const r=await fetch("/api/post-log?limit=60",{credentials:"include"});const d=await r.json() as any;setPosts((d.log||[]).sort((a:any,b:any)=>new Date(b.posted_at??b.postedAt??0).getTime()-new Date(a.posted_at??a.postedAt??0).getTime()));setLastRefresh(new Date());}catch{}
    setLoading(false);
  },[]);

  useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t);},[load]);

  async function triggerAutoPost(){
    setAutoPosting(true);
    const prevIds=new Set(posts.map((p:any)=>p.article_id??p.articleId));
    try{
      const r=await fetch("/api/automate-video",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer ppptvWorker2024"}});
      if(r.status===401){setToast({msg:"Auto-post failed: Unauthorized",type:"err"});setTimeout(()=>setToast(null),4000);setAutoPosting(false);return;}
      const d=await r.json() as any;
      await load();
      const newPost=posts.find((p:any)=>!prevIds.has(p.article_id??p.articleId));
      const msg=newPost?.title?`Posted: ${newPost.title.slice(0,50)}`:(d.error?d.error:"Auto-post triggered ✓");
      setToast({msg,type:d.error?"err":"ok"});
      setTimeout(()=>setToast(null),4000);
    }catch(e:any){
      setToast({msg:e.message||"Auto-post failed",type:"err"});
      setTimeout(()=>setToast(null),4000);
    }
    setAutoPosting(false);
  }

  useEffect(()=>{
    if(!autoPost)return;
    const t=setInterval(()=>triggerAutoPost(),12*60*1000);
    return()=>clearInterval(t);
  },[autoPost]);

  const today=posts.filter(p=>new Date(p.posted_at??p.postedAt).toDateString()===new Date().toDateString());
  const videoToday=today.filter(p=>p.post_type==="video"||p.postType==="video");
  const igOk=today.filter(p=>p.ig_success??p.instagram?.success).length;
  const fbOk=today.filter(p=>p.fb_success??p.facebook?.success).length;
  const fails=today.filter(p=>!(p.ig_success??p.instagram?.success)&&!(p.fb_success??p.facebook?.success)).length;

  // 3. Top performing: most recent successful video posts
  const topVideos=posts.filter(p=>(p.post_type==="video"||p.postType==="video")&&((p.ig_success??p.instagram?.success)||(p.fb_success??p.facebook?.success))).slice(0,10);

  const filtered=viewMode==="top"?topVideos:viewMode==="video"?posts.filter(p=>p.postType==="video").slice(0,60):posts.slice(0,60);

  return(
    <div style={{display:"flex",flexDirection:"column" as const,gap:14}}>
      {/* Live bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap" as const,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:GREEN,display:"inline-block",boxShadow:`0 0 8px ${GREEN}`,animation:autoPosting?"pulse 1s infinite":"none"}}/>
          <span style={{fontSize:11,color:"#555"}}>{autoPosting?"POSTING…":"LIVE"} · 15s{lastRefresh?` · ${ago(lastRefresh.toISOString())}`:""}</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:autoPost?PINK+"11":"#111",border:`1px solid ${autoPost?PINK+"44":"#222"}`,padding:"4px 10px",borderRadius:20}}>
            <span style={{fontSize:10,fontWeight:800,color:autoPost?PINK:"#444",textTransform:"uppercase" as const}}>Auto</span>
            <button onClick={()=>setAutoPost(!autoPost)} style={{width:34,height:18,borderRadius:10,background:autoPost?PINK:"#333",border:"none",position:"relative" as const,cursor:"pointer",transition:"all .2s"}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:"#fff",position:"absolute" as const,top:2,left:autoPost?18:2,transition:"all .2s"}}/>
            </button>
          </div>
          <button onClick={triggerAutoPost} disabled={autoPosting} style={{background:autoPosting?"#111":PINK+"22",border:`1px solid ${PINK}44`,color:PINK,borderRadius:6,padding:"5px 12px",fontSize:10,fontWeight:700,cursor:autoPosting?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:5}}>
            {autoPosting?<><Spin size={10}/>Posting…</>:"▶ Run Now"}
          </button>
          <button onClick={load} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:5,padding:"5px 10px",fontSize:10,cursor:"pointer"}}>↻</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {[{label:"Today",value:today.length,color:"#fff",sub:`${videoToday.length} videos`},{label:"IG ✓",value:igOk,color:"#E1306C"},{label:"FB ✓",value:fbOk,color:"#1877f2"},{label:"Fails",value:fails,color:fails>0?RED:"#333"}].map(s=>(
          <div key={s.label} style={{background:"#0f0f0f",border:"1px solid #1a1a1a",borderRadius:8,padding:"12px 10px",textAlign:"center" as const}}>
            <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:28,color:s.color,lineHeight:1}}>{s.value}</div>
            <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,marginTop:3}}>{s.label}</div>
            {(s as any).sub&&<div style={{fontSize:9,color:"#333",marginTop:2}}>{(s as any).sub}</div>}
          </div>
        ))}
      </div>

      {/* View filter */}
      <div style={{display:"flex",gap:3,padding:3,background:"#0a0a0a",borderRadius:7,border:"1px solid #1a1a1a"}}>
        {(["all","video","top"] as const).map(v=>(
          <button key={v} onClick={()=>setViewMode(v)} style={{flex:1,padding:"6px 0",fontSize:10,fontWeight:800,letterSpacing:1,textTransform:"uppercase" as const,border:"none",borderRadius:5,cursor:"pointer",background:viewMode===v?PINK:"transparent",color:viewMode===v?"#fff":"#444"}}>
            {v==="all"?"All Posts":v==="video"?"🎬 Videos":"🏆 Top Performers"}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div style={{display:"flex",flexDirection:"column" as const,gap:4}}>
        {loading?<div style={{textAlign:"center",padding:40,color:"#333"}}><Spin size={20}/></div>
        :filtered.length===0?<div style={{textAlign:"center",padding:40,color:"#333",fontSize:12}}>No posts yet</div>
        :filtered.map((p,i)=>(
          <div key={i} style={{background:"#0a0a0a",border:"1px solid #111",borderRadius:8,padding:"10px 12px",display:"flex",gap:10,alignItems:"center"}}>
            {p.thumbnail&&<img src={p.thumbnail} alt="" style={{width:48,height:60,objectFit:"cover",borderRadius:5,flexShrink:0}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",gap:5,marginBottom:4,flexWrap:"wrap" as const,alignItems:"center"}}>
                {(p.post_type==="video"||p.postType==="video")&&<Badge label="🎬 video" color={PURPLE}/>}
                <Badge label={p.category||"GENERAL"} color={CAT_COLORS[p.category]||"#555"}/>
                {p.sourceName&&<Badge label={p.sourceName} color="#333"/>}
                <span style={{fontSize:10,color:"#333"}}>{ago(p.posted_at??p.postedAt)}</span>
              </div>
              <div style={{fontSize:12,color:"#ccc",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{p.title}</div>
              {p.url&&(
                <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center"}}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#333",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,flex:1}}>{p.url.slice(0,55)}…</a>
                  {/* 7. Post Similar */}
                  <button onClick={()=>onCompose(p.url)} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:4,padding:"2px 7px",fontSize:9,cursor:"pointer",whiteSpace:"nowrap" as const,flexShrink:0}}>Post Similar</button>
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column" as const,gap:3,flexShrink:0,alignItems:"flex-end"}}>
              <span style={{fontSize:11,color:(p.ig_success??p.instagram?.success)?GREEN:RED,fontWeight:800}}>IG {(p.ig_success??p.instagram?.success)?"✓":"✗"}</span>
              <span style={{fontSize:11,color:(p.fb_success??p.facebook?.success)?GREEN:RED,fontWeight:800}}>FB {(p.fb_success??p.facebook?.success)?"✓":"✗"}</span>
              {(!(p.ig_success??p.instagram?.success)||!(p.fb_success??p.facebook?.success))&&(p.article_id??p.articleId)&&(
                <button onClick={async()=>{
                  const platform=!(p.ig_success??p.instagram?.success)?"instagram":"facebook";
                  await fetch("/api/retry-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({article_id:p.article_id??p.articleId,platform})});
                  load();
                }} style={{background:RED+"22",border:`1px solid ${RED}44`,color:RED,borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap" as const}}>↺ Retry</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {toast && (
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:toast.type==="ok"?"#0d2a0d":"#2a0d0d",border:`1px solid ${toast.type==="ok"?"#1a4a1a":"#4a1a1a"}`,color:toast.type==="ok"?"#4ade80":"#f87171",padding:"12px 20px",borderRadius:8,fontSize:13,fontWeight:600,zIndex:300,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
          {toast.type==="ok"?"✓ ":"✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Sources Tab ───────────────────────────────────────────────────────────────
function SourcesTab({onCompose}:{onCompose:(url:string)=>void}){
  const [videos,setVideos]=useState<any[]>([]);
  const [feedStatus,setFeedStatus]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [statusLoading,setStatusLoading]=useState(true);
  const [posting,setPosting]=useState<string|null>(null);
  const [postResults,setPostResults]=useState<Record<string,{ig:boolean;fb:boolean;err?:string}>>({});
  const [filter,setFilter]=useState("ALL");
  const [view,setView]=useState<"feeds"|"videos">("feeds");
  const [search,setSearch]=useState("");

  const PLATFORM_LABELS:Record<string,string>={tiktok:"TikTok",youtube:"YouTube",instagram:"Instagram",twitter:"Twitter/X",reddit:"Reddit",dailymotion:"Dailymotion",vimeo:"Vimeo","direct-mp4":"TikTok",direct:"Direct"};

  async function loadFeedStatus(){
    setStatusLoading(true);
    try{
      // 15. Source reliability — check feeds via trends API
      const r=await fetch("/api/trends/all",{...FETCH_OPTS});
      if(r.ok){const d=await r.json() as any;setFeedStatus(d.feeds||[]);}
    }catch{}
    setStatusLoading(false);
  }

  async function loadVideos(){
    setLoading(true);
    try{
      const r=await fetch("/api/automate-video",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json","X-Dry-Run":"true"}});
      if(r.ok){const d=await r.json() as any;setVideos(d.videos||[]);}
    }catch{}
    setLoading(false);
  }

  useEffect(()=>{loadFeedStatus();},[]);

  async function quickPost(video:any){
    setPosting(video.id);
    try{
      const resp=await fetch("/api/post-video",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.directVideoUrl||video.url,headline:(video.title||"").toUpperCase().slice(0,100),caption:`${video.title}\n\nCredit: ${video.sourceName} | ${video.url}`,category:video.category||"GENERAL"})});
      if(!resp.body)throw new Error("No response");
      const reader=resp.body.getReader();const decoder=new TextDecoder();let buf="",finalEvt:any=null;
      while(true){const{done,value}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});const lines=buf.split("\n");buf=lines.pop()||"";for(const line of lines){if(!line.startsWith("data: "))continue;try{const evt=JSON.parse(line.slice(6));if(evt.done)finalEvt=evt;}catch{}}}
      setPostResults(prev=>({...prev,[video.id]:{ig:!!finalEvt?.instagram?.success,fb:!!finalEvt?.facebook?.success,err:finalEvt?.error}}));
    }catch(e:any){setPostResults(prev=>({...prev,[video.id]:{ig:false,fb:false,err:e.message}}));}
    setPosting(null);
  }

  // 9. Global search filter
  const filteredVideos=videos.filter(v=>{
    if(filter!=="ALL"&&v.sourceType!==filter)return false;
    if(search&&!v.title?.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
  const platforms=["ALL",...Array.from(new Set(videos.map((v:any)=>v.sourceType||"unknown")))];

  return(
    <div style={{display:"flex",flexDirection:"column" as const,gap:14}}>
      <div style={{display:"flex",gap:3,padding:3,background:"#0a0a0a",borderRadius:7,border:"1px solid #1a1a1a"}}>
        {(["feeds","videos"] as const).map(v=>(
          <button key={v} onClick={()=>{setView(v);if(v==="videos"&&videos.length===0)loadVideos();}} style={{flex:1,padding:"7px 0",fontSize:10,fontWeight:800,letterSpacing:1,textTransform:"uppercase" as const,border:"none",borderRadius:5,cursor:"pointer",background:view===v?PINK:"transparent",color:view===v?"#fff":"#444"}}>
            {v==="feeds"?"📡 Feed Health":"🎬 Video Queue"}
          </button>
        ))}
      </div>

      {view==="feeds"&&(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:"#555"}}>{feedStatus.length} sources monitored</span>
            <button onClick={loadFeedStatus} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:5,padding:"4px 10px",fontSize:10,cursor:"pointer"}}>↻ Check</button>
          </div>
          {statusLoading?<div style={{textAlign:"center",padding:30,color:"#333"}}><Spin size={18}/></div>:(
            <div style={{display:"flex",flexDirection:"column" as const,gap:3}}>
              {feedStatus.length===0&&<div style={{textAlign:"center",padding:20,color:"#333",fontSize:12}}>Click Check to probe feed health</div>}
              {feedStatus.map((f:any,i:number)=>(
                <div key={i} style={{background:"#0a0a0a",border:`1px solid ${f.ok?"#1a1a1a":"#f8717122"}`,borderRadius:6,padding:"8px 12px",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:f.ok?GREEN:RED,flexShrink:0,display:"inline-block"}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:11,color:f.ok?"#ccc":"#f87171",fontWeight:600}}>{f.name||f.source}</span>
                      {f.cat&&<Badge label={f.cat} color={PURPLE}/>}
                    </div>
                    <span style={{fontSize:10,color:"#444"}}>{f.ok?`${f.items||0} items · ${f.latency||0}ms`:(f.error||"Failed")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view==="videos"&&(
        <>
          <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:"#444"}}>{videos.length} videos</span>
            <button onClick={loadVideos} disabled={loading} style={{background:loading?"#111":"none",border:"1px solid #222",color:"#555",borderRadius:5,padding:"4px 10px",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              {loading?<><Spin size={10}/>Scraping…</>:"↻ Scrape"}
            </button>
          </div>
          {/* 9. Search */}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search videos…" style={{...inp,fontSize:12}}/>
          {videos.length>0&&(
            <div style={{display:"flex",gap:4,flexWrap:"wrap" as const}}>
              {platforms.map(p=>(
                <button key={p} onClick={()=>setFilter(p)} style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:600,cursor:"pointer",border:`1px solid ${filter===p?PINK:"#1a1a1a"}`,background:filter===p?PINK:"#0a0a0a",color:filter===p?"#fff":"#555"}}>
                  {PLATFORM_LABELS[p]||p}
                </button>
              ))}
            </div>
          )}
          {loading?<div style={{textAlign:"center",padding:40,color:"#333"}}><Spin size={20}/><div style={{marginTop:10,fontSize:11,color:"#444"}}>Scraping sources…</div></div>
          :filteredVideos.length===0?<div style={{textAlign:"center",padding:40,color:"#333",fontSize:12}}>{videos.length===0?"Click Scrape to load videos":"No videos match"}</div>
          :(
            <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
              {filteredVideos.map((v:any)=>{
                const res=postResults[v.id];const isPosting=posting===v.id;
                return(
                  <div key={v.id} style={{background:"#0a0a0a",border:`1px solid ${res?(res.ig||res.fb?"#4ade8033":"#f8717133"):"#111"}`,borderRadius:8,padding:"10px 12px",display:"flex",gap:10,alignItems:"flex-start"}}>
                    {v.thumbnail&&<img src={v.thumbnail} alt="" style={{width:56,height:70,objectFit:"cover",borderRadius:5,flexShrink:0}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:5,marginBottom:4,flexWrap:"wrap" as const,alignItems:"center"}}>
                        <Badge label={PLATFORM_LABELS[v.sourceType]||v.sourceType} color={PLATFORM_COLOR[v.sourceType]||"#888"}/>
                        <Badge label={v.category||"VIDEO"} color={PURPLE}/>
                        <span style={{fontSize:10,color:"#333"}}>{v.sourceName}</span>
                        {v.publishedAt&&<span style={{fontSize:10,color:"#333"}}>· {ago(new Date(v.publishedAt).toISOString())}</span>}
                      </div>
                      <div style={{fontSize:12,color:"#ccc",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,marginBottom:4}}>{v.title}</div>
                      <a href={v.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#333",textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,display:"block"}}>{v.url.slice(0,55)}…</a>
                      {res&&<div style={{marginTop:4,fontSize:10}}>{res.err?<span style={{color:RED}}>{res.err}</span>:<span style={{color:GREEN}}>Posted — IG {res.ig?"✓":"✗"} FB {res.fb?"✓":"✗"}</span>}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column" as const,gap:4,flexShrink:0}}>
                      <button onClick={()=>quickPost(v)} disabled={isPosting||!!res} style={{background:res?(res.ig||res.fb?GREEN:RED):PINK,border:"none",color:"#fff",borderRadius:5,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:isPosting||res?"default":"pointer",opacity:isPosting?0.7:1,display:"flex",alignItems:"center",gap:4}}>
                        {isPosting?<><Spin size={10}/>Posting</>:res?(res.ig||res.fb?"✓ Done":"✗ Failed"):"▶ Post"}
                      </button>
                      <button onClick={()=>onCompose(v.url)} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:5,padding:"5px 10px",fontSize:10,cursor:"pointer"}}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

//  Agent Tab  autonomous monitor 
function AgentTab({onCompose}:{onCompose:(url:string)=>void}){
  const [status,setStatus]=useState<any>(null);
  const [log,setLog]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [toggling,setToggling]=useState(false);

  async function loadStatus(){
    try{
      const[sr,lr]=await Promise.all([
        fetch(WORKER+"/agent/status",{headers:WORKER_AUTH}),
        fetch(WORKER+"/agent/log",{headers:WORKER_AUTH}),
      ]);
      if(sr.ok)setStatus(await sr.json());
      if(lr.ok){const d=await lr.json() as any;setLog(d.log||[]);}
    }catch{}
    setLoading(false);
  }

  useEffect(()=>{loadStatus();const t=setInterval(loadStatus,15000);return()=>clearInterval(t);},[]);

  async function toggle(){
    if(!status||toggling)return;
    setToggling(true);
    try{
      const r=await fetch(WORKER+"/agent/toggle",{method:"POST",headers:{...WORKER_AUTH,"Content-Type":"application/json"},body:JSON.stringify({enabled:!status.enabled})});
      if(r.ok)await loadStatus();
    }catch{}
    setToggling(false);
  }

  const isOn=status?.enabled!==false;

  return(
    <div style={{display:"flex",flexDirection:"column" as const,gap:16}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:24}}></span>
        <div style={{flex:1}}>
          <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,letterSpacing:2}}>Autonomous Agent</div>
          <div style={{fontSize:11,color:"#555"}}>Runs every 10 min  24h fresh news only  self-optimizes via A/B testing</div>
        </div>
        <button onClick={toggle} disabled={toggling||loading} style={{background:isOn?`linear-gradient(135deg,${GREEN},#16a34a)`:"#1a1a1a",border:`2px solid ${isOn?GREEN+"66":"#333"}`,color:"#fff",borderRadius:12,padding:"12px 24px",fontSize:14,fontWeight:800,cursor:toggling?"not-allowed":"pointer",letterSpacing:1,textTransform:"uppercase" as const,boxShadow:isOn?`0 0 20px ${GREEN}44`:"none",transition:"all .3s",minWidth:100}}>
          {toggling?<Spin/>:isOn?" ON":" OFF"}
        </button>
      </div>

      {status&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[
            {label:"Status",value:isOn?"RUNNING":"PAUSED",color:isOn?GREEN:RED},
            {label:"Total Posts",value:status.totalPosts||0,color:"#fff"},
            {label:"A/B Variant",value:status.abVariant||"A",color:status.abVariant==="B"?PURPLE:CYAN},
            {label:"IG Rate",value:status.igSuccessRate!=null?Math.round(status.igSuccessRate*100)+"%":"",color:GREEN},
            {label:"FB Rate",value:status.fbSuccessRate!=null?Math.round(status.fbSuccessRate*100)+"%":"",color:BLUE},
            {label:"Last Run",value:status.lastRun?ago(status.lastRun):"Never",color:"#555"},
          ].map(s=>(
            <div key={s.label} style={{background:"#0f0f0f",border:"1px solid #1a1a1a",borderRadius:8,padding:"12px 10px",textAlign:"center" as const}}>
              <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,color:s.color,lineHeight:1}}>{s.value}</div>
              <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:10,padding:"14px 16px"}}>
        <div style={{fontSize:10,color:"#555",letterSpacing:2,textTransform:"uppercase" as const,fontWeight:700,marginBottom:10}}>Agent Capabilities</div>
        <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
          {[
            {icon:"",text:"Runs every 10 minutes via Cloudflare cron  zero button clicks needed"},
            {icon:"",text:"Only posts content from the last 24 hours  never stale news"},
            {icon:"",text:"Scores content by virality: recency + Kenya relevance + trending topics"},
            {icon:"",text:"A/B tests caption styles (breaking vs casual) and learns which converts better"},
            {icon:"",text:"Deduplicates by URL and title similarity  never posts the same story twice"},
            {icon:"�",text:"Self-heals: if a video URL returns HTML (expired), re-resolves with backup extractor"},
            {icon:"🌍",text:"Sources: 40+ RSS feeds, 14 TikTok accounts, YouTube, Reddit, Dailymotion"},
            {icon:"📸",text:"Always generates a branded PPP TV thumbnail as cover — no blank thumbnails"},
          ].map((c,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:14,flexShrink:0}}>{c.icon}</span>
              <span style={{fontSize:11,color:"#666",lineHeight:1.5}}>{c.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{background:"#050505",border:"1px solid #1a1a1a",borderRadius:8,padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:9,color:"#444",letterSpacing:2,textTransform:"uppercase" as const,fontWeight:700}}>Agent Activity Log</div>
          <button onClick={loadStatus} style={{background:"none",border:"1px solid #222",color:"#444",borderRadius:4,padding:"2px 8px",fontSize:9,cursor:"pointer"}}></button>
        </div>
        {loading?<div style={{textAlign:"center",padding:20,color:"#333"}}><Spin size={14}/></div>
        :log.length===0?<div style={{fontSize:11,color:"#333",textAlign:"center" as const,padding:16}}>No activity yet  agent logs here when it runs</div>
        :(
          <div style={{display:"flex",flexDirection:"column" as const,gap:4,maxHeight:200,overflowY:"auto"}}>
            {log.map((l:any,i:number)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid #0f0f0f"}}>
                <span style={{fontSize:9,color:"#333",fontFamily:"monospace",flexShrink:0}}>{l.ts?new Date(l.ts).toLocaleTimeString("en-KE",{timeZone:"Africa/Nairobi"}):""}</span>
                <span style={{fontSize:10,color:l.posted>0?GREEN:"#555",flex:1}}>
                  {l.type==="video"?"":""} {l.posted>0?`Posted ${l.posted} ${l.type}`:`No new ${l.type}`}
                  {l.abVariant&&<span style={{color:"#444"}}>  Variant {l.abVariant}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Queue Tab ─────────────────────────────────────────────────────────────────
function QueueTab({onCompose}:{onCompose:(url:string)=>void}){
  const [queue,setQueue]=useState<{id:string;url:string;headline:string;caption:string;category:string;status:"pending"|"posting"|"done"|"error";msg?:string}[]>([]);
  const [newUrl,setNewUrl]=useState("");
  const [running,setRunning]=useState(false);
  const [bulkUrls,setBulkUrls]=useState("");
  const [showBulk,setShowBulk]=useState(false);

  function addToQueue(){if(!newUrl.trim())return;setQueue(q=>[...q,{id:Date.now().toString(),url:newUrl.trim(),headline:"",caption:"",category:"GENERAL",status:"pending"}]);setNewUrl("");}
  function addBulk(){const urls=bulkUrls.split("\n").map(u=>u.trim()).filter(Boolean).slice(0,10);setQueue(q=>[...q,...urls.map(url=>({id:Date.now().toString()+Math.random(),url,headline:"",caption:"",category:"GENERAL",status:"pending" as const}))]);setBulkUrls("");setShowBulk(false);}
  function removeFromQueue(id:string){setQueue(q=>q.filter(item=>item.id!==id));}

  async function runQueue(){
    const pending=queue.filter(item=>item.status==="pending");
    if(!pending.length)return;
    setRunning(true);
    for(const item of pending){
      setQueue(q=>q.map(i=>i.id===item.id?{...i,status:"posting"}:i));
      try{
        let headline=item.headline,caption=item.caption;
        if(!headline||!caption){const r=await fetch("/api/preview-url",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.url})});const d=await r.json() as any;headline=(d.ai?.clickbaitTitle||item.url).toUpperCase().slice(0,120);caption=d.ai?.caption||item.url;}
        const resp=await fetch("/api/post-video",{...FETCH_OPTS,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.url,headline,caption,category:item.category})});
        if(!resp.body)throw new Error("No response");
        const reader=resp.body.getReader();const decoder=new TextDecoder();let buf="",finalEvt:any=null;
        while(true){const{done,value}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});const lines=buf.split("\n");buf=lines.pop()||"";for(const line of lines){if(!line.startsWith("data: "))continue;try{const evt=JSON.parse(line.slice(6));if(evt.done)finalEvt=evt;}catch{}}}
        const ok=finalEvt?.success||finalEvt?.instagram?.success||finalEvt?.facebook?.success;
        setQueue(q=>q.map(i=>i.id===item.id?{...i,status:ok?"done":"error",msg:ok?"Posted ✓":(finalEvt?.error||"Failed")}:i));
      }catch(e:any){setQueue(q=>q.map(i=>i.id===item.id?{...i,status:"error",msg:e.message}:i));}
      await new Promise(r=>setTimeout(r,8000));
    }
    setRunning(false);
  }

  const STATUS_COLOR:Record<string,string>={pending:"#444",posting:YELLOW,done:GREEN,error:RED};
  const STATUS_LABEL:Record<string,string>={pending:"Pending",posting:"Posting…",done:"Done ✓",error:"Failed"};
  const pendingCount=queue.filter(i=>i.status==="pending").length;
  const doneCount=queue.filter(i=>i.status==="done").length;

  return(
    <div style={{display:"flex",flexDirection:"column" as const,gap:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>📋</span>
        <div><div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:20,letterSpacing:2}}>Post Queue</div><div style={{fontSize:11,color:"#555"}}>{queue.length} items · {doneCount} done · {pendingCount} pending</div></div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={newUrl} onChange={e=>setNewUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addToQueue()} placeholder="Paste video URL to queue…" style={{...inp,flex:1}}/>
        <button onClick={addToQueue} disabled={!newUrl.trim()} style={{background:newUrl.trim()?PINK:"#111",border:"none",color:"#fff",borderRadius:7,padding:"11px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap" as const}}>+ Add</button>
        <button onClick={()=>setShowBulk(s=>!s)} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:7,padding:"11px 12px",fontSize:11,cursor:"pointer"}}>Bulk</button>
      </div>
      {showBulk&&(<div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:8,padding:"12px"}}><label style={lbl}>Paste up to 10 URLs (one per line)</label><textarea value={bulkUrls} onChange={e=>setBulkUrls(e.target.value)} rows={5} style={{...inp,resize:"vertical" as const,marginBottom:8}}/><button onClick={addBulk} style={{background:PURPLE,border:"none",color:"#fff",borderRadius:6,padding:"8px 16px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Add All</button></div>)}
      {pendingCount>0&&(<button onClick={runQueue} disabled={running} style={{background:running?"#111":PINK,border:"none",color:"#fff",borderRadius:8,padding:"12px",fontSize:12,fontWeight:700,cursor:running?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{running?<><Spin/>Running…</>:`🚀 Run Queue (${pendingCount})`}</button>)}
      {queue.length===0?(<div style={{textAlign:"center" as const,padding:40,color:"#333",fontSize:12}}>Queue is empty — add URLs above</div>):(
        <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
          {queue.map((item,i)=>(
            <div key={item.id} style={{background:"#0a0a0a",border:`1px solid ${STATUS_COLOR[item.status]}33`,borderRadius:8,padding:"10px 12px",display:"flex",gap:10,alignItems:"center"}}>
              <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:18,color:"#333",flexShrink:0,width:24,textAlign:"center" as const}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,marginBottom:4,alignItems:"center"}}><span style={{background:STATUS_COLOR[item.status]+"22",color:STATUS_COLOR[item.status],fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:4,textTransform:"uppercase" as const}}>{STATUS_LABEL[item.status]}</span>{item.status==="posting"&&<Spin size={10}/>}</div>
                <div style={{fontSize:11,color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{item.url.slice(0,60)}…</div>
                {item.msg&&<div style={{fontSize:10,color:item.status==="done"?GREEN:RED,marginTop:3}}>{item.msg}</div>}
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0}}>
                {item.status==="pending"&&<button onClick={()=>onCompose(item.url)} style={{background:"none",border:"1px solid #222",color:"#555",borderRadius:5,padding:"4px 8px",fontSize:9,cursor:"pointer"}}>Edit</button>}
                <button onClick={()=>removeFromQueue(item.id)} style={{background:"none",border:"1px solid #222",color:"#444",borderRadius:5,padding:"4px 8px",fontSize:9,cursor:"pointer"}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Link Studio Tab ────────────────────────────────────────────────────────────
// Paste any URL → AI generates headline + caption → pick ratio → preview + post
const RATIOS: [string, string, number][] = [
  ["9:16","Reels / TikTok / Stories",9/16],
  ["4:5","IG Feed Portrait",4/5],
  ["1:1","Square",1],
  ["16:9","Landscape / YouTube",16/9],
];

function StudioTab({onCompose}:{onCompose:(url:string)=>void}){
  const [url,setUrl]=useState("");
  const [loading,setLoading]=useState(false);
  const [ratio,setRatio]=useState("9:16");
  const [headline,setHeadline]=useState("");
  const [caption,setCaption]=useState("");
  const [category,setCategory]=useState("GENERAL");
  const [thumbUrl,setThumbUrl]=useState("");
  const [thumbSrc,setThumbSrc]=useState<string|null>(null);
  const [thumbLoading,setThumbLoading]=useState(false);
  const [copied,setCopied]=useState(false);
  const [error,setError]=useState("");

  // Regenerate thumb preview when headline, category, thumbUrl, or ratio changes
  useEffect(()=>{
    if(!headline.trim()&&!thumbUrl)return;
    setThumbLoading(true);
    const t=setTimeout(()=>{
      const src=`/api/preview-image?${new URLSearchParams({title:headline||"PPP TV KENYA",category,imageUrl:thumbUrl,ratio})}`;
      const img=new Image();
      img.onload=()=>{setThumbSrc(src);setThumbLoading(false);};
      img.onerror=()=>{setThumbSrc(null);setThumbLoading(false);};
      img.src=src;
    },400);
    return()=>clearTimeout(t);
  },[headline,category,thumbUrl,ratio]);

  async function fetchStudio(){
    const target=url.trim();
    if(!target)return;
    setLoading(true);setError("");setThumbSrc(null);
    try{
      const r=await fetch("/api/preview-url",{credentials:"include",method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:target})});
      const d=await r.json() as any;
      if(d.error&&!d.ai){setError(d.message||d.error);setLoading(false);return;}
      if(d.ai?.clickbaitTitle)setHeadline(d.ai.clickbaitTitle.toUpperCase().slice(0,120));
      else if(d.scraped?.title)setHeadline(d.scraped.title.toUpperCase().slice(0,120));
      if(d.ai?.caption)setCaption(d.ai.caption);
      if(d.category)setCategory(d.category);
      const img=d.scraped?.videoThumbnailUrl||d.scraped?.imageUrl||"";
      if(img)setThumbUrl(img);
    }catch(e:any){setError(e.message||"Fetch failed");}
    setLoading(false);
  }

  async function copyCaption(){
    await navigator.clipboard.writeText(caption);
    setCopied(true);setTimeout(()=>setCopied(false),2000);
  }

  const catColor=CAT_COLORS[category]||"#555";
  // Dimensions for preview box based on ratio
  const ratioVal=RATIOS.find(r=>r[0]===ratio)?.[2]??1;
  const previewW=260;
  const previewH=Math.round(previewW/ratioVal);

  return(
    <div style={{display:"flex",flexDirection:"column" as const,gap:18}}>
      {/* Header */}
      <div style={{padding:"12px 14px",background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:10}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:2,textTransform:"uppercase" as const,color:PINK,marginBottom:4}}>🎬 Link Studio</div>
        <div style={{fontSize:11,color:"#444"}}>Paste any URL — AI writes the headline & caption. Pick your ratio. Preview & post.</div>
      </div>

      {/* URL Input */}
      <div>
        <label style={lbl}>URL — Article · Video · Tweet · TikTok · Instagram</label>
        <div style={{display:"flex",gap:8}}>
          <input
            value={url}
            onChange={e=>setUrl(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")fetchStudio();}}
            placeholder="https://… paste any link"
            style={{...inp,flex:1}}
          />
          <button
            onClick={fetchStudio}
            disabled={!url.trim()||loading}
            style={{background:url.trim()&&!loading?PINK:"#111",border:"none",color:"#fff",borderRadius:7,padding:"11px 18px",fontSize:12,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap" as const}}
          >
            {loading?<><Spin/>Generating…</>:"✨ Generate"}
          </button>
        </div>
        {error&&<div style={{marginTop:5,fontSize:11,color:RED}}>{error}</div>}
      </div>

      {/* Ratio Selector */}
      <div>
        <label style={lbl}>Aspect Ratio</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
          {RATIOS.map(([r,desc])=>(
            <button
              key={r}
              onClick={()=>setRatio(r)}
              style={{
                padding:"7px 14px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
                border:`1px solid ${ratio===r?PINK:"#1a1a1a"}`,
                background:ratio===r?PINK+"22":"#0a0a0a",
                color:ratio===r?PINK:"#444",
                transition:"all .15s",
              }}
            >
              <div style={{fontSize:13,fontWeight:800}}>{r}</div>
              <div style={{fontSize:9,opacity:.7}}>{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main preview + editing panel */}
      {(headline||caption||thumbSrc)&&(
        <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap" as const}}>
          {/* Thumbnail preview */}
          <div style={{flexShrink:0}}>
            <label style={lbl}>Thumbnail Preview</label>
            <div style={{
              width:previewW,
              height:previewH,
              background:"#0a0a0a",
              border:"1px solid #1a1a1a",
              borderRadius:8,
              overflow:"hidden",
              position:"relative" as const,
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
            }}>
              {thumbLoading&&(
                <div style={{position:"absolute" as const,inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
                  <Spin size={18}/>
                </div>
              )}
              {thumbSrc?(
                <img src={thumbSrc} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
              ):(
                <div style={{textAlign:"center" as const,color:"#333",fontSize:11}}>
                  {headline?"Generating preview…":"Enter URL to generate"}
                </div>
              )}
            </div>
            <div style={{marginTop:6,display:"flex",gap:4,flexWrap:"wrap" as const}}>
              {RATIOS.map(([r])=>(
                <button key={r} onClick={()=>setRatio(r)}
                  style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:`1px solid ${ratio===r?PINK+"66":"#222"}`,background:"transparent",color:ratio===r?PINK:"#444",cursor:"pointer",fontWeight:700}}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Editing panel */}
          <div style={{flex:1,minWidth:200,display:"flex",flexDirection:"column" as const,gap:12}}>
            {/* Category */}
            <div>
              <label style={lbl}>Category</label>
              <div style={{display:"flex",gap:4,flexWrap:"wrap" as const}}>
                {CATS.slice(0,12).map(c=>(
                  <button key={c} onClick={()=>setCategory(c)} style={{padding:"3px 9px",borderRadius:20,fontSize:9,fontWeight:600,cursor:"pointer",border:`1px solid ${category===c?catColor:"#1a1a1a"}`,background:category===c?catColor+"22":"#0a0a0a",color:category===c?catColor:"#555"}}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Headline */}
            <div>
              <label style={lbl}>Headline (thumbnail text)</label>
              <input
                value={headline}
                onChange={e=>setHeadline(e.target.value.toUpperCase())}
                placeholder="AI HEADLINE APPEARS HERE…"
                maxLength={120}
                style={{...inp,textTransform:"uppercase" as const,letterSpacing:1,fontWeight:700}}
              />
              <span style={{fontSize:9,color:"#333",marginTop:3,display:"block"}}>{headline.length}/120</span>
            </div>

            {/* Caption */}
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                <label style={{...lbl,marginBottom:0}}>Caption</label>
                <button onClick={copyCaption} style={{background:"none",border:`1px solid #222`,color:copied?GREEN:"#555",borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                  {copied?"✓ Copied":"Copy"}
                </button>
              </div>
              <textarea
                value={caption}
                onChange={e=>setCaption(e.target.value)}
                rows={7}
                placeholder="AI caption appears here — edit freely…"
                style={{...inp,resize:"vertical" as const,lineHeight:1.6,fontSize:12}}
              />
              <span style={{fontSize:9,color:"#333",marginTop:3,display:"block"}}>{caption.length} chars</span>
            </div>

            {/* Actions */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
              <button
                onClick={()=>onCompose(url)}
                disabled={!url.trim()}
                style={{flex:1,padding:"11px 0",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase" as const,color:"#fff",background:url.trim()?PINK:"#111",border:"none",borderRadius:7,cursor:url.trim()?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
              >
                🎬 Open in Compose & Post
              </button>
              <button
                onClick={fetchStudio}
                disabled={!url.trim()||loading}
                style={{padding:"11px 14px",fontSize:11,fontWeight:800,color:PINK,background:PINK+"11",border:`1px solid ${PINK}44`,borderRadius:7,cursor:"pointer"}}
              >
                {loading?<Spin size={11}/>:"↻ Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail URL manual override */}
      {headline&&(
        <div>
          <label style={lbl}>Custom Thumbnail URL <span style={{color:"#333",fontWeight:400,textTransform:"none" as const}}>(optional override)</span></label>
          <input
            value={thumbUrl}
            onChange={e=>setThumbUrl(e.target.value)}
            placeholder="https://… paste a different image URL"
            style={{...inp}}
          />
        </div>
      )}

      {/* Tips */}
      {!headline&&!loading&&(
        <div style={{padding:"16px",background:"#050505",border:"1px solid #111",borderRadius:10,fontSize:11,color:"#333",lineHeight:1.7}}>
          <div style={{color:"#555",fontWeight:700,marginBottom:8}}>What Link Studio does:</div>
          <div>✦ Paste any article, tweet, TikTok, YouTube or Instagram link</div>
          <div>✦ AI writes a punchy headline for the thumbnail</div>
          <div>✦ AI writes a full journalist-style caption with emoji</div>
          <div>✦ Pick your ratio: 9:16 for Reels/TikTok, 4:5 for IG feed, 1:1 square, 16:9 landscape</div>
          <div>✦ Preview the branded thumbnail at your chosen ratio</div>
          <div>✦ Hit "Open in Compose" to post it with one more click</div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ComposerPage(){
  const [tab,setTab]=useState<Tab>("compose");
  const [composeUrl,setComposeUrl]=useState<string|undefined>();
  const [refreshKey,setRefreshKey]=useState(0);
  const [progress,setProgress]=useState<{pct:number;step:string}|null>(null);

  function goCompose(url:string){setComposeUrl(url);setTab("compose");}
  function handleProgress(pct:number,step:string){setProgress({pct,step});}

  const TABS:[Tab,string][]=[["compose","✏️ Compose"],["studio","🎬 Studio"],["cockpit","⚡ Cockpit"],["sources","📡 Sources"],["agent","🤖 Agent"],["queue","📋 Queue"]];

  return(
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}} *{box-sizing:border-box} ::-webkit-scrollbar{width:3px;height:3px} ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px}`}</style>
      <div style={{maxWidth:720,margin:"0 auto",padding:"24px 16px 100px"}}>
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:PINK,display:"inline-block",boxShadow:`0 0 8px ${PINK}`}}/>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:3}}>VIDEO OPS</span>
          </div>
          <p style={{fontSize:11,color:"#333",margin:0}}>Compose · Studio · Monitor · Scrape · Agent · Queue</p>
        </div>
        <div style={{display:"flex",gap:3,marginBottom:22,padding:3,background:"#0a0a0a",borderRadius:8,border:"1px solid #1a1a1a"}}>
          {TABS.map(([t,label])=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px 0",fontSize:10,fontWeight:800,letterSpacing:1,textTransform:"uppercase" as const,border:"none",borderRadius:6,cursor:"pointer",transition:"all .15s",background:tab===t?PINK:"transparent",color:tab===t?"#fff":"#444"}}>{label}</button>))}
        </div>
        {tab==="compose"&&<ComposeTab key={composeUrl} initialUrl={composeUrl} onSuccess={()=>{setRefreshKey(k=>k+1);setTab("cockpit");}} onProgress={handleProgress}/>}
        {tab==="studio"&&<StudioTab onCompose={goCompose}/>}
        {tab==="cockpit"&&<CockpitTab key={`cockpit-${refreshKey}`} onCompose={goCompose}/>}
        {tab==="sources"&&<SourcesTab key={`sources-${refreshKey}`} onCompose={goCompose}/>}
        {tab==="agent"&&<AgentTab key={`agent-${refreshKey}`} onCompose={goCompose}/>}
        {tab==="queue"&&<QueueTab key={`queue-${refreshKey}`} onCompose={goCompose}/>}
      </div>
      {progress&&<ProgressPanel pct={progress.pct} step={progress.step} onDismiss={()=>setProgress(null)}/>}
    </Shell>
  );
}
