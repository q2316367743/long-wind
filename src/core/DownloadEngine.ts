import { SegmentRecord } from '@/domain/DownloadRecord'

export interface DownloadEngineOptions {
  segments: SegmentRecord[]
  threads: number
  headers: Record<string, string>
  proxy: string
  getLocalPath(segment: SegmentRecord): string
  shouldStop(): boolean
  onSpeedChange(speed: number): Promise<void>
  onSegmentChange(segment: SegmentRecord): Promise<void>
}

export interface DownloadEngineResult {
  success: number
  failed: number
}

const compactHeaders = (headers: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value) result[key] = value
  }
  return result
}

export class DownloadEngine {
  async download(options: DownloadEngineOptions): Promise<DownloadEngineResult> {
    const queue = [...options.segments].sort((a, b) => a.index - b.index)
    const workerCount = Math.max(1, Math.min(options.threads || 1, queue.length || 1))
    let cursor = 0
    let totalLoaded = 0
    let lastLoaded = 0
    let lastTime = Date.now()

    const updateSpeed = async (): Promise<void> => {
      const now = Date.now()
      const duration = now - lastTime
      if (duration < 1000) return
      const speed = ((totalLoaded - lastLoaded) / duration) * 1000 / 1024
      lastLoaded = totalLoaded
      lastTime = now
      await options.onSpeedChange(Math.max(0, Math.round(speed)))
    }

    const next = async (): Promise<void> => {
      const index = cursor
      cursor += 1
      const segment = queue[index]
      if (!segment || options.shouldStop()) return
      await this.downloadOne(segment, options, (loaded) => {
        totalLoaded += loaded
        void updateSpeed()
      })
      await next()
    }

    await Promise.all(Array.from({ length: workerCount }, next))
    return {
      success: options.segments.filter((segment) => segment.status === 'success').length,
      failed: options.segments.filter((segment) => segment.status === 'failed').length
    }
  }

  private async downloadOne(
    segment: SegmentRecord,
    options: DownloadEngineOptions,
    onLoaded: (loaded: number) => void
  ): Promise<void> {
    const localPath = options.getLocalPath(segment)
    segment.status = 'downloading'
    segment.localPath = localPath
    segment.path = localPath
    segment.loaded = 0
    segment.error = ''
    segment.updatedAt = new Date().toISOString()
    await options.onSegmentChange(segment)

    try {
      const headers = compactHeaders({ ...options.headers, Range: segment.range ?? '' })
      await window.preload.net.downloadFileFromUrl(
        segment.url,
        localPath,
        { headers, proxy: options.proxy },
        (progress) => {
          onLoaded(Math.max(0, progress.loaded - segment.loaded))
          segment.loaded = progress.loaded
          segment.total = progress.total || segment.total
        }
      )
      segment.status = 'success'
      segment.loaded = segment.total || segment.loaded
    } catch (error) {
      segment.status = 'failed'
      segment.error = error instanceof Error ? error.message : String(error)
    } finally {
      segment.updatedAt = new Date().toISOString()
      await options.onSegmentChange(segment)
    }
  }
}

export const downloadEngine = new DownloadEngine()
