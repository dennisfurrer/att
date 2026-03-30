import { pipeline, env } from '@huggingface/transformers'
import type { ModelSize, WorkerInMessage, WorkerOutMessage } from './types'

// Browser cache enabled globally
env.allowLocalModels = false
env.useBrowserCache = true

// ── Model registry ──────────────────────────────────────────────────────────

type ModelConfig = {
  modelId: string
  /** Use R2 bucket for model files (Xenova models). HF Hub is used otherwise. */
  useR2: boolean
  /** Label for logging */
  label: string
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
  },
  'distil-large': {
    modelId: 'distil-whisper/distil-large-v3.5-ONNX',
    useR2: false,
    label: 'Distil-Whisper Large v3.5 (English, ~530 MB)',
  },
}

// ── R2 configuration ────────────────────────────────────────────────────────

const R2_HOST = 'https://pub-43b5e0714e45467c9e51181e0cb58baf.r2.dev'
const R2_PATH_TEMPLATE = '{model}/{revision}/'

function configureForR2() {
  env.remoteHost = R2_HOST
  env.remotePathTemplate = R2_PATH_TEMPLATE
}

function configureForHFHub() {
  // Reset to defaults — let the library fetch from huggingface.co
  env.remoteHost = ''
  env.remotePathTemplate = '{model}/{revision}/'
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

const log = (...args: unknown[]) => console.log('[ATT worker]', ...args)

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
      // Load model if needed
      if (!transcriber || loadedModelKey !== modelKey) {
        transcriber = null
        loadedModelKey = null

        // Detect WebGPU
        const hasWebGPU = await detectWebGPU()
        const device = hasWebGPU ? 'webgpu' : 'wasm'
        log(`  Device: ${device}${hasWebGPU ? ' (GPU-accelerated)' : ' (CPU, SIMD+threads)'}`)

        // Configure source (R2 vs HF Hub)
        if (config.useR2) {
          configureForR2()
          log(`  R2 host: ${R2_HOST}`)
        } else {
          configureForHFHub()
          log('  Loading from HuggingFace Hub (default CDN)')
        }

        const t0 = performance.now()
        let lastFile = ''
        let fileCount = 0

        // Build pipeline options
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pipelineOpts: Record<string, any> = {
          device,
          progress_callback: makeProgressCallback(() => fileCount++, (f: string) => { lastFile = f; return lastFile }, t0),
        }

        // For WebGPU: set per-model dtype to avoid known issues with q8 decoders
        // For WASM: let the library use its default quantization
        if (hasWebGPU && !config.useR2) {
          // Distil models from HF Hub: use fp32 encoder + q4 decoder for WebGPU
          pipelineOpts.dtype = {
            encoder_model: 'fp32',
            decoder_model_merged: 'q4',
          }
          log('  Dtype: encoder=fp32, decoder=q4 (WebGPU-optimized)')
        } else if (hasWebGPU && config.useR2) {
          // Xenova quantized models: already quantized, just set device
          // These models have pre-quantized ONNX files so dtype isn't needed
          log('  Using pre-quantized ONNX from R2 with WebGPU')
        }

        const pipe = await pipeline('automatic-speech-recognition', config.modelId, pipelineOpts)

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
        log(`Model loaded in ${elapsed}s (${fileCount} files)`)
        transcriber = pipe as unknown as Transcriber
        loadedModelKey = modelKey
      } else {
        log('Model already loaded in worker memory — skipping download')
      }

      // ── Run inference ───────────────────────────────────────────────────

      const audioDurationSec = audioData.length / 16000
      log(`Starting inference — ${audioDurationSec.toFixed(1)}s audio, chunk_length_s=30, stride=5`)

      const t1 = performance.now()
      let chunkCount = 0

      const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'english',
        task: 'transcribe',
        return_timestamps: true,
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
      })

      const totalElapsed = ((performance.now() - t1) / 1000).toFixed(1)
      const rtFactor = (audioDurationSec / Number(totalElapsed)).toFixed(1)
      log(`Transcription complete — ${result.chunks.length} segments in ${totalElapsed}s (${rtFactor}x realtime)`)

      const out: WorkerOutMessage = { type: 'result', chunks: result.chunks }
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

// ── Progress callback factory ───────────────────────────────────────────────

function makeProgressCallback(
  incFileCount: () => number,
  setLastFile: (f: string) => string,
  t0: number,
) {
  let lastFile = ''

  return (progress: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
    const file = progress.file ?? ''

    if (progress.status === 'initiate') {
      incFileCount()
      const mb = progress.total ? ` (${(progress.total / 1024 / 1024).toFixed(1)} MB)` : ''
      log(`  [init] ${file}${mb}`)
    } else if (progress.status === 'downloading') {
      if (file !== lastFile) {
        lastFile = file
        setLastFile(file)
      }
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
      }
      self.postMessage(out)
    } else {
      log(`  [${progress.status}] ${file} — ${progress.progress}`)
    }
  }
}
