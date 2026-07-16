import { createDownload } from '@/core'
import { downloadEngine } from '@/core/DownloadEngine'
import { downloadRecordStore, getManifestFilePath, getSegmentFilePath, getTaskPartsDir } from '@/core/DownloadRecordStore'
import { DownloadItem, DownloadTaskType } from '@/domain/DownloadItem'
import { DownloadTaskRecord, SegmentRecord } from '@/domain/DownloadRecord'
import { PostDownload } from '@/domain/PostDownload'
import { useSnowflake } from '@/hooks/Snowflake'

const inferTaskType = (url: string): DownloadTaskType => {
  const pathname = new URL(url).pathname.toLowerCase()
  if (pathname.endsWith('.m3u8')) return 'm3u8'
  return 'http'
}

const inferName = (url: string, name: string, index: number): string => {
  if (name) return index > 0 ? `${name}-${index + 1}` : name
  const pathname = new URL(url).pathname
  const lowerPathname = pathname.toLowerCase()
  if (lowerPathname.endsWith('.m3u8') || lowerPathname.endsWith('.mpd')) {
    return `download-${Date.now()}${index > 0 ? `-${index + 1}` : ''}.mp4`
  }
  const filename = pathname.split('/').filter(Boolean).pop()
  return filename || `download-${Date.now()}`
}

const buildHeaders = (config: PostDownload): Record<string, string> => ({
  'User-Agent': config.userAgent,
  Authorization: config.authorization,
  Referer: config.referer,
  Cookie: config.cookie
})

const getTargetPath = (folder: string, name: string): string => window.preload.path.join(folder, name)

const buildSegments = (taskId: string, resourceSegments: DownloadTaskRecord['resource']['segments']): SegmentRecord[] => {
  const now = new Date().toISOString()
  return resourceSegments.map((segment) => ({
    ...segment,
    status: 'pending',
    localPath: getSegmentFilePath(taskId, segment.index),
    loaded: 0,
    total: segment.size ?? segment.bytes ?? 0,
    error: '',
    updatedAt: now
  }))
}

class DownloadTaskService {
  private readonly stoppedTaskIds = new Set<string>()

