export async function decodeAudioFile(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext({ sampleRate: 16000 })

  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  } finally {
    await audioCtx.close()
  }

  // Mix down to mono
  const numChannels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const mono = new Float32Array(length)

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i]
    }
  }

  if (numChannels > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] /= numChannels
    }
  }

  return mono
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Returns true if the gap between end of previous segment and start of next exceeds threshold */
export function hasSilenceGap(prevEnd: number, nextStart: number, thresholdSecs = 1.5): boolean {
  return nextStart - prevEnd > thresholdSecs
}

export async function getAudioDuration(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  try {
    const buffer = await audioCtx.decodeAudioData(arrayBuffer)
    return buffer.duration
  } finally {
    await audioCtx.close()
  }
}
