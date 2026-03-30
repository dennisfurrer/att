export type ModelSize = 'tiny' | 'base' | 'small' | 'distil-small' | 'distil-large'

export type TranscriptionStatus =
  | 'idle'
  | 'loading-model'
  | 'transcribing'
  | 'diarizing'
  | 'done'
  | 'error'

export type Speaker = {
  id: string
  name: string
  color: string
}

export type Segment = {
  id: string
  start: number
  end: number
  text: string
  speakerId: string
  silenceGapBefore: boolean
}

export type WorkerInMessage =
  | { type: 'transcribe'; audioData: Float32Array; modelSize: ModelSize }

export type DiarizationSegment = {
  start: number
  end: number
  speakerIdx: number
  confidence: number
}

export type WorkerOutMessage =
  | { type: 'model-progress'; progress: number; file: string; loaded?: number; total?: number; stage: 'whisper' | 'diarization' }
  | { type: 'transcription-progress'; progress: number }
  | { type: 'diarization-progress'; progress: number; detail?: string }
  | { type: 'result'; chunks: WhisperChunk[]; diarization?: DiarizationSegment[] }
  | { type: 'error'; message: string }

export type WhisperChunk = {
  text: string
  timestamp: [number, number | null]
}

export type ExportFormat = 'txt' | 'json' | 'srt' | 'vtt'
