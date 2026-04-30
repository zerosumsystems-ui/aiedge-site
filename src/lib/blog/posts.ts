import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

export type Post = {
  slug: string
  title: string
  date: string
  description?: string
  tags?: string[]
  content: string
}

const POSTS_DIR = join(process.cwd(), 'src', 'content', 'blog')

function readPost(filename: string): Post {
  const slug = filename.replace(/\.md$/, '')
  const raw = readFileSync(join(POSTS_DIR, filename), 'utf8')
  const { data, content } = matter(raw)

  if (!data.title) throw new Error(`blog post ${filename} is missing 'title'`)
  if (!data.date) throw new Error(`blog post ${filename} is missing 'date'`)

  const date =
    data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date)

  return {
    slug,
    title: String(data.title),
    date,
    description: data.description ? String(data.description) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
    content,
  }
}

export function getAllPosts(): Post[] {
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  const posts: Post[] = []
  for (const file of files) {
    const raw = readFileSync(join(POSTS_DIR, file), 'utf8')
    const { data } = matter(raw)
    if (data.draft === true) continue
    posts.push(readPost(file))
  }
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostBySlug(slug: string): Post | null {
  try {
    return readPost(`${slug}.md`)
  } catch {
    return null
  }
}
