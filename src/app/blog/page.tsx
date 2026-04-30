import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllPosts } from '@/lib/blog/posts'

export const metadata: Metadata = {
  title: 'Blog — AI Edge',
  description: 'Notes on Brooks Price Action, microgap structure, and trading research.',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-text">Blog</h1>
        <p className="text-sm text-sub mt-1">
          Research notes from the AI Edge project.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-sm text-sub">No posts yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {posts.map((post) => (
            <li
              key={post.slug}
              className="border border-border rounded-[var(--radius)] bg-surface/40 p-4 hover:border-border-hover transition-colors"
            >
              <Link href={`/blog/${post.slug}`} className="block group">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold text-text group-hover:text-teal transition-colors">
                    {post.title}
                  </h2>
                  <time className="text-xs text-sub tabular-nums shrink-0" dateTime={post.date}>
                    {formatDate(post.date)}
                  </time>
                </div>
                {post.description && (
                  <p className="text-sm text-sub mt-2 leading-relaxed">{post.description}</p>
                )}
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] text-sub bg-bg px-2 py-0.5 rounded-full border border-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
