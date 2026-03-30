import {
  pipeline,
  AutoProcessor,
  AutoModelForAudioFrameClassification,
  env,
} from '@huggingface/transformers'
import type { ModelSize, WorkerInMessage, WorkerOutMessage, DiarizationSegment } from './types'

// Browser cache enabled globally
env.allowLocalModels = false
env.useBrowserCache = true

// ── Model registry ──────────────────────────────────────────────────────────

type ModelConfig = {
  modelId: string
  useR2: boolean
  label: string
  englishOnly?: boolean
}

const MODEL_CONFIGS: Record<ModelSize, ModelConfig> = {
  tiny: {
    modelId: 'Xenova/whisper-tiny',
    useR2: true,
    label: 'Whisper Tiny (quantized, ~75 MB)',
  },
  base: {
    modelId: 'Xenova/whisper-base',
    useR2: true,
    label: 'Whisper Base (quantized, ~150 MB)',
  },
  small: {
    modelId: 'Xenova/whisper-small',
    useR2: true,
    label: 'Whisper Small (quantized, ~250 MB)',
  },
  'distil-small': {
    modelId: 'onnx-community/distil-small.en',
    useR2: false,
    label: 'Distil-Whisper Small (English, ~170 MB)',
    englishOnly: true,
  },
  'distil-large': {
    modelId: 'distil-whisper/distil-large-v3.5-ONNX',
    useR2: false,
    label: 'Distil-Whisper Large v3.5 (English, ~530 MB)',
    englishOnly: true,
  },
}

const DIARIZATION_MODEL_ID = 'onnx-community/pyannote-segmentation-3.0'

// ── R2 configuration ────────────────────────────────────────────────────────

const R2_HOST = 'https://pub-43b5e0714e45467c9e51181e0cb58baf.r2.dev'
const R2_PATH_TEMPLATE = '{model}/{revision}/'

function configureForR2() {
  env.remoteHost = R2_HOST
  env.remotePathTemplate = R2_PATH_TEMPLATE
}

function configureForHFHub() {
  env.remoteHost = 'https://huggingface.co/'
  env.remotePathTemplate = '{model}/resolve/{revision}/'
}

// ── WebGPU detection ────────────────────────────────────────────────────────

