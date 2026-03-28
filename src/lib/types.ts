export interface Article {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  summary: string;
  fullBody: string;
  sourceName: string;
  publishedAt: Date;
  category: string;
  tags?: string[];
  videoUrl?: string; // direct video URL if article has video
  isVideo?: boolean; // flag for video articles
}

export interface SocialPost {
  platform: Platform;
  caption: string;
  imageUrl?: string;
  articleUrl: string;
  firstComment?: string; // posted as first comment after publish — keeps caption clean
}

export type Platform = "instagram" | "facebook";

export interface PlatformResult {
  success: boolean;
  postId?: string;
  error?: string;
}

export interface PublishResult {
  instagram: PlatformResult;
  facebook: PlatformResult;
}

export interface SchedulerResponse {
  posted: number;
  skipped: number;
  errors: Array<{ articleId: string; message: string }>;
}

export interface VideoPost {
  stagedVideoUrl: string; // R2 public URL
  stagedKey: string; // R2 key for cleanup
  coverImageUrl?: string; // branded thumbnail URL (optional)
  caption: string;
  category: string;
}
