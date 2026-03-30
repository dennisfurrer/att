import { useState, useCallback, useRef, useEffect } from 'react'
import type { Segment, Speaker, ModelSize, TranscriptionStatus, WorkerOutMessage, WhisperChunk, DiarizationSegment } from './types'
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

function makeSegments(
  chunks: WhisperChunk[],
  speakerIds: string[],
  diarization?: DiarizationSegment[],
): Segment[] {
  const valid = chunks.filter((c) => c.text.trim())

  // Build segments with silence gap detection
  const segments: Segment[] = valid.map((chunk, i) => {
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
      speakerId: speakerIds[0],
      silenceGapBefore,
    }
  })

  if (diarization && diarization.length > 0) {
    // Use pyannote diarization results — match each segment to the speaker
    // who has the most overlap with that segment's time range
    console.log(`[ATT] Mapping ${segments.length} segments to ${diarization.length} diarization spans`)

    // Collect unique speaker indices from diarization
    const uniqueDiarSpeakers = [...new Set(diarization.map((d) => d.speakerIdx))].sort()
    console.log(`[ATT] Diarization detected ${uniqueDiarSpeakers.length} speakers`)

    for (const seg of segments) {
      // Find diarization spans that overlap with this segment
      let bestSpeakerIdx = 0
      let bestOverlap = 0

      for (const dSeg of diarization) {
        const overlapStart = Math.max(seg.start, dSeg.start)
        const overlapEnd = Math.min(seg.end, dSeg.end)
        const overlap = Math.max(0, overlapEnd - overlapStart)
        if (overlap > bestOverlap) {
          bestOverlap = overlap
          bestSpeakerIdx = dSeg.speakerIdx
        }
      }

      // Map diarization speaker index to our speaker IDs
      const mappedIdx = Math.min(bestSpeakerIdx, speakerIds.length - 1)
      seg.speakerId = speakerIds[mappedIdx]
    }
  } else if (speakerIds.length >= 2) {
    // Fallback: alternate speakers at silence gaps
    let currentSpeakerIdx = 0
    for (let i = 0; i < segments.length; i++) {
      if (i > 0 && segments[i].silenceGapBefore) {
        currentSpeakerIdx = (currentSpeakerIdx + 1) % speakerIds.length
      }
      segments[i].speakerId = speakerIds[currentSpeakerIdx]
    }
  }

  return segments
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type Panel = 'transcript' | 'speakers' | 'analytics' | 'export'

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)

  const [status, setStatus] = useState<TranscriptionStatus>('idle')
  const [modelSize, setModelSize] = useState<ModelSize>('base')
  const [modelProgress, setModelProgress] = useState<{ file: string; progress: number; loaded?: number; total?: number; stage: 'whisper' | 'diarization' } | null>(null)
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [diarizeProgress, setDiarizeProgress] = useState(0)
  const [diarizeDetail, setDiarizeDetail] = useState<string | null>(null)
  const [processStartTime, setProcessStartTime] = useState<number | null>(null)
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
    setDiarizeProgress(0)
    setDiarizeDetail(null)
    setProcessStartTime(Date.now())

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
          const fname = msg.file.split('/').pop() ?? msg.file
          console.log(`[ATT] Model download [${msg.stage}]: ${fname} — ${Math.round(msg.progress)}%`)
          if (msg.stage === 'diarization') {
            setStatus('diarizing')
          }
          setModelProgress({ file: msg.file, progress: msg.progress, loaded: msg.loaded, total: msg.total, stage: msg.stage })
        } else if (msg.type === 'transcription-progress') {
          console.log(`[ATT] Transcription progress: ${Math.round(msg.progress)}%`)
          setStatus('transcribing')
          setTranscribeProgress(msg.progress)
        } else if (msg.type === 'diarization-progress') {
          console.log(`[ATT] Diarization: ${Math.round(msg.progress)}% — ${msg.detail ?? ''}`)
          setStatus('diarizing')
          setDiarizeProgress(msg.progress)
          setDiarizeDetail(msg.detail ?? null)
        } else if (msg.type === 'result') {
          const speakerIds = speakers.map((s) => s.id)
          const hasDiar = !!(msg.diarization && msg.diarization.length > 0)
          console.log(`[ATT] Result: ${msg.chunks.length} chunks, diarization: ${hasDiar ? `${msg.diarization!.length} spans` : 'none (fallback)'}`)
          const segs = makeSegments(msg.chunks, speakerIds, msg.diarization)
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
      if (anchors.length === 0) {
        // No manual anchors — re-run silence-gap alternation with current speakers
        const speakerIds = speakers.map((s) => s.id)
        if (speakerIds.length < 2) return prev
        let currentIdx = 0
        return prev.map((seg, i) => {
          if (i > 0 && seg.silenceGapBefore) {
            currentIdx = (currentIdx + 1) % speakerIds.length
          }
          return { ...seg, speakerId: speakerIds[currentIdx] }
        })
      }

      // Build turn boundaries: groups of consecutive segments without silence gaps
      const turnIds: number[] = [] // turnIds[segIdx] = turn number
      let turnNum = 0
      for (let i = 0; i < prev.length; i++) {
        if (i > 0 && prev[i].silenceGapBefore) turnNum++
        turnIds.push(turnNum)
      }

      // Map turns to speaker based on anchors within them
      const turnSpeaker: Record<number, string> = {}
      for (const { seg, idx } of anchors) {
        turnSpeaker[turnIds[idx]] = seg.speakerId
      }

      // For turns without an anchor, find nearest anchored turn
      const anchoredTurns = Object.keys(turnSpeaker).map(Number)
      const totalTurns = turnNum + 1

      const turnSpeakerResolved: Record<number, string> = { ...turnSpeaker }
      for (let t = 0; t < totalTurns; t++) {
        if (turnSpeakerResolved[t]) continue
        let nearest = anchoredTurns[0]
        let minDist = Math.abs(t - nearest)
        for (const at of anchoredTurns) {
          const dist = Math.abs(t - at)
          if (dist < minDist) { minDist = dist; nearest = at }
        }
        turnSpeakerResolved[t] = turnSpeaker[nearest]
      }

      return prev.map((seg, idx) => {
        if (manuallyAssignedIds.has(seg.id)) return seg
        const speaker = turnSpeakerResolved[turnIds[idx]]
        return speaker ? { ...seg, speakerId: speaker } : seg
      })
    })
  }, [manuallyAssignedIds, speakers])

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

  const isProcessing = status === 'loading-model' || status === 'transcribing' || status === 'diarizing'
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
          <span className="font-display text-[13px] font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
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
              <optgroup label="Whisper (multilingual)">
                <option value="tiny">Tiny (~75 MB)</option>
                <option value="base">Base (~150 MB)</option>
              </optgroup>
              <optgroup label="Distil-Whisper (English, faster)">
                <option value="distil-small">Distil Small (~170 MB)</option>
                <option value="distil-large">Distil Large v3.5 (~530 MB)</option>
              </optgroup>
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
                : status === 'diarizing'
                  ? `Speaker detection — ${Math.round(diarizeProgress)}%`
                  : `Transcribing — ${Math.round(transcribeProgress)}%`}
            </div>
            <div className="w-24 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: status === 'loading-model'
                    ? `${modelProgress?.progress ?? 0}%`
                    : status === 'diarizing'
                      ? `${diarizeProgress}%`
                      : `${transcribeProgress}%`,
                  background: status === 'diarizing' ? '#a78bfa' : '#2dd4bf',
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
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm space-y-3">

            {/* Model selection cards */}
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold mb-4 text-center" style={{ color: 'var(--foreground-tertiary)' }}>
              Select model
            </p>
            {([
              { value: 'tiny', label: 'Tiny', size: '~75 MB', desc: 'Fastest — good for clear audio', group: 'whisper' },
              { value: 'base', label: 'Base', size: '~150 MB', desc: 'Balanced speed and accuracy', group: 'whisper' },
              { value: 'distil-small', label: 'Distil Small', size: '~170 MB', desc: 'Fast English — 2-3x faster', group: 'distil' },
              { value: 'distil-large', label: 'Distil Large', size: '~530 MB', desc: 'Best English quality — fast', group: 'distil' },
            ] as { value: ModelSize; label: string; size: string; desc: string; group: string }[]).map((m) => (
              <button
                key={m.value}
                onClick={() => setModelSize(m.value)}
                className="w-full flex items-center gap-4 px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.99]"
                style={{
                  background: modelSize === m.value
                    ? 'linear-gradient(180deg, rgba(45,212,191,0.07) 0%, rgba(45,212,191,0.03) 100%)'
                    : 'rgba(0,0,0,0.25)',
                  border: modelSize === m.value
                    ? '1px solid rgba(45,212,191,0.25)'
                    : '1px solid rgba(255,255,255,0.05)',
                  borderTopColor: modelSize === m.value
                    ? 'rgba(45,212,191,0.35)'
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: modelSize === m.value
                    ? 'inset 0 1px 3px rgba(0,0,0,0.4), 0 0 16px rgba(45,212,191,0.04)'
                    : 'inset 0 1px 3px rgba(0,0,0,0.5)',
                }}
              >
                {/* Selection indicator */}
                <div
                  className="shrink-0 w-3.5 h-3.5 flex items-center justify-center"
                  style={{
                    background: modelSize === m.value ? '#2dd4bf' : 'rgba(0,0,0,0.4)',
                    border: modelSize === m.value ? '1px solid #2dd4bf' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: modelSize === m.value ? '0 0 8px rgba(45,212,191,0.3)' : 'none',
                  }}
                >
                  {modelSize === m.value && (
                    <div className="w-1.5 h-1.5" style={{ background: '#09090b' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[13px] font-semibold"
                      style={{ color: modelSize === m.value ? '#2dd4bf' : 'var(--foreground)' }}
                    >
                      {m.label}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
                      {m.size}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-tertiary)' }}>{m.desc}</p>
                </div>
              </button>
            ))}

            {/* Transcribe CTA */}
            <button
              onClick={startTranscription}
              className="w-full mt-2 py-3 text-[13px] font-bold tracking-wide transition-all active:scale-[0.98]"
              style={{
                background: 'linear-gradient(180deg, #34d9c4 0%, #1aab98 100%)',
                boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 20px rgba(45,212,191,0.2), 0 1px 3px rgba(0,0,0,0.4)',
                color: '#09090b',
              }}
            >
              Start Transcription
            </button>

            <p className="text-[10px] text-center pt-1" style={{ color: '#3f3f46' }}>
              Runs 100% in-browser. Cached after first download.
            </p>
          </div>
        </div>
      )}

      {/* Processing */}
      {isProcessing && (
        <ProcessingView
          status={status}
          modelProgress={modelProgress}
          transcribeProgress={transcribeProgress}
          diarizeProgress={diarizeProgress}
          diarizeDetail={diarizeDetail}
          processStartTime={processStartTime}
        />
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

// ── Processing view ─────────────────────────────────────────────────────────

function ProcessingView({
  status,
  modelProgress,
  transcribeProgress,
  diarizeProgress,
  diarizeDetail,
  processStartTime,
}: {
  status: TranscriptionStatus
  modelProgress: { file: string; progress: number; loaded?: number; total?: number; stage: 'whisper' | 'diarization' } | null
  transcribeProgress: number
  diarizeProgress: number
  diarizeDetail: string | null
  processStartTime: number | null
}) {
  // ETA calculation
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const elapsedSec = processStartTime ? Math.floor((now - processStartTime) / 1000) : 0
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`
  }

  // Estimate overall progress across all stages
  // Loading model = 0-40%, transcribing = 40-80%, diarizing = 80-100%
  let overallProgress = 0
  if (status === 'loading-model') {
    overallProgress = (modelProgress?.progress ?? 0) * 0.4
  } else if (status === 'transcribing') {
    overallProgress = 40 + transcribeProgress * 0.4
  } else if (status === 'diarizing') {
    if (modelProgress?.stage === 'diarization') {
      // Still loading diarization model
      overallProgress = 80 + (modelProgress.progress ?? 0) * 0.1
    } else {
      overallProgress = 90 + diarizeProgress * 0.1
    }
  }

  const etaRemaining = overallProgress > 5 && elapsedSec > 3
    ? Math.max(0, Math.round((elapsedSec / overallProgress) * (100 - overallProgress)))
    : null

  // Stage config
  const stages = [
    { key: 'loading-model', label: 'Loading model', done: status !== 'loading-model' && status !== 'idle' },
    { key: 'transcribing', label: 'Transcribing', done: status === 'diarizing' || status === 'done' },
    { key: 'diarizing', label: 'Speaker detection', done: status === 'done' },
  ]

  const currentProgress =
    status === 'loading-model' ? modelProgress?.progress ?? 0
    : status === 'transcribing' ? transcribeProgress
    : status === 'diarizing' ? (modelProgress?.stage === 'diarization' ? modelProgress.progress ?? 0 : diarizeProgress)
    : 0

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const currentDetail =
    status === 'loading-model'
      ? modelProgress
        ? (() => {
          const fname = modelProgress.file.split('/').pop() ?? ''
          const loaded = modelProgress.loaded ? formatBytes(modelProgress.loaded) : ''
          const total = modelProgress.total ? ` / ${formatBytes(modelProgress.total)}` : ''
          return `${fname}${loaded ? ` — ${loaded}${total}` : ''}`
        })()
        : 'Preparing...'
      : status === 'transcribing'
        ? `${Math.round(transcribeProgress)}% complete`
        : status === 'diarizing'
          ? modelProgress?.stage === 'diarization'
            ? modelProgress
              ? (() => {
                const fname = modelProgress.file.split('/').pop() ?? 'model'
                const loaded = modelProgress.loaded ? formatBytes(modelProgress.loaded) : ''
                const total = modelProgress.total ? ` / ${formatBytes(modelProgress.total)}` : ''
                return `Speaker model: ${fname}${loaded ? ` — ${loaded}${total}` : ''}`
              })()
              : 'Loading speaker detection model...'
            : diarizeDetail ?? `${Math.round(diarizeProgress)}% complete`
          : ''

  // Icon color
  const iconColor = status === 'diarizing' ? '#a78bfa' : '#2dd4bf'
  const barColor = status === 'diarizing' ? '#a78bfa' : '#2dd4bf'
  const barBgGlow = status === 'diarizing' ? 'rgba(167,139,250,0.08)' : 'rgba(45,212,191,0.08)'

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            {/* Glow behind icon */}
            <div
              className="absolute inset-[-8px]"
              style={{
                background: `radial-gradient(circle, ${barBgGlow} 0%, transparent 70%)`,
                filter: 'blur(8px)',
              }}
            />
            {/* Spinner ring */}
            <div
              className="relative w-14 h-14 flex items-center justify-center"
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderTopColor: 'rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6)',
              }}
            >
              {/* Rotating border */}
              <div
                className="absolute inset-[-1px] animate-spin-smooth"
                style={{
                  background: `conic-gradient(from 0deg, transparent 60%, ${iconColor} 100%)`,
                  mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  maskComposite: 'exclude',
                  WebkitMaskComposite: 'xor',
                  padding: '1px',
                }}
              />
              {/* Brain icon for model loading, waveform for transcribing, people for diarizing */}
              {status === 'loading-model' ? (
                <svg className="w-6 h-6" fill="none" stroke={iconColor} strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
              ) : status === 'diarizing' ? (
                <svg className="w-6 h-6" fill="none" stroke={iconColor} strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <rect x="3" y="9" width="2" height="6" rx="1" fill={`${iconColor}4d`} />
                  <rect x="7" y="5" width="2" height="14" rx="1" fill={`${iconColor}80`} />
                  <rect x="11" y="3" width="2" height="18" rx="1" fill={iconColor} />
                  <rect x="15" y="6" width="2" height="12" rx="1" fill={`${iconColor}80`} />
                  <rect x="19" y="10" width="2" height="4" rx="1" fill={`${iconColor}4d`} />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Stage pipeline */}
        <div className="flex items-center justify-center gap-2">
          {stages.map((s, i) => {
            const isActive = s.key === status
            const isDone = s.done
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div className="w-6 h-px" style={{ background: isDone || isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)' }} />
                )}
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2"
                    style={{
                      background: isDone ? '#2dd4bf' : isActive ? barColor : 'rgba(255,255,255,0.1)',
                      boxShadow: isActive ? `0 0 6px ${barBgGlow}` : 'none',
                    }}
                  />
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{
                      color: isDone ? 'var(--foreground-secondary)' : isActive ? 'var(--foreground)' : 'var(--foreground-tertiary)',
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-1 w-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="h-full transition-[width] duration-500"
              style={{
                width: `${currentProgress}%`,
                background: `linear-gradient(90deg, ${barColor} 0%, ${barColor}cc 100%)`,
                boxShadow: `0 0 12px ${barBgGlow}`,
              }}
            />
          </div>

          {/* Detail line */}
          <div className="flex items-center justify-between mt-2">
            <p
              className="text-[11px] font-mono truncate max-w-[240px] tabular-nums"
              style={{ color: 'var(--foreground-tertiary)' }}
            >
              {currentDetail}
            </p>
            <span className="text-[11px] font-mono tabular-nums shrink-0 ml-2" style={{ color: 'var(--foreground-tertiary)' }}>
              {Math.round(currentProgress)}%
            </span>
          </div>
        </div>

        {/* ETA / elapsed */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{ color: 'var(--foreground-tertiary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
              {formatTime(elapsedSec)} elapsed
            </span>
          </div>
          {etaRemaining !== null && etaRemaining > 0 && (
            <>
              <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
                ~{formatTime(etaRemaining)} remaining
              </span>
            </>
          )}
        </div>
      </div>
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
