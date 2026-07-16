import { MediaResource } from '@/core'
import {
  DownloadRecordIndex,
  DownloadRecordSummary,
  DownloadTaskRecord,
  SegmentRecord
} from '@/domain/DownloadRecord'
import { getAppData, getRecordPath } from '@/global/Constant'

const RECORD_VERSION = 1 as const
const FLUSH_DELAY = 300

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
  private readonly queues = new Map<string, Promise<void>>()
  private readonly pendingTasks = new Map<string, DownloadTaskRecord>()
  private readonly taskFlushTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pendingSummaries = new Map<string, DownloadRecordSummary>()
  private indexFlushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly removedTaskIds = new Set<string>()

  private enqueue<T>(key: string, command: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const current = previous.then(command, command)
    const tail = current.then(
      () => undefined,
      () => undefined
    )
    this.queues.set(key, tail)
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key)
    })
    return current
  }

  private getIndexQueueKey(): string {
    return `file:${getRecordPath()}`
  }

  private getTaskQueueKey(id: string): string {
    return `task:${id}`
  }

  async ensureBaseDir(): Promise<void> {
    await window.preload.fs.ensureDir(getAppData())
  }

  async ensureTaskDir(id: string): Promise<void> {
    await this.ensureBaseDir()
    await window.preload.fs.ensureDir(getTaskDir(id))
    await window.preload.fs.ensureDir(getTaskPartsDir(id))
  }

  async readIndex(): Promise<DownloadRecordIndex> {
    return this.enqueue(this.getIndexQueueKey(), () => this.readIndexNow())
  }

  private async readIndexNow(): Promise<DownloadRecordIndex> {
    await this.ensureBaseDir()
    const index = await readJson<DownloadRecordIndex>(getRecordPath())
    return index ?? { version: RECORD_VERSION, items: [] }
  }

  async writeIndex(index: DownloadRecordIndex): Promise<void> {
    await this.enqueue(this.getIndexQueueKey(), () => this.writeIndexNow(index))
  }

  private async writeIndexNow(index: DownloadRecordIndex): Promise<void> {
    await this.ensureBaseDir()
    await writeJson(getRecordPath(), index)
  }

  async upsertSummary(summary: DownloadRecordSummary): Promise<void> {
    this.pendingSummaries.delete(summary.id)
    if (this.pendingSummaries.size === 0 && this.indexFlushTimer) {
      clearTimeout(this.indexFlushTimer)
      this.indexFlushTimer = null
    }
    await this.enqueue(this.getIndexQueueKey(), () => this.upsertSummaryNow(summary))
  }

  private upsertSummarySoon(summary: DownloadRecordSummary): void {
    if (this.removedTaskIds.has(summary.id)) return
    this.pendingSummaries.set(summary.id, summary)
    if (this.indexFlushTimer) return
    this.indexFlushTimer = setTimeout(() => {
      this.indexFlushTimer = null
      void this.flushSummaries()
    }, FLUSH_DELAY)
  }

  private async flushSummaries(): Promise<void> {
    if (this.pendingSummaries.size === 0) return
    const summaries = [...this.pendingSummaries.values()]
    this.pendingSummaries.clear()
    await this.enqueue(this.getIndexQueueKey(), async () => {
      const index = await this.readIndexNow()
      summaries.forEach((summary) => this.applySummary(index, summary))
      await this.writeIndexNow(index)
    })
  }

  private async upsertSummaryNow(summary: DownloadRecordSummary): Promise<void> {
    const index = await this.readIndexNow()
    this.applySummary(index, summary)
    await this.writeIndexNow(index)
  }

  private applySummary(index: DownloadRecordIndex, summary: DownloadRecordSummary): void {
    const idx = index.items.findIndex((item) => item.id === summary.id)
    if (idx >= 0) {
      index.items[idx] = summary
    } else {
      index.items.unshift(summary)
    }
  }

  async removeTask(id: string): Promise<void> {
    this.removedTaskIds.add(id)
    this.clearPendingTask(id)
    this.pendingSummaries.delete(id)
    await this.enqueue(this.getTaskQueueKey(id), async () => undefined)
    await this.enqueue(this.getIndexQueueKey(), async () => {
      const index = await this.readIndexNow()
      await this.writeIndexNow({ ...index, items: index.items.filter((item) => item.id !== id) })
    })
    await window.preload.fs.removeDir(getTaskDir(id))
  }

  async readTask(id: string): Promise<DownloadTaskRecord | null> {
    const pendingTask = this.pendingTasks.get(id)
    if (pendingTask) return pendingTask
    return this.enqueue(this.getTaskQueueKey(id), () => this.readTaskNow(id))
  }

  private async readTaskNow(id: string): Promise<DownloadTaskRecord | null> {
    const task = await readJson<DownloadTaskRecord>(getTaskFilePath(id))
    if (!task) return null
    const resource = await this.readResourceNow(id)
    const segments = await this.readSegmentsNow(id)
    return { ...task, resource: resource ?? task.resource, segments: segments ?? task.segments }
  }

  async writeTask(task: DownloadTaskRecord): Promise<void> {
    this.removedTaskIds.delete(task.id)
    this.clearPendingTask(task.id)
    await this.writeTaskNow(task)
    await this.upsertSummary(this.buildSummary(task))
  }

  private async writeTaskNow(task: DownloadTaskRecord): Promise<void> {
    await this.enqueue(this.getTaskQueueKey(task.id), async () => {
      await this.ensureTaskDir(task.id)
      await writeJson(getTaskFilePath(task.id), task)
      await writeJson(getResourceFilePath(task.id), task.resource)
      await writeJson(getSegmentsFilePath(task.id), task.segments)
    })
  }

  private async writeTaskFilesNow(task: DownloadTaskRecord): Promise<void> {
    await this.ensureTaskDir(task.id)
    await writeJson(getTaskFilePath(task.id), task)
    await writeJson(getSegmentsFilePath(task.id), task.segments)
  }

  async readResource(id: string): Promise<MediaResource | null> {
    return this.enqueue(this.getTaskQueueKey(id), () => this.readResourceNow(id))
  }

  private async readResourceNow(id: string): Promise<MediaResource | null> {
    return readJson<MediaResource>(getResourceFilePath(id))
  }

  async readSegments(id: string): Promise<SegmentRecord[] | null> {
    const pendingTask = this.pendingTasks.get(id)
    if (pendingTask) return pendingTask.segments
    return this.enqueue(this.getTaskQueueKey(id), () => this.readSegmentsNow(id))
  }

  private async readSegmentsNow(id: string): Promise<SegmentRecord[] | null> {
    return readJson<SegmentRecord[]>(getSegmentsFilePath(id))
  }

  async writeSegments(task: DownloadTaskRecord): Promise<void> {
    if (this.removedTaskIds.has(task.id)) return
    this.clearPendingTask(task.id)
    await this.enqueue(this.getTaskQueueKey(task.id), () => this.writeTaskFilesNow(task))
    await this.upsertSummary(this.buildSummary(task))
  }

  writeSegmentsSoon(task: DownloadTaskRecord): void {
    if (this.removedTaskIds.has(task.id)) return
    this.pendingTasks.set(task.id, task)
    if (this.taskFlushTimers.has(task.id)) return
    const timer = setTimeout(() => {
      this.taskFlushTimers.delete(task.id)
      void this.flushTask(task.id)
    }, FLUSH_DELAY)
    this.taskFlushTimers.set(task.id, timer)
  }

  private async flushTask(id: string): Promise<void> {
    const task = this.pendingTasks.get(id)
    if (!task || this.removedTaskIds.has(id)) return
    this.pendingTasks.delete(id)
    await this.enqueue(this.getTaskQueueKey(id), () => this.writeTaskFilesNow(task))
    this.upsertSummarySoon(this.buildSummary(task))
  }

  private clearPendingTask(id: string): void {
    const timer = this.taskFlushTimers.get(id)
    if (timer) clearTimeout(timer)
    this.taskFlushTimers.delete(id)
    this.pendingTasks.delete(id)
  }

  async writeManifest(id: string, text: string): Promise<void> {
    if (this.removedTaskIds.has(id)) return
    await this.enqueue(this.getTaskQueueKey(id), async () => {
      await this.ensureTaskDir(id)
      await window.preload.fs.writeTextFile(getManifestFilePath(id), text)
    })
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
      speed: task.base.speed,
      folder: task.base.folder,
      targetPath: task.targetPath,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }
  }
}

export const downloadRecordStore = new DownloadRecordStore()
