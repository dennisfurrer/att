import { useState, useCallback, useRef, useEffect } from 'react'
import type { Segment, Speaker, ModelSize, TranscriptionStatus, WorkerOutMessage, WhisperChunk } from './types'
import { decodeAudioFile, getAudioDuration, hasSilenceGap } from './audio-utils'
import { UploadZone, FileInfoBar } from './components/UploadZone'
import { TranscriptEditor } from './components/TranscriptEditor'
import { SpeakerPanel } from './components/SpeakerPanel'
import { ExportPanel } from './components/ExportPanel'
import { AudioPlayer } from './components/AudioPlayer'
import { AnalyticsPanel } from './components/AnalyticsPanel'

// ── Default speakers ─────────────────────────────────────────────────────────

const DEFAULT_SPEAKERS: Speaker[] = [
  { id: 's1', name: 'Speaker 1', color: '#2dd4bf' },
  { id: 's2', name: 'Speaker 2', color: '#a78bfa' },
]

let speakerCounter = 3

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

function makeSegments(chunks: WhisperChunk[], defaultSpeakerId: string): Segment[] {
  const valid = chunks.filter((c) => c.text.trim())
  return valid.map((chunk, i) => {
    const start = chunk.timestamp[0] ?? 0
    const end = chunk.timestamp[1] ?? start + 2
    const prev = valid[i - 1]
    const silenceGapBefore = prev
      ? hasSilenceGap(prev.timestamp[1] ?? prev.timestamp[0], start)
      : false
    return {
      id: makeId(),
      start,
      end,
      text: chunk.text.trim(),
      speakerId: defaultSpeakerId,
      silenceGapBefore,
    }
  })
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type Panel = 'transcript' | 'speakers' | 'analytics' | 'export'

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)

  const [status, setStatus] = useState<TranscriptionStatus>('idle')
  const [modelSize, setModelSize] = useState<ModelSize>('base')
  const [modelProgress, setModelProgress] = useState<{ file: string; progress: number } | null>(null)
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [segments, setSegments] = useState<Segment[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>(DEFAULT_SPEAKERS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [manuallyAssignedIds, setManuallyAssignedIds] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState<Panel>('transcript')

  const workerRef = useRef<Worker | null>(null)

  // ── File upload ───────────────────────────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setError(null)
    setSegments([])
    setSelectedIds(new Set())
    setActiveSegmentId(null)
    setStatus('idle')
    setPanel('transcript')
    try {
      const dur = await getAudioDuration(f)
      setDuration(dur)
    } catch {
      setDuration(null)
    }
  }, [])

  // ── Transcription ─────────────────────────────────────────────────────────

  const startTranscription = useCallback(async () => {
    if (!file) return
    setError(null)
    setStatus('loading-model')
    setModelProgress(null)
    setTranscribeProgress(0)

    console.log('[ATT] Starting transcription:', file.name, modelSize)

    try {
      console.log('[ATT] Decoding audio to mono Float32 @ 16kHz...')
      const t0 = performance.now()
      const data = await decodeAudioFile(file)
      console.log(`[ATT] Audio decoded in ${((performance.now() - t0) / 1000).toFixed(2)}s — ${data.length} samples`)

      if (workerRef.current) {
        workerRef.current.terminate()
      }

      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker

      worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const msg = e.data
        if (msg.type === 'model-progress') {
          setModelProgress({ file: msg.file, progress: msg.progress })
        } else if (msg.type === 'transcription-progress') {
          setStatus('transcribing')
          setTranscribeProgress(msg.progress)
        } else if (msg.type === 'result') {
          const segs = makeSegments(msg.chunks, speakers[0].id)
          console.log(`[ATT] Result: ${msg.chunks.length} chunks → ${segs.length} segments`)
          setSegments(segs)
          setStatus('done')
        } else if (msg.type === 'error') {
          console.error('[ATT] Worker error:', msg.message)
          setError(msg.message)
          setStatus('error')
        }
      }

      worker.onerror = (e) => {
        console.error('[ATT] Uncaught worker error:', e.message)
        setError(e.message)
        setStatus('error')
      }

      worker.postMessage({ type: 'transcribe', audioData: data, modelSize })
    } catch (err) {
      console.error('[ATT] Error:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [file, modelSize, speakers])

  useEffect(() => {
    return () => workerRef.current?.terminate()
  }, [])

  // ── Segment mutation ──────────────────────────────────────────────────────

  const handleTextEdit = useCallback((id: string, text: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)))
  }, [])

  const handleSpeakerAssign = useCallback((segmentId: string, speakerId: string) => {
    setSegments((prev) => prev.map((s) => (s.id === segmentId ? { ...s, speakerId } : s)))
    setManuallyAssignedIds((prev) => new Set([...prev, segmentId]))
  }, [])

  const handleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds((prev) => {
      if (multi) {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }
      if (prev.size === 1 && prev.has(id)) return new Set()
      return new Set([id])
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(segments.map((s) => s.id)))
  }, [segments])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleBulkAssign = useCallback((speakerId: string) => {
    if (selectedIds.size === 0) return
    setSegments((prev) => prev.map((s) => (selectedIds.has(s.id) ? { ...s, speakerId } : s)))
    setManuallyAssignedIds((prev) => new Set([...prev, ...selectedIds]))
  }, [selectedIds])

  const handleAutoAssign = useCallback(() => {
    setSegments((prev) => {
      const anchors = prev.map((seg, idx) => ({ seg, idx })).filter(({ seg }) => manuallyAssignedIds.has(seg.id))
      if (anchors.length === 0) return prev
      return prev.map((seg, idx) => {
        if (manuallyAssignedIds.has(seg.id)) return seg
        let nearest = anchors[0]
        let minDist = Math.abs(idx - anchors[0].idx)
        for (const anchor of anchors) {
          const dist = Math.abs(idx - anchor.idx)
          if (dist < minDist) { minDist = dist; nearest = anchor }
        }
        return { ...seg, speakerId: nearest.seg.speakerId }
      })
    })
  }, [manuallyAssignedIds])

  const handleClearAssignments = useCallback(() => {
    const defaultId = speakers[0]?.id
    if (!defaultId) return
    setSegments((prev) => prev.map((s) => ({ ...s, speakerId: defaultId })))
    setManuallyAssignedIds(new Set())
  }, [speakers])

  // ── Speaker mutation ──────────────────────────────────────────────────────

  const handleAddSpeaker = useCallback(() => {
    const colors = ['#f87171', '#60a5fa', '#fbbf24', '#f472b6', '#34d399', '#a3e635', '#fb923c']
    const color = colors[(speakerCounter - 1) % colors.length]
    const newSpeaker: Speaker = { id: makeId(), name: `Speaker ${speakerCounter}`, color }
    speakerCounter++
    setSpeakers((prev) => [...prev, newSpeaker])
  }, [])

  const handleRenameSpeaker = useCallback((id: string, name: string) => {
    setSpeakers((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }, [])

  const handleColorChange = useCallback((id: string, color: string) => {
    setSpeakers((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)))
  }, [])

  const handleRemoveSpeaker = useCallback((id: string) => {
    setSpeakers((prev) => {
      const next = prev.filter((s) => s.id !== id)
      const fallback = next[0]?.id
      if (fallback) {
        setSegments((segs) => segs.map((s) => (s.speakerId === id ? { ...s, speakerId: fallback } : s)))
      }
      return next
    })
  }, [])

  const segmentCountBySpeaker: Record<string, number> = {}
  for (const seg of segments) {
    segmentCountBySpeaker[seg.speakerId] = (segmentCountBySpeaker[seg.speakerId] ?? 0) + 1
  }

  // ── Audio playback ────────────────────────────────────────────────────────

  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  const handlePlaySegment = useCallback((seg: Segment) => {
    const audio = audioElementRef.current
    if (!audio) return
    audio.currentTime = seg.start
    audio.play()
    setActiveSegmentId(seg.id)
  }, [])

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    if (workerRef.current) workerRef.current.terminate()
    setFile(null)
    setDuration(null)
    setStatus('idle')
    setSegments([])
    setSelectedIds(new Set())
    setActiveSegmentId(null)
    setManuallyAssignedIds(new Set())
    setError(null)
    setSpeakers(DEFAULT_SPEAKERS)
    speakerCounter = 3
  }

  // ── Render: upload screen ─────────────────────────────────────────────────

  if (!file) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <UploadZone onFile={handleFile} />
      </div>
    )
  }

  const isProcessing = status === 'loading-model' || status === 'transcribing'
  const hasContent = status === 'done' || segments.length > 0

  // ── Render: main workspace ────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center gap-3 px-4 h-[52px]"
        style={{
          background: 'rgba(9,9,11,0.95)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* Logo / back */}
        <button
          onClick={handleReset}
          className="flex items-center gap-2 transition-all active:scale-[0.97]"
          title="Upload new file"
        >
          <div
            className="w-6 h-6 flex items-center justify-center rounded"
            style={{ background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.15)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="#2dd4bf" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <span className="font-display text-[13px] font-semibold hidden sm:block" style={{ color: 'var(--foreground-secondary)' }}>
            ATT
          </span>
        </button>

        {/* Vertical divider */}
        <div className="w-px h-4 shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* File info */}
        <FileInfoBar file={file} duration={duration} />

        <div className="flex-1" />

        {/* Model selector — only when idle */}
        {status === 'idle' && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--foreground-tertiary)' }}>
              Model
            </span>
            <select
              value={modelSize}
              onChange={(e) => setModelSize(e.target.value as ModelSize)}
              className="text-[12px] font-medium outline-none rounded px-2.5 py-1 transition-all"
              style={{
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--foreground-secondary)',
              }}
            >
              <option value="tiny">Tiny (~75 MB)</option>
              <option value="base">Base (~150 MB)</option>
              <option value="small">Small (~250 MB)</option>
            </select>
          </div>
        )}

        {/* Progress indicator */}
        {isProcessing && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-[11px] font-medium" style={{ color: 'var(--foreground-secondary)' }}>
              {status === 'loading-model'
                ? modelProgress
                  ? `${modelProgress.file.split('/').pop()} — ${Math.round(modelProgress.progress)}%`
                  : 'Loading model...'
                : `Transcribing — ${Math.round(transcribeProgress)}%`}
            </div>
            <div className="w-24 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: status === 'loading-model'
                    ? `${modelProgress?.progress ?? 0}%`
                    : `${transcribeProgress}%`,
                  background: '#2dd4bf',
                }}
              />
            </div>
          </div>
        )}

        {/* Transcribe button */}
        {status === 'idle' && (
          <button
            onClick={startTranscription}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-bold transition-all active:scale-[0.97]"
            style={{
              background: 'linear-gradient(180deg, #34d9c4 0%, #1aab98 100%)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 16px rgba(45,212,191,0.2)',
              color: '#09090b',
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
            Transcribe
          </button>
        )}

        {/* Panel tabs — desktop, done state */}
        {hasContent && (
          <div
            className="hidden md:flex rounded overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {([
              { id: 'transcript', label: 'Transcript' },
              { id: 'analytics', label: 'Analytics' },
            ] as { id: Panel; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPanel(tab.id)}
                className="px-3 py-1.5 text-[11px] font-semibold transition-all"
                style={{
                  background: panel === tab.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: panel === tab.id ? 'var(--foreground)' : 'var(--foreground-tertiary)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Export — desktop */}
        {hasContent && (
          <div className="hidden md:block">
            <ExportPanel segments={segments} speakers={speakers} fileName={file.name} />
          </div>
        )}

        {/* Retry */}
        {status === 'error' && (
          <button
            onClick={startTranscription}
            className="px-3 py-1.5 rounded text-[12px] font-bold transition-all active:scale-[0.97]"
            style={{
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.2)',
              color: '#fb7185',
            }}
          >
            Retry
          </button>
        )}
      </header>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="shrink-0 px-4 py-2.5 flex items-start gap-2 text-[12px]"
          style={{
            background: 'rgba(244,63,94,0.06)',
            borderBottom: '1px solid rgba(244,63,94,0.15)',
            color: '#fb7185',
          }}
        >
          <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}

      {/* Idle: ready to transcribe */}
      {status === 'idle' && segments.length === 0 && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-xs">
            <div
              className="w-14 h-14 mx-auto flex items-center justify-center rounded"
              style={{
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.04)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)',
              }}
            >
              <svg className="w-7 h-7" fill="none" stroke="#3f3f46" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-white mb-1">
                Ready to transcribe
              </p>
              <p className="text-[12px]" style={{ color: 'var(--foreground-tertiary)' }}>
                Click Transcribe to start. Model runs entirely in your browser.
              </p>
            </div>
            {/* Mobile model selector */}
            <div className="sm:hidden flex items-center gap-2 justify-center">
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--foreground-tertiary)' }}>Model</span>
              <select
                value={modelSize}
                onChange={(e) => setModelSize(e.target.value as ModelSize)}
                className="text-[12px] outline-none rounded px-2.5 py-1"
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--foreground-secondary)',
                }}
              >
                <option value="tiny">Tiny (~75 MB)</option>
                <option value="base">Base (~150 MB)</option>
                <option value="small">Small (~250 MB)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Processing */}
      {isProcessing && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-5 max-w-xs">
            <div className="relative mx-auto w-12 h-12">
              <div
                className="absolute inset-0 rounded-full animate-spin-smooth"
                style={{ border: '2px solid rgba(255,255,255,0.06)', borderTopColor: '#2dd4bf' }}
              />
              <div
                className="absolute inset-[5px] flex items-center justify-center rounded-full"
                style={{ background: 'rgba(45,212,191,0.06)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="#2dd4bf" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-white mb-1">
                {status === 'loading-model' ? 'Loading model' : 'Transcribing'}
              </p>
              <p className="text-[12px]" style={{ color: 'var(--foreground-tertiary)' }}>
                {status === 'loading-model'
                  ? modelProgress
                    ? `${modelProgress.file.split('/').pop()} — ${Math.round(modelProgress.progress)}%`
                    : 'Downloading model weights...'
                  : `${Math.round(transcribeProgress)}% — this may take a few minutes`}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: status === 'loading-model'
                    ? `${modelProgress?.progress ?? 0}%`
                    : `${transcribeProgress}%`,
                  background: '#2dd4bf',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main workspace — desktop: transcript + speakers side by side */}
      {hasContent && (
        <>
          {/* Desktop layout */}
          <div className="hidden md:flex flex-1 min-h-0">
            {panel === 'transcript' ? (
              <>
                <TranscriptEditor
                  segments={segments}
                  speakers={speakers}
                  selectedIds={selectedIds}
                  activeSegmentId={activeSegmentId}
                  manuallyAssignedIds={manuallyAssignedIds}
                  onSelect={handleSelect}
                  onSelectAll={handleSelectAll}
                  onClearSelection={handleClearSelection}
                  onTextEdit={handleTextEdit}
                  onSpeakerAssign={handleSpeakerAssign}
                  onBulkAssign={handleBulkAssign}
                  onAutoAssign={handleAutoAssign}
                  onClearAssignments={handleClearAssignments}
                  onPlay={handlePlaySegment}
                />
                <SpeakerPanel
                  speakers={speakers}
                  onAdd={handleAddSpeaker}
                  onRename={handleRenameSpeaker}
                  onColorChange={handleColorChange}
                  onRemove={handleRemoveSpeaker}
                  segmentCountBySpeaker={segmentCountBySpeaker}
                />
              </>
            ) : (
              <AnalyticsPanel segments={segments} speakers={speakers} />
            )}
          </div>

          {/* Mobile layout — single panel based on active tab */}
          <div className="md:hidden flex-1 min-h-0 flex flex-col">
            {panel === 'transcript' && (
              <TranscriptEditor
                segments={segments}
                speakers={speakers}
                selectedIds={selectedIds}
                activeSegmentId={activeSegmentId}
                manuallyAssignedIds={manuallyAssignedIds}
                onSelect={handleSelect}
                onSelectAll={handleSelectAll}
                onClearSelection={handleClearSelection}
                onTextEdit={handleTextEdit}
                onSpeakerAssign={handleSpeakerAssign}
                onBulkAssign={handleBulkAssign}
                onAutoAssign={handleAutoAssign}
                onClearAssignments={handleClearAssignments}
                onPlay={handlePlaySegment}
              />
            )}
            {panel === 'speakers' && (
              <SpeakerPanel
                speakers={speakers}
                onAdd={handleAddSpeaker}
                onRename={handleRenameSpeaker}
                onColorChange={handleColorChange}
                onRemove={handleRemoveSpeaker}
                segmentCountBySpeaker={segmentCountBySpeaker}
              />
            )}
            {panel === 'analytics' && (
              <AnalyticsPanel segments={segments} speakers={speakers} />
            )}
            {panel === 'export' && (
              <ExportPanel segments={segments} speakers={speakers} fileName={file.name} fullPage />
            )}
          </div>
        </>
      )}

      {/* ── Audio player ───────────────────────────────────────────────────── */}
      {hasContent && (
        <AudioPlayer
          file={file}
          segments={segments}
          currentSegmentId={activeSegmentId}
          onSegmentChange={setActiveSegmentId}
        />
      )}

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      {hasContent && (
        <nav
          className="md:hidden shrink-0 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]"
          style={{
            background: 'rgba(9,9,11,0.95)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {([
            { id: 'transcript', label: 'Transcript', icon: <TranscriptIcon /> },
            { id: 'speakers', label: 'Speakers', icon: <SpeakersIcon /> },
            { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
            { id: 'export', label: 'Export', icon: <ExportIcon /> },
          ] as { id: Panel; label: string; icon: React.ReactNode }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPanel(tab.id)}
              className="flex flex-col items-center justify-center gap-1 py-2.5 transition-all active:scale-[0.95]"
              style={{ color: panel === tab.id ? '#2dd4bf' : 'var(--foreground-tertiary)' }}
            >
              {tab.icon}
              <span className="text-[9px] uppercase tracking-wider font-semibold">{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Audio bridge */}
      <AudioElementBridge onReady={(el) => { audioElementRef.current = el }} />
    </div>
  )
}

// ── Mobile nav icons ──────────────────────────────────────────────────────────

function TranscriptIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
    </svg>
  )
}

function SpeakersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )
}

function AnalyticsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

// ── Audio element bridge ──────────────────────────────────────────────────────

function AudioElementBridge({ onReady }: { onReady: (el: HTMLAudioElement) => void }) {
  useEffect(() => {
    const tryFind = () => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null
      if (audio) onReady(audio)
    }
    tryFind()
    const timer = setInterval(tryFind, 200)
    return () => clearInterval(timer)
  }, [onReady])
  return null
}
