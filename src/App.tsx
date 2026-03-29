import { useState, useCallback, useRef, useEffect } from 'react'
import type { Segment, Speaker, ModelSize, TranscriptionStatus, WorkerOutMessage, WhisperChunk } from './types'
import { decodeAudioFile, getAudioDuration, hasSilenceGap } from './audio-utils'
import { UploadZone, FileInfoBar } from './components/UploadZone'
import { TranscriptEditor } from './components/TranscriptEditor'
import { SpeakerPanel } from './components/SpeakerPanel'
import { ExportPanel } from './components/ExportPanel'
import { AudioPlayer } from './components/AudioPlayer'
import { AnalyticsPanel } from './components/AnalyticsPanel'

// ── Default speakers ────────────────────────────────────────────────────────

const DEFAULT_SPEAKERS: Speaker[] = [
  { id: 's1', name: 'Speaker 1', color: '#a78bfa' },
  { id: 's2', name: 'Speaker 2', color: '#34d399' },
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

// ── App ────────────────────────────────────────────────────────────────────

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
  const [view, setView] = useState<'transcript' | 'analytics'>('transcript')

  const workerRef = useRef<Worker | null>(null)

  // ── File upload ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setError(null)
    setSegments([])
    setSelectedIds(new Set())
    setActiveSegmentId(null)
    setStatus('idle')

    // Get duration for display
    try {
      const dur = await getAudioDuration(f)
      setDuration(dur)
    } catch {
      setDuration(null)
    }
  }, [])

  // ── Transcription ────────────────────────────────────────────────────────

  const startTranscription = useCallback(async () => {
    if (!file) return
    setError(null)
    setStatus('loading-model')
    setModelProgress(null)
    setTranscribeProgress(0)

    console.log('[ATT] ── Starting transcription ──────────────────────────')
    console.log(`[ATT] File: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB, type: ${file.type})`)
    console.log(`[ATT] Model size: ${modelSize}`)

    try {
      console.log('[ATT] Decoding audio to mono Float32 @ 16kHz…')
      const t0 = performance.now()
      const data = await decodeAudioFile(file)
      console.log(`[ATT] Audio decoded in ${((performance.now() - t0) / 1000).toFixed(2)}s — ${data.length} samples (${(data.length / 16000).toFixed(1)}s)`)

      // Terminate previous worker
      if (workerRef.current) {
        console.log('[ATT] Terminating previous worker')
        workerRef.current.terminate()
      }

      console.log('[ATT] Spawning Web Worker…')
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
          console.log(`[ATT] Result received — ${msg.chunks.length} chunks → ${segs.length} segments`)
          segs.forEach((s, i) =>
            console.log(`[ATT]   seg ${i + 1}: [${s.start.toFixed(1)}→${s.end.toFixed(1)}s] ${s.silenceGapBefore ? '(silence gap) ' : ''}"${s.text.slice(0, 60)}${s.text.length > 60 ? '…' : ''}"`)
          )
          setSegments(segs)
          setStatus('done')
        } else if (msg.type === 'error') {
          console.error('[ATT] Worker error:', msg.message)
          setError(msg.message)
          setStatus('error')
        }
      }

      worker.onerror = (e) => {
        console.error('[ATT] Uncaught worker error:', e.message, e)
        setError(e.message)
        setStatus('error')
      }

      console.log('[ATT] Posting transcribe message to worker…')
      worker.postMessage({ type: 'transcribe', audioData: data, modelSize })
    } catch (err) {
      console.error('[ATT] Error before worker:', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [file, modelSize, speakers])

  // Cleanup worker on unmount
  useEffect(() => {
    return () => workerRef.current?.terminate()
  }, [])

  // ── Segment mutation ─────────────────────────────────────────────────────

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
    setSegments((prev) =>
      prev.map((s) => (selectedIds.has(s.id) ? { ...s, speakerId } : s)),
    )
    setManuallyAssignedIds((prev) => new Set([...prev, ...selectedIds]))
  }, [selectedIds])

  // ── Auto-assign & clear ──────────────────────────────────────────────────

  const handleAutoAssign = useCallback(() => {
    setSegments((prev) => {
      // Build anchors: segments that have been manually labeled
      const anchors = prev
        .map((seg, idx) => ({ seg, idx }))
        .filter(({ seg }) => manuallyAssignedIds.has(seg.id))

      if (anchors.length === 0) return prev

      return prev.map((seg, idx) => {
        // Don't override manual labels
        if (manuallyAssignedIds.has(seg.id)) return seg

        // Find nearest anchor by index — ties go to earlier anchor
        let nearest = anchors[0]
        let minDist = Math.abs(idx - anchors[0].idx)
        for (const anchor of anchors) {
          const dist = Math.abs(idx - anchor.idx)
          if (dist < minDist) {
            minDist = dist
            nearest = anchor
          }
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

  // ── Speaker mutation ─────────────────────────────────────────────────────

  const handleAddSpeaker = useCallback(() => {
    const colors = ['#f87171', '#60a5fa', '#fbbf24', '#f472b6', '#2dd4bf', '#a3e635', '#fb923c']
    const color = colors[(speakerCounter - 1) % colors.length]
    const newSpeaker: Speaker = {
      id: makeId(),
      name: `Speaker ${speakerCounter}`,
      color,
    }
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
      // Reassign segments from removed speaker to first remaining
      const fallback = next[0]?.id
      if (fallback) {
        setSegments((segs) =>
          segs.map((s) => (s.speakerId === id ? { ...s, speakerId: fallback } : s)),
        )
      }
      return next
    })
  }, [])

  // ── Segment count by speaker ─────────────────────────────────────────────

  const segmentCountBySpeaker: Record<string, number> = {}
  for (const seg of segments) {
    segmentCountBySpeaker[seg.speakerId] = (segmentCountBySpeaker[seg.speakerId] ?? 0) + 1
  }

  // ── Play segment ─────────────────────────────────────────────────────────

  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  const handlePlaySegment = useCallback((seg: Segment) => {
    const audio = audioElementRef.current
    if (!audio) return
    audio.currentTime = seg.start
    audio.play()
    setActiveSegmentId(seg.id)
  }, [])

  // ── Reset ────────────────────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────

  if (!file) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <UploadZone onFile={handleFile} />
      </div>
    )
  }

  const isProcessing = status === 'loading-model' || status === 'transcribing'

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 flex items-center gap-4 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
          title="Upload new file"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          New
        </button>

        <div className="w-px h-4 bg-zinc-700" />

        {/* File name */}
        <span className="text-sm text-zinc-300 font-medium truncate max-w-xs">{file.name}</span>

        <div className="flex-1" />

        {/* Model selector */}
        {status === 'idle' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Model</span>
            <select
              value={modelSize}
              onChange={(e) => setModelSize(e.target.value as ModelSize)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-sm text-zinc-200 outline-none focus:border-violet-500 transition-colors"
            >
              <option value="tiny">Tiny (~75 MB)</option>
              <option value="base">Base (~150 MB)</option>
              <option value="small">Small (~250 MB)</option>
            </select>
          </div>
        )}

        {/* Transcribe / progress */}
        {status === 'idle' && (
          <button
            onClick={startTranscription}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
            Transcribe
          </button>
        )}

        {isProcessing && (
          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-400">
              {status === 'loading-model' ? (
                modelProgress
                  ? `Downloading ${modelProgress.file.split('/').pop()} — ${Math.round(modelProgress.progress)}%`
                  : 'Loading model…'
              ) : (
                `Transcribing — ${Math.round(transcribeProgress)}%`
              )}
            </div>
            <div className="w-32 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-[width] duration-300"
                style={{
                  width: status === 'loading-model'
                    ? `${modelProgress?.progress ?? 0}%`
                    : `${transcribeProgress}%`,
                }}
              />
            </div>
          </div>
        )}

        {status === 'done' && segments.length > 0 && (
          <>
            {/* View toggle */}
            <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
              {(['transcript', 'analytics'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 capitalize transition-colors ${view === v ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {v === 'analytics' ? '📊 Analytics' : '📝 Transcript'}
                </button>
              ))}
            </div>
            <ExportPanel segments={segments} speakers={speakers} fileName={file.name} />
          </>
        )}

        {status === 'error' && (
          <button
            onClick={startTranscription}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
          >
            Retry
          </button>
        )}
      </header>

      {/* File info bar */}
      <FileInfoBar file={file} duration={duration} />

      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-4 py-2.5 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Main content */}
      {status === 'idle' && segments.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          <div className="text-center space-y-3">
            <svg className="w-12 h-12 mx-auto text-zinc-700" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
            <p>Click <strong className="text-zinc-400">Transcribe</strong> to start.</p>
            <p className="text-zinc-600 text-xs">The model runs entirely in your browser — nothing is uploaded.</p>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm">
              {status === 'loading-model' ? 'Downloading model weights…' : 'Transcribing audio…'}
            </p>
            <p className="text-zinc-600 text-xs">This may take a few minutes for longer recordings.</p>
          </div>
        </div>
      )}

      {(status === 'done' || segments.length > 0) && (
        <div className="flex-1 flex min-h-0">
          {view === 'transcript' ? (
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
      )}

      {/* Audio player */}
      {file && (status === 'done' || segments.length > 0) && (
        <AudioPlayer
          file={file}
          segments={segments}
          currentSegmentId={activeSegmentId}
          onSegmentChange={setActiveSegmentId}
        />
      )}

      {/* Hidden audio element ref bridge */}
      <AudioElementBridge onReady={(el) => { audioElementRef.current = el }} />
    </div>
  )
}

// A hidden component that exposes the audio element from AudioPlayer to App
// We use a simpler approach: AudioPlayer renders its own <audio> and we
// communicate play-segment via a ref passed down. Instead, we wire it via
// a custom event from the AudioPlayer component.
function AudioElementBridge({ onReady }: { onReady: (el: HTMLAudioElement) => void }) {
  useEffect(() => {
    // Find the audio element rendered by AudioPlayer
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
