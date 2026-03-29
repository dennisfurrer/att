import { useRef, useState, useEffect, useCallback } from 'react'
import type { Segment } from '../types'
import { formatDuration } from '../audio-utils'

type Props = {
  file: File
  segments: Segment[]
  currentSegmentId: string | null
  onSegmentChange: (id: string) => void
}

export function AudioPlayer({ file, segments, currentSegmentId, onSegmentChange }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [srcUrl, setSrcUrl] = useState<string>('')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrcUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      const seg = segments.find((s) => audio.currentTime >= s.start && audio.currentTime <= s.end)
      if (seg && seg.id !== currentSegmentId) onSegmentChange(seg.id)
    }
    const onDurationChange = () => setDuration(audio.duration)
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => { setPlaying(false); setCurrentTime(0) }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [segments, currentSegmentId, onSegmentChange])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
  }, [])

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Number(e.target.value)
    setCurrentTime(Number(e.target.value))
  }

  const skipBack = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, audio.currentTime - 10)
  }

  const skipForward = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.min(duration, audio.currentTime + 10)
  }

  const pct = duration ? (currentTime / duration) * 100 : 0

  return (
    <div
      className="shrink-0 px-4 py-3 border-t"
      style={{
        background: 'rgba(9, 9, 11, 0.92)',
        backdropFilter: 'blur(24px) saturate(1.2)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <audio ref={audioRef} src={srcUrl} preload="metadata" />

      <div className="flex items-center gap-3 max-w-4xl mx-auto">
        {/* Skip back */}
        <button
          onClick={skipBack}
          className="p-1.5 rounded-lg transition-colors active:scale-[0.95]"
          style={{ color: 'var(--foreground-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--foreground-tertiary)')}
          title="Back 10s"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6a1 1 0 0 1 1 1v4.615L17.362 6.2A1 1 0 0 1 19 7v10a1 1 0 0 1-1.638.8L7 12.385V17a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Z"/>
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#09090b] font-bold transition-all active:scale-[0.94]"
          style={{
            background: 'linear-gradient(180deg, #34d9c4 0%, #1aab98 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 16px rgba(45,212,191,0.25)',
          }}
        >
          {playing ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 3l14 9-14 9V3z" />
            </svg>
          )}
        </button>

        {/* Skip forward */}
        <button
          onClick={skipForward}
          className="p-1.5 rounded-lg transition-colors active:scale-[0.95]"
          style={{ color: 'var(--foreground-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--foreground-tertiary)')}
          title="Forward 10s"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 6a1 1 0 0 1 1 1v10a1 1 0 0 1-1.638.8L7 12.385V17a1 1 0 1 1-2 0V7a1 1 0 0 1 1.638-.8L17 11.615V7a1 1 0 0 1 1-1Z"/>
          </svg>
        </button>

        {/* Time */}
        <span className="text-[11px] font-mono shrink-0 tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
          {formatDuration(currentTime)}
        </span>

        {/* Seek bar */}
        <div className="seek-wrapper flex-1 relative h-1 group cursor-pointer" style={{ marginTop: 0 }}>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="absolute inset-0 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-100"
              style={{ width: `${pct}%`, background: '#2dd4bf' }}
            />
          </div>
          {/* Playhead dot — appears on hover */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${pct}%`, background: '#2dd4bf', boxShadow: '0 0 8px rgba(45,212,191,0.5)' }}
          />
        </div>

        {/* Total */}
        <span className="text-[11px] font-mono shrink-0 tabular-nums" style={{ color: 'var(--foreground-tertiary)' }}>
          {formatDuration(duration)}
        </span>
      </div>
    </div>
  )
}
