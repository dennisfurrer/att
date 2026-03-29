import { useState } from 'react'
import type { Segment, Speaker, ExportFormat } from '../types'
import { exportTranscript, downloadFile, EXPORT_MIME } from '../export-utils'

type Props = {
  segments: Segment[]
  speakers: Speaker[]
  fileName: string
}

const FORMATS: { id: ExportFormat; label: string; description: string }[] = [
  { id: 'txt', label: 'TXT', description: '[00:01:23] Speaker: text...' },
  { id: 'json', label: 'JSON', description: 'Structured {speaker, start, end, text}' },
  { id: 'srt', label: 'SRT', description: 'Subtitle format for video editors' },
  { id: 'vtt', label: 'VTT', description: 'WebVTT for HTML5 video captions' },
]

export function ExportPanel({ segments, speakers, fileName }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const baseName = fileName.replace(/\.[^.]+$/, '')

  const handleExport = (format: ExportFormat) => {
    const content = exportTranscript(segments, speakers, format)
    const ext = format
    downloadFile(content, `${baseName}.${ext}`, EXPORT_MIME[format])
    setOpen(false)
  }

  const handleCopy = async () => {
    const content = exportTranscript(segments, speakers, 'txt')
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
          title="Copy transcript as plain text"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>

        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden w-64">
            <div className="px-3 py-2 border-b border-zinc-700">
              <p className="text-xs text-zinc-500">Download as</p>
            </div>
            {FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => handleExport(fmt.id)}
                className="flex items-start gap-3 w-full px-3 py-2.5 text-left hover:bg-zinc-700 transition-colors"
              >
                <span className="text-xs font-mono font-bold text-violet-400 w-8 shrink-0 mt-0.5">
                  .{fmt.id}
                </span>
                <div>
                  <p className="text-sm text-zinc-200 font-medium">{fmt.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{fmt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
