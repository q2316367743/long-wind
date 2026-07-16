import { Downloader, MediaResource, Segment } from '@/core'
import { useLog } from '@/hooks/UseLog'
import { getLocalPaths } from './DownloadUtil'

const log = useLog({ name: 'FileDownload' })

const MIN_CHUNK_SIZE = 8 * 1024 * 1024
const MAX_SEGMENT_COUNT = 512

interface FileProbeResult {
  size?: number
  acceptRanges: boolean
}

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const getHeader = (headers: unknown, key: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined
  const getter = (headers as { get?: (name: string) => unknown }).get
  if (getter) {
    const value = getter.call(headers, key)
    return typeof value === 'string' ? value : undefined
  }
  const value = (headers as Record<string, unknown>)[key.toLowerCase()]
  return typeof value === 'string' ? value : undefined
}

const parseContentRangeSize = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(value)
  return match ? parsePositiveInt(match[1]) : undefined
}

const buildSegments = (url: string, size: number, acceptRanges: boolean): Segment[] => {
  if (!acceptRanges) {
    return [{ url, path: '', index: 0, track: 'video', role: 'media', size }]
  }

  // 根据总大小动态调整分片大小，避免大文件产生过多分片记录。
  const chunkSize = Math.max(MIN_CHUNK_SIZE, Math.ceil(size / MAX_SEGMENT_COUNT))
  const segments: Segment[] = []
  for (let offset = 0; offset < size; offset += chunkSize) {
    const end = Math.min(offset + chunkSize - 1, size - 1)
    const bytes = end - offset + 1
    segments.push({
      url,
      path: '',
      index: segments.length,
      track: 'video',
      role: 'media',
      size: bytes,
      offset,
      bytes,
      range: `bytes=${offset}-${end}`
    })
  }
  return segments
}

export class FileDownload implements Downloader {

  private readonly url: string

  constructor(url: string) {
    this.url = url
  }


  async parse(url = this.url): Promise<MediaResource> {
    const probe = await this.probe(url)
    log.info('通用文件解析完成', { url, size: probe.size, acceptRanges: probe.acceptRanges })

    const segments = probe.size
      ? buildSegments(url, probe.size, probe.acceptRanges)
      : [{ url, path: '', index: 0, track: 'video' as const, role: 'media' as const }]

    return {
      type: 'plain',
      segments
    }
  }

  async merge(paths: Array<Segment>, target: string): Promise<void> {
    const localPaths = getLocalPaths(paths)
    log.info('开始合并普通文件分片', { count: localPaths.length, target })
    await window.preload.fs.mergeFiles(localPaths, target)
  }

  private async probe(url: string): Promise<FileProbeResult> {
    try {
      const response = await window.preload.axios.head(url)
      const size = parsePositiveInt(getHeader(response.headers, 'content-length'))
      const acceptRanges = getHeader(response.headers, 'accept-ranges')?.toLowerCase() === 'bytes'
      if (size) return { size, acceptRanges }
    } catch (error) {
      log.warn('HEAD 探测失败，尝试 Range 探测', error)
    }

    try {
      const response = await window.preload.axios.get(url, {
        headers: { Range: 'bytes=0-0' },
        responseType: 'arraybuffer'
      })
      const size = parseContentRangeSize(getHeader(response.headers, 'content-range'))
      const acceptRanges = response.status === 206 || Boolean(size)
      return { size, acceptRanges }
    } catch (error) {
      log.warn('Range 探测失败，按单文件处理', error)
      return { acceptRanges: false }
    }
  }
}
