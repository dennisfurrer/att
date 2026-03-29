import { useMemo, useState } from 'react'
import type { Segment, Speaker } from '../types'

type Props = {
  segments: Segment[]
  speakers: Speaker[]
}

type WordTab = 'words' | 'time'

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function avgWordsPerSentence(text: string) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim())
  if (!sentences.length) return 0
  return countWords(text) / sentences.length
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`
}

export function AnalyticsPanel({ segments, speakers }: Props) {
  const [wordTab, setWordTab] = useState<WordTab>('words')

  const stats = useMemo(() => {
    if (!segments.length) return null

    const bySpeaker: Record<string, {
      speaker: Speaker
      segments: Segment[]
      totalTime: number
      totalWords: number
      turns: number
    }> = {}

    const speakerMap = new Map(speakers.map((s) => [s.id, s]))

    for (const seg of segments) {
      const sp = speakerMap.get(seg.speakerId)
      const key = seg.speakerId
      if (!bySpeaker[key]) {
        bySpeaker[key] = {
          speaker: sp ?? { id: key, name: 'Unknown', color: '#52525b' },
          segments: [],
          totalTime: 0,
          totalWords: 0,
          turns: 0,
        }
      }
      const duration = seg.end - seg.start
      bySpeaker[key].segments.push(seg)
      bySpeaker[key].totalTime += duration
      bySpeaker[key].totalWords += countWords(seg.text)
      bySpeaker[key].turns++
    }

    const entries = Object.values(bySpeaker)
    const totalTime = entries.reduce((s, e) => s + e.totalTime, 0)
    const totalWords = entries.reduce((s, e) => s + e.totalWords, 0)
    const totalSegments = segments.length

    entries.sort((a, b) => b.totalWords - a.totalWords)

    const allText = segments.map((s) => s.text).join(' ')
    const avgSegDuration = totalTime / totalSegments
    const longestSeg = segments.reduce((best, s) => (s.end - s.start > best.end - best.start ? s : best))
    const shortestSeg = segments.reduce((best, s) => (s.end - s.start < best.end - best.start ? s : best))

    const silenceGaps = segments.filter((s) => s.silenceGapBefore)
    const silenceCount = silenceGaps.length

    let speakerChanges = 0
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].speakerId !== segments[i - 1].speakerId) speakerChanges++
    }

    for (const e of entries) {
      const texts = e.segments.map((s) => s.text).join(' ')
      e.totalWords = countWords(texts)
    }

    const questionSegments = segments.filter((s) => s.text.trim().endsWith('?'))

    const paceEntries = entries.map((e) => ({
      name: e.speaker.name,
      color: e.speaker.color,
      wpm: e.totalTime > 0 ? (e.totalWords / e.totalTime) * 60 : 0,
    }))

    const avgTurnLength = totalTime / entries.reduce((s, e) => s + e.turns, 0)

    let maxStreak = 0
    let maxStreakSpeaker = ''
    let curStreak = 0
    let curSpeaker = ''
    for (const seg of segments) {
      if (seg.speakerId === curSpeaker) {
        curStreak++
      } else {
        curSpeaker = seg.speakerId
        curStreak = 1
      }
      if (curStreak > maxStreak) {
        maxStreak = curStreak
        maxStreakSpeaker = seg.speakerId
      }
    }
    const streakSpeakerName = speakerMap.get(maxStreakSpeaker)?.name ?? 'Unknown'

    const allWords = allText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
    const uniqueWords = new Set(allWords).size
    const vocabRichness = allWords.length > 0 ? uniqueWords / allWords.length : 0

    const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'i', 'you', 'we', 'they', 'it', 'that', 'this', 'be', 'have', 'has', 'had', 'do', 'did', 'not', 'so', 'if', 'as', 'by', 'from', 'up', 'about', 'into', 'than', 'then', 'its', 'my', 'our', 'your', 'their', 'just', 'like', 'also', 'can', 'will', 'would', 'could', 'should', 'going', 'know', 'think', 'yeah', 'okay', 'right', 'um', 'uh', 'well'])
    const wordFreq: Record<string, number> = {}
    for (const w of allWords) {
      if (!STOP.has(w) && w.length > 2) wordFreq[w] = (wordFreq[w] ?? 0) + 1
    }
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 8)

    const interruptions = segments.filter((s, i) => {
      if (i === 0) return false
      return (s.end - s.start) < 3 && segments[i - 1].speakerId !== s.speakerId
    }).length

    return {
      entries,
      totalTime,
      totalWords,
      totalSegments,
      silenceCount,
      speakerChanges,
      questionSegments: questionSegments.length,
      paceEntries,
      avgTurnLength,
      avgSegDuration,
      longestSeg,
      shortestSeg,
      maxStreak,
      streakSpeakerName,
      uniqueWords,
      vocabRichness,
      topWords,
      interruptions,
      avgWordsPerSentence: avgWordsPerSentence(allText),
    }
  }, [segments, speakers])

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: 'var(--foreground-tertiary)' }}>
        No transcript to analyze yet
      </div>
    )
  }

  const { entries, totalTime, totalWords, totalSegments } = stats

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6">

      {/* ── Conversation dominance ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--foreground-tertiary)' }}>
            Conversation Dominance
          </p>
          {/* Tab toggle */}
          <div
            className="flex rounded overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {(['words', 'time'] as WordTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setWordTab(tab)}
                className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all"
                style={{
                  background: wordTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: wordTab === tab ? 'var(--foreground)' : 'var(--foreground-tertiary)',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {entries.map((e) => {
            const value = wordTab === 'words' ? e.totalWords : e.totalTime
            const total = wordTab === 'words' ? totalWords : totalTime
            const pct = total > 0 ? value / total : 0
            const display = wordTab === 'words'
              ? `${e.totalWords.toLocaleString()} words`
              : fmtTime(e.totalTime)

            return (
              <div key={e.speaker.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: e.speaker.color }} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>{e.speaker.name}</span>
                    <span className="font-mono text-[10px]" style={{ color: 'var(--foreground-tertiary)' }}>{e.turns} turns</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono">
                    <span style={{ color: 'var(--foreground-secondary)' }}>{display}</span>
                    <span className="font-bold w-10 text-right tabular-nums" style={{ color: 'var(--foreground)' }}>{fmtPct(pct)}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="h-full rounded-sm transition-all duration-500"
                    style={{ width: `${pct * 100}%`, backgroundColor: e.speaker.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)' }} />

      {/* ── Metrics grid ──────────────────────────────────────────────────── */}
      <section>
        <p className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--foreground-tertiary)' }}>
          Metrics
        </p>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Total duration" value={fmtTime(stats.totalTime)} sub="transcribed audio" />
          <MetricCard label="Total words" value={stats.totalWords.toLocaleString()} sub={`~${Math.round(stats.totalWords / Math.max(stats.totalTime / 60, 1))} wpm`} />
          <MetricCard label="Segments" value={totalSegments.toString()} sub={`avg ${fmtTime(stats.avgSegDuration)}`} />
          <MetricCard label="Speaker turns" value={stats.speakerChanges.toString()} sub="change events" />
          <MetricCard label="Silence gaps" value={stats.silenceCount.toString()} sub=">1.5s pauses" />
          <MetricCard label="Questions" value={stats.questionSegments.toString()} sub="segments ending ?" />
          <MetricCard label="Monologue" value={`${stats.maxStreak} seg`} sub={`by ${stats.streakSpeakerName}`} />
          <MetricCard label="Interjections" value={stats.interruptions.toString()} sub="<3s after change" />
          <MetricCard label="Unique words" value={stats.uniqueWords.toLocaleString()} sub={`richness ${fmtPct(stats.vocabRichness)}`} />
          <MetricCard label="Words/sentence" value={stats.avgWordsPerSentence.toFixed(1)} sub="full transcript" />
          <MetricCard label="Avg turn" value={fmtTime(stats.avgTurnLength)} sub="per turn" />
          <MetricCard label="Longest segment" value={fmtTime(stats.longestSeg.end - stats.longestSeg.start)} sub={`at ${fmtTime(stats.longestSeg.start)}`} />
        </div>
      </section>

      {/* ── Speaking pace ──────────────────────────────────────────────────── */}
      <section>
        <p className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--foreground-tertiary)' }}>
          Speaking Pace
        </p>
        <div className="space-y-3">
          {stats.paceEntries
            .filter((e) => e.wpm > 0)
            .sort((a, b) => b.wpm - a.wpm)
            .map((e) => {
              const maxWpm = Math.max(...stats.paceEntries.map((x) => x.wpm))
              return (
                <div key={e.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: e.color }} />
                      <span className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>{e.name}</span>
                    </div>
                    <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>
                      {Math.round(e.wpm)} wpm
                    </span>
                  </div>
                  <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{ width: `${(e.wpm / maxWpm) * 100}%`, backgroundColor: e.color }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
        <p className="text-[10px] mt-2" style={{ color: 'var(--foreground-tertiary)' }}>Typical conversational speech: 120–180 wpm</p>
      </section>

      {/* ── Top keywords ──────────────────────────────────────────────────── */}
      {stats.topWords.length > 0 && (
        <section>
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--foreground-tertiary)' }}>
            Top Keywords
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.topWords.map(([word, count]) => (
              <span
                key={word}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium"
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--foreground-secondary)',
                }}
              >
                {word}
                <span className="font-mono text-[10px]" style={{ color: 'var(--foreground-tertiary)' }}>{count}×</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Engagement balance ─────────────────────────────────────────────── */}
      {entries.length >= 2 && (
        <section>
          {(() => {
            const dominant = entries[0]
            const least = entries[entries.length - 1]
            const dominantPct = totalWords > 0 ? dominant.totalWords / totalWords : 0
            const leastPct = totalWords > 0 ? least.totalWords / totalWords : 0
            const isBalanced = dominantPct < 0.6
            return (
              <div
                className="rounded p-4"
                style={{
                  background: isBalanced ? 'rgba(45,212,191,0.04)' : 'rgba(245,158,11,0.04)',
                  border: isBalanced ? '1px solid rgba(45,212,191,0.15)' : '1px solid rgba(245,158,11,0.15)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: isBalanced ? '#2dd4bf' : '#f59e0b' }}
                  />
                  <span
                    className="text-[10px] uppercase tracking-wider font-bold"
                    style={{ color: isBalanced ? '#2dd4bf' : '#f59e0b' }}
                  >
                    {isBalanced ? 'Balanced' : 'Imbalanced'}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
                  {dominant.speaker.name} dominates at{' '}
                  <strong className="text-white">{fmtPct(dominantPct)}</strong> of words.{' '}
                  {least.speaker.name} contributes{' '}
                  <strong className="text-white">{fmtPct(leastPct)}</strong>.
                  {dominantPct > 0.7 && ' Consider if all voices are being heard.'}
                </p>
              </div>
            )
          })()}
        </section>
      )}

    </div>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="px-3 py-3 rounded"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.04)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
      }}
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--foreground-tertiary)' }}>{label}</p>
      <p className="font-mono text-[18px] font-semibold tabular-nums text-white leading-none">{value}</p>
      <p className="text-[10px] mt-1" style={{ color: 'var(--foreground-tertiary)' }}>{sub}</p>
    </div>
  )
}
