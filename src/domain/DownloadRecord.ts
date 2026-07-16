import { MediaResource, Segment } from '@/core'
import { DownloadItem, DownloadItemStatus, DownloadTaskType } from '@/domain/DownloadItem'
import { PostDownload } from '@/domain/PostDownload'

export type SegmentStatus = 'pending' | 'downloading' | 'success' | 'failed'

export interface SegmentRecord extends Segment {
  status: SegmentStatus
  localPath: string
  loaded: number
  total: number
  error: string
  updatedAt: string
}

export interface DownloadRecordSummary {
  id: string
  name: string
  url: string
  taskType: DownloadTaskType
  status: DownloadItemStatus
  progress: number
  total: number
  finished: number
  failed: number
  folder: string
  targetPath: string
  createdAt: string
  updatedAt: string
}

export interface DownloadRecordIndex {
  version: 1
  items: DownloadRecordSummary[]
}

export interface DownloadTaskRecord {
  id: string
  base: DownloadItem
  config: PostDownload
  resource: MediaResource
  segments: SegmentRecord[]
  tempDir: string
  partsDir: string
  targetPath: string
  rawManifestPath: string
  createdAt: string
  updatedAt: string
}
