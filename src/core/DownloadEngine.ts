import { SegmentRecord } from '@/domain/DownloadRecord'

export interface DownloadEngineOptions {
  segments: SegmentRecord[]
  threads: number
  headers: Record<string, string>
  proxy: string
  getLocalPath(segment: SegmentRecord): string
  shouldStop(): boolean
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

    const next = async (): Promise<void> => {
      const index = cursor
      cursor += 1
      const segment = queue[index]
      if (!segment || options.shouldStop()) return
      await this.downloadOne(segment, options)
      await next()
    }

    await Promise.all(Array.from({ length: workerCount }, next))
    return {
      success: options.segments.filter((segment) => segment.status === 'success').length,
      failed: options.segments.filter((segment) => segment.status === 'failed').length
    }
  }

  private async downloadOne(segment: SegmentRecord, options: DownloadEngineOptions): Promise<void> {
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
