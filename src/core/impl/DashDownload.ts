import { Downloader, MediaResource, Segment } from '@/core'
import { useLog } from '@/hooks/UseLog'
import {
  createTempFilePath,
  ensureLocalPaths,
  mergeByFfmpegConcatInBatches,
  replaceTemplateTokens,
  resolveUrl,
  runFfmpeg,
  sortSegments
} from './DownloadUtil'

const log = useLog({ name: 'DashDownload' })

type Track = 'video' | 'audio'

interface TimelineItem {
  time: number
  duration: number
}

const children = (element: Element, name: string): Element[] => {
  return Array.from(element.children).filter((child) => child.localName === name)
}

const firstChild = (element: Element, name: string): Element | undefined => {
  return children(element, name)[0]
}

const attr = (element: Element | undefined, name: string): string | undefined => {
  return element?.getAttribute(name) ?? undefined
}

const numberAttr = (element: Element | undefined, name: string): number | undefined => {
  const value = attr(element, name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const getBaseUrl = (element: Element, fallback: string): string => {
  const base = firstChild(element, 'BaseURL')?.textContent?.trim()
  return base ? resolveUrl(base, fallback) : fallback
}

const isTrack = (adaptation: Element, track: Track): boolean => {
  const contentType = attr(adaptation, 'contentType')?.toLowerCase()
  const mimeType = attr(adaptation, 'mimeType')?.toLowerCase()
  return contentType === track || Boolean(mimeType?.startsWith(`${track}/`))
}

const selectRepresentation = (adaptation: Element): Element | undefined => {
  return children(adaptation, 'Representation').sort((a, b) => {
    return (numberAttr(b, 'bandwidth') ?? 0) - (numberAttr(a, 'bandwidth') ?? 0)
  })[0]
}

const getSegmentTemplate = (adaptation: Element, representation: Element): Element | undefined => {
  return firstChild(representation, 'SegmentTemplate') ?? firstChild(adaptation, 'SegmentTemplate')
}

const getSegmentList = (adaptation: Element, representation: Element): Element | undefined => {
  return firstChild(representation, 'SegmentList') ?? firstChild(adaptation, 'SegmentList')
}

const parseTimeline = (template: Element): TimelineItem[] => {
  const timeline = firstChild(template, 'SegmentTimeline')
  if (!timeline) return []

  const items: TimelineItem[] = []
  let currentTime = 0
  for (const item of children(timeline, 'S')) {
    const duration = numberAttr(item, 'd') ?? 0
    const repeat = numberAttr(item, 'r') ?? 0
    currentTime = numberAttr(item, 't') ?? currentTime
    for (let index = 0; index <= repeat; index += 1) {
      items.push({ time: currentTime, duration })
      currentTime += duration
    }
  }
  return items
}

const parseIsoDurationMs = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(value)
  if (!match) return undefined
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000)
}

export class DashDownload implements Downloader {
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  async parse(url = this.url): Promise<MediaResource> {
    const response = await window.preload.axios.get<string>(url)
    const doc = new DOMParser().parseFromString(response.data, 'application/xml')
    const mpd = doc.documentElement
    const mpdBaseUrl = getBaseUrl(mpd, url)
    const period = firstChild(mpd, 'Period') ?? mpd
    const durationMs = parseIsoDurationMs(attr(mpd, 'mediaPresentationDuration'))

    const video = this.parseTrack(period, mpdBaseUrl, 'video', 0, durationMs)
    const audio = this.parseTrack(period, mpdBaseUrl, 'audio', video.length, durationMs)
    const segments = [...video, ...audio]
    log.info('DASH 解析完成', { url, video: video.length, audio: audio.length })

    return {
      type: 'dash',
      segments,
      metadata: {
        isAudioVideoSeparate: video.length > 0 && audio.length > 0,
        audioSegments: audio,
        initSegment: video.find((segment) => segment.role === 'init')?.url,
        audioInitSegment: audio.find((segment) => segment.role === 'init')?.url
      }
    }
  }

  async merge(paths: Array<Segment>, target: string): Promise<void> {
    ensureLocalPaths(paths)
    const video = this.getTrackSegments(paths, 'video')
    const audio = this.getTrackSegments(paths, 'audio')

    if (video.length === 0) {
      throw new Error('DASH video segments not found')
    }

    if (audio.length === 0) {
      log.info('开始合并 DASH 单视频轨', { count: video.length, target })
      await mergeByFfmpegConcatInBatches(video.map((segment) => segment.path), target)
      return
    }

    const videoTarget = createTempFilePath('.mp4')
    const audioTarget = createTempFilePath('.m4a')
    log.info('开始合并 DASH 音视频分离轨道', { video: video.length, audio: audio.length })
    await mergeByFfmpegConcatInBatches(video.map((segment) => segment.path), videoTarget)
    await mergeByFfmpegConcatInBatches(audio.map((segment) => segment.path), audioTarget)
    log.info('开始封装 DASH 音视频轨道', { target })
    await runFfmpeg(['-i', videoTarget, '-i', audioTarget, '-c', 'copy', target])
  }

