"use client"

interface ScoreBarProps {
  label: string        // "URG" or "UNC"
  value: number        // 0-10
  variant: "urgency" | "uncertainty"
}

export function ScoreBar({ label, value, variant }: ScoreBarProps) {
  const pct = Math.min(100, Math.max(0, value * 10))
  const barColor = variant === "urgency" ? "bg-teal" : "bg-red"
  const textColor = variant === "urgency" ? "text-teal" : "text-red"

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <span className="text-[11px] text-sub w-6 text-right">{label}</span>
      <div className="w-12 sm:w-20 h-[5px] bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-7 text-right ${textColor}`}>
        {value.toFixed(1)}
      </span>
    </div>
  )
}
