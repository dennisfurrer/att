import { pipeline, env } from '@huggingface/transformers'
import type { WorkerInMessage, WorkerOutMessage } from './types'

// Model weights served from Cloudflare R2 (att-models bucket)
// Bucket: pub-43b5e0714e45467c9e51181e0cb58baf.r2.dev
env.allowLocalModels = false
env.useBrowserCache = true
env.remoteHost = 'https://pub-43b5e0714e45467c9e51181e0cb58baf.r2.dev'
env.remotePathTemplate = '{model}/{revision}/'

type WhisperResult = {
  chunks: Array<{ text: string; timestamp: [number, number | null] }>
}

type Transcriber = (
  input: Float32Array,
  options: Record<string, unknown>,
) => Promise<WhisperResult>

let transcriber: Transcriber | null = null
let loadedModelSize: string | null = null

const log = (...args: unknown[]) => console.log('[ATT worker]', ...args)

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  if (msg.type === 'transcribe') {
    const { audioData, modelSize } = msg
    const modelId = `Xenova/whisper-${modelSize}`

    log(`Starting transcription request — model: ${modelId}, audio samples: ${audioData.length} (${(audioData.length / 16000).toFixed(1)}s @ 16kHz)`)

    try {
      // Load model if needed
      if (!transcriber || loadedModelSize !== modelSize) {
        log(`Model "${modelId}" not cached in memory — loading from HuggingFace Hub (browser cache: enabled)`)
        transcriber = null
        loadedModelSize = null

        const t0 = performance.now()
        let lastFile = ''
        let fileCount = 0

        const pipe = await pipeline('automatic-speech-recognition', modelId, {
          progress_callback: (progress: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
            const file = progress.file ?? ''

            if (progress.status === 'initiate') {
              fileCount++
              log(`  ↓ Initiating download: ${file}`)
            } else if (progress.status === 'downloading') {
              if (file !== lastFile) {
                lastFile = file
                log(`  ↓ Downloading: ${file}`)
              }
              if (progress.progress !== undefined && Math.round(progress.progress) % 10 === 0) {
                const mb = progress.total ? `${(progress.total / 1024 / 1024).toFixed(1)} MB` : ''
                log(`    ${file} — ${Math.round(progress.progress)}%${mb ? ` of ${mb}` : ''}`)
              }
              const out: WorkerOutMessage = {
                type: 'model-progress',
                progress: progress.progress ?? 0,
                file,
              }
              self.postMessage(out)
            } else if (progress.status === 'done') {
              log(`  ✓ Done: ${file}`)
            } else if (progress.status === 'ready') {
              log(`  ✓ Model ready (${fileCount} files, ${((performance.now() - t0) / 1000).toFixed(1)}s)`)
            } else if (progress.status === 'loading') {
              log(`  ⚙ Loading into ONNX runtime: ${file}`)
              const out: WorkerOutMessage = {
                type: 'model-progress',
                progress: progress.progress ?? 0,
                file,
              }
              self.postMessage(out)
            }
          },
        })

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
        log(`Model loaded in ${elapsed}s`)
        transcriber = pipe as unknown as Transcriber
        loadedModelSize = modelSize
      } else {
        log(`Model "${modelId}" already loaded in worker memory — skipping download`)
      }

      const audioDurationSec = audioData.length / 16000
      log(`Starting inference — audio duration: ${audioDurationSec.toFixed(1)}s, chunk_length_s: 30, stride_length_s: 5`)
      log(`Estimated chunks: ~${Math.ceil(audioDurationSec / 25)} (rough estimate)`)

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
          const ts = chunk.timestamp ? `[${chunk.timestamp[0]?.toFixed(1)}s → ${chunk.timestamp[1]?.toFixed(1)}s]` : ''
          log(`  Chunk ${chunkCount} ${ts} (${elapsed}s elapsed): "${chunk.text.trim().slice(0, 80)}${chunk.text.length > 80 ? '…' : ''}"`)
          const out: WorkerOutMessage = {
            type: 'transcription-progress',
            progress: Math.min(chunkCount * 8, 95),
          }
          self.postMessage(out)
        },
      })

      const totalElapsed = ((performance.now() - t1) / 1000).toFixed(1)
      log(`Transcription complete — ${result.chunks.length} segments in ${totalElapsed}s (${(audioDurationSec / Number(totalElapsed)).toFixed(1)}x realtime)`)

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
