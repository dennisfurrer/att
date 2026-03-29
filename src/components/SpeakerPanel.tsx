import { useState } from 'react'
import type { Speaker } from '../types'

const PRESET_COLORS = [
  '#2dd4bf', // teal
  '#a78bfa', // violet
  '#f87171', // red
  '#60a5fa', // blue
  '#fbbf24', // amber
  '#f472b6', // pink
  '#34d399', // emerald
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
    <div
      className="w-full md:w-64 shrink-0 flex flex-col h-full overflow-hidden"
      style={{ borderLeft: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--foreground-tertiary)' }}>
          Speakers
        </p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all active:scale-[0.97]"
          style={{
            background: 'rgba(45,212,191,0.08)',
            border: '1px solid rgba(45,212,191,0.15)',
            color: '#2dd4bf',
          }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add
        </button>
      </div>

      {/* Speaker list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {speakers.map((speaker, i) => (
          <div
            key={speaker.id}
            className="rounded-xl p-3"
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            {/* Row: color + name + count */}
            <div className="flex items-center gap-2.5">
              {/* Color dot — click to open native picker */}
              <div className="relative shrink-0">
                <div
                  className="w-3.5 h-3.5 rounded-full cursor-pointer transition-transform hover:scale-110 active:scale-95"
                  style={{ backgroundColor: speaker.color, boxShadow: `0 0 8px ${speaker.color}44` }}
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

              {/* Name or edit input */}
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
                  className="flex-1 rounded px-2 py-0.5 text-[13px] text-white outline-none"
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: `1px solid ${speaker.color}66`,
                  }}
                />
              ) : (
                <span
                  className="flex-1 text-[13px] font-medium cursor-pointer truncate"
                  style={{ color: 'var(--foreground)' }}
                  onDoubleClick={() => startEdit(speaker)}
                  title="Double-click to rename"
                >
                  {speaker.name}
                </span>
              )}

              {/* Segment count */}
              <span className="font-mono text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
                {segmentCountBySpeaker[speaker.id] ?? 0}
              </span>
            </div>

            {/* Color presets */}
            <div className="mt-2.5 flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange(speaker.id, color)}
                  className="w-3.5 h-3.5 rounded-full transition-transform hover:scale-110 active:scale-90"
                  style={{
                    backgroundColor: color,
                    boxShadow: speaker.color === color ? `0 0 0 2px #09090b, 0 0 0 3px ${color}` : 'none',
                  }}
                  title={color}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => startEdit(speaker)}
                className="flex-1 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{ color: 'var(--foreground-tertiary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--foreground-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--foreground-tertiary)' }}
              >
                Rename
              </button>
              {speakers.length > 1 && (
                <button
                  onClick={() => onRemove(speaker.id)}
                  className="flex-1 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={{ color: 'var(--foreground-tertiary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,63,94,0.06)'; e.currentTarget.style.color = '#fb7185' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--foreground-tertiary)' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div
        className="px-4 py-3 space-y-1 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <p className="text-[10px]" style={{ color: 'var(--foreground-tertiary)' }}>Double-click a name to rename.</p>
        <p className="text-[10px]" style={{ color: 'var(--foreground-tertiary)' }}>
          Press <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>1–9</kbd> to assign speaker.
        </p>
      </div>
    </div>
  )
}

// ── Speaker badge / dropdown ────────────────────────────────────────────────

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
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all hover:opacity-90 active:scale-[0.97]"
        style={{
          backgroundColor: isManual ? `${speaker.color}20` : `${speaker.color}0d`,
          color: isManual ? speaker.color : `${speaker.color}88`,
          border: `1px solid ${isManual ? `${speaker.color}44` : `${speaker.color}20`}`,
        }}
        title={isManual ? 'Manually assigned — click to change' : 'Auto-assigned — click to assign'}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: isManual ? speaker.color : `${speaker.color}55` }}
        />
        <span className="max-w-[72px] truncate">{speaker.name}</span>
        {isManual && (
          <svg className="w-2.5 h-2.5 opacity-70 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
          </svg>
        )}
        <svg className="w-2.5 h-2.5 opacity-40" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1 z-20 py-1 rounded-lg min-w-[140px]"
            style={{
              background: 'linear-gradient(180deg, rgba(18,18,22,0.98) 0%, rgba(12,12,15,0.98) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderTopColor: 'rgba(255,255,255,0.09)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
          >
            {speakers.map((s) => (
              <button
                key={s.id}
                onClick={(e) => { e.stopPropagation(); onAssign(s.id); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate" style={{ color: 'var(--foreground-secondary)' }}>{s.name}</span>
                {s.id === speaker.id && (
                  <svg className="w-3 h-3 ml-auto shrink-0" fill="none" stroke="#2dd4bf" strokeWidth={2.5} viewBox="0 0 24 24">
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
