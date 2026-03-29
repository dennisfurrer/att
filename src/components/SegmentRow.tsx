import { useState, useRef, useEffect } from 'react'
import type { Segment, Speaker } from '../types'
import { formatTimestamp } from '../audio-utils'
import { SpeakerBadge } from './SpeakerPanel'

type Props = {
  segment: Segment
  speaker: Speaker
  speakers: Speaker[]
  isSelected: boolean
  isActive: boolean
  isManuallyAssigned: boolean
  onSelect: (id: string, multi: boolean) => void
  onTextEdit: (id: string, text: string) => void
  onSpeakerAssign: (segmentId: string, speakerId: string) => void
  onPlay: (segment: Segment) => void
}

export function SegmentRow({
  segment,
  speaker,
  speakers,
  isSelected,
  isActive,
  isManuallyAssigned,
  onSelect,
  onTextEdit,
  onSpeakerAssign,
  onPlay,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(segment.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setEditValue(segment.text)
  }, [segment.text, editing])

  useEffect(() => {
    const ta = textareaRef.current
    if (ta && editing) {
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    }
  }, [editValue, editing])

  const commitEdit = () => {
    onTextEdit(segment.id, editValue.trim() || segment.text)
    setEditing(false)
  }

  return (
    <div
      id={`seg-${segment.id}`}
      className="group relative flex gap-3 px-4 py-2.5 transition-all duration-100 cursor-pointer"
      style={{
        background: isActive
          ? 'rgba(45,212,191,0.05)'
          : isSelected
            ? 'rgba(255,255,255,0.04)'
            : 'transparent',
        borderLeft: isActive
          ? '2px solid rgba(45,212,191,0.5)'
          : isSelected
            ? '2px solid rgba(255,255,255,0.12)'
            : '2px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}
      onClick={(e) => onSelect(segment.id, e.metaKey || e.ctrlKey || e.shiftKey)}
    >
      {/* Silence gap indicator */}
      {segment.silenceGapBefore && (
        <div className="absolute -top-2.5 left-4 right-4 flex items-center gap-2" title="Silence gap">
          <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', borderStyle: 'dashed' }} />
          <span className="text-[9px] uppercase tracking-wider font-semibold shrink-0" style={{ color: 'var(--foreground-tertiary)' }}>
            gap
          </span>
          <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', borderStyle: 'dashed' }} />
        </div>
      )}

      {/* Selection checkbox */}
      <div
        className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded flex items-center justify-center transition-all"
        style={{
          background: isSelected ? '#2dd4bf' : 'transparent',
          border: isSelected ? '1px solid #2dd4bf' : '1px solid rgba(255,255,255,0.12)',
        }}
        onClick={(e) => { e.stopPropagation(); onSelect(segment.id, true) }}
      >
        {isSelected && (
          <svg className="w-2 h-2" fill="none" stroke="#09090b" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-[11px] font-mono tabular-nums mt-0.5 w-14" style={{ color: 'var(--foreground-tertiary)' }}>
        {formatTimestamp(segment.start)}
      </span>

      {/* Speaker badge */}
      <div className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <SpeakerBadge
          speaker={speaker}
          speakers={speakers}
          isManual={isManuallyAssigned}
          onAssign={(speakerId) => onSpeakerAssign(segment.id, speakerId)}
        />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() }
              if (e.key === 'Escape') { setEditing(false); setEditValue(segment.text) }
            }}
            className="w-full rounded px-2 py-1 text-[13px] text-white outline-none resize-none leading-relaxed"
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(45,212,191,0.4)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            className="text-[13px] leading-relaxed cursor-text"
            style={{ color: 'var(--foreground-secondary)' }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            title="Double-click to edit"
          >
            {segment.text}
          </p>
        )}
      </div>

      {/* Play button */}
      <button
        onClick={(e) => { e.stopPropagation(); onPlay(segment) }}
        className="shrink-0 mt-0.5 p-1 rounded transition-all opacity-0 group-hover:opacity-100 active:scale-90"
        style={{ color: 'var(--foreground-tertiary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#2dd4bf')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--foreground-tertiary)')}
        title="Play segment"
      >
        <svg className="w-3.5 h-3.5 ml-px" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5 3l14 9-14 9V3z" />
        </svg>
      </button>
    </div>
  )
}
