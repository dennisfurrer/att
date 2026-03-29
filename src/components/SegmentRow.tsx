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

  // Keep edit value in sync when segment text changes externally
  useEffect(() => {
    if (!editing) setEditValue(segment.text)
  }, [segment.text, editing])

  // Auto-resize textarea
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
      className={`group relative flex gap-3 px-4 py-3 rounded-xl border transition-all duration-150 cursor-pointer
        ${isActive ? 'bg-violet-500/8 border-violet-500/30' : isSelected ? 'bg-zinc-800/80 border-zinc-700' : 'bg-zinc-900/40 border-transparent hover:bg-zinc-800/40 hover:border-zinc-700/50'}
      `}
      onClick={(e) => onSelect(segment.id, e.metaKey || e.ctrlKey || e.shiftKey)}
    >
      {/* Silence gap indicator */}
      {segment.silenceGapBefore && (
        <div className="absolute -top-3 left-4 right-4 flex items-center gap-2" title="Silence gap detected — possible speaker change">
          <div className="flex-1 border-t border-dashed border-zinc-700" />
          <span className="text-zinc-600 text-[10px] shrink-0">silence gap</span>
          <div className="flex-1 border-t border-dashed border-zinc-700" />
        </div>
      )}

      {/* Selection checkbox */}
      <div className={`shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-violet-600 border-violet-600' : 'border-zinc-700 group-hover:border-zinc-500'}`}
        onClick={(e) => { e.stopPropagation(); onSelect(segment.id, true) }}
      >
        {isSelected && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-xs font-mono text-zinc-500 mt-0.5 w-16">
        {formatTimestamp(segment.start)}
      </span>

      {/* Speaker badge */}
      <div className="shrink-0 mt-0.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
            className="w-full bg-zinc-800 rounded-md px-2 py-1 text-sm text-zinc-100 outline-none border border-violet-500 resize-none leading-relaxed"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            className="text-sm text-zinc-200 leading-relaxed cursor-text"
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
        className="shrink-0 mt-0.5 p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-600 hover:text-violet-400 transition-colors opacity-0 group-hover:opacity-100"
        title="Play segment"
      >
        <svg className="w-3.5 h-3.5 ml-px" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5 3l14 9-14 9V3z" />
        </svg>
      </button>
    </div>
  )
}
