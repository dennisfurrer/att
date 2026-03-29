export type ModelSize = 'tiny' | 'base' | 'small'

export type TranscriptionStatus =
  | 'idle'
  | 'loading-model'
  | 'transcribing'
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

export type WorkerOutMessage =
  | { type: 'model-progress'; progress: number; file: string }
  | { type: 'transcription-progress'; progress: number }
  | { type: 'result'; chunks: WhisperChunk[] }
  | { type: 'error'; message: string }

export type WhisperChunk = {
  text: string
  timestamp: [number, number | null]
}

export type ExportFormat = 'txt' | 'json' | 'srt' | 'vtt'
