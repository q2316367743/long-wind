import { Segment } from '@/core'
import { useLog } from '@/hooks/UseLog'
import { useSettingStore } from '@/store/components/SettingStore'

const log = useLog({ name: 'DownloadUtil' })

const FFMPEG_BATCH_SIZE = 500

export const resolveUrl = (value: string, base: string): string => {
  return new URL(value, base).href
}

export const sortSegments = (segments: Segment[]): Segment[] => {
  return [...segments].sort((a, b) => a.index - b.index)
}

export const ensureLocalPaths = (segments: Segment[]): Segment[] => {
  for (const segment of segments) {
    if (!segment.path) {
      throw new Error(`Segment ${segment.index} has no local path`)
    }
  }
  return segments
}

export const getLocalPaths = (segments: Segment[]): string[] => {
  return ensureLocalPaths(sortSegments(segments)).map((segment) => segment.path)
}

export const createTempFilePath = (suffix: string): string => {
  const tempDir = window.preload.inject.os.getPath('temp')
  const safeSuffix = suffix.startsWith('.') ? suffix : `.${suffix}`
  return `${tempDir}/long-wind-${Date.now()}-${Math.random().toString(16).slice(2)}${safeSuffix}`
}

const escapeConcatPath = (path: string): string => {
  return path.replace(/'/g, `'\\''`)
}

export const writeConcatList = async (paths: string[]): Promise<string> => {
  const listPath = createTempFilePath('.txt')
  const text = paths.map((path) => `file '${escapeConcatPath(path)}'`).join('\n')
  await window.preload.fs.writeTextFile(listPath, `${text}\n`)
  return listPath
}

export const runFfmpeg = async (args: string[]): Promise<void> => {
  const settingStore = useSettingStore()
  await settingStore.runFfmpeg(args)
}

export const mergeByFfmpegConcat = async (paths: string[], target: string): Promise<void> => {
  if (paths.length === 0) {
    throw new Error('No local segments to merge')
  }

  const listPath = await writeConcatList(paths)
  log.info('开始执行 ffmpeg concat 合并', { count: paths.length, target })
  await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', target])
}

export const mergeByFfmpegConcatInBatches = async (paths: string[], target: string): Promise<void> => {
  if (paths.length <= FFMPEG_BATCH_SIZE) {
    await mergeByFfmpegConcat(paths, target)
    return
  }

  log.info('分片数量较多，开始分批合并', { count: paths.length, batchSize: FFMPEG_BATCH_SIZE })
  const tempPaths: string[] = []
  for (let index = 0; index < paths.length; index += FFMPEG_BATCH_SIZE) {
    const batch = paths.slice(index, index + FFMPEG_BATCH_SIZE)
    const tempPath = createTempFilePath('.mp4')
    log.debug('合并中间批次', { batchIndex: tempPaths.length, count: batch.length, tempPath })
    await mergeByFfmpegConcat(batch, tempPath)
    tempPaths.push(tempPath)
  }

  log.info('开始合并中间文件', { count: tempPaths.length, target })
  await mergeByFfmpegConcat(tempPaths, target)
}

export const replaceTemplateTokens = (
  template: string,
  values: { representationId?: string; number?: number; bandwidth?: string; time?: number }
): string => {
  return template
    .replace(/\$RepresentationID\$/g, values.representationId ?? '')
    .replace(/\$Bandwidth\$/g, values.bandwidth ?? '')
    .replace(/\$Number(?:%0(\d+)d)?\$/g, (_matched: string, width: string | undefined) => {
      const value = String(values.number ?? 0)
      return width ? value.padStart(Number(width), '0') : value
    })
    .replace(/\$Time(?:%0(\d+)d)?\$/g, (_matched: string, width: string | undefined) => {
      const value = String(values.time ?? 0)
      return width ? value.padStart(Number(width), '0') : value
    })
}
