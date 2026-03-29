import { useMemo, useState } from 'react'
import type { Segment, Speaker } from '../types'

type Props = {
  segments: Segment[]
  speakers: Speaker[]
}

type WordTab = 'words' | 'time'

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Analytics Panel ────────────────────────────────────────────────────────

export function AnalyticsPanel({ segments, speakers }: Props) {
  const [wordTab, setWordTab] = useState<WordTab>('words')

  const stats = useMemo(() => {
    if (!segments.length) return null

    // Per-speaker aggregates
    const bySpeaker: Record<string, {
      speaker: Speaker
      segments: Segment[]
      totalTime: number
      totalWords: number
      turns: number
    }> = {}

    // Include "unassigned" bucket for segments not matching any speaker
    const speakerMap = new Map(speakers.map((s) => [s.id, s]))

    for (const seg of segments) {
      const sp = speakerMap.get(seg.speakerId)
      const key = seg.speakerId
      if (!bySpeaker[key]) {
        bySpeaker[key] = {
          speaker: sp ?? { id: key, name: 'Unknown', color: '#71717a' },
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

    // Sort by total words desc
    entries.sort((a, b) => b.totalWords - a.totalWords)

    // Global stats
    const allText = segments.map((s) => s.text).join(' ')
    const avgSegDuration = totalTime / totalSegments
    const longestSeg = segments.reduce((best, s) => (s.end - s.start > best.end - best.start ? s : best))
    const shortestSeg = segments.reduce((best, s) => (s.end - s.start < best.end - best.start ? s : best))

    // Talk ratio (who talks the most)
    const dominant = entries[0]
    const leastDominant = entries[entries.length - 1]

    // Silence gaps
    const silenceGaps = segments.filter((s) => s.silenceGapBefore)
    const silenceCount = silenceGaps.length

    // Speaker changes (adjacent segments with different speakers)
    let speakerChanges = 0
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].speakerId !== segments[i - 1].speakerId) speakerChanges++
    }

    // Avg words per turn per speaker
    for (const e of entries) {
      const texts = e.segments.map((s) => s.text).join(' ')
      e.totalWords = countWords(texts) // recount cleanly
    }

    // Questions (rough: segments ending in ?)
    const questionSegments = segments.filter((s) => s.text.trim().endsWith('?'))

    // Pace: words per minute per speaker
    const paceEntries = entries.map((e) => ({
      name: e.speaker.name,
      color: e.speaker.color,
      wpm: e.totalTime > 0 ? (e.totalWords / e.totalTime) * 60 : 0,
    }))

    // Avg turn length in seconds
    const avgTurnLength = totalTime / entries.reduce((s, e) => s + e.turns, 0)

    // Monologue streaks: longest run of segments by one speaker
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

    // Vocabulary richness: unique words / total words
    const allWords = allText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
    const uniqueWords = new Set(allWords).size
    const vocabRichness = allWords.length > 0 ? uniqueWords / allWords.length : 0

    // Most common words (exclude stop words)
    const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'i', 'you', 'we', 'they', 'it', 'that', 'this', 'be', 'have', 'has', 'had', 'do', 'did', 'not', 'so', 'if', 'as', 'by', 'from', 'up', 'about', 'into', 'than', 'then', 'its', 'my', 'our', 'your', 'their', 'just', 'like', 'also', 'can', 'will', 'would', 'could', 'should', 'going', 'know', 'think', 'yeah', 'okay', 'right', 'um', 'uh', 'well'])
    const wordFreq: Record<string, number> = {}
    for (const w of allWords) {
      if (!STOP.has(w) && w.length > 2) wordFreq[w] = (wordFreq[w] ?? 0) + 1
    }
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)

    // Interruption-like moments: very short segments (<3s) after a speaker change
    const interruptions = segments.filter((s, i) => {
      if (i === 0) return false
      return (s.end - s.start) < 3 && segments[i - 1].speakerId !== s.speakerId
    }).length

    return {
      entries,
      totalTime,
      totalWords,
      totalSegments,
      dominant,
      leastDominant,
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
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        No transcript to analyze yet
      </div>
    )
  }

  const { entries, totalTime, totalWords, totalSegments } = stats

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 p-6 space-y-6">

      {/* ── Conversation dominance ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">Conversation Dominance</h3>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
            {(['words', 'time'] as WordTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setWordTab(tab)}
                className={`px-3 py-1 transition-colors capitalize ${wordTab === tab ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {entries.map((e) => {
            const value = wordTab === 'words' ? e.totalWords : e.totalTime
            const total = wordTab === 'words' ? totalWords : totalTime
            const pct = total > 0 ? value / total : 0
            const display = wordTab === 'words'
              ? `${e.totalWords.toLocaleString()} words`
              : fmtTime(e.totalTime)

            return (
              <div key={e.speaker.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.speaker.color }} />
                    <span className="text-sm text-zinc-300">{e.speaker.name}</span>
                    <span className="text-xs text-zinc-500">{e.turns} turns</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">{display}</span>
                    <span className="text-zinc-200 font-semibold w-10 text-right">{fmtPct(pct)}</span>
                  </div>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct * 100}%`, backgroundColor: e.speaker.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="border-t border-zinc-800" />

      {/* ── Metrics grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">

        <MetricCard
          label="Total duration"
          value={fmtTime(stats.totalTime)}
          sub="of transcribed audio"
        />
        <MetricCard
          label="Total words"
          value={stats.totalWords.toLocaleString()}
          sub={`~${Math.round(stats.totalWords / Math.max(stats.totalTime / 60, 1))} wpm overall`}
        />
        <MetricCard
          label="Segments"
          value={totalSegments.toString()}
          sub={`avg ${fmtTime(stats.avgSegDuration)} each`}
        />
        <MetricCard
          label="Speaker turns"
          value={stats.speakerChanges.toString()}
          sub="speaker change events"
        />
        <MetricCard
          label="Silence gaps"
          value={stats.silenceCount.toString()}
          sub=">1.5s pauses detected"
        />
        <MetricCard
          label="Questions"
          value={stats.questionSegments.toString()}
          sub="segments ending in ?"
        />
        <MetricCard
          label="Longest monologue"
          value={`${stats.maxStreak} seg`}
          sub={`by ${stats.streakSpeakerName}`}
        />
        <MetricCard
          label="Short interjections"
          value={stats.interruptions.toString()}
          sub="<3s after speaker change"
        />
        <MetricCard
          label="Unique words"
          value={stats.uniqueWords.toLocaleString()}
          sub={`vocab richness ${fmtPct(stats.vocabRichness)}`}
        />
        <MetricCard
          label="Avg words/sentence"
          value={stats.avgWordsPerSentence.toFixed(1)}
          sub="across full transcript"
        />
        <MetricCard
          label="Avg turn length"
          value={fmtTime(stats.avgTurnLength)}
          sub="seconds per turn"
        />
        <MetricCard
          label="Longest segment"
          value={fmtTime(stats.longestSeg.end - stats.longestSeg.start)}
          sub={`at ${fmtTime(stats.longestSeg.start)}`}
        />

      </div>

      {/* ── Speaking pace ──────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">Speaking Pace (wpm)</h3>
        <div className="space-y-2.5">
          {stats.paceEntries
            .filter((e) => e.wpm > 0)
            .sort((a, b) => b.wpm - a.wpm)
            .map((e) => {
              const maxWpm = Math.max(...stats.paceEntries.map((x) => x.wpm))
              return (
                <div key={e.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                      <span className="text-sm text-zinc-300">{e.name}</span>
                    </div>
                    <span className="text-xs text-zinc-300 font-semibold">{Math.round(e.wpm)} wpm</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(e.wpm / maxWpm) * 100}%`, backgroundColor: e.color }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
        <p className="text-xs text-zinc-600 mt-2">Typical conversational speech: 120–180 wpm</p>
      </section>

      {/* ── Top keywords ──────────────────────────────────────────────── */}
      {stats.topWords.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Top Keywords</h3>
          <div className="flex flex-wrap gap-2">
            {stats.topWords.map(([word, count]) => (
              <span
                key={word}
                className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs"
              >
                {word}
                <span className="ml-1.5 text-zinc-500">{count}×</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Engagement balance ─────────────────────────────────────────── */}
      {entries.length >= 2 && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-200 mb-1">Engagement Balance</h3>
          {(() => {
            const dominant = entries[0]
            const least = entries[entries.length - 1]
            const dominantPct = totalWords > 0 ? dominant.totalWords / totalWords : 0
            const leastPct = totalWords > 0 ? least.totalWords / totalWords : 0
            const isBalanced = dominantPct < 0.6
            return (
              <div className={`rounded-xl border p-3 text-sm ${isBalanced ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold ${isBalanced ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isBalanced ? 'Balanced' : 'Imbalanced'}
                  </span>
                </div>
                <p className="text-zinc-400 text-xs">
                  {dominant.speaker.name} dominates at <strong className="text-zinc-200">{fmtPct(dominantPct)}</strong> of words.
                  {' '}{least.speaker.name} contributes <strong className="text-zinc-200">{fmtPct(leastPct)}</strong>.
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
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-xl font-semibold text-white tracking-tight">{value}</p>
      <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>
    </div>
  )
}
