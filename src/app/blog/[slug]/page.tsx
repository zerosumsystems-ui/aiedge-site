import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PostBody } from '@/components/blog/PostBody'
import { getAllPosts, getPostBySlug } from '@/lib/blog/posts'

type Params = { slug: string }

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Not found — AI Edge' }
  return {
    title: `${post.title} — AI Edge`,
    description: post.description,
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  return (
    <article className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/blog"
        className="text-xs text-sub hover:text-text inline-flex items-center gap-1 mb-6"
      >
        ← Blog
      </Link>

      <header className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-semibold text-text">{post.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-xs text-sub">
          <time dateTime={post.date} className="tabular-nums">
            {formatDate(post.date)}
          </time>
          {post.tags && post.tags.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <div className="flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] bg-bg px-2 py-0.5 rounded-full border border-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      <PostBody content={post.content} />
    </article>
  )
}
