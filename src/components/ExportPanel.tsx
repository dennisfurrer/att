import { useState } from 'react'
import type { Segment, Speaker, ExportFormat } from '../types'
import { exportTranscript, downloadFile, EXPORT_MIME } from '../export-utils'

type Props = {
  segments: Segment[]
  speakers: Speaker[]
  fileName: string
  /** When true, renders as a full-page panel (mobile tab view) */
  fullPage?: boolean
}

const FORMATS: { id: ExportFormat; label: string; description: string }[] = [
  { id: 'txt', label: 'TXT', description: '[00:01:23] Speaker: text...' },
  { id: 'json', label: 'JSON', description: 'Structured {speaker, start, end, text}' },
  { id: 'srt', label: 'SRT', description: 'Subtitle format for video editors' },
  { id: 'vtt', label: 'VTT', description: 'WebVTT for HTML5 video captions' },
]

export function ExportPanel({ segments, speakers, fileName, fullPage }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const baseName = fileName.replace(/\.[^.]+$/, '')

  const handleExport = (format: ExportFormat) => {
    const content = exportTranscript(segments, speakers, format)
    downloadFile(content, `${baseName}.${ext(format)}`, EXPORT_MIME[format])
    setOpen(false)
  }

  const handleCopy = async () => {
    const content = exportTranscript(segments, speakers, 'txt')
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (fullPage) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--foreground-tertiary)' }}>
          Export
        </p>

        {/* Copy to clipboard */}
        <button
          onClick={handleCopy}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98]"
          style={{
            background: copied ? 'rgba(45,212,191,0.06)' : 'rgba(0,0,0,0.35)',
            border: copied ? '1px solid rgba(45,212,191,0.2)' : '1px solid rgba(255,255,255,0.04)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
            color: copied ? '#2dd4bf' : 'var(--foreground-secondary)',
          }}
        >
          {copied ? (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
            </svg>
          )}
          <span className="text-[13px] font-medium">{copied ? 'Copied to clipboard' : 'Copy as plain text'}</span>
        </button>

        {/* Format downloads */}
        {FORMATS.map((fmt) => (
          <button
            key={fmt.id}
            onClick={() => handleExport(fmt.id)}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-all active:scale-[0.98]"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.04)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider w-10 shrink-0" style={{ color: '#2dd4bf' }}>
              .{fmt.id}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">{fmt.label}</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--foreground-tertiary)' }}>{fmt.description}</p>
            </div>
            <svg className="w-4 h-4 ml-auto shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{ color: 'var(--foreground-tertiary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="relative flex items-center gap-2">
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all active:scale-[0.97]"
        style={{
          background: copied ? 'rgba(45,212,191,0.06)' : 'rgba(255,255,255,0.04)',
          border: copied ? '1px solid rgba(45,212,191,0.2)' : '1px solid rgba(255,255,255,0.06)',
          color: copied ? '#2dd4bf' : 'var(--foreground-secondary)',
        }}
        title="Copy transcript as plain text"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
          </svg>
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>

      {/* Export dropdown trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all active:scale-[0.97]"
        style={{
          background: 'linear-gradient(180deg, #34d9c4 0%, #1aab98 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 16px rgba(45,212,191,0.2)',
          color: '#09090b',
        }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Export
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 z-20 rounded-xl overflow-hidden w-60"
            style={{
              background: 'linear-gradient(180deg, rgba(18,18,22,0.98) 0%, rgba(12,12,15,0.98) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderTopColor: 'rgba(255,255,255,0.09)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(24px)',
            }}
          >
            <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--foreground-tertiary)' }}>
                Download as
              </p>
            </div>
            {FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => handleExport(fmt.id)}
                className="flex items-start gap-3 w-full px-3 py-2.5 text-left transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider w-8 shrink-0 mt-0.5" style={{ color: '#2dd4bf' }}>
                  .{fmt.id}
                </span>
                <div>
                  <p className="text-[12px] text-white font-medium">{fmt.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--foreground-tertiary)' }}>{fmt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ext(format: ExportFormat) {
  return format
}
