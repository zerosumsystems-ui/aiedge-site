import type { Metadata } from 'next'
import Link from 'next/link'
import {
  WISDOM_SECTIONS,
  WISDOM_SNIPPET_COUNT,
  type WisdomKind,
} from '@/lib/brooks-wisdom'

export const metadata: Metadata = {
  title: 'Brooks Wisdom — AI Edge',
  description:
    'Hardcoded reference of Al Brooks hallmarks, guidelines, and principles, quoted verbatim from the Brooks book corpus.',
}

const KIND_TONE: Record<WisdomKind, string> = {
  hallmark: 'bg-teal/15 text-teal border-teal/40',
  guideline: 'bg-yellow/15 text-yellow border-yellow/40',
  principle: 'bg-sub/15 text-sub border-sub/40',
}

const KIND_LABEL: Record<WisdomKind, string> = {
  hallmark: 'Hallmark',
  guideline: 'Guideline',
  principle: 'Principle',
}

export default function BrooksWisdomPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-text">Brooks Wisdom</h1>
        <p className="text-sm text-sub mt-1">
          {WISDOM_SNIPPET_COUNT} hallmarks, guidelines, and principles, each
          quoted verbatim from the Al Brooks book corpus. Nothing here is
          paraphrased — every line cites the book and figure it came from.
        </p>
        <p className="text-xs text-sub mt-2">
          <Link href="/brooks" className="text-teal hover:underline">
            ← Brooks Tour
          </Link>
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2 text-[11px]">
        {(['hallmark', 'guideline', 'principle'] as WisdomKind[]).map((k) => (
          <span
            key={k}
            className={`rounded border px-2 py-0.5 font-semibold ${KIND_TONE[k]}`}
          >
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
        {WISDOM_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="hover:text-text">
            {s.title}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        {WISDOM_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-20">
            <h2 className="text-base font-semibold text-text">
              {section.title}
            </h2>
            <p className="text-xs text-sub mt-0.5 mb-3">{section.blurb}</p>
            <ul className="space-y-3">
              {section.snippets.map((snip) => (
                <li
                  key={snip.id}
                  className="rounded border border-border bg-surface p-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        KIND_TONE[snip.kind]
                      }`}
                    >
                      {KIND_LABEL[snip.kind]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-text/90">
                        “{snip.text}”
                      </p>
                      <p className="mt-1.5 text-[11px] text-sub">
                        {snip.source.book}
                        {snip.source.figure ? ` · ${snip.source.figure}` : ''}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-sub">
        Quoted from primary-source Brooks book material — the Brooks Tour
        narrations and the trader&apos;s-equation blog quotes. Verbatim
        passages, attributed to their source figure.
      </footer>
    </div>
  )
}
