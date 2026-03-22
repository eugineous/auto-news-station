"use client";
import { useState, useEffect, useRef } from "react";
const RED="#E50914",PINK="#FF007A",BLACK="#141414",DARK="#1f1f1f",BORDER="#333",MUTED="#808080",WHITE="#fff",GREEN="#46d369",WARN="#f87171";
interface PLE{articleId:string;title:string;url:string;category:string;sourceType?:string;manualPost?:boolean;instagram:{success:boolean;postId?:string;error?:string};facebook:{success:boolean;postId?:string;error?:string};postedAt:string;isBreaking?:boolean;}
interface RS{loading:boolean;done?:boolean;error?:string;}
interface UP{scraped:{type:string;title:string;description:string;imageUrl:string;sourceName:string};ai:{clickbaitTitle:string;caption:string};category:string;imageBase64:string;}
const CATS=["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];
export default function Home(){
  const[tab,setTab]=useState<"post"|"log"|"stats">("post");
  const[postLog,setPostLog]=useState<PLE[]>([]);
  const[logLoading,setLogLoading]=useState(true);
  const[urlInput,setUrlInput]=useState("");
  const[urlCat,setUrlCat]=useState("AUTO");
  const[preview,setPreview]=useState<UP|null>(null);
  const[urlLoading,setUrlLoading]=useState(false);
  const[urlPosting,setUrlPosting]=useState(false);
  const[urlError,setUrlError]=useState<string|null>(null);
  const[urlSuccess,setUrlSuccess]=useState<string|null>(null);
  const[lightbox,setLightbox]=useState(false);
  const[retries,setRetries]=useState<Record<string,RS>>({});
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{fetchLog();const t=setInterval(fetchLog,60000);return()=>clearInterval(t);},[]);
  async function fetchLog(){try{const r=await fetch("/api/post-log");if(r.ok){const d=await r.json();setPostLog(d.log||[]);}}catch{}finally{setLogLoading(false);}}
  function ago(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m<1)return"now";if(m<60)return m+"m";const h=Math.floor(m/60);if(h<24)return h+"h";return Math.floor(h/24)+"d";}
  async function doPreview(){if(!urlInput.trim())return;setUrlLoading(true);setUrlError(null);setPreview(null);setUrlSuccess(null);try{const r=await fetch("/api/preview-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:urlInput.trim(),category:urlCat==="AUTO"?undefined:urlCat})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||"Preview failed");setPreview(d);}catch(e:any){setUrlError(e.message);}finally{setUrlLoading(false);}}
  async function doPost(){if(!preview)return;setUrlPosting(true);setUrlError(null);setUrlSuccess(null);try{const r=await fetch("/api/post-from-url-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:urlInput.trim(),category:urlCat==="AUTO"?undefined:urlCat})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||"Post failed");const ig=d.instagram?.success,fb=d.facebook?.success;setUrlSuccess((ig&&fb)?"Posted to IG + FB":ig?"IG only":fb?"FB only":"Failed");if(ig||fb){setUrlInput("");setPreview(null);setTimeout(fetchLog,2000);}}catch(e:any){setUrlError(e.message);}finally{setUrlPosting(false);}}
  async function doRetry(entry:PLE,platform:"instagram"|"facebook"){const key=entry.articleId+"_"+platform;setRetries(s=>({...s,[key]:{loading:true}}));try{const r=await fetch("/api/retry-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({articleId:entry.articleId,title:entry.title,caption:entry.title,articleUrl:entry.url,category:entry.category,platform})});const d=await r.json();const ok=platform==="instagram"?d.instagram?.success:d.facebook?.success;setRetries(s=>({...s,[key]:{loading:false,done:ok,error:ok?undefined:(d.error||"Failed")}}));if(ok)setTimeout(fetchLog,1500);}catch(e:any){setRetries(s=>({...s,[key]:{loading:false,error:e.message}}));}}
  const todayCount=postLog.filter(p=>new Date(p.postedAt).toDateString()===new Date().toDateString()).length;
  const B=(a=true,f=false):React.CSSProperties=>({width:f?"100%":"auto",background:a?RED:"rgba(255,255,255,0.08)",color:WHITE,border:"none",borderRadius:8,padding:f?"15px 0":"10px 20px",fontWeight:800,fontSize:15,letterSpacing:1,textTransform:"uppercase",cursor:a?"pointer":"not-allowed",opacity:a?1:0.4,boxShadow:a?"0 4px 24px rgba(229,9,20,0.35)":"none"});
  return(
    <div style={{minHeight:"100dvh",background:BLACK,color:WHITE,fontFamily:"Inter,-apple-system,sans-serif",paddingBottom:80,maxWidth:480,margin:"0 auto"}}>
      <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(20,20,20,0.96)",backdropFilter:"blur(16px)",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid "+BORDER}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontFamily:"Bebas Neue,sans-serif",fontSize:28,letterSpacing:2}}>PPP<span style={{color:RED}}>TV</span></span>
          <span style={{fontSize:9,color:PINK,fontWeight:800,letterSpacing:3,textTransform:"uppercase"}}>Auto Poster</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11,color:MUTED}}>{todayCount}/8</span>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:GREEN,boxShadow:"0 0 8px "+GREEN}}/>
            <span style={{fontSize:11,color:MUTED}}>Live</span>
          </div>
        </div>
      </header>
      <div style={{position:"relative",height:120,background:"linear-gradient(160deg,#0d0d0d,#1a0008,#0d0d0d)",display:"flex",alignItems:"flex-end",overflow:"hidden"}}>
        <div style={{position:"relative",zIndex:2,padding:"0 20px 16px"}}>
          <div style={{fontSize:9,color:RED,fontWeight:800,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>PPP TV Kenya</div>
          <h1 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:34,lineHeight:0.95,letterSpacing:1,margin:0}}>POST FROM <span style={{color:RED}}>ANY URL</span></h1>
        </div>
      </div>
      <div style={{padding:"0 16px"}}>
        {tab==="post"&&(
          <div style={{paddingTop:20}}>
            <input ref={inputRef} value={urlInput} onChange={e=>{setUrlInput(e.target.value);setPreview(null);setUrlError(null);setUrlSuccess(null);}} onKeyDown={e=>e.key==="Enter"&&doPreview()} placeholder="Paste URL here..." style={{width:"100%",boxSizing:"border-box",background:DARK,border:"1px solid "+BORDER,borderRadius:8,padding:"14px 16px",color:WHITE,fontSize:15,outline:"none",fontFamily:"inherit",marginBottom:12}}/>
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:14}}>
              {CATS.map(c=>(<button key={c} onClick={()=>setUrlCat(c)} style={{flexShrink:0,background:urlCat===c?RED:"rgba(255,255,255,0.07)",color:urlCat===c?WHITE:MUTED,border:"none",borderRadius:20,padding:"7px 14px",fontSize:11,fontWeight:700,cursor:"pointer",textTransform:"uppercase",whiteSpace:"nowrap"}}>{c}</button>))}
            </div>
            <button onClick={doPreview} disabled={urlLoading||!urlInput.trim()} style={B(!urlLoading&&!!urlInput.trim(),true)}>{urlLoading?"Scraping...":"Preview"}</button>
            {urlError&&<div style={{marginTop:12,background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:8,padding:"12px 14px",color:WARN,fontSize:13}}>{urlError}</div>}
            {urlSuccess&&<div style={{marginTop:12,background:"rgba(70,211,105,0.1)",border:"1px solid rgba(70,211,105,0.3)",borderRadius:8,padding:"12px 14px",color:GREEN,fontSize:13}}>{urlSuccess}</div>}
            {preview&&(
              <div style={{marginTop:20,background:DARK,borderRadius:12,overflow:"hidden",border:"1px solid "+BORDER}}>
                <div onClick={()=>setLightbox(true)} style={{position:"relative",cursor:"zoom-in"}}>
                  <img src={"data:image/jpeg;base64,"+preview.imageBase64} alt="Preview" style={{width:"100%",display:"block",aspectRatio:"4/5",objectFit:"cover"}}/>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 45%,rgba(0,0,0,0.92) 100%)"}}/>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"16px"}}>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <span style={{background:"rgba(229,9,20,0.25)",color:RED,fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20}}>{preview.scraped.type}</span>
                      <span style={{background:"rgba(255,255,255,0.1)",color:MUTED,fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20}}>{preview.category}</span>
                    </div>
                    <div style={{fontFamily:"Bebas Neue,sans-serif",fontSize:22,lineHeight:1.1}}>{preview.ai.clickbaitTitle}</div>
                  </div>
                </div>
                <div style={{padding:"16px"}}>
                  <div style={{fontSize:9,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Caption</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",lineHeight:1.65,maxHeight:90,overflow:"hidden"}}>{preview.ai.caption.slice(0,260)}</div>
                  <div style={{fontSize:10,color:MUTED,marginTop:10,paddingTop:10,borderTop:"1px solid "+BORDER}}>Source: {preview.scraped.sourceName}</div>
                </div>
                <div style={{padding:"0 16px 16px"}}>
                  <button onClick={doPost} disabled={urlPosting} style={B(!urlPosting,true)}>{urlPosting?"Posting...":"Post to IG + FB"}</button>
                </div>
              </div>
            )}
          </div>
        )}
        {tab==="log"&&(
          <div style={{paddingTop:20}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
              <span style={{fontSize:16,fontWeight:700}}>Recent Posts</span>
              <button onClick={fetchLog} style={{background:"none",border:"none",color:MUTED,fontSize:12,cursor:"pointer"}}>Refresh</button>
            </div>
            {logLoading?<div style={{color:MUTED,textAlign:"center",padding:"40px 0"}}>Loading...</div>:postLog.length===0?<div style={{background:DARK,borderRadius:10,padding:"32px 20px",color:MUTED,fontSize:13,textAlign:"center"}}>No posts yet</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {postLog.slice(0,25).map((entry,i)=>{
                  const igR=retries[entry.articleId+"_instagram"],fbR=retries[entry.articleId+"_facebook"];
                  return(
                    <div key={i} style={{background:DARK,borderRadius:10,padding:"14px 16px",border:"1px solid "+BORDER}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:10}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,lineHeight:1.3,marginBottom:5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{entry.title}</div>
                          <div style={{display:"flex",gap:6}}>
                            <span style={{background:entry.manualPost?"rgba(255,0,122,0.2)":"rgba(229,9,20,0.2)",color:entry.manualPost?PINK:RED,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{entry.manualPost?"MANUAL":"AUTO"}</span>
                            <span style={{fontSize:10,color:MUTED}}>{entry.category}</span>
                          </div>
                        </div>
                        <span style={{fontSize:10,color:MUTED,whiteSpace:"nowrap"}}>{ago(entry.postedAt)}</span>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <div style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:10,color:MUTED,fontWeight:700}}>IG</span>
                          {entry.instagram.success||(igR?.done)?<span style={{fontSize:11,color:GREEN,fontWeight:700}}>Done</span>:
                            <button onClick={()=>doRetry(entry,"instagram")} disabled={igR?.loading} style={{background:igR?.loading?"rgba(255,255,255,0.08)":RED,color:WHITE,border:"none",borderRadius:4,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:igR?.loading?"not-allowed":"pointer",opacity:igR?.loading?0.5:1}}>{igR?.loading?"...":"Publish"}</button>
                          }
                        </div>
                        <div style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:10,color:MUTED,fontWeight:700}}>FB</span>
                          {entry.facebook.success||(fbR?.done)?<span style={{fontSize:11,color:GREEN,fontWeight:700}}>Done</span>:
                            <button onClick={()=>doRetry(entry,"facebook")} disabled={fbR?.loading} style={{background:fbR?.loading?"rgba(255,255,255,0.08)":RED,color:WHITE,border:"none",borderRadius:4,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:fbR?.loading?"not-allowed":"pointer",opacity:fbR?.loading?0.5:1}}>{fbR?.loading?"...":"Publish"}</button>
                          }
                        </div>
                        <a href={entry.url} target="_blank" rel="noreferrer" style={{color:MUTED,fontSize:20,textDecoration:"none",display:"flex",alignItems:"center"}}>&#8599;</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {tab==="stats"&&(
          <div style={{paddingTop:20}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:14}}>Stats</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"Today",v:todayCount+"/8",s:"posts"},{l:"Total",v:String(postLog.length),s:"all time"},{l:"Success",v:postLog.length?Math.round(postLog.filter(p=>p.instagram.success||p.facebook.success).length/postLog.length*100)+"%":"--",s:"rate"},{l:"Manual",v:String(postLog.filter(p=>p.manualPost).length),s:"posts"}].map(s=>(
                <div key={s.l} style={{background:DARK,borderRadius:10,padding:"18px 16px",border:"1px solid "+BORDER}}>
                  <div style={{fontSize:9,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{s.l}</div>
                  <div style={{fontSize:30,fontWeight:900,lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:10,color:MUTED,marginTop:4}}>{s.s}</div>
                </div>
              ))}
            </div>
            <div style={{background:DARK,borderRadius:10,padding:"16px",border:"1px solid "+BORDER}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:12}}>Config</div>
              {[{k:"Source",v:"ppptv-v2.vercel.app"},{k:"Image",v:"1080x1350"},{k:"Cron",v:"Every 30 min"},{k:"Hours",v:"6am-11pm EAT"},{k:"Cap",v:"8/day"},{k:"AI",v:"Gemini 1.5 Flash"},{k:"Dedup",v:"Cloudflare KV"}].map(r=>(
                <div key={r.k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                  <span style={{fontSize:12,color:MUTED}}>{r.k}</span>
                  <span style={{fontSize:12,fontWeight:600}}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(20,20,20,0.97)",backdropFilter:"blur(20px)",borderTop:"1px solid "+BORDER,display:"flex",zIndex:200,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {([{id:"post" as const,icon:"+",label:"Post"},{id:"log" as const,icon:"=",label:"Feed"},{id:"stats" as const,icon:"o",label:"Stats"}]).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",padding:"12px 0 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:tab===t.id?RED:MUTED}}>
            <span style={{fontSize:22,lineHeight:1}}>{t.icon}</span>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{t.label}</span>
          </button>
        ))}
      </nav>
      {lightbox&&preview&&(
        <div onClick={()=>setLightbox(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,cursor:"zoom-out",padding:16}}>
          <img src={"data:image/jpeg;base64,"+preview.imageBase64} alt="Full" style={{maxWidth:"100%",maxHeight:"90dvh",borderRadius:8,objectFit:"contain"}}/>
        </div>
      )}
    </div>
  );
}