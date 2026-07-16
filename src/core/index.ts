import { Downloader, Segment, MediaResource } from '@/core/Downloader'

export type { Downloader, Segment, MediaResource }

import { DashDownload } from '@/core/impl/DashDownload'
import { HlsDownload } from './impl/HlsDownload'
import { FileDownload } from '@/core/impl/FileDownload'

export const createDownload = (url: string): Downloader => {
  const u = new URL(url)
  const { pathname } = u
  if (pathname.endsWith('.m3u8')) {
    return new HlsDownload(url)
  } else if (pathname.endsWith('.mpd')) {
    return new DashDownload(url)
  }
  return new FileDownload(url)
}
