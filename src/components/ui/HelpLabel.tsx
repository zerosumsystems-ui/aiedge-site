"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Click-to-explain label. Wraps a string of text in a subtly-underlined
 * trigger; clicking opens a small popover below with a title + body.
 * Used for scanner column headers, setup-banner metrics, etc. — places
 * where the label is terse and a reader benefits from a 1-2 sentence
 * explanation without bloating the surface.
 *
 * Mobile-friendly: the popover positions absolutely under the trigger
 * with a capped width and clamped overflow. An outside click closes it.
 */
export function HelpLabel({
  label,
  title,
  body,
  className = "",
}: {
  label: React.ReactNode
  title: string
  body: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (e.target instanceof Node && ref.current.contains(e.target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="cursor-help underline decoration-dotted decoration-sub/60 underline-offset-2 hover:decoration-text/80"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {label}
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute left-0 top-full z-50 mt-1 block min-w-[220px] max-w-[300px] rounded-md border border-border bg-bg p-3 text-xs font-normal normal-case tracking-normal shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block font-semibold text-text">{title}</span>
          <span className="mt-1 block leading-relaxed text-sub">{body}</span>
        </span>
      )}
    </span>
  )
}
