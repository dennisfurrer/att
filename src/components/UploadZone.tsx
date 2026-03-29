import { useRef, useState, useCallback } from 'react'
import { formatFileSize } from '../audio-utils'

type Props = {
  onFile: (file: File) => void
}

const ACCEPTED = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/x-m4a', 'audio/m4a', 'video/webm']
const ACCEPTED_EXT = '.mp3,.wav,.m4a,.webm,.ogg'

export function UploadZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    (file: File) => {
      const ok = ACCEPTED.some((t) => file.type === t) || ACCEPTED_EXT.split(',').some((ext) => file.name.endsWith(ext.trim()))
      if (!ok) {
        setError(`Unsupported format: ${file.type || file.name}. Use mp3, wav, m4a, webm, or ogg.`)
        return
      }
      setError(null)
      onFile(file)
    },
    [onFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" strokeLinecap="round" />
          </svg>
          <h1 className="text-2xl font-semibold text-white tracking-tight">ATT</h1>
        </div>
        <p className="text-zinc-400 text-sm">Audio Transcription Tool · Runs entirely in your browser</p>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload audio file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          relative w-full max-w-lg rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer
          transition-all duration-200 outline-none
          ${dragging
            ? 'border-violet-400 bg-violet-500/10 scale-[1.02]'
            : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-800/50'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          onChange={onInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          <div className={`p-4 rounded-xl transition-colors ${dragging ? 'bg-violet-500/20' : 'bg-zinc-800'}`}>
            <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <p className="text-white font-medium mb-1">Drop an audio file here</p>
            <p className="text-zinc-500 text-sm">or click to browse</p>
          </div>
          <p className="text-zinc-600 text-xs">mp3 · wav · m4a · webm · ogg</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 max-w-lg w-full px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* File size hint */}
      <p className="mt-6 text-zinc-600 text-xs text-center max-w-sm">
        Model files are downloaded once and cached by the browser (~75 MB for tiny, ~150 MB for base).
        All audio stays on your device — nothing is sent to a server.
      </p>

      {/* Format badge row */}
      <div className="mt-8 flex gap-2 flex-wrap justify-center">
        {['Whisper', 'Speaker Labels', 'TXT / JSON / SRT / VTT'].map((label) => (
          <span key={label} className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs border border-zinc-700">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// Utility shown in file info bar
export function FileInfoBar({ file, duration }: { file: File; duration: number | null }) {
  const formatDur = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-sm">
      <svg className="w-4 h-4 text-violet-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
      <span className="text-white font-medium truncate max-w-xs">{file.name}</span>
      <span className="text-zinc-500">{formatFileSize(file.size)}</span>
      {duration !== null && <span className="text-zinc-500">{formatDur(duration)}</span>}
    </div>
  )
}
