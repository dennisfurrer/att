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

      // Find current segment
      const seg = segments.find(
        (s) => audio.currentTime >= s.start && audio.currentTime <= s.end,
      )
      if (seg && seg.id !== currentSegmentId) {
        onSegmentChange(seg.id)
      }
    }

    const onDurationChange = () => setDuration(audio.duration)
    const onPlay = () => setPlaying(true)
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

  return (
    <div className="bg-zinc-900 border-t border-zinc-800 px-6 py-3">
      <audio ref={audioRef} src={srcUrl} preload="metadata" />

      <div className="flex items-center gap-4">
        {/* Controls */}
        <button
          onClick={skipBack}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Back 10s"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 0 0 0 1.6l5.334 4A1 1 0 0 0 19 16V8a1 1 0 0 0-1.6-.8l-5.334 4Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.066 11.2a1 1 0 0 0 0 1.6l5.334 4A1 1 0 0 0 11 16V8a1 1 0 0 0-1.6-.8l-5.334 4Z" />
          </svg>
        </button>

        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center text-white transition-colors shrink-0"
        >
          {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 3l14 9-14 9V3z" />
            </svg>
          )}
        </button>

        <button
          onClick={skipForward}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Forward 10s"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 0 0 0-1.6L6.6 7.2A1 1 0 0 0 5 8v8a1 1 0 0 0 1.6.8l5.333-4Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.933 12.8a1 1 0 0 0 0-1.6l-5.333-4A1 1 0 0 0 13 8v8a1 1 0 0 0 1.6.8l5.333-4Z" />
          </svg>
        </button>

        {/* Time */}
        <span className="text-zinc-400 text-xs font-mono shrink-0 w-24 text-right">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>

        {/* Seek bar */}
        <div className="flex-1 relative h-1.5 group">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer z-10 h-full"
          />
          <div className="w-full h-full bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-[width] duration-100"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

    </div>
  )
}
