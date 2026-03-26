export type SocialLinks = Partial<{
  instagram: string;
  tiktok: string;
  youtube: string;
  x: string;
  facebook: string;
}>;

export type NewsItem = {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  tags: string[];
  category: string;
  author: string;
  sourceUrl?: string;
  publishedAt: string;
  featured?: boolean;
  body: string;
};

export type Show = {
  slug: string;
  title: string;
  description: string;
  schedule: string;
  image: string;
  hosts: string[];
  tags: string[];
  clips: string[];
};

export type Host = {
  slug: string;
  name: string;
  role: string;
  bio: string;
  image: string;
  socials: SocialLinks;
  shows: string[];
};

export type Artist = {
  slug: string;
  name: string;
  genre: string;
  bio: string;
  image: string;
  socials: SocialLinks;
  videos: string[];
};

export type Project = {
  slug: string;
  title: string;
  description: string;
  image: string;
  link: string;
  sponsor?: boolean;
};
