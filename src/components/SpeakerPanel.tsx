import { useState } from 'react'
import type { Speaker } from '../types'

const PRESET_COLORS = [
  '#a78bfa', // violet
  '#34d399', // emerald
  '#f87171', // red
  '#60a5fa', // blue
  '#fbbf24', // amber
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#a3e635', // lime
  '#fb923c', // orange
  '#c084fc', // purple
]

type Props = {
  speakers: Speaker[]
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onColorChange: (id: string, color: string) => void
  onRemove: (id: string) => void
  segmentCountBySpeaker: Record<string, number>
}

export function SpeakerPanel({ speakers, onAdd, onRename, onColorChange, onRemove, segmentCountBySpeaker }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (speaker: Speaker) => {
    setEditingId(speaker.id)
    setEditValue(speaker.name)
  }

  const commitEdit = (id: string) => {
    const trimmed = editValue.trim()
    if (trimmed) onRename(id, trimmed)
    setEditingId(null)
  }

  return (
    <div className="w-64 shrink-0 flex flex-col bg-zinc-900 border-l border-zinc-800 h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Speakers</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {speakers.map((speaker) => (
          <div
            key={speaker.id}
            className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-3 group"
          >
            <div className="flex items-center gap-2">
              {/* Color dot / color picker trigger */}
              <div className="relative shrink-0">
                <div
                  className="w-4 h-4 rounded-full cursor-pointer ring-2 ring-transparent hover:ring-zinc-500 transition-all"
                  style={{ backgroundColor: speaker.color }}
                  title="Change color"
                  onClick={() => {
                    const input = document.getElementById(`color-${speaker.id}`) as HTMLInputElement
                    input?.click()
                  }}
                />
                <input
                  id={`color-${speaker.id}`}
                  type="color"
                  value={speaker.color}
                  onChange={(e) => onColorChange(speaker.id, e.target.value)}
                  className="absolute inset-0 opacity-0 w-0 h-0 pointer-events-none"
                />
              </div>

              {/* Name */}
              {editingId === speaker.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(speaker.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(speaker.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="flex-1 bg-zinc-700 rounded px-2 py-0.5 text-sm text-white outline-none border border-violet-500"
                />
              ) : (
                <span
                  className="flex-1 text-sm text-zinc-200 cursor-pointer hover:text-white truncate"
                  onDoubleClick={() => startEdit(speaker)}
                  title="Double-click to rename"
                >
                  {speaker.name}
                </span>
              )}

              {/* Count badge */}
              <span className="text-xs text-zinc-500 shrink-0">
                {segmentCountBySpeaker[speaker.id] ?? 0}
              </span>
            </div>

            {/* Color swatches */}
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange(speaker.id, color)}
                  className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${speaker.color === color ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-800' : ''}`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* Actions row */}
            <div className="mt-2 flex gap-1">
              <button
                onClick={() => startEdit(speaker)}
                className="flex-1 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Rename
              </button>
              {speakers.length > 1 && (
                <button
                  onClick={() => onRemove(speaker.id)}
                  className="flex-1 py-0.5 rounded text-xs text-zinc-600 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-zinc-800 text-xs text-zinc-600 space-y-1">
        <p>Double-click a name to rename.</p>
        <p>Press <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">1–9</kbd> to assign speaker to selected segment.</p>
      </div>
    </div>
  )
}

// Inline speaker badge / dropdown used in segment rows
type BadgeProps = {
  speaker: Speaker
  speakers: Speaker[]
  isManual?: boolean
  onAssign: (speakerId: string) => void
}

export function SpeakerBadge({ speaker, speakers, isManual = false, onAssign }: BadgeProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-all hover:opacity-90"
        style={{
          backgroundColor: isManual ? `${speaker.color}28` : `${speaker.color}12`,
          color: isManual ? speaker.color : `${speaker.color}99`,
          border: `1px solid ${isManual ? `${speaker.color}55` : `${speaker.color}25`}`,
        }}
        title={isManual ? 'Manually assigned — click to change' : 'Auto-assigned — click to manually assign'}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: isManual ? speaker.color : `${speaker.color}66` }}
        />
        <span className="max-w-[80px] truncate">{speaker.name}</span>
        {isManual && (
          <svg className="w-2.5 h-2.5 opacity-70 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
          </svg>
        )}
        <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]">
            {speakers.map((s) => (
              <button
                key={s.id}
                onClick={(e) => { e.stopPropagation(); onAssign(s.id); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-700 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-zinc-200 truncate">{s.name}</span>
                {s.id === speaker.id && (
                  <svg className="w-3 h-3 text-violet-400 ml-auto" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
