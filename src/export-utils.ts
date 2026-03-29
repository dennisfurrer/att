import type { Segment, Speaker, ExportFormat } from './types'
import { formatTimestamp } from './audio-utils'

function getSpeakerName(speakerId: string, speakers: Speaker[]): string {
  return speakers.find((s) => s.id === speakerId)?.name ?? 'Unknown'
}

function srtTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
}

function vttTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

export function exportTranscript(
  segments: Segment[],
  speakers: Speaker[],
  format: ExportFormat,
): string {
  switch (format) {
    case 'txt':
      return segments
        .map((seg) => {
          const ts = formatTimestamp(seg.start)
          const name = getSpeakerName(seg.speakerId, speakers)
          return `[${ts}] ${name}: ${seg.text.trim()}`
        })
        .join('\n')

    case 'json':
      return JSON.stringify(
        segments.map((seg) => ({
          speaker: getSpeakerName(seg.speakerId, speakers),
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        })),
        null,
        2,
      )

    case 'srt':
      return segments
        .map((seg, i) => {
          const name = getSpeakerName(seg.speakerId, speakers)
          return `${i + 1}\n${srtTimestamp(seg.start)} --> ${srtTimestamp(seg.end)}\n${name}: ${seg.text.trim()}`
        })
        .join('\n\n')

    case 'vtt':
      return (
        'WEBVTT\n\n' +
        segments
          .map((seg, i) => {
            const name = getSpeakerName(seg.speakerId, speakers)
            return `${i + 1}\n${vttTimestamp(seg.start)} --> ${vttTimestamp(seg.end)}\n<v ${name}>${seg.text.trim()}</v>`
          })
          .join('\n\n')
      )
  }
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const EXPORT_MIME: Record<ExportFormat, string> = {
  txt: 'text/plain',
  json: 'application/json',
  srt: 'text/plain',
  vtt: 'text/vtt',
}