async function detectWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined') return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter()
    if (!adapter) return false
    log('WebGPU adapter found:', adapter.info?.device || adapter.info?.description || 'unknown GPU')
    return true
  } catch {
    return false
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

type WhisperResult = {
  chunks: Array<{ text: string; timestamp: [number, number | null] }>
}

type Transcriber = (
  input: Float32Array,
  options: Record<string, unknown>,
) => Promise<WhisperResult>

let transcriber: Transcriber | null = null
let loadedModelKey: string | null = null

// Diarization model singletons
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let diarizationModel: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let diarizationProcessor: any = null
let diarizationLoaded = false

const log = (...args: unknown[]) => console.log('[ATT worker]', ...args)

// ── Diarization ─────────────────────────────────────────────────────────────

async function loadDiarizationModel() {
  if (diarizationLoaded) return

  log('Loading pyannote segmentation model (~6 MB)...')
  configureForHFHub()

  const t0 = performance.now()

  diarizationProcessor = await AutoProcessor.from_pretrained(DIARIZATION_MODEL_ID, {
    progress_callback: (progress: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
      if (progress.status === 'downloading' && progress.progress !== undefined) {
        const out: WorkerOutMessage = {
          type: 'model-progress',
          progress: progress.progress,
          file: progress.file ?? '',
          loaded: progress.loaded,
          total: progress.total,
          stage: 'diarization',
        }
        self.postMessage(out)
      }
    },
  })

  diarizationModel = await AutoModelForAudioFrameClassification.from_pretrained(DIARIZATION_MODEL_ID, {
    progress_callback: (progress: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
      if (progress.status === 'downloading' && progress.progress !== undefined) {
        const pct = Math.round(progress.progress)
        const loaded = progress.loaded ? (progress.loaded / 1024 / 1024).toFixed(1) : '?'
        const total = progress.total ? (progress.total / 1024 / 1024).toFixed(1) : '?'
        if (pct % 10 === 0 || pct === 1) {
          log(`  ↓ Diarization model — ${pct}% (${loaded}/${total} MB)`)
        }
        const out: WorkerOutMessage = {
          type: 'model-progress',
          progress: progress.progress,
          file: progress.file ?? '',
          loaded: progress.loaded,
          total: progress.total,
          stage: 'diarization',
        }
        self.postMessage(out)
      }
    },
  })

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  log(`Diarization model loaded in ${elapsed}s`)
  diarizationLoaded = true
}

async function runDiarization(audioData: Float32Array): Promise<DiarizationSegment[]> {
  if (!diarizationModel || !diarizationProcessor) {
    throw new Error('Diarization model not loaded')
  }

  const sampleRate = 16000
  const windowSec = 10
  const windowSamples = windowSec * sampleRate
  const stepSec = 5 // 50% overlap for better stitching
  const stepSamples = stepSec * sampleRate
  const totalDuration = audioData.length / sampleRate

  const windowCount = Math.max(1, Math.ceil((audioData.length - windowSamples) / stepSamples) + 1)
  log(`Diarization: ${totalDuration.toFixed(1)}s audio, ${windowCount} windows (${windowSec}s each, ${stepSec}s step)`)

  // Collect raw per-window speaker segments
  const allWindowSegments: Array<{ start: number; end: number; speakerIdx: number; confidence: number; windowIdx: number }> = []

  for (let w = 0; w < windowCount; w++) {
    const startSample = w * stepSamples
    const endSample = Math.min(startSample + windowSamples, audioData.length)
    const windowAudio = audioData.slice(startSample, endSample)
    const offsetSec = startSample / sampleRate

    // Process through pyannote
    const inputs = await diarizationProcessor(windowAudio)
    const { logits } = await diarizationModel(inputs)

    // Post-process: get speaker segments with timestamps
    const result = diarizationProcessor.post_process_speaker_diarization(logits, windowAudio.length)

    if (result && result[0]) {
      for (const seg of result[0]) {
        allWindowSegments.push({
          start: seg.start + offsetSec,
          end: seg.end + offsetSec,
          speakerIdx: seg.id,
          confidence: seg.confidence,
          windowIdx: w,
        })
      }
    }

    const progress = Math.round(((w + 1) / windowCount) * 100)
    const out: WorkerOutMessage = {
      type: 'diarization-progress',
      progress,
      detail: `Window ${w + 1}/${windowCount}`,
    }
    self.postMessage(out)
    log(`  Window ${w + 1}/${windowCount} — ${(offsetSec).toFixed(1)}s-${(offsetSec + windowSec).toFixed(1)}s — ${result?.[0]?.length ?? 0} segments`)
  }

  // Stitch: merge overlapping windows using a simple voting grid
  // Create a time grid at 0.1s resolution and vote on speaker per cell
  const gridResolution = 0.1
  const gridSize = Math.ceil(totalDuration / gridResolution)
  const speakerVotes: Array<Record<number, number>> = Array.from({ length: gridSize }, () => ({}))

  for (const seg of allWindowSegments) {
    const gridStart = Math.floor(seg.start / gridResolution)
    const gridEnd = Math.ceil(seg.end / gridResolution)
    for (let g = gridStart; g < gridEnd && g < gridSize; g++) {
      // Use window-local speakerIdx. For cross-window consistency,
      // we rely on overlapping windows having the same speaker in the overlap region.
      // Simple approach: use a combined key of windowIdx + speakerIdx initially,
      // then merge speakers that co-occur in overlapping regions.
      const key = seg.speakerIdx // Simplified: assume local IDs are consistent enough
      speakerVotes[g][key] = (speakerVotes[g][key] ?? 0) + seg.confidence
    }
  }

  // Build merged segments from the grid
  const merged: DiarizationSegment[] = []
  let currentSpeaker = -1
  let segStart = 0

  for (let g = 0; g < gridSize; g++) {
    const votes = speakerVotes[g]
    let bestSpeaker = -1
    let bestScore = 0
    for (const [sp, score] of Object.entries(votes)) {
      if (score > bestScore) {
        bestScore = score
        bestSpeaker = Number(sp)
      }
    }

    if (bestSpeaker !== currentSpeaker) {
      if (currentSpeaker >= 0) {
        merged.push({
          start: segStart,
          end: g * gridResolution,
          speakerIdx: currentSpeaker,
          confidence: bestScore,
        })
      }
      currentSpeaker = bestSpeaker
      segStart = g * gridResolution
    }
  }
  // Close last segment
  if (currentSpeaker >= 0) {
    merged.push({
      start: segStart,
      end: totalDuration,
      speakerIdx: currentSpeaker,
      confidence: 1,
    })
  }

  // Deduplicate speaker indices to 0-based sequential IDs
  const uniqueSpeakers = [...new Set(merged.map((s) => s.speakerIdx))]
  const speakerMap = new Map(uniqueSpeakers.map((id, idx) => [id, idx]))
  for (const seg of merged) {
    seg.speakerIdx = speakerMap.get(seg.speakerIdx) ?? 0
  }

  log(`Diarization complete: ${merged.length} speaker segments, ${uniqueSpeakers.length} unique speakers`)
  return merged
}

// ── Message handler ─────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  if (msg.type === 'transcribe') {
    const { audioData, modelSize } = msg
    const config = MODEL_CONFIGS[modelSize]

    if (!config) {
      const out: WorkerOutMessage = { type: 'error', message: `Unknown model size: ${modelSize}` }
      self.postMessage(out)
      return
    }

    const modelKey = `${config.modelId}:${modelSize}`

    log(`Starting transcription — ${config.label}`)
    log(`  Model ID: ${config.modelId}`)
    log(`  Audio: ${audioData.length} samples (${(audioData.length / 16000).toFixed(1)}s @ 16kHz)`)
    log(`  Source: ${config.useR2 ? 'Cloudflare R2' : 'HuggingFace Hub'}`)

    try {
      // ── Load Whisper model ──────────────────────────────────────────────

      if (!transcriber || loadedModelKey !== modelKey) {
        transcriber = null
        loadedModelKey = null

        const hasWebGPU = await detectWebGPU()
        const device = hasWebGPU ? 'webgpu' : 'wasm'
        log(`  Device: ${device}${hasWebGPU ? ' (GPU-accelerated)' : ' (CPU, SIMD+threads)'}`)

        if (config.useR2) {
          configureForR2()
          log(`  R2 host: ${R2_HOST}`)
        } else {
          configureForHFHub()
          log('  Loading from HuggingFace Hub')
        }

        const t0 = performance.now()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pipelineOpts: Record<string, any> = {
          device,
          progress_callback: (progress: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
            const file = progress.file ?? ''
            if (progress.status === 'initiate') {
              const mb = progress.total ? ` (${(progress.total / 1024 / 1024).toFixed(1)} MB)` : ''
              log(`  [init] ${file}${mb}`)
            } else if (progress.status === 'downloading') {
              const pct = Math.round(progress.progress ?? 0)
              const loaded = progress.loaded ? (progress.loaded / 1024 / 1024).toFixed(1) : '?'
              const total = progress.total ? (progress.total / 1024 / 1024).toFixed(1) : '?'
              if (pct % 5 === 0 || pct === 1) {
                log(`  ↓ ${file.split('/').pop()} — ${pct}% (${loaded}/${total} MB)`)
              }
              const out: WorkerOutMessage = {
                type: 'model-progress',
                progress: progress.progress ?? 0,
                file,
                loaded: progress.loaded,
                total: progress.total,
                stage: 'whisper',
              }
              self.postMessage(out)
            } else if (progress.status === 'done') {
              const mb = progress.total ? ` (${(progress.total / 1024 / 1024).toFixed(1)} MB)` : ''
              log(`  ✓ ${file.split('/').pop()}${mb}`)
            } else if (progress.status === 'ready') {
              log(`  ✓ Pipeline ready in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
            } else if (progress.status === 'loading') {
              log(`  ⚙ ONNX loading: ${file.split('/').pop()}`)
              const out: WorkerOutMessage = {
                type: 'model-progress',
                progress: progress.progress ?? 0,
                file,
                stage: 'whisper',
              }
              self.postMessage(out)
            }
          },
        }

        // Set dtype for non-R2 models to control download size
        if (!config.useR2) {
          if (modelSize === 'distil-large') {
            // Distil-large fp32 encoder is 2.5 GB — must use fp16
            pipelineOpts.dtype = {
              encoder_model: 'fp16',
              decoder_model_merged: 'q4',
            }
            log('  Dtype: encoder=fp16, decoder=q4 (distil-large)')
          } else {
            // Distil-small: fp32 encoder is only ~353 MB, manageable
            pipelineOpts.dtype = {
              encoder_model: hasWebGPU ? 'fp32' : 'q8',
              decoder_model_merged: 'q4',
            }
            log(`  Dtype: encoder=${hasWebGPU ? 'fp32' : 'q8'}, decoder=q4`)
          }
        }

        const pipe = await pipeline('automatic-speech-recognition', config.modelId, pipelineOpts)

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
        log(`Whisper model loaded in ${elapsed}s`)
        transcriber = pipe as unknown as Transcriber
        loadedModelKey = modelKey
      } else {
        log('Whisper model already in memory')
      }

      // ── Run transcription ──────────────────────────────────────────────

      const audioDurationSec = audioData.length / 16000
      log(`Starting inference — ${audioDurationSec.toFixed(1)}s audio`)

      const t1 = performance.now()
      let chunkCount = 0

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inferenceOpts: Record<string, any> = {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,

        // Anti-hallucination: prevent decoder loops
        // no_repeat_ngram_size blocks exact n-gram repetition (e.g. "that, that, that, that")
        no_repeat_ngram_size: 3,
        // repetition_penalty > 1.0 makes repeated tokens less likely
        repetition_penalty: 1.2,
        // Cap tokens per 30s chunk — Whisper normally produces ~100 tokens for 30s of speech.
        // 448 is Whisper's default max; lowering prevents runaway generation.
        max_new_tokens: 448,

        chunk_callback: (chunk: { text: string; timestamp?: [number, number | null] }) => {
          chunkCount++
          const elapsed = ((performance.now() - t1) / 1000).toFixed(1)
          const ts = chunk.timestamp ? `[${chunk.timestamp[0]?.toFixed(1)}s -> ${chunk.timestamp[1]?.toFixed(1)}s]` : ''
          log(`  Chunk ${chunkCount} ${ts} (${elapsed}s): "${chunk.text.trim().slice(0, 80)}${chunk.text.length > 80 ? '...' : ''}"`)
          const out: WorkerOutMessage = {
            type: 'transcription-progress',
            progress: Math.min(chunkCount * 8, 95),
          }
          self.postMessage(out)
        },
      }

      // Only set language/task for multilingual models — English-only models reject these
      if (!config.englishOnly) {
        inferenceOpts.language = 'english'
        inferenceOpts.task = 'transcribe'
      }

      const rawResult = await transcriber(audioData, inferenceOpts)

      // Post-process: detect and clean repetition artifacts
      const cleanedChunks = rawResult.chunks.map((chunk) => {
        const cleaned = cleanRepetitions(chunk.text)
        if (cleaned !== chunk.text) {
          log(`  [cleanup] Repetition removed in segment at ${chunk.timestamp[0]}s`)
        }
        return { ...chunk, text: cleaned }
      }).filter((chunk) => {
        // Drop segments that are entirely filler after cleanup
        const stripped = chunk.text.replace(/[.,\s]/g, '')
        return stripped.length > 0
      })

      const dropped = rawResult.chunks.length - cleanedChunks.length
      if (dropped > 0) {
        log(`  [cleanup] Dropped ${dropped} empty/filler segments`)
      }

      const result = { chunks: cleanedChunks }

      const txElapsed = ((performance.now() - t1) / 1000).toFixed(1)
      const rtFactor = (audioDurationSec / Number(txElapsed)).toFixed(1)
      log(`Transcription complete — ${rawResult.chunks.length} raw → ${result.chunks.length} cleaned segments in ${txElapsed}s (${rtFactor}x realtime)`)

      // ── Run diarization ────────────────────────────────────────────────

      log('Starting speaker diarization...')
      let diarization: DiarizationSegment[] | undefined

      try {
        await loadDiarizationModel()
        const t2 = performance.now()
        diarization = await runDiarization(audioData)
        const diarElapsed = ((performance.now() - t2) / 1000).toFixed(1)
        log(`Diarization finished in ${diarElapsed}s`)
      } catch (diarErr) {
        log('Diarization failed (falling back to silence-gap heuristic):', diarErr)
        // Non-fatal — will fall back to silence-gap assignment in main thread
      }

      // ── Return results ─────────────────────────────────────────────────

      const out: WorkerOutMessage = {
        type: 'result',
        chunks: result.chunks,
        diarization,
      }
      self.postMessage(out)
    } catch (err) {
      console.error('[ATT worker] Error:', err)
      const out: WorkerOutMessage = {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      }
      self.postMessage(out)
    }
  }
}

// ── Repetition cleanup ──────────────────────────────────────────────────────

/**
 * Detects and removes decoder hallucination loops from transcription text.
 * Handles patterns like:
 * - "that, that, that, that, that" → "that,"
 * - "I, I, I, I, I," → "I,"
 * - "and and and and and" → "and"
 * - "....." → "."
 * - ", , , , ," → ","
 */
function cleanRepetitions(text: string): string {
  let cleaned = text

  // Pattern 1: Word or short phrase repeated 3+ times with same separator
  // Matches: "word, word, word, word" or "word word word word"
  cleaned = cleaned.replace(/\b((?:\w+(?:\s+\w+){0,3})(?:[,.\s]+))\1{2,}/gi, '$1')

  // Pattern 2: Single word repeated 3+ times
  cleaned = cleaned.replace(/\b(\w+)\s+(\1\s+){2,}/gi, '$1 ')

  // Pattern 3: Filler dots/commas/periods
  cleaned = cleaned.replace(/([.,])\s*(\1\s*){2,}/g, '$1')

  // Pattern 4: Leading/trailing whitespace and multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()

  return cleaned
}
