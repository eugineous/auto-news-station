"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Shell from "../shell";

// ── Constants ─────────────────────────────────────────────────────────────────
const BG = "#050505";
const SURFACE = "#0a0a0a";
const BORDER = "#111";
const RED = "#E50914";
const GREEN = "#4ade80";
const PINK = "#FF007A";
const PURPLE = "#a855f7";
const CYAN = "#22d3ee";
const YELLOW = "#facc15";
const ORANGE = "#f97316";

const CAT_COLORS: Record<string, string> = {
  CELEBRITY: "#FF007A", MUSIC: "#a855f7", "TV & FILM": "#3b82f6",
  SPORTS: "#22c55e", POLITICS: "#E50914", NEWS: "#E50914",
  FASHION: "#f97316", TECHNOLOGY: "#06b6d4", BUSINESS: "#eab308",
  COMEDY: "#f59e0b", INFLUENCERS: "#ec4899", "EAST AFRICA": "#10b981",
  GENERAL: "#555", ENTERTAINMENT: "#a855f7", MOVIES: "#3b82f6",
  LIFESTYLE: "#f43f5e", AWARDS: "#f59e0b", EVENTS: "#8b5cf6",
};

const CAT_HASHTAGS: Record<string, string> = {
  CELEBRITY: "#KenyaCelebrity #PPPTVKenya #NairobiCelebs #KenyaEntertainment",
  MUSIC: "#KenyaMusic #AfrobeatKenya #PPPTVKenya #MusicKE",
  "TV & FILM": "#KenyaTV #PPPTVKenya #AfricanFilm #KenyaMovies",
  SPORTS: "#KenyaSports #HarambeeStars #PPPTVKenya #SportKE",
  POLITICS: "#KenyaPolitics #PPPTVKenya #KenyaNews",
  GENERAL: "#Kenya #Nairobi #PPPTVKenya #KenyaNews #EastAfrica",
  ENTERTAINMENT: "#KenyaEntertainment #PPPTVKenya #NairobiLife",
  COMEDY: "#KenyaComedy #PPPTVKenya #Viral",
  NEWS: "#KenyaNews #PPPTVKenya #NairobiNews",
};

function catColor(cat: string) { return CAT_COLORS[cat?.toUpperCase()] || "#555"; }
function catHash(cat: string) { return CAT_HASHTAGS[cat?.toUpperCase()] || CAT_HASHTAGS.GENERAL; }
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}
function Spin({ size = 13 }: { size?: number }) {
  return <span style={{ display: "inline-block", width: size, height: size, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0 }} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScannerItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  sourceName: string;
  sourceType: string;
  category: string;
  publishedAt: string;
  directVideoUrl?: string;
  viralScore?: number;
  addedAt: number;
}

interface AirLogEntry {
  id: string;
  title: string;
  category: string;
  thumbnail?: string;
  ig_success: boolean;
  fb_success: boolean;
  posted_at: string;
  post_type?: string;
  url?: string;
}

interface EditBayState {
  url: string;
  headline: string;
  caption: string;
  category: string;
  thumbnail: string;
  resolvedVideoUrl: string;
  platform: string;
  fetching: boolean;
  generating: boolean;
  dupWarning: boolean;
}

type BroadcastStatus = "idle" | "broadcasting" | "success" | "error";

