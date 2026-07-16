import { MediaResource } from '@/core'
import {
  DownloadRecordIndex,
  DownloadRecordSummary,
  DownloadTaskRecord,
  SegmentRecord
} from '@/domain/DownloadRecord'
import { getAppData, getRecordPath } from '@/global/Constant'

const RECORD_VERSION = 1 as const

const readJson = async <T>(path: string): Promise<T | null> => {
  if (!window.preload.fs.existsSync(path)) return null
  return JSON.parse(await window.preload.fs.readTextFile(path)) as T
}

const writeJson = async (path: string, value: object): Promise<void> => {
  await window.preload.fs.writeTextFile(path, JSON.stringify(value, null, 2))
}

export const getTaskDir = (id: string): string => window.preload.path.join(getAppData(), id)

export const getTaskPartsDir = (id: string): string => window.preload.path.join(getTaskDir(id), 'parts')

export const getTaskFilePath = (id: string): string => window.preload.path.join(getTaskDir(id), 'task.json')

export const getResourceFilePath = (id: string): string => window.preload.path.join(getTaskDir(id), 'resource.json')

export const getSegmentsFilePath = (id: string): string => window.preload.path.join(getTaskDir(id), 'segments.json')

export const getManifestFilePath = (id: string): string => window.preload.path.join(getTaskDir(id), 'index.m3u8')

export const getSegmentFilePath = (id: string, index: number): string => {
  return window.preload.path.join(getTaskPartsDir(id), `${String(index).padStart(6, '0')}.part`)
}

export class DownloadRecordStore {
  async ensureBaseDir(): Promise<void> {
    await window.preload.fs.ensureDir(getAppData())
  }

  async ensureTaskDir(id: string): Promise<void> {
    await this.ensureBaseDir()
    await window.preload.fs.ensureDir(getTaskDir(id))
    await window.preload.fs.ensureDir(getTaskPartsDir(id))
  }

  async readIndex(): Promise<DownloadRecordIndex> {
    await this.ensureBaseDir()
    const index = await readJson<DownloadRecordIndex>(getRecordPath())
    return index ?? { version: RECORD_VERSION, items: [] }
  }

  async writeIndex(index: DownloadRecordIndex): Promise<void> {
    await this.ensureBaseDir()
    await writeJson(getRecordPath(), index)
  }

  async upsertSummary(summary: DownloadRecordSummary): Promise<void> {
    const index = await this.readIndex()
    const idx = index.items.findIndex((item) => item.id === summary.id)
    if (idx >= 0) {
      index.items[idx] = summary
    } else {
      index.items.unshift(summary)
    }
    await this.writeIndex(index)
  }

  async removeTask(id: string): Promise<void> {
    const index = await this.readIndex()
    await this.writeIndex({ ...index, items: index.items.filter((item) => item.id !== id) })
    await window.preload.fs.removeDir(getTaskDir(id))
  }

  async readTask(id: string): Promise<DownloadTaskRecord | null> {
    const task = await readJson<DownloadTaskRecord>(getTaskFilePath(id))
    if (!task) return null
    const resource = await this.readResource(id)
    const segments = await this.readSegments(id)
    return { ...task, resource: resource ?? task.resource, segments: segments ?? task.segments }
  }

  async writeTask(task: DownloadTaskRecord): Promise<void> {
    await this.ensureTaskDir(task.id)
    await writeJson(getTaskFilePath(task.id), task)
    await writeJson(getResourceFilePath(task.id), task.resource)
    await writeJson(getSegmentsFilePath(task.id), task.segments)
    await this.upsertSummary(this.buildSummary(task))
  }

  async readResource(id: string): Promise<MediaResource | null> {
    return readJson<MediaResource>(getResourceFilePath(id))
  }

  async readSegments(id: string): Promise<SegmentRecord[] | null> {
    return readJson<SegmentRecord[]>(getSegmentsFilePath(id))
  }

  async writeSegments(task: DownloadTaskRecord): Promise<void> {
    await writeJson(getSegmentsFilePath(task.id), task.segments)
    await writeJson(getTaskFilePath(task.id), task)
    await this.upsertSummary(this.buildSummary(task))
  }

  async writeManifest(id: string, text: string): Promise<void> {
    await this.ensureTaskDir(id)
    await window.preload.fs.writeTextFile(getManifestFilePath(id), text)
  }

  buildSummary(task: DownloadTaskRecord): DownloadRecordSummary {
    const finished = task.segments.filter((segment) => segment.status === 'success').length
    const failed = task.segments.filter((segment) => segment.status === 'failed').length
    const total = task.segments.length
    return {
      id: task.id,
      name: task.base.name,
      url: task.base.url,
      taskType: task.base.taskType,
      status: task.base.status,
      progress: total > 0 ? Math.round((finished / total) * 100) : task.base.progress,
      total,
      finished,
      failed,
      folder: task.base.folder,
      targetPath: task.targetPath,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }
  }
}

export const downloadRecordStore = new DownloadRecordStore()
