import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { notFound } from "next/navigation";
import { getLocalNews, getNewsBySlug } from "@/lib/news";
import { formatDate } from "@/lib/utils";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { SectionHeading } from "@/components/SectionHeading";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getLocalNews().map((item) => ({ slug: item.slug }));
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getNewsBySlug(slug);
  if (!article) return notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow={article.category}
        title={article.title}
        description={`${formatDate(article.publishedAt)} | ${article.author}`}
      />
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <ImageWithFallback
          src={article.image}
          alt={article.title}
          className="h-80 w-full object-cover"
        />
        <article className="prose prose-invert max-w-none p-6 prose-headings:text-white prose-p:text-white/80 prose-a:text-cyan-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