// ── Scanner Column ────────────────────────────────────────────────────────────
function ScannerColumn({
  items, onSelect, selectedId, agentMode,
}: {
  items: ScannerItem[];
  onSelect: (item: ScannerItem) => void;
  selectedId: string;
  agentMode: boolean;
}) {
  const sources = [
    { label: "TikTok", ok: items.some(i => i.sourceType === "direct-mp4") },
    { label: "YouTube", ok: items.some(i => i.sourceType === "youtube") },
    { label: "RSS", ok: items.some(i => i.sourceType === "rss-video") },
    { label: "Reddit", ok: items.some(i => i.sourceType === "reddit") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, height: "100%", overflow: "hidden", position: "relative" as const }}>
      {/* Source health dots */}
      <div style={{ display: "flex", gap: 6, padding: "10px 12px 8px", borderBottom: `1px solid ${BORDER}`, alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "#333", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, flex: 1 }}>Scanner</span>
        {sources.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.ok ? GREEN : "#333", display: "inline-block", boxShadow: s.ok ? `0 0 4px ${GREEN}` : "none" }} />
            <span style={{ fontSize: 8, color: s.ok ? "#444" : "#222" }}>{s.label}</span>
          </div>
        ))}
        <span style={{ fontSize: 9, color: "#333" }}>{items.length}</span>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: "6px 8px", display: "flex", flexDirection: "column" as const, gap: 4 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "40px 0", color: "#222", fontSize: 11 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>📡</div>
            Scanning sources…
          </div>
        ) : items.map(item => {
          const isSelected = item.id === selectedId;
          const cc = catColor(item.category);
          const score = item.viralScore || 0;
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              style={{
                background: isSelected ? cc + "11" : SURFACE,
                border: `1px solid ${isSelected ? cc + "66" : BORDER}`,
                borderRadius: 8, padding: "8px 10px", cursor: "pointer",
                transition: "all .15s", flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" style={{ width: 44, height: 55, objectFit: "cover" as const, borderRadius: 4, flexShrink: 0, background: "#111" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div style={{ width: 44, height: 55, borderRadius: 4, background: "#111", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎬</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
                    <span style={{ background: cc + "22", color: cc, fontSize: 7, fontWeight: 800, padding: "1px 5px", borderRadius: 3, textTransform: "uppercase" as const, letterSpacing: 1, flexShrink: 0 }}>{item.category}</span>
                    <span style={{ fontSize: 9, color: "#333", marginLeft: "auto", flexShrink: 0 }}>{ago(item.publishedAt)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: isSelected ? "#fff" : "#aaa", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{item.title}</div>
                  <div style={{ fontSize: 9, color: "#333", marginTop: 3 }}>{item.sourceName}</div>
                </div>
              </div>
              {/* Virality bar */}
              <div style={{ height: 2, background: "#111", borderRadius: 1, marginTop: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(score, 100)}%`, background: `linear-gradient(90deg, ${cc}, ${cc}88)`, borderRadius: 1 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Edit Bay (Center Column) ──────────────────────────────────────────────────
function EditBay({
  bay, setBay, broadcastStatus, broadcastPct, onBroadcast, agentMode, isBreaking, onManualFetch,
}: {
  bay: EditBayState;
  setBay: (patch: Partial<EditBayState>) => void;
  broadcastStatus: BroadcastStatus;
  broadcastPct: number;
  onBroadcast: () => void;
  agentMode: boolean;
  isBreaking: boolean;
  onManualFetch: (url: string) => void;
}) {
  const headlineRef = useRef<HTMLInputElement>(null);
  const [manualUrl, setManualUrl] = useState("");
  const canBroadcast = bay.url && bay.headline && bay.caption && broadcastStatus !== "broadcasting";
  const cc = catColor(bay.category);
  const ringColor = broadcastStatus === "error" ? "#f87171" : broadcastStatus === "success" ? GREEN : RED;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, height: "100%", alignItems: "center", padding: "12px 16px", gap: 10, overflow: "hidden" }}>

      {/* Manual URL input */}
      <div style={{ display: "flex", gap: 6, width: "100%", flexShrink: 0 }}>
        <input
          value={manualUrl}
          onChange={e => setManualUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && manualUrl.trim()) { onManualFetch(manualUrl.trim()); setManualUrl(""); } }}
          placeholder="Paste any URL — TikTok · YouTube · Instagram · Twitter · .mp4"
          style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 10px", color: "#aaa", fontSize: 10, outline: "none", fontFamily: "inherit", minWidth: 0 }}
        />
        <button
          onClick={() => { if (manualUrl.trim()) { onManualFetch(manualUrl.trim()); setManualUrl(""); } }}
          disabled={!manualUrl.trim() || bay.fetching}
          style={{ background: manualUrl.trim() && !bay.fetching ? PINK : "#111", border: "none", color: "#fff", borderRadius: 6, padding: "7px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
        >
          {bay.fetching ? <Spin size={10} /> : "Fetch"}
        </button>
      </div>

      {/* Category selector */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, justifyContent: "center", flexShrink: 0 }}>
        {["CELEBRITY","MUSIC","SPORTS","TV & FILM","ENTERTAINMENT","COMEDY","GENERAL"].map(c => (
          <button key={c} onClick={() => setBay({ category: c })}
            style={{ padding: "3px 8px", borderRadius: 20, fontSize: 9, fontWeight: 700, cursor: "pointer", border: `1px solid ${bay.category === c ? catColor(c) : BORDER}`, background: bay.category === c ? catColor(c) + "22" : "transparent", color: bay.category === c ? catColor(c) : "#444", transition: "all .15s", textTransform: "uppercase" as const, letterSpacing: 1 }}>
            {c}
          </button>
        ))}
      </div>

      {/* Phone frame */}
      <div style={{ position: "relative" as const, flexShrink: 0 }}>
        {/* Progress ring SVG */}
        {broadcastStatus !== "idle" && (
          <svg style={{ position: "absolute" as const, inset: -6, width: "calc(100% + 12px)", height: "calc(100% + 12px)", zIndex: 10, pointerEvents: "none" }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="1" y="1" width="98" height="98" rx="14" ry="14" fill="none" stroke={ringColor + "33"} strokeWidth="1.5" />
            <rect x="1" y="1" width="98" height="98" rx="14" ry="14" fill="none" stroke={ringColor} strokeWidth="1.5"
              strokeDasharray={`${broadcastPct} 100`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray .4s ease", transformOrigin: "50% 50%", transform: "rotate(-90deg)" }} />
          </svg>
        )}

        {/* Phone shell */}
        <div style={{
          width: 200, height: 355, borderRadius: 20, background: "#000", border: `2px solid ${broadcastStatus === "success" ? GREEN : broadcastStatus === "error" ? "#f87171" : "#1a1a1a"}`,
          overflow: "hidden", position: "relative" as const,
          boxShadow: broadcastStatus === "success" ? `0 0 30px ${GREEN}44` : broadcastStatus === "error" ? "0 0 30px #f8717144" : "0 0 20px rgba(0,0,0,.8)",
          transition: "border-color .3s, box-shadow .3s",
        }}>
          {/* CRT scanlines */}
          <div style={{ position: "absolute" as const, inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,.08) 2px, rgba(0,0,0,.08) 4px)", pointerEvents: "none", zIndex: 5 }} />

          {/* Video / thumbnail */}
          {bay.resolvedVideoUrl ? (
            <video src={`/api/proxy-video?url=${encodeURIComponent(bay.resolvedVideoUrl)}`}
              autoPlay muted loop playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" as const, display: "block" }}
              onError={() => {}} />
          ) : bay.thumbnail ? (
            <img src={bay.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const, display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#222", fontSize: 28 }}>
              {bay.fetching ? <Spin size={24} /> : "📺"}
            </div>
          )}

          {/* Headline chyron overlay */}
          {bay.headline && (
            <div style={{ position: "absolute" as const, bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,.9) 40%)", padding: "20px 10px 10px", zIndex: 6 }}>
              <div style={{ background: isBreaking ? RED : cc, height: 2, marginBottom: 4, borderRadius: 1 }} />
              {isBreaking && <div style={{ fontSize: 7, fontWeight: 800, color: "#fff", letterSpacing: 2, marginBottom: 2 }}>🚨 BREAKING</div>}
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: "#fff", lineHeight: 1.1, letterSpacing: 0.5, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>
                {bay.headline.slice(0, 60)}{bay.headline.length > 60 ? "…" : ""}
              </div>
            </div>
          )}

          {/* Agent live overlay */}
          {agentMode && (
            <div style={{ position: "absolute" as const, inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 8, backdropFilter: "blur(2px)" }}>
              <div style={{ textAlign: "center" as const }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: GREEN, letterSpacing: 3, animation: "pulse 2s infinite" }}>AGENT LIVE</div>
                <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>Agent is selecting & broadcasting</div>
              </div>
            </div>
          )}

          {/* Success flash */}
          {broadcastStatus === "success" && (
            <div style={{ position: "absolute" as const, inset: 0, background: GREEN + "22", zIndex: 9, animation: "flash .5s ease" }} />
          )}
        </div>
      </div>

      {/* Headline input */}
      <input
        ref={headlineRef}
        value={bay.headline}
        onChange={e => setBay({ headline: e.target.value.toUpperCase() })}
        placeholder="HEADLINE — TYPES AS CHYRON ABOVE"
        maxLength={120}
        style={{ width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 11, outline: "none", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, textTransform: "uppercase" as const, boxSizing: "border-box" as const, flexShrink: 0 }}
      />

      {/* Caption */}
      <textarea
        value={bay.caption}
        onChange={e => setBay({ caption: e.target.value })}
        placeholder={bay.generating ? "Generating caption…" : "Caption — AI generates automatically when video loads"}
        rows={4}
        style={{ width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px", color: "#aaa", fontSize: 11, outline: "none", resize: "none" as const, fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" as const, flexShrink: 0, opacity: bay.generating ? 0.5 : 1 }}
      />

      {/* BROADCAST button */}
      <button
        onClick={onBroadcast}
        disabled={!canBroadcast}
        style={{
          width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 900, letterSpacing: 3,
          textTransform: "uppercase" as const, color: "#fff", border: "none", borderRadius: 8, cursor: canBroadcast ? "pointer" : "not-allowed",
          background: !canBroadcast ? "#111" : isBreaking ? `linear-gradient(135deg, ${RED}, #a00)` : `linear-gradient(135deg, ${RED}, #c00)`,
          boxShadow: canBroadcast ? `0 4px 24px ${RED}55` : "none",
          transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0,
          opacity: canBroadcast ? 1 : 0.4,
        }}
      >
        {broadcastStatus === "broadcasting" ? <><Spin />Broadcasting… {broadcastPct}%</> : broadcastStatus === "success" ? "✓ Broadcast Complete" : broadcastStatus === "error" ? "✗ Failed — Retry" : isBreaking ? "🚨 BROADCAST BREAKING" : "BROADCAST"}
      </button>

      {/* Status line */}
      {bay.fetching && <div style={{ fontSize: 10, color: "#444", flexShrink: 0 }}><Spin size={10} /> Fetching metadata…</div>}
      {bay.generating && <div style={{ fontSize: 10, color: "#444", flexShrink: 0 }}><Spin size={10} /> Generating caption…</div>}
      {bay.dupWarning && <div style={{ fontSize: 10, color: ORANGE, flexShrink: 0 }}>⚠ This URL may have already been posted</div>}
    </div>
  );
}

// ── Air Log (Right Column) ────────────────────────────────────────────────────
function AirLog({ entries, onRetry }: { entries: AirLogEntry[]; onRetry: (id: string) => void }) {
  const today = entries.filter(e => new Date(e.posted_at).toDateString() === new Date().toDateString());
  const todayOk = today.filter(e => e.ig_success || e.fb_success).length;
  const todayFail = today.filter(e => !e.ig_success && !e.fb_success).length;
  const agentPosts = today.filter(e => e.post_type === "auto").length;
  const manualPosts = today.length - agentPosts;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, height: "100%", overflow: "hidden" }}>
      {/* Today's numbers */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: "#333", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 8 }}>Air Log</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
          {[
            { label: "Today", value: today.length, color: "#fff" },
            { label: "Live", value: todayOk, color: GREEN },
            { label: "Failed", value: todayFail, color: todayFail > 0 ? "#f87171" : "#333" },
            { label: "Agent", value: agentPosts, color: CYAN },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" as const }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 8, color: "#333", letterSpacing: 1, textTransform: "uppercase" as const }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: "6px 8px", display: "flex", flexDirection: "column" as const, gap: 3 }}>
        {entries.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "40px 0", color: "#222", fontSize: 11 }}>No broadcasts yet</div>
        ) : entries.map(e => {
          const cc = catColor(e.category);
          const ok = e.ig_success || e.fb_success;
          return (
            <div key={e.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", background: SURFACE, borderRadius: 6, border: `1px solid ${ok ? BORDER : "#2a1010"}`, flexShrink: 0 }}>
              {e.thumbnail ? (
                <img src={e.thumbnail} alt="" style={{ width: 28, height: 35, objectFit: "cover" as const, borderRadius: 3, flexShrink: 0 }}
                  onError={ev => { (ev.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div style={{ width: 28, height: 35, borderRadius: 3, background: cc + "22", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cc, display: "inline-block" }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: ok ? "#ccc" : "#f87171", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.title}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                  <span style={{ fontSize: 8, color: e.ig_success ? GREEN : "#f87171" }}>IG {e.ig_success ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 8, color: e.fb_success ? GREEN : "#f87171" }}>FB {e.fb_success ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 8, color: "#333", marginLeft: "auto" }}>{ago(e.posted_at)}</span>
                </div>
              </div>
              {!ok && (
                <button onClick={() => onRetry(e.id)} style={{ background: "#f8717122", border: "1px solid #f8717144", color: "#f87171", borderRadius: 4, padding: "2px 6px", fontSize: 8, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  Retry
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Filmstrip (bottom queue) ──────────────────────────────────────────────────
function Filmstrip({
  items, onSelect, onRemove,
}: {
  items: ScannerItem[];
  onSelect: (item: ScannerItem) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, padding: "6px 12px", overflowX: "auto" as const, background: "#030303", borderTop: `1px solid ${BORDER}`, flexShrink: 0, alignItems: "center" }}>
      <span style={{ fontSize: 8, color: "#333", letterSpacing: 2, textTransform: "uppercase" as const, flexShrink: 0 }}>Queue</span>
      {items.map((item, i) => {
        const cc = catColor(item.category);
        return (
          <div key={item.id} style={{ position: "relative" as const, flexShrink: 0, cursor: "pointer" }} onClick={() => onSelect(item)}>
            <div style={{ width: 36, height: 45, borderRadius: 4, overflow: "hidden", border: `1px solid ${cc}44`, background: "#111" }}>
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} />
              ) : (
                <div style={{ width: "100%", height: "100%", background: cc + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>🎬</div>
              )}
            </div>
            <div style={{ position: "absolute" as const, top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", background: "#333", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 7, color: "#888" }}
              onClick={ev => { ev.stopPropagation(); onRemove(item.id); }}>✕</div>
            <div style={{ fontSize: 7, color: "#333", textAlign: "center" as const, marginTop: 2 }}>#{i + 1}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main War Room ─────────────────────────────────────────────────────────────
export default function ComposerPage() {
  const [scannerItems, setScannerItems] = useState<ScannerItem[]>([]);
  const [airLog, setAirLog] = useState<AirLogEntry[]>([]);
  const [queue, setQueue] = useState<ScannerItem[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const [isBreaking, setIsBreaking] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatus>("idle");
  const [broadcastPct, setBroadcastPct] = useState(0);
  const [bay, setBayState] = useState<EditBayState>({
    url: "", headline: "", caption: "", category: "GENERAL",
    thumbnail: "", resolvedVideoUrl: "", platform: "",
    fetching: false, generating: false, dupWarning: false,
  });

  const setBay = useCallback((patch: Partial<EditBayState>) => {
    setBayState(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Load air log ────────────────────────────────────────────────────────────
  const loadAirLog = useCallback(async () => {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) {
        const d = await r.json() as any;
        const entries = (d.log || [])
          .map((p: any) => ({
            id: p.article_id || p.articleId || String(Math.random()),
            title: p.title || "",
            category: p.category || "GENERAL",
            thumbnail: p.thumbnail,
            ig_success: p.ig_success ?? p.instagram?.success ?? false,
            fb_success: p.fb_success ?? p.facebook?.success ?? false,
            posted_at: p.posted_at || p.postedAt || new Date().toISOString(),
            post_type: p.post_type || p.postType,
            url: p.url,
          }))
          .sort((a: AirLogEntry, b: AirLogEntry) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
        setAirLog(entries);
      }
    } catch {}
  }, []);

  // ── Scan for videos ─────────────────────────────────────────────────────────
  const scanSources = useCallback(async () => {
    try {
      const r = await fetch("/api/automate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Dry-Run": "true" },
      });
      if (r.ok) {
        const d = await r.json() as any;
        const videos: ScannerItem[] = (d.videos || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          url: v.url,
          thumbnail: v.thumbnail || "",
          sourceName: v.sourceName || "",
          sourceType: v.sourceType || "",
          category: v.category || "GENERAL",
          publishedAt: v.publishedAt || new Date().toISOString(),
          directVideoUrl: v.directVideoUrl,
          viralScore: Math.floor(Math.random() * 80) + 20,
          addedAt: Date.now(),
        }));
        setScannerItems(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const newItems = videos.filter(v => !existingIds.has(v.id));
          return [...newItems, ...prev].slice(0, 50);
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadAirLog();
    scanSources();
    const logTimer = setInterval(loadAirLog, 20000);
    const scanTimer = setInterval(scanSources, 3 * 60 * 1000);
    return () => { clearInterval(logTimer); clearInterval(scanTimer); };
  }, [loadAirLog, scanSources]);

  // ── Select a scanner card → load into Edit Bay ──────────────────────────────
  const selectItem = useCallback(async (item: ScannerItem) => {
    setBay({ url: item.url, headline: item.title.toUpperCase().slice(0, 120), caption: "", category: item.category, thumbnail: item.thumbnail, resolvedVideoUrl: item.directVideoUrl || "", platform: item.sourceType, fetching: true, generating: true, dupWarning: false });
    setBroadcastStatus("idle");
    setBroadcastPct(0);

    try {
      const [previewRes, resolveRes] = await Promise.all([
        fetch("/api/preview-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: item.url }) }),
        item.directVideoUrl ? Promise.resolve(null) : fetch("/api/resolve-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: item.url }) }),
      ]);

      const preview = previewRes.ok ? await previewRes.json() as any : null;
      const resolve = resolveRes?.ok ? await resolveRes.json() as any : null;

      const thumb = preview?.scraped?.videoThumbnailUrl || preview?.scraped?.imageUrl || item.thumbnail;
      const headline = preview?.ai?.clickbaitTitle?.toUpperCase().slice(0, 120) || item.title.toUpperCase().slice(0, 120);
      const caption = preview?.ai?.caption || "";
      const resolvedUrl = resolve?.videoUrl || item.directVideoUrl || "";

      setBay({ headline, caption, thumbnail: thumb, resolvedVideoUrl: resolvedUrl, fetching: false, generating: false });
    } catch {
      setBay({ fetching: false, generating: false });
    }
  }, [setBay]);

  // ── Manual URL fetch → load into Edit Bay ──────────────────────────────────
  const manualFetch = useCallback(async (url: string) => {
    if (!url.trim()) return;
    setBay({ url, headline: "", caption: "", thumbnail: "", resolvedVideoUrl: "", fetching: true, generating: true, dupWarning: false });
    setBroadcastStatus("idle");
    setBroadcastPct(0);
    try {
      const [previewRes, resolveRes] = await Promise.all([
        fetch("/api/preview-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }),
        fetch("/api/resolve-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }),
      ]);
      const preview = previewRes.ok ? await previewRes.json() as any : null;
      const resolve = resolveRes.ok ? await resolveRes.json() as any : null;
      const thumb = preview?.scraped?.videoThumbnailUrl || preview?.scraped?.imageUrl || "";
      const headline = preview?.ai?.clickbaitTitle?.toUpperCase().slice(0, 120) || preview?.scraped?.title?.toUpperCase().slice(0, 120) || "";
      const caption = preview?.ai?.caption || "";
      const category = preview?.category || "GENERAL";
      const resolvedUrl = resolve?.videoUrl || "";
      setBay({ headline, caption, thumbnail: thumb, resolvedVideoUrl: resolvedUrl, category, fetching: false, generating: false });
    } catch {
      setBay({ fetching: false, generating: false });
    }
  }, [setBay]);

  // ── Broadcast ───────────────────────────────────────────────────────────────
  const broadcast = useCallback(async () => {
    if (!bay.url || !bay.headline || !bay.caption || broadcastStatus === "broadcasting") return;
    setBroadcastStatus("broadcasting");
    setBroadcastPct(5);

    const finalCaption = (isBreaking ? "🚨 BREAKING: " : "") + bay.caption + "\n\n" + catHash(bay.category);

    try {
      const resp = await fetch("/api/post-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: bay.url, headline: bay.headline, caption: finalCaption, category: bay.category }),
      });

      if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            setBroadcastPct(evt.pct || 0);
            if (evt.done) {
              setBroadcastStatus(evt.success ? "success" : "error");
              if (evt.success) {
                await loadAirLog();
                // Load next queued item after 2s
                setTimeout(() => {
                  setBroadcastStatus("idle");
                  setBroadcastPct(0);
                  if (queue.length > 0) {
                    const next = queue[0];
                    setQueue(q => q.slice(1));
                    selectItem(next);
                  } else {
                    setBay({ url: "", headline: "", caption: "", thumbnail: "", resolvedVideoUrl: "" });
                  }
                }, 2000);
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setBroadcastStatus("error");
    }
  }, [bay, broadcastStatus, isBreaking, queue, loadAirLog, selectItem, setBay]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); broadcast(); }
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); broadcast(); }
      if (e.key === " ") { e.preventDefault(); /* play/pause handled by video */ }
      if (e.shiftKey && e.key === "B") { e.preventDefault(); setIsBreaking(b => !b); }
      if (e.key === "Escape") { setBay({ url: "", headline: "", caption: "", thumbnail: "", resolvedVideoUrl: "" }); setBroadcastStatus("idle"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [broadcast, setBay]);

  const handleRetry = useCallback(async (id: string) => {
    const entry = airLog.find(e => e.id === id);
    if (!entry?.url) return;
    await fetch("/api/retry-post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: id, title: entry.title, caption: entry.title, articleUrl: entry.url, category: entry.category, platform: "instagram" }) });
    await loadAirLog();
  }, [airLog, loadAirLog]);

  const addToQueue = useCallback((item: ScannerItem) => {
    setQueue(q => q.some(i => i.id === item.id) ? q : [...q, item]);
  }, []);

  return (
    <Shell>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        @keyframes flash { 0% { opacity:.8 } 100% { opacity:0 } }
        ::-webkit-scrollbar { width: 3px; height: 3px }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 2px }
        * { box-sizing: border-box }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column" as const, height: "calc(100vh - 56px)", background: BG, overflow: "hidden" }}>

        {/* ── Top bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, background: "#030303" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: RED, animation: "pulse 2s infinite", boxShadow: `0 0 8px ${RED}` }} />
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 3, color: "#fff" }}>BROADCAST WAR ROOM</span>
          </div>

          {/* Agent toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            {isBreaking && (
              <div style={{ background: RED + "22", border: `1px solid ${RED}44`, borderRadius: 20, padding: "3px 10px", fontSize: 9, fontWeight: 800, color: RED, letterSpacing: 2, animation: "pulse 1s infinite" }}>
                🚨 BREAKING MODE
              </div>
            )}
            <span style={{ fontSize: 10, color: "#444" }}>Shift+B = Breaking · Enter = Broadcast · Esc = Clear</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: agentMode ? GREEN + "11" : "#0a0a0a", border: `1px solid ${agentMode ? GREEN + "44" : BORDER}`, borderRadius: 20, padding: "4px 12px" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: agentMode ? GREEN : "#444", textTransform: "uppercase" as const, letterSpacing: 1 }}>Agent</span>
              <button onClick={() => setAgentMode(m => !m)} style={{ width: 36, height: 18, borderRadius: 10, background: agentMode ? GREEN : "#222", border: "none", position: "relative" as const, cursor: "pointer", transition: "all .2s", flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 2, left: agentMode ? 20 : 2, transition: "all .2s" }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Three columns ── */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "260px 1fr 260px", overflow: "hidden", minHeight: 0 }}>

          {/* Left: Scanner */}
          <div style={{ borderRight: `1px solid ${BORDER}`, overflow: "hidden" }}>
            <ScannerColumn items={scannerItems} onSelect={selectItem} selectedId={bay.url} agentMode={agentMode} />
          </div>

          {/* Center: Edit Bay */}
          <div style={{ overflow: "hidden", background: "#030303" }}>
            <EditBay bay={bay} setBay={setBay} broadcastStatus={broadcastStatus} broadcastPct={broadcastPct} onBroadcast={broadcast} agentMode={agentMode} isBreaking={isBreaking} onManualFetch={manualFetch} />
          </div>

          {/* Right: Air Log */}
          <div style={{ borderLeft: `1px solid ${BORDER}`, overflow: "hidden" }}>
            <AirLog entries={airLog} onRetry={handleRetry} />
          </div>
        </div>

        {/* ── Filmstrip queue ── */}
        <Filmstrip items={queue} onSelect={item => { setQueue(q => q.filter(i => i.id !== item.id)); selectItem(item); }} onRemove={id => setQueue(q => q.filter(i => i.id !== id))} />
      </div>
    </Shell>
  );
}
