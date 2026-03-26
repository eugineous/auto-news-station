export type Platform = "instagram" | "facebook";

export const categoryColors: Record<string, string> = {
  CELEBRITY: "#FF007A",
  POLITICS: "#FF007A",
  NEWS: "#FF007A",
  FASHION: "#ec4899",
  MUSIC: "#a855f7",
  ENTERTAINMENT: "#a855f7",
  "TV & FILM": "#f59e0b",
  MOVIES: "#f59e0b",
  LIFESTYLE: "#14b8a6",
  HEALTH: "#10b981",
  EVENTS: "#10b981",
  "EAST AFRICA": "#06b6d4",
  TECHNOLOGY: "#06b6d4",
  COMEDY: "#eab308",
  AWARDS: "#eab308",
  INFLUENCERS: "#f97316",
  SPORTS: "#3b82f6",
  SCIENCE: "#3b82f6",
  BUSINESS: "#FFD700",
  GENERAL: "#E50914",
};

export interface CockpitPost {
  id: string;
  title: string;
  category: string;
  platforms: Platform[];
  status: "scheduled" | "sent" | "failed";
  eta?: string;
  postedAt?: string;
  failures?: { platform: Platform; reason: string }[];
  image?: string;
}

export interface FeedItem {
  id: string;
  title: string;
  category: string;
  source: string;
  age: string;
  image?: string;
}

export const mockPosts: CockpitPost[] = [
  {
    id: "p1",
    title: "SIFUNA FACTION PLANS MOMBASA RALLY AMID ODM TENSIONS",
    category: "POLITICS",
    platforms: ["instagram", "facebook"],
    status: "sent",
    postedAt: "2m ago",
    image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600",
  },
  {
    id: "p2",
    title: "JIM CARREY'S SONIC 4 RETURN MAKES PERFECT SENSE",
    category: "MOVIES",
    platforms: ["instagram", "facebook"],
    status: "scheduled",
    eta: "7m",
    image: "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?w=600",
  },
  {
    id: "p3",
    title: "WHAT'S UP: APRIL 2026 SKYWATCHING TIPS FROM NASA",
    category: "SCIENCE",
    platforms: ["instagram"],
    status: "failed",
    eta: "retrying",
    failures: [{ platform: "instagram", reason: "Image blocked by IG" }],
  },
];

export const mockFeed: FeedItem[] = [
  {
    id: "f1",
    title: "Diamond Platnumz Drops Surprise Collab Tonight",
    category: "MUSIC",
    source: "PPP TV Feed",
    age: "12m",
  },
  {
    id: "f2",
    title: "Safaricom, KCB, Equity eye new fintech rules",
    category: "BUSINESS",
    source: "BusinessDaily",
    age: "28m",
  },
  {
    id: "f3",
    title: "Gor Mahia seal late winner in FKF Premier League",
    category: "SPORTS",
    source: "PPP TV Feed",
    age: "41m",
  },
];

export const heartbeat = {
  lastRun: "1m ago",
  nextRun: "8m",
  paused: false,
  lastError: "",
};

export const stats = {
  today: 14,
  successes: 13,
  failures: 1,
  ig: 14,
  fb: 12,
};
