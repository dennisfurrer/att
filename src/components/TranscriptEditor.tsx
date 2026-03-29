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

  // Keyboard shortcuts: 1-9 assign speaker
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

      if (e.key === 'Escape') {
        onClearSelection()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [speakers, onBulkAssign, onSelectAll, onClearSelection])

  // Auto-scroll active segment into view
  useEffect(() => {
    if (!activeSegmentId) return
    const el = document.getElementById(`seg-${activeSegmentId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeSegmentId])

  const speakerForSegment = useCallback(
    (seg: Segment): Speaker =>
      speakers.find((s) => s.id === seg.speakerId) ?? speakers[0],
    [speakers],
  )

  const labeledCount = manuallyAssignedIds.size
  const unlabeledCount = segments.length - labeledCount
  const canAutoAssign = labeledCount >= AUTO_ASSIGN_THRESHOLD && unlabeledCount > 0
  const showBulkBar = selectedIds.size > 1

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
      {/* Assignment toolbar — always visible when there are segments */}
      {segments.length > 0 && (
        <div className="shrink-0 px-4 py-2 bg-zinc-900/80 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
          {labeledCount === 0 ? (
            <span className="text-xs text-zinc-500">
              Click a speaker badge on any line to start labeling.
            </span>
          ) : (
            <span className="text-xs text-zinc-400">
              <span className="text-white font-medium">{labeledCount}</span> manually labeled
              {unlabeledCount > 0 && (
                <>, <span className="text-zinc-500">{unlabeledCount} unset</span></>
              )}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {canAutoAssign && (
              <button
                onClick={onAutoAssign}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-medium transition-colors"
                title={`Use your ${labeledCount} labeled lines to assign the remaining ${unlabeledCount}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                Auto-assign remaining
              </button>
            )}
            {labeledCount > 0 && (
              <button
                onClick={onClearAssignments}
                className="px-2.5 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 text-xs transition-colors"
                title="Reset all speaker assignments"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bulk assign bar — shown when multiple rows are selected */}
      {showBulkBar && (
        <div className="shrink-0 px-4 py-2 bg-zinc-800/80 border-b border-zinc-700 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-zinc-300 font-medium">
            {selectedIds.size} selected
          </span>
          <span className="text-zinc-600 text-sm">— Assign to:</span>
          <div className="flex gap-2 flex-wrap">
            {speakers.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onBulkAssign(s.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44` }}
                title={`Press ${i + 1}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
                <kbd className="ml-1 px-1 py-0.5 rounded bg-black/20 text-[10px] font-mono opacity-70">{i + 1}</kbd>
              </button>
            ))}
          </div>
          <button
            onClick={onClearSelection}
            className="ml-auto text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {segments.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            No segments yet
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