  async createTasks(config: PostDownload): Promise<DownloadTaskRecord[]> {
    const urls = config.url
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean)
    const tasks: DownloadTaskRecord[] = []
    for (let index = 0; index < urls.length; index += 1) {
      tasks.push(await this.createTask({ ...config, url: urls[index] }, index))
    }
    return tasks
  }

  async createTask(config: PostDownload, index = 0): Promise<DownloadTaskRecord> {
    const id = useSnowflake().nextId()
    await downloadRecordStore.ensureTaskDir(id)
    const downloader = createDownload(config.url)
    const resource = await downloader.parse(config.url)
    const name = inferName(config.url, config.name, index)
    const now = new Date().toISOString()
    const taskType = inferTaskType(config.url)
    const targetPath = getTargetPath(config.folder, name)
    const segments = buildSegments(id, resource.segments)
    const base: DownloadItem = {
      id,
      created_at: now,
      taskType,
      name,
      url: config.url,
      path: targetPath,
      status: 'waiting',
      logs: [],
      progress: 0,
      total: segments.length,
      speed: 0,
      threads: config.threads,
      folder: config.folder,
      userAgent: config.userAgent,
      authorization: config.authorization,
      referer: config.referer,
      cookie: config.cookie,
      proxy: config.proxy,
      jump: false
    }
    const task: DownloadTaskRecord = {
      id,
      base,
      config,
      resource,
      segments,
      tempDir: getTaskPartsDir(id),
      partsDir: getTaskPartsDir(id),
      targetPath,
      rawManifestPath: getManifestFilePath(id),
      createdAt: now,
      updatedAt: now
    }
    await downloadRecordStore.writeTask(task)
    await this.saveManifest(task)
    void this.start(task.id)
    return task
  }

  async getTask(id: string): Promise<DownloadTaskRecord | null> {
    return downloadRecordStore.readTask(id)
  }

  async restoreInterruptedTasks(): Promise<void> {
    const index = await downloadRecordStore.readIndex()
    const activeStatuses: DownloadTaskRecord['base']['status'][] = ['downloading', 'batch_merging', 'final_merging']
    for (const item of index.items) {
      if (!activeStatuses.includes(item.status)) continue
      const task = await downloadRecordStore.readTask(item.id)
      if (!task) continue
      task.base.status = 'waiting'
      task.base.speed = 0
      task.segments.forEach((segment) => {
        if (segment.status === 'downloading') {
          segment.status = 'pending'
          segment.loaded = 0
          segment.error = ''
          segment.updatedAt = new Date().toISOString()
        }
      })
      task.updatedAt = new Date().toISOString()
      await downloadRecordStore.writeSegments(task)
    }
  }

  async start(id: string): Promise<void> {
    const task = await downloadRecordStore.readTask(id)
    if (!task || task.base.status === 'finished') return
    this.stoppedTaskIds.delete(id)
    task.base.status = 'downloading'
    await this.downloadSegments(task, task.segments.filter((segment) => segment.status !== 'success'))
    await this.finishOrFail(task, true)
  }

  async pause(id: string): Promise<void> {
    const task = await downloadRecordStore.readTask(id)
    if (!task || task.base.status !== 'downloading') return
    this.stoppedTaskIds.add(id)
    task.base.status = 'paused'
    task.base.speed = 0
    task.updatedAt = new Date().toISOString()
    await downloadRecordStore.writeSegments(task)
  }

  async cancel(id: string): Promise<void> {
    const task = await downloadRecordStore.readTask(id)
    if (!task || task.base.status === 'finished') return
    this.stoppedTaskIds.add(id)
    task.base.status = 'cancelled'
    task.base.speed = 0
    task.updatedAt = new Date().toISOString()
    await downloadRecordStore.writeSegments(task)
  }

  async remove(id: string): Promise<void> {
    this.stoppedTaskIds.add(id)
    await downloadRecordStore.removeTask(id)
  }

  async retryAll(id: string): Promise<void> {
    const task = await downloadRecordStore.readTask(id)
    if (!task || task.base.status === 'finished') return
    this.stoppedTaskIds.delete(id)
    task.base.status = 'downloading'
    await this.downloadSegments(task, task.segments.filter((segment) => segment.status === 'failed'))
    await this.finishOrFail(task, true)
  }

  async retrySegment(id: string, index: number): Promise<void> {
    const task = await downloadRecordStore.readTask(id)
    if (!task || task.base.status === 'finished') return
    const segment = task.segments.find((item) => item.index === index)
    if (!segment || segment.status === 'success') return
    this.stoppedTaskIds.delete(id)
    task.base.status = 'downloading'
    await this.downloadSegments(task, [segment])
    await this.finishOrFail(task, false)
  }

  async merge(id: string): Promise<void> {
    const task = await downloadRecordStore.readTask(id)
    if (!task || task.base.status === 'finished') return
    if (task.segments.some((segment) => segment.status !== 'success')) return
    task.base.status = 'final_merging'
    task.updatedAt = new Date().toISOString()
    await downloadRecordStore.writeSegments(task)
    await createDownload(task.base.url).merge(task.segments, task.targetPath)
    task.base.status = 'finished'
    task.base.progress = 100
    task.base.speed = 0
    task.updatedAt = new Date().toISOString()
    await downloadRecordStore.writeSegments(task)
  }

  async forceMerge(id: string): Promise<void> {
    const task = await downloadRecordStore.readTask(id)
    if (!task || task.base.status === 'finished') return
    if (task.resource.type !== 'hls' && task.resource.type !== 'dash') return
    if (task.segments.some((segment) => segment.status === 'pending' || segment.status === 'downloading')) return
    const successSegments = task.segments.filter((segment) => segment.status === 'success')
    if (successSegments.length === 0) return
    task.base.status = 'final_merging'
    task.updatedAt = new Date().toISOString()
    await downloadRecordStore.writeSegments(task)
    await createDownload(task.base.url).merge(successSegments, task.targetPath)
    task.base.status = 'finished'
    task.base.progress = Math.round((successSegments.length / task.segments.length) * 100)
    task.base.speed = 0
    task.updatedAt = new Date().toISOString()
    await downloadRecordStore.writeSegments(task)
  }

  private async downloadSegments(task: DownloadTaskRecord, segments: SegmentRecord[]): Promise<void> {
    await downloadEngine.download({
      segments,
      threads: task.config.threads,
      headers: buildHeaders(task.config),
      proxy: task.config.proxy,
      getLocalPath: (segment) => getSegmentFilePath(task.id, segment.index),
      shouldStop: () => this.stoppedTaskIds.has(task.id),
      onSpeedChange: async (speed) => {
        const latestTask = await downloadRecordStore.readTask(task.id)
        if (!latestTask) return
        latestTask.base.speed = speed
        latestTask.updatedAt = new Date().toISOString()
        await downloadRecordStore.writeSegments(latestTask)
      },
      onSegmentChange: async () => {
        const latestTask = await downloadRecordStore.readTask(task.id)
        if (!latestTask) return
        if (latestTask.base.status === 'paused' || latestTask.base.status === 'cancelled') {
          task.base.status = latestTask.base.status
        }
        task.updatedAt = new Date().toISOString()
        await downloadRecordStore.writeSegments(task)
      }
    })
  }

  private async finishOrFail(task: DownloadTaskRecord, autoMerge: boolean): Promise<void> {
    const latestTask = await downloadRecordStore.readTask(task.id)
    if (latestTask?.base.status === 'paused' || latestTask?.base.status === 'cancelled') return
    const currentTask = latestTask ?? task
    const failed = currentTask.segments.some((segment) => segment.status === 'failed')
    const finished = currentTask.segments.every((segment) => segment.status === 'success')
    if (finished && autoMerge) {
      await this.merge(currentTask.id)
      return
    }
    currentTask.base.status = failed ? 'failed' : 'downloading'
    currentTask.base.progress = currentTask.segments.length
      ? Math.round((currentTask.segments.filter((segment) => segment.status === 'success').length / currentTask.segments.length) * 100)
      : 0
    currentTask.updatedAt = new Date().toISOString()
    currentTask.base.speed = 0
    await downloadRecordStore.writeSegments(currentTask)
  }

  private async saveManifest(task: DownloadTaskRecord): Promise<void> {
    if (task.resource.type !== 'hls') return
    try {
      const response = await window.preload.axios.get<string>(task.config.url)
      await downloadRecordStore.writeManifest(task.id, response.data)
    } catch (error) {
      task.base.logs.push(error instanceof Error ? error.message : String(error))
    }
  }
}

export const downloadTaskService = new DownloadTaskService()
