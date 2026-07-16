import { Downloader, MediaResource, Segment } from '@/core'
import { useLog } from '@/hooks/UseLog'
import { getLocalPaths, mergeByFfmpegConcatInBatches, resolveUrl } from './DownloadUtil'

const log = useLog({ name: 'HlsDownload' })

interface HlsVariant {
  url: string
  bandwidth: number
}

const parseAttributeList = (text: string): Record<string, string> => {
  const result: Record<string, string> = {}
  const matcher = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi
  let match = matcher.exec(text)
  while (match) {
    result[match[1]] = match[2].replace(/^"|"$/g, '')
    match = matcher.exec(text)
  }
  return result
}

const isUriLine = (line: string): boolean => {
  return line.length > 0 && !line.startsWith('#')
}

export class HlsDownload implements Downloader {
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  async parse(url = this.url): Promise<MediaResource> {
    const resource = await this.parsePlaylist(url)
    log.info('HLS 解析完成', { url, count: resource.segments.length, duration: resource.metadata?.duration })
    return resource
  }

  async merge(paths: Array<Segment>, target: string): Promise<void> {
    const localPaths = getLocalPaths(paths)
    log.info('开始合并 HLS 分片', { count: localPaths.length, target })
    await mergeByFfmpegConcatInBatches(localPaths, target)
  }

  private async parsePlaylist(url: string): Promise<MediaResource> {
    const response = await window.preload.axios.get<string>(url)
    const text = response.data
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const variants = this.parseVariants(lines, url)
    if (variants.length > 0) {
      const selected = variants.sort((a, b) => b.bandwidth - a.bandwidth)[0]
      log.info('检测到 HLS master playlist，选择最高带宽线路', selected)
      return this.parsePlaylist(selected.url)
    }

    const segments: Segment[] = []
    let pendingDuration: number | undefined
    let totalDuration = 0

    for (const line of lines) {
      if (line.startsWith('#EXT-X-MAP:')) {
        const attrs = parseAttributeList(line.slice('#EXT-X-MAP:'.length))
        if (attrs.URI) {
          segments.push({
            url: resolveUrl(attrs.URI, url),
            path: '',
            index: segments.length,
            track: 'video',
            role: 'init'
          })
        }
        continue
      }

      if (line.startsWith('#EXTINF:')) {
        const durationText = line.slice('#EXTINF:'.length).split(',')[0]
        const duration = Number(durationText)
        pendingDuration = Number.isFinite(duration) ? Math.round(duration * 1000) : undefined
        continue
      }

      if (isUriLine(line)) {
        if (pendingDuration) totalDuration += pendingDuration
        segments.push({
          url: resolveUrl(line, url),
          path: '',
          index: segments.length,
          track: 'video',
          role: 'media',
          duration: pendingDuration
        })
        pendingDuration = undefined
      }
    }

    return {
      type: 'hls',
      segments,
      metadata: {
        duration: totalDuration,
        initSegment: segments.find((segment) => segment.role === 'init')?.url
      }
    }
  }

  private parseVariants(lines: string[], baseUrl: string): HlsVariant[] {
    const variants: HlsVariant[] = []
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!line.startsWith('#EXT-X-STREAM-INF:')) continue

      const attrs = parseAttributeList(line.slice('#EXT-X-STREAM-INF:'.length))
      const nextLine = lines[index + 1]
      if (!nextLine || !isUriLine(nextLine)) continue

      variants.push({
        url: resolveUrl(nextLine, baseUrl),
        bandwidth: Number(attrs.BANDWIDTH ?? 0)
      })
    }
    return variants
  }
}
