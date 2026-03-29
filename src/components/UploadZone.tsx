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
        setError(`Unsupported format: ${file.type || file.name}`)
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
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-16 overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      {/* Deep ambient glow behind content */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '400px',
          background: 'radial-gradient(ellipse at center, rgba(45,212,191,0.04) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Brand mark */}
      <div className="relative z-10 mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          {/* Icon — recessed inset well */}
          <div
            className="w-11 h-11 flex items-center justify-center"
            style={{
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderTopColor: 'rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.03)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
              <path
                d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                stroke="#2dd4bf"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M9 22h6"
                stroke="#2dd4bf"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1
              className="font-display text-[22px] font-semibold tracking-tight leading-none"
              style={{ color: 'var(--foreground)' }}
            >
              ATT
            </h1>
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mt-0.5" style={{ color: 'var(--foreground-tertiary)' }}>
              Audio Transcription Tool
            </p>
          </div>
        </div>
      </div>

      {/* Drop zone — primary card */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload audio file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="relative z-10 w-full max-w-[460px] cursor-pointer outline-none transition-all duration-200 active:scale-[0.99]"
        style={{
          background: dragging
            ? 'linear-gradient(180deg, rgba(45,212,191,0.05) 0%, rgba(0,0,0,0.4) 100%)'
            : 'linear-gradient(180deg, rgba(16,16,20,0.95) 0%, rgba(9,9,11,0.9) 100%)',
          border: dragging ? '1px solid rgba(45,212,191,0.35)' : '1px solid rgba(255,255,255,0.05)',
          borderTopColor: dragging ? 'rgba(45,212,191,0.5)' : 'rgba(255,255,255,0.10)',
          boxShadow: dragging
            ? '0 0 0 1px rgba(45,212,191,0.08), 0 0 40px rgba(45,212,191,0.08), 0 2px 4px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.4)'
            : '0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 4px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.35), 0 24px 64px rgba(0,0,0,0.2)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          onChange={onInputChange}
          className="hidden"
        />

        {/* Top edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: dragging
              ? 'linear-gradient(90deg, transparent 0%, rgba(45,212,191,0.5) 50%, transparent 100%)'
              : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
          }}
        />

        <div className="flex flex-col items-center px-10 py-14">
          {/* Upload icon container */}
          <div
            className="mb-7 w-16 h-16 flex items-center justify-center transition-all duration-200"
            style={{
              background: dragging ? 'rgba(45,212,191,0.08)' : 'rgba(0,0,0,0.4)',
              border: dragging ? '1px solid rgba(45,212,191,0.2)' : '1px solid rgba(255,255,255,0.04)',
              borderTopColor: dragging ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.07)',
              boxShadow: dragging
                ? 'inset 0 2px 8px rgba(0,0,0,0.5), 0 0 20px rgba(45,212,191,0.08)'
                : 'inset 0 2px 8px rgba(0,0,0,0.6)',
            }}
          >
            {dragging ? (
              <svg className="w-7 h-7" fill="none" stroke="#2dd4bf" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
            ) : (
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24">
                {/* Waveform-style icon */}
                <rect x="3" y="9" width="2" height="6" rx="1" fill="rgba(45,212,191,0.3)" />
                <rect x="7" y="5" width="2" height="14" rx="1" fill="rgba(45,212,191,0.5)" />
                <rect x="11" y="3" width="2" height="18" rx="1" fill="#2dd4bf" />
                <rect x="15" y="6" width="2" height="12" rx="1" fill="rgba(45,212,191,0.5)" />
                <rect x="19" y="10" width="2" height="4" rx="1" fill="rgba(45,212,191,0.3)" />
              </svg>
            )}
          </div>

          {/* Text */}
          <p
            className="text-[16px] font-semibold mb-2 tracking-tight"
            style={{ color: dragging ? '#2dd4bf' : 'var(--foreground)' }}
          >
            {dragging ? 'Release to load' : 'Drop audio file here'}
          </p>
          <p className="text-[13px] mb-8" style={{ color: 'var(--foreground-tertiary)' }}>
            or <span style={{ color: 'var(--foreground-secondary)' }}>click to browse</span>
          </p>

          {/* Format chips */}
          <div className="flex items-center gap-1.5">
            {['MP3', 'WAV', 'M4A', 'WEBM', 'OGG'].map((ext) => (
              <span
                key={ext}
                className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: 'var(--foreground-tertiary)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
                }}
              >
                {ext}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom edge — subtle separator line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="relative z-10 mt-3 max-w-[460px] w-full px-4 py-3 text-[12px]"
          style={{
            background: 'rgba(244,63,94,0.05)',
            border: '1px solid rgba(244,63,94,0.18)',
            color: '#fb7185',
          }}
        >
          {error}
        </div>
      )}

      {/* Feature grid */}
      <div className="relative z-10 mt-10 w-full max-w-[460px] grid grid-cols-2 gap-2">
        {[
          { label: 'Whisper ASR', desc: 'State-of-the-art speech recognition' },
          { label: 'Speaker Labels', desc: 'Multi-speaker diarization' },
          { label: 'TXT / SRT / VTT / JSON', desc: 'Export in any format' },
          { label: '100% Local', desc: 'No audio ever leaves your device' },
        ].map((f) => (
          <div
            key={f.label}
            className="px-3.5 py-3"
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderTopColor: 'rgba(255,255,255,0.06)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            <p className="text-[11px] font-semibold text-white mb-0.5">{f.label}</p>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--foreground-tertiary)' }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Privacy note */}
      <p
        className="relative z-10 mt-6 text-[11px] text-center max-w-[360px] leading-relaxed"
        style={{ color: '#3f3f46' }}
      >
        Model weights (~75–250 MB) download once and cache locally. Zero server calls — everything runs in WebAssembly.
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
      <span className="text-[11px] font-mono shrink-0 tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
        {formatFileSize(file.size)}
      </span>
      {duration !== null && (
        <span className="text-[11px] font-mono shrink-0 tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
          {formatDur(duration)}
        </span>
      )}
    </div>
  )
}