  private parseTrack(
    period: Element,
    baseUrl: string,
    track: Track,
    startIndex: number,
    durationMs?: number
  ): Segment[] {
    const adaptation = children(period, 'AdaptationSet').find((item) => isTrack(item, track))
    if (!adaptation) return []

    const representation = selectRepresentation(adaptation)
    if (!representation) return []

    const trackBaseUrl = getBaseUrl(representation, getBaseUrl(adaptation, baseUrl))
    const template = getSegmentTemplate(adaptation, representation)
    if (template) {
      return this.parseTemplateSegments(template, representation, trackBaseUrl, track, startIndex, durationMs)
    }

    const list = getSegmentList(adaptation, representation)
    if (list) {
      return this.parseListSegments(list, trackBaseUrl, track, startIndex)
    }

    log.warn('未找到支持的 DASH 分片描述', { track })
    return []
  }

  private parseTemplateSegments(
    template: Element,
    representation: Element,
    baseUrl: string,
    track: Track,
    startIndex: number,
    durationMs?: number
  ): Segment[] {
    const segments: Segment[] = []
    const representationId = attr(representation, 'id')
    const bandwidth = attr(representation, 'bandwidth')
    const init = attr(template, 'initialization')
    const media = attr(template, 'media')
    const timescale = numberAttr(template, 'timescale') ?? 1
    const startNumber = numberAttr(template, 'startNumber') ?? 1

    if (init) {
      segments.push({
        url: resolveUrl(replaceTemplateTokens(init, { representationId, bandwidth }), baseUrl),
        path: '',
        index: startIndex + segments.length,
        track,
        role: 'init'
      })
    }

    if (!media) return segments

    const timeline = parseTimeline(template)
    if (timeline.length > 0) {
      for (let index = 0; index < timeline.length; index += 1) {
        const item = timeline[index]
        segments.push({
          url: resolveUrl(
            replaceTemplateTokens(media, {
              representationId,
              bandwidth,
              number: startNumber + index,
              time: item.time
            }),
            baseUrl
          ),
          path: '',
          index: startIndex + segments.length,
          track,
          role: 'media',
          duration: Math.round((item.duration / timescale) * 1000)
        })
      }
      return segments
    }

    const duration = numberAttr(template, 'duration')
    const count = this.estimateSegmentCount(duration, timescale, durationMs)
    for (let index = 0; index < count; index += 1) {
      segments.push({
        url: resolveUrl(
          replaceTemplateTokens(media, { representationId, bandwidth, number: startNumber + index }),
          baseUrl
        ),
        path: '',
        index: startIndex + segments.length,
        track,
        role: 'media',
        duration: duration ? Math.round((duration / timescale) * 1000) : undefined
      })
    }
    return segments
  }

  private parseListSegments(list: Element, baseUrl: string, track: Track, startIndex: number): Segment[] {
    const segments: Segment[] = []
    const init = firstChild(list, 'Initialization')
    const initUrl = attr(init, 'sourceURL')
    if (initUrl) {
      segments.push({
        url: resolveUrl(initUrl, baseUrl),
        path: '',
        index: startIndex + segments.length,
        track,
        role: 'init'
      })
    }

    for (const item of children(list, 'SegmentURL')) {
      const media = attr(item, 'media')
      if (!media) continue
      segments.push({
        url: resolveUrl(media, baseUrl),
        path: '',
        index: startIndex + segments.length,
        track,
        role: 'media'
      })
    }
    return segments
  }

  private estimateSegmentCount(
    duration: number | undefined,
    timescale: number,
    durationMs: number | undefined
  ): number {
    if (!duration || !durationMs) {
      log.warn('DASH SegmentTemplate 缺少 SegmentTimeline 或总时长，无法准确枚举全部分片')
      return 0
    }
    return Math.ceil(durationMs / ((duration / timescale) * 1000))
  }

  private getTrackSegments(segments: Segment[], track: Track): Segment[] {
    return sortSegments(segments.filter((segment) => segment.track === track))
  }
}
