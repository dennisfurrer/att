import { useEffect, useRef, useCallback } from 'react'
import type { Segment, Speaker } from '../types'
import { SegmentRow } from './SegmentRow'

const AUTO_ASSIGN_THRESHOLD = 3

type Props = {
  segments: Segment[]
  speakers: Speaker[]
  selectedIds: Set<string>
  activeSegmentId: string | null
  manuallyAssignedIds: Set<string>
  onSelect: (id: string, multi: boolean) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onTextEdit: (id: string, text: string) => void
  onSpeakerAssign: (segmentId: string, speakerId: string) => void
  onBulkAssign: (speakerId: string) => void
  onAutoAssign: () => void
  onClearAssignments: () => void
  onPlay: (segment: Segment) => void
}

export function TranscriptEditor({
  segments,
  speakers,
  selectedIds,
  activeSegmentId,
  manuallyAssignedIds,
  onSelect,
  onSelectAll,
  onClearSelection,
  onTextEdit,
  onSpeakerAssign,
  onBulkAssign,
  onAutoAssign,
  onClearAssignments,
  onPlay,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const num = parseInt(e.key)
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const speaker = speakers[num - 1]
        if (speaker) onBulkAssign(speaker.id)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        onSelectAll()
      }
      if (e.key === 'Escape') onClearSelection()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [speakers, onBulkAssign, onSelectAll, onClearSelection])

  // Auto-scroll active segment
  useEffect(() => {
    if (!activeSegmentId) return
    const el = document.getElementById(`seg-${activeSegmentId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeSegmentId])

  const speakerForSegment = useCallback(
    (seg: Segment): Speaker => speakers.find((s) => s.id === seg.speakerId) ?? speakers[0],
    [speakers],
  )

  const labeledCount = manuallyAssignedIds.size
  const unlabeledCount = segments.length - labeledCount
  const canAutoAssign = labeledCount >= AUTO_ASSIGN_THRESHOLD && unlabeledCount > 0
  const showBulkBar = selectedIds.size > 1

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Assignment toolbar */}
      {segments.length > 0 && (
        <div
          className="shrink-0 px-4 py-2 flex items-center gap-3 flex-wrap"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.2)' }}
        >
          {labeledCount === 0 ? (
            <span className="text-[11px]" style={{ color: 'var(--foreground-tertiary)' }}>
              Click a speaker badge to start labeling.
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: 'var(--foreground-tertiary)' }}>
              <span className="font-semibold text-white">{labeledCount}</span> labeled
              {unlabeledCount > 0 && (
                <>, <span>{unlabeledCount} unset</span></>
              )}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {canAutoAssign && (
              <button
                onClick={onAutoAssign}
                className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  background: 'rgba(45,212,191,0.08)',
                  border: '1px solid rgba(45,212,191,0.2)',
                  color: '#2dd4bf',
                }}
                title={`Use ${labeledCount} labeled lines to assign ${unlabeledCount} remaining`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                Auto-assign
              </button>
            )}
            {labeledCount > 0 && (
              <button
                onClick={onClearAssignments}
                className="px-2.5 py-1 rounded text-[11px] font-medium transition-all"
                style={{ color: 'var(--foreground-tertiary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--foreground-secondary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--foreground-tertiary)'; e.currentTarget.style.background = 'transparent' }}
                title="Reset all speaker assignments"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bulk assign bar */}
      {showBulkBar && (
        <div
          className="shrink-0 px-4 py-2 flex items-center gap-3 flex-wrap"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(45,212,191,0.03)' }}
        >
          <span className="text-[12px] font-semibold text-white">
            {selectedIds.size} selected
          </span>
          <span className="text-[11px]" style={{ color: 'var(--foreground-tertiary)' }}>Assign to:</span>
          <div className="flex gap-1.5 flex-wrap">
            {speakers.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onBulkAssign(s.id)}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  background: `${s.color}15`,
                  border: `1px solid ${s.color}30`,
                  color: s.color,
                }}
                title={`Press ${i + 1}`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
                <kbd
                  className="ml-0.5 px-1 py-0.5 rounded font-mono text-[9px] opacity-60"
                  style={{ background: 'rgba(0,0,0,0.3)' }}
                >
                  {i + 1}
                </kbd>
              </button>
            ))}
          </div>
          <button
            onClick={onClearSelection}
            className="ml-auto text-[11px] font-medium transition-all"
            style={{ color: 'var(--foreground-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--foreground-tertiary)')}
          >
            Deselect
          </button>
        </div>
      )}

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto">
        {segments.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--foreground-tertiary)' }}>
            <span className="text-[13px]">No segments yet</span>
          </div>
        ) : (
          segments.map((seg) => (
            <SegmentRow
              key={seg.id}
              segment={seg}
              speaker={speakerForSegment(seg)}
              speakers={speakers}
              isSelected={selectedIds.has(seg.id)}
              isActive={seg.id === activeSegmentId}
              isManuallyAssigned={manuallyAssignedIds.has(seg.id)}
              onSelect={onSelect}
              onTextEdit={onTextEdit}
              onSpeakerAssign={onSpeakerAssign}
              onPlay={onPlay}
            />
          ))
        )}
      </div>
    </div>
  )
}
