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
    <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-12">
      {/* Brand */}
      <div className="mb-10 text-center stagger">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.15)' }}>
            <svg className="w-5 h-5" fill="none" stroke="#2dd4bf" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">ATT</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
          Audio Transcription Tool — runs entirely in your browser
        </p>
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
          relative w-full max-w-md rounded-xl cursor-pointer outline-none
          transition-all duration-200 active:scale-[0.98]
          ${dragging ? 'glow-accent' : ''}
        `}
        style={{
          background: dragging
            ? 'linear-gradient(180deg, rgba(45,212,191,0.06) 0%, rgba(45,212,191,0.02) 100%)'
            : 'linear-gradient(180deg, rgba(14,14,18,0.9) 0%, rgba(10,10,13,0.85) 100%)',
          border: dragging
            ? '1px solid rgba(45,212,191,0.4)'
            : '1px solid rgba(255,255,255,0.05)',
          borderTopColor: dragging ? 'rgba(45,212,191,0.5)' : 'rgba(255,255,255,0.09)',
          boxShadow: dragging
            ? '0 0 30px rgba(45,212,191,0.10), 0 1px 2px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)'
            : '0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          onChange={onInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-5 px-8 py-12">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-200"
            style={{
              background: dragging ? 'rgba(45,212,191,0.12)' : 'rgba(0,0,0,0.35)',
              border: dragging ? '1px solid rgba(45,212,191,0.25)' : '1px solid rgba(255,255,255,0.04)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)',
            }}
          >
            <svg
              className="w-7 h-7 transition-colors duration-200"
              fill="none"
              stroke={dragging ? '#2dd4bf' : '#52525b'}
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </div>

          <div className="text-center">
            <p className="text-[15px] font-semibold text-white mb-1">
              {dragging ? 'Release to load' : 'Drop audio file here'}
            </p>
            <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>or click to browse</p>
          </div>

          <div className="flex items-center gap-2">
            {['mp3', 'wav', 'm4a', 'webm', 'ogg'].map((ext) => (
              <span
                key={ext}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--foreground-tertiary)',
                }}
              >
                {ext}
              </span>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div
          className="mt-4 max-w-md w-full px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'rgba(244,63,94,0.06)',
            border: '1px solid rgba(244,63,94,0.2)',
            color: '#fb7185',
          }}
        >
          {error}
        </div>
      )}

      {/* Feature badges */}
      <div className="mt-8 flex gap-2 flex-wrap justify-center">
        {['Whisper ASR', 'Speaker Labels', 'TXT / JSON / SRT / VTT', '100% Local'].map((label) => (
          <span
            key={label}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'var(--foreground-tertiary)',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <p className="mt-5 text-xs text-center max-w-sm" style={{ color: '#3f3f46' }}>
        Model weights (~75–250 MB) download once and cache in the browser. No audio is ever uploaded.
      </p>
    </div>
  )
}

// ── File info bar shown in the main header ──────────────────────────────────

export function FileInfoBar({ file, duration }: { file: File; duration: number | null }) {
  const formatDur = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="#2dd4bf" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
      <span className="text-[13px] font-medium text-white truncate max-w-[160px] md:max-w-xs">{file.name}</span>
      <span className="text-[11px] font-mono shrink-0" style={{ color: 'var(--foreground-tertiary)' }}>
        {formatFileSize(file.size)}
      </span>
      {duration !== null && (
        <span className="text-[11px] font-mono shrink-0" style={{ color: 'var(--foreground-tertiary)' }}>
          {formatDur(duration)}
        </span>
      )}
    </div>
  )
}
